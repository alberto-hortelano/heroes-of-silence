/**
 * La tropa del héroe en escena (`TropaEnPantalla`): a quién de su tropa se mira, lo que se
 * ve (`sesion/vistas/tropa.ts`) y su formación, que es la misma pieza que el despliegue de
 * una batalla (`DespliegueEnPantalla`) sobre la batalla de la formación
 * (`batallaDeLaFormacion`); y ponerle o quitarle equipo al elegido. Abrir y cerrar mueven
 * la escena y la barra de la sesión. Era parte de `Session` (`sesion/partida.ts`) hasta R6
 * de la reorganización (07-11-2026); la sesión delega en ella.
 */
import { stackById } from '@core/battle/consultas.js';
import type { BattleState } from '@core/battle/types.js';
import { pieza } from '@core/equipo/pieza.js';
import { type Portador, pedidoDelPuesto } from '@core/equipo/portador.js';
import { troopUnit } from '@core/hero/troop.js';
import { batallaDeLaFormacion, portadorDelStack, stackDelPortador } from '@core/state/batallas.js';
import { applyAdventureAction } from '@core/state/game.js';
import { esHueco, type Hero, HUECOS, type Hueco, huecoDesconocido } from '@core/types.js';
import { AYUDA_DE_LA_TROPA } from '../../comun/dichos.js';
import { DespliegueEnPantalla } from '../batalla/despliegue.js';
import { componerVistaDeLaTropa, mismoPortador, type VistaDeLaTropa } from '../vistas/tropa.js';
import type { DueñoDeLasPiezas } from './comun.js';

/** Lo que la pieza de la tropa lee de la sesión. */
type DueñoDeLaTropa = Pick<
  DueñoDeLasPiezas,
  | 'estado'
  | 'ctx'
  | 'viewer'
  | 'version'
  | 'tocar'
  | 'barra'
  | 'escena'
  | 'irA'
  | 'run'
  | 'bloqueoDeTurno'
  | 'heroeSeleccionado'
>;

export class TropaEnPantalla {
  private elegidoAhora: Portador = { heroe: true };
  private formacionGuardada: {
    readonly version: number;
    readonly heroId: string;
    readonly batalla: BattleState;
  } | null = null;
  private cache: {
    batalla: BattleState;
    bloqueo: string | null;
    elegido: Portador;
    vista: VistaDeLaTropa;
  } | null = null;
  private ultima: { jugada: string; quien: Portador; version: number } | null = null;

  /**
   * La formación del héroe en la escena de la tropa: la misma pieza que el
   * despliegue de una batalla (`DespliegueEnPantalla`), sobre la batalla de la
   * formación (`batallaDeLaFormacion`). El elegido es el de la ficha
   * (`elegido`), colocar juega `formar` por `run` y antes mira el turno
   * (`bloqueoDeTurno`); no se cierra. Fuera de la escena, sin batalla.
   */
  readonly formacion: DespliegueEnPantalla = new DespliegueEnPantalla({
    batalla: () => this.batalla(),
    barra: (texto) => {
      this.dueño.barra(texto);
    },
    bloqueo: () => this.dueño.bloqueoDeTurno(),
    colocar: (stack, at) =>
      this.dueño.run(() =>
        applyAdventureAction(
          this.dueño.estado(),
          {
            type: 'formar',
            hero: this.heroe().id,
            quien: portadorDelStack(stack),
            at,
          },
          this.dueño.ctx(),
          this.dueño.viewer(),
        ),
      ),
    alCambiar: () => this.dueño.tocar(),
    elegido: {
      leer: (b) => stackDelPortador(b, this.elegido).id,
      poner: (id) => {
        const b = this.batalla();
        if (b === null) throw new Error('la formación solo se toca en la escena de la tropa');
        this.elegir(portadorDelStack(stackById(b, id)));
      },
    },
    dichoAlElegir: (nombre) =>
      `${nombre}: su ficha está en el panel; pulsa la casilla verde donde sale.`,
  });

  constructor(private readonly dueño: DueñoDeLaTropa) {}

