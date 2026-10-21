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
 * - Las puertas pintadas son las del núcleo (`puertasDeLaCiudad`, vuelta 3,
 *   fase 3), y ninguna casa tapa donde pisa el héroe (llena, sin plaza mayor)
 *   ni el vano de un arco (H1 del QA de la ciudad llena, s16 (10, 7)).
 * - El óvalo del dueño, en el suelo de la plaza (`claveDeLaMarca`, H8), y quien
 *   está en una de sus casillas, delante del recinto entero (`claveDeFigura`).
 * - Los guardias del recinto, a 0: ninguna senda por el anillo, ninguna fuera
 *   de un arco, ninguna puerta sin su camino (`puertaSinCamino`), el anillo
 *   cerrado, ninguna casa repetida al lado, y las
 *   casillas de barrera junto a él con su formación (la salida recta de una
 *   puerta las pisaba: s21, s25, s32). Los demás guardias del informe los
 *   vigilan sus tests.
 *
 * En `pnpm verify`, s10 (la del desnivel dentro de un recinto, (27, 17)), s13
 * (la ciudad-puente de (25, 5)), s15 (la de la queja, (12, 16)), s16 (los arcos
 * tapados de H1) y s21, s25 y s32 (una barrera junto a una puerta); en la orden
 * lenta, 1-40.
 */
import { describe, expect, it } from 'vitest';
import { celdasDeLaRampa, claveDeCelda } from '../src/client/render/escenario/celdas.js';
import {
  componer,
  luzDelRecinto,
  puntosDeCelda,
  type Sprite,
} from '../src/client/render/escenario/colocar.js';
import { claveDe } from '../src/client/render/escenario/pintar.js';
import {
  ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO,
  arcosTapados,
  type Cara,
  type CaraDelContorno,
  casillasDelRecinto,
  contornoDelRecinto,
  EJE_DE_LA_CARA,
  enElRecinto,
  puertaDelEje,
  RADIO_DE_TORRE,
  tapaElPieDelHeroe,
} from '../src/client/render/escenario/recinto.js';
import { claveDeFigura, escenarioDe } from '../src/client/render/escenario/superficie.js';
import { puertasDeLaCiudad, recintoDeLaCiudad } from '../src/core/map/recinto.js';
import { catalogoDelDisco, partidaDe } from './helpers.js';
import { rango, segunPrisa } from './lento.js';

// Y s21, s25 y s32: la salida recta de una puerta pisaba la barrera de al lado.
// Y s3 y s36 (vuelta 3): la senda que baja por la columna de al lado del 3 × 3
// pisaba la torre de la esquina, y en s36 dos ciudades-puente con el río al sur.
/** Los módulos de la hoja `casas` por su imagen: su silueta, que el sprite no lleva. */
const MODULOS_DE_CASAS = new Map(
  (catalogoDelDisco().hojas.casas ?? []).flatMap((m) =>
    m.silueta === undefined ? [] : [[m.src, { nombre: m.nombre, silueta: m.silueta }] as const],
  ),
);

/**
 * Lo que el pie de un tramo de norte a sur del recinto puede quedar de lado de
 * su cara: medio paso de su tirada (`tiradaNorteSur`, dos piezas), el mayor de
 * los dos módulos.
 */
const MEDIO_PASO_DE_LADO =
  Math.max(
    ...['muro-ns-1', 'muro-ns-2'].map((id) => {
      const p = catalogoDelDisco().piezas[id];
      if (p?.tirada === undefined) throw new Error(`falta ${id} en el catálogo, con su tirada`);
      return (p.tirada[0] * ALTO_DEL_TRAMO_NORTE_SUR_DEL_RECINTO) / p.nh / 2;
    }),
  ) + 1e-9;

/** Lo que el pie de una pieza `s` queda de un punto de su cara `k` (el medio, o el vértice de abajo). */
const cerca = (s: Sprite, k: CaraDelContorno) =>
  Math.min(...[k.medio, k.a, k.b].map(([x, y]) => Math.hypot(s.x - x, s.y - y)));

/** El sprite tal como lo lee `tapaElArco`: sin `ancho` ni marcador. */
const pie = (s: Sprite) => ({
  x: s.x,
  y: s.y,
  alto: s.alto,
  nw: s.nw,
  nh: s.nh,
  ax: s.ax,
  ay: s.ay,
});

