/**
 * La marcha que se para al ver un grupo que la emboscaría (#130, `vigiaDeLaMarcha`,
 * `march_halted`) y la ruta que avisa (`emboscadaEnLaRuta`). Su revisión cuando
 * ganaba fuerza por el camino (H1 y H2 de QA de #130) se fue al fusionar con el
 * puesto fronterizo (05-11-2026): desde el 04-11-2026 la guarnición no se recoge
 * al pasar por casa, y la fuerza de una marcha no cambia a media marcha.
 *
 * Reescritos el 03-11-2026 (`docs/agents/2026-11-03-tests-sin-jugabilidad/`): los
 * de antes buscaban una semilla cuyos grupos del mapa pararan la marcha del día 1
 * y escribían a mano la tropa que la emboscaba, así que retocar una cifra del
 * catálogo cambiaba qué grupo embosca y se ponían rojos sin que la regla cambiara.
 * Aquí el mapa es el de una semilla, pero **los grupos se plantan** donde la regla
 * los pone a prueba y su tropa sale de la misma medida que mira la regla
 * (`poderDe` contra `fuerzaDe` con `ventajaClara`), sea cual sea el catálogo.
 */
import { describe, expect, it } from 'vitest';
import { Session } from '../src/client/sesion/partida.js';
import { fuerzaDe, poderDe, ventajaClara } from '../src/core/hero/fuerza.js';
import { pointFromKey, pointKey } from '../src/core/map/geometria.js';
import { objectAt } from '../src/core/map/map.js';
import { regionDeCasilla } from '../src/core/map/regiones.js';
import {
  asaltantesALaVista,
  emboscadaEnLaRuta,
  loQueLaPara,
} from '../src/core/state/asaltantes.js';
import { baseOf, heroById, heroesOf } from '../src/core/state/consultas.js';
import { cronicaPara } from '../src/core/state/events.js';
import { applyAdventureAction } from '../src/core/state/game.js';
import { alcanceDelHeroe, caminoHasta } from '../src/core/state/marcha.js';
import { newGame } from '../src/core/state/setup.js';
import type { GameState } from '../src/core/state/tipos.js';
import { visibleNow } from '../src/core/state/vision.js';
import type { GrupoDeTropa, Point } from '../src/core/types.js';
import { unidadesDelJuego } from '../src/core/unidad/catalogo.js';
import { ctx } from './comun.js';
import { costesDelAlcance } from './mapa-de-prueba.js';
import { copiaDePartida, fueraDeSuBase, guarnecer } from './partida-de-prueba.js';

/** Lo que mide un individuo de cada unidad del catálogo, de menos a más. */
function unidadesPorPoder(): readonly string[] {
  const poder = (id: string) => poderDe({ troops: [{ creature: id, count: 1 }] });
  return unidadesDelJuego()
    .map((u) => u.id)
    .sort((a, b) => poder(a) - poder(b));
}

/**
 * El menor grupo de una sola unidad cuya fuerza cumple `vale`: de la más floja si
 * hace falta afinar (cabe entre dos fuerzas), de la más fuerte si tiene que ser
 * corto (pelea, y una batalla no admite más que su tope).
 */
function grupoQue(vale: (poder: number) => boolean, de: 'floja' | 'fuerte'): GrupoDeTropa[] {
  const ids = unidadesPorPoder();
  const creature = de === 'floja' ? ids[0]! : ids.at(-1)!;
  for (let count = 1; count <= 5000; count++) {
    const troops = [{ creature, count }];
    if (vale(poderDe({ troops }))) return troops;
  }
  throw new Error(`ningún grupo de hasta 5000 de ${creature} tiene esa fuerza`);
}

/**
 * Una casilla libre de `region` que no pisa `ruta`, sin objeto ni héroe, que
 * cumple `vale`: donde plantar un grupo.
 */
function casillaLibre(
  state: GameState,
  region: number,
  ruta: readonly Point[],
  vale: (p: Point) => boolean,
): Point | null {
  const pisadas = new Set(ruta.map(pointKey));
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      const p = { x, y };
      if (regionDeCasilla(state.map, p) !== region || pisadas.has(pointKey(p))) continue;
      if (objectAt(state.map, p) !== undefined) continue;
      if (state.heroes.some((h) => pointKey(h.at) === pointKey(p))) continue;
      if (vale(p)) return p;
    }
  }
  return null;
}

