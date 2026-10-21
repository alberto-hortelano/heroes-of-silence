/**
 * La ciudad amurallada en los mapas del juego (20-10-2026,
 * `docs/agents/2026-10-20-ciudad-amurallada/`): cada ciudad es un recinto de
 * muralla con casas dentro (`recinto.ts`), recontado desde lo puesto.
 *
 * - Cada ciudad, su recinto: ocho torres, una puerta por cara con puerta
 *   (vuelta 2: el octógono), tramos y casas, todos con su objeto, su papel
 *   (`Sprite.recinto`) y el pie dentro.
 * - Lo de dentro es la plaza (criterio 8b): ni paredes del relieve, ni bajadas,
 *   ni rampas, ni masa, cubierta o rocas con el pie en sus casillas.
 * - La marca del dueño va encima del recinto entero, y quien está en una de sus
 *   casillas, delante (`claveDeObjeto`, `claveDeFigura`).
 * - Los guardias del recinto, a 0: ninguna senda por el anillo, ninguna fuera
 *   de un arco, el anillo cerrado, ninguna casa repetida al lado, y las
 *   casillas de barrera junto a él con su formación (la salida recta de una
 *   puerta las pisaba: s21, s25, s32). Los demás guardias del informe los
 *   vigilan sus tests.
 *
 * En `pnpm verify`, s10 (la del desnivel dentro de un recinto, (27, 17)), s13
 * (la ciudad-puente de (25, 5)), s15 (la de la queja, (12, 16)) y s21, s25 y
 * s32 (una barrera junto a una puerta); en la orden lenta, 1-40.
 */
import { describe, expect, it } from 'vitest';
import { celdasDeLaRampa, claveDeCelda } from '../src/client/render/escenario/celdas.js';
import { componer, luzDelRecinto, puntosDeCelda } from '../src/client/render/escenario/colocar.js';
import { claveDe } from '../src/client/render/escenario/pintar.js';
import {
  casillasDelRecinto,
  EJE_DE_LA_CARA,
  enElRecinto,
  puertaDelEje,
  RADIO_DE_TORRE,
} from '../src/client/render/escenario/recinto.js';
import { claveDeFigura, escenarioDe } from '../src/client/render/escenario/superficie.js';
import { recintoDeLaCiudad } from '../src/core/map/recinto.js';
import { catalogoDelDisco, partidaDe } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

// Y s21, s25 y s32: la salida recta de una puerta pisaba la barrera de al lado.
// Y s3 y s36 (vuelta 3): la senda que baja por la columna de al lado del 3 × 3
// pisaba la torre de la esquina, y en s36 dos ciudades-puente con el río al sur.
const SEMILLAS = segunPrisa([3, 10, 13, 15, 21, 25, 32, 36], [...rango(1, 40)]);

