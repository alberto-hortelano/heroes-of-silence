/**
 * La sesión de la arena (`/arena/`, `SesionDeArena`): la batalla de un montaje sin
 * partida alrededor, con las reglas del juego y las mismas piezas de la pelea que la
 * partida (`sesion/batalla/`). Es de la puerta del cliente al núcleo (`sesion/`), y la
 * única de ella que monta y retoca con el montador de la arena (`core/arena/`: lo
 * vigila `invariantes-batalla.test.ts`). Era parte de `sesion/partida.ts` hasta la
 * fase C de la reorganización (07-11-2026).
 */
import { LADOS } from '@core/arena/lados.js';
import {
  batallaDeArena,
  type CatalogoDeLaArena,
  catalogoDelMontaje,
  conUnidad,
  type LadoDeArena,
} from '@core/arena/montaje.js';
import { type RetoqueDeArena, retocarEnBatalla } from '@core/arena/retoque.js';
import {
  activeStack,
  type CasillaDeCarga,
  contactoBlocker,
  faseDelTurno,
  pasosQueQuedan,
  stackById,
} from '@core/battle/consultas.js';
import { bonoEnLoAlto, SIN_MURALLA } from '@core/battle/muralla.js';
import type { Prevision } from '@core/battle/prevision.js';
import type {
  BattleAction,
  BattleHero,
  BattleStack,
  BattleState,
  MurallaDeBatalla,
  Side,
} from '@core/battle/types.js';
import type { ReglasDelCombate } from '@core/combate.js';
import type { CatalogoDeEquipo } from '@core/equipo/atado.js';
import { maxMana } from '@core/hero/hero.js';
import type { CatalogoDeHechizos } from '@core/magia/catalogo.js';
import { createRng, type Rng } from '@core/rng.js';
import { type ClimaDelSitio, DESPEJADO } from '@core/state/clima.js';
import type { Hex, PoderId, UnitInfo } from '@core/types.js';
import { cuerpoDe } from '@core/unidad/catalogo.js';
import { AYUDA_DEL_DESPLIEGUE } from '../comun/dichos.js';
import { LoApuntado, rechazoDeLoApuntado } from './batalla/apuntado.js';
import { ArmaDeLaActiva } from './batalla/arma.js';
import {
  type Apuntado,
  accionesDeBatalla,
  type CalculoDeBatalla,
  type ControlDeBatalla,
  claveConMagia,
  claveDeBatalla,
  comoFrase,
  esDeLoApuntado,
  jugarIAMientras,
  motivoContra,
  motivoDeMovimiento,
  nombreDeLoApuntado,
  opcionesDeHechizo,
  previsionPropia,
  type SpellOption,
  type TurnoPropio,
} from './batalla/control.js';
import {
  CruceDeLaRueda,
  ELIGE_EN_LA_RUEDA,
  motivoDeLaRueda,
  type RuedaPendiente,
} from './batalla/cruce.js';
import { type DespliegueEnPantalla, enLaBatalla } from './batalla/despliegue.js';
import { LibroDeBatalla } from './batalla/libro.js';
import { MurallaDeLaActiva } from './batalla/muralla.js';
import { PoderesDeLaActiva } from './batalla/poderes.js';

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
 * unidad que mueve la persona, con su maná y una vez por ronda.
 */
export class SesionDeArena implements ControlDeBatalla {
  readonly battle: BattleState;
  readonly semilla: number;
  /**
   * El catálogo con que se pelea: las unidades del montaje y sus piezas
   * (`catalogoDelMontaje`). La batalla no lo lleva, así que el retoque lo pide de
   * aquí y aquí deja lo retocado (`retocar`), y de aquí sale el cuerpo sin equipo
   * de cada stack (`cuerpoDe`).
   */
  private catalogo: CatalogoDeLaArena;
  /** Lo que apunta el siguiente clic, uno solo (la versión lo lee de aquí). */
  readonly apuntados = new LoApuntado();
  readonly hechizos: LibroDeBatalla = new LibroDeBatalla(this, this.apuntados);
  /** El poder de la activa que espera el clic en un aliado (`PoderesDeLaActiva`). */
  readonly poderes = new PoderesDeLaActiva(this, this.apuntados);
  /** El selector de arma de la activa (`ArmaDeLaActiva`): la versión lo lee de aquí. */
  readonly arma = new ArmaDeLaActiva(this);
  /**
   * El despliegue de los bandos «Yo» (`DespliegueEnPantalla`, el de la partida),
   * como en el juego: primero el derecho, que defiende, y después el izquierdo;
   * el de la IA, solo. Desde que empieza la pelea (`empezar`).
   */
  readonly despliegue: DespliegueEnPantalla = enLaBatalla({
    batalla: () => this.battle,
    // Antes de «Luchar» el montaje se ve entero y no se coloca nada.
    enMarcha: () => this.empezada,
    barra: (texto) => {
      this.status = texto;
    },
    // Los campos se inician antes que el constructor, que pone `rng`.
    rng: () => this.rng,
    trasCerrar: () => this.avanzarIA(),
    alCambiar: () => {},
  });
  /** En la arena los bandos no son de ningún jugador: los dos llevan su color de bando. */
  readonly dueños = null;
  private readonly rng: Rng;
  /** Qué bandos mueve la IA, enteros: sus unidades y su héroe. */
  private readonly iaDelBando: Readonly<Record<Side, boolean>>;
  /** El golpe que espera la rueda: la IA elige por sus bandos y la persona por los suyos. */
  private readonly rueda: CruceDeLaRueda;
  private empezada = false;

