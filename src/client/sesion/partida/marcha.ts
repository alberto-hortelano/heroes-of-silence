/**
 * La marcha del héroe en el mapa (`MarchaEnElMapa`): la ruta que se previsualiza, mandarlo
 * andar (`move_hero`) y la marcha que el mapa enseña mientras anda (06-11-2026, «el
 * personaje se teletransporta…»): el núcleo ya lo ha movido, y lo que abre la llegada
 * —la batalla, la base, el lugar, la guarnición, la frase de la parada— espera a `acabar`,
 * que llama la página al llegar o con cualquier gesto. Lo que abre la llegada no es suyo:
 * lo hace la sesión (`alLlegar`). Mientras anda se pinta lo de antes de andar
 * (`sesion/vistas/marcha.ts`), y la niebla va con él. Era parte de `Session`
 * (`sesion/partida.ts`) hasta R6 de la reorganización (07-11-2026); la sesión delega en ella.
 */
import { Casillas } from '@core/map/casillas.js';
import type { PathStep } from '@core/map/map.js';
import { type AsaltantesALaVista, emboscadaEnLaRuta } from '@core/state/asaltantes.js';
import { heroById } from '@core/state/consultas.js';
import type { GameEvent } from '@core/state/events.js';
import { applyAdventureAction } from '@core/state/game.js';
import { barreraDeMañana, caminoHasta, pasosDeHoy } from '@core/state/marcha.js';
import { HERO_SCOUT_RADIUS, miradasDe } from '@core/state/vision.js';
import type { Hero, Point, VistaAsaltante } from '@core/types.js';
import { mensajeDe } from '../../comun/errores.js';
import { comoFrase } from '../batalla/control.js';
import { type NieblaDeAntes, type NieblaDeLaMarcha, nieblaDeLaMarcha } from '../vistas/marcha.js';
import type { LoConocido } from './a-la-vista.js';
import { type DueñoDeLasPiezas, sameTile } from './comun.js';

/**
 * Un paso de la ruta previsualizada: `hoy` si lo alcanza el movimiento del día;
 * `peligro` desde el paso en que un grupo a la vista emboscaría al héroe —ahí se
 * para la marcha—, y ese primer paso lleva además quién (`emboscada`).
 */
export interface RoutePreview extends PathStep {
  readonly hoy: boolean;
  readonly peligro: boolean;
  readonly emboscada?: VistaAsaltante;
  /** En el primer paso de otro día, si es una barrera: por qué hoy se para antes (`barreraDeMañana`). */
  readonly barrera?: string;
}

/**
 * La marcha que el mapa enseña (`Session.marchaEnCurso`): quién anda y por qué
 * casillas, de la de donde salió a la última que pisó (sus `hero_moved`).
 */
export interface MarchaEnPantalla {
  readonly heroe: string;
  readonly pasos: readonly Point[];
}

/** Lo que se veía al salir una marcha que se enseña: lo que se pinta mientras anda. */
interface LoDeAntesDeLaMarcha {
  readonly niebla: NieblaDeAntes;
  readonly conocido: LoConocido;
  readonly movimiento: number;
}

/** Lo que la pieza de la marcha lee de la sesión. */
interface DueñoDeLaMarcha
  extends Pick<
    DueñoDeLasPiezas,
    'estado' | 'ctx' | 'viewer' | 'tocar' | 'barra' | 'jugador' | 'heroeSeleccionado'
  > {
  /** Si es el turno de la persona (`Session.isPlayersTurn`): fuera de él no hay ruta que enseñar. */
  esTuTurno(): boolean;
  /** Los grupos que la persona ve (`ALaVista.asaltantes`): solo esos avisan en la ruta. */
  asaltantesALaVista(): AsaltantesALaVista;
  /** Lo que se sabe de los objetos ahora (`ALaVista.conocido`): se guarda una copia al salir. */
  conocido(): LoConocido;
  /** Si se pidió ver el mapa entero (`ALaVista.todo`): entonces la marcha no lleva niebla. */
  todoALaVista(): boolean;
  /** Mandarlo a andar es despertarlo (`Session.alternarSueño`, los héroes en espera). */
  despertar(heroId: string): void;
  /** Lo que abre la llegada de la marcha de `hero`: `ultimo`, el último hecho de su marcha. */
  alLlegar(hero: Hero, ultimo: GameEvent | undefined): void;
}

