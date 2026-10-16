/**
 * Lo que ve quien juega en el mapa (#64): los héroes que se miran AHORA y los
 * objetos como se SABEN, con la misma regla que el agente.
 *
 * El lienzo pintaba `state.heroes` y `map.objects` recortados por `fog` —«lo
 * exploré alguna vez»—: el rival se veía andar por cualquier casilla pisada
 * alguna vez, y la bandera de un nodo lejano cambiaba de color delante de los
 * ojos. La regla la escriben `heroesALaVista` y `objetosConocidos` en el núcleo;
 * el agente, la sesión (lienzo, minimapa, barra) y la crónica la leen. Que el
 * lienzo pinte lo que la sesión le da lo mira `mapa-pintado.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { EscenaAventura } from '../src/client/escenas/aventura.js';
import { casillaAPixel, centrarEn, TILE_INICIAL } from '../src/client/render/camara-mapa.js';
import { Session } from '../src/client/session.js';
import { serializeAdventureTurn } from '../src/core/contract/serialize.js';
import { sinSello, visibleTo } from '../src/core/state/events.js';
import {
  type GameState,
  heroesALaVista,
  heroesOf,
  objetosConocidos,
  revealEverything,
  visibleNow,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import type { Point } from '../src/core/types.js';

// La 1 (la 92 hasta las fronteras onduladas de #229: la ruta a su nodo lejano
// cruzaba la región de un grupo y la barra empezaba por el aviso, no por el paso).
const SEMILLA = 1;

/**
 * Una casilla explorada que nadie del jugador 0 mira ahora, a la vista de la
 * cámara centrada en su héroe (a menos de `cerca` casillas): justo donde el
 * lienzo de antes pintaba al rival.
 */
function exploradaSinMirar(state: GameState, desde: Point, cerca = 8): Point {
  const mirando = visibleNow(state, 0);
  const fog = state.players[0]!.fog;
  for (let d = 1; d <= cerca; d++)
    for (let dy = -d; dy <= d; dy++)
      for (let dx = -d; dx <= d; dx++) {
        const p = { x: desde.x + dx, y: desde.y + dy };
        if (fog.has(p) && !mirando.has(p)) return p;
      }
  throw new Error(`no hay casilla explorada y sin mirar a ${cerca} de (${desde.x}, ${desde.y})`);
}

/** El nodo más cercano a `desde` que el jugador 0 recuerda y no mira ahora. */
function nodoRecordadoSinMirar(state: GameState) {
  const mirando = visibleNow(state, 0);
  const nodo = state.map.objects.find(
    (o) =>
      o.kind === 'node' &&
      state.players[0]!.memory.has(o.id) &&
      !mirando.has(o.at) &&
      o.owner === null,
  );
  if (nodo === undefined || nodo.kind !== 'node') throw new Error('sin nodo recordado y lejano');
  return nodo;
}

describe('el núcleo: qué héroe se ve y qué se sabe de un objeto', () => {
  it('un héroe rival en casilla explorada y sin mirar no se ve; al lado de uno mío, sí', () => {
    const state = newGame({ seed: SEMILLA });
    revealEverything(state, 0);
    const mio = heroesOf(state, 0)[0]!;
    const suyo = heroesOf(state, 1)[0]!;
    suyo.at = exploradaSinMirar(state, mio.at);
    expect(state.players[0]!.fog.has(suyo.at)).toBe(true);

    const ids = () => heroesALaVista(state, 0, visibleNow(state, 0)).map((h) => h.id);
    expect(ids()).toContain(mio.id);
    expect(ids()).not.toContain(suyo.id);
    // Sin niebla (`null`, «Ver mapa entero»), todos.
    expect(heroesALaVista(state, 0, null).map((h) => h.id)).toContain(suyo.id);

    suyo.at = { x: mio.at.x + 1, y: mio.at.y };
    expect(ids()).toContain(suyo.id);
  });

  it('el agente lee la misma regla: `enemyHeroes` son los rivales de `heroesALaVista`', () => {
    const state = newGame({ seed: SEMILLA });
    revealEverything(state, 0);
    const mio = heroesOf(state, 0)[0]!;
    const suyo = heroesOf(state, 1)[0]!;
    for (const at of [exploradaSinMirar(state, mio.at), { x: mio.at.x + 1, y: mio.at.y }]) {
      suyo.at = at;
      const turno = serializeAdventureTurn(state, 0) as { enemyHeroes: { id: string }[] };
      const regla = heroesALaVista(state, 0, visibleNow(state, 0)).filter((h) => h.owner !== 0);
      expect(turno.enemyHeroes.map((h) => h.id)).toEqual(regla.map((h) => h.id));
    }
  });

  it('un nodo que el rival toma lejos se sabe con el dueño y el día de cuando se vio', () => {
    const state = newGame({ seed: SEMILLA });
    revealEverything(state, 0);
    const nodo = nodoRecordadoSinMirar(state);
    state.day = 9;
    nodo.owner = 1;

    const sabido = objetosConocidos(state, 0, visibleNow(state, 0)).find(
      (r) => r.object.id === nodo.id,
    );
    expect(sabido).toMatchObject({ day: 1, object: { owner: null } });
    // Sin niebla, el vivo y de hoy.
    expect(objetosConocidos(state, 0, null).find((r) => r.object.id === nodo.id)).toMatchObject({
      day: 9,
      object: { owner: 1 },
    });
    // Mirándolo, también el vivo y de hoy.
    heroesOf(state, 0)[0]!.at = { ...nodo.at };
    expect(
      objetosConocidos(state, 0, visibleNow(state, 0)).find((r) => r.object.id === nodo.id),
    ).toMatchObject({ day: 9, object: { owner: 1 } });
  });

  it('lo que no se ha explorado no se sabe: solo vienen objetos de `memory`', () => {
    const state = newGame({ seed: SEMILLA });
    const conocidos = objetosConocidos(state, 0, visibleNow(state, 0));
    const fog = state.players[0]!.fog;
    expect(conocidos.length).toBeGreaterThan(0);
    expect(conocidos.length).toBeLessThan(state.map.objects.length);
    for (const { object } of conocidos) expect(fog.has(object.at)).toBe(true);
  });
});

