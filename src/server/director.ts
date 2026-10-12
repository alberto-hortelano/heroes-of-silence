/**
 * Director de la partida.
 *
 * Decide quién juega cada turno: el agente conectado, o la IA heurística si no
 * hay agente o si su respuesta no sirve. Nunca deja la partida encallada por
 * culpa del agente.
 */

import { chooseBattleAction } from '@core/ai/tactics.js';
import { type BattleTakeover, playAiTurn } from '@core/ai/turn.js';
import {
  activeStack,
  applyAction,
  MAX_JUGADAS,
  mismoTurno,
  pasosQueQuedan,
} from '@core/battle/battle.js';
import type { BattleAction, BattleState, TurnoDeUnidad } from '@core/battle/types.js';
import { type AccionDelAgente, accionDelAgente } from '@core/contract/huecos.js';
import {
  serializeAdventureTurn,
  serializeBattleTurn,
  serializeHeroFromTroop,
  serializeTownVoices,
} from '@core/contract/serialize.js';
import { porPreguntar } from '@core/hero/ascenso.js';
import { RANGO_MAXIMO_DE_TROPA, rangoDeHeroe } from '@core/hero/experiencia.js';
import type { MapPlan } from '@core/map/generate.js';
import { pointKey } from '@core/map/map.js';
import { createRng } from '@core/rng.js';
import {
  applyAdventureAction,
  ascenderVeterano,
  battleOwners,
  currentPlayer,
  type GameContext,
  type GameState,
  hayHuecoDeHeroe,
  playerById,
  resolvePendingBattle,
  settleBattle,
  sidesOwnedBy,
  townsOf,
  veteranosEnSuBase,
  week,
} from '@core/state/game.js';
import { newGame } from '@core/state/setup.js';
import { firmaDeVoces, ponerVoces, vocesCaducadas } from '@core/town/voces.js';
import type { PlayerId } from '@core/types.js';
import type { AgentLink } from './agent-link.js';
import {
  describeAccion,
  MOTIVO_PARTIDA_TERMINADA,
  MOTIVO_TRAS_END_TURN,
  notaAccionAceptada,
  notaAccionSustituida,
  notaAscenso,
  notaAscensoRechazado,
  notaMarchaParcial,
  notaTurnoAventura,
  notaVoces,
  paradaDeLaMarcha,
  type TurnoAbierto,
} from './notas.js';

export interface DirectorOptions {
  readonly seed?: number;
  /**
   * El mapa ya diseñado, si alguien lo trae hecho.
   *
   * El director sigue siendo síncrono y sigue sin saber que existe un agente al
   * que pedirle cosas: recibe un plan o no lo recibe. Quien lo pide es
   * `ws-server.ts`, que es el único que sabe que hay alguien al otro lado del
   * cable — y el único módulo de este directorio que nadie puede probar de
   * todos modos.
   */
  readonly plan?: MapPlan;
  /** Jugadores cuyo turno decide el agente. */
  readonly agentPlayers?: readonly PlayerId[];
  /**
   * El último día que se juega. Se le pasa tal cual a `newGame`.
   *
   * El tope es **configuración** del servidor (`HEROES_MAX_DAYS`); la **regla**
   * de qué pasa al agotarse es del núcleo (`GameState.finished`).
   */
  readonly maxDays?: number | undefined;
  /**
   * Un fotograma: se llama tras CADA acción aplicada, de mapa y de batalla.
   *
   * Existe porque `broadcast()` corría una vez por turno y una batalla se
   * resolvía entera entre dos fotogramas: en la cobertura de `pnpm qa` son 15 de
   * 18 decisiones las que no se verían, y son justo las que más toma el agente.
   * Una ronda son 6-10 acciones, así que un fotograma por ronda perdería
   * catorce de esas quince.
   *
   * Con el número delante y MEDIDO aquí, porque la pregunta obvia es si inunda
   * el socket: un snapshot del día 8 en 24×24 son **19 446 bytes y 0,044 ms** de
   * `JSON.stringify` (22 515 con las veinte notas del director llenas), y la
   * batalla en curso añade **1 693 bytes**. `broadcast()` sale antes si no mira
   * nadie. Y esto no es un bucle de juego: avanza al ritmo al que contesta el
   * agente, que son segundos.
   *
   * **Lo que NO da fotogramas, dicho aquí y no descubierto luego**: el turno de
   * mapa que juega la heurística (`playAiTurn` es una llamada atómica a `core`)
   * y las batallas que no se queda nadie (`resolvePendingBattle`, `autoResolve`),
   * que se resuelven dentro del núcleo. Enseñarlas exigiría que `core` conociera
   * a un observador, y eso es otro issue.
   */
  readonly onFrame?: () => void;
  /**
   * Retoca la partida recién creada, antes del primer turno.
   *
   * Existe para el arnés de QA y para nada más: la partida del arnés produce un
   * veterano de rango 5 en 0,06 de cada partida, así que `pnpm qa` no cruzaría
   * nunca el ascenso por sí solo. **No lo abre ninguna variable de entorno ni
   * ningún mensaje del cable**: solo un `import` desde `tools/`
   * (`tools/qa/partida-con-veterano.ts`), que es código que no se despliega.
   */
  readonly preparar?: (state: GameState) => void;
}

