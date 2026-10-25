/**
 * La cola de la batalla: lo que el motor resuelve de golpe se cuenta en orden,
 * y mientras se cuenta no se aceptan clics.
 *
 * El reloj lo pone `tick`, una vez por fotograma; las lecturas no lo tocan.
 */

import { describe, expect, it } from 'vitest';
import { BattleAnimator, DURACION, duracionDeLaJugada, IMPACTO } from '../src/client/anim.js';
import { msPorCasilla } from '../src/client/marcha.js';
import { clipQueSePinta } from '../src/client/render/batalla.js';
import {
  arteDe,
  hojaDe,
  MIRADA_DE_PRESENTACION,
  registrarUnidad,
} from '../src/client/render/personajes.js';
import { ALTO_DE_FIGURA, planoDeHex } from '../src/client/render/proyeccion.js';
import { createBattle } from '../src/core/battle/battle.js';
import { stackHp } from '../src/core/battle/damage.js';
import type { BattleEvent, BattleState } from '../src/core/battle/types.js';
import { unidadDelJuego } from '../src/core/catalogo.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { troopsAsStacks } from '../src/core/hero/troop.js';
import { createRng } from '../src/core/rng.js';
import { ejercito, NO_MUERTO, TIRADOR, TROPA_BARATA } from './helpers.js';

/**
 * Cuerpos de prueba, cada uno con el Y Bot de un juego de armas y sin arte
 * propio: lo que se prueba es cómo cuenta el animador un disparo según lo que
 * pinte el arte (con la hoja C del arco, o con el ataque), no qué arte lleva hoy
 * una unidad del catálogo. Los dos del bastón comparten arte: el aviso sale una
 * vez por arte, no por cuerpo.
 */
const CON_ARCO = 'prueba-arco';
const CON_BASTON = 'prueba-baston';
const CON_OTRO_BASTON = 'prueba-otro-baston';
const CON_ESPADA = 'prueba-espada';
for (const [cuerpo, juego] of [
  [CON_ARCO, 'arco'],
  [CON_BASTON, 'baston'],
  [CON_OTRO_BASTON, 'baston'],
  [CON_ESPADA, 'espada-escudo'],
] as const) {
  registrarUnidad(cuerpo, { juego, direcciones: null });
}

function batalla(): BattleState {
  return createBattle(
    { army: troopsAsStacks(ejercito({ creature: TROPA_BARATA, count: 2 })), hero: null },
    { army: troopsAsStacks(ejercito({ creature: NO_MUERTO, count: 2 })), hero: null },
    createRng(1),
    COMBATE_COMPLETO,
  );
}

