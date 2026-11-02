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
import { type MurallaDeBatalla, validarMuralla } from '../src/core/battle/muralla.js';
import type { BattleState, Side } from '../src/core/battle/types.js';
import { heroesOf } from '../src/core/state/game.js';
import { sesionContraMonstruoAlDesplegar } from './batalla-de-cliente.js';
import {
  casillaADosPasos,
  ejercito,
  escenaDeBatalla,
  hastaQue,
  PESADA,
  sesionDeArena,
  TROPA_BARATA,
  unidadDeArena,
} from './helpers.js';

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

describe('el defensor despliega sin ver al atacante', () => {
  /** El rival ataca a la persona en su turno (la semilla de `heroe-en-batalla.test.ts`). */
  async function defensa(): Promise<{ s: Session; turno: Promise<void> }> {
    const s = new Session(3);
    const st = s.state;
    const mio = heroesOf(st, 0)[0]!;
    const suyo = heroesOf(st, 1)[0]!;
    mio.army = ejercito({ creature: TROPA_BARATA, count: 3 });
    suyo.army = ejercito({ creature: PESADA, count: 6 });
    mio.at = casillaADosPasos(st, suyo.at);
    const turno = s.endTurn();
    await hastaQue(() => s.scene === 'battle');
    return { s, turno };
  }

  it('abre en la tanda del defensor: ni figuras, ni lista, ni pista del rival', async () => {
    const { s, turno } = await defensa();
    const b = s.battle!;
    expect(s.miBando).toBe('defender');
    expect(s.despliegue.enCurso).toMatchObject({ side: 'defender' });
    expect(delBando(b, 'attacker').length).toBeGreaterThan(0);
    const vista = s.batallaALaVista!;
    expect(delBando(vista, 'attacker')).toEqual([]);
    expect(s.status).toContain('aún no ves al enemigo');
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
      // Y pulsarla tampoco: ni lo nombra ni mueve a nadie (la casilla queda fuera
      // de la zona del elegido, y lo dice de él).
      const casillas = b.stacks.map((y) => hexKey(y.hex));
      escena.pulsar(p.x, p.y);
      expect(s.status).not.toContain(x.unit.name);
      expect(b.stacks.map((y) => hexKey(y.hex))).toEqual(casillas);
    }
    // «Listo»: el atacante (de la IA) despliega solo, empieza la ronda y ya se ve.
    s.despliegue.listo();
    expect(b.despliegue).toBeNull();
    expect(s.batallaALaVista).toBe(b);
    s.autoResolveBattle();
    await turno;
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