export interface TurnReport {
  readonly player: PlayerId;
  readonly by: 'agent' | 'heuristic';
  readonly actions: number;
  readonly problems: readonly string[];
}

export class Director {
  state: GameState;
  readonly ctx: GameContext;
  readonly agentPlayers: Set<PlayerId>;
  readonly log: string[] = [];
  /** Quién quiere ver cada acción, si alguien quiere. */
  private mirador: (() => void) | null;

  constructor(
    private readonly link: AgentLink,
    options: DirectorOptions = {},
  ) {
    const seed = options.seed ?? 20260823;
    this.state = newGame({
      seed,
      ...(options.plan === undefined ? {} : { plan: options.plan }),
      maxDays: options.maxDays,
    });
    this.ctx = { rng: createRng(seed ^ 0xa9e7) };
    this.agentPlayers = new Set(options.agentPlayers ?? [1]);
    this.mirador = options.onFrame ?? null;
    options.preparar?.(this.state);
  }

  /**
   * A qué veteranos de cada jugador se les ha preguntado ya **y siguen en la
   * base desde entonces**. Es estado del servidor y no del núcleo: «no volver a
   * preguntar» es una regla de conversación con el narrador, y sin narrador no
   * hay a quién no volver a preguntar. Por jugador, porque `porPreguntar` olvida
   * a quien no está en la base de quien pregunta, y con un conjunto compartido
   * cada jugador del agente le borraría los suyos al otro.
   */
  private readonly yaPreguntados = new Map<PlayerId, Set<string>>();
  /**
   * La firma (`firmaDeVoces`) con la que ya se le pidieron las voces de cada
   * base. Va aparte de `Town.voces` por lo que no llega: si el agente no
   * contesta, la base sigue caducada en el núcleo y sin esto se le volvería a
   * preguntar cada turno lo mismo que acaba de callar.
   */
  private readonly vocesPedidas = new Map<string, string>();

  /**
   * Un fotograma, si hay quien lo mire.
   *
   * El `catch` no está vacío ni se traga nada: **lo dice** y se desengancha. Un
   * observador es opcional por definición, y una partida —con el agente esperando
   * al otro lado del cable— no se puede caer porque a un mirón se le muera el
   * socket a mitad. Que deje de haber fotogramas se ve en la crónica del
   * director, que es lo que el espectador tiene delante.
   */
  private frame(): void {
    if (this.mirador === null) return;
    try {
      this.mirador();
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      this.mirador = null;
      this.note(`El espectador ha fallado y se deja de retransmitir (${motivo}).`);
    }
  }

  /**
   * Cómo acabó la partida, o `null` si sigue. Espejo de `Session.desenlace`.
   *
   * Contestaba `boolean`, y su único consumidor necesitaba acto seguido **el
   * objeto**: volvía a leer `state.finished` y añadía un `throw` para convencer
   * a `tsc` de algo que el bucle acababa de comprobar. Devolviendo lo que hay,
   * el `throw` sobra.
   */
  get desenlace(): { winner: PlayerId | null } | null {
    return this.state.finished;
  }

  /**
   * La batalla que nazca a mitad del turno de otro, ofrecida al agente.
   *
   * Es lo que rompe el nudo de «el agente solo decide en la mitad de sus
   * batallas»: el turno del rival era una llamada atómica a `core` que cerraba
   * por dentro las batallas que provocaba. El tipo vive en `core` y la
   * implementación aquí, así que el núcleo sigue sin saber que existe un
   * director.
   */
  private readonly takeover: BattleTakeover = () => this.playBattle();

