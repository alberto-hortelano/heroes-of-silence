/**
 * La muralla de la batalla tal como la juega la persona (`MurallaDeLaActiva`): los
 * botones de la escala y de la puerta de la activa y el muro o la puerta que espera
 * el clic, la misma pieza en la partida y la arena. Solo ella apunta la muralla (lo
 * vigila `invariantes-batalla.test.ts`); los botones que la pintan, en
 * `batalla/poderes.ts`. Era parte de `sesion/partida.ts` hasta la fase C de la
 * reorganización (07-11-2026).
 */
import {
  escalaBlocker,
  esTipoDeEscala,
  esTipoDePuerta,
  puertasBlocker,
} from '@core/battle/asalto.js';
import type { JugadaDeMuralla, TipoDeEscala, TipoDePuerta } from '@core/battle/types.js';
import { type LoApuntado, type QuienJuega, unaOElegir } from './apuntado.js';
import { motivoDeLaActiva } from './control.js';

/** Lo que dice la barra de cada familia de jugadas de la muralla (`MurallaDeLaActiva.elegir`). */
const FRASES_DE_LA_MURALLA = {
  escala: {
    ninguna: 'No hay muro contra el que hacerlo.',
    pide: 'Elige el muro: pulsa en lo alto de una de las columnas marcadas, o Escape para cancelar.',
  },
  puerta: {
    ninguna: 'No hay puerta que abrir o cerrar.',
    pide: 'Elige la puerta: pulsa en una de las portadas marcadas, o Escape para cancelar.',
  },
} as const;

/**
 * La muralla de la batalla tal como la juega la persona: los botones de la escala
 * («Poner escalera», «Subir») y de la puerta («Abrir puerta», «Cerrar puerta») de
 * la unidad activa, el que espera el clic en el tablero cuando hay más de un muro o
 * una puerta, y sus motivos, que escribe el núcleo (`escalaBlocker`,
 * `puertasBlocker`). **Una pieza para las dos sesiones** (fase 2 del puesto
 * fronterizo, 04-11-2026): hasta entonces solo la arena tenía muralla; desde que la
 * ciudad y el pueblo la llevan, la partida la juega igual, al atacar y al defender.
 *
 * Lo que espera el clic es **uno** con lo apuntado (`LoApuntado`, simplify de la fase
 * 2): elegir un muro suelta el hechizo o el poder y al revés, y Escape, cualquier
 * jugada y cerrar la batalla lo sueltan; **como lo apuntado, mientras espera el clic
 * no anda ni golpea** (QF2-1: con «Poner escalera» esperando, un clic en una casilla
 * de andar movía y le quitaba la escalera de ese turno). `muroPorElegir` y
 * `puertaPorElegir` son de solo lectura (se derivan de lo que espera; lo vigila
 * `test/invariantes.test.ts`).
 */
export class MurallaDeLaActiva {
  constructor(
    private readonly dueño: QuienJuega,
    private readonly apuntados: LoApuntado,
  ) {}

  /** La jugada cuyo muro o puerta elige el siguiente clic, o `null`. */
  get porElegir(): JugadaDeMuralla | null {
    return this.apuntados.muralla;
  }

  /** Si el siguiente clic en una columna elige el muro de «Poner escalera» o de «Subir». */
  get muroPorElegir(): TipoDeEscala | null {
    const j = this.porElegir;
    return j !== null && esTipoDeEscala(j) ? j : null;
  }

  /** Si el siguiente clic en una portada elige la puerta de «Abrir puerta» o de «Cerrar puerta». */
  get puertaPorElegir(): TipoDePuerta | null {
    const j = this.porElegir;
    return j !== null && esTipoDePuerta(j) ? j : null;
  }

  /**
   * Deja de esperar el clic en un muro o una puerta: tras la jugada que lo
   * resuelve (la escena del tablero) o cuando ya no queda muro o puerta que
   * elegir. Mientras espera, un clic en otro sitio del tablero no anda ni golpea
   * (`EscenaBatalla.esperaElClic`, QF2-1): solo Escape, el botón o una jugada lo
   * sueltan.
   */
  soltar(): void {
    this.apuntados.soltar('muralla');
  }

  /**
   * Por qué la unidad activa —tuya— no puede `tipo` contra ningún muro de su pie
   * o ninguna puerta (`escalaBlocker`, `puertasBlocker`), como frase; `null` si
   * puede. Lo pinta el botón deshabilitado.
   */
  motivo(tipo: JugadaDeMuralla): string | null {
    return motivoDeLaActiva(this.dueño.turnoPropio, (b) =>
      esTipoDeEscala(tipo) ? escalaBlocker(b, tipo) : puertasBlocker(b, tipo),
    );
  }

  /**
   * El botón de `tipo`: con un muro o una puerta posibles, ya; con varios, el clic
   * en el tablero elige (y otra pulsación lo cancela); sin ninguno, el motivo.
   */
  elegir(tipo: JugadaDeMuralla): void {
    const frases = FRASES_DE_LA_MURALLA[esTipoDeEscala(tipo) ? 'escala' : 'puerta'];
    unaOElegir(
      this.dueño,
      this.dueño.battleLegalActions().filter((a) => a.type === tipo),
      {
        esperando: this.porElegir === tipo,
        esperar: (si) => {
          if (si) this.apuntados.apuntar({ kind: 'muralla', id: tipo });
          else this.soltar();
        },
        motivo: () => this.motivo(tipo),
        ...frases,
      },
    );
  }
}
