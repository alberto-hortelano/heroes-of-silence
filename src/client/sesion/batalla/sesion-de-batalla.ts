/**
 * La sesión de batalla común (`SesionDeBatalla`): lo que la sesión de la partida
 * (`Session`) y la de la arena (`SesionDeArena`) hacen igual con la pelea en pantalla.
 * Lleva las piezas —lo apuntado, el libro, los poderes, el arma, la muralla, el
 * despliegue y el cruce de la rueda—, lo que se ofrece a la persona en una sola caché,
 * lo que el panel pregunta de la activa (`sinSalida`, `trasLaFinta`, `heroeEnJuego`,
 * `defensaEnLoAlto`) y la jugada de la persona con la IA detrás. Cada hija pone lo suyo:
 * la batalla, la barra, el turno de la persona y su bando, quién mira la rueda, su
 * azar, qué mueve la IA y qué elige a ciegas, y lo que la frena (la defensa por elegir
 * de la partida).
 *
 * Hasta R1 de la reorganización (07-11-2026) cada sesión llevaba su copia de todo
 * esto, y ya divergían: lo que el panel pregunta de la activa solo lo tenía la arena,
 * y la partida, tras una Finta, invitaba a golpear sin poder.
 *
 * **Lo que la base lee de la hija va por función** (los métodos abstractos y los
 * protegidos de abajo), nunca por un campo: los campos de la base se inician antes que
 * los de la hija, así que una pieza que leyera un campo de la hija al nacer lo vería
 * sin poner. El azar de la partida, por ejemplo, nace en su constructor.
 */
import {
  type CasillaDeCarga,
  contactoBlocker,
  faseDelTurno,
  pasosQueQuedan,
  SIN_CARGAS,
} from '@core/battle/consultas.js';
import { bonoEnLoAlto } from '@core/battle/muralla.js';
import type { Prevision } from '@core/battle/prevision.js';
import type {
  BattleAction,
  BattleHero,
  BattleStack,
  BattleState,
  Side,
} from '@core/battle/types.js';
import { maxMana } from '@core/hero/hero.js';
import type { Rng } from '@core/rng.js';
import type { ClimaDelSitio } from '@core/state/clima.js';
import type { Hex, PlayerId, PoderId } from '@core/types.js';
import { LoApuntado, rechazoDeLoApuntado } from './apuntado.js';
import { ArmaDeLaActiva } from './arma.js';
import {
  type Apuntado,
  accionesDeBatalla,
  type CalculoDeBatalla,
  type ControlDeBatalla,
  claveConMagia,
  comoFrase,
  jugarIAMientras,
  motivoContra,
  motivoDeMovimiento,
  opcionesDeHechizo,
  previsionPropia,
  type SpellOption,
  type TurnoPropio,
} from './control.js';
import { CruceDeLaRueda, motivoDeLaRueda, type RuedaPendiente } from './cruce.js';
import { type DespliegueEnPantalla, enLaBatalla } from './despliegue.js';
import { LibroDeBatalla } from './libro.js';
import { MurallaDeLaActiva } from './muralla.js';
import { PoderesDeLaActiva } from './poderes.js';

/**
 * La pelea en pantalla de una sesión, la de la partida o la de la arena (cabecera del
 * fichero). Implementa lo que la escena de batalla pide de quien juega
 * (`ControlDeBatalla`) y, con el `quienMira` de cada hija, lo que pide la rueda.
 */
export abstract class SesionDeBatalla implements ControlDeBatalla {
  /**
   * La batalla entera: la de la partida, solo mientras se pelea (`null` fuera); la de
   * la arena, siempre. Lo que se pinta y se pulsa no la lee: lee `batallaALaVista`.
   */
  abstract readonly battle: BattleState | null;
  /** La barra de estado: la escriben las piezas, la escena y la IA al terminar. */
  abstract status: string;
  /** La batalla y la unidad activa, solo si esa unidad la mueve la persona. */
  abstract readonly turnoPropio: TurnoPropio | null;
  /** El bando de la persona; `null` si no lleva ninguno ahora. */
  abstract readonly miBando: Side | null;
  /** Quien mira la rueda del golpe (`SesionConRueda.quienMira`, `batalla/rueda/dialogo.ts`). */
  abstract readonly quienMira: Side | null;
  /** De quién es cada bando, o `null` donde no son de jugadores (`ControlDeBatalla.dueños`). */
  abstract readonly dueños: Readonly<Record<Side, PlayerId | null>> | null;
  /** El clima del sitio de la batalla (`ControlDeBatalla.climaDeLaBatalla`). */
  abstract readonly climaDeLaBatalla: ClimaDelSitio;

