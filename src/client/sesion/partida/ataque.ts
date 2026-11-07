/**
 * Un ataque a la persona en pantalla (`AtaqueALaPersona`): el aviso en el mapa antes de su
 * batalla —quién ataca, a quién y dónde, con «Defender» y «Resolver sola»—, el de la
 * batalla en que la ataca el rival en su turno (#116) y el de la emboscada de un grupo en
 * el suyo; y la defensa que espera, en el turno del rival, a que la persona cierre su
 * batalla. Lo que se abre al defender (la elección de con quién) es de la pieza de la
 * defensa, y pasar el turno y cerrar la batalla, de la sesión: los pide por su dueño. Era
 * parte de `Session` (`sesion/partida.ts`) hasta R6 de la reorganización (07-11-2026); la
 * sesión delega en ella.
 */
import type { Side } from '@core/battle/types.js';
import { type Ataque, elAtaque } from '@core/state/batallas.js';
import { NOMBRE_DE_FACCION, type Point } from '@core/types.js';
import type { DueñoDeLasPiezas } from './comun.js';

/** El aviso de un ataque a la persona (`Session.avisoDelAtaque`), dicho. */
export interface VistaDelAviso {
  /** «¡Te atacan en Valdeluz!», «¡Te atacan!», «¡Emboscada!». */
  readonly titulo: string;
  /** Quién ataca a quién y dónde: «Grishnak (Orkos) ataca a Aldric en Valdeluz.». */
  readonly frase: string;
  /** La casilla donde se pelea: a donde mira la cámara. */
  readonly at: Point;
}

/** Lo que la pieza del ataque lee de la sesión. */
interface DueñoDelAtaque extends Pick<DueñoDeLasPiezas, 'estado' | 'barra' | 'irA'> {
  /** El bando de la persona en la batalla pendiente (`Session.miBando`), o `null`. */
  miBando(): Side | null;
  /** Abre la batalla en que atacan a la persona (`DefensaEnPantalla.abrir`). */
  abrirLaDefensa(): void;
  /** Algo que se ve cambió sin un gesto de la persona (`Session.alCambiarSinGesto`). */
  alCambiarSinGesto(): void;
  /** «Resolver sola»: la IA pelea por la persona (`Session.autoResolveBattle`). */
  resolverSola(): void;
}

export class AtaqueALaPersona {
  /** El aviso del ataque en pantalla, o `null`. */
  private avisoEnPantalla: { readonly ataque: Ataque; readonly alDefender: () => void } | null =
    null;
  /** Quien cierra la defensa en curso y deja seguir el turno del rival, o `null`. */
  private alCerrarLaDefensa: (() => void) | null = null;

  constructor(private readonly dueño: DueñoDelAtaque) {}

  /**
   * La persona juega las batallas en las que la atacan (#116), rueda incluida: el
   * turno del rival se para en la batalla que acaba de nacer, la escena pasa a ella
   * y se espera a que la persona la cierre («Continuar» o «Resolver sola», que
   * pasan por `trasLaBatalla`). Es el `BattleTakeover` de `playAiTurn`, el mismo
   * contrato que el del agente: si te la quedas, la cierras. Una batalla que no va
   * con la persona no se toca: la cierra la IA.
   */
  async defender(): Promise<void> {
    if (this.dueño.miBando() === null) return;
    const cerrada = new Promise<void>((resolve) => {
      this.alCerrarLaDefensa = resolve;
    });
    // Antes de la batalla, el aviso en el mapa: quién ataca, a quién y dónde, con
    // la cámara en el sitio (arreglo 3 del 06-11-2026: saltaba a la pelea sin
    // saber dónde). «Defender» la abre (`DefensaEnPantalla.abrir`).
    if (!this.avisar(() => this.dueño.abrirLaDefensa())) this.dueño.abrirLaDefensa();
    // Lo que juega el rival llega sin un gesto de la persona: quien pinta no sabría
    // que hay algo que enseñar.
    this.dueño.alCambiarSinGesto();
    await cerrada;
  }

