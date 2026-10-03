/**
 * La cola de la batalla: lo que el motor resuelve de golpe se cuenta en orden,
 * y mientras se cuenta no se aceptan clics.
 *
 * El reloj lo pone `tick`, una vez por fotograma; las lecturas no lo tocan.
 */
import { describe, expect, it } from 'vitest';
import { BattleAnimator, DURACION, relojDelDisparo, VUELO_MS } from '../src/client/anim.js';
import { msPorCasilla } from '../src/client/marcha.js';
import { clipQueSePinta } from '../src/client/render/batalla.js';
import { clipFrame } from '../src/client/render/character.js';
import { arteDe, hojaDe, MIRADA_DE_PRESENTACION } from '../src/client/render/personajes.js';
import { ALTO_DE_FIGURA, planoDeHex } from '../src/client/render/proyeccion.js';
import { createBattle } from '../src/core/battle/battle.js';
import type { BattleState } from '../src/core/battle/types.js';
import { troopsAsStacks } from '../src/core/hero/troop.js';
import { createRng } from '../src/core/rng.js';
import { ejercito } from './helpers.js';

function batalla(): BattleState {
  return createBattle(
    { army: troopsAsStacks(ejercito({ creature: 'peasant', count: 2 })), hero: null },
    { army: troopsAsStacks(ejercito({ creature: 'skeleton', count: 2 })), hero: null },
    createRng(1),
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
    const casilla = msPorCasilla('peasant', 'walk', ALTO_DE_FIGURA.normal);
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

  /** Una batalla con `tirador` de atacante, y su primer stack disparando al primer defensor. */
  function disparo(tirador: string) {
    const a = new BattleAnimator();
    const b = createBattle(
      { army: troopsAsStacks(ejercito({ creature: tirador, count: 2 })), hero: null },
      { army: troopsAsStacks(ejercito({ creature: 'skeleton', count: 2 })), hero: null },
      createRng(1),
    );
    a.observe(b);
    a.tick(0);
    const quien = b.stacks.find((s) => s.side === 'attacker')!;
    const victima = b.stacks.find((s) => s.side === 'defender')!;
    b.log.push({ kind: 'shoot', stack: quien.id, target: victima.id, damage: 4, killed: 0 });
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

  it('un arquero suelta el proyectil en la columna que su hoja marca como suelta, y el daño llega con él', () => {
    const info = hojaDe(arteDe('archer'), MIRADA_DE_PRESENTACION).clips.attack;
    expect(info.suelta, 'el arco de `atlas-8d.json` sin suelta').toBeDefined();
    const columna = 1000 / info.fps;
    const desde = (info.suelta as number) * columna;
    const { dura, impacto } = relojDelDisparo('archer');
    const { a, quien, victima, proyectil, danio } = disparo('archer');
    const atlas = hojaDe(arteDe(quien.body), a.figura(quien).mira);
    // Mientras tensa: el tirador dispara, pero la flecha aún no ha salido.
    a.tick(desde - 1);
    expect(a.figura(quien).clip).toBe('attack');
    expect(proyectil()).toBeUndefined();
    // Sale con la columna de la suelta en pantalla, desde el tirador…
    a.tick(desde + 1);
    expect(clipFrame(atlas, 'attack', a.figura(quien).tiempo)).toBe(info.suelta);
    expect(proyectil()?.t).toBeCloseTo(0, 1);
    // …y justo antes del impacto está llegando; la víctima aún no se duele.
    a.tick(impacto * dura - 1);
    expect(proyectil()?.t).toBeCloseTo(1, 1);
    expect(a.figura(victima).clip).toBe('idle');
    expect(impacto * dura - desde).toBeCloseTo(VUELO_MS);
    // En el impacto: sin proyectil, la cifra y el daño con su reloj desde ahí.
    a.tick(impacto * dura + 30);
    expect(proyectil()).toBeUndefined();
    expect(danio()).toBe(true);
    expect(a.figura(victima).clip).toBe('hurt');
    expect(a.figura(victima).tiempo).toBeCloseTo(30);
    a.tick(dura + 1);
    expect(a.busy).toBe(false);
  });

  it('quien no tiene suelta en su hoja dispara como siempre: el proyectil sale en 0 y el paso dura lo de siempre', () => {
    // El liche lanza con el bastón y nadie ha medido dónde «suelta» su clip.
    for (const tirador of ['lich', 'peasant']) {
      expect(hojaDe(arteDe(tirador), MIRADA_DE_PRESENTACION).clips.attack.suelta).toBeUndefined();
      expect(relojDelDisparo(tirador)).toEqual({ dura: DURACION.shoot, impacto: 0.55, suelta: 0 });
      const { a, proyectil } = disparo(tirador);
      a.tick(1);
      expect(proyectil()?.t, tirador).toBeCloseTo(0, 1);
      a.tick(DURACION.shoot + 1);
      expect(a.busy, tirador).toBe(false);
    }
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
    a.tick(msPorCasilla('peasant', 'walk', ALTO_DE_FIGURA.normal) + 1);
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
    a.tick(msPorCasilla('peasant', 'walk', ALTO_DE_FIGURA.normal));
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
    const casilla = msPorCasilla('peasant', 'walk', ALTO_DE_FIGURA.normal);
    a.tick(3 * casilla - 1);
    expect(a.busy).toBe(true);
    a.tick(3 * casilla + 1);
    expect(a.busy).toBe(false);
    // La carrera avanza más por ciclo con el mismo reloj: la casilla dura menos.
    expect(msPorCasilla('peasant', 'charge', ALTO_DE_FIGURA.normal)).toBeLessThan(casilla);
    // Y una figura grande da zancadas más largas.
    expect(msPorCasilla('peasant', 'walk', ALTO_DE_FIGURA.grande)).toBeLessThan(casilla);
    expect(() => msPorCasilla('peasant', 'attack', 1)).toThrow(/no anda/);
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
    const casilla = msPorCasilla('peasant', 'walk', ALTO_DE_FIGURA.normal);
    a.tick(casilla / 2 - 1);
    expect(a.busy).toBe(true);
    a.tick(casilla / 2 + 1);
    expect(a.busy).toBe(false);
    expect(a.figura(s1).en).toEqual(planoDeHex(destino));
  });
});