  /** El azar con que se juega la batalla: el de la partida o el de la arena. */
  protected abstract azar(): Rng;

  /**
   * Qué unidades mueve la IA hasta la siguiente jugada de la persona, o `null` si
   * ahora no mueve ninguna (la partida, en una batalla sin bando suyo).
   */
  protected abstract laIAMueve(): ((s: BattleStack) => boolean) | null;

  /** Si la IA elige a ciegas en la rueda lo de `quien`: su golpe o su respuesta. */
  protected abstract laIAEligePor(quien: BattleStack): boolean;

  /**
   * Si algo frena la jugada de la persona antes de mirarla, y entonces la barra dice
   * qué (la partida, con la defensa por elegir: `eligiendoLaDefensa`). La arena, nada.
   */
  protected frenoDeLaDefensa(): boolean {
    return false;
  }

  /**
   * Si la pelea ya se juega: la arena monta la batalla y no la empieza hasta «Luchar»
   * (`SesionDeArena.empezar`); la partida, siempre. Lo leen el despliegue y la caché.
   */
  protected enMarcha(): boolean {
    return true;
  }

  /**
   * Lo que se ve ha cambiado: la partida sube su versión (`Session.version`); la
   * arena la deriva de la batalla y de las piezas, y no hace nada.
   */
  protected alCambiar(): void {}

  /** Lo que apunta el siguiente clic, uno solo: cambiarlo es un cambio que se ve. */
  readonly apuntados = new LoApuntado(() => this.alCambiar());
  /**
   * El libro del héroe del bando de la activa (`LibroDeBatalla`): el hechizo elegido,
   * sobre quién cae y por qué no. Vive en la sesión y no en la página porque lo lee
   * también el panel; la página solo guarda estado de píxel.
   */
  readonly hechizos: LibroDeBatalla = new LibroDeBatalla(this, this.apuntados);
  /** El poder de la activa que espera el clic en un aliado (`PoderesDeLaActiva`). */
  readonly poderes = new PoderesDeLaActiva(this, this.apuntados);
  /** El selector de arma de la activa (`ArmaDeLaActiva`): cambiarlo es un cambio que se ve. */
  readonly arma = new ArmaDeLaActiva(this, () => this.alCambiar());
  /** La muralla de la activa (`MurallaDeLaActiva`): la de la ciudad y el pueblo, o la de la arena. */
  readonly muralla = new MurallaDeLaActiva(this, this.apuntados);
  /**
   * El despliegue de la persona (`DespliegueEnPantalla`): su bando, atacante o
   * defensor, y en la arena cada bando «Yo», desde «Luchar». Cerrarlo deja jugar a la
   * IA si la iniciativa es suya.
   */
  readonly despliegue: DespliegueEnPantalla = enLaBatalla({
    batalla: () => this.battle,
    enMarcha: () => this.enMarcha(),
    barra: (texto) => {
      this.status = texto;
    },
    rng: () => this.azar(),
    trasCerrar: () => this.seguirLaIA(),
    alCambiar: () => this.alCambiar(),
  });
  /**
   * El golpe que espera la rueda (`CruceDeLaRueda`): la persona elige por lo suyo y la
   * IA, a ciegas, por lo que diga cada hija (`laIAEligePor`).
   */
  protected readonly rueda = new CruceDeLaRueda(
    {
      sesion: this,
      alMoverse: () => this.alCambiar(),
      seguirLaIA: () => this.seguirLaIA(),
    },
    () => this.azar(),
    (quien) => this.laIAEligePor(quien),
  );

