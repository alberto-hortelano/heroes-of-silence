/**
 * La sesión de la arena (`/arena/`, `SesionDeArena`): la batalla de un montaje sin
 * partida alrededor, con las reglas del juego y la misma pelea en pantalla que la
 * partida (`SesionDeBatalla`, `sesion/batalla/`). Es de la puerta del cliente al núcleo
 * (`sesion/`), y la única de ella que monta y retoca con el montador de la arena
 * (`core/arena/`: lo vigila `invariantes-batalla.test.ts`). Era parte de
 * `sesion/partida.ts` hasta la fase C de la reorganización (07-11-2026), y desde R1
 * lleva solo lo suyo: el montaje, quién mueve cada bando, «Luchar» y el retoque.
 */
import { LADOS } from '@core/arena/lados.js';
import {
  batallaDeArena,
  type CatalogoDeLaArena,
  catalogoDelMontaje,
  type LadoDeArena,
} from '@core/arena/montaje.js';
import {
  catalogoTrasElRetoque,
  type RetoqueDeArena,
  retocarEnBatalla,
} from '@core/arena/retoque.js';
import { activeStack, stackById } from '@core/battle/consultas.js';
import { SIN_MURALLA } from '@core/battle/muralla.js';
import type { BattleStack, BattleState, MurallaDeBatalla, Side } from '@core/battle/types.js';
import type { ReglasDelCombate } from '@core/combate.js';
import type { CatalogoDeEquipo } from '@core/equipo/atado.js';
import type { CatalogoDeHechizos } from '@core/magia/catalogo.js';
import { createRng, type Rng } from '@core/rng.js';
import { type ClimaDelSitio, DESPEJADO } from '@core/state/clima.js';
import type { UnitInfo } from '@core/types.js';
import { cuerpoDe } from '@core/unidad/catalogo.js';
import { AYUDA_DEL_DESPLIEGUE } from '../comun/dichos.js';
import {
  claveDeBatalla,
  comoFrase,
  esDeLoApuntado,
  nombreDeLoApuntado,
  type TurnoPropio,
} from './batalla/control.js';
import { ELIGE_EN_LA_RUEDA } from './batalla/cruce.js';
import { SesionDeBatalla } from './batalla/sesion-de-batalla.js';

/**
 * Un lado del montaje para la sesión: sus unidades y su héroe (`LadoDeArena`) y
 * quién lo mueve, entero: la persona o la IA.
 */
export type LadoDeSesion = LadoDeArena & { readonly ia: boolean };

/**
 * La batalla de la arena (`/arena/`): dos bandos de unidades del borrador o del
 * catálogo, con un héroe cada uno si se quiere, sin partida alrededor, y en cada
 * unidad decide la persona o la IA. Las reglas son las del juego (`createBattle`),
 * las mismas para los dos lados.
 *
 * Vive aquí porque la sesión (`sesion/`) es la única puerta del cliente al núcleo
 * —lo vigila `invariantes-cliente.test.ts`—, y la arena aplica reglas igual que la
 * partida.
 * Qué bandos lleva la IA se decide al montar y no cambia. Cuál es el «bando de
 * la persona» se deriva de la unidad activa, porque la persona puede llevar los
 * dos lados.
 *
 * **Montar no es empezar.** El constructor deja la batalla en su primera
 * jugada, y la IA no mueve hasta `empezar()`. Así quien la pinta puede mirar el
 * tablero de salida antes: cuando la IA jugaba ya en el constructor, el animador
 * veía la batalla por primera vez con todo eso hecho, lo daba por contado y, con
 * todas las unidades en IA, solo se veía el final (H1 de QA).
 *
 * La magia es la de la partida (`LibroDeBatalla`): lanza el héroe del lado de la
 * unidad que mueve la persona, con su maná y una vez por ronda. La pelea en pantalla
 * entera —las piezas, la caché, la rueda y la IA detrás de cada jugada— es la de la
 * partida (`SesionDeBatalla`); aquí, lo que la arena pone: qué bandos mueve la IA, su
 * azar y la batalla, siempre montada.
 */