// Y s16: tres casas tapaban el arco del noroeste (H1 del QA de la ciudad llena).
const SEMILLAS = segunPrisa([3, 10, 13, 15, 16, 21, 25, 32, 36], [...rango(1, 40)]);

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
            // La tirada de norte a sur de las caras del este y del oeste va
            // centrada en su cara con el sesgo del arte a los dos lados
            // (`tiradaNorteSur`): sus pies, a medio paso de la cara como mucho.
            const sesgo = /^muro-ns-/.test(s.src ?? '') ? MEDIO_PASO_DE_LADO : 0;
            expect(
              [-sesgo, sesgo].some((d) => enElRecinto(r.rect, s.x + d, y)),
              `${donde}: ${s.src} en ${s.x},${s.y}`,
            ).toBe(true);
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

      it('las puertas pintadas son las del núcleo: donde llega un camino, y la del río', () => {
        for (const o of ciudades) {
          const r = e.recintos.find((k) => k.id === o.id);
          expect([...(r?.puertas ?? [])].sort(), `s${semilla} ${o.id}`).toEqual(
            puertasDeLaCiudad(map, o.at)
              .map((p) => p.cara)
              .sort(),
          );
        }
      });

      it('donde pisa el héroe, libre: ninguna casa lo tapa', () => {
        for (const r of e.recintos) {
          const c = contornoDelRecinto(r.rect);
          const casas = e.sprites.filter((s) => s.objeto?.id === r.id && s.recinto === 'casa');
          for (const s of casas)
            expect(tapaElPieDelHeroe(c, s), `${r.id}: ${s.src} en ${s.x},${s.y}`).toBe(false);
        }
      });

      it('ninguna casa tapa el vano del arco de una puerta (H1), con la clave con que se pintan', () => {
        for (const r of e.recintos) {
          const c = contornoDelRecinto(r.rect);
          const piezas = e.sprites.filter((s) => s.objeto?.id === r.id && s.puente === undefined);
          const casas = piezas
            .filter((s) => s.recinto === 'casa')
            .map((s) => {
              const m = MODULOS_DE_CASAS.get(s.src ?? '');
              if (m === undefined) throw new Error(`${r.id}: la casa ${s.src} no es de la hoja`);
              // Con su clave: la que baja con una pieza del anillo
              // (`techoDeLaCasa`) se pinta antes de lo que su pie diría.
              return { ...pie(s), ...m, clave: claveDe(s) };
            });
          const arcos = r.puertas.map((cara: Cara) => {
            // La pieza de su eje con el pie más cerca del medio de su cara (o
            // de su vértice de abajo, `deVerticeAVertice`).
            const k = c.caras.find((q) => q.cara === cara);
            if (k === undefined) throw new Error(cara);
            const src = `modulos/recinto/${puertaDelEje(EJE_DE_LA_CARA[cara])}.webp`;
            const [p] = piezas
              .filter((s) => s.recinto === 'puerta' && s.src === src)
              .sort((a, b) => cerca(a, k) - cerca(b, k));
            if (p === undefined) throw new Error(`s${semilla} ${r.id}: sin la puerta ${cara}`);
            return { cara, clave: claveDe(p) };
          });
          expect(arcosTapados(c, arcos, casas), r.id).toEqual([]);
        }
      });

      it('el óvalo del dueño, en el suelo de la plaza (H8); quien está dentro, delante', () => {
        const esc = escenarioDe(map, semilla);
        for (const r of e.recintos) {
          const piezas = e.sprites.filter((s) => s.objeto?.id === r.id && s.puente === undefined);
          const ultima = Math.max(...piezas.map(claveDe));
          expect(esc.claveDeObjeto.get(r.id), r.id).toBe(ultima);
          // El óvalo cuelga de su asiento hacia el sur: lo que se levanta más al
          // sur se pinta después y lo tapa; lo de más al norte no llega a él.
          const asiento = esc.asientoDeObjeto.get(r.id) as readonly [number, number];
          const marca = esc.claveDeLaMarca.get(r.id) as number;
          expect(marca, r.id).toBe(asiento[1]);
          expect(marca, r.id).toBeLessThan(ultima);
          for (const s of piezas.filter((p) => p.recinto === 'casa' && p.y > asiento[1]))
            expect(claveDe(s), `${r.id}: ${s.src}`).toBeGreaterThan(marca);
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
          arcosTapados: i.arcosTapados,
          testerosAMediaTirada: i.testerosAMediaTirada,
          anilloMalOrdenado: i.anilloMalOrdenado,
          casillasDeBarreraSinFormacion: i.casillasDeBarreraSinFormacion,
          puertaSinCamino: i.puertaSinCamino,
        }).toEqual({
          recintoSobreSenda: 0,
          sendaFueraDeLaPuerta: 0,
          anilloAbierto: 0,
          puenteSobreElAnillo: 0,
          casasRepetidasJuntas: 0,
          arcosTapados: 0,
          testerosAMediaTirada: 0,
          anilloMalOrdenado: 0,
          casillasDeBarreraSinFormacion: 0,
          puertaSinCamino: 0,
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