/**
 * Lo que mira el jugador 0 tras cada paso de `ruta`, andándola de verdad en una
 * copia sin grupos, paso a paso: `visibleNow` es lo que pregunta la marcha
 * (`visibleNowAt`), y andándola se cuenta también lo que se descubre y los nodos
 * que se toman por el camino.
 */
function loQueSeVeTrasCadaPaso(
  state: GameState,
  heroId: string,
  ruta: readonly Point[],
  hasta: number,
  seed: number,
): ((p: Point) => boolean)[] {
  const copia = copiaDePartida(state);
  copia.raiders = [];
  const out: ((p: Point) => boolean)[] = [];
  for (let j = 0; j < hasta; j++) {
    applyAdventureAction(copia, { type: 'move_hero', hero: heroId, to: ruta[j]! }, ctx(seed), 0);
    if (pointKey(heroById(copia, heroId).at) !== pointKey(ruta[j]!)) {
      throw new Error(`el paso ${j} no llega a (${ruta[j]!.x},${ruta[j]!.y})`);
    }
    const ve = visibleNow(copia, 0);
    out.push((p) => ve.has(p));
  }
  return out;
}

/**
 * La marcha de prueba: el héroe del jugador 0, sin tropa, junto a su base, y una
 * ruta del día 1 que pisa primero la base, después una región `a` con una casilla libre que se ve al salir (`enA`) y
 * más adelante otra región `g` con una casilla libre que no se ve al salir y sí
 * tras el paso `pasoQueVeG`, anterior a pisar `g` (`enG`). Con un grupo en cada
 * casilla la ruta es la misma y ninguno se dispersa por el camino. La partida va
 * sin grupos y sin guarnición: cada test pone lo suyo.
 */
interface MarchaDePrueba {
  readonly seed: number;
  readonly state: GameState;
  readonly destino: Point;
  readonly ruta: readonly Point[];
  readonly enA: Point;
  readonly enG: Point;
  readonly pasoQueVeG: number;
}

function buscarLaMarcha(): MarchaDePrueba {
  for (let seed = 1; seed <= 40; seed++) {
    const state = newGame({ seed });
    state.raiders = [];
    const hero = fueraDeSuBase(state, 0);
    hero.army = [];
    const base = baseOf(state, 0)!;
    guarnecer(state, base, []);
    const alSalir = visibleNow(state, 0);
    for (const [clave, coste] of costesDelAlcance(alcanceDelHeroe(state, hero))) {
      if (coste === 0 || coste > hero.movePoints) continue;
      const destino = pointFromKey(clave);
      const camino = caminoHasta(state, hero, destino);
      if (camino === null || pointKey(camino[0]!.at) !== pointKey(base.at)) continue;
      const ruta = camino.map((p) => p.at);
      const regiones = ruta.map((p) => regionDeCasilla(state.map, p));
      const iA = regiones.findIndex((r, i) => i > 0 && r >= 0);
      if (iA < 0) continue;
      const a = regiones[iA]!;
      const iG = regiones.findIndex((r, i) => i > iA && r >= 0 && r !== a);
      if (iG < 0) continue;
      const enA = casillaLibre(state, a, ruta, (p) => alSalir.has(p));
      if (enA === null) continue;
      const seVe = loQueSeVeTrasCadaPaso(state, hero.id, ruta, iG, seed);
      const enG = casillaLibre(
        state,
        regiones[iG]!,
        ruta,
        (p) => !alSalir.has(p) && seVe.some((ve) => ve(p)),
      );
      if (enG === null) continue;
      const pasoQueVeG = seVe.findIndex((ve) => ve(enG));
      // Con los dos grupos plantados (sin tropa: no emboscan ni paran), la ruta
      // es la misma —son casillas hostiles— y los dos siguen ahí al llegar.
      const conGrupos = copiaDePartida(state);
      conGrupos.raiders = [
        { id: 'raider-a', at: enA, troops: [] },
        { id: 'raider-g', at: enG, troops: [] },
      ];
      const otra = caminoHasta(conGrupos, heroById(conGrupos, hero.id), destino);
      if (otra?.map((p) => pointKey(p.at)).join(' ') !== ruta.map(pointKey).join(' ')) continue;
      applyAdventureAction(
        conGrupos,
        { type: 'move_hero', hero: hero.id, to: destino },
        ctx(seed),
        0,
      );
      if (conGrupos.raiders.length !== 2) continue;
      return { seed, state, destino, ruta, enA, enG, pasoQueVeG };
    }
  }
  throw new Error(
    'ninguna marcha del día 1 de 40 semillas pasa por la base y luego por dos regiones',
  );
}

