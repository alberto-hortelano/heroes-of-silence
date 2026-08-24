/**
 * Sesión de juego del cliente.
 *
 * Es la única puerta del cliente al núcleo: las vistas piden cosas aquí y
 * pintan lo que devuelve, nunca tocan el `GameState` por su cuenta. Cuando
 * llegue el bridge por WebSocket, lo que cambia es esta capa y solo esta.
 */
import { chooseBattleAction } from '@core/ai/tactics.js';
import { playAiTurn } from '@core/ai/turn.js';
import {
  applyAction,
  castBlocker,
  legalActions,
  movableHexes,
  activeStack,
} from '@core/battle/battle.js';
import { spell } from '@core/battle/spells.js';
import type { BattleAction, BattleStack, BattleState } from '@core/battle/types.js';
import { findPath, type PathStep } from '@core/map/map.js';
import { createRng } from '@core/rng.js';
import {
  applyAdventureAction,
  currentPlayer,
  heroById,
  heroesOf,
  resolvePendingBattle,
  settleBattle,
  townById,
  townsOf,
  type GameContext,
  type GameState,
} from '@core/state/game.js';
import { newGame } from '@core/state/setup.js';
import type { Hex, Point } from '@core/types.js';

export type Scene = 'adventure' | 'town' | 'battle';

/** Una entrada del libro de hechizos tal y como la pinta el panel de batalla. */
export interface SpellOption {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  /** Stacks sobre los que se puede lanzar ahora mismo, según `legalActions`. */
  readonly targets: readonly string[];
  readonly castable: boolean;
  /** Por qué no se puede lanzar, escrito para la persona. Vacío si sí se puede. */
  readonly motivo: string;
}

export class Session {
  state: GameState;
  readonly ctx: GameContext;
  /** El jugador que maneja la persona sentada delante. */
  readonly viewer = 0;
  scene: Scene = 'adventure';
  selectedHeroId: string | null = null;
  /**
   * Hechizo que la persona ha elegido y está a punto de lanzar sobre alguien.
   * Vive aquí y no en `main.ts` porque lo lee también el panel; `main.ts` solo
   * guarda estado de píxel.
   */
  selectedSpell: string | null = null;
  openTownId: string | null = null;
  revealAll = false;
  status = '';

  constructor(seed: number) {
    this.state = newGame({ seed, controllers: { 0: 'human', 1: 'ai' } });
    this.ctx = { rng: createRng(seed ^ 0x5eed) };
    this.selectedHeroId = heroesOf(this.state, this.viewer)[0]?.id ?? null;
  }

  // ------------------------------------------------------------ consultas

  get isPlayersTurn(): boolean {
    return this.state.current === this.viewer && this.state.finished === null;
  }

  get selectedHero() {
    if (this.selectedHeroId === null) return null;
    return this.state.heroes.find((h) => h.id === this.selectedHeroId) ?? null;
  }

  myHeroes() {
    return heroesOf(this.state, this.viewer);
  }

  myTowns() {
    return townsOf(this.state, this.viewer);
  }

  get resources() {
    return this.state.players.find((p) => p.id === this.viewer)!.resources;
  }

  /** Ruta que seguiría el héroe seleccionado hasta `to`, para previsualizarla. */
  previewPath(to: Point): PathStep[] {
    const hero = this.selectedHero;
    if (hero === null || !this.isPlayersTurn) return [];
    const camino = findPath(this.state.map, hero.at, to);
    if (camino === null) return [];
    return camino.filter((paso) => paso.cost <= hero.movePoints);
  }

  // ------------------------------------------------------------ aventura

  /** Selecciona lo que haya en la casilla, o mueve el héroe hasta ella. */
  clickTile(p: Point): void {
    if (!this.isPlayersTurn) {
      this.status = 'Espera tu turno.';
      return;
    }

    const heroeAqui = this.myHeroes().find((h) => h.at.x === p.x && h.at.y === p.y);
    if (heroeAqui !== undefined && heroeAqui.id !== this.selectedHeroId) {
      this.selectedHeroId = heroeAqui.id;
      this.status = `${heroeAqui.name} seleccionado.`;
      return;
    }

    const puebloAqui = this.myTowns().find((t) => t.at.x === p.x && t.at.y === p.y);
    const heroSeleccionado = this.selectedHero;
    if (puebloAqui !== undefined && (heroSeleccionado === null || sameTile(heroSeleccionado.at, p))) {
      this.openTown(puebloAqui.id);
      return;
    }

    if (heroSeleccionado === null) {
      this.status = 'No tienes ningún héroe seleccionado.';
      return;
    }

    this.moveHeroTo(heroSeleccionado.id, p);
  }

