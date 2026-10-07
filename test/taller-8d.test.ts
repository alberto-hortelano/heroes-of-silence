/**
 * Las hojas de 8 direcciones: 6 filas —7 con el disparo de quien dispara— y el
 * último fotograma de la muerte como cadáver.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CLIPS_DE_FIGURA,
  FILAS_DEL_ATLAS,
  HOJAS_DE_FIGURA,
  type HojaDeFigura,
  primeraFilaDe,
} from '../src/shared/arte.js';
import {
  type Atrezo,
  clipDeDisparoDe,
  columnaDeSuelta,
  cuerpoACuerpoDe,
  hojasDe,
  indicesDeClip,
  JUEGOS_DE_ARMAS,
  type JuegoDeArmas,
  type JuegoEn8d,
  OCHO_DIRECCIONES,
} from '../tools/art/poses.js';
import { derivarAtlas, ELEVACION_DEL_CADAVER } from '../tools/taller/derivar.js';
import { type Encargo, encargoSchema, promptDe } from '../tools/taller/encargo.js';
import { juntarDireccion } from '../tools/taller/juntar.js';
import {
  type AtlasDePoses,
  derivarDireccionDePoses,
  sueltaDeUnidad,
} from '../tools/taller/poses-8d.js';
import {
  EN_OCHO_DIRECCIONES,
  encargoDeGiro,
  encargosDeOchoDirecciones,
  JUEGOS_EN_8D,
  unidad,
} from '../tools/taller/unidades.js';
import { segunPrisa } from './lento.js';

const RAIZ = join(import.meta.dirname, '..');

const C = OCHO_DIRECCIONES.celda;

/** Las carpetas temporales de este fichero: se borran al acabar. */
const TEMPORALES: string[] = [];
async function temporal(prefijo: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefijo));
  TEMPORALES.push(dir);
  return dir;
}
afterAll(async () => {
  await Promise.all(TEMPORALES.map((d) => rm(d, { recursive: true, force: true })));
});

/**
 * Un «cuerpo»: de pie es un rectángulo alto; tendido, uno ancho y desplazado.
 * `filas`: las del atlas que se pintan, desde `desde` (la muerte es la 5). En
 * celdas de `celda` px, con el cuerpo a escala; cada columna se mueve 1 px, que
 * en la de 384 queda por debajo de REPETIDO (el recorte lo mira `derivarAtlas`).
 */
