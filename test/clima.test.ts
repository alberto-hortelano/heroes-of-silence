/**
 * El clima (`core/state/clima.ts`): lo que sale de la semilla es determinista y
 * hace rachas y pocos frentes, la noche es mucho más frecuente en las tierras de
 * los no muertos, lo que pide el narrador se juzga pedido a pedido y caduca, y
 * `?clima=` se lee o se rechaza diciéndolo.
 */
import { describe, expect, it } from 'vitest';
import {
  CLIMA,
  climaDeLaPartida,
  climaSinRegiones,
  esDeNocheEn,
  forzarClima,
  nocheDeLaSemilla,
  parseClima,
  pedirClima,
  regionDelClima,
  TIEMPOS,
  type Tiempo,
  tiempoDeLaSemilla,
  tiempoDelSitio,
  validarClima,
} from '../src/core/state/clima.js';
import { newGame } from '../src/core/state/setup.js';

const REGIONES = Array.from({ length: 9 }, (_, k) => `region-${k}`);

describe('el tiempo de la semilla', () => {
  it('la misma semilla, el mismo día y la misma región dan lo mismo', () => {
    for (let d = 1; d <= 20; d++) {
      expect(tiempoDeLaSemilla(7, d, 'region-3')).toBe(tiempoDeLaSemilla(7, d, 'region-3'));
    }
    expect(climaDeLaPartida(newGame({ seed: 5 }))).toEqual(climaDeLaPartida(newGame({ seed: 5 })));
  });

  it('en 40 semillas × 20 días salen los cuatro, y casi siempre como mucho dos a la vez', () => {
    const vistos = new Set<Tiempo>();
    let dias = 0;
    let conDosOMenos = 0;
    for (let seed = 1; seed <= 40; seed++) {
      for (let d = 1; d <= 20; d++) {
        const hoy = new Set(REGIONES.map((r) => tiempoDeLaSemilla(seed, d, r)));
        for (const t of hoy) vistos.add(t);
        dias++;
        if (hoy.size <= 2) conDosOMenos++;
      }
    }
    expect([...vistos].sort()).toEqual([...TIEMPOS].sort());
    // Pocos frentes, no un mosaico.
    expect(conDosOMenos / dias).toBeGreaterThan(0.75);
  });
});

describe('la noche de la semilla', () => {
  it('en 40 semillas × 20 días, las tierras de los no muertos son de noche bastante más a menudo', () => {
    const proporcion = (dueño: Parameters<typeof nocheDeLaSemilla>[3]): number => {
      let noches = 0;
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) {
        for (const r of REGIONES) {
          for (let d = 1; d <= 20; d++) {
            total++;
            if (nocheDeLaSemilla(seed, d, r, dueño)) noches++;
          }
        }
      }
      return noches / total;
    };
    const noMuertos = proporcion('no-muertos');
    for (const otro of ['neutral', 'templarios', 'imperio', 'elfos', 'orkos'] as const) {
      expect(noMuertos).toBeGreaterThan(2.5 * proporcion(otro));
    }
    // Y la de los demás no es cero: de vez en cuando.
    expect(proporcion('neutral')).toBeGreaterThan(0.03);
  });

  it('`esDeNocheEn` lee la de la partida, y una región que no es del mapa lanza diciendo cuáles hay', () => {
    const s = newGame({ seed: 3 });
    const clima = climaDeLaPartida(s);
    s.map.regions.forEach((r, k) => {
      expect(esDeNocheEn(s, r.id)).toBe(clima.regiones[k]?.noche);
    });
    expect(() => esDeNocheEn(s, 'region-99')).toThrow(/no hay "region-99": hay region-0/);
  });
});

describe('las regiones del clima', () => {
  it('toda casilla tiene región, también las ciudades y las barreras', () => {
    const s = newGame({ seed: 11 });
    const r = regionDelClima(s.map);
    expect(r.length).toBe(s.map.width * s.map.height);
    expect([...r].every((k) => k >= 0 && k < s.map.regions.length)).toBe(true);
    const clima = climaDeLaPartida(s);
    for (const t of s.towns) {
      expect(TIEMPOS).toContain(tiempoDelSitio(clima, s.map, t.at).tiempo);
    }
  });
});

