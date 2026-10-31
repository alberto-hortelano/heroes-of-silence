/**
 * La revisión del maniquí (`tools/taller/revision/maniqui.ts`): con esqueletos
 * fabricados, que avise de lo que debe —una marcha que anda hacia atrás, un reposo
 * que se mueve, un arma que se pierde en unos fotogramas— y no de lo que no; que los
 * maniquíes del piloto no anden hacia atrás; y que la compuerta del trabajador mande
 * a `fallido/`, con su motivo, el encargo cuyo maniquí no vale.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { carpetaDeManiqui } from '../tools/art/poses.js';
import { Cola } from '../tools/taller/cola.js';
import type { Encargo } from '../tools/taller/encargo.js';
import {
  armaIlegible,
  type CeldaDeHuesos,
  maniquiBlocker,
  rechazarSiElManiquiFalla,
  revisarElManiqui,
  seMiraElArma,
  sentidoDeLaMarcha,
  UMBRAL_DEL_VAIVEN,
  vaivenDelReposo,
} from '../tools/taller/revision/maniqui.js';

/** Un esqueleto de una celda: lo justo para medir, en el mundo y en pantalla. */
function celda(o: {
  izq?: readonly [number, number, number];
  der?: readonly [number, number, number];
  cadera?: readonly [number, number, number];
  arma?: readonly [readonly [number, number, number], readonly [number, number, number]];
}): CeldaDeHuesos {
  const izq = o.izq ?? [0.1, 0.05, 0];
  const der = o.der ?? [-0.1, 0.05, 0];
  const cadera = o.cadera ?? [0, 0.95, 0];
  return {
    huesos: { Spine2: [190, 170, -0.92], Hips: [190, 200, -0.92] },
    mundo: {
      Hips: [...cadera],
      Head: [cadera[0], cadera[1] + 0.65, cadera[2]],
      HeadTop_End: [0, 1.8, 0],
      LeftFoot: [...izq],
      RightFoot: [...der],
    },
    atrezo: o.arma === undefined ? [] : [[[...o.arma[0]], [...o.arma[1]]]],
  };
}

/** Una marcha: el pie izquierdo apoyado (más bajo) va de z0 a z0 + paso por fotograma. */
const marcha = (paso: number) =>
  Array.from({ length: 7 }, (_, i) => celda({ izq: [0.1, 0.02, i * paso], der: [-0.1, 0.12, 0] }));

describe('el sentido de la marcha, en el mundo', () => {
  it('el pie de apoyo hacia +z (hacia donde mira) es andar hacia atrás', () => {
    expect(sentidoDeLaMarcha(marcha(0.05))).toBeGreaterThan(0);
  });
  it('hacia −z, el suelo pasa hacia atrás: anda hacia delante', () => {
    expect(sentidoDeLaMarcha(marcha(-0.05))).toBeLessThan(0);
  });
  it('solo cuenta el pie que está abajo en los dos fotogramas', () => {
    // El que va por el aire (el derecho, más alto) avanza: no dice nada.
    const enElAire = Array.from({ length: 7 }, (_, i) =>
      celda({ izq: [0.1, 0.02, -i * 0.05], der: [-0.1, 0.2, i * 0.3] }),
    );
    expect(sentidoDeLaMarcha(enElAire)).toBeLessThan(0);
  });
});

describe('el reposo que se mueve', () => {
  it('una cadera que recorre 0,1 del alto avisa; una quieta, no', () => {
    const quieto = Array.from({ length: 7 }, () => celda({}));
    expect(vaivenDelReposo(quieto)).toBeLessThan(UMBRAL_DEL_VAIVEN);
    const mueve = Array.from({ length: 7 }, (_, i) =>
      celda({ cadera: [i === 3 ? 0.18 : 0, 0.95, 0] }),
    );
    expect(vaivenDelReposo(mueve)).toBeCloseTo(0.1, 2);
    expect(vaivenDelReposo(mueve)).toBeGreaterThan(UMBRAL_DEL_VAIVEN);
  });
});

describe('el arma que no se lee', () => {
  const nada = () => 0;
  it('de punta solo en algunos fotogramas: avisa de esos', () => {
    const celdas = Array.from({ length: 7 }, (_, i) =>
      celda({
        arma: [
          [200, 100, -0.9],
          [200, i === 2 || i === 3 ? 115 : 180, -0.9],
        ],
      }),
    );
    expect(armaIlegible(celdas, nada)).toEqual([
      { fotograma: 3, motivo: 'escorzo' },
      { fotograma: 4, motivo: 'escorzo' },
    ]);
  });
  it('detrás del pecho en unos sí y en otros no: avisa de los de detrás', () => {
    // El alfa dice que el eje cae en la silueta; la z, si está detrás de Spine2 (−0,92).
    const dentro = () => 255;
    const celdas = Array.from({ length: 7 }, (_, i) =>
      celda({
        arma: [
          [200, 100, i === 5 ? -0.8 : -0.95],
          [200, 180, i === 5 ? -0.8 : -0.95],
        ],
      }),
    );
    expect(armaIlegible(celdas, dentro)).toEqual([{ fotograma: 6, motivo: 'tapada' }]);
  });
  it('dos piezas que se pierden en fotogramas distintos y entre las dos cubren el clip: no avisa', () => {
    // La pieza 1 de punta en 1-4 y la 2 de punta en 5-7: cada una sola avisaría, juntas son el clip.
    const celdas = Array.from({ length: 7 }, () => celda({})).map((c, i) => ({
      ...c,
      atrezo: [
        [
          [200, 100, -0.9],
          [200, i < 4 ? 112 : 180, -0.9],
        ],
        [
          [150, 100, -0.9],
          [150, i >= 4 ? 112 : 180, -0.9],
        ],
      ] as CeldaDeHuesos['atrezo'],
    }));
    expect(armaIlegible(celdas, nada)).toEqual([]);
  });
  it('el disparo no se mira', () => {
    expect(seMiraElArma('shoot')).toBe(false);
    expect(seMiraElArma('attack')).toBe(true);
  });
  it('si no se lee en ninguno (de espaldas), no avisa: va detrás con razón', () => {
    const dentro = () => 255;
    const celdas = Array.from({ length: 7 }, () =>
      celda({
        arma: [
          [200, 100, -0.8],
          [200, 180, -0.8],
        ],
      }),
    );
    expect(armaIlegible(celdas, dentro)).toEqual([]);
  });
});

