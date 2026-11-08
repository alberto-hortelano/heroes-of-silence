/**
 * Lo que se hace con un encargo del taller: lanzar Codex con las referencias en su
 * orden (`procesar`) y, con lo que devuelve, recortar el halo, empaquetar si es un
 * atlas, validar con sharp y escribir la imagen, su JSON derivado y el registro de
 * procedencia —referencias con su sha256, hilo de Codex, prompt entero y sha256 del
 * crudo y del resultado— (`postprocesar`). Un fallo después de generar lleva el hilo
 * y el crudo (`FalloTrasGenerar`), para reprocesar sin volver a pedirlo.
 *
 * Lo llaman las órdenes de la cola (`ordenes/cola.ts`: `trabajar`, `reprocesar`).
 * Vivía en `trabajador.ts` hasta el H3 de la reorganización (08-11-2026).
 */
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import sharp from 'sharp';
import { esHojaDeRampa, esHojaDeRelieve } from '../../src/client/render/escenario/catalogo.js';
import { HOJA_DEL_RECINTO } from '../../src/client/render/escenario/recinto/octogono.js';
import { figuraDelBanco } from '../../src/core/gente/banco.js';
import { FIGURA, MARGEN_DEL_RECORTE } from '../../src/shared/arte.js';
import { mensajeDe } from '../../src/shared/errores.js';
import { sha256 } from '../comun/hash.js';
import { dePng } from '../comun/imagen.js';
import { textoJson } from '../comun/json.js';
import { RAIZ } from '../comun/raiz.js';
import { leerBancoDeDisco } from '../npcs/banco.js';
import { CODEX, type Generacion, generar } from './codex.js';
import { escribirPiezaDerivada } from './derivar.js';
import { baseEnCelda, empaquetar, figuraDeLaLamina, recortarAlContenido } from './empaquetar.js';
import {
  alturaDelReposo,
  type Encargo,
  filasDeAtlas,
  fondoDeReferencia,
  promptDe,
} from './encargo.js';
import { escribirModulos } from './escenario/modulos.js';
import { alAcabarUnaHoja } from './juntar.js';
import { escribirPuestoDerivado } from './mapa.js';
import { escribirIndiceDeLaMuralla, esDeLaMurallaDeBatalla } from './muralla-de-batalla.js';
import { escribirMurosDerivados, esMuroNorteSur } from './muros.js';
import { encolarLoQueSigue } from './npcs.js';
import { escribirPuenteDerivado } from './paredes-puentes.js';
import { escalaDePose } from './pose-del-encargo.js';
import { ritmoDelEncargo } from './poses-8d.js';
import { escribirRecintoDerivado } from './recinto.js';
import { recortar, UMBRALES } from './recorte.js';
import { recortarLaBase } from './recorte-base.js';
import { escribirRelieveDerivado } from './relieve.js';
import { estimarTroncos, hayVision } from './revision/vision.js';
import { costura, hacerTeselable, LADO_DE_TEXTURA, UMBRAL_DE_COSTURA } from './textura.js';
import { validarElEncargo } from './validar.js';

/** La ruta de un fichero de `~/.codex` sin el home: la procedencia no lleva rutas de esta máquina. */
export const sinHome = (r: string): string => r.replace(homedir(), '~');

/** Un fallo después de generar: lleva el hilo y el crudo, para reprocesar sin volver a pedirlo. */
export class FalloTrasGenerar extends Error {
  constructor(
    mensaje: string,
    readonly hilo: string,
    readonly crudo: string,
  ) {
    super(mensaje);
  }
}