export class SesionDeArena extends SesionDeBatalla {
  /** La batalla del montaje: en la arena existe siempre, también antes de «Luchar». */
  override readonly battle: BattleState;
  readonly semilla: number;
  /**
   * El catálogo con que se pelea: las unidades del montaje y sus piezas
   * (`catalogoDelMontaje`). La batalla no lo lleva, así que el retoque lo pide de
   * aquí y aquí deja lo retocado (`retocar`), y de aquí sale el cuerpo sin equipo
   * de cada stack (`cuerpoDe`).
   */
  private catalogo: CatalogoDeLaArena;
  /** En la arena los bandos no son de ningún jugador: los dos llevan su color de bando. */
  override readonly dueños = null;
  private readonly rng: Rng;
  /** Qué bandos mueve la IA, enteros: sus unidades y su héroe. */
  private readonly iaDelBando: Readonly<Record<Side, boolean>>;
  private empezada = false;

  /**
   * Lo que mira el panel para repintarse: cambia con cada jugada y con el hechizo
   * elegido, que es lo mismo que mira la caché. No hay contador aparte que se
   * pueda desacompasar.
   */
  get version(): string {
    return `${claveDeBatalla(this.battle)}|${this.apuntados.clave}|${this.arma.modo}|${this.rueda.pendiente?.fase ?? ''}|${this.despliegue.clave}`;
  }

  /** No es parte de la versión, por lo mismo que en `Session`: la reescribe el puntero. */
  override status = '';

  /**
   * El cuerpo de `s` sin lo que lleva, con el catálogo de esta pelea (`cuerpoDe`):
   * lo que el panel resta para decir qué le suma el equipo.
   */
  cuerpoDe(s: BattleStack): UnitInfo {
    return cuerpoDe(s, this.catalogo);
  }

  constructor(
    montaje: {
      readonly izquierda: LadoDeSesion;
      readonly derecha: LadoDeSesion;
      /** La muralla del tablero; sin ella, ninguna (`SIN_MURALLA`). */
      readonly muralla?: MurallaDeBatalla;
      /** El catálogo de equipo con que se pelea, hecho (`catalogoDeEquipo`, o `EQUIPO_DEL_JUEGO`). */
      readonly equipo: CatalogoDeEquipo;
      /** La complejidad de la pelea (`MontajeDeArena.combate`). */
      readonly combate: ReglasDelCombate;
      /** Los hechizos con que se pelea (los de la página; sin ellos, los del juego). */
      readonly hechizos?: CatalogoDeHechizos;
    },
    semilla: number,
    /** La arena no tiene regiones ni días: el despejado, o lo que pida `?clima=` (`arena/main.ts`). */
    override readonly climaDeLaBatalla: ClimaDelSitio = DESPEJADO,
  ) {
    super();
    this.semilla = semilla;
    this.rng = createRng(semilla);
    const delMontaje = {
      izquierda: montaje.izquierda,
      derecha: montaje.derecha,
      muralla: montaje.muralla ?? SIN_MURALLA,
      equipo: montaje.equipo,
      combate: montaje.combate,
      ...(montaje.hechizos === undefined ? {} : { hechizos: montaje.hechizos }),
    };
    this.catalogo = catalogoDelMontaje(delMontaje);
    this.iaDelBando = {
      [LADOS.izquierda.bando]: montaje.izquierda.ia,
      [LADOS.derecha.bando]: montaje.derecha.ia,
    } as Record<Side, boolean>;
    // Los lados «Yo» despliegan en pantalla; los de la IA, solos.
    const aMano = new Set((['izquierda', 'derecha'] as const).filter((l) => !montaje[l].ia));
    this.battle = batallaDeArena(delMontaje, this.rng, aMano);
  }

  protected override azar(): Rng {
    return this.rng;
  }

  /** Los bandos de la IA, enteros. */
  protected override laIAMueve(): (s: BattleStack) => boolean {
    return (s) => this.iaDelBando[s.side];
  }

  /** La IA elige en la rueda por sus bandos y la persona por los suyos. */
  protected override laIAEligePor(quien: BattleStack): boolean {
    return this.iaDelBando[quien.side];
  }

  /** Antes de «Luchar» el montaje se ve entero, no se coloca nada y no hay turno propio. */
  protected override enMarcha(): boolean {
    return this.empezada;
  }

