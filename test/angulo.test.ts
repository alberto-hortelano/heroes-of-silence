import { describe, expect, it } from 'vitest';
import { accionContra, masCercana, opcionesDeGolpe } from '../src/client/escenas/angulo.js';
import { EscenaBatalla, rotuloDeAngulo } from '../src/client/escenas/batalla.js';
import { marcadoDe } from '../src/client/html.js';
import { cajaDeFigura } from '../src/client/render/batalla.js';
import { centroDeStack, centroHex, tableroPara } from '../src/client/render/proyeccion.js';
import type { Session } from '../src/client/session.js';
import { renderSide } from '../src/client/views/panels.js';
import { textoDePrevision } from '../src/client/views/prevision.js';
import { isAlive, stackHexes } from '../src/core/battle/battle.js';
import { hexDistance } from '../src/core/battle/board.js';
import { CARGA } from '../src/core/battle/carga.js';
import { unidadDelJuego } from '../src/core/catalogo.js';
import { isShooter } from '../src/core/data.js';

import type { Hex, UnitInfo } from '../src/core/types.js';
import { sesionContraMonstruo } from './batalla-de-cliente.js';
import { PESADA } from './helpers.js';

/**
 * Elegir desde dónde golpear (decisión del usuario, 02-10-2026): al pasar por un
 * enemigo se resaltan las casillas desde las que se le alcanza y la más cercana
 * al puntero es la del clic. Sustituye a «el primer `from` de la lista».
 */
const tablero = tableroPara(1086, 778);
const enemigo: Hex = { col: 5, row: 4 };
const golpeDesde = (h: Hex) => ({ type: 'attack', target: 'e', from: h }) as const;
const oeste = golpeDesde({ col: 4, row: 4 });
const este = golpeDesde({ col: 6, row: 4 });
const arriba = golpeDesde({ col: 4, row: 3 });

describe('el ángulo del golpe', () => {
  it('con el puntero a cada lado del enemigo, gana la casilla de ese lado', () => {
    const opciones = opcionesDeGolpe([oeste, arriba, este], 'e', { col: 0, row: 0 });
    const c = centroHex(tablero, enemigo);
    const paso = tablero.paso;
    expect(masCercana(opciones, tablero, c.x - paso * 0.3, c.y)?.accion).toBe(oeste);
    expect(masCercana(opciones, tablero, c.x + paso * 0.3, c.y)?.accion).toBe(este);
    // Arriba a la izquierda, la de arriba: no es «la primera de la lista». El
    // desplazamiento vertical va aplastado como el tablero.
    const arribaIzq = { x: c.x - paso * 0.2, y: c.y - paso * 0.35 * tablero.compresion };
    expect(masCercana(opciones, tablero, arribaIzq.x, arribaIzq.y)?.accion).toBe(arriba);
  });

  it('pegado, la casilla en la que ya está es una opción más', () => {
    const quieto = { type: 'attack', target: 'e' } as const;
    const aqui: Hex = { col: 4, row: 4 };
    const opciones = opcionesDeGolpe([quieto, este], 'e', aqui);
    expect(opciones.map((o) => o.desde)).toEqual([aqui, este.from]);
    const c = centroHex(tablero, enemigo);
    expect(masCercana(opciones, tablero, c.x - tablero.paso * 0.3, c.y)?.accion).toBe(quieto);
    expect(masCercana(opciones, tablero, c.x + tablero.paso * 0.3, c.y)?.accion).toBe(este);
  });

  it('la barra dice la casilla y, si carga, cuánto, con el tanto por ciento que trae la carga', () => {
    expect(rotuloDeAngulo({ col: 4, row: 4 }, undefined)).toBe('Golpearías desde (4,4).');
    expect(
      rotuloDeAngulo(
        { col: 4, row: 4 },
        { target: 'e', at: { col: 4, row: 4 }, hexes: 4, porciento: 20 },
      ),
    ).toBe('Golpearías desde (4,4), cargando 4 casillas (+20 % de daño).');
  });

  it('sin golpes contra ese enemigo no hay nada que elegir', () => {
    const otro = { type: 'attack', target: 'x' } as const;
    expect(
      accionContra([otro], 'e', { col: 9, row: 9 }, { col: 0, row: 0 }, tablero, 0, 0),
    ).toBeUndefined();
    expect(masCercana([], tablero, 0, 0)).toBeUndefined();
  });
});

