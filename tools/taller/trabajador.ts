/**
 * `pnpm taller`: el trabajador de la cola de imágenes.
 *
 *   pnpm taller                          trabaja hasta vaciar la cola
 *   pnpm taller encolar <unidad|fichero.json>…
 *                                        una unidad de `unidades.ts` encola su
 *                                        identidad, o su atlas con `--atlas`;
 *                                        `--rehacer` olvida el encargo cerrado de antes
 *   pnpm taller corregir <encargo> "<corrección>"
 *                                        reabre el hilo de Codex de un encargo hecho
 *   pnpm taller estado
 *   pnpm taller devolver <id>            de en-curso/ o fallido/ a pendiente/
 *   pnpm taller retirar <id>…            borra pendientes que ya no valen
 *   pnpm taller reprocesar <id>          rehace el post-proceso sobre el crudo ya generado
 *   pnpm taller derivar <hoja.webp>…     reescribe el JSON de una hoja
 *   pnpm taller componer-atlas-mapa      rehace assets/rpg/map-atlas.png con las piezas pintadas
 *   pnpm taller encolar --texturas-suelo | --muestras-densas | --piezas-densas [--solo=…]
 *                                        el arte de los mapas densos (`mapa-denso.ts`)
 *   pnpm taller vista-mapa [semilla]     un mapa denso del generador pintado con ese arte
 *   pnpm taller encolar --modulos | --texturas-relieve [--solo=…]
 *                                        las hojas de módulos del escenógrafo
 *   pnpm taller escenario [semilla…]     el escenógrafo: compone, pinta, captura y mide
 *   pnpm taller catalogo-escena          rehace assets/mapa/escena.json, el catálogo que lee el juego
 *   pnpm taller vista-ejercitos          una página con todos los ejércitos, para elegir o comparar
 *   pnpm taller vista <unidad>…          láminas de revisión en .cache/taller/vista/
 *
 * Por cada encargo: lanza Codex con las referencias en su orden, recorta el
 * halo, empaqueta (si es un atlas), valida con sharp, escribe la imagen, su
 * JSON derivado y el registro de procedencia —referencias con su sha256, hilo
 * de Codex, prompt entero y sha256 del crudo y del resultado—. Un fallo no para
 * la cola: el encargo va a `fallido/` con el motivo y se sigue con el siguiente.
 *
 * Varios trabajadores pueden correr a la vez sobre la misma cola: tomar un
 * encargo es un `rename` atómico (ver `cola.ts`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { FIGURA } from '../../src/shared/arte.js';
import { OCHO_DIRECCIONES } from '../art/poses.js';
import { CODEX, FalloDeCodex, type Generacion, generar } from './codex.js';
import { Cola } from './cola.js';
import { componerAtlasMapa } from './componer-atlas-mapa.js';
import {
  ELEVACION_DEL_CADAVER,
  escribirDerivado,
  escribirEfectoDerivado,
  escribirPiezaDerivada,
} from './derivar.js';
import { encargosDeEdificios } from './edificios.js';
import { encargoDeIconosDeRecursos, encargosDeEfectos } from './efectos.js';
import {
  empaquetarEfecto,
  LADO_EFECTO,
  LADO_ICONO,
  partirIconos,
  recorteSuave,
} from './efectos-proceso.js';
import {
  apoyoEn,
  baseEnCelda,
  type EscalaDePose,
  empaquetar,
  recortarAlContenido,
} from './empaquetar.js';
import { type Encargo, promptDe } from './encargo.js';
import { escribirCatalogo } from './escenario/catalogo-disco.js';
import { escenario } from './escenario/escenario.js';
import {
  encargoDeTexturaDeRelieve,
  encargosDeModulos,
  escribirModulos,
  TEXTURAS_DE_RELIEVE,
} from './escenario/modulos.js';
import { evaluar } from './evaluar.js';
import { ESTILOS_DE_MAPA, encargoDeMuestra, encargosDeCeldas, encargosDePiezas } from './mapa.js';
import { encargoDeLamina, encargosDePiezasDensas, encargosDeTexturas } from './mapa-denso.js';
import { aRaster, dePng, recortar, UMBRALES } from './recorte.js';
import { costura, hacerTeselable, LADO_DE_TEXTURA, UMBRAL_DE_COSTURA } from './textura.js';
import {
  encargoDeAtlas,
  encargoDeGiro,
  encargoDeIdentidad,
  encargosDeOchoDirecciones,
  unidad,
} from './unidades.js';
import { validar } from './validar.js';
import { vista, vistaEdificios, vistaEfectos, vistaEjercitos } from './vista.js';
import { vista8d } from './vista-8d.js';
import { vistaMapa } from './vista-mapa.js';

const RAIZ = resolve(import.meta.dirname, '../..');
/**
 * El fondo sobre el que se le enseña la hoja de pose a ChatGPT: verde de croma, no
 * transparente ni gris (el gris claro se confundía con el maniquí).
 */