  /**
   * Pone en pantalla el aviso del ataque de la batalla pendiente, en el mapa, y
   * guarda qué hacer al pulsar «Defender». `false` si no hay nada que avisar (lo
   * atacado no se defiende: `elAtaque`), y quien llama entra directamente. Lo usan la
   * defensa en el turno del rival y la emboscada de un grupo en el de la persona.
   */
  avisar(alDefender: () => void): boolean {
    const pending = this.dueño.estado().pendingBattle;
    const ataque = pending === null ? null : elAtaque(this.dueño.estado(), pending);
    if (ataque === null) return false;
    this.avisoEnPantalla = { ataque, alDefender };
    this.dueño.irA('adventure');
    this.dueño.barra(this.vistaDelAviso(ataque).titulo);
    return true;
  }

  /**
   * El aviso de un ataque a la persona, antes de su batalla: en el turno del
   * rival (#116) y en la emboscada de un grupo en el suyo. Lo pinta
   * `partida/aviso.ts` en `<dialog id="aviso">`, con «Defender» y «Resolver sola»,
   * y la cámara del mapa mira a `at` (`focoDe`).
   */
  get aviso(): VistaDelAviso | null {
    const a = this.avisoEnPantalla;
    return a === null ? null : this.vistaDelAviso(a.ataque);
  }

  /** «Defender» en el aviso: se cierra y se abre la batalla. */
  defenderElAtaque(): void {
    const a = this.avisoEnPantalla;
    if (a === null) return;
    this.avisoEnPantalla = null;
    a.alDefender();
  }

  /** «Resolver sola» en el aviso: la IA pelea por la persona, sin abrir la batalla. */
  resolverElAtaqueSola(): void {
    if (this.avisoEnPantalla === null) return;
    this.avisoEnPantalla = null;
    this.dueño.resolverSola();
  }

  /**
   * La batalla se cerró: su aviso sobra, si se cerró sin pasar por «Defender» (resuelta
   * sola directamente), y si era una defensa (#116), el turno del rival sigue desde aquí.
   */
  trasLaBatalla(): void {
    this.avisoEnPantalla = null;
    const defensa = this.alCerrarLaDefensa;
    this.alCerrarLaDefensa = null;
    defensa?.();
  }

  private vistaDelAviso(a: Ataque): VistaDelAviso {
    const emboscada = a.quien.kind === 'asaltantes';
    const quien =
      a.quien.kind === 'heroe'
        ? `${a.quien.nombre} (${NOMBRE_DE_FACCION[a.quien.faccion]})`
        : `Un grupo de ${a.quien.individuos} asaltantes`;
    // Dónde, por un nombre y no por la casilla (06-11-2026: «en (11,5)» no se leía
    // como un lugar; la cámara ya enseña cuál): el sitio y, en campo abierto, su
    // región (`Ataque.region`); sin ninguna, nada.
    const aQuien =
      a.aQuien.kind === 'heroe'
        ? a.aQuien.nombre
        : a.sitio === null
          ? 'la guarnición'
          : `la guarnición ${a.sitio.delSitio}`;
    const donde =
      a.aQuien.kind === 'guarnicion'
        ? ''
        : a.sitio !== null
          ? ` en ${a.sitio.nombre}`
          : a.region === null
            ? ''
            : ` ${a.region.dentro ? 'en' : 'junto a'} ${a.region.nombre}`;
    return {
      titulo: emboscada
        ? '¡Emboscada!'
        : a.sitio === null
          ? '¡Te atacan!'
          : `¡Te atacan en ${a.sitio.nombre}!`,
      frase: `${quien} ${emboscada ? 'embosca' : 'ataca'} a ${aQuien}${donde}.`,
      at: a.at,
    };
  }
}