describe('la sesión de quien juega: lienzo, minimapa y barra', () => {
  /** La sesión con el mapa explorado entero y el rival en una casilla que no se mira. */
  function partida() {
    const s = new Session(SEMILLA);
    revealEverything(s.state, 0);
    const mio = s.selectedHero ?? heroesOf(s.state, 0)[0]!;
    const suyo = heroesOf(s.state, 1)[0]!;
    suyo.at = exploradaSinMirar(s.state, mio.at);
    return { s, mio, suyo };
  }

  it('el rival que se aleja deja de verse; con «Ver mapa entero» vuelve', () => {
    const { s, mio, suyo } = partida();
    expect(s.heroesALaVista().map((h) => h.id)).not.toContain(suyo.id);
    expect(s.heroesALaVista().map((h) => h.id)).toContain(mio.id);
    s.revealAll = true;
    expect(s.heroesALaVista().map((h) => h.id)).toContain(suyo.id);
    s.revealAll = false;
    suyo.at = { x: mio.at.x + 1, y: mio.at.y };
    expect(s.heroesALaVista().map((h) => h.id)).toContain(suyo.id);
  });

  it('la bandera de un nodo lejano es la del último dueño visto', () => {
    const { s } = partida();
    const nodo = nodoRecordadoSinMirar(s.state);
    nodo.owner = 1;
    s.revealAll = true; // sube `version`: la caché de objetos no puede tapar el cambio
    s.revealAll = false;
    const sabido = s.objetosConocidos().find((o) => o.id === nodo.id);
    expect(sabido).toMatchObject({ kind: 'node', owner: null });
    s.revealAll = true;
    expect(s.objetosConocidos().find((o) => o.id === nodo.id)).toMatchObject({ owner: 1 });
  });

  it('la barra no nombra al rival que el mapa no pinta, ni el dueño de hoy de un nodo lejano', () => {
    const { s, mio, suyo } = partida();
    const nodo = nodoRecordadoSinMirar(s.state);
    nodo.owner = 1;
    s.revealAll = true;
    s.revealAll = false;
    const escena = new EscenaAventura(() => s);
    const [ancho, alto] = [2400, 2400];
    escena.encuadrar(ancho, alto);
    const camara = centrarEn({ tile: TILE_INICIAL, x: 0, y: 0 }, mio.at, {
      ancho,
      alto,
      mapaAncho: s.state.map.width,
      mapaAlto: s.state.map.height,
    });
    const barra = (p: Point): string => {
      const px = casillaAPixel(camara, p);
      escena.mover(px.x, px.y);
      return s.status;
    };

    expect(barra(suyo.at)).not.toContain(suyo.name);
    expect(barra(suyo.at)).not.toContain('héroe enemigo');
    // Con los ríos (#144) el camino cruza la región de unos asaltantes y la
    // barra lo avisa delante.
    expect(barra(nodo.at)).toMatch(/(^|· )Paso sin dueño/);

    suyo.at = { x: mio.at.x + 1, y: mio.at.y };
    expect(barra(suyo.at)).toContain(`${suyo.name}, héroe enemigo`);
    s.revealAll = true;
    expect(barra(nodo.at)).toMatch(/(^|· )Paso enemigo/);
  });

  it('la crónica cuenta lo que pasó a la vista, como la del agente; con «Ver mapa entero», todo', async () => {
    const s = new Session(12);
    await s.endTurn();
    const ocultos = s.state.log.filter((e) => !visibleTo(e, s.viewer));
    // La premisa: el rival hizo algo lejos el día 1.
    expect(ocultos.length).toBeGreaterThan(0);
    const cronica = s.cronica(60);
    for (const e of ocultos) expect(cronica).not.toContainEqual(sinSello(e));
    s.revealAll = true;
    expect(s.cronica(60).length).toBeGreaterThan(cronica.length);
  });
});