/**
 * Una batalla de la persona con su unidad activa dos filas debajo de un enemigo
 * en campo abierto, y todo lo demás apartado: el enemigo se alcanza por los dos
 * lados con cualquier velocidad, porque la más lenta anda 2.
 */
function sesionConEnemigoALaVista(
  enRival: Hex = { col: 5, row: 4 },
  criatura?: string,
): {
  s: Session;
  activo: string;
  objetivo: string;
} {
  const s = sesionContraMonstruo();
  const b = s.battle;
  const turno = s.turnoPropio;
  if (b === null || turno === null)
    throw new Error('la sesión no abre la batalla con turno propio');
  const rival = b.stacks.find((x) => isAlive(x) && x.side !== s.miBando);
  if (rival === undefined) throw new Error('no hay enemigo');
  let propios = 0;
  let ajenos = 0;
  for (const x of b.stacks) {
    if (x === turno.stack || x === rival) continue;
    x.hex = x.side === s.miBando ? { col: propios++, row: 0 } : { col: 10 - ajenos++, row: 8 };
  }
  turno.stack.hex = { col: 5, row: 6 };
  rival.hex = enRival;
  // Antes de la primera lectura de la lista legal: la sesión la guarda por jugada.
  // Sin una pedida, la que pega cuerpo a cuerpo de los helpers si la activa
  // dispara: la batalla que se halla depende del mapa (con las puertas de las
  // ciudades, la ciudad amurallada, la primera era de un arquero).
  const unidad = criatura ?? (disparaLaActiva(s) ? PESADA : undefined);
  if (unidad !== undefined) (turno.stack as { unit: UnitInfo }).unit = unidadDelJuego(unidad);
  if (isShooterActivo(s)) throw new Error('la unidad activa dispara: el ángulo no se ve');
  return { s, activo: turno.stack.id, objetivo: rival.id };
}

function isShooterActivo(s: Session): boolean {
  return s.battleLegalActions().some((a) => a.type === 'aim');
}

/** Si la activa dispara, sin leer la lista legal (que la sesión guarda por jugada). */
function disparaLaActiva(s: Session): boolean {
  const activa = s.turnoPropio?.stack;
  return activa !== undefined && isShooter(activa.unit);
}

describe('el clic sobre un enemigo elige el ángulo', () => {
  it('dos píxeles del mismo enemigo mandan dos `from` distintos, cada uno de su lado', () => {
    const [ancho, alto] = [1086, 778];
    const desdeDondeGolpea = (lado: -1 | 1): Hex => {
      const { s, activo, objetivo } = sesionConEnemigoALaVista();
      const escena = new EscenaBatalla(() => s);
      escena.encuadrar(ancho, alto);
      const rival = s.battle!.stacks.find((x) => x.id === objetivo)!;
      const k = cajaDeFigura(tableroPara(ancho, alto), centroDeStack(stackHexes(rival)));
      const px = k.x + lado * k.ancho * 0.45;
      const py = k.suelo - 2;
      expect(escena.objetivoEn(px, py)?.id).toBe(objetivo);
      // Lo resaltado es lo que manda el clic: el ángulo y la acción coinciden.
      escena.mover(px, py);
      const angulo = escena.anguloEn(px, py);
      expect(angulo).not.toBeNull();
      expect(angulo!.candidatas.length).toBeGreaterThan(1);
      expect(s.status).toContain(
        `Golpearías desde (${angulo!.elegida.col},${angulo!.elegida.row})`,
      );
      const antes = s.battle!.log.length;
      escena.pulsar(px, py);
      const movido = s
        .battle!.log.slice(antes)
        .find(
          (e): e is Extract<typeof e, { kind: 'move' }> => e.kind === 'move' && e.stack === activo,
        );
      expect(movido).toBeDefined();
      expect(movido!.to).toEqual(angulo!.elegida);
      return movido!.to;
    };
    const izquierda = desdeDondeGolpea(-1);
    const derecha = desdeDondeGolpea(1);
    expect(izquierda).not.toEqual(derecha);
    const t = tableroPara(ancho, alto);
    expect(centroHex(t, izquierda).x).toBeLessThan(centroHex(t, enemigo).x);
    expect(centroHex(t, derecha).x).toBeGreaterThan(centroHex(t, enemigo).x);
  });
});