async function png(filas: number, desde = 0, celda: number = C): Promise<Buffer> {
  const k = celda / C;
  const capas = [];
  for (let f = 0; f < filas; f++) {
    const fila = desde + f;
    for (let col = 0; col < 7; col++) {
      const tendido = fila === 5 && col >= 4;
      const [w, h, dx] = (tendido ? [150, 30, -90 + col * 5] : [40, 160, col % 2]).map((n) =>
        Math.round(n * k),
      ) as [number, number, number];
      const x = col * celda + Math.round(190 * k) + dx - Math.round(w / 2);
      const y = f * celda + Math.round(300 * k) - h;
      capas.push({
        input: { create: { width: w, height: h, channels: 4 as const, background: '#808080' } },
        left: x,
        top: y,
      });
    }
  }
  return sharp({
    create: {
      width: 7 * celda,
      height: filas * celda,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(capas)
    .png()
    .toBuffer();
}

/**
 * Un atlas de mentira de `filas` filas (6, o 7 con el disparo), en un fichero.
 * Uno por número de filas y fichero de tests: `derivarAtlas` solo lo lee, y
 * componerlo con sharp costaba más que derivarlo (#167).
 */
const hojas = new Map<number, Promise<string>>();
function hoja(filas = 6): Promise<string> {
  let h = hojas.get(filas);
  if (h === undefined) {
    h = (async () => {
      const ruta = join(await temporal('taller-8d-'), 'atlas.png');
      await writeFile(ruta, await png(filas));
      return ruta;
    })();
    hojas.set(filas, h);
  }
  return h;
}

describe('una dirección de 6 filas', () => {
  it('tiene las 6 acciones y el cadáver al final de la muerte', async () => {
    const a = await derivarAtlas(await hoja());
    expect(a.cell).toBe(C);
    expect(Object.keys(a.clips)).toEqual(['idle', 'walk', 'charge', 'attack', 'hurt', 'death']);
    expect(a.clips.death?.loop).toBe(false);
    expect(a.cadaver).toEqual({ clip: 'death', frame: (a.clips.death?.frames ?? 0) - 1 });
  });

  it('con la fila del disparo: el disparo lleva la suelta y sus 7 columnas; el ataque se recorta como cualquier golpe', async () => {
    // En esta hoja cada columna se mueve 1 px: por debajo de REPETIDO, como el
    // disparo de frente del arco, que apenas cambia la silueta.
    const sin = await derivarAtlas(await hoja(6));
    const con = await derivarAtlas(await hoja(7), { suelta: 4 });
    expect(Object.keys(con.clips)).toEqual([...FILAS_DEL_ATLAS]);
    expect(con.clips.shoot).toMatchObject({ row: 6, frames: 7, suelta: 4, loop: false });
    // El ataque es cuerpo a cuerpo: sin suelta y recortado igual que sin disparo.
    for (const c of CLIPS_DE_FIGURA) expect(con.clips[c], c).toEqual(sin.clips[c]);
    expect(con.clips.attack.frames).toBe(1);
    expect(con.clips.attack.suelta).toBeUndefined();
    expect(sin.clips.shoot).toBeUndefined();
  });

  it('la suelta va con la fila del disparo y solo con ella: lo demás lanza diciéndolo', async () => {
    await expect(derivarAtlas(await hoja(6), { suelta: 4 })).rejects.toThrow(
      /la suelta es del disparo y esta hoja no tiene/,
    );
    await expect(derivarAtlas(await hoja(7))).rejects.toThrow(/nadie dice en qué columna suelta/);
    await expect(derivarAtlas(await hoja(7), { suelta: 7 })).rejects.toThrow(
      /no cae dentro del disparo/,
    );
    await expect(derivarAtlas(await hoja(8), { suelta: 4 })).rejects.toThrow(
      /6 filas, o 7 con el disparo/,
    );
  });

  it('un ancla para todas, la del reposo, salvo la muerte: va ELEVACION_DEL_CADAVER más arriba', async () => {
    const a = await derivarAtlas(await hoja());
    const [x, y] = a.clips.idle?.anchor ?? [0, 0];
    for (const c of ['walk', 'charge', 'attack', 'hurt'] as const)
      expect(a.clips[c]?.anchor, c).toEqual([x, y]);
    // Sin subirla, el cadáver tendido hacia la cámara no cabía bajo los pies y
    // el empaquetado lo metía en la celda subiéndolo: flotaba sobre su sombra.
    expect(a.clips.death?.anchor).toEqual([x, y - ELEVACION_DEL_CADAVER]);
  });

  it('la muerte y el daño no son bucles: su última columna es su último fotograma', () => {
    expect(indicesDeClip(9, 7, false).at(-1)).toBe(8);
    expect(indicesDeClip(28, 7, false)[0]).toBe(0);
  });
});

describe('los encargos de 8 direcciones', () => {
  const u = unidad('templario-escudo');

  it('el giro va con la pose del giro y la identidad aprobada', () => {
    const g = encargoSchema.parse(encargoDeGiro(u));
    expect(g.referencias.map((r) => r.papel)).toEqual(['pose', 'identidad', 'estilo']);
    for (const r of g.referencias) expect(existsSync(join(RAIZ, r.ruta)), r.ruta).toBe(true);
    expect(promptDe(g)).toMatch(/4 columnas por 2 filas/);
  });

  it('son 16 hojas, dos por dirección, con su pose y el giro como identidad', () => {
    const lista = encargosDeOchoDirecciones(u).map((e) => encargoSchema.parse(e));
    expect(lista).toHaveLength(16);
    expect(new Set(lista.map((e) => e.id)).size).toBe(16);
    for (const e of lista) {
      expect(e.referencias[0]?.ruta).toBe(
        `assets/unidades/_poses/espada-escudo-8d/d${e.ocho?.direccion}-${e.ocho?.hoja}.png`,
      );
      expect(existsSync(join(RAIZ, e.referencias[0]?.ruta ?? ''))).toBe(true);
      expect(e.referencias[1]?.ruta).toBe('assets/unidades/templario-escudo/giro.webp');
      expect(e.celda).toBe(OCHO_DIRECCIONES.celda);
    }
    const b = lista.find((e) => e.ocho?.hoja === 'b');
    expect(promptDe(b as Encargo)).toMatch(/la primera es EXACTAMENTE la última de la fila 2/);
    expect(promptDe(b as Encargo)).toMatch(/NUNCA de perfil/);
  });

  it('quien no dispara encarga exactamente lo mismo que antes de la hoja C', () => {
    // La huella de [encargo, prompt] de sus 16 hojas, tomada el 04-10-2026 antes
    // de añadir el disparo: ni un byte de lo que se pide cambia.
    const huella = (id: string): string =>
      createHash('sha256')
        .update(JSON.stringify(encargosDeOchoDirecciones(unidad(id)).map((e) => [e, promptDe(e)])))
        .digest('hex');
    expect(huella('templario-escudo')).toBe(
      '60e285b57573c7036175be77e127d998feaa96bbfa8e08907202200bf952460e',
    );
    expect(huella('templario-hermano-de-carga')).toBe(
      '9b4ca4ec10ef8f626a942f8cb27f1bede9f3513007f9a722059714f58206a1ca',
    );
    expect(huella('imperio-coracero')).toBe(
      '8f21f16ffa522473170d73e5f90272d730ec89d01bc5081cdea0bade0f833ea3',
    );
  });

  it('quien dispara encarga 24 hojas: la C del disparo sobre su pose, y la B dice con qué pelea de cerca', () => {
    const lista = encargosDeOchoDirecciones(unidad('imperio-granadero')).map((e) =>
      encargoSchema.parse(e),
    );
    expect(lista).toHaveLength(24);
    const c = lista.filter((e) => e.ocho?.hoja === 'c');
    expect(c.map((e) => e.id)).toEqual(
      Array.from({ length: 8 }, (_, d) => `imperio-granadero-d${d}-c`),
    );
    for (const e of c) {
      const pose = e.referencias[0]?.ruta ?? '';
      expect(pose).toBe(`assets/unidades/_poses/granada-8d/d${e.ocho?.direccion}-c.png`);
      expect(existsSync(join(RAIZ, pose)), pose).toBe(true);
      expect(e.salida).toBe(`assets/unidades/imperio-granadero/d${e.ocho?.direccion}/hoja-c`);
      expect(promptDe(e)).toMatch(/7 columnas por 1 fila, 7 figuras/);
      expect(promptDe(e)).toMatch(/UNA SOLA FILA: las siete poses de DISPARO/);
    }
    const b = lista.find((e) => e.ocho?.hoja === 'b') as Encargo;
    expect(b.descripcion).toMatch(/ATAQUE de esta hoja es cuerpo a cuerpo con un sable/);
    // Cada tirador, con el arma de la tabla del usuario.
    const deCerca = (id: string) =>
      encargosDeOchoDirecciones(unidad(id)).find((e) => e.ocho?.hoja === 'b')?.descripcion;
    expect(deCerca('imperio-ballestero')).toMatch(/cuerpo a cuerpo con una espada corta/);
    expect(deCerca('imperio-arcabucero')).toMatch(/cuerpo a cuerpo con una espada corta/);
    expect(deCerca('imperio-artillero-culebrina')).toMatch(/cuerpo a cuerpo con el botafuego/);
    expect(deCerca('heroe-imperio-ingeniero')).toMatch(/cuerpo a cuerpo con su martillo/);
    expect(deCerca('imperio-pistolero-montado')).toMatch(/cuerpo a cuerpo con una espada/);
    expect(deCerca('templario-escudo')).not.toMatch(/cuerpo a cuerpo/);
  });

  it('el esquema admite la hoja C y ninguna otra más', () => {
    const [e] = encargosDeOchoDirecciones(unidad('imperio-granadero'));
    const con = (hoja: string) => ({ ...e, ocho: { direccion: 0, hoja } });
    expect(encargoSchema.safeParse(con('c')).success).toBe(true);
    expect(encargoSchema.safeParse(con('d')).success).toBe(false);
  });

  it('una unidad que no está en 8 direcciones no tiene giro', () => {
    // Todas las del taller lo están (05-10-2026): la guarda se mira con una inventada.
    const inventada = { ...unidad('zombi'), id: 'zombi-inventado' };
    expect(() => encargoDeGiro(inventada)).toThrow(/8 direcciones/);
  });
});

describe('el maniquí de quien dispara', () => {
  const TIRADORES = (Object.keys(JUEGOS_DE_ARMAS) as JuegoDeArmas[]).filter(
    (j) => clipDeDisparoDe(j) !== null,
  );

  it('dispara en la hoja C con su curva y ataca en la B con el golpe corto; quien no dispara no tiene C', () => {
    expect(TIRADORES.sort()).toEqual(['arco', 'ballesta', 'granada']);
    for (const j of Object.keys(JUEGOS_DE_ARMAS) as JuegoDeArmas[]) {
      const hojas = hojasDe(j);
      const disparo = clipDeDisparoDe(j);
      if (disparo === null) {
        expect(hojas.c, j).toBeUndefined();
        continue;
      }
      expect(hojas.c, j).toEqual([{ clip: 'shoot', anim: disparo, enBucle: false }]);
      expect(hojas.b?.[0], j).toEqual({ clip: 'attack', anim: 'quick', enBucle: false });
    }
  });

  it('todo atrezo de tirador, del juego o del maniquí propio, lleva su arma de cuerpo a cuerpo', () => {
    for (const j of TIRADORES) expect('cuerpoACuerpo' in JUEGOS_DE_ARMAS[j].atrezo, j).toBe(true);
    for (const [id, juego] of Object.entries(EN_OCHO_DIRECCIONES)) {
      const m = unidad(id).maniqui;
      if (m !== undefined && clipDeDisparoDe(juego) !== null)
        expect('cuerpoACuerpo' in m, id).toBe(true);
    }
    // Sin ella no se puede ni encargar ni renderizar: el ataque saldría con el arma de tiro.
    const { cuerpoACuerpo: _, ...sinArma } = JUEGOS_DE_ARMAS.ballesta.atrezo;
    expect(() => cuerpoACuerpoDe('ballesta', sinArma as unknown as Atrezo)).toThrow(
      /dispara y su atrezo no lleva arma de cuerpo a cuerpo/,
    );
  });
});

describe('juntar las hojas pintadas de una dirección', () => {
  /**
   * Una dirección de mentira de una unidad real: sus hojas pintadas, en
   * `<tmp>/<id>/d0/`. En celdas de 64: juntar toma la celda del ancho, y aquí
   * solo importa qué filas junta y con qué suelta.
   */
  async function direccion(id: string, hojas: readonly HojaDeFigura[]): Promise<string> {
    const dir = join(await temporal('juntar-'), id, 'd0');
    await mkdir(dir, { recursive: true });
    for (const h of hojas) {
      await writeFile(
        join(dir, `hoja-${h}.webp`),
        await sharp(await png(HOJAS_DE_FIGURA[h].length, primeraFilaDe(h), 64))
          .webp({ lossless: true })
          .toBuffer(),
      );
    }
    return dir;
  }

  it('quien dispara junta 7 filas con la suelta de su maniquí, y espera a su C', async () => {
    const suelta = await sueltaDeUnidad('imperio-granadero');
    expect(suelta).toBe(4);
    expect(await juntarDireccion(await direccion('imperio-granadero', ['a', 'b']))).toBeNull();
    const dir = await direccion('imperio-granadero', ['a', 'b', 'c']);
    const atlas = await juntarDireccion(dir);
    expect(atlas).toBe(join(dir, 'atlas.webp'));
    const json = JSON.parse(await readFile(join(dir, 'atlas.json'), 'utf8'));
    expect(Object.keys(json.clips)).toEqual([...FILAS_DEL_ATLAS]);
    expect(json.clips.shoot).toMatchObject({ row: 6, suelta });
    const comp = JSON.parse(await readFile(join(dir, 'atlas.composicion.json'), 'utf8'));
    expect(comp.hojas.map((h: { filas: string[] }) => h.filas)).toEqual([
      ['idle', 'walk', 'charge'],
      ['attack', 'hurt', 'death'],
      ['shoot'],
    ]);
  });

  it('una hoja con otras filas que las de su letra no se junta: lanza diciendo cuál y cuánto mide', async () => {
    const dir = await direccion('imperio-granadero', ['a', 'b']);
    // Una C de tres filas: juntada, el disparo caería en la fila de la carga.
    await writeFile(
      join(dir, 'hoja-c.webp'),
      await sharp(await png(3, 0, 64))
        .webp({ lossless: true })
        .toBuffer(),
    );
    await expect(juntarDireccion(dir)).rejects.toThrow(
      /hoja-c\.webp mide 192 de alto: la hoja C son 1 fila de 64/,
    );
  });

  it('quien no dispara junta sus 6 filas como siempre, y una C de más no entra', async () => {
    expect(await sueltaDeUnidad('templario-escudo')).toBeNull();
    const dir = await direccion('templario-escudo', ['a', 'b', 'c']);
    await juntarDireccion(dir);
    const json = JSON.parse(await readFile(join(dir, 'atlas.json'), 'utf8'));
    expect(Object.keys(json.clips)).toEqual([...CLIPS_DE_FIGURA]);
  });
});

describe('las direcciones del arte', () => {
  const UNIDADES = join(RAIZ, 'assets/unidades');
  const sha = (r: string): string => createHash('sha256').update(readFileSync(r)).digest('hex');
  const leer = (r: string): any => JSON.parse(readFileSync(r, 'utf8'));
  const todas = readdirSync(UNIDADES)
    .filter((u) => !u.startsWith('_'))
    .flatMap((u) =>
      readdirSync(join(UNIDADES, u))
        .filter((d) => /^d[0-7]$/.test(d))
        .map((d) => join(UNIDADES, u, d)),
    );
  // Volver a derivar un atlas cuesta ~150 ms y hay ~400 direcciones: un minuto
  // entero de `pnpm verify` (#167). El bucle rápido deriva la primera de cada
  // forma de hoja —celda y filas, que es lo que cambia la cuenta de
  // `derivarAtlas`— y la orden lenta, todas. Los sha256 de abajo, que son lo que
  // caza un atlas o una hoja cambiados sin volver a juntar, los mira cada
  // dirección en las dos.
  const formaDe = (dir: string): string => {
    const json = leer(join(dir, 'atlas.json'));
    return `${json.cell}×${json.clips.shoot === undefined ? 6 : 7}`;
  };
  const primeras = new Map<string, string>();
  for (const d of todas) if (!primeras.has(formaDe(d))) primeras.set(formaDe(d), d);
  const derivadas = new Set(segunPrisa([...primeras.values()], todas));

  it('el bucle rápido deriva al menos una hoja sin disparo y una con él', () => {
    // Hoy todas las celdas son de 384 (07-10-2026): si mañana hay otra, entra sola.
    expect(new Set([...primeras.keys()].map((k) => k.split('×')[1]))).toEqual(new Set(['6', '7']));
  });

  // Una vez por unidad, no por dirección: lee el `poses.json` de su maniquí.
  const sueltas = new Map<string, Promise<number | null>>();
  const sueltaDe = (id: string): Promise<number | null> => {
    const s = sueltas.get(id) ?? sueltaDeUnidad(id);
    sueltas.set(id, s);
    return s;
  };

  it.each(todas)('%s: el atlas es lo que mide la imagen y sale de sus hojas', async (dir) => {
    const atlas = join(dir, 'atlas.webp');
    const json = leer(join(dir, 'atlas.json'));
    expect(json.sha256, 'el atlas cambió sin volver a derivar su JSON').toBe(sha(atlas));
    if (derivadas.has(dir)) {
      // Con la fila del disparo, la suelta es la de su maniquí: la misma cuenta que al juntarlo.
      const suelta =
        json.clips.shoot === undefined ? undefined : await sueltaDe(basename(dirname(dir)));
      expect(json).toEqual(
        JSON.parse(JSON.stringify(await derivarAtlas(atlas, suelta == null ? {} : { suelta }))),
      );
    }
    const c = leer(join(dir, 'atlas.composicion.json'));
    expect(c.sha256, 'el atlas cambió sin volver a juntarlo').toBe(sha(atlas));
    for (const h of c.hojas) {
      const ruta = join(dir, h.imagen);
      expect(sha(ruta), h.imagen).toBe(h.sha256);
      const p = leer(ruta.replace(/\.webp$/, '.procedencia.json'));
      expect(p.salida.sha256, `${h.imagen} cambió sin registrar de dónde sale`).toBe(sha(ruta));
      expect(p.hilo).toMatch(/^[0-9a-f-]{36}$/);
      if (p.reanuda === undefined) {
        expect(p.referencias[0]?.papel).toBe('pose');
        expect(p.referencias[1]?.papel).toBe('identidad');
      }
    }
  });
});

describe('las anclas del Y Bot en 8 direcciones (`_poses/atlas-8d.json`)', () => {
  const RUTA = join(RAIZ, 'assets/unidades/_poses/atlas-8d.json');
  const atlas = JSON.parse(readFileSync(RUTA, 'utf8')) as AtlasDePoses;
  const sha = (r: string): string => createHash('sha256').update(readFileSync(r)).digest('hex');

  it('trae todos los juegos, ocho direcciones cada uno, las 6 acciones con su cadáver y el disparo de quien dispara', () => {
    expect(Object.keys(atlas.juegos).sort()).toEqual([...JUEGOS_EN_8D].sort());
    for (const [juego, dirs] of Object.entries(atlas.juegos)) {
      expect(dirs, juego).toHaveLength(8);
      const dispara = clipDeDisparoDe(juego as JuegoEn8d) !== null;
      for (const d of dirs) {
        expect(Object.keys(d.clips), juego).toEqual(
          dispara ? [...FILAS_DEL_ATLAS] : [...CLIPS_DE_FIGURA],
        );
        expect(Object.keys(d.hojas), juego).toEqual(dispara ? ['a', 'b', 'c'] : ['a', 'b']);
        expect(d.cadaver).toEqual({ clip: 'death', frame: (d.clips.death?.frames ?? 0) - 1 });
      }
    }
  });

  it('el sha256 de cada hoja cuadra con el PNG: una pose re-renderizada sin volver a derivar se pone roja', () => {
    for (const [juego, dirs] of Object.entries(atlas.juegos)) {
      for (const d of dirs) {
        for (const h of Object.values(d.hojas)) {
          const ruta = join(RAIZ, 'assets/unidades/_poses', `${juego}-8d`, h.imagen);
          expect(sha(ruta), `${juego}/${h.imagen}`).toBe(h.sha256);
        }
      }
    }
  });

  it('la muerte NO se eleva: el cadáver del render crudo queda a la altura del reposo', () => {
    // Con los 64 px de las hojas pintadas, el cadáver del Y Bot se hundiría en el suelo.
    for (const dirs of Object.values(atlas.juegos)) {
      for (const d of dirs) expect(d.clips.death?.anchor).toEqual(d.clips.idle.anchor);
    }
  });

  it('una dirección vuelta a derivar da el mismo JSON (no se toca a mano)', async () => {
    const d = await derivarDireccionDePoses('espada-escudo', 3);
    expect(JSON.parse(JSON.stringify(d))).toEqual(atlas.juegos['espada-escudo']?.[3]);
    const arco = await derivarDireccionDePoses('arco', 2);
    expect(JSON.parse(JSON.stringify(arco))).toEqual(atlas.juegos.arco?.[2]);
  });

  it('la suelta vive en el disparo, la del render; el ataque no la lleva nunca', () => {
    for (const [juego, dirs] of Object.entries(atlas.juegos)) {
      const clip = clipDeDisparoDe(juego as JuegoEn8d);
      const poses = JSON.parse(
        readFileSync(join(RAIZ, 'assets/unidades/_poses', `${juego}-8d`, 'poses.json'), 'utf8'),
      ) as { sourceMetadata?: { shoot?: { frame_count: number } } };
      for (const [n, d] of dirs.entries()) {
        expect(d.clips.attack.suelta, `${juego}/d${n} attack`).toBeUndefined();
        const esperada =
          clip === null
            ? undefined
            : columnaDeSuelta(clip, poses.sourceMetadata?.shoot?.frame_count ?? 0, d.columns);
        expect(d.clips.shoot?.suelta, `${juego}/d${n} shoot`).toBe(esperada);
      }
    }
    expect(atlas.juegos.arco?.[0]?.clips.shoot?.suelta).toBe(4);
  });
});