export const FONDO_DE_POSE = '#00b140';
export const COLA = new Cola(join(RAIZ, 'tools/taller/cola'));

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

/** La ruta de un fichero de `~/.codex` sin el home: la procedencia no lleva rutas de esta máquina. */
const sinHome = (r: string): string => r.replace(homedir(), '~');

/** Un fallo después de generar: lleva el hilo y el crudo, para reprocesar sin volver a pedirlo. */
class FalloTrasGenerar extends Error {
  constructor(
    mensaje: string,
    readonly hilo: string,
    readonly crudo: string,
  ) {
    super(mensaje);
  }
}

async function procesar(
  encargo: Encargo,
  previa?: Generacion,
): Promise<{ hilo: string; salida: string }> {
  const temporal = await mkdtemp(join(tmpdir(), 'taller-'));
  try {
    // Las referencias van como PNG: la identidad se guarda en WebP y no todo
    // cliente de imágenes lo acepta.
    const referencias = await Promise.all(
      encargo.referencias.map(async (r, i) => {
        const bytes = await readFile(join(RAIZ, r.ruta));
        const png = join(temporal, `ref-${i + 1}-${r.papel}.png`);
        // La pose va sobre verde y no transparente: el transparente le
        // llega a ChatGPT como negro, y ahí se pierden el atrezo negro (escudo,
        // asta) y el lado en sombra del maniquí.
        await (r.papel === 'pose'
          ? sharp(bytes).flatten({ background: FONDO_DE_POSE })
          : sharp(bytes)
        )
          .png()
          .toFile(png);
        return { ...r, sha256: sha256(bytes), png };
      }),
    );
    const prompt = promptDe(encargo);
    if (previa === undefined)
      console.log(
        `  · Codex: ${encargo.referencias.map((r) => `${r.papel}=${r.ruta}`).join(', ') || 'sin referencias'}`,
      );
    const gen =
      previa ??
      (await generar(
        prompt,
        referencias.map((r) => r.png),
        encargo.reanudar?.hilo,
      ));
    try {
      return await postprocesar(encargo, gen, prompt, referencias);
    } catch (err) {
      if (err instanceof FalloTrasGenerar) throw err;
      throw new FalloTrasGenerar(
        err instanceof Error ? err.message : String(err),
        gen.hilo,
        gen.crudo,
      );
    }
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
}

async function postprocesar(
  encargo: Encargo,
  gen: Generacion,
  prompt: string,
  referencias: readonly (Encargo['referencias'][number] & { sha256: string })[],
): Promise<{ hilo: string; salida: string }> {
  {
    const crudo = await readFile(gen.crudo);
    const meta = await sharp(crudo).metadata();
    console.log(`  · crudo ${meta.width}×${meta.height} (hilo ${gen.hilo})`);

    const pasos: string[] = [];
    let final: Buffer;
    let extra: Record<string, unknown> = {};
    if (encargo.tipo === 'textura') {
      const t = await hacerTeselable(crudo);
      const c = costura(t);
      if (c > UMBRAL_DE_COSTURA) {
        throw new Error(`la costura de la textura se nota: ${c.toFixed(2)} > ${UMBRAL_DE_COSTURA}`);
      }
      final = await dePng(t);
      pasos.push(
        `cuadrado central a ${LADO_DE_TEXTURA}×${LADO_DE_TEXTURA} y repetible: mezclada eje a eje con su copia desplazada medio lado; costura ${c.toFixed(2)} (1 es invisible)`,
      );
      extra = { costura: c };
    } else if (encargo.fondo === 'opaco') {
      final = crudo;
    } else {
      // Un efecto es semitransparente a propósito (humo, resplandor): recorte suave.
      const r =
        encargo.tipo === 'efecto' ? recorteSuave(await aRaster(crudo)) : await recortar(crudo);
      pasos.push(
        encargo.tipo === 'efecto'
          ? 'recorte suave: solo se borra lo casi invisible (alfa < 24); el humo y los resplandores conservan su alfa'
          : `halo recortado desde los bordes (alfa < ${UMBRALES.halo}); cuerpo opaco (alfa ≥ ${UMBRALES.cuerpo})`,
      );
      if (encargo.tipo === 'efecto') {
        const ef = await empaquetarEfecto(r);
        final = ef.png;
        pasos.push(
          `fotogramas cortados por la rejilla nominal 3×2 y empaquetados en una tira de 6×${LADO_EFECTO}` +
            (ef.rozaduras > 0
              ? `; ${ef.rozaduras} píxeles que rozaban las líneas de corte, recortados`
              : ''),
        );
      } else if (encargo.tipo === 'iconos') {
        const iconos = await partirIconos(r, encargo.nombres ?? []);
        const dir = join(RAIZ, dirname(encargo.salida));
        await mkdir(dir, { recursive: true });
        const indice = [];
        for (const ic of iconos) {
          const bytes = await sharp(ic.png)
            .webp({ quality: 92, alphaQuality: 100, effort: 6 })
            .toBuffer();
          await writeFile(join(dir, `${ic.nombre}.webp`), bytes);
          indice.push({ nombre: ic.nombre, imagen: `${ic.nombre}.webp`, sha256: sha256(bytes) });
        }
        extra = { indiceDeIconos: indice };
        final = await recortarAlContenido(r, 24);
        pasos.push(
          `lámina partida en ${iconos.length} iconos de ${LADO_ICONO}×${LADO_ICONO}, cada uno en su fichero`,
        );
      } else if (encargo.tipo === 'modulos') {
        const indice = await escribirModulos(
          r,
          join(RAIZ, encargo.salida),
          encargo.cuantos ?? encargo.nombres?.length ?? 16,
          encargo.nombres,
        );
        extra = { indiceDeModulos: indice };
        final = await recortarAlContenido(r, 24);
        pasos.push(
          `hoja partida en ${indice.length} módulos a su tamaño nativo, cada uno con su ancla en la base`,
        );
      } else if (encargo.tipo === 'atlas') {
        const altura = encargo.alturaObjetivo ?? FIGURA.alturaAdulto;
        const celda = encargo.celda ?? FIGURA.celda;
        const pose = encargo.ocho === undefined ? undefined : await escalaDePose(encargo);
        const p = await empaquetar(r, encargo.filas ?? 3, altura, celda, pose);
        final = p.png;
        pasos.push(
          `figuras localizadas y empaquetadas en ${FIGURA.columnas}×${encargo.filas ?? 3} celdas de ${celda}, ` +
            `escala uniforme ${p.escala.toFixed(4)}, pies en y=${baseEnCelda(celda)}, ` +
            (p.alturaFinal === p.alturaPedida
              ? `reposo a ${altura} px`
              : `reposo reducido de ${p.alturaPedida} a ${p.alturaFinal} px para que el fotograma más ancho quepa con margen`),
        );
        extra = { apoyoPorFila: p.apoyoPorFila, deLaPose: p.deLaPose };
      } else {
        final = await recortarAlContenido(r, 24);
        pasos.push('recortado al contenido con 24 px de margen');
      }
    }

    const informe = await validar(
      final,
      encargo.tipo,
      encargo.fondo === 'opaco',
      encargo.celda ?? FIGURA.celda,
      encargo.filas ?? 3,
    );
    if (informe.problemas.length > 0) {
      // El crudo se queda en `~/.codex`; se dice dónde para poder mirarlo.
      throw new Error(`${informe.problemas.join('; ')} (crudo: ${sinHome(gen.crudo)})`);
    }

    const rutaSalida = join(RAIZ, `${encargo.salida}.webp`);
    await mkdir(dirname(rutaSalida), { recursive: true });
    const webp = await sharp(final).webp({ quality: 92, alphaQuality: 100, effort: 6 }).toBuffer();
    await writeFile(rutaSalida, webp);
    pasos.push('WebP calidad 92, alfa sin pérdida');

    // Las piezas sueltas del mapa (no las láminas de muestra) llevan su JSON derivado.
    // Y los edificios de ciudad, que se colocan igual: por el centro de su base.
    if (
      encargo.tipo === 'imagen' &&
      /^assets\/(mapa|edificios\/[a-z-]+)\/[^/]+$/.test(encargo.salida)
    ) {
      const d = await escribirPiezaDerivada(rutaSalida);
      pasos.push(`JSON derivado: ${d.ancho}×${d.alto}, ancla en (${d.ancla})`);
    }
    if (encargo.tipo === 'efecto') {
      const d = await escribirEfectoDerivado(rutaSalida);
      pasos.push(`JSON derivado: ${d.fotogramas} fotogramas, caja ${d.caja}`);
    }
    if (encargo.tipo === 'modulos') {
      await writeFile(
        join(RAIZ, `${encargo.salida}.json`),
        `${JSON.stringify({ hoja: basename(rutaSalida), modulos: extra.indiceDeModulos }, null, 2)}\n`,
      );
    }
    if (encargo.tipo === 'iconos') {
      await writeFile(
        join(RAIZ, `${encargo.salida}.json`),
        `${JSON.stringify({ lado: LADO_ICONO, iconos: extra.indiceDeIconos, lamina: basename(rutaSalida) }, null, 2)}\n`,
      );
    }
    if (encargo.tipo === 'atlas' && encargo.ocho !== undefined) {
      // Media dirección: se deriva al juntarse con la otra hoja.
      const junta = await juntarDireccion(dirname(rutaSalida));
      pasos.push(
        junta === null
          ? 'media dirección: se junta con la otra hoja cuando esté'
          : `dirección completa: ${relative(RAIZ, junta)}`,
      );
    } else if (encargo.tipo === 'atlas') {
      const d = await escribirDerivado(rutaSalida);
      // El empaquetado puso los pies en un sitio y la derivación los midió: si no
      // coinciden, uno de los dos miente y la figura bailaría en el tablero.
      const esperado = extra.apoyoPorFila as [number, number][];
      for (const [i, c] of Object.values(d.clips).entries()) {
        const e = esperado[i] as [number, number];
        if (Math.abs(c.anchor[0] - e[0]) > 3 || Math.abs(c.anchor[1] - e[1]) > 2) {
          throw new Error(
            `el ancla derivada de la fila ${i + 1} (${c.anchor}) no es donde la puso el empaquetado (${e})`,
          );
        }
      }
      pasos.push(
        `JSON derivado: altura ${d.altura}, fotogramas ${Object.values(d.clips)
          .map((c) => c.frames)
          .join('/')}`,
      );
    }

    let version = 'desconocida';
    try {
      version = execFileSync(CODEX, ['--version'], { encoding: 'utf8' }).trim();
    } catch {
      // La versión es informativa; no se para un encargo por ella.
    }
    const procedencia = {
      encargo: encargo.id,
      tipo: encargo.tipo,
      fecha: new Date().toISOString(),
      herramienta: {
        nombre: 'codex exec (ChatGPT por la suscripción, imagegen integrado)',
        version,
      },
      hilo: gen.hilo,
      ...(encargo.reanudar ? { reanuda: encargo.reanudar.hilo } : {}),
      prompt,
      referencias: referencias.map((r) => ({ ruta: r.ruta, papel: r.papel, sha256: r.sha256 })),
      crudo: {
        fichero: sinHome(gen.crudo),
        sha256: sha256(crudo),
        ancho: meta.width,
        alto: meta.height,
      },
      postproceso: pasos,
      validacion: informe.medidas,
      ...(extra.deLaPose === undefined ? {} : { deLaPose: extra.deLaPose }),
      salida: { ruta: relative(RAIZ, rutaSalida), sha256: sha256(webp) },
    };
    await writeFile(
      join(RAIZ, `${encargo.salida}.procedencia.json`),
      `${JSON.stringify(procedencia, null, 2)}\n`,
    );
    return { hilo: gen.hilo, salida: relative(RAIZ, rutaSalida) };
  }
}

/**
 * Las siluetas del maniquí en cada celda de la hoja de pose de un encargo de 8
 * direcciones, y la de su reposo (la primera celda de la hoja A de su
 * dirección): con ellas se escalan igual las dos hojas de una figura.
 */
async function escalaDePose(e: Encargo): Promise<EscalaDePose> {
  const celda: number = e.celda ?? FIGURA.celda;
  const medir = async (ruta: string) => {
    const { data, info } = await sharp(join(RAIZ, ruta))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const filas = info.height / celda;
    const columnas = info.width / celda;
    const alfa = (f: number, c: number) => (x: number, y: number) =>
      data[((f * celda + y) * info.width + c * celda + x) * 4 + 3] as number;
    const celdas = Array.from({ length: filas }, (_, f) =>
      Array.from({ length: columnas }, (_, c) => {
        let x0 = celda;
        let y0 = celda;
        let x1 = -1;
        let y1 = -1;
        for (let y = 0; y < celda; y++)
          for (let x = 0; x < celda; x++)
            if (alfa(f, c)(x, y) >= 40) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              y1 = y;
            }
        const silueta = new Uint8Array(celda * celda);
        for (let y = 0; y < celda; y++)
          for (let x = 0; x < celda; x++) silueta[y * celda + x] = alfa(f, c)(x, y) >= 40 ? 1 : 0;
        return {
          silueta,
          apoyo: apoyoEn(alfa(f, c), [x0, y0, x1, y1]),
        };
      }),
    );
    return celdas;
  };
  const ruta = e.referencias[0]?.ruta as string;
  const reposo = (await medir(ruta.replace(/-b\.png$/, '-a.png')))[0]?.[0];
  if (reposo === undefined) throw new Error(`la pose ${ruta} no tiene reposo`);
  const celdas = await medir(ruta);
  return {
    lado: celda,
    siluetas: celdas.map((f) => f.map((c) => c.silueta)),
    reposo: OCHO_DIRECCIONES.altoDelManiqui,
    apoyos: celdas.map((f) => f.map((c) => c.apoyo)),
    apoyoReposo: reposo.apoyo,
    posicion: e.ocho?.hoja === 'b',
    // La hoja B es ataque, daño y muerte: la muerte, la tercera, sube.
    ...(e.ocho?.hoja === 'b' ? { elevaciones: [0, 0, ELEVACION_DEL_CADAVER] } : {}),
  };
}