describe('lo que pide el narrador', () => {
  it('entra, manda sobre la semilla en su región y caduca a su día', () => {
    const s = newGame({ seed: 2 });
    const reg = s.map.regions[1];
    if (reg === undefined) throw new Error('el mapa no tiene una segunda región');
    const r = pedirClima(s, 0, [{ at: reg.at, weather: 'tormenta', night: true, days: 2 }]);
    expect(r.rechazos).toEqual([]);
    expect(r.aceptados).toEqual([
      { region: reg.id, nombre: reg.name, tiempo: 'tormenta', noche: true, hasta: s.day + 1 },
    ]);
    expect(climaDeLaPartida(s).regiones[1]).toEqual({ tiempo: 'tormenta', noche: true });
    s.day += 1;
    expect(climaDeLaPartida(s).regiones[1]).toEqual({ tiempo: 'tormenta', noche: true });
    s.day += 1;
    expect(climaDeLaPartida(s).regiones[1]).toEqual({
      tiempo: tiempoDeLaSemilla(s.seed, s.day, reg.id),
      noche: climaDeLaPartida(s).regiones[1]?.noche,
    });
    // Lo caducado se borra al volver a pedir.
    pedirClima(s, 0, []);
    expect(s.climaPedido).toEqual({});
  });

  it('cada pedido malo se rechaza solo, con su motivo', () => {
    const s = newGame({ seed: 2 });
    const [a, b] = s.map.regions;
    if (a === undefined || b === undefined) throw new Error('faltan regiones');
    const r = pedirClima(s, 0, [
      { at: { x: -1, y: 0 }, weather: 'lluvia' },
      { at: a.at, weather: 'granizo' },
      { at: a.at },
      { at: a.at, weather: 'niebla', days: CLIMA.diasMaximos + 2 },
      { at: a.at, weather: 'niebla' },
      { at: a.at, night: true },
      { at: b.at, weather: 'lluvia' },
    ]);
    expect(r.rechazos).toEqual([
      '(-1,0): (-1,0) está fuera del mapa',
      `(${a.at.x},${a.at.y}): "granizo" no es un tiempo: valen despejado, niebla, lluvia, tormenta`,
      `(${a.at.x},${a.at.y}): no pide nada: lleva "weather", "night" o los dos`,
      `(${a.at.x},${a.at.y}): days ${CLIMA.diasMaximos + 2}: va de 1 a ${CLIMA.diasMaximos} días`,
      `(${a.at.x},${a.at.y}): ${a.name} ya tiene su clima más arriba en esta misma respuesta`,
    ]);
    expect(r.aceptados.map((x) => x.region)).toEqual([a.id, b.id]);
  });

  it('entran como mucho los de un turno', () => {
    const s = newGame({ seed: 2 });
    const pedidos = s.map.regions.map((r) => ({ at: r.at, weather: 'niebla' }));
    const r = pedirClima(s, 0, pedidos);
    expect(r.aceptados).toHaveLength(CLIMA.porTurno);
    expect(r.rechazos[0]).toMatch(/ya han entrado \d+ este turno, que es el máximo/);
  });
});

describe('?clima=', () => {
  it('se lee: un tiempo, la noche y por región', () => {
    expect(parseClima(null)).toBeNull();
    expect(parseClima(' ')).toBeNull();
    expect(parseClima('lluvia,noche')).toEqual({
      todo: { tiempo: 'lluvia', noche: true },
      regiones: {},
    });
    expect(parseClima('region-0:tormenta,niebla,region-0:noche')).toEqual({
      todo: { tiempo: 'niebla' },
      regiones: { 'region-0': { tiempo: 'tormenta', noche: true } },
    });
  });

  it('lo que no se entiende lanza diciendo qué vale', () => {
    expect(() => parseClima('granizo')).toThrow(/"granizo" no es un clima: valen despejado/);
    expect(() => parseClima('lluvia,niebla')).toThrow(/dos tiempos para todo el mapa/);
    expect(() => parseClima('noche,dia')).toThrow(/noche y día a la vez/);
    expect(() => parseClima('lluvia,')).toThrow(/coma de más/);
  });

  it('forzado, manda sobre la partida; con una región que no hay, lanza', () => {
    const s = newGame({ seed: 4 });
    const clima = climaDeLaPartida(s);
    const forzado = forzarClima(clima, parseClima('niebla,region-0:tormenta'), s.map);
    expect(forzado.regiones[0]?.tiempo).toBe('tormenta');
    expect(forzado.regiones.slice(1).every((r) => r.tiempo === 'niebla')).toBe(true);
    expect(() => forzarClima(clima, parseClima('region-99:lluvia'), s.map)).toThrow(
      /en este mapa no hay "region-99": hay region-0…region-/,
    );
    expect(climaSinRegiones(parseClima('noche'), 'la arena')).toEqual({
      tiempo: 'despejado',
      noche: true,
    });
    expect(() => climaSinRegiones(parseClima('region-0:lluvia'), 'la arena')).toThrow(
      /la arena no tiene regiones/,
    );
  });
});

describe('data/clima.json', () => {
  it('lanza con todos sus problemas a la vez', () => {
    expect(() =>
      validarClima({
        tiempo: { pesos: { despejado: 2000 }, seguir: 'x', desvio: 1 },
        noche: { pesos: {}, seguir: 1 },
        diasMaximos: 0,
        porTurno: 4,
        sobra: 1,
      }),
    ).toThrow(/sobra.*tiempo\.pesos\.despejado.*tiempo\.pesos\.niebla.*diasMaximos/s);
  });
});