  /**
   * Por qué no se puede abrir ahora la escena de la tropa, o `null`: hace falta un
   * héroe propio elegido y que sea tu turno (el motivo del turno, del núcleo). Lo
   * leen el botón «Tropa» (apagado con él) y la tecla T (a la barra).
   */
  blocker(): string | null {
    const hero = this.dueño.heroeSeleccionado();
    if (hero === null || hero.owner !== this.dueño.viewer()) {
      return 'Elige antes a uno de tus héroes para ver su tropa.';
    }
    return this.dueño.bloqueoDeTurno();
  }

  /**
   * Abre la escena de la tropa del héroe elegido, con él elegido. No guarda otro
   * héroe: la tropa es la del héroe elegido de la sesión, que volver al mapa no toca.
   */
  abrir(): void {
    const motivo = this.blocker();
    if (motivo !== null) throw new Error(`no se puede abrir la tropa: ${motivo}`);
    this.elegidoAhora = { heroe: true };
    this.dueño.irA('tropa');
    this.dueño.barra(AYUDA_DE_LA_TROPA);
  }

  /** Vuelve al mapa con el mismo héroe elegido. */
  cerrar(): void {
    this.dueño.irA('adventure');
    this.dueño.barra('');
  }

  /**
   * A quién se mira en la escena de la tropa. Se valida al leer, como
   * la pieza elegida del equipo: el elegido puede dejar de estar (no hoy, pero un
   * licenciar o una batalla que se lo lleve no tendrían que acordarse de soltarlo) y
   * entonces vuelve a ser el héroe.
   */
  get elegido(): Portador {
    const q = this.elegidoAhora;
    if ('heroe' in q) return q;
    return this.dueño.heroeSeleccionado()?.army[q.indice] === undefined ? { heroe: true } : q;
  }

  /** Elegir a alguien de la tropa (un clic en su figura o en su botón del panel). */
  elegir(q: Portador): void {
    const hero = this.heroe();
    if (!('heroe' in q) && hero.army[q.indice] === undefined) {
      throw new Error(`${hero.name} no lleva a nadie en el puesto ${q.indice} de su tropa`);
    }
    this.elegidoAhora = q;
    this.dueño.tocar();
  }

  /**
   * Lo que se ve en la escena de la tropa (`sesion/vistas/tropa.ts`), o `null` fuera de
   * ella. Se rehace cuando cambia algo que se ve (`version`) o el turno, no en
   * cada fotograma.
   */
  vista(): VistaDeLaTropa | null {
    const batalla = this.batalla();
    if (batalla === null) return null;
    const hero = this.heroe();
    const elegido = this.elegido;
    const bloqueo = this.dueño.bloqueoDeTurno();
    const c = this.cache;
    if (
      c !== null &&
      c.batalla === batalla &&
      c.bloqueo === bloqueo &&
      mismoPortador(c.elegido, elegido)
    ) {
      return c.vista;
    }
    const vista = componerVistaDeLaTropa(
      this.dueño.estado(),
      this.dueño.viewer(),
      hero,
      elegido,
      bloqueo,
      batalla,
    );
    this.cache = { batalla, bloqueo, elegido, vista };
    return vista;
  }

  /**
   * Ponerle `item` de la mochila del héroe al elegido de la tropa, por `equip`. Se
   * le nombra por su puesto (`pedidoDelPuesto`): en la escena cada uno tiene su
   * sitio, y por su tipo la pieza iba al primer novato igual, en el otro extremo
   * del arco (QA, H2). El motivo de un rechazo, el del núcleo, en la barra.
   */
  poner(item: string, enHueco?: string): void {
    const hero = this.heroe();
    const quien = this.elegido;
    const clave = `poner|${item}|${enHueco ?? ''}`;
    if (this.repiteLaJugada(clave, quien)) return;
    let dicho = '';
    const bien = this.dueño.run(() => {
      // El hueco llega del marcado como texto (`data-hueco`): la sesión lo comprueba,
      // como el de `unequip`.
      if (enHueco !== undefined && !esHueco(enHueco)) {
        throw new Error(huecoDesconocido(enHueco, HUECOS));
      }
      const hueco = enHueco as Hueco | undefined;
      applyAdventureAction(
        this.dueño.estado(),
        {
          type: 'equip',
          hero: hero.id,
          item,
          ...pedidoDelPuesto(quien),
          ...(hueco === undefined ? {} : { hueco }),
        },
        this.dueño.ctx(),
        this.dueño.viewer(),
      );
      const unidad = 'heroe' in quien ? hero.name : troopUnit(hero.army[quien.indice]!).name;
      dicho = `${unidad} lleva ahora ${pieza(item).nombre}.`;
    });
    if (bien) this.recordarLaJugada(clave, quien, dicho);
  }