/**
 * Junta las dos hojas de una dirección (`hoja-a` y `hoja-b`, 3 filas cada una)
 * en `atlas.webp` de 6 filas y lo deriva. Apunta en `atlas.composicion.json` el
 * sha256 de cada hoja, que es la que lleva la procedencia. Si falta una, nada.
 */
async function juntarDireccion(dir: string): Promise<string | null> {
  const hojas = ['hoja-a.webp', 'hoja-b.webp'].map((h) => join(dir, h));
  if (!hojas.every((h) => existsSync(h))) return null;
  const [a, b] = await Promise.all(hojas.map((h) => readFile(h)));
  const { width, height } = await sharp(a).metadata();
  const raw = await sharp({
    create: { width, height: 2 * height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: a as Buffer, left: 0, top: 0 },
      { input: b as Buffer, left: 0, top: height },
    ])
    .png()
    .toBuffer();
  const atlas = join(dir, 'atlas.webp');
  const webp = await sharp(raw).webp({ lossless: true, effort: 6 }).toBuffer();
  await writeFile(atlas, webp);
  await escribirDerivado(atlas);
  await writeFile(
    join(dir, 'atlas.composicion.json'),
    `${JSON.stringify(
      {
        atlas: 'atlas.webp',
        sha256: sha256(webp),
        hojas: hojas.map((h, i) => ({
          imagen: basename(h),
          sha256: sha256([a, b][i] as Buffer),
          filas: i === 0 ? ['idle', 'walk', 'charge'] : ['attack', 'hurt', 'death'],
        })),
      },
      null,
      2,
    )}\n`,
  );
  return atlas;
}