describe('el animador de batalla', () => {
  it('la primera lectura no anima nada: toma las posiciones de ahora', () => {
    const t = 0;
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(t);
    expect(a.busy).toBe(false);
    const s = b.stacks[0]!;
    expect(a.figura(s).en).toEqual(planoDeHex(s.hex));
  });

  it('un movimiento se interpola y bloquea hasta acabar; dos van uno detrás de otro', () => {
    let t = 0;
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(t);
    const [s1, s2] = b.stacks as [BattleState['stacks'][number], BattleState['stacks'][number]];
    const desde1 = planoDeHex(s1.hex);
    const desde2 = planoDeHex(s2.hex);
    const destino1 = { col: s1.hex.col + 2, row: s1.hex.row };
    const destino2 = { col: s2.hex.col + 1, row: s2.hex.row };
    // Lo que haría el motor: mover y apuntarlo en el registro.
    s1.hex = destino1;
    b.log.push({ kind: 'move', stack: s1.id, to: destino1, path: [destino1] });
    s2.hex = destino2;
    b.log.push({ kind: 'move', stack: s2.id, to: destino2, path: [destino2] });
    a.observe(b);
    a.tick(t);

    expect(a.busy).toBe(true);
    // Cada uno tarda lo que tarda en andar SUS casillas: dos el primero, una el segundo.
    const casilla = msPorCasilla(TROPA_BARATA, 'walk', ALTO_DE_FIGURA);
    t = casilla;
    a.tick(t);
    const medio = a.figura(s1);
    expect(medio.clip).toBe('walk');
    expect(medio.en.x).toBeCloseTo((desde1.x + planoDeHex(destino1).x) / 2);
    // El segundo espera su turno en su sitio de antes.
    expect(a.figura(s2).en).toEqual(desde2);

    t = 2 * casilla + 1;
    a.tick(t);
    expect(a.figura(s1).en).toEqual(planoDeHex(destino1));
    expect(a.figura(s2).clip).toBe('walk');
    t = 3 * casilla + 2;
    a.tick(t);
    expect(a.busy).toBe(false);
    expect(a.figura(s2).en).toEqual(planoDeHex(destino2));
  });

  it('el poder de una unidad se cuenta como un hechizo con quien lo lanza, que ataca sin dolerse nadie', () => {
    let t = 0;
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(t);
    const [monje, aliado] = b.stacks as BattleState['stacks'];
    b.log.push({ kind: 'power', stack: monje!.id, poder: 'curar', target: aliado!.id, cura: 2 });
    a.observe(b);
    a.tick(t);
    expect(a.busy).toBe(true);
    // Quien lo usa, con su ataque; el destello del hechizo sobre el aliado.
    expect(a.figura(monje!).clip).toBe('attack');
    expect(a.efectos(b).map((e) => e.tipo)).toEqual(['hechizo']);
    t = DURACION.cast * 0.8;
    a.tick(t);
    expect(a.figura(aliado!).clip).not.toBe('hurt');
    expect(a.efectos(b).some((e) => e.tipo === 'danio')).toBe(false);
    a.tick(DURACION.cast + 1);
    expect(a.busy).toBe(false);
  });

  it('una unidad que cae se sigue viendo hasta que su caída se ha contado', () => {
    let t = 0;
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(t);
    const [atacante, , victima] = b.stacks as BattleState['stacks'];
    victima!.count = 0;
    b.log.push({
      kind: 'attack',
      stack: atacante!.id,
      target: victima!.id,
      damage: 5,
      killed: 1,
      retaliation: false,
    });
    b.log.push({ kind: 'perished', stack: victima!.id });
    a.observe(b);
    a.tick(t);
    expect(a.figura(victima!).visible).toBe(true);
    expect(a.figura(atacante!).clip).toBe('attack');
    expect(a.efectos(b).some((e) => e.tipo === 'danio')).toBe(false);
    t = DURACION.attack * 0.8;
    a.tick(t);
    expect(a.efectos(b).some((e) => e.tipo === 'danio')).toBe(true);
    t = DURACION.attack + DURACION.perished + 2;
    a.tick(t);
    expect(a.figura(victima!).visible).toBe(false);
    expect(a.busy).toBe(false);
  });

  it('quien recibe un golpe con daño se duele desde el impacto, y sigue tras el paso hasta acabar su clip', () => {
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(0);
    const [atacante, , victima] = b.stacks as BattleState['stacks'];
    b.log.push({
      kind: 'attack',
      stack: atacante!.id,
      target: victima!.id,
      damage: 3,
      killed: 0,
      retaliation: false,
    });
    a.observe(b);
    a.tick(0);
    // Antes del impacto, quieta.
    a.tick(DURACION.attack * 0.3);
    expect(a.figura(victima!).clip).toBe('idle');
    // Desde el impacto (55 %), el daño con su reloj desde ahí.
    const impacto = DURACION.attack * 0.55;
    a.tick(impacto + 50);
    expect(a.figura(victima!).clip).toBe('hurt');
    expect(a.figura(victima!).tiempo).toBeCloseTo(50);
    // El paso acaba antes que el clip: el daño sigue.
    a.tick(DURACION.attack + 100);
    expect(a.busy).toBe(false);
    expect(a.figura(victima!).clip).toBe('hurt');
    expect(a.figura(victima!).tiempo).toBeCloseTo(DURACION.attack + 100 - impacto);
    // Y acaba cuando acaba su clip EN EL ATLAS: el animador da el tiempo desde
    // el impacto y quien pinta corta con el reloj de la hoja (`clipQueSePinta`).
    const hurt = hojaDe(arteDe(victima!.body), a.figura(victima!).mira).clips.hurt;
    const dura = (hurt.frames * 1000) / hurt.fps;
    a.tick(impacto + dura - 1);
    expect(clipQueSePinta(victima!.body, a.figura(victima!))).toBe('hurt');
    a.tick(impacto + dura + 1);
    expect(clipQueSePinta(victima!.body, a.figura(victima!))).toBe('idle');
  });

  /**
   * Una batalla de tiradores con el cuerpo `cuerpo` de atacante, y su primer
   * stack golpeando cuerpo a cuerpo al primer defensor. El cuerpo se pone a mano:
   * el animador pinta lo que dice `body`. (Los casos del disparo se borraron con el
   * disparo diferido, 25-10-2026: va sin tests hasta que el usuario lo valide.)
   */
  function golpeDelTirador(cuerpo: string) {
    const a = new BattleAnimator();
    const b = createBattle(
      { army: troopsAsStacks(ejercito({ creature: TIRADOR, count: 2 })), hero: null },
      { army: troopsAsStacks(ejercito({ creature: NO_MUERTO, count: 2 })), hero: null },
      createRng(1),
      COMBATE_COMPLETO,
    );
    for (const s of b.stacks) if (s.side === 'attacker') (s as { body: string }).body = cuerpo;
    a.observe(b);
    a.tick(0);
    const quien = b.stacks.find((s) => s.side === 'attacker')!;
    const victima = b.stacks.find((s) => s.side === 'defender')!;
    const hecho = { stack: quien.id, target: victima.id, damage: 4, killed: 0 };
    b.log.push({ kind: 'attack', ...hecho, retaliation: false });
    a.observe(b);
    a.tick(0);
    const proyectil = () => a.efectos(b).find((e) => e.tipo === 'proyectil');
    return {
      a,
      quien,
      victima,
      proyectil,
      danio: () => a.efectos(b).some((e) => e.tipo === 'danio'),
    };
  }

  it('el mismo arquero, cuerpo a cuerpo, golpea con su ataque: la daga, no el arco', () => {
    // #142 (M4 del #136): antes del 04-10-2026 la fila `attack` del arco ERA el
    // disparo, así que el golpe cuerpo a cuerpo tensaba el arco, el daño caía en
    // el 0,55 del paso (308 ms) y la cuerda se soltaba a los 400, sin flecha.
    // Hoy el golpe pinta su propia fila, sin suelta, y nada vuela.
    const hoja = hojaDe(arteDe(CON_ARCO), MIRADA_DE_PRESENTACION);
    expect(hoja.clips.attack, 'el golpe del arquero es su fila de disparo').not.toBe(
      hoja.clips.shoot,
    );
    expect(hoja.clips.attack.suelta).toBeUndefined();
    const { a, quien, victima, proyectil, danio } = golpeDelTirador(CON_ARCO);
    const impacto = 0.55 * DURACION.attack;
    for (let t = 1; t < DURACION.attack; t += 20) {
      a.tick(t);
      expect(a.figura(quien).clip, `a los ${t} ms`).toBe('attack');
      expect(proyectil(), `a los ${t} ms vuela algo de un golpe cuerpo a cuerpo`).toBeUndefined();
      expect(danio(), `a los ${t} ms`).toBe(t >= impacto);
      expect(a.figura(victima).clip, `a los ${t} ms`).toBe(t >= impacto ? 'hurt' : 'idle');
    }
    a.tick(DURACION.attack + 1);
    expect(a.busy).toBe(false);
  });

  it('un golpe sin daño no hace dolerse', () => {
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(0);
    const [atacante, , victima] = b.stacks as BattleState['stacks'];
    b.log.push({
      kind: 'attack',
      stack: atacante!.id,
      target: victima!.id,
      damage: 0,
      killed: 0,
      retaliation: false,
    });
    a.observe(b);
    a.tick(0);
    a.tick(DURACION.attack * 0.8);
    expect(a.figura(victima!).clip).toBe('idle');
  });

  it('la que cae lo hace con su muerte y deja el cadáver: `caida` crece desde que EMPEZÓ a caer', () => {
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(0);
    const [, , victima] = b.stacks as BattleState['stacks'];
    victima!.count = 0;
    b.log.push({ kind: 'perished', stack: victima!.id });
    a.observe(b);
    a.tick(0);
    a.tick(DURACION.perished / 2);
    const cayendo = a.figura(victima!);
    expect(cayendo.visible).toBe(true);
    expect(cayendo.clip).toBe('death');
    expect(cayendo.tiempo).toBeCloseTo(DURACION.perished / 2);
    expect(cayendo.caida).toBeNull();
    a.tick(DURACION.perished + 10);
    const caida = a.figura(victima!);
    expect(caida.visible).toBe(false);
    // El reloj de la caída sigue el de la muerte: no salta al cadáver al acabar el paso.
    expect(caida.caida).toBeCloseTo(DURACION.perished + 10);
    a.tick(10_000);
    expect(a.figura(victima!).caida).toBeCloseTo(10_000);
  });

  it('la que ya estaba muerta al verse la batalla es cadáver desde siempre, y otra batalla las olvida', () => {
    const a = new BattleAnimator();
    const b = batalla();
    const [, , victima] = b.stacks as BattleState['stacks'];
    victima!.count = 0;
    a.observe(b);
    a.tick(0);
    expect(a.figura(victima!).visible).toBe(false);
    expect(a.figura(victima!).caida).toBe(Number.POSITIVE_INFINITY);
    // Otra batalla: el mismo id ya no es un cadáver.
    const otra = batalla();
    a.observe(otra);
    a.tick(1);
    expect(a.figura(otra.stacks[2]!).caida).toBeNull();
  });

  it('preguntar si está ocupado no mueve la cola: solo la mueve el reloj', () => {
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(0);
    const s1 = b.stacks[0]!;
    const destino = { col: s1.hex.col + 1, row: s1.hex.row };
    s1.hex = destino;
    b.log.push({ kind: 'move', stack: s1.id, to: destino, path: [destino] });
    a.observe(b);
    a.tick(0);
    // Ya ha pasado de sobra lo que dura el paso, pero nadie ha dado la hora.
    for (let i = 0; i < 3; i++) expect(a.busy).toBe(true);
    expect(a.figura(s1).clip).toBe('walk');
    a.tick(msPorCasilla(TROPA_BARATA, 'walk', ALTO_DE_FIGURA) + 1);
    expect(a.busy).toBe(false);
  });

  it('la misma batalla recién parseada no se reinicia: lo nuevo del registro se encola', () => {
    // Lo que le pasa al espectador: cada fotograma del cable trae otro objeto.
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(structuredClone(b), 1);
    a.tick(0);
    const s1 = b.stacks[0]!;
    const destino = { col: s1.hex.col + 2, row: s1.hex.row };
    s1.hex = destino;
    b.log.push({ kind: 'move', stack: s1.id, to: destino, path: [destino] });
    const otraCopia = structuredClone(b);
    a.observe(otraCopia, 1);
    a.tick(msPorCasilla(TROPA_BARATA, 'walk', ALTO_DE_FIGURA));
    expect(a.busy).toBe(true);
    expect(a.figura(otraCopia.stacks[0]!).clip).toBe('walk');
    // Otra batalla, aunque el registro sea igual de largo, empieza quieta.
    a.observe(structuredClone(b), 2);
    a.tick(1);
    expect(a.busy).toBe(false);
  });

  it('un tramo dura lo que tarda su figura en andar sus casillas, y cargando menos', () => {
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(0);
    const s1 = b.stacks[0]!;
    const destino = { col: s1.hex.col + 3, row: s1.hex.row };
    s1.hex = destino;
    b.log.push({ kind: 'move', stack: s1.id, to: destino, path: [destino] });
    a.observe(b);
    a.tick(0);
    const casilla = msPorCasilla(TROPA_BARATA, 'walk', ALTO_DE_FIGURA);
    a.tick(3 * casilla - 1);
    expect(a.busy).toBe(true);
    a.tick(3 * casilla + 1);
    expect(a.busy).toBe(false);
    // La carrera avanza más por ciclo con el mismo reloj: la casilla dura menos.
    expect(msPorCasilla(TROPA_BARATA, 'charge', ALTO_DE_FIGURA)).toBeLessThan(casilla);
    // Y una figura más alta da zancadas más largas.
    expect(msPorCasilla(TROPA_BARATA, 'walk', ALTO_DE_FIGURA * 1.5)).toBeLessThan(casilla);
    expect(() => msPorCasilla(TROPA_BARATA, 'attack', 1)).toThrow(/no anda/);
  });

  it('la carga la marca el `move`: con el cruce en medio (la rueda) y sin él', () => {
    // Lo que escribe el motor: el tramo con que carga (con `charge`), el cruce de la
    // rueda si lo hay, y el golpe. Primero se anda, luego la rueda, luego el golpe.
    for (const conCruce of [true, false]) {
      const a = new BattleAnimator();
      const b = batalla();
      a.observe(b);
      a.tick(0);
      const [s1, s2] = b.stacks as [BattleState['stacks'][number], BattleState['stacks'][number]];
      const destino = { col: s1.hex.col + 1, row: s1.hex.row };
      s1.hex = destino;
      const cruce = {
        kind: 'cruce',
        stack: s1.id,
        target: s2.id,
        golpe: 'fuerte',
        respuesta: 'finta',
        punto: 1,
      } as const satisfies BattleEvent;
      const nuevos: BattleEvent[] = [
        { kind: 'move', stack: s1.id, to: destino, path: [destino], charge: true },
        ...(conCruce ? [cruce] : []),
        {
          kind: 'attack',
          stack: s1.id,
          target: s2.id,
          damage: 4,
          killed: 0,
          retaliation: false,
          charge: 3,
        },
      ];
      b.log.push(...nuevos);
      const casilla = msPorCasilla(TROPA_BARATA, 'charge', ALTO_DE_FIGURA);
      expect(duracionDeLaJugada(b, nuevos), `con cruce: ${conCruce}`).toBe(
        casilla + (conCruce ? DURACION.cruce : 0) + DURACION.attack,
      );
      a.observe(b);
      a.tick(0);
      // Primero el tramo, de una casilla, cargando.
      a.tick(casilla / 2);
      expect(a.figura(s1).clip).toBe('charge');
      expect(a.cruceEnCurso()).toBeNull();
      if (conCruce) {
        // Llegado, la rueda lo cuenta y nadie se mueve.
        a.tick(casilla + DURACION.cruce / 2);
        expect(a.cruceEnCurso()).toEqual({ evento: cruce, t: 0.5 });
        expect(a.figura(s1).clip).toBe('idle');
      }
    }
  });

  it('la carga se marca al leer el `move`, aunque el golpe llegue después, y solo desde él', () => {
    // Plantarse: el tramo entra solo, y el golpe, en otra lectura tras la rueda.
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(0);
    const [s1, s2] = b.stacks as [BattleState['stacks'][number], BattleState['stacks'][number]];
    const destino = { col: s1.hex.col + 1, row: s1.hex.row };
    s1.hex = destino;
    b.log.push({ kind: 'move', stack: s1.id, to: destino, path: [destino], charge: true });
    a.observe(b);
    a.tick(0);
    a.tick(1);
    expect(a.figura(s1).clip).toBe('charge');
    // Un tramo sin la marca anda, aunque detrás venga un golpe que diga `charge`: la
    // carga ya no se deduce del paso de al lado.
    const otra = batalla();
    const b1 = otra.stacks[0] as BattleState['stacks'][number];
    const a2 = new BattleAnimator();
    a2.observe(otra);
    a2.tick(0);
    const lejos = { col: b1.hex.col + 1, row: b1.hex.row };
    b1.hex = lejos;
    const sinMarca: BattleEvent[] = [
      { kind: 'move', stack: b1.id, to: lejos, path: [lejos] },
      {
        kind: 'attack',
        stack: b1.id,
        target: s2.id,
        damage: 4,
        killed: 0,
        retaliation: false,
        charge: 3,
      },
    ];
    otra.log.push(...sinMarca);
    a2.observe(otra);
    a2.tick(0);
    a2.tick(1);
    expect(a2.figura(b1).clip).toBe('walk');
    expect(duracionDeLaJugada(otra, sinMarca)).toBe(
      msPorCasilla(TROPA_BARATA, 'walk', ALTO_DE_FIGURA) + DURACION.attack,
    );
  });

  it('a ritmo 2 un paso dura la mitad, y cambiar el ritmo a mitad no mueve el que ya va', () => {
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(0);
    const s1 = b.stacks[0]!;
    const destino = { col: s1.hex.col + 1, row: s1.hex.row };
    s1.hex = destino;
    b.log.push({ kind: 'move', stack: s1.id, to: destino, path: [destino] });
    a.velocidad = 2;
    a.observe(b);
    a.tick(0);
    // Ya empezado a ritmo 2: volver a 1 no lo estira.
    a.velocidad = 1;
    const casilla = msPorCasilla(TROPA_BARATA, 'walk', ALTO_DE_FIGURA);
    a.tick(casilla / 2 - 1);
    expect(a.busy).toBe(true);
    a.tick(casilla / 2 + 1);
    expect(a.busy).toBe(false);
    expect(a.figura(s1).en).toEqual(planoDeHex(destino));
  });
});