let laMarcha: MarchaDePrueba | undefined;
/** La marcha de prueba (se busca una vez) en una copia que cada test puede tocar. */
function marcha(): MarchaDePrueba & { readonly heroId: string } {
  laMarcha ??= buscarLaMarcha();
  const state = copiaDePartida(laMarcha.state);
  return { ...laMarcha, state, heroId: heroesOf(state, 0)[0]!.id };
}

describe('la marcha se para al descubrir un grupo que la emboscaría (#130)', () => {
  it('se queda donde lo ve, sin batalla, con lo andado gastado; y el grupo ya se ve', () => {
    const m = marcha();
    const { state } = m;
    const hero = heroById(state, m.heroId);
    const troops = grupoQue((p) => ventajaClara(p, fuerzaDe(hero)), 'fuerte');
    state.raiders = [{ id: 'raider-g', at: m.enG, troops }];
    const puntos = hero.movePoints;
    const camino = caminoHasta(state, hero, m.destino)!;
    // Al salir no se ve: la ruta no avisa, y la parada es la única ocasión de saberlo.
    const alSalir = asaltantesALaVista(state, visibleNow(state, 0));
    expect(alSalir).toEqual([]);
    expect(emboscadaEnLaRuta(state, hero, camino, alSalir)).toBeNull();
    const desde = state.log.length;

    applyAdventureAction(
      state,
      { type: 'move_hero', hero: hero.id, to: m.destino },
      ctx(m.seed),
      0,
    );

    const parada = state.log.at(-1)!;
    if (parada.kind !== 'march_halted') throw new Error(`acabó en ${parada.kind}`);
    // Donde lo ve: el primer paso desde el que se mira su casilla, antes de su región.
    const donde = m.ruta[m.pasoQueVeG]!;
    expect(parada).toMatchObject({ hero: hero.id, raider: 'raider-g', actor: 0, at: donde });
    expect(parada.troops).toEqual(troops);
    expect(hero.at).toEqual(donde);
    expect(regionDeCasilla(state.map, hero.at)).not.toBe(regionDeCasilla(state.map, m.enG));
    expect(state.pendingBattle).toBeNull();
    expect(state.log.slice(desde).some((e) => e.kind === 'battle_started')).toBe(false);
    // Lo andado cuenta: se ha gastado lo que cuesta llegar a donde se paró.
    expect(hero.movePoints).toBe(puntos - camino[m.pasoQueVeG]!.cost);
    // Y ahora se ve, por la misma regla que pinta el cliente y lee el agente.
    const vistos = asaltantesALaVista(state, visibleNow(state, 0));
    expect(vistos.map((r) => r.id)).toEqual(['raider-g']);
    // Desde donde se paró, la ruta ya avisa: quien la pide sabe lo que pisa.
    const resto = caminoHasta(state, hero, m.destino)!;
    expect(emboscadaEnLaRuta(state, hero, resto, vistos)?.raider.id).toBe('raider-g');
    // La crónica del dueño la cuenta: es su hecho.
    expect(cronicaPara(state, 0, 5).some((e) => e.kind === 'march_halted')).toBe(true);
  });

  it('el grupo que la ruta avisa al salir no la para: quien la pidió lo vio, y es la emboscada', () => {
    const m = marcha();
    const { state } = m;
    const hero = heroById(state, m.heroId);
    const troops = grupoQue((p) => ventajaClara(p, fuerzaDe(hero)), 'fuerte');
    state.raiders = [{ id: 'raider-a', at: m.enA, troops }];
    const vistos = asaltantesALaVista(state, visibleNow(state, 0));
    const camino = caminoHasta(state, hero, m.destino)!;
    expect(emboscadaEnLaRuta(state, hero, camino, vistos)?.raider.id).toBe('raider-a');
    const desde = state.log.length;

    applyAdventureAction(
      state,
      { type: 'move_hero', hero: hero.id, to: m.destino },
      ctx(m.seed),
      0,
    );

    const hechos = state.log.slice(desde);
    expect(hechos.some((e) => e.kind === 'march_halted')).toBe(false);
    expect(hechos.find((e) => e.kind === 'battle_started')).toMatchObject({
      attacker: { kind: 'raider', raiderId: 'raider-a' },
    });
    // Donde la ruta decía: al pisar su región.
    expect(regionDeCasilla(state.map, hero.at)).toBe(regionDeCasilla(state.map, m.enA));
  });

  it('un grupo que ya se ve al salir no para nada: pedir la misma marcha otra vez es la emboscada', () => {
    const m = marcha();
    const { state } = m;
    const hero = heroById(state, m.heroId);
    const troops = grupoQue((p) => ventajaClara(p, fuerzaDe(hero)), 'fuerte');
    state.raiders = [{ id: 'raider-g', at: m.enG, troops }];
    applyAdventureAction(
      state,
      { type: 'move_hero', hero: hero.id, to: m.destino },
      ctx(m.seed),
      0,
    );
    expect(state.log.at(-1)).toMatchObject({ kind: 'march_halted', raider: 'raider-g' });
    const desde = state.log.length;

    applyAdventureAction(
      state,
      { type: 'move_hero', hero: hero.id, to: m.destino },
      ctx(m.seed),
      0,
    );

    const hechos = state.log.slice(desde);
    expect(hechos.some((e) => e.kind === 'march_halted')).toBe(false);
    expect(hechos.find((e) => e.kind === 'battle_started')).toMatchObject({
      attacker: { kind: 'raider', raiderId: 'raider-g' },
    });
    expect(state.pendingBattle).not.toBeNull();
    // La emboscada es al pisar su región, no antes.
    expect(regionDeCasilla(state.map, hero.at)).toBe(regionDeCasilla(state.map, m.enG));
  });

  it('un grupo que no le saca el margen no la para: anda entero', () => {
    const m = marcha();
    const { state } = m;
    const hero = heroById(state, m.heroId);
    const suya = fuerzaDe(hero);
    // El mayor grupo de lo más flojo que aún no le saca el margen: uno menos que el
    // menor que sí.
    const [justo] = grupoQue((p) => ventajaClara(p, suya), 'floja');
    expect(justo!.count, 'uno solo de lo más flojo ya le saca el margen').toBeGreaterThan(1);
    const troops = [{ ...justo!, count: justo!.count - 1 }];
    expect(ventajaClara(poderDe({ troops }), suya)).toBe(false);
    state.raiders = [{ id: 'raider-g', at: m.enG, troops }];

    applyAdventureAction(
      state,
      { type: 'move_hero', hero: hero.id, to: m.destino },
      ctx(m.seed),
      0,
    );

    expect(state.log.some((e) => e.kind === 'march_halted' || e.kind === 'battle_started')).toBe(
      false,
    );
    expect(hero.at).toEqual(m.destino);
  });
});