async function trabajar(): Promise<void> {
  await COLA.preparar();
  let hechos = 0;
  let fallidos = 0;
  for (;;) {
    const encargo = await COLA.tomar();
    if (encargo === null) break;
    console.log(`→ ${encargo.id} (${encargo.tipo})`);
    const t0 = Date.now();
    try {
      const r = await procesar(encargo);
      await COLA.cerrar(encargo.id, 'hecho', { cuando: new Date().toISOString(), ...r });
      console.log(`  ✔ ${r.salida} en ${Math.round((Date.now() - t0) / 1000)} s`);
      hechos++;
    } catch (err) {
      if (err instanceof FalloDeCodex && err.sinCuota) {
        // Sin cuota no falla el encargo: falla todo lo que quede. Se devuelve
        // a la cola y se para, diciendo cuándo vuelve a haber cuota.
        await COLA.devolver(encargo.id, 'en-curso');
        console.log(
          `  ⏸ ${err.message}\n  ${encargo.id} vuelve a pendiente/; la cola se para aquí.`,
        );
        process.exitCode = 2;
        break;
      }
      const motivo = err instanceof Error ? err.message : String(err);
      await COLA.cerrar(encargo.id, 'fallido', {
        cuando: new Date().toISOString(),
        motivo,
        ...(err instanceof FalloTrasGenerar ? { hilo: err.hilo, crudo: sinHome(err.crudo) } : {}),
      });
      console.log(`  ✘ ${motivo}`);
      fallidos++;
    }
  }
  console.log(`cola vacía: ${hechos} hechos, ${fallidos} fallidos`);
  if (fallidos > 0) process.exitCode = 1;
}

