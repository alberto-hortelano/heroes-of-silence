/**
 * La fase de despliegue en pantalla (fase B, `docs/agents/2026-11-02-fase-de-despliegue/`),
 * por las sesiones de verdad (`Session`, `SesionDeArena`) y la escena de batalla:
 * la persona despliega su bando, el defensor sin ver al rival y el atacante
 * viéndolo, y «Listo» empieza la batalla. Las reglas son del núcleo
 * (`test/despliegue.test.ts`); aquí, que el cliente las use y no deje ver ni
 * pulsar lo oculto.
 */
import { describe, expect, it } from 'vitest';
import { renderPanelDeBatalla } from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import { centroHex, planoDeHex } from '../src/client/render/proyeccion.js';
import { Session } from '../src/client/session.js';
import { renderSide } from '../src/client/views/panels.js';
import { activeStack } from '../src/core/battle/battle.js';
import { hexEquals, hexKey } from '../src/core/battle/board.js';
import { zonaDeSalida } from '../src/core/battle/despliegue.js';
import { validarMuralla } from '../src/core/battle/muralla.js';
import type { BattleState, MurallaDeBatalla, Side } from '../src/core/battle/types.js';
import { fuerzaDe, poderDe, ventajaClara } from '../src/core/hero/fuerza.js';
import { pointKey } from '../src/core/map/geometria.js';
import { isEnterable, objectAt } from '../src/core/map/map.js';
import { estructura, regionDeCasilla } from '../src/core/map/regiones.js';
import { baseOf } from '../src/core/state/consultas.js';
import { caminoHasta } from '../src/core/state/game.js';
import type { Point, Raider } from '../src/core/types.js';
import { unidadesDelJuego } from '../src/core/unidad/catalogo.js';
import {
  escenaDeBatalla,
  sesionContraMonstruoAlDesplegar,
  sesionDeArena,
} from './batalla-de-cliente.js';
import { fueraDeSuBase } from './partida-de-prueba.js';
import { unidadDeArena } from './pelea-de-arena.js';

/** Los ids de los vivos de `side` en `b`. */
const delBando = (b: BattleState, side: Side): string[] =>
  b.stacks.filter((s) => s.side === side && s.count > 0).map((s) => s.id);

describe('el atacante despliega viendo al defensor', () => {
  it('la batalla abre en su tanda, con el monstruo ya en el campo y sin turnos', () => {
    const s = sesionContraMonstruoAlDesplegar();
    const b = s.battle!;
    expect(s.scene).toBe('battle');
    expect(s.despliegue.enCurso).toMatchObject({ side: 'attacker', momento: 'con_su_bando' });
    expect(b.turno).toBeNull();
    expect(s.turnoPropio).toBeNull();
    expect(s.battleLegalActions()).toEqual([]);
    // El defensor (el monstruo, sin dueño) ya desplegó: el atacante lo ve.
    expect(delBando(s.batallaALaVista!, 'defender')).toEqual(delBando(b, 'defender'));
    expect(s.status).toContain('Despliega a los tuyos');
    // El panel dice el despliegue y lleva «Listo»; el monstruo, en «En el campo».
    const panel = marcadoDe(renderSide(s));
    expect(panel).toContain('data-action="desplegado"');
    expect(panel).toContain('El enemigo ya está en el campo');
  });

  it('colocar mueve al elegido (y lo cambia con quien esté), y «Listo» empieza la ronda', () => {
    const s = sesionContraMonstruoAlDesplegar();
    const b = s.battle!;
    const elegido = s.despliegue.elegido!;
    const zona = s.despliegue.zona;
    const libre = zona.find((h) => !b.stacks.some((x) => x.count > 0 && hexEquals(x.hex, h)))!;
    const version = s.version;
    s.despliegue.colocarEn(libre);
    expect(elegido.hex).toEqual(libre);
    expect(s.version).toBeGreaterThan(version);
    expect(s.status).toMatch(/sale en/);
    // Fuera de su zona: la frase del núcleo, y nadie se mueve.
    s.despliegue.colocarEn({ col: 6, row: 4 });
    expect(elegido.hex).toEqual(libre);
    expect(s.status).toMatch(/fuera de la zona de salida/);
    // Con otro de los suyos: se cambian.
    const otro = b.stacks.find((x) => x.side === 'attacker' && x !== elegido && x.count > 0);
    if (otro !== undefined) {
      const suya = { ...otro.hex };
      s.despliegue.colocarEn(suya);
      expect(elegido.hex).toEqual(suya);
      expect(otro.hex).toEqual(libre);
      expect(s.status).toMatch(/se cambian de sitio/);
      // Elegir al otro lo elige ya, con su zona, en la misma batalla y la misma
      // tanda (lo que la pieza guarda lo mira también por lo elegido).
      s.despliegue.elegir(otro.id);
      expect(s.despliegue.elegido).toBe(otro);
      expect(s.status).toMatch(/pulsa la casilla verde/);
      s.despliegue.elegir(elegido.id);
      expect(s.despliegue.elegido).toBe(elegido);
    }
    s.despliegue.listo();
    expect(b.despliegue).toBeNull();
    expect(b.round).toBe(1);
    expect(s.despliegue.enCurso).toBeNull();
    // Le toca a la persona, o la IA ya jugó hasta que le toque.
    expect(activeStack(b)).not.toBeNull();
  });

  it('la escena: el clic en una casilla de la zona coloca y la figura se mueve en pantalla', () => {
    const s = sesionContraMonstruoAlDesplegar();
    const escena = escenaDeBatalla(() => s);
    const elegido = s.despliegue.elegido!;
    const b = s.battle!;
    const libre = s.despliegue.zona.find(
      (h) => !b.stacks.some((x) => x.count > 0 && hexEquals(x.hex, h)),
    )!;
    const t = (escena as unknown as { tablero: Parameters<typeof centroHex>[0] }).tablero;
    const p = centroHex(t, libre);
    escena.mover(p.x, p.y);
    expect(s.status).toMatch(/saldría en/);
    escena.pulsar(p.x, p.y);
    expect(elegido.hex).toEqual(libre);
    // La figura va a su casilla nueva sin registro: la clave de las cachés lleva
    // `firmaDelDespliegue` y el animador la recoloca.
    escena.sincronizar(16);
    const animador = (
      escena as unknown as { animador: { figura: (x: typeof elegido) => { en: unknown } } }
    ).animador;
    expect(animador.figura(elegido).en).toEqual(planoDeHex(libre));
  });

  it('«Resolver sola» en el despliegue cierra la batalla desde las casillas de ahora', () => {
    const s = sesionContraMonstruoAlDesplegar();
    expect(s.despliegue.enCurso).not.toBeNull();
    s.autoResolveBattle();
    expect(s.battle).toBeNull();
    expect(s.scene).not.toBe('battle');
  });
});