export class MarchaEnElMapa {
  /**
   * Si el mapa enseña al héroe andando su marcha (`enCurso`): lo pone la
   * página (`main.ts`). Sin ella —los tests, el espejo de `pnpm capturas`—, lo que
   * abre la llegada se abre en el acto, como antes.
   */
  enseñar = false;

  /** La marcha que se enseña ahora, con lo que espera a la llegada y lo de antes de andar. */
  private marcha: {
    readonly enPantalla: MarchaEnPantalla;
    readonly alLlegar: () => void;
    /** Lo que se veía al salir: lo que se pinta mientras anda (`sesion/vistas/marcha.ts`). */
    readonly antes: LoDeAntesDeLaMarcha;
    /** La niebla con el héroe en la casilla de su marcha que pisa ahora (`pisar`). */
    niebla: NieblaDeLaMarcha | null;
  } | null = null;

  constructor(private readonly dueño: DueñoDeLaMarcha) {}

  /** La marcha que se enseña ahora, o `null`. */
  get enCurso(): MarchaEnPantalla | null {
    return this.marcha?.enPantalla ?? null;
  }

  /**
   * La ruta ENTERA del héroe seleccionado hasta `to`, con cada paso marcado
   * según llegue hoy o no.
   *
   * Antes se cortaba en `movePoints` y la pantalla solo sabía pintar lo de hoy:
   * a quien señalaba un castillo a tres días no se le enseñaba por dónde iba a ir.
   * El clic sigue moviendo hasta donde llegue hoy (`andar`); lo de otro día
   * es solo para verlo, porque un destino de varios días pediría que el núcleo
   * lo recordara.
   */
  ruta(to: Point): RoutePreview[] {
    const hero = this.dueño.heroeSeleccionado();
    if (hero === null || !this.dueño.esTuTurno()) return [];
    const camino = caminoHasta(this.dueño.estado(), hero, to);
    if (camino === null) return [];
    // Con los grupos que la persona ve y no con todos: uno que no se ve no
    // avisa, o la ruta le contaría lo que tapa la niebla.
    const emboscada = emboscadaEnLaRuta(
      this.dueño.estado(),
      hero,
      camino,
      this.dueño.asaltantesALaVista(),
    );
    const hoy = pasosDeHoy(camino, hero);
    const barrera = barreraDeMañana(this.dueño.estado().map, camino, hoy);
    return camino.map((paso, i) => ({
      ...paso,
      hoy: i < hoy,
      peligro: emboscada !== null && i >= emboscada.paso,
      ...(emboscada !== null && i === emboscada.paso ? { emboscada: emboscada.raider } : {}),
      ...(barrera !== null && i === hoy ? { barrera } : {}),
    }));
  }

  /**
   * Manda al héroe `heroId` hacia `to`: el núcleo anda lo que dé el día. Si el mapa enseña
   * la marcha, lo que abre la llegada espera a `acabar`; si no, se abre en el acto.
   */
  andar(heroId: string, to: Point): void {
    const hero = heroById(this.dueño.estado(), heroId);
    // Pulsar donde ya está el héroe no es un destino sin camino: el camino es
    // vacío porque ya ha llegado. Decía «No hay camino hasta ahí», que es falso.
    if (sameTile(hero.at, to)) {
      this.dueño.barra(`${hero.name} ya está en esa casilla: pulsa otra para moverlo.`);
      return;
    }
    const desde = hero.at;
    const antes = this.dueño.estado().log.length;
    // Lo que se ve antes de andar, por si la marcha se enseña: es lo que se pinta
    // mientras anda (`sesion/vistas/marcha.ts`).
    const loDeAntes = this.enseñar ? this.loDeAntesDeLaMarcha(hero) : null;
    // Se manda el destino tal cual: el núcleo anda lo que dé el día y, si no
    // hay camino o no da ni un paso, lo dice él con su frase —quién cierra el
    // paso, si es alguien (M2 de la 2a)—; aquí solo se le pone la mayúscula.
    try {
      applyAdventureAction(
        this.dueño.estado(),
        { type: 'move_hero', hero: heroId, to },
        this.dueño.ctx(),
        this.dueño.viewer(),
      );
      this.dueño.barra('');
    } catch (err) {
      this.dueño.barra(comoFrase(mensajeDe(err)));
      return;
    }
    // Mandarlo a andar es despertarlo: si no, se queda fuera de «Siguiente
    // héroe» después de haberlo usado, y es lo que hace el original.
    this.dueño.despertar(heroId);
    this.dueño.tocar();

    // La parada (#130) se lee ahora: `applyAdventureAction` no devuelve nada, y el
    // hecho es el último de la crónica porque la parada vuelve justo después de
    // escribirlo.
    const ultimo = this.dueño.estado().log.at(-1);
    const alLlegar = (): void => this.dueño.alLlegar(hero, ultimo);
    // Lo que anduvo, casilla a casilla: un `hero_moved` por paso, también si la
    // marcha se cortó, se paró o la emboscaron por el camino.
    const pasos = [desde];
    for (const e of this.dueño.estado().log.slice(antes))
      if (e.kind === 'hero_moved' && e.hero === heroId) pasos.push(e.to);
    if (loDeAntes !== null && pasos.length > 1) {
      this.marcha = {
        enPantalla: { heroe: heroId, pasos },
        alLlegar,
        antes: loDeAntes,
        niebla: null,
      };
      return;
    }
    alLlegar();
  }