  /** Juega el turno del jugador que toca. */
  async playTurn(): Promise<TurnReport> {
    const player = currentPlayer(this.state);
    const usaAgente = this.agentPlayers.has(player.id) && this.link.connected;

    if (!usaAgente) {
      // Aunque el turno sea del rival, el agente puede tener que DEFENDER lo
      // que ese turno le eche encima.
      // Y si la defensa la acaba resolviendo la IA —el agente no la quiso, o no
      // está—, pelea por él pero no se rinde: rendirse le cobra SU oro.
      await playAiTurn(this.state, this.ctx, {
        takeover: this.link.connected ? this.takeover : undefined,
        noSeRinden: this.agentPlayers,
      });
      return { player: player.id, by: 'heuristic', actions: 0, problems: [] };
    }

    try {
      return await this.playAgentTurn(player.id);
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      this.note(`El agente no pudo jugar el turno (${motivo}); toma el relevo la IA de reglas.`);
      // La partida no se detiene por un fallo del agente. Y sin takeover: si
      // acaba de fallar, no se le vuelve a preguntar dentro del mismo turno.
      if (this.state.pendingBattle !== null) {
        resolvePendingBattle(this.state, this.ctx, this.agentPlayers);
      }
      await playAiTurn(this.state, this.ctx, { noSeRinden: this.agentPlayers });
      return { player: player.id, by: 'heuristic', actions: 0, problems: [motivo] };
    }
  }

  /**
   * Los veteranos de rango máximo que `player` tiene en su base se hacen héroes, si
   * el narrador quiere: uno a uno, un `hero_from_troop` por cada uno.
   *
   * Va al empezar el turno del agente, antes de `adventure_turn`, y no al llegar
   * a la base: el núcleo es síncrono y no puede preguntar a mitad de un
   * `moveHero`, y desde fuera nadie distingue «al llegar» de «al empezar el día
   * siguiente allí», porque el héroe nace sin movimiento. Así un solo sitio cubre
   * la guarnición y la tropa de los héroes, y el héroe recién nacido ya sale en
   * el `adventure_turn` de este mismo turno.
   *
   * A cada veterano se le pregunta **una vez por estancia** (`porPreguntar`) y se
   * le recuerda haya salido bien o mal: una respuesta mala no se reintenta hasta
   * que salga y vuelva. Con el tope de héroes lleno no se pregunta nada y nadie
   * queda recordado: la tropa espera su sitio, y cuando lo haya se le preguntará.
   */
  private async ascensos(player: PlayerId): Promise<void> {
    const enBase = veteranosEnSuBase(this.state, player);
    if (enBase.length === 0) {
      // Nadie en la base: no hay a quién recordar, y el jugador sin veteranos
      // —casi todos los turnos— no deja una entrada vacía en el mapa.
      this.yaPreguntados.delete(player);
      return;
    }
    const { preguntar, recordar } = porPreguntar(
      enBase,
      this.yaPreguntados.get(player) ?? new Set(),
    );
    this.yaPreguntados.set(player, recordar);

    for (const preguntado of preguntar) {
      const id = preguntado.veterania.id;
      // Se vuelve a localizar antes de cada petición: un ascenso anterior de
      // este mismo bucle mueve la guarnición —el héroe de la casilla la
      // recoge—, y con ella al veterano que esperaba en ella. Con la foto de
      // antes, la petición le diría al narrador que sigue en la guarnición.
      const v = veteranosEnSuBase(this.state, player).find((x) => x.veterania.id === id);
      if (v === undefined) continue;
      if (!hayHuecoDeHeroe(this.state, player)) {
        this.note(
          `Hay veteranos de rango ${RANGO_MAXIMO_DE_TROPA} esperando en la base del jugador ${player}, pero no le cabe otro héroe: no se pregunta.`,
        );
        return;
      }
      recordar.add(id);

      // Si `ask` lanza —plazo agotado, esquema malo, canal caído— el enlace ya
      // se lo ha dicho al agente con su nota (`notaSinRespuesta`,
      // `notaRespuestaInvalida`); aquí solo queda contarlo en la crónica del
      // director y seguir: un ascenso que no sale no detiene el turno.
      const respuesta = await this.link
        .ask('hero_from_troop', serializeHeroFromTroop(this.state, player, v))
        .catch((err: unknown) => {
          this.note(
            `El veterano ${id} no se hace héroe: ${err instanceof Error ? err.message : String(err)}`,
          );
          return null;
        });
      if (respuesta === null) continue;
      if (respuesta.data.reasoning !== undefined) this.note(`Agente: ${respuesta.data.reasoning}`);

      try {
        const heroe = ascenderVeterano(this.state, player, id, respuesta.data);
        this.frame();
        this.note(`${heroe.name} se hace héroe (era el veterano ${id}).`);
        this.link.report(
          respuesta.requestId,
          true,
          undefined,
          notaAscenso(heroe, rangoDeHeroe(heroe), v.base.name, {
            enElCastillo: pointKey(heroe.at) === pointKey(v.base.at),
            tropa: heroe.army.length,
          }),
        );
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        this.note(`El veterano ${id} no se hace héroe: ${motivo}`);
        this.link.report(respuesta.requestId, false, [motivo], notaAscensoRechazado(id));
      }
    }
  }