describe('el defensor despliega sin ver al atacante, en la partida', () => {
  /**
   * La persona da un paso y la embosca un grupo plantado en la región que pisa: un
   * grupo de la unidad más fuerte del catálogo, del tamaño justo para sacarle el
   * margen (`ventajaClara`, la regla de `emboscador`). Es una batalla del mapa en la
   * que la persona defiende, y nace en su propio turno, sin esperar a lo que decida
   * la IA. La primera semilla en que el héroe, junto a su base, tiene un paso así.
   */
  function emboscada(sinDefender = false): Session {
    const porPoder = (id: string) => poderDe({ troops: [{ creature: id, count: 1 }] });
    const ids = unidadesDelJuego().map((u) => u.id);
    const fuerte = [...ids].sort((a, b) => porPoder(b) - porPoder(a))[0]!;
    const flojo = [...ids].sort((a, b) => porPoder(a) - porPoder(b))[0]!;
    for (let semilla = 1; semilla <= 40; semilla++) {
      const s = new Session(semilla);
      const st = s.state;
      const hero = fueraDeSuBase(st, 0);
      if (s.selectedHero?.id !== hero.id) continue;
      hero.army = [{ creature: flojo }];
      st.raiders = [];
      const { regionDe } = estructura(st.map);
      const W = st.map.width;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const paso = { x: hero.at.x + dx!, y: hero.at.y + dy! };
        if (!isEnterable(st.map, paso) || objectAt(st.map, paso) !== undefined) continue;
        if (caminoHasta(st, hero, paso)?.length !== 1) continue;
        const region = regionDeCasilla(st.map, paso);
        if (region < 0) continue;
        let donde: Point | null = null;
        for (let i = 0; i < regionDe.length && donde === null; i++) {
          const q = { x: i % W, y: Math.floor(i / W) };
          if (regionDe[i] !== region || pointKey(q) === pointKey(paso)) continue;
          if (pointKey(q) === pointKey(hero.at) || !isEnterable(st.map, q)) continue;
          if (objectAt(st.map, q) === undefined) donde = q;
        }
        if (donde === null) continue;
        const suya = fuerzaDe(hero);
        let troops: Raider['troops'] | null = null;
        for (let count = 1; count <= 6 && troops === null; count++) {
          const grupo = [{ creature: fuerte, count }];
          if (ventajaClara(poderDe({ troops: grupo }), suya)) troops = grupo;
        }
        if (troops === null) continue;
        st.raiders = [{ id: 'grupo-de-prueba', at: donde, troops }];
        s.clickTile(paso);
        if (s.battle === null || s.state.pendingBattle?.attacker.kind !== 'raider')
          throw new Error(`pisar (${paso.x},${paso.y}) no abrió la emboscada`);
        // Antes de la batalla, el aviso en el mapa (arreglo 3 del 06-11-2026).
        const individuos = troops.reduce((n, g) => n + g.count, 0);
        expect(s.scene).toBe('adventure');
        expect(s.avisoDelAtaque).toEqual({
          titulo: '¡Emboscada!',
          // Dónde, por el nombre de su región y no por la casilla (06-11-2026).
          frase: `Un grupo de ${individuos} asaltantes embosca a ${hero.name} en ${st.map.regions[region]!.name}.`,
          at: paso,
        });
        if (!sinDefender) s.defenderElAtaque();
        return s;
      }
    }
    throw new Error('en 40 semillas el héroe junto a su base no tiene un paso a una región');
  }

  it('la emboscada avisa antes: «Resolver sola» la cierra sin abrir la batalla', () => {
    const s = emboscada(true);
    const heroe = s.selectedHero!;
    const desde = s.state.log.length;
    s.resolverElAtaqueSola();
    expect(s.avisoDelAtaque).toBeNull();
    expect(s.battle).toBeNull();
    expect(s.scene).toBe('adventure');
    // Y dice cómo acabó (06-11-2026: volvía al mapa con la barra vacía), con lo que
    // escribió el núcleo: quién ganó, qué perdió cada bando y qué fue del héroe.
    const fin = s.state.log.slice(desde).find((e) => e.kind === 'battle_ended');
    if (fin?.kind !== 'battle_ended') throw new Error('la batalla resuelta sola no terminó');
    const ganada = fin.winner === 'defender';
    expect(s.status).toMatch(new RegExp(`^Batalla ${ganada ? 'ganada' : 'perdida'}: `));
    expect(s.status).toMatch(/: ((no pierdes a nadie|pierdes \d+\u00a0× [^;]+); )?el enemigo /);
    expect(s.status.endsWith('.')).toBe(true);
    if (!ganada) expect(s.status).toContain(`${heroe.name} cae y vuelve a `);
  });

  it('resuelta sola y perdida, dice que el héroe cae y vuelve a su base sin tropa', () => {
    const s = emboscada(true);
    const heroe = s.selectedHero!;
    const base = baseOf(s.state, heroe.owner)!;
    // Para perderla seguro: lo que defiende, a 1 PV.
    for (const st of s.state.pendingBattle!.battle.stacks) if (st.side === 'defender') st.topHp = 1;
    s.resolverElAtaqueSola();
    expect(s.status).toMatch(/^Batalla perdida: /);
    expect(s.status).toMatch(/(: |; )el enemigo /);
    expect(s.status.endsWith(`; ${heroe.name} cae y vuelve a ${base.name} sin tropa.`)).toBe(true);
    // La tropa que no murió en el tablero se va con él: «no pierdes a nadie» mentiría.
    expect(s.status).not.toContain('no pierdes a nadie');
  });

  it('abre en la tanda del defensor: ni figuras, ni lista, ni pista del rival', () => {
    const s = emboscada();
    const b = s.battle!;
    expect(s.scene).toBe('battle');
    expect(s.miBando).toBe('defender');
    expect(s.despliegue.enCurso).toMatchObject({ side: 'defender' });
    expect(delBando(b, 'attacker').length).toBeGreaterThan(0);
    const vista = s.batallaALaVista!;
    expect(delBando(vista, 'attacker')).toEqual([]);
    // El panel no nombra a ninguno del atacante.
    const panel = marcadoDe(renderSide(s));
    expect(panel).toContain('Despliegas primero');
    for (const x of b.stacks.filter((y) => y.side === 'attacker')) {
      expect(panel).not.toContain(`data-stack="${x.id}"`);
      expect(panel).not.toContain(x.unit.name);
    }
    // La escena: ni la pista del borde cuenta al atacante, ni su casilla se pulsa
    // como suya (el clic ahí coloca o dice por qué no, nunca lo elige).
    const escena = escenaDeBatalla(() => s);
    expect(escena.enemigosFuera(0, 1)).toEqual({ izquierda: 0, derecha: 0 });
    const t = (escena as unknown as { tablero: Parameters<typeof centroHex>[0] }).tablero;
    for (const x of b.stacks.filter((y) => y.side === 'attacker' && y.count > 0)) {
      const p = centroHex(t, x.hex);
      expect(escena.objetivoEn(p.x, p.y)?.side).not.toBe('attacker');
      escena.mover(p.x, p.y);
      expect(s.status).not.toContain(x.unit.name);
      const casillas = b.stacks.map((y) => hexKey(y.hex));
      escena.pulsar(p.x, p.y);
      expect(s.status).not.toContain(x.unit.name);
      expect(b.stacks.map((y) => hexKey(y.hex))).toEqual(casillas);
    }
    // «Listo»: el atacante (sin dueño) despliega solo, empieza la ronda y ya se ve.
    s.despliegue.listo();
    expect(b.despliegue).toBeNull();
    expect(s.batallaALaVista).toBe(b);
  });
});