  /**
   * Lo que de la batalla ve la persona (`DespliegueEnPantalla.aLaVista`): en el
   * despliegue, sin el rival que aún no ha desplegado.
   */
  get batallaALaVista(): BattleState | null {
    return this.despliegue.aLaVista();
  }

  /** La batalla entera, para el animador (`ControlDeBatalla.batallaEntera`). */
  get batallaEntera(): BattleState | null {
    return this.battle;
  }

  /** Lo apuntado: el hechizo del libro o el poder de la activa. */
  get apuntado(): Apuntado | null {
    return this.apuntados.actual;
  }

  /** Escape: suelta lo que espera el clic —hechizo, poder, muro o puerta— y limpia la barra que lo pedía. */
  soltarLoApuntado(): void {
    if (this.apuntados.soltar()) this.status = '';
  }

  /**
   * Las acciones legales y lo que se deriva de ellas, guardado mientras la batalla no
   * se mueva: **una caché para las dos sesiones**, con la clave de las dos de antes
   * juntas (con una pide algún cálculo de más, nunca uno viejo).
   *
   * La escena las pide en cada fotograma, y cada petición era el BFS del tablero más
   * un `castBlocker` por hechizo y objetivo. Toda acción aplicada deja una línea en el
   * registro y mueve el turno —su ordinal, o lo gastado en él—, así que la clave es
   * esa (`claveConMagia`, con el maná de los dos héroes), con la batalla por identidad
   * delante: una batalla nueva empieza con el registro corto y podría coincidir. Y lo
   * que la batalla no dice: el modo del arma (`ArmaDeLaActiva.modo`), lo apuntado y si
   * la pelea ya se juega (`enMarcha`: en la arena, sin «Luchar», no hay turno propio).
   */
  private calculoDeBatalla(): CalculoDeBatalla {
    const battle = this.battle;
    if (battle === null) return { acciones: [], movibles: [], opciones: [], cargas: SIN_CARGAS };
    const modo = this.arma.modo;
    const clave = `${claveConMagia(battle)}|${this.apuntados.clave}|${modo}|${this.enMarcha()}`;
    const c = this.calculo;
    if (c !== null && c.battle === battle && c.clave === clave) return c.valor;
    const turno = this.turnoPropio;
    const comunes = accionesDeBatalla(battle, turno, modo);
    const valor = { ...comunes, opciones: opcionesDeHechizo(turno, comunes.acciones) };
    this.calculo = { battle, clave, valor };
    return valor;
  }
  private calculo: {
    readonly battle: BattleState;
    readonly clave: string;
    readonly valor: CalculoDeBatalla;
  } | null = null;

  battleLegalActions(): readonly BattleAction[] {
    return this.calculoDeBatalla().acciones;
  }

  /** Las casillas a las que puede ir la unidad activa, si es de la persona. */
  battleMovable(): readonly Hex[] {
    return this.calculoDeBatalla().movibles;
  }

  /**
   * Las cargas que tiene a mano la unidad activa: contra qué enemigo, desde qué
   * casilla y con cuántas casillas. Vacío si no es de la persona o no carga.
   */
  battleCharges(): readonly CasillaDeCarga[] {
    return this.calculoDeBatalla().cargas;
  }

  /**
   * El libro tal y como se pinta (`opcionesDeHechizo`), de la caché: el del héroe del
   * bando de la activa de la persona.
   */
  spellOptions(): readonly SpellOption[] {
    return this.calculoDeBatalla().opciones;
  }

  /** Las casillas que le quedan este turno a la unidad activa, si es de la persona. */
  battleStepsLeft(): number | null {
    const turno = this.turnoPropio;
    return turno === null ? null : pasosQueQuedan(turno.battle, turno.stack);
  }

  /**
   * Por qué la unidad activa no puede actuar contra ese enemigo: ni dispararle ni
   * golpearlo (`motivoContra`: la frase es del núcleo).
   */
  attackRejection(targetId: string): string {
    return motivoContra(this.turnoPropio, targetId);
  }

  prevision(action: BattleAction): Prevision | null {
    return previsionPropia(this.turnoPropio, action);
  }

  moveRejection(hex: Hex): string {
    return motivoDeMovimiento(this.turnoPropio, hex);
  }