  /**
   * Arranca la pelea: la IA juega hasta la primera unidad de la persona, o
   * entera si las lleva todas. Una vez: llamarla dos veces es un error de quien
   * monta.
   */
  empezar(): void {
    if (this.empezada) throw new Error('esta batalla de la arena ya ha empezado');
    this.empezada = true;
    if (this.despliegue.enCurso !== null) this.status = AYUDA_DEL_DESPLIEGUE;
    this.seguirLaIA();
  }

  /**
   * Lo que ve la persona: en el despliegue, desde el bando que despliega (con los
   * dos «Yo», cada tanda sin el rival que aún no desplegó); con todos en la IA, todo.
   */
  override get batallaALaVista(): BattleState {
    return this.despliegue.aLaVista() ?? this.battle;
  }

  /** La batalla entera, para el animador: la de la arena existe siempre. */
  override get batallaEntera(): BattleState {
    return this.battle;
  }

  /** ¿Esta unidad la mueve la IA? La de un bando de la IA. */
  laLlevaLaIA(stackId: string): boolean {
    return this.iaDelBando[stackById(this.battle, stackId).side];
  }

  override get turnoPropio(): TurnoPropio | null {
    const battle = this.battle;
    if (!this.empezada || battle.finished !== null) return null;
    const stack = activeStack(battle);
    if (stack === null || this.iaDelBando[stack.side]) return null;
    return { battle, stack, side: stack.side };
  }

  override get miBando(): Side | null {
    return this.turnoPropio?.side ?? null;
  }

  /**
   * Quien mira la rueda del golpe (`SesionConRueda.quienMira`): el bando de la
   * persona si lleva uno solo; con los dos suyos (o ninguno), `null`, y la rueda
   * los dice por su lado del campo.
   */
  override get quienMira(): Side | null {
    const suyos = (['attacker', 'defender'] as const).filter((b) => !this.iaDelBando[b]);
    return suyos.length === 1 ? (suyos[0] as Side) : null;
  }

  /**
   * Cambia las cifras de un tipo, o del héroe de un lado, en la pelea en curso
   * (`retocarEnBatalla`): devuelve el motivo si no entra, sin tocar nada, o `null`
   * si ha entrado. El turno y lo elegido se conservan; lo elegido que con las
   * cifras nuevas ya no se puede jugar se suelta y la barra lo dice.
   */
  retocar(r: RetoqueDeArena): string | null {
    // Con la rueda a medias, la acción guardada se juega con las cifras de
    // cuando se eligió: cambiarlas debajo podría dejarla ilegal.
    if (this.rueda.pendiente !== null) return comoFrase(ELIGE_EN_LA_RUEDA);
    const largo = this.battle.log.length;
    const motivo = retocarEnBatalla(this.battle, r, this.catalogo);
    if (motivo !== null) return comoFrase(motivo);
    this.catalogo = catalogoTrasElRetoque(r, this.catalogo);
    // Lo que entra y cambia algo deja su `retoque` en el registro; lo que deja la
    // ficha como estaba no escribe nada, y no se dice «Cambiado» (N1 de QA).
    if (this.battle.log.length === largo) {
      // Una pieza que nadie de esta pelea lleva, o un cambio que no mueve ninguna
      // cifra (su nombre, su precio), entra igual y vale para la siguiente.
      this.status =
        r.kind === 'piezas'
          ? 'Ninguna cifra de esta pelea cambia con eso: vale para la pelea siguiente.'
          : 'Sin cambios: la ficha ya decía eso.';
      return null;
    }
    const suelto = this.soltarLoQueNoVale();
    this.status =
      suelto === null
        ? 'Cambiado: vale ya en esta pelea.'
        : `Cambiado: vale ya en esta pelea. Con las cifras nuevas no se puede usar ${suelto}: suelto.`;
    return null;
  }

  /**
   * Suelta lo apuntado si la lista legal ya no trae ninguna jugada suya, y dice
   * qué soltó (su nombre), o `null` si nada. Lo apuntado es uno solo, así que se
   * suelta como mucho una cosa.
   */
  private soltarLoQueNoVale(): string | null {
    const a = this.apuntado;
    if (a === null || this.battleLegalActions().some((x) => esDeLoApuntado(a, x))) return null;
    this.apuntados.soltar();
    return nombreDeLoApuntado(a);
  }
}