  /** Quitarle al elegido de la tropa lo suyo del hueco `slot`, a la mochila del héroe, por `unequip`. */
  quitar(slot: string): void {
    const hero = this.heroe();
    const quien = this.elegido;
    if (this.repiteLaJugada(`quitar|${slot}`, quien)) return;
    let dicho = '';
    const bien = this.dueño.run(() => {
      if (!esHueco(slot)) throw new Error(huecoDesconocido(slot, HUECOS));
      // Por su puesto también: a un novato, que no lleva nada suyo, el núcleo le
      // dice que no hay nada que quitar (`nadaEnElHueco`).
      const antes = hero.mochila.length;
      applyAdventureAction(
        this.dueño.estado(),
        { type: 'unequip', hero: hero.id, slot, ...pedidoDelPuesto(quien) },
        this.dueño.ctx(),
        this.dueño.viewer(),
      );
      const vuelta = hero.mochila[antes];
      if (vuelta !== undefined)
        dicho = `${pieza(vuelta).nombre} vuelve a la mochila de ${hero.name}.`;
    });
    if (bien) this.recordarLaJugada(`quitar|${slot}`, quien, dicho);
  }

  /** El héroe de la escena de la tropa: el elegido, que es propio (`abrir` lo exige). */
  private heroe(): Hero {
    const hero = this.dueño.heroeSeleccionado();
    if (hero === null || hero.owner !== this.dueño.viewer()) {
      throw new Error('la escena de la tropa no tiene héroe: elige antes a uno de los tuyos');
    }
    return hero;
  }

  /**
   * La batalla de la formación del héroe de la tropa (`batallaDeLaFormacion`), o
   * `null` fuera de la escena: la que pintan el lienzo y la vista y en la que
   * coloca `formacion`. Una por versión y héroe, no por elegido: elegir a otro no
   * cambia dónde sale nadie.
   */
  private batalla(): BattleState | null {
    if (this.dueño.escena() !== 'tropa') return null;
    const hero = this.heroe();
    const c = this.formacionGuardada;
    if (c !== null && c.version === this.dueño.version() && c.heroId === hero.id) return c.batalla;
    const batalla = batallaDeLaFormacion(this.dueño.estado(), hero.id);
    this.formacionGuardada = { version: this.dueño.version(), heroId: hero.id, batalla };
    return batalla;
  }

  /**
   * Si `jugada` sobre `quien` es la que acaba de salir bien sin que nada haya
   * cambiado desde entonces (la misma `version`): el segundo clic de un doble clic,
   * que llega al botón de antes de repintar (QA, H6). Repetida así, o falla —ya no
   * está en la mochila, ya no hay nada en el hueco— o no cambia nada, así que se
   * ignora sin decir nada y la barra sigue con lo que dijo la primera. El núcleo
   * no se toca: lo que sí le llega sigue fallando con su motivo.
   */
  private repiteLaJugada(jugada: string, quien: Portador): boolean {
    const u = this.ultima;
    return (
      u !== null &&
      u.jugada === jugada &&
      u.version === this.dueño.version() &&
      mismoPortador(u.quien, quien)
    );
  }

  private recordarLaJugada(jugada: string, quien: Portador, dicho: string): void {
    this.dueño.barra(dicho);
    this.ultima = { jugada, quien, version: this.dueño.version() };
  }
}
