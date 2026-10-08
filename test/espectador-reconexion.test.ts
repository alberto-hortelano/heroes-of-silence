/**
 * El espectador vuelve a llamar solo y reconoce una partida nueva (#104).
 *
 * La política vive en `espectador/reconexion.ts`, pura, porque `main.ts` toca
 * `document` al importarse. Lo que aquí no se prueba —que la barra cuente de
 * verdad en una página y que el servidor relanzado se reconozca— se ejerció con
 * un servidor real y Chromium (`docs/agents/2026-10-08-espectador-reconecta/`).
 */
import { describe, expect, it } from 'vitest';
import {
  ESPERA_MAXIMA_MS,
  esperaAntesDelIntento,
  INTENTOS_MAXIMOS,
  Mirada,
  PRIMERA_ESPERA_MS,
  partidaCorta,
  partidaDelMensaje,
  Reintentos,
  reconocerPartida,
  textoDeEspera,
  textoDeIntento,
  textoDeRendicion,
} from '../src/client/espectador/reconexion.js';
import type { SpectatorSnapshotMsg } from '../src/server/protocol.js';
import type { SpectatorView } from '../src/server/vista-espectador.js';

const URL = 'ws://localhost:3399';

describe('la espera entre intentos', () => {
  it('crece al doble desde un segundo y se planta en el tope', () => {
    const esperas = Array.from({ length: 8 }, (_, i) => esperaAntesDelIntento(i + 1));
    expect(esperas).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000]);
    expect(esperas[0]).toBe(PRIMERA_ESPERA_MS);
    expect(esperaAntesDelIntento(INTENTOS_MAXIMOS)).toBe(ESPERA_MAXIMA_MS);
  });

  it('nunca reintenta en bucle: ni una espera por debajo del segundo', () => {
    for (let n = 1; n <= INTENTOS_MAXIMOS; n++) {
      expect(esperaAntesDelIntento(n)).toBeGreaterThanOrEqual(1_000);
    }
  });

  it('un intento que no existe se dice', () => {
    expect(() => esperaAntesDelIntento(0)).toThrow(/se cuentan desde 1/);
    expect(() => esperaAntesDelIntento(1.5)).toThrow(/no existe/);
  });
});

describe('la cuenta de intentos', () => {
  it('se rinde tras el tope y no vuelve a llamar', () => {
    const r = new Reintentos();
    const vistos: number[] = [];
    for (;;) {
      const s = r.siguiente(0);
      if (s === null) break;
      vistos.push(s.intento);
      expect(s.en).toBe(esperaAntesDelIntento(s.intento));
    }
    expect(vistos).toEqual(Array.from({ length: INTENTOS_MAXIMOS }, (_, i) => i + 1));
    expect(r.siguiente(0)).toBeNull();
    // Unos diez minutos en total: ni un minuto ni una hora.
    const total = vistos.reduce((t, n) => t + esperaAntesDelIntento(n), 0);
    expect(total).toBe(631_000);
  });

  it('abrir el canal vuelve a empezar por la espera corta', () => {
    const r = new Reintentos();
    r.siguiente(0);
    r.siguiente(0);
    expect(r.siguiente(100)).toEqual({ intento: 3, en: 100 + 4_000 });
    r.conectado();
    expect(r.siguiente(500)).toEqual({ intento: 1, en: 500 + 1_000 });
  });
});

describe('lo que dice la barra', () => {
  it('cuánto falta, redondeado hacia arriba, y cuál de cuántos', () => {
    const s = { intento: 3, en: 10_000 };
    expect(textoDeEspera('cortada', URL, s, 6_200)).toBe(
      `Se ha cortado la conexión con ${URL}: lo que se ve es el último fotograma que llegó. ` +
        `Reintento 3 de ${INTENTOS_MAXIMOS} en 4 s.`,
    );
    // Con medio segundo por delante no se dice «en 0 s».
    expect(textoDeEspera('cortada', URL, s, 9_500)).toMatch(/en 1 s\.$/);
    expect(textoDeEspera('cortada', URL, s, 10_000)).toMatch(/en 0 s\.$/);
  });

  it('cada caída dice lo suyo', () => {
    const s = { intento: 1, en: 1_000 };
    expect(textoDeEspera('nadie', URL, s, 0)).toMatch(/^No hay nadie en .*pnpm partida/);
    expect(textoDeEspera('antes-de-empezar', URL, s, 0)).toMatch(/se ha ido antes de empezar/);
    expect(textoDeIntento('cortada', URL, 2)).toMatch(/Reintentando \(2 de 25\)…$/);
    expect(textoDeRendicion('nadie', URL)).toMatch(
      /Se dejó de reintentar tras 25 intentos.*recarga/,
    );
  });
});

describe('qué partida llega', () => {
  it('la primera, la misma y otra', () => {
    expect(reconocerPartida(null, 'a')).toBe('primera');
    expect(reconocerPartida('a', 'a')).toBe('misma');
    expect(reconocerPartida('a', 'b')).toBe('otra');
  });

  it('un fotograma sin id de partida se rechaza diciendo por qué', () => {
    expect(() => partidaDelMensaje({ type: 'snapshot' })).toThrow(/falta "partida".*pnpm partida/);
    expect(() => partidaDelMensaje({ type: 'snapshot', partida: '' })).toThrow(/falta "partida"/);
    expect(() => partidaDelMensaje({ type: 'snapshot', partida: 7 })).toThrow(/falta "partida"/);
    expect(partidaDelMensaje({ type: 'snapshot', partida: 'abc' })).toBe('abc');
  });

  it('el id corto distingue dos UUID a ojo', () => {
    expect(partidaCorta('3f2a9c10-aaaa-bbbb-cccc-dddddddddddd')).toBe('3f2a9c10');
  });
});

describe('el cambio de partida', () => {
  /**
   * Un fotograma de mapa sin batalla: al reproductor solo le importan
   * `partida` y `view.battle`, y el resto de la vista no se lee aquí.
   */
  function foto(partida: string, day: number): SpectatorSnapshotMsg {
    return {
      type: 'snapshot',
      partida,
      day,
      current: 1,
      finished: null,
      view: { battle: null } as unknown as SpectatorView,
    };
  }

  it('la primera y la misma siguen con el mismo reproductor y su cola', () => {
    const m = new Mirada();
    expect(m.llega(foto('a', 1))).toBe('primera');
    const rep = m.reproductor;
    expect(m.llega(foto('a', 2))).toBe('misma');
    expect(m.reproductor).toBe(rep);
    expect(m.partida).toBe('a');
    expect(m.anterior).toBeNull();
    expect(m.reproductor.paso(0).map((f) => f.day)).toEqual([1, 2]);
  });

  it('otra partida tira la cola de la vieja: no se pone ni un fotograma suyo', () => {
    const m = new Mirada();
    m.llega(foto('a', 7));
    m.llega(foto('a', 8));
    const viejo = m.reproductor;
    expect(m.llega(foto('b', 1))).toBe('otra');
    expect(m.reproductor).not.toBe(viejo);
    expect(m.partida).toBe('b');
    expect(m.anterior).toBe('a');
    // Los días 7 y 8 de la vieja estaban en cola sin poner: no salen.
    expect(m.reproductor.paso(0).map((f) => `${f.partida}:${f.day}`)).toEqual(['b:1']);
  });

  it('volver a la partida de antes también es otra: lo de en medio no es suyo', () => {
    const m = new Mirada();
    m.llega(foto('a', 1));
    m.llega(foto('b', 1));
    expect(m.llega(foto('a', 2))).toBe('otra');
    expect(m.anterior).toBe('b');
  });
});