  moveHeroTo(heroId: string, to: Point): void {
    const hero = heroById(this.state, heroId);
    const camino = findPath(this.state.map, hero.at, to);
    if (camino === null || camino.length === 0) {
      this.status = 'No hay camino hasta ahí.';
      return;
    }

    // Se avanza hasta donde alcance el movimiento del día.
    const alcanzable = camino.filter((paso) => paso.cost <= hero.movePoints);
    if (alcanzable.length === 0) {
      this.status = 'No te quedan puntos de movimiento para dar ni un paso.';
      return;
    }

    const destino = alcanzable.at(-1)!.at;
    try {
      applyAdventureAction(this.state, { type: 'move_hero', hero: heroId, to: destino }, this.ctx);
      this.status = '';
    } catch (err) {
      this.status = mensaje(err);
      return;
    }

    if (this.state.pendingBattle !== null) {
      this.scene = 'battle';
      this.status = '¡Batalla!';
      // Si la iniciativa la tiene el enemigo, mueve él primero: sin esto la
      // batalla se quedaba esperando a una persona que no podía hacer nada.
      this.advanceEnemyTurns();
      return;
    }

    const pueblo = this.myTowns().find((t) => sameTile(t.at, destino));
    if (pueblo !== undefined) this.openTown(pueblo.id);
  }

  endTurn(): void {
    if (!this.isPlayersTurn) return;
    try {
      applyAdventureAction(this.state, { type: 'end_turn' }, this.ctx);
    } catch (err) {
      this.status = mensaje(err);
      return;
    }
    this.runAiTurns();
  }

  /** Deja que los rivales jueguen hasta que vuelva a tocarle a la persona. */
  private runAiTurns(): void {
    let guard = 0;
    while (this.state.finished === null && !this.isPlayersTurn && guard < 20) {
      playAiTurn(this.state, this.ctx);
      guard++;
    }
    if (this.state.finished !== null) {
      this.status =
        this.state.finished.winner === this.viewer
          ? '¡Victoria! Has conquistado el mapa.'
          : 'Derrota: el enemigo se ha quedado con todo.';
    } else {
      this.selectedHeroId = this.myHeroes()[0]?.id ?? null;
    }
  }

  // ------------------------------------------------------------ castillo

  openTown(townId: string): void {
    this.openTownId = townId;
    this.scene = 'town';
  }

  closeTown(): void {
    this.openTownId = null;
    this.scene = 'adventure';
    // El último rótulo del castillo hablaba de solares y reclutas: fuera de
    // allí no significa nada.
    this.status = '';
  }

  /** El castillo abierto ahora mismo, o `null` si no hay ninguno. */
  get activeTown(): ReturnType<typeof townById> | null {
    if (this.openTownId === null) return null;
    return townById(this.state, this.openTownId);
  }

  build(buildingId: string): void {
    if (this.openTownId === null) return;
    this.run(() =>
      applyAdventureAction(
        this.state,
        { type: 'build', town: this.openTownId as string, building: buildingId },
        this.ctx,
      ),
    );
  }

  recruit(creatureId: string, count: number): void {
    if (this.openTownId === null || count <= 0) return;
    this.run(() =>
      applyAdventureAction(
        this.state,
        { type: 'recruit', town: this.openTownId as string, creature: creatureId, count },
        this.ctx,
      ),
    );
  }

  hireHero(): void {
    if (this.openTownId === null) return;
    this.run(() =>
      applyAdventureAction(
        this.state,
        { type: 'hire_hero', town: this.openTownId as string },
        this.ctx,
      ),
    );
  }

  // ------------------------------------------------------------ batalla

  get battle() {
    return this.state.pendingBattle?.battle ?? null;
  }

  /**
   * La batalla y su stack activo, pero solo cuando el turno es de verdad de la
   * persona. Son las cuatro guardas de «¿me toca?», escritas una vez: estaban
   * copiadas en `battleMovable` y en `spellOptions`.
   */
  private get turnoPropio(): { battle: BattleState; stack: BattleStack } | null {
    const battle = this.battle;
    if (battle === null || battle.finished !== null) return null;
    const stack = activeStack(battle);
    if (stack === null || stack.side !== 'attacker') return null;
    return { battle, stack };
  }

  /** Hexes a los que puede ir el stack activo, si es de la persona. */
  battleMovable(): Hex[] {
    const turno = this.turnoPropio;
    return turno === null ? [] : movableHexes(turno.battle, turno.stack);
  }

  battleLegalActions(): BattleAction[] {
    const battle = this.battle;
    if (battle === null || battle.finished !== null) return [];
    return legalActions(battle);
  }

  /** El héroe de la persona en la batalla en curso. */
  get battleHero() {
    return this.battle?.heroes.attacker ?? null;
  }