  /**
   * Lo que mira el panel para repintarse: cambia con cada jugada y con el hechizo
   * elegido, que es lo mismo que mira la caché. No hay contador aparte que se
   * pueda desacompasar.
   */
  get version(): string {
    return `${claveDeBatalla(this.battle)}|${this.apuntados.clave}|${this.arma.modo}|${this.rueda.pendiente?.fase ?? ''}|${this.despliegue.clave}`;
  }

  /**
   * El golpe que espera la rueda, si lo hay (`CruceDeLaRueda`, el mismo de la
   * partida): la fase, quién pega a quién, qué bando elige y lo que daría cada
   * tipo, sin lo que eligió el otro.
   */
  get ruedaPendiente(): RuedaPendiente | null {
    return this.rueda.pendiente;
  }

  /** Lo mismo que en `Session` (`motivoDeLaRueda`). */
  get motivoDeLaRueda(): string | null {
    return motivoDeLaRueda(this.ruedaPendiente);
  }

  /** No es parte de la versión, por lo mismo que en `Session`: la reescribe el puntero. */
  status = '';

  /** La muralla de la activa (`MurallaDeLaActiva`, la misma de la partida). */
  readonly muralla = new MurallaDeLaActiva(this, this.apuntados);
  get apuntado(): Apuntado | null {
    return this.apuntados.actual;
  }

  /** Escape: suelta lo que espera el clic —hechizo, poder, muro o puerta— y limpia la barra que lo pedía. */
  soltarLoApuntado(): void {
    if (this.apuntados.soltar()) this.status = '';
  }