describe('los maniquíes del piloto', () => {
  for (const id of ['caballero-de-la-muerte', 'templario-escudo', 'elfo-arquero'])
    it.skipIf(!existsSync(join(carpetaDeManiqui(id), 'd0-a.huesos.json')))(
      `${id} no anda hacia atrás en ninguna dirección`,
      async () => {
        const { avisos, medidas } = await revisarElManiqui(carpetaDeManiqui(id));
        expect(avisos.filter((a) => a.tipo === 'sentido')).toEqual([]);
        // Las 8 direcciones, con su marcha y su carga.
        expect(medidas.filter((m) => m.sentido !== undefined)).toHaveLength(16);
      },
      60_000,
    );
});

describe('la compuerta del trabajador', () => {
  let raiz: string;
  beforeEach(async () => {
    raiz = await mkdtemp(join(tmpdir(), 'taller-compuerta-'));
  });
  afterEach(async () => {
    await rm(raiz, { recursive: true, force: true });
  });

  const MANIQUI = 'assets/unidades/_poses/unidades/prueba-8d';
  const encargo: Encargo = {
    id: 'prueba-d0-a',
    tipo: 'atlas',
    descripcion: 'un soldado de prueba con espada y escudo, para la compuerta',
    referencias: [
      { ruta: `${MANIQUI}/d0-a.profundidad.png`, papel: 'pose-profundidad' },
      { ruta: 'assets/unidades/prueba/giro.webp', papel: 'identidad' },
    ],
    salida: 'assets/unidades/prueba/d0/hoja-a',
    fondo: 'transparente',
    celda: 384,
    ocho: { direccion: 0, hoja: 'a' },
  };

  /** La hoja del maniquí y, si se pide, su esqueleto (con la marcha de `paso`). */
  async function maniqui(paso: number | null, otroRender = false): Promise<void> {
    const dir = join(raiz, MANIQUI);
    await mkdir(dir, { recursive: true });
    const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#0000' } })
      .png()
      .toBuffer();
    await writeFile(join(dir, 'd0-a.png'), png);
    await writeFile(join(dir, 'd0-a.profundidad.png'), png);
    if (paso === null) return;
    const sha = createHash('sha256')
      .update(otroRender ? Buffer.from('otro') : png)
      .digest('hex');
    const huesos = {
      hoja: { png: sha, profundidad: sha },
      celda: 384,
      filas: [
        { clip: 'idle', celdas: Array.from({ length: 7 }, () => celda({})) },
        { clip: 'walk', celdas: marcha(paso) },
        { clip: 'charge', celdas: marcha(-0.05) },
      ],
    };
    await writeFile(join(dir, 'd0-a.huesos.json'), JSON.stringify(huesos));
  }

  async function pasarPorLaCompuerta(): Promise<string | undefined> {
    const cola = new Cola(join(raiz, 'cola'));
    await cola.encolar(encargo);
    const e = await cola.tomar();
    if (e === null) throw new Error('la cola no dio el encargo');
    if ((await rechazarSiElManiquiFalla(cola, e, raiz)) === null) return undefined;
    expect((await cola.estado()).fallido).toEqual(['prueba-d0-a']);
    return (await cola.leer('fallido', 'prueba-d0-a')).resultado?.motivo;
  }

  it('el maniquí que anda hacia atrás va a fallido/, diciendo dónde y que se arregla en el maniquí', async () => {
    await maniqui(0.05);
    expect(await pasarPorLaCompuerta()).toMatch(
      /anda hacia atrás en d0 «walk».*el arreglo va en el maniquí/,
    );
  });
  it('sin esqueleto, dice con qué orden se hace', async () => {
    await maniqui(null);
    expect(await pasarPorLaCompuerta()).toMatch(
      /no tiene esqueleto.*pnpm taller maniqui prueba --huesos/,
    );
  });
  it('con el esqueleto de otro render, también', async () => {
    await maniqui(-0.05, true);
    expect(await pasarPorLaCompuerta()).toMatch(
      /de otro render del maniquí.*pnpm taller maniqui prueba --huesos/,
    );
  });
  it('el que anda hacia delante pasa', async () => {
    await maniqui(-0.05);
    expect(await pasarPorLaCompuerta()).toBeUndefined();
  });
  it('la hoja B (sin marcha) y los montados no se miran', () => {
    expect(maniquiBlocker({ ...encargo, ocho: { direccion: 0, hoja: 'b' } }, raiz)).toBeNull();
    const montado: Encargo = {
      ...encargo,
      referencias: [
        { ruta: 'assets/unidades/_poses/montado-lanza-8d/d0-a.png', papel: 'pose' },
        ...encargo.referencias.slice(1),
      ],
    };
    expect(maniquiBlocker(montado, raiz)).toBeNull();
  });
});