  /**
   * El libro de hechizos tal y como se pinta: qué se puede lanzar ahora mismo y,
   * si no, por qué.
   *
   * `castable` no recalcula ninguna regla: es «existe un `cast` de este hechizo
   * entre las acciones legales». Y el motivo lo escribe el núcleo
   * (`castBlocker`), igual que el del castillo sale de `buildBlocker`.
   */
  spellOptions(): SpellOption[] {
    const turno = this.turnoPropio;
    if (turno === null) return [];
    const hero = this.battleHero;
    // Un héroe sin libro no necesita que se le calculen las acciones legales, que
    // es lo caro: sin esto, uno contratado sin gremio pagaba el recorrido entero
    // en cada fotograma para pintar «no conoce ninguno».
    if (hero === null || hero.spells.length === 0) return [];

    const acciones = this.battleLegalActions();
    return hero.spells.map((id) => {
      const sp = spell(id);
      // Un solo predicado para las tres preguntas —sobre quién, si se puede, y
      // por qué no—: el par (hechizo, objetivo) sale de la lista legal y el
      // motivo lo escribe el núcleo.
      const targets = acciones.flatMap((a) =>
        a.type === 'cast' && a.spell === id && a.target !== undefined ? [a.target] : [],
      );
      const castable = targets.length > 0;
      // Con `castable` verdadero el bloqueo es `null` por construcción, así que
      // solo se pregunta cuando hace falta. Y si no lo es, el núcleo TIENE que
      // dar motivo: las dos respuestas salen de la misma función.
      const motivo = castable ? '' : castBlocker(turno.battle, 'attacker', id);
      if (motivo === null) {
        throw new Error(`${sp.name} no se ofrece y el núcleo no dice por qué`);
      }
      return { id, name: sp.name, cost: sp.cost, targets, castable, motivo };
    });
  }

  /**
   * Por qué el hechizo elegido no se puede lanzar sobre ese stack.
   *
   * Apuntar mal es una regla del juego —a un aliado, a un inmune, a un muerto—,
   * así que la frase la escribe el núcleo y la pantalla solo la enseña. Si el
   * par no está entre las acciones legales, el bloqueador TIENE motivo: son las
   * dos caras de la misma función.
   */
  castRejection(targetId: string): string {
    const turno = this.turnoPropio;
    const elegido = this.selectedSpell;
    if (turno === null || elegido === null) return '';
    const motivo = castBlocker(turno.battle, 'attacker', elegido, targetId);
    if (motivo === null) {
      throw new Error(`${spell(elegido).name} no se ofrece sobre ${targetId} y el núcleo no dice por qué`);
    }
    return motivo;
  }

  /** Ids de los stacks sobre los que se puede lanzar el hechizo elegido. */
  castTargets(): readonly string[] {
    const elegido = this.selectedSpell;
    if (elegido === null) return [];
    return this.spellOptions().find((o) => o.id === elegido)?.targets ?? [];
  }

  /** Elige hechizo, o lo suelta si ya estaba elegido. */
  selectSpell(spellId: string): void {
    if (this.selectedSpell === spellId) {
      this.clearSpell();
      return;
    }
    const opcion = this.spellOptions().find((o) => o.id === spellId);
    if (opcion === undefined) return;
    if (!opcion.castable) {
      this.status = `No puedes lanzar ${opcion.name}: ${opcion.motivo}.`;
      return;
    }
    this.selectedSpell = spellId;
    this.status = `${opcion.name}: elige sobre quién lanzarlo.`;
  }

  clearSpell(): void {
    if (this.selectedSpell === null) return;
    this.selectedSpell = null;
    this.status = '';
  }

  /** Aplica la acción de la persona y deja que la IA juegue lo suyo. */
  playBattleAction(action: BattleAction): void {
    const battle = this.battle;
    if (battle === null) return;
    try {
      applyAction(battle, action, this.ctx.rng);
      this.status = '';
    } catch (err) {
      this.status = mensaje(err);
      return;
    }
    // Una acción aplicada deja el hechizo elegido sin sentido: o se acaba de
    // lanzar —y el héroe ya no puede volver a lanzar esta ronda— o el stack
    // activo ha cambiado. Se suelta aquí y no en cada llamante.
    this.selectedSpell = null;
    this.advanceEnemyTurns();
  }

  /** Deja que la IA mueva mientras el turno sea del defensor. */
  advanceEnemyTurns(): void {
    const battle = this.battle;
    if (battle === null) return;
    let guard = 0;
    while (battle.finished === null && guard < 500) {
      const s = activeStack(battle);
      if (s === null || s.side === 'attacker') break;
      applyAction(battle, chooseBattleAction(battle), this.ctx.rng);
      guard++;
    }
    if (battle.finished !== null) this.status = 'La batalla ha terminado.';
  }

  /** Resuelve el resto de la batalla con la IA en ambos bandos. */
  autoResolveBattle(): void {
    if (this.state.pendingBattle === null) return;
    resolvePendingBattle(this.state, this.ctx);
    this.afterBattle();
  }

  /** Cierra la batalla terminada y vuelve al mapa. */
  finishBattle(): void {
    const battle = this.battle;
    if (battle === null || battle.finished === null) return;
    settleBattle(this.state, this.ctx);
    this.afterBattle();
  }

  private afterBattle(): void {
    this.scene = 'adventure';
    this.selectedSpell = null;
    if (this.selectedHero === null) {
      this.selectedHeroId = this.myHeroes()[0]?.id ?? null;
    }
    if (this.state.finished !== null) {
      this.status =
        this.state.finished.winner === this.viewer ? '¡Victoria!' : 'Derrota.';
    }
  }

  // ------------------------------------------------------------ interno

  private run(fn: () => void): void {
    try {
      fn();
      this.status = '';
    } catch (err) {
      this.status = mensaje(err);
    }
  }
}

function sameTile(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Los errores del núcleo llevan un mensaje escrito para la persona. */
function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