describe('el clic sobre un enemigo al que no se llega', () => {
  it('pinta el motivo del núcleo y no una frase del cliente (H2)', () => {
    // Al otro extremo del tablero, donde no llega en un turno ninguna velocidad.
    const { s, objetivo } = sesionConEnemigoALaVista({ col: 11, row: 0 });
    const [ancho, alto] = [1086, 778];
    const rival = s.battle!.stacks.find((x) => x.id === objetivo)!;
    const escena = new EscenaBatalla(() => s);
    escena.encuadrar(ancho, alto);
    const k = cajaDeFigura(tableroPara(ancho, alto), centroDeStack(stackHexes(rival)));
    const antes = s.battle!.log.length;
    escena.pulsar(k.x, k.suelo - k.alto / 2);
    expect(s.battle!.log.length).toBe(antes);
    expect(s.status).toBe('No alcanza a esa unidad cuerpo a cuerpo este turno.');
  });

  it('al pasar el ratón ya lo dice, con la misma frase que el clic, y se quita al salir (N3)', () => {
    const { s, objetivo } = sesionConEnemigoALaVista({ col: 11, row: 0 });
    const [ancho, alto] = [1086, 778];
    const rival = s.battle!.stacks.find((x) => x.id === objetivo)!;
    const escena = new EscenaBatalla(() => s);
    escena.encuadrar(ancho, alto);
    const k = cajaDeFigura(tableroPara(ancho, alto), centroDeStack(stackHexes(rival)));
    const antes = s.battle!.log.length;
    escena.mover(k.x, k.suelo - k.alto / 2);
    expect(s.status).toBe(s.attackRejection(objetivo));
    expect(s.status).toBe('No alcanza a esa unidad cuerpo a cuerpo este turno.');
    expect(s.battle!.log.length).toBe(antes);
    escena.salir();
    expect(s.status).toBe('');
  });

  it('sobre un enemigo al que sí se golpea no sale motivo, sale el ángulo (N3)', () => {
    const { s, objetivo } = sesionConEnemigoALaVista();
    const [ancho, alto] = [1086, 778];
    const rival = s.battle!.stacks.find((x) => x.id === objetivo)!;
    const escena = new EscenaBatalla(() => s);
    escena.encuadrar(ancho, alto);
    const k = cajaDeFigura(tableroPara(ancho, alto), centroDeStack(stackHexes(rival)));
    escena.mover(k.x, k.suelo - 2);
    expect(s.status).toMatch(/^Golpearías desde/);
  });
});

describe('el panel dice lo que le queda al tramo', () => {
  it('«Le queda 1 casilla», en singular (QA, H3)', () => {
    const { s } = sesionConEnemigoALaVista({ col: 10, row: 2 });
    // Tramos de una casilla hasta que solo quede una.
    for (let guard = 0; (s.battleStepsLeft() ?? 0) > 1 && guard < 10; guard++) {
      const aqui = s.turnoPropio!.stack.hex;
      const paso = s
        .battleLegalActions()
        .find((a) => a.type === 'move' && hexDistance(a.to, aqui) === 1);
      if (paso === undefined) throw new Error('no hay una vecina libre a la que dar un paso');
      s.playBattleAction(paso);
    }
    expect(s.battleStepsLeft()).toBe(1);
    const panel = marcadoDe(renderSide(s));
    expect(panel).toContain('<span class="label">Le queda</span><span>1 casilla</span>');
    expect(panel).not.toContain('1 casillas');
  });
});