describe('la ciudad amurallada en los mapas del juego', () => {
  for (const semilla of SEMILLAS)
    describe(`semilla ${semilla}`, () => {
      const { map, escena: e } = partidaDe(semilla);
      const ciudades = map.objects.filter((o) => o.kind === 'town');

      it('cada ciudad es su recinto: ocho torres, sus puertas, tramos y casas, con su objeto y el pie dentro', () => {
        expect(e.recintos.map((r) => r.id).sort()).toEqual(ciudades.map((o) => o.id).sort());
        for (const o of ciudades) {
          const r = e.recintos.find((k) => k.id === o.id);
          if (r === undefined) throw new Error(`s${semilla} ${o.id}: sin recinto`);
          expect(r.rect).toEqual(recintoDeLaCiudad(o.at, map.width, map.height));
          const piezas = e.sprites.filter((s) => s.objeto?.id === o.id && s.puente === undefined);
          const de = (que: string) => piezas.filter((s) => s.recinto === que);
          const donde = `s${semilla} ${o.id}`;
          expect(de('torre').length, donde).toBe(8);
          expect(
            de('puerta')
              .map((s) => s.src)
              .sort(),
            donde,
          ).toEqual(
            r.puertas.map((k) => `modulos/recinto/${puertaDelEje(EJE_DE_LA_CARA[k])}.webp`).sort(),
          );
          expect(r.puertas.length, donde).toBeGreaterThan(0);
          expect(de('tramo').length, donde).toBeGreaterThan(0);
          expect(de('casa').length, donde).toBeGreaterThanOrEqual(10);
          expect(
            piezas.every((s) => s.recinto !== undefined),
            donde,
          ).toBe(true);
          for (const s of piezas) {
            expect(s.objeto, donde).toEqual({ id: o.id, kind: 'town' });
            // La torre, por el centro de su base (su vértice): su pie es lo de delante.
            const y = s.recinto === 'torre' ? s.y - RADIO_DE_TORRE : s.y;
            expect(enElRecinto(r.rect, s.x, y), `${donde}: ${s.src} en ${s.x},${s.y}`).toBe(true);
          }
        }
      });

      it('dentro, la plaza: ni paredes, ni bajadas, ni rampas, ni masa, cubierta o rocas', () => {
        for (const r of e.recintos) {
          const dentro = new Set(casillasDelRecinto(r.rect).map(([x, y]) => `${x},${y}`));
          expect(
            e.relieve.celdas
              .filter((c) => puntosDeCelda(c).some(([x, y]) => enElRecinto(r.rect, x, y)))
              .map(claveDeCelda),
            r.id,
          ).toEqual([]);
          expect(
            e.relieve.bajadas.filter((b) => enElRecinto(r.rect, ...b.arriba)),
            r.id,
          ).toEqual([]);
          for (const k of e.relieve.rampas.flatMap(celdasDeLaRampa)) {
            const [vx, vy] = k.split(',').map(Number) as [number, number];
            expect(enElRecinto(r.rect, vx, vy), `${r.id}: rampa ${k}`).toBe(false);
          }
          const sobre = e.sprites.filter(
            (s) =>
              s.capa === 0 &&
              ['masa', 'cubierta', 'roca', 'orilla', 'pared'].includes(s.clase) &&
              dentro.has(`${Math.floor(s.x)},${Math.floor(s.y)}`),
          );
          expect(
            sobre.map((s) => `${s.clase} ${s.src} en ${s.x},${s.y}`),
            r.id,
          ).toEqual([]);
        }
      });

      it('la marca, encima de todo el recinto, y quien está dentro, delante', () => {
        const esc = escenarioDe(map, semilla);
        for (const r of e.recintos) {
          const piezas = e.sprites.filter((s) => s.objeto?.id === r.id && s.puente === undefined);
          const ultima = Math.max(...piezas.map(claveDe));
          expect(esc.claveDeObjeto.get(r.id), r.id).toBe(ultima);
          // Con los pies de quien está en la casilla, como `pisada`: la columna y la fila más los pies.
          for (const [x, y] of casillasDelRecinto(r.rect))
            expect(claveDeFigura(esc, x, y + 0.5), `${r.id} (${x}, ${y})`).toBeGreaterThanOrEqual(
              ultima,
            );
        }
      });

      it('el fuego de cada ciudad, en el medio de su recinto (también la ciudad-puente)', () => {
        const fuegos = e.luces.filter((l) => l.clase === 'fuego');
        for (const r of e.recintos) {
          const { x, y } = luzDelRecinto(r.rect);
          expect(
            fuegos.some((l) => l.x === x && l.y === y),
            r.id,
          ).toBe(true);
          expect(enElRecinto(r.rect, x, y), r.id).toBe(true);
        }
      });

      it('los guardias del recinto, a 0', () => {
        const i = e.informe;
        expect({
          recintoSobreSenda: i.recintoSobreSenda,
          sendaFueraDeLaPuerta: i.sendaFueraDeLaPuerta,
          anilloAbierto: i.anilloAbierto,
          puenteSobreElAnillo: i.puenteSobreElAnillo,
          casasRepetidasJuntas: i.casasRepetidasJuntas,
          casillasDeBarreraSinFormacion: i.casillasDeBarreraSinFormacion,
        }).toEqual({
          recintoSobreSenda: 0,
          sendaFueraDeLaPuerta: 0,
          anilloAbierto: 0,
          puenteSobreElAnillo: 0,
          casasRepetidasJuntas: 0,
          casillasDeBarreraSinFormacion: 0,
        });
      });
    });
});

describe('sin el arte del recinto, la ciudad se compone igual', () => {
  it('sin las hojas `muro`, `recinto` y `casas` ni los tramos de norte a sur: marcadores, y lo dice', () => {
    const c = catalogoDelDisco();
    const sinArte = {
      ...c,
      hojas: Object.fromEntries(
        Object.entries(c.hojas).filter(([h]) => !['muro', 'recinto', 'casas'].includes(h)),
      ),
      piezas: Object.fromEntries(
        Object.entries(c.piezas).filter(([id]) => id !== 'muro-ns-1' && id !== 'muro-ns-2'),
      ),
    };
    const { map } = partidaDe(15);
    const e = componer(map, 15, sinArte);
    expect(e.informe.modulosQueFaltan).toEqual(
      expect.arrayContaining(['casas', 'muro', 'recinto', 'muro-ns-1', 'muro-ns-2']),
    );
    for (const r of e.recintos) {
      const piezas = e.sprites.filter((s) => s.objeto?.id === r.id && s.puente === undefined);
      expect(piezas.length, r.id).toBeGreaterThan(4);
      for (const s of piezas) {
        expect(s.src, r.id).toBe(null);
        const y = s.recinto === 'torre' ? s.y - RADIO_DE_TORRE : s.y;
        expect(enElRecinto(r.rect, s.x, y), r.id).toBe(true);
      }
    }
  });
});