export async function procesar(
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
        // La pose en color sobre verde y la profundidad sobre negro (`fondoDeReferencia`).
        const fondo = fondoDeReferencia(r.papel);
        const imagen = r.figura === undefined ? bytes : await figuraDeLaLamina(bytes, r.figura);
        await (fondo === null ? sharp(imagen) : sharp(imagen).flatten({ background: fondo }))
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
      throw new FalloTrasGenerar(mensajeDe(err), gen.hilo, gen.crudo);
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
      const t = encargo.tamano;
      if (t !== undefined) {
        const m = await sharp(crudo).metadata();
        if (m.width !== t.ancho || m.height !== t.alto) {
          final = await sharp(crudo).resize(t.ancho, t.alto, { fit: 'fill' }).png().toBuffer();
          pasos.push(
            `llevado de ${m.width}×${m.height} a ${t.ancho}×${t.alto}, el tamaño que pide`,
          );
        }
      }
    } else {
      const r = await recortar(crudo);
      pasos.push(
        `halo recortado desde los bordes (alfa < ${UMBRALES.halo}); cuerpo opaco (alfa ≥ ${UMBRALES.cuerpo})`,
      );
      if (encargo.tipo === 'modulos') {
        const indice = await escribirModulos(
          r,
          join(RAIZ, encargo.salida),
          encargo.cuantos ?? encargo.nombres?.length ?? 16,
          encargo.nombres,
        );
        extra = { indiceDeModulos: indice };
        final = await recortarAlContenido(r, MARGEN_DEL_RECORTE);
        pasos.push(
          `hoja partida en ${indice.length} módulos a su tamaño nativo, cada uno con su ancla en la base`,
        );
      } else if (encargo.tipo === 'atlas') {
        const altura = alturaDelReposo(encargo);
        const celda = encargo.celda ?? FIGURA.celda;
        const pose = await escalaDePose(encargo);
        const filas = filasDeAtlas(encargo);
        // C1 con el estimador de pose si el entorno de visión está (la señal absoluta
        // que el usuario prefirió); sin él, con la correlación entre vecinos.
        const p = await empaquetar(
          r,
          filas,
          altura,
          celda,
          pose,
          hayVision() ? estimarTroncos : undefined,
        );
        final = p.png;
        pasos.push(
          `figuras localizadas y empaquetadas en ${FIGURA.columnas}×${filas} celdas de ${celda}, ` +
            `escala uniforme ${p.escala.toFixed(4)}, pies en y=${baseEnCelda(celda)}, ` +
            (p.alturaFinal === p.alturaPedida
              ? `reposo a ${altura} px`
              : `reposo reducido de ${p.alturaPedida} a ${p.alturaFinal} px para que el fotograma más ancho quepa con margen`),
        );
        pasos.push(
          p.encuadre === undefined
            ? `sin recolocar el tronco (C1): ${pose.sinTronco ?? 'ningún par de fotogramas se parecía lo bastante'}`
            : 'cada fotograma recolocado para que el tronco siga al del maniquí (C1, `encuadre.ts`)',
        );
        extra = {
          apoyoPorFila: p.apoyoPorFila,
          deLaPose: p.deLaPose,
          ...(p.encuadre === undefined ? {} : { encuadre: p.encuadre }),
          ...(p.porRejilla === undefined ? {} : { porRejilla: p.porRejilla }),
        };
      } else {
        final = await recortarAlContenido(r, MARGEN_DEL_RECORTE);
        pasos.push(`recortado al contenido con ${MARGEN_DEL_RECORTE} px de margen`);
      }
    }

    const informe = await validarElEncargo(final, encargo);
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
    // Una rampa (§35) es una imagen entera que se corta en sus tres piezas por la guía.
    if (encargo.tipo === 'imagen' && esHojaDeRampa(basename(encargo.salida))) {
      await escribirRelieveDerivado([basename(encargo.salida)]);
      pasos.push('cortada en sus tres piezas por la guía, con las juntas de cada una');
    }
    if (encargo.tipo === 'imagen' && /^assets\/mapa\/[^/]+$/.test(encargo.salida)) {
      const d = await escribirPiezaDerivada(rutaSalida);
      pasos.push(`JSON derivado: ${d.ancho}×${d.alto}, ancla en (${d.ancla})`);
      // Un tramo de norte a sur se ancla y se encadena por las juntas de su guía (§29).
      const id = basename(encargo.salida);
      if (esMuroNorteSur(id)) {
        await escribirMurosDerivados([id]);
        pasos.push(
          'ancla y paso de la tirada, registrados sobre la guía y afinados por las almenas',
        );
      }
      // Un puente se ancla en el centro del tablero, no en la base (§17).
      if (encargo.referencias.some((r) => r.papel === 'guia') && /\/puente-/.test(encargo.salida)) {
        await escribirPuenteDerivado(rutaSalida);
        pasos.push('ancla llevada al centro del tablero desde la guía de geometría');
      }
      // Una obra del puesto se registra sobre su guía: de ahí, su escala en el mapa.
      if (encargo.referencias.some((r) => r.papel === 'guia') && /\/puesto-/.test(encargo.salida)) {
        await escribirPuestoDerivado(rutaSalida);
        pasos.push('casilla registrada sobre la guía de geometría (pxPorCasilla)');
      }
    }
    // La muralla del tablero de batalla: el índice de cajas que lee el lienzo.
    if (esDeLaMurallaDeBatalla(encargo.salida)) {
      await escribirIndiceDeLaMuralla();
      pasos.push(
        'caja de lo opaco (y el cuerpo de una cara) en el índice de la muralla de batalla',
      );
    }
    // La base caminable: con cada cuadro nuevo (un maestro, una placa, una
    // edición) se vuelve a recortar lo que ya se puede y se rehace el índice.
    if (encargo.despues?.orden === 'recortar-base') {
      const { indice, avisos } = await recortarLaBase(encargo.despues.faccion);
      pasos.push(
        `recortes de la base rehechos: ${Object.keys(indice.edificios).length} edificios, placas ${indice.tramos.filter((t) => t !== null).length} de ${indice.tramos.length}`,
        ...avisos,
      );
    }
    if (encargo.tipo === 'modulos') {
      await writeFile(
        join(RAIZ, `${encargo.salida}.json`),
        textoJson({ hoja: basename(rutaSalida), modulos: extra.indiceDeModulos }, 2),
      );
      // Una hoja del relieve se coloca y encadena por sus juntas, llevadas desde la guía.
      // Las puertas del recinto (§37) van de vértice a vértice por sus juntas.
      if (basename(encargo.salida) === HOJA_DEL_RECINTO) {
        await escribirRecintoDerivado();
        pasos.push('el pie de las dos puntas de cada módulo, registrado sobre la guía');
      }
      if (esHojaDeRelieve(basename(encargo.salida))) {
        await escribirRelieveDerivado([basename(encargo.salida)]);
        pasos.push('las juntas de cada módulo, registradas sobre la guía');
      }
    }
    // Media dirección: se deriva al juntarse con la otra hoja. Una versión de la
    // revisión (fuera de `assets/`) no se junta: entra con `pnpm taller adoptar`.
    if (
      encargo.tipo === 'atlas' &&
      encargo.ocho !== undefined &&
      encargo.salida.startsWith('assets/')
    )
      pasos.push(await alAcabarUnaHoja(dirname(rutaSalida)));

    let version = 'desconocida';
    try {
      version = execFileSync(CODEX, ['--version'], { encoding: 'utf8' }).trim();
    } catch {
      // La versión es informativa; no se para un encargo por ella.
    }
    const ritmo = ritmoDelEncargo(encargo);
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
      referencias: referencias.map((r) => ({
        ruta: r.ruta,
        papel: r.papel,
        ...(r.figura === undefined ? {} : { figura: r.figura }),
        sha256: r.sha256,
      })),
      // La hoja del maniquí de una edición, que no es su primera referencia (`poseDeLaProcedencia`).
      // Con su sha: así se sabe si su maniquí cambió (`hojasSobreOtroManiqui`).
      ...(encargo.ocho?.pose === undefined
        ? {}
        : {
            pose: encargo.ocho.pose,
            shaDeLaPose: sha256(await readFile(join(RAIZ, encargo.ocho.pose))),
          }),
      crudo: {
        fichero: sinHome(gen.crudo),
        sha256: sha256(crudo),
        ancho: meta.width,
        alto: meta.height,
      },
      postproceso: pasos,
      validacion: informe.medidas,
      ...(extra.deLaPose === undefined ? {} : { deLaPose: extra.deLaPose }),
      // El ritmo de sus clips en el maniquí sobre el que se pinta: con él se deriva su
      // atlas aunque el maniquí cambie después (`conElRitmoDeSusHojas`).
      ...(ritmo === null ? {} : { ritmo }),
      ...(extra.encuadre === undefined ? {} : { encuadre: extra.encuadre }),
      ...(extra.porRejilla === undefined ? {} : { porRejilla: extra.porRejilla }),
      salida: { ruta: relative(RAIZ, rutaSalida), sha256: sha256(webp) },
    };
    await writeFile(join(RAIZ, `${encargo.salida}.procedencia.json`), textoJson(procedencia, 2));
    // Una figura del banco de NPC se encadena sola (decisión del usuario, «se
    // encadena sola»): la identidad pide el giro, el giro las hojas, y cada hoja
    // nada más (las otras ya están en la cola). Sin revisión humana: una mala se
    // rehace con `pnpm npcs rehacer`.
    if (encargo.despues?.orden === 'encadenar-npc') {
      const figura = figuraDelBanco(leerBancoDeDisco(), encargo.despues.npc);
      if (figura === undefined)
        throw new Error(
          `«${encargo.despues.npc}» ya no está en el banco de NPC (data/npcs.json): no se encadena nada`,
        );
      const siguen = await encolarLoQueSigue(figura, RAIZ);
      if (siguen.length > 0) console.log(`  · encadena ${siguen.join(', ')}`);
    }
    return { hilo: gen.hilo, salida: relative(RAIZ, rutaSalida) };
  }
}