  /**
   * Las voces de las bases de `player` que caducaron —semana nueva o algo
   * construido—, en **una** petición `town_voices` con todas, no una por base:
   * el agente hace un `adventure_turn` por día, y una por base lo multiplicaría.
   *
   * Va después de los ascensos (que cambian quién hay en la base) y antes del
   * turno. Como el ascenso, un fallo —plazo agotado, esquema malo— se anota y no
   * detiene nada: la gente dice sus frases de siempre y la base no se vuelve a
   * pedir hasta que cambie su firma (`vocesPedidas`).
   */
  private async voces(player: PlayerId): Promise<void> {
    const semana = week(this.state);
    const caducadas = townsOf(this.state, player).filter(
      (t) => vocesCaducadas(t, semana) && this.vocesPedidas.get(t.id) !== firmaDeVoces(t, semana),
    );
    if (caducadas.length === 0) return;
    for (const t of caducadas) this.vocesPedidas.set(t.id, firmaDeVoces(t, semana));

    const respuesta = await this.link
      .ask('town_voices', serializeTownVoices(this.state, player, caducadas))
      .catch((err: unknown) => {
        this.note(
          `Las voces de ${caducadas.map((t) => t.name).join(', ')} no llegan: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });
    if (respuesta === null) return;
    if (respuesta.data.reasoning !== undefined) this.note(`Agente: ${respuesta.data.reasoning}`);

    const rechazos: string[] = [];
    let aceptadas = 0;
    let bases = 0;
    const porBase = new Map<string, { npc: string; lines: string[] }[]>();
    for (const v of respuesta.data.voices) {
      if (!caducadas.some((t) => t.id === v.town)) {
        rechazos.push(
          `${v.town}/${v.npc}: "${v.town}" no es una de las bases que se te han pedido (${caducadas.map((t) => t.id).join(', ')})`,
        );
        continue;
      }
      const lista = porBase.get(v.town) ?? [];
      lista.push({ npc: v.npc, lines: v.lines });
      porBase.set(v.town, lista);
    }
    // Todas las pedidas, también las que no traen ninguna voz: su firma se
    // apunta igual y su gente vuelve a las frases de siempre.
    for (const t of caducadas) {
      const r = ponerVoces(t, player, semana, porBase.get(t.id) ?? []);
      aceptadas += r.aceptadas;
      if (r.aceptadas > 0) bases++;
      rechazos.push(...r.rechazos.map((m) => `${t.id}/${m}`));
    }
    this.frame();
    this.note(`Voces de ${bases} base(s): ${aceptadas} línea(s), ${rechazos.length} rechazo(s).`);
    this.link.report(
      respuesta.requestId,
      rechazos.length === 0,
      rechazos.length === 0 ? undefined : rechazos,
      notaVoces(aceptadas, bases, rechazos.length),
    );
  }

  private async playAgentTurn(playerId: PlayerId): Promise<TurnReport> {
    await this.ascensos(playerId);
    await this.voces(playerId);
    // El día se anota antes: `end_turn` puede pasar de día y la nota tiene que
    // hablar del turno que el agente acaba de jugar, no del siguiente.
    const dia = this.state.day;
    const respuesta = await this.link.ask(
      'adventure_turn',
      serializeAdventureTurn(this.state, playerId),
    );
    const plan = respuesta.data;
    if (plan.reasoning !== undefined) this.note(`Agente: ${plan.reasoning}`);

    const problems: string[] = [];
    // Las marchas que anduvieron sin llegar (#121): entran, y van aparte de los
    // rechazos para no mezclar en `problems` un veredicto con un descarte.
    const parciales: string[] = [];
    let aplicadas = 0;

    /** Lo que ya no se va a intentar, contado una por una y con su motivo. */
    const descartar = (resto: readonly unknown[], motivo: string): void => {
      for (const a of resto) problems.push(`${describeAccion(a as AccionDelAgente)}: ${motivo}`);
    };

    for (const [i, accion] of plan.actions.entries()) {
      if (this.state.finished !== null) {
        descartar(plan.actions.slice(i), MOTIVO_PARTIDA_TERMINADA);
        break;
      }
      if (accion.type === 'end_turn') {
        // El `end_turn` sí se honra —el turno se cierra abajo—, así que cuenta
        // como aplicada. Lo que venía DETRÁS no se aplica y antes desaparecía en
        // silencio: `problems` volvía vacío y la nota decía «aplicado entero».
        aplicadas++;
        descartar(plan.actions.slice(i + 1), MOTIVO_TRAS_END_TURN);
        break;
      }

      const a = accion as AccionDelAgente;
      const desde = this.state.log.length;
      try {
        // Dentro del `try`: un `slot` que no es un hueco del contrato descarta
        // esta acción con su motivo (`huecoDelSlot`), no el turno.
        applyAdventureAction(this.state, accionDelAgente(a), this.ctx, playerId);
        aplicadas++;
        this.frame();
      } catch (err) {
        // Una acción ilegal se descarta y se le cuenta al agente, tal y como
        // promete el contrato; las siguientes siguen aplicándose.
        problems.push(`${describeAccion(a)}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      // Si la marcha se quedó sin llegar lo dice el núcleo con un hecho —le
      // faltaron puntos, vio un grupo que la emboscaría o la emboscaron—; aquí
      // solo se busca y se cuenta.
      if (a.type === 'move_hero') {
        const parada = paradaDeLaMarcha(a, this.state.log.slice(desde));
        if (parada !== null) parciales.push(notaMarchaParcial(a, parada));
      }

      if (this.state.pendingBattle !== null) {
        await this.playBattle();
        // Si nadie la tomó, la cierra la IA: dejarla pendiente reventaría todas
        // las acciones que quedaran del turno con «hay una batalla pendiente».
        if (this.state.pendingBattle !== null) {
          resolvePendingBattle(this.state, this.ctx, this.agentPlayers);
        }
        // Y un fotograma al cerrarla: el de la última acción todavía la enseñaba
        // en pie, así que sin este el tablero se quedaría con la batalla puesta
        // hasta la siguiente acción del mapa.
        this.frame();
      }
    }

    if (this.state.finished === null) {
      applyAdventureAction(this.state, { type: 'end_turn' }, this.ctx, playerId);
      this.frame();
    }

    if (problems.length > 0) this.note(`Acciones rechazadas: ${problems.length}`);
    // El veredicto sale SIEMPRE, también cuando salió perfecto: un silencio es
    // ambiguo en un canal que puede perder mensajes.
    this.link.report(
      respuesta.requestId,
      true,
      problems.length > 0 ? problems : undefined,
      // Intentadas es exactamente lo que entró más lo que se rechazó: un
      // segundo contador que subir en el orden correcto dentro de un bucle con
      // `continue` miente el día que alguien meta un `break`.
      notaTurnoAventura(dia, aplicadas, aplicadas + problems.length, problems, parciales),
    );
    return { player: playerId, by: 'agent', actions: aplicadas, problems };
  }

  /**
   * Juega la batalla pendiente: el agente lleva los bandos que sean suyos y la
   * IA de reglas el resto. Con los dos bandos suyos se le pregunta por separado,
   * cada uno con su propio `battle_turn`.
   */
  private async playBattle(): Promise<void> {
    const pending = this.state.pendingBattle;
    if (pending === null) return;
    // Qué bandos son suyos lo dice el núcleo, que es donde vive `battleOwners`:
    // esto lo derivaba aquí y la consulta `battle_state` por su cuenta, y las
    // dos copias ya discrepaban con un jugador que llevara los dos bandos.
    const bandos = sidesOwnedBy(this.state, pending, this.agentPlayers);
    // No es asunto del agente: se devuelve sin cerrarla y la cierra quien la
    // abrió, que es el contrato del takeover.
    if (bandos.size === 0) return;

    const battle = pending.battle;
    // De quién es cada bando, para leer su oro: el turno de batalla lo lleva,
    // porque sin él el precio de rendirse no se puede comparar con nada.
    const dueños = battleOwners(this.state, pending);
    let guard = 0;

    while (battle.finished === null && guard < MAX_JUGADAS) {
      guard++;
      const s = activeStack(battle);
      if (s === null) break;

      if (!bandos.has(s.side)) {
        applyAction(battle, chooseBattleAction(battle), this.ctx.rng);
        this.frame();
        continue;
      }

      // El `catch` devuelve `null` en vez de asignar a un `let` sin tipo: así
      // `respuesta` queda tipada por lo que promete `ask` —el esquema zod de
      // `battle_turn`— en lugar de ser un `any` que se va ensanchando.
      const respuesta = await this.link
        // Vista propia siempre: `s` ES el stack activo y `s.side` su bando, así
        // que aquí quien pregunta es quien manda.
        .ask(
          'battle_turn',
          serializeBattleTurn(battle, s.side, 'propia', this.oroDe(dueños[s.side])),
        )
        .catch((err: unknown) => {
          this.note(
            `El agente falló en la batalla (${err instanceof Error ? err.message : String(err)}); la termina la IA.`,
          );
          return null;
        });
      if (respuesta === null) break;

      const accion = respuesta.data.action as BattleAction;
      // El turno de antes, para comparar su ordinal con el de después: si es el
      // mismo, la acción ha dejado el turno abierto.
      const turnoAntes = battle.turno;
      try {
        applyAction(battle, accion, this.ctx.rng);
        this.frame();
        this.link.report(
          respuesta.requestId,
          true,
          undefined,
          notaAccionAceptada(s.id, accion, precioPagado(battle), turnoAbierto(battle, turnoAntes)),
        );
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        this.note(`Acción de batalla rechazada: ${motivo}`);
        // Para no bloquear el turno se juega la de la heurística — y se MIDE lo
        // que cuesta antes de contárselo: un `cast` sustituto no consume el
        // turno del stack, gasta el maná del héroe. Suponerlo mentiría en una
        // de cada cuatro sustituciones.
        // Y nunca una rendición: la sustituta la elige la IA, y rendirse cuesta
        // un oro que solo puede gastar el agente (H-1 de la fase 1b).
        const sustituta = chooseBattleAction(battle, bandos);
        const heroe = battle.heroes[s.side];
        const manaAntes = heroe?.mana ?? 0;
        applyAction(battle, sustituta, this.ctx.rng);
        this.frame();
        const manaGastado = manaAntes - (heroe?.mana ?? 0);
        // Si la sustituta remató, la promesa del `cast` —«se te volverá a pedir
        // acción para ella»— sería falsa: el bucle sale por `battle.finished` y
        // no hay más peticiones. También se mide, no se supone.
        this.link.report(
          respuesta.requestId,
          false,
          [motivo],
          notaAccionSustituida(
            s.id,
            motivo,
            sustituta,
            manaGastado,
            heroe?.name ?? null,
            battle.finished !== null,
            turnoAbierto(battle, turnoAntes),
          ),
        );
      }
    }

    if (battle.finished === null) {
      resolvePendingBattle(this.state, this.ctx, this.agentPlayers);
    } else {
      settleBattle(this.state, this.ctx);
    }
  }

  /** El oro de quien lleva un bando del agente: siempre es un jugador, nunca un monstruo. */
  private oroDe(dueño: PlayerId | null): number {
    if (dueño === null)
      throw new Error('un bando del agente sin dueño: el agente no lleva monstruos');
    return playerById(this.state, dueño).resources.gold;
  }

  private note(line: string): void {
    this.log.push(line);
    console.log(`[director] ${line}`);
  }
}

/**
 * Si el turno de la unidad sigue abierto tras la acción, con lo que le queda; o
 * `null` si se cerró. Se mide con el ordinal (`mismoTurno`): la moral extra abre
 * uno NUEVO para la misma unidad, y eso es otro turno, no el mismo.
 */
function turnoAbierto(battle: BattleState, antes: TurnoDeUnidad | null): TurnoAbierto | null {
  if (!mismoTurno(antes, battle.turno)) return null;
  const s = activeStack(battle);
  if (s === null) return null;
  return { pasos: pasosQueQuedan(battle, s) };
}

/**
 * Lo que costó la rendición que acaba de cerrar `battle`, o `null` si no la hubo.
 *
 * Es una función y no `battle.finished?.surrender` en línea porque dentro del
 * bucle de `playBattle` `tsc` tiene `finished` estrechado a `null` por la
 * condición del `while`, y no sabe que `applyAction` lo acaba de escribir.
 */
function precioPagado(battle: BattleState): number | null {
  return battle.finished?.surrender?.gold ?? null;
}