  rechazoDeLoApuntado(targetId: string): string {
    return rechazoDeLoApuntado(this.hechizos, this.poderes, this.apuntado, targetId);
  }

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
    readonly climaDeLaBatalla: ClimaDelSitio = DESPEJADO,
  ) {
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
    this.rueda = new CruceDeLaRueda(
      { sesion: this, alMoverse: () => {}, seguirLaIA: () => this.avanzarIA() },
      this.rng,
      (quien) => this.iaDelBando[quien.side],
    );
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
    this.avanzarIA();
  }

  /**
   * Lo que ve la persona: en el despliegue, desde el bando que despliega (con los
   * dos «Yo», cada tanda sin el rival que aún no desplegó); con todos en la IA, todo.
   */
  get batallaALaVista(): BattleState {
    return this.despliegue.aLaVista() ?? this.battle;
  }

  /** La batalla entera, para el animador (`ControlDeBatalla.batallaEntera`). */
  get batallaEntera(): BattleState {
    return this.battle;
  }

  /** ¿Esta unidad la mueve la IA? La de un bando de la IA. */
  laLlevaLaIA(stackId: string): boolean {
    return this.iaDelBando[stackById(this.battle, stackId).side];
  }

  get turnoPropio(): TurnoPropio | null {
    const battle = this.battle;
    if (!this.empezada || battle.finished !== null) return null;
    const stack = activeStack(battle);
    if (stack === null || this.iaDelBando[stack.side]) return null;
    return { battle, stack, side: stack.side };
  }

  get miBando(): Side | null {
    return this.turnoPropio?.side ?? null;
  }

  /**
   * Quien mira la rueda del golpe (`SesionConRueda.quienMira`): el bando de la
   * persona si lleva uno solo; con los dos suyos (o ninguno), `null`, y la rueda
   * los dice por su lado del campo.
   */
  get quienMira(): Side | null {
    const suyos = (['attacker', 'defender'] as const).filter((b) => !this.iaDelBando[b]);
    return suyos.length === 1 ? (suyos[0] as Side) : null;
  }

  /** Como en `Session`, guardado por jugada: la escena lo pide en cada fotograma. */
  private calculo(): CalculoDeBatalla {
    const modo = this.arma.modo;
    const clave = `${claveConMagia(this.battle)}|${this.empezada}|${modo}`;
    if (this.cache !== null && this.cache.clave === clave) return this.cache.valor;
    const turno = this.turnoPropio;
    const comunes = accionesDeBatalla(this.battle, turno, modo);
    const valor = { ...comunes, opciones: opcionesDeHechizo(turno, comunes.acciones) };
    this.cache = { clave, valor };
    return valor;
  }
  private cache: { clave: string; valor: CalculoDeBatalla } | null = null;

  battleLegalActions(): readonly BattleAction[] {
    return this.calculo().acciones;
  }

  battleMovable(): readonly Hex[] {
    return this.calculo().movibles;
  }

  battleCharges(): readonly CasillaDeCarga[] {
    return this.calculo().cargas;
  }

  /** El libro del héroe del lado que mueve la persona, como en la partida. */
  spellOptions(): readonly SpellOption[] {
    return this.calculo().opciones;
  }

  /**
   * El héroe del lado de la unidad activa de la persona, con su maná máximo
   * (`maxMana`, la regla del núcleo), o `null`.
   */
  get heroeEnJuego(): { readonly mando: BattleHero; readonly manaMaximo: number } | null {
    const turno = this.turnoPropio;
    const mando = turno === null ? null : this.battle.heroes[turno.side];
    return mando === null ? null : { mando, manaMaximo: maxMana(mando) };
  }

  /** Las casillas que le quedan este turno a la unidad activa, si es de la persona. */
  battleStepsLeft(): number | null {
    const turno = this.turnoPropio;
    return turno === null ? null : pasosQueQuedan(turno.battle, turno.stack);
  }

  /**
   * Por qué la unidad activa de la persona no puede salir de su casilla
   * (`contactoBlocker`: rodeada, lo que le queda no paga salir), como frase, o
   * `null`. El panel lo dice sin que se señale ninguna casilla.
   */
  sinSalida(): string | null {
    const turno = this.turnoPropio;
    const motivo = turno === null ? null : contactoBlocker(turno.battle, turno.stack);
    return motivo === null ? null : comoFrase(motivo);
  }

  /**
   * Si la unidad activa de la persona ha golpeado con Finta y le queda solo el
   * tramo de andar (`faseDelTurno`): el panel lo dice en vez de invitar a golpear
   * (R2 de QA de #263).
   */
  trasLaFinta(): boolean {
    const turno = this.turnoPropio;
    return turno !== null && faseDelTurno(turno.battle) === 'trasLaFinta';
  }

  attackRejection(targetId: string): string {
    return motivoContra(this.turnoPropio, targetId);
  }

  prevision(action: BattleAction): Prevision | null {
    return previsionPropia(this.turnoPropio, action);
  }

  moveRejection(hex: Hex): string {
    return motivoDeMovimiento(this.turnoPropio, hex);
  }

  /** Lo que suma a la defensa de `s` estar en lo alto (`bonoEnLoAlto`), para la ficha. */
  defensaEnLoAlto(s: BattleStack): number {
    return bonoEnLoAlto(this.battle, s);
  }

  /**
   * Por qué la unidad activa —tuya— no puede usar ese poder sobre nadie
   * (`poderBlocker`), como frase; `null` si puede. Lo pinta el botón deshabilitado.
   */
  motivoDePoder(p: PoderId): string | null {
    return this.poderes.motivo(p);
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
    if (r.kind === 'piezas') this.catalogo = { ...this.catalogo, equipo: r.equipo };
    if (r.kind === 'hechizos') this.catalogo = { ...this.catalogo, hechizos: r.hechizos };
    if (r.kind === 'tipo') this.catalogo = conUnidad(this.catalogo, r.fuente.unidad);
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

  /**
   * Aplica la jugada de la persona y deja a la IA mover las suyas hasta la
   * siguiente. Con la rueda, un golpe cuerpo a cuerpo sin elegir no se da: quien
   * pega anda hasta su objetivo y la rueda (`ruedaPendiente`) espera su elección.
   */
  playBattleAction(action: BattleAction): void {
    this.rueda.jugar(this.battle, action);
  }

  /** Lo que elige en la rueda quien le toca (`CruceDeLaRueda.elegirYJugar`). */
  elegirEnLaRueda(tipo: string): void {
    this.rueda.elegirYJugar(this.battle, tipo);
  }

  /** Escape en la rueda (`CruceDeLaRueda.cancelarGolpe`). Devuelve si se canceló. */
  cancelarGolpe(): boolean {
    return this.rueda.cancelarGolpe(this.battle);
  }

  /**
   * Con todas en IA la batalla se juega entera aquí, de una vez: el animador la
   * cuenta después. Con la rueda, la IA elige su golpe a ciegas; si golpea a una
   * unidad de la persona, se para y la rueda pide la respuesta.
   */
  private avanzarIA(): void {
    jugarIAMientras(
      this.battle,
      this.rng,
      (s) => this.iaDelBando[s.side],
      (accion) => this.rueda.completar(this.battle, accion),
    );
    if (this.battle.finished !== null) this.status = 'La batalla ha terminado.';
  }
}