/**
 * La vida y quién actúa, al ritmo de la cola (H6 de la QA de la rueda,
 * 13-10-2026): el estado ya trae el final de lo que se cuenta, y el tablero
 * enseñaba quién moría antes que la animación. Los golpes se escriben a mano
 * sobre la vida del no-muerto (`VIDA`), un individuo por stack.
 */
describe('la vida y quién actúa, al ritmo de la cola', () => {
  type Stack = BattleState['stacks'][number];
  const VIDA = unidadDelJuego(NO_MUERTO).hp;
  /** La batalla de prueba ya observada, con la primera tropa, la segunda y el primer no-muerto. */
  function enCola(): { a: BattleAnimator; b: BattleState; c1: Stack; c2: Stack; v: Stack } {
    const a = new BattleAnimator();
    const b = batalla();
    a.observe(b);
    a.tick(0);
    const [c1, c2, v] = b.stacks as [Stack, Stack, Stack];
    expect(stackHp(v)).toBe(VIDA);
    return { a, b, c1, c2, v };
  }
  const golpe = (de: Stack, a: Stack, damage: number, retaliation = false): BattleEvent => ({
    kind: 'attack',
    stack: de.id,
    target: a.id,
    damage,
    killed: 0,
    retaliation,
  });
  const impacto = DURACION.attack * IMPACTO;

  it('la barra baja golpe a golpe en su impacto, no antes; contado todo, es la del estado', () => {
    const { a, b, c1, c2, v } = enCola();
    // Lo que haría el motor: los dos golpes ya hechos en el estado.
    v.topHp = VIDA - 10 - 15;
    b.log.push(golpe(c1, v, 10), golpe(c2, v, 15));
    a.observe(b);
    a.tick(0);
    expect(a.figura(v).pv).toBe(VIDA);
    a.tick(impacto - 1);
    expect(a.figura(v).pv).toBe(VIDA);
    a.tick(impacto + 1);
    expect(a.figura(v).pv).toBe(VIDA - 10);
    // El segundo, igual: antes de su impacto, lo del primero.
    a.tick(DURACION.attack + impacto - 1);
    expect(a.figura(v).pv).toBe(VIDA - 10);
    a.tick(DURACION.attack + impacto + 1);
    expect(a.figura(v).pv).toBe(VIDA - 25);
    a.tick(2 * DURACION.attack + 1);
    expect(a.busy).toBe(false);
    expect(a.figura(v).pv).toBe(stackHp(v));
  });

  it('un fotograma que llega tarde se salta el impacto, no la vida que quita; el sobrante no cuenta', () => {
    const { a, b, c1, c2, v } = enCola();
    v.count = 0;
    v.topHp = 0;
    b.log.push(golpe(c1, v, 25), golpe(c2, v, 999));
    a.observe(b);
    a.tick(0);
    // De un salto al segundo paso, antes de su impacto: el primero ya quitó lo suyo.
    a.tick(DURACION.attack + 10);
    expect(a.figura(v).pv).toBe(VIDA - 25);
    a.tick(DURACION.attack + impacto + 1);
    expect(a.figura(v).pv).toBe(0);
  });

  it('la cura de un poder sube la barra en su impacto; lo que el registro no dice llega con el último', () => {
    const { a, b, c1, c2, v } = enCola();
    v.topHp = 20;
    c2.topHp = 5;
    a.observe(b);
    a.tick(0);
    // El monje cura 15 al no-muerto, la segunda tropa le pega 5 y drena 3
    // (como el señor vampiro: el registro no lo apunta) y el no-muerto le
    // devuelve 2. El estado: 30 y 6.
    v.topHp = 30;
    c2.topHp = 5 + 3 - 2;
    b.log.push(
      { kind: 'power', stack: c1.id, poder: 'curar', target: v.id, cura: 15 },
      golpe(c2, v, 5),
      golpe(v, c2, 2, true),
    );
    a.observe(b);
    a.tick(0);
    expect(a.figura(v).pv).toBe(20);
    a.tick(DURACION.cast * IMPACTO + 1);
    expect(a.figura(v).pv).toBe(35);
    a.tick(DURACION.cast + impacto + 1);
    expect(a.figura(v).pv).toBe(30);
    // A la tropa aún le queda el contraataque: su drenaje no se ve todavía.
    expect(a.figura(c2).pv).toBe(5);
    // Con su último impacto, la del estado, drenaje incluido.
    a.tick(DURACION.cast + DURACION.attack + impacto + 1);
    expect(a.figura(c2).pv).toBe(6);
  });

  it('el aro y la casilla resaltada van con quien actúa en lo que se cuenta, no con el turno del estado', () => {
    const { a, b, c1, v } = enCola();
    const salida = { ...c1.hex };
    const destino = { col: c1.hex.col + 1, row: c1.hex.row };
    // El motor ya ha andado, golpeado, recibido el contraataque y pasado el turno.
    c1.hex = destino;
    const turno = b.turno;
    if (turno === null) throw new Error('la batalla de prueba no tiene turno');
    b.turno = { ...turno, stack: v.id };
    const nuevos = [
      {
        kind: 'cruce',
        stack: c1.id,
        target: v.id,
        golpe: 'fuerte',
        respuesta: 'rapido',
        punto: 3,
      },
      { kind: 'move', stack: c1.id, to: destino, path: [destino] },
      golpe(c1, v, 4),
      golpe(v, c1, 2, true),
    ] as const satisfies readonly BattleEvent[];
    b.log.push(...nuevos);
    a.observe(b);
    a.tick(0);
    // Mientras gira la rueda: quien pega, en su casilla de salida.
    a.tick(DURACION.cruce / 2);
    expect(a.cruceEnCurso()).not.toBeNull();
    expect(a.activo(b)).toBe(c1.id);
    expect(a.figura(c1).casilla).toEqual(salida);
    // Andando, en ninguna; llegado, en la de destino.
    const anda = msPorCasilla(TROPA_BARATA, 'walk', ALTO_DE_FIGURA);
    a.tick(DURACION.cruce + anda / 2);
    expect(a.figura(c1).casilla).toBeNull();
    a.tick(DURACION.cruce + anda + 1);
    expect(a.figura(c1).casilla).toEqual(destino);
    // El contraataque no le quita el aro.
    a.tick(DURACION.cruce + anda + DURACION.attack + 1);
    expect(a.activo(b)).toBe(c1.id);
    // Contado todo, manda el estado.
    a.tick(DURACION.cruce + anda + 2 * DURACION.attack + 1);
    expect(a.busy).toBe(false);
    expect(a.activo(b)).toBe(v.id);
  });
});