describe('la parada en la sesión (#130)', () => {
  it('la sesión ve los grupos con la regla del núcleo, y la barra dice por qué se para el héroe', () => {
    const m = marcha();
    const hero = heroById(m.state, m.heroId);
    const troops = grupoQue((p) => ventajaClara(p, fuerzaDe(hero)), 'fuerte');
    m.state.raiders = [{ id: 'raider-g', at: m.enG, troops }];
    m.state.players[0]!.controller = 'human';
    // La sesión de la misma semilla, con la partida de la prueba (la misma, con el
    // grupo plantado y el héroe junto a su base).
    const s = new Session(m.seed);
    s.state = m.state;
    expect(s.asaltantesALaVista()).toEqual([]);

    s.moveHeroTo(hero.id, m.destino);

    expect(s.state.log.at(-1)?.kind).toBe('march_halted');
    expect(s.status).toBe(`${hero.name} se detiene: ${loQueLaPara(troops)}.`);
    // La caché de la sesión no se queda con los de antes de andar, y es la regla del núcleo.
    expect(s.asaltantesALaVista().map((r) => r.id)).toEqual(['raider-g']);
    expect(s.asaltantesALaVista().map((r) => r.id)).toEqual(
      asaltantesALaVista(s.state, visibleNow(s.state, s.viewer)).map((r) => r.id),
    );
  });
});