/**
 * Rehace el post-proceso de un encargo fallido sobre el crudo que ya generó
 * Codex. Para cuando lo que falló fue el recorte o el empaquetado, no la imagen.
 */
async function reprocesar(id: string): Promise<void> {
  const estado = await COLA.estado();
  const desde = estado.hecho.includes(id) ? 'hecho' : 'fallido';
  const ficha = await COLA.leer(desde, id);
  const { hilo, crudo: guardado } = ficha.resultado ?? {};
  // Un hecho no apunta el crudo en la cola: está en su procedencia.
  const crudo =
    guardado ??
    (desde === 'hecho'
      ? (JSON.parse(await readFile(join(RAIZ, `${ficha.encargo.salida}.procedencia.json`), 'utf8'))
          .crudo.fichero as string)
      : undefined);
  if (hilo === undefined || crudo === undefined) {
    throw new Error(`«${id}» falló antes de que Codex generara nada: devuélvelo a la cola`);
  }
  await COLA.devolver(id, desde);
  const encargo = await COLA.tomar(id);
  if (encargo === null) throw new Error(`otro trabajador tomó «${id}» mientras se reprocesaba`);
  try {
    const r = await procesar(encargo, { hilo, crudo: crudo.replace(/^~/, homedir()), mensaje: '' });
    await COLA.cerrar(id, 'hecho', { cuando: new Date().toISOString(), ...r });
    console.log(`  ✔ ${r.salida}`);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    await COLA.cerrar(id, 'fallido', { cuando: new Date().toISOString(), motivo, hilo, crudo });
    console.log(`  ✘ ${motivo}`);
    process.exitCode = 1;
  }
}