describe('la ayuda de la carga, con las cifras de quien carga (QA, N2)', () => {
  it('a pie (desde el 19-10-2026, toda unidad carga) con las suyas; el jinete, con las suyas', () => {
    const AYUDA = 'Al enemigo en naranja se le puede cargar';
    const aPie = marcadoDe(renderSide(sesionConEnemigoALaVista(undefined, 'templario-escudo').s));
    expect(aPie).toContain(AYUDA);
    expect(aPie).toContain(`+${CARGA.aPie.porcentaje} % cada una`);
    const jinete = marcadoDe(
      renderSide(sesionConEnemigoALaVista(undefined, 'templario-hermano-de-carga').s),
    );
    expect(jinete).toContain(AYUDA);
    expect(jinete).toContain(`+${CARGA.jinete.porcentaje} % cada una`);
  });
});

describe('la carga en el cliente: el enemigo en la recta (QA, H1)', () => {
  // Jinete en (5,6) y el rival en (9,6): la recta E pasa por (6,6), (7,6) y
  // (8,6), y desde (8,6) el rival es la casilla siguiente. La única carga.
  const montar = () => sesionConEnemigoALaVista({ col: 9, row: 6 }, 'templario-hermano-de-carga');
  const [ancho, alto] = [1086, 778];
  const t = tableroPara(ancho, alto);

  it('se anuncia contra el enemigo y desde la casilla de su recta, y nada más', () => {
    const { s, objetivo } = montar();
    expect(s.battleCharges()).toEqual([
      { target: objetivo, at: { col: 8, row: 6 }, hexes: 3, porciento: 30 },
    ]);
  });

  it('una casilla vacía de la recta solo mueve, y la barra no promete carga', () => {
    for (const casilla of [
      { col: 7, row: 6 },
      { col: 8, row: 6 },
    ]) {
      const { s, activo } = montar();
      const escena = new EscenaBatalla(() => s);
      escena.encuadrar(ancho, alto);
      const c = centroHex(t, casilla);
      escena.mover(c.x, c.y);
      expect(s.status).not.toMatch(/carg/i);
      const antes = s.battle!.log.length;
      escena.pulsar(c.x, c.y);
      const nuevos = s.battle!.log.slice(antes);
      expect(nuevos.map((e) => e.kind)).toEqual(['move']);
      expect(s.battle!.turno?.stack).toBe(activo);
    }
  });

  it('el clic sobre el enemigo, por el lado de la recta, golpea desde ella y carga', () => {
    const { s, objetivo } = montar();
    const escena = new EscenaBatalla(() => s);
    escena.encuadrar(ancho, alto);
    const rival = s.battle!.stacks.find((x) => x.id === objetivo)!;
    const k = cajaDeFigura(t, centroDeStack(stackHexes(rival)));
    // A la altura del centro de su casilla y hacia el oeste: el lado de la recta.
    const px = k.x - k.ancho * 0.45;
    const py = centroHex(t, rival.hex).y;
    expect(escena.objetivoEn(px, py)?.id).toBe(objetivo);
    escena.mover(px, py);
    expect(escena.anguloEn(px, py)?.elegida).toEqual({ col: 8, row: 6 });
    // La frase entera: el ángulo, la carga y la previsión del golpe, que sale de
    // la sesión (la cuenta del núcleo) y la escribe `textoDePrevision`.
    const golpeQueDaria = escena.accionContraEn(px, py)!;
    const prevision = s.prevision(golpeQueDaria)!;
    expect(prevision).toMatchObject({ kind: 'golpe', objetivo });
    expect(s.status).toBe(
      rotuloDeAngulo(
        { col: 8, row: 6 },
        { target: objetivo, at: { col: 8, row: 6 }, hexes: 3, porciento: 30 },
        textoDePrevision(prevision, (id) => id),
      ),
    );
    expect(s.status).toContain('carga de 3 casillas ×1,3');
    expect(s.status).toContain('(+30 % de daño)');
    const antes = s.battle!.log.length;
    escena.pulsar(px, py);
    // Primero anda (la carrera de la carga) y luego elige en la rueda (F5).
    expect(s.ruedaPendiente?.fase).toBe('golpe');
    expect(s.ruedaPendiente?.prevision.carga).not.toBeNull();
    s.elegirEnLaRueda('normal');
    const golpe = s.battle!.log.slice(antes).find((e) => e.kind === 'attack' && !e.retaliation);
    expect(golpe?.kind === 'attack' ? golpe.charge : undefined).toBe(3);
  });
});