  /**
   * El mapa enseña al héroe que anda en la casilla `pisada` de su marcha (el índice
   * en `MarchaEnPantalla.pasos`): la niebla que se pinta va con él
   * (`nieblaDeLaMarcha`). Lo llama la escena del mapa a cada fotograma; sin marcha,
   * nada.
   */
  pisar(pisada: number): void {
    const m = this.marcha;
    if (m === null || m.niebla?.pisada === pisada) return;
    m.niebla = nieblaDeLaMarcha(
      this.dueño.estado().map,
      m.antes.niebla,
      m.enPantalla.pasos,
      pisada,
      m.niebla,
    );
  }

  /** La niebla de la marcha que se enseña, o `null` (sin marcha, o viéndolo todo). */
  niebla(): NieblaDeLaMarcha | null {
    const m = this.marcha;
    if (m === null || this.dueño.todoALaVista()) return null;
    if (m.niebla === null)
      m.niebla = nieblaDeLaMarcha(
        this.dueño.estado().map,
        m.antes.niebla,
        m.enPantalla.pasos,
        0,
        null,
      );
    return m.niebla;
  }

  /**
   * Lo que la marcha que se enseña cambia de lo que se ve (`ALaVista`): quién anda, en
   * qué casilla de su marcha va (la que pisa; antes de pisar ninguna, la de salida) y lo
   * que se sabía de los objetos al salir; `null` sin marcha.
   */
  queSeVe(): {
    readonly heroe: string;
    readonly pisa: Point;
    readonly conocidoAlSalir: LoConocido;
  } | null {
    const m = this.marcha;
    return m === null
      ? null
      : {
          heroe: m.enPantalla.heroe,
          pisa: m.enPantalla.pasos[m.niebla?.pisada ?? 0] as Point,
          conocidoAlSalir: m.antes.conocido,
        };
  }

  /**
   * Los puntos de movimiento que enseña el panel de `hero`: mientras anda su marcha,
   * los de antes de andar (lo que se pinta es lo de antes hasta que llega).
   */
  movimientoALaVista(hero: Hero): number {
    const m = this.marcha;
    return m !== null && m.enPantalla.heroe === hero.id ? m.antes.movimiento : hero.movePoints;
  }

  /** La marcha llega (o se salta): abre lo que esperaba a la llegada. Sin marcha, nada. */
  acabar(): void {
    const m = this.marcha;
    if (m === null) return;
    this.marcha = null;
    m.alLlegar();
    this.dueño.tocar();
  }

  /**
   * Lo que se ve justo antes de que `hero` ande (una copia: el núcleo lo cambia al
   * moverlo): lo explorado y desde dónde se mira sin él, los objetos como se saben
   * y sus puntos de movimiento.
   */
  private loDeAntesDeLaMarcha(hero: Hero): LoDeAntesDeLaMarcha {
    const miradas = miradasDe(this.dueño.estado(), this.dueño.viewer());
    const suya = miradas.findIndex(
      (m) => m.radio === HERO_SCOUT_RADIUS && m.centro.x === hero.at.x && m.centro.y === hero.at.y,
    );
    if (suya >= 0) miradas.splice(suya, 1);
    return {
      niebla: {
        explorado: Casillas.deIndices(this.dueño.estado().map, this.dueño.jugador().fog.indices()),
        miradas: miradas.map((m) => ({ centro: { ...m.centro }, radio: m.radio })),
        radio: HERO_SCOUT_RADIUS,
      },
      conocido: structuredClone(this.dueño.conocido()),
      movimiento: hero.movePoints,
    };
  }
}