async function encolar(args: readonly string[]): Promise<void> {
  if (args.includes('--piezas-mapa') || args.includes('--atlas-mapa')) {
    const lista = args.includes('--atlas-mapa') ? encargosDeCeldas() : encargosDePiezas();
    for (const bruto of lista) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  if (args.includes('--edificios')) {
    for (const bruto of encargosDeEdificios()) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  if (args.includes('--iconos-recursos')) {
    const bruto = encargoDeIconosDeRecursos();
    if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
    console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    return;
  }
  if (args.includes('--efectos')) {
    for (const bruto of encargosDeEfectos()) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  // Los módulos del escenógrafo y sus texturas (`escenario/modulos.ts`).
  if (args.includes('--modulos') || args.includes('--texturas-relieve')) {
    const todos = args.includes('--modulos')
      ? encargosDeModulos()
      : TEXTURAS_DE_RELIEVE.map(encargoDeTexturaDeRelieve);
    const solo = args
      .find((x) => x.startsWith('--solo='))
      ?.slice('--solo='.length)
      .split(',');
    const lista = todos.filter(
      (e) => solo === undefined || solo.includes(e.id.replace(/^(modulos|textura)-/, '')),
    );
    for (const bruto of lista) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  // El arte de los mapas densos (`mapa-denso.ts`). `--solo=a,b` filtra por id
  // sin el prefijo del encargo (`--solo=grass,lava`, `--solo=bosque-verde-1`).
  const densas = args.includes('--texturas-suelo')
    ? encargosDeTexturas()
    : args.includes('--muestras-densas')
      ? (['a', 'b'] as const).map(encargoDeLamina)
      : args.includes('--piezas-densas')
        ? encargosDePiezasDensas()
        : null;
  if (densas !== null) {
    const solo = args
      .find((x) => x.startsWith('--solo='))
      ?.slice('--solo='.length)
      .split(',');
    const sinPrefijo = (id: string) => id.replace(/^(suelo|mapa-denso-lamina|mapa)-/, '');
    const lista = densas.filter((e) => solo === undefined || solo.includes(sinPrefijo(e.id)));
    if (solo !== undefined && lista.length !== solo.length) {
      const hay = densas.map((e) => sinPrefijo(e.id));
      throw new Error(
        `--solo pide ${solo.filter((x) => !hay.includes(x)).join(', ')}, que no existe${solo.length - lista.length > 1 ? 'n' : ''}. Hay: ${hay.join(', ')}`,
      );
    }
    for (const bruto of lista) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  if (args.includes('--muestras-mapa')) {
    for (const estilo of ESTILOS_DE_MAPA) {
      const bruto = encargoDeMuestra(estilo);
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  if (args.includes('--giro') || args.includes('--ocho')) {
    for (const a of args.filter((x) => !x.startsWith('--'))) {
      const u = unidad(a);
      // `--solo d0-a,d3-a`: solo esas hojas, para rehacer las que fallan.
      const solo = args
        .find((x) => x.startsWith('--solo='))
        ?.slice('--solo='.length)
        .split(',');
      const lista = args.includes('--giro')
        ? [encargoDeGiro(u)]
        : encargosDeOchoDirecciones(u).filter(
            (e) => solo === undefined || solo.includes(e.id.slice(u.id.length + 1)),
          );
      for (const bruto of lista) {
        if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
        console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
      }
    }
    return;
  }
  const atlas = args.includes('--atlas');
  for (const a of args.filter((x) => !x.startsWith('--'))) {
    const bruto = a.endsWith('.json')
      ? JSON.parse(await readFile(a, 'utf8'))
      : atlas
        ? encargoDeAtlas(unidad(a))
        : encargoDeIdentidad(unidad(a));
    if (args.includes('--rehacer') && (await COLA.olvidar(bruto.id))) {
      console.log(`olvidado el ${bruto.id} anterior`);
    }
    const e = await COLA.encolar(bruto);
    console.log(`encolado ${e.id}`);
  }
}

/** Corrige un encargo hecho en su mismo hilo: encola `<id>-c<n>` con `reanudar`. */
async function corregir(id: string, correccion: string): Promise<void> {
  const desde = (await COLA.estado()).hecho.includes(id) ? 'hecho' : 'fallido';
  const ficha = await COLA.leer(desde, id);
  const hilo = ficha.resultado?.hilo;
  if (hilo === undefined) throw new Error(`el encargo «${id}» no apuntó su hilo de Codex`);
  const base = id.replace(/-c\d+$/, '');
  const ya = (await COLA.estado()) as Record<string, string[]>;
  const usados = Object.values(ya).flat();
  let n = 1;
  while (usados.includes(`${base}-c${n}`)) n++;
  // Las referencias vuelven a adjuntarse: la pose sigue mandando en la corrección.
  const e = await COLA.encolar({
    ...ficha.encargo,
    id: `${base}-c${n}`,
    reanudar: { hilo, correccion },
  });
  console.log(`encolado ${e.id} sobre el hilo ${hilo}`);
}

const [orden, ...resto] = process.argv.slice(2);
switch (orden) {
  case undefined:
  case 'trabajar':
    await trabajar();
    break;
  case 'encolar':
    await encolar(resto);
    break;
  case 'corregir':
    if (resto[0] === undefined || resto[1] === undefined) {
      throw new Error('uso: pnpm taller corregir <encargo> "<corrección>"');
    }
    await corregir(resto[0], resto[1]);
    break;
  case 'estado':
    for (const [e, ids] of Object.entries(await COLA.estado())) {
      console.log(`${e.padEnd(10)} ${ids.length}  ${ids.join(' ')}`);
    }
    break;
  case 'devolver': {
    const id = resto[0];
    if (id === undefined) throw new Error('uso: pnpm taller devolver <id>');
    const estado = await COLA.estado();
    const desde = estado['en-curso'].includes(id) ? 'en-curso' : 'fallido';
    await COLA.devolver(id, desde);
    console.log(`${id}: de ${desde}/ a pendiente/`);
    break;
  }
  case 'retirar':
    for (const id of resto)
      console.log(`${id}: ${(await COLA.retirar(id)) ? 'retirado' : 'no estaba pendiente'}`);
    break;
  case 'componer-atlas-mapa':
    console.log(`→ ${await componerAtlasMapa()}`);
    break;
  case 'reprocesar':
    for (const id of resto) await reprocesar(id);
    break;
  case 'vista-ejercitos':
    console.log(`→ ${await vistaEjercitos()}`);
    break;
  case 'vista-edificios':
    console.log(`→ ${await vistaEdificios()}`);
    break;
  case 'vista-efectos':
    console.log(`→ ${await vistaEfectos()}`);
    break;
  case 'evaluar':
    for (const id of resto) {
      const { filas, celdas } = await evaluar(id);
      const dir = join(RAIZ, '.cache/taller/evaluacion');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${id}.json`), `${JSON.stringify({ filas, celdas }, null, 2)}\n`);
      console.log(
        `${id}: ${filas.filter((f) => f.marcada).length} de ${filas.length} filas marcadas`,
      );
      for (const f of [...filas].sort((a, b) => b.nivel + b.pico - (a.nivel + a.pico)))
        console.log(
          `${f.marcada ? '✘' : ' '} d${f.direccion} ${f.nombre.padEnd(17)} ${f.clip.padEnd(7)} nivel ${f.nivel.toFixed(2)} pico ${f.pico.toFixed(2)} (fotograma ${f.peor + 1})${f.conAzul.length > 0 ? ` AZUL en ${f.conAzul.map((n) => n + 1).join(', ')}` : ''}`,
        );
    }
    break;
  case 'vista-mapa': {
    const semilla = resto[0] === undefined ? 1 : Number(resto[0]);
    if (!Number.isSafeInteger(semilla))
      throw new Error(`«${resto[0]}» no es una semilla: un entero`);
    console.log(`→ ${await vistaMapa(semilla)}`);
    break;
  }
  case 'escenario': {
    const semillas = resto.length === 0 ? [1] : resto.map(Number);
    if (semillas.some((n) => !Number.isSafeInteger(n))) throw new Error('las semillas son enteros');
    for (const r of await escenario(semillas)) {
      const i = r.informe as {
        desnudo: number;
        murallasPartidas: number;
        basesSobreReserva: number;
        casillasDeBarreraSinFormacion: number;
        modulosQueFaltan: string[];
        errores: string[];
      };
      console.log(`→ ${r.png}`);
      console.log(
        `  suelo desnudo ${(i.desnudo * 100).toFixed(1)} % · murallas partidas ${i.murallasPartidas} · bases sobre reserva ${i.basesSobreReserva} · barrera sin formación ${i.casillasDeBarreraSinFormacion}` +
          (i.modulosQueFaltan.length > 0 ? ` · faltan ${i.modulosQueFaltan.join(', ')}` : '') +
          (i.errores.length > 0 ? ` · ERRORES: ${i.errores.join(' | ')}` : ''),
      );
    }
    break;
  }
  case 'catalogo-escena': {
    const c = await escribirCatalogo();
    console.log(
      `→ assets/mapa/escena.json: ${Object.keys(c.hojas).length} hojas, ${Object.keys(c.piezas).length} piezas`,
    );
    break;
  }
  case 'vista-8d':
    // Un solo visor con todas: el argumento solo elige con cuál se abre.
    console.log(`→ ${await vista8d(resto[0])}`);
    break;
  case 'vista':
    for (const r of await vista(resto)) console.log(`→ ${r}`);
    break;
  case 'derivar':
    for (const r of resto) {
      const d = await escribirDerivado(r);
      console.log(
        `${r}: altura ${d.altura}, fotogramas ${Object.values(d.clips)
          .map((c) => c.frames)
          .join('/')}`,
      );
    }
    break;
  default:
    throw new Error(
      `orden desconocida «${orden}»: trabajar, encolar, corregir, retirar, reprocesar, estado, devolver, derivar, vista, vista-8d, vista-mapa, componer-atlas-mapa`,
    );
}