  rechazoDeLoApuntado(targetId: string): string {
    return rechazoDeLoApuntado(this.hechizos, this.poderes, this.apuntado, targetId);
  }

  /**
   * Por qué la unidad activa —de la persona— no puede usar ese poder sobre nadie
   * (`poderBlocker`), como frase; `null` si puede. Lo pinta el botón deshabilitado.
   */
  motivoDePoder(p: PoderId): string | null {
    return this.poderes.motivo(p);
  }

  /**
   * El héroe del bando de la unidad activa de la persona, con su maná máximo
   * (`maxMana`, la regla del núcleo), o `null`: sin turno propio, o sin héroe en ese
   * bando (una base que se defiende sola).
   */
  get heroeEnJuego(): { readonly mando: BattleHero; readonly manaMaximo: number } | null {
    const turno = this.turnoPropio;
    const mando = turno === null ? null : turno.battle.heroes[turno.side];
    return mando === null ? null : { mando, manaMaximo: maxMana(mando) };
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

  /**
   * Lo que suma a la defensa de `s` estar en lo alto de un muro (`bonoEnLoAlto`),
   * para la ficha. Sin batalla no hay muro: preguntarlo es un fallo de quien pinta.
   */
  defensaEnLoAlto(s: BattleStack): number {
    const battle = this.battle;
    if (battle === null) throw new Error(`no hay batalla en la que ${s.unit.name} esté en lo alto`);
    return bonoEnLoAlto(battle, s);
  }

  /**
   * El golpe que espera la rueda, si lo hay (`CruceDeLaRueda`): la fase, quién pega a
   * quién, qué bando elige y lo que daría cada tipo, sin lo que eligió el otro. Sin
   * batalla, ninguno.
   */
  get ruedaPendiente(): RuedaPendiente | null {
    return this.battle === null ? null : this.rueda.pendiente;
  }

  /**
   * Por qué los botones de la batalla no hacen nada mientras la rueda espera, o
   * `null` (`motivoDeLaRueda`): el panel los apaga con esta frase en su `title`.
   */
  get motivoDeLaRueda(): string | null {
    return motivoDeLaRueda(this.ruedaPendiente);
  }

  /**
   * Aplica la jugada de la persona y deja a la IA mover lo suyo hasta la siguiente.
   * Un golpe cuerpo a cuerpo no se da de una vez: quien pega anda hasta su objetivo
   * (o se planta en su salida, si carga) y la rueda (`ruedaPendiente`) espera su
   * elección (`elegirEnLaRueda`).
   */
  playBattleAction(action: BattleAction): void {
    if (this.frenoDeLaDefensa()) return;
    const battle = this.battle;
    if (battle !== null) this.rueda.jugar(battle, action);
  }

  /** Lo que elige en la rueda quien le toca (`CruceDeLaRueda.elegirYJugar`). */
  elegirEnLaRueda(tipo: string): void {
    const battle = this.battle;
    if (battle !== null) this.rueda.elegirYJugar(battle, tipo);
  }

  /** Escape en la rueda (`CruceDeLaRueda.cancelarGolpe`). Devuelve si se canceló. */
  cancelarGolpe(): boolean {
    const battle = this.battle;
    return battle !== null && this.rueda.cancelarGolpe(battle);
  }

  /**
   * La IA juega lo suyo (`laIAMueve`) hasta que le toque a la persona, con el único
   * bucle de las dos (`jugarIAMientras`). Si golpea cuerpo a cuerpo a una unidad de la
   * persona, se para: se planta ante ella y la rueda pide la respuesta. Con todo en la
   * IA (la arena), la batalla se juega entera aquí, de una vez, y el animador la
   * cuenta después.
   */
  protected seguirLaIA(): void {
    const battle = this.battle;
    const mueve = this.laIAMueve();
    if (battle === null || mueve === null) return;
    const jugadas = jugarIAMientras(battle, this.azar(), mueve, (a) =>
      this.rueda.completar(battle, a),
    );
    if (jugadas > 0 || this.rueda.pendiente !== null) this.alCambiar();
    if (battle.finished !== null) this.status = 'La batalla ha terminado.';
  }
}