describe('la arena despliega como el juego', () => {
  const zombi = unidadDeArena('zombi');
  /** Muros y una puerta en las columnas de salida de los dos lados. */
  const MURALLA: MurallaDeBatalla = validarMuralla({
    muros: [
      { col: 0, row: 4 },
      { col: 1, row: 4 },
      { col: 11, row: 4 },
      { col: 10, row: 3 },
    ],
    puertas: [{ a: { col: 1, row: 3 }, b: { col: 2, row: 3 } }],
    material: 'piedra',
  });

  it('Yo contra la IA: el bando «Yo» despliega en su tanda; el de la IA, solo', () => {
    const s = sesionDeArena(
      [
        { unidad: zombi, ia: false },
        { unidad: zombi, ia: false },
      ],
      [{ unidad: zombi, ia: true }],
      5,
      { muralla: MURALLA },
    );
    s.empezar();
    expect(s.despliegue.enCurso).toMatchObject({ side: 'attacker' });
    expect(s.turnoPropio).toBeNull();
    // Nadie del bando sale en un muro, y la zona no tiene ninguno.
    const muros = new Set(MURALLA.muros.map(hexKey));
    for (const x of s.battle.stacks) expect(muros.has(hexKey(x.hex))).toBe(false);
    for (const h of s.despliegue.zona) expect(muros.has(hexKey(h))).toBe(false);
    // En un muro: la frase del núcleo.
    s.despliegue.colocarEn({ col: 1, row: 4 });
    expect(s.status).toBe('En (1,4) hay muro.');
    const panel = marcadoDe(renderPanelDeBatalla(s, false));
    expect(panel).toContain('Despliegue · bando izquierdo');
    const version = s.version;
    s.despliegue.colocarEn({ col: 2, row: 4 });
    expect(s.version).not.toBe(version);
    s.despliegue.listo();
    expect(s.battle.despliegue).toBeNull();
  });

  it('Yo contra Yo: primero el derecho sin ver al izquierdo, luego el izquierdo viéndolo', () => {
    const s = sesionDeArena([{ unidad: zombi, ia: false }], [{ unidad: zombi, ia: false }], 5, {
      muralla: MURALLA,
    });
    s.empezar();
    expect(s.despliegue.enCurso).toMatchObject({ side: 'defender' });
    expect(delBando(s.batallaALaVista, 'attacker')).toEqual([]);
    expect(marcadoDe(renderPanelDeBatalla(s, false))).toContain('Despliegue · bando derecho');
    // El defensor no puede tocar a un atacante: no es colocable.
    const atacante = s.battle.stacks.find((x) => x.side === 'attacker')!;
    s.despliegue.elegir(atacante.id);
    expect(s.status).toMatch(/no es del bando que despliega/);
    s.despliegue.listo();
    expect(s.despliegue.enCurso).toMatchObject({ side: 'attacker' });
    // Ya en la tanda del izquierdo: se ve a los suyos y a los del derecho, que ya desplegó.
    expect(delBando(s.batallaALaVista, 'attacker')).toEqual(delBando(s.battle, 'attacker'));
    expect(delBando(s.batallaALaVista, 'defender')).toEqual(delBando(s.battle, 'defender'));
    // Las zonas: las del núcleo, sin muros.
    expect(s.despliegue.zona).toEqual(zonaDeSalida(atacante.unit, 'attacker', MURALLA));
    s.despliegue.listo();
    expect(s.battle.despliegue).toBeNull();
    expect(s.battle.round).toBe(1);
  });

  it('con todo en la IA no hay despliegue a mano: la pelea se juega entera', () => {
    const s = sesionDeArena([{ unidad: zombi, ia: true }], [{ unidad: zombi, ia: true }], 5);
    s.empezar();
    expect(s.despliegue.enCurso).toBeNull();
    expect(s.battle.despliegue).toBeNull();
  });
});
