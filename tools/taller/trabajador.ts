/**
 * `pnpm taller`: el trabajador de la cola de imágenes.
 *
 *   pnpm taller                          trabaja hasta vaciar la cola
 *   pnpm taller encolar <unidad|fichero.json>…
 *                                        una unidad de `unidades.ts` encola su
 *                                        identidad, su giro con `--giro` o sus
 *                                        16 hojas de 8 direcciones con `--ocho`
 *                                        (24 si dispara: la C es el disparo);
 *                                        `--rehacer` olvida el encargo cerrado de antes
 *   pnpm taller corregir <encargo> "<corrección>"
 *                                        reabre el hilo de Codex de un encargo hecho
 *   pnpm taller estado
 *   pnpm taller devolver <id>            de en-curso/ o fallido/ a pendiente/
 *   pnpm taller retirar <id>…            borra pendientes que ya no valen
 *   pnpm taller reprocesar <id>          rehace el post-proceso sobre el crudo ya generado
 *   pnpm taller reprocesar <unidad> --adoptadas  reempaqueta desde su crudo las hojas adoptadas de versiones y las vuelve a adoptar
 *   pnpm taller derivar <hoja.webp>…     reescribe el JSON de una hoja
 *   pnpm taller derivar-poses            reescribe `_poses/atlas-8d.json`, las anclas del Y Bot
 *   pnpm taller maniqui <unidad>…        el maniquí propio de una unidad, con su profundidad, en `_poses/unidades/<id>-8d/`
 *   pnpm taller maniqui <unidad>… --huesos  (o `--civil --huesos`) el esqueleto de cada hoja, junto a ella: lo
 *                                        renderiza aparte y lanza si sus hojas no salen idénticas a las de `assets/`
 *
 *   La revisión de animaciones (`revision/`, la skill `/revisar-animaciones`):
 *   pnpm taller vision-instalar          el entorno de visión (`.cache/vision/.venv`, desde `revision/requirements.txt`)
 *   pnpm taller revisar-maniqui <unidad>…  si anda hacia atrás, si el reposo baila, si el arma no se lee
 *   pnpm taller revisar <unidad> [dN…] [--sin-juez] [--clips=…]  los paneles de cada clip y el juicio de ChatGPT
 *   pnpm taller jurado unir|arbitrar|cruzar <unidad> [dN…]  la unión de los jurados, los árbitros, el veredicto
 *   pnpm taller visor <unidad>           lo que está en disputa y las versiones que elegir, para la persona
 *   pnpm taller visor-maniqui <unidad>   su maniquí animado de tres cuartos, de lado y de espaldas, con sus avisos
 *   pnpm taller versiones <unidad> <dN> <h>  encola otra tirada, «esqueleto» y «todo» de una hoja
 *   pnpm taller elegir <unidad> <dN> <h>     las compara a ciegas con la de ahora, en los dos órdenes
 *   pnpm taller adoptar <unidad> <dN> <h>    la ganadora, si la persona la prefirió (o ganó claro su torneo), a `assets/`
 *   pnpm taller adoptar <unidad> --todas     todas las que se pueden; dice cuáles quedan para el visor
 *   pnpm taller versiones <unidad> --rechazadas  otra vez las hojas rechazadas en el vistazo final
 *   pnpm taller encolar --hitos          los hitos de los nodos sin pieza de paso (#176, `mapa.ts`)
 *   pnpm taller encolar --cofre          el cofre del mapa, pieza suelta (#147, `mapa.ts`)
 *   pnpm taller encolar --tablillas | --muralla-ns [--solo=…]
 *                                        las tablillas por rumbo y la muralla norte-sur (§29, `mapa.ts`; los tramos, con su guía, `muros.ts`)
 *   pnpm taller encolar --texturas-suelo | --muestras-densas | --piezas-densas [--solo=…]
 *                                        el arte de los mapas densos (`mapa-denso.ts`)
 *   pnpm taller vista-mapa [semilla]     un mapa denso del generador pintado con ese arte
 *   pnpm taller encolar --modulos | --texturas-relieve [--solo=…]
 *                                        las hojas de módulos del escenógrafo
 *   pnpm taller encolar --paredes-puentes [--solo=…]
 *                                        los puentes (§17), con su guía
 *   pnpm taller encolar --laderas [--solo=roca-este-1,…]
 *                                        las laderas que encadenan (§20, `laderas.ts`), con su guía
 *   pnpm taller encolar --relieve [--solo=diagonales-roca-se-1,bajadas-roca-1,…]
 *                                        las diagonales y las bajadas del relieve por celdas (§23), con su guía
 *   pnpm taller encolar --rampas [--solo=rampa-roca-1,…]
 *                                        las rampas que abren la pared (§35, `rampas.ts`), con su guía
 *   pnpm taller encolar --recinto [--rehacer]
 *                                        las puertas y los tramos en diagonal del recinto de una ciudad (§37, `recinto.ts`), con su guía
 *   pnpm taller derivar-recinto          apunta el pie de las dos puntas de cada módulo del recinto desde su guía
 *   pnpm taller guias                    escribe las guías de geometría de `paredes-puentes.ts`, `laderas.ts`, `diagonales.ts`, `bajadas.ts`, `rampas.ts` y `recinto.ts`
 *   pnpm taller derivar-puentes <puente.webp>…  rehace su ancla (centro del tablero) y su casilla
 *   pnpm taller derivar-muros            el paso de la tirada de los tramos de norte a sur (`muros.ts`)
 *   pnpm taller escenario [semilla…] [--px=N]  el escenógrafo: compone, pinta, captura y mide
 *   pnpm taller derivar-relieve [hoja…]  apunta las juntas de cada módulo del relieve desde su guía: laderas (§20), diagonales y bajadas (§23); corta las rampas (§35)
 *   pnpm taller derivar-casas [--vista]  recorta las casas sueltas de la labranza de la hoja de pueblos (`casas.ts`); con --vista, cada casa teñida y numerada
 *   pnpm taller catalogo-escena          rehace assets/mapa/escena.json, el catálogo que lee el juego
 *   pnpm taller encolar --base templarios [--solo=maestro-t1,placa-t1,…]
 *                                        la plaza de la base en un solo cuadro (vuelta 3, `base.ts`): maestro, placa y ediciones de cada tramo
 *                                        y, con `--solo=retoque-<id>,abierta-<id>`, el retoque de un edificio y la versión abierta de cada morada
 *   pnpm taller recortar-base templarios     deriva los tramos (lo de encima del pie), el suelo, cada recorte y cada versión abierta, y rehace el índice (`recorte-base.ts`)
 *   pnpm taller medir-base templarios [n]    propone las regiones de un tramo, para `data/bases/templarios.json`
 *   pnpm taller vista-base templarios [dir]  la revisión: tramos, máscaras, compuesta, costuras y eslabones
 *   pnpm taller vista-ejercitos          una página con todos los ejércitos, para elegir o comparar
 *   pnpm taller vista-8d [unidad|juego]  el visor de 8 direcciones de las unidades y las poses
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
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import {
  esHojaDeBajada,
  esHojaDeDiagonal,
  esHojaDeLadera,
  esHojaDeRampa,
  esHojaDeRelieve,
} from '../../src/client/render/escenario/catalogo.js';
import type { Escena } from '../../src/client/render/escenario/colocar.js';
import { HOJA_DEL_RECINTO } from '../../src/client/render/escenario/recinto.js';
import { figuraDelBanco } from '../../src/core/npcs.js';
import { FACTION_IDS, type FactionId } from '../../src/core/types.js';
import { FIGURA, NOMBRES_DE_DIRECCION } from '../../src/shared/arte.js';
import { disposicionDe } from '../../src/shared/base.js';
import { bandera } from '../argumentos.js';
import {
  CANDIDATOS_DEL_MUESTRARIO,
  carpetaDeManiqui,
  DIR_MANIQUIES,
  JUEGOS_DE_ARMAS,
  type JuegoDeArmas,
  OCHO_DIRECCIONES,
  renderizarMuestrario,
  renderizarOchoDirecciones,
} from '../art/poses.js';
import { cutoutBackground } from '../gen/cutout.js';
import { leerBancoDeDisco } from '../npcs/banco.js';
import { esEncargoDeNpc, REINTENTOS_DE_NPC, reintentarSiQueda } from '../npcs/en-el-taller.js';
import {
  encargoDeBajadas,
  escribirBajadasDerivadas,
  escribirGuiasDeBajadas,
  NIVELES_DE_BAJADA,
} from './bajadas.js';
import { ARTE_DE_LA_BASE, encargosDeLaBase, escribirFuentesDeLaBase } from './base.js';
import { escribirCasas, vistaDeLasCasas } from './casas.js';
import { CODEX, FalloDeCodex, type Generacion, generar } from './codex.js';
import { colaDelTaller, YaEnLaCola } from './cola.js';
import {
  escribirDerivado,
  escribirEfectoDerivado,
  escribirPiezaDerivada,
  RELOJ,
} from './derivar.js';
import {
  encargoDeDiagonales,
  escribirDiagonalesDerivadas,
  escribirGuiasDeDiagonales,
  LADOS_DE_DIAGONAL,
  NIVELES_DE_DIAGONAL,
} from './diagonales.js';
import { encargosDeEdificios } from './edificios.js';
import { encargoDeIconosDeRecursos, encargosDeEfectos } from './efectos.js';
import {
  empaquetarEfecto,
  LADO_EFECTO,
  LADO_ICONO,
  partirIconos,
  recorteSuave,
} from './efectos-proceso.js';
import { baseEnCelda, empaquetar, recortarAlContenido } from './empaquetar.js';
import {
  alturaDelReposo,
  type Encargo,
  encargoSchema,
  filasDeAtlas,
  fondoDeReferencia,
  promptDe,
} from './encargo.js';
import { encogerElTramo } from './encoger-base.js';
import { escribirCatalogo } from './escenario/catalogo-disco.js';
import { escenario, recortesDeSemilla } from './escenario/escenario.js';
import {
  encargoDeTexturaDeRelieve,
  encargosDeModulos,
  escribirModulos,
  TEXTURAS_DE_RELIEVE,
} from './escenario/modulos.js';
import { generarConFal } from './fal.js';
import { alAcabarUnaHoja, derivacionDeLaCarpeta } from './juntar.js';
import { encargosDeLaderas, escribirGuiasDeLaderas, escribirLaderasDerivadas } from './laderas.js';
import {
  ESTILOS_DE_MAPA,
  encargoDeCofre,
  encargoDeMuestra,
  encargosDeHitos,
  encargosDeMurallaNS,
  encargosDePiezas,
  encargosDeTablillas,
} from './mapa.js';
import { encargoDeLamina, encargosDePiezasDensas, encargosDeTexturas } from './mapa-denso.js';
import { escribirGuiaDelMuro, escribirMurosDerivados, esMuroNorteSur } from './muros.js';
import { DIR_DEL_MANIQUI_CIVIL, encolarLoQueSigue, POSE_DE_LA_IDENTIDAD } from './npcs.js';
import {
  encargosDeParedesYPuentes,
  escribirGuias,
  escribirPuenteDerivado,
  MATERIALES,
} from './paredes-puentes.js';
import { escalaDePose } from './pose-del-encargo.js';
import { escribirAtlasDePoses, RUTA_DEL_ATLAS_8D } from './poses-8d.js';
import { encargosDeRampas, escribirGuiasDeRampas, escribirRampasDerivadas } from './rampas.js';
import { encargoDelRecinto, escribirGuiaDelRecinto, escribirRecintoDerivado } from './recinto.js';
import { aRaster, dePng, recortar, UMBRALES } from './recorte.js';
import { medirLaBase, recortarLaBase } from './recorte-base.js';
import { arbitrar, cruzar, unir } from './revision/jurado.js';
import {
  casosDelManiqui,
  hojasSobreOtroManiqui,
  leerHuesos,
  rechazarSiElManiquiFalla,
  revisarElManiqui,
} from './revision/maniqui.js';
import { comprobarClips, direccionesDe, figura, revisar } from './revision/revisar.js';
import { mayorSalto, saltosDeLaHoja } from './revision/salto.js';
import {
  adoptar,
  adoptarTodas,
  casosDelVisor,
  elegir,
  escribirClave,
  prepararVersiones,
  readoptar,
  rechazadas,
  versionesAdoptadas,
} from './revision/versiones.js';
import { estimarTroncos, hayVision, instalar, visor } from './revision/vision.js';
import { costura, hacerTeselable, LADO_DE_TEXTURA, UMBRAL_DE_COSTURA } from './textura.js';
import {
  encargoDeGiro,
  encargoDeIdentidad,
  encargosDeOchoDirecciones,
  juegoDelYBot,
  unidad,
} from './unidades.js';
import { validarElEncargo } from './validar.js';
import { carpetaDeFotogramas, generarConVideo } from './video.js';
import { vistaEdificios, vistaEfectos, vistaEjercitos } from './vista.js';
import { vista8d } from './vista-8d.js';
import { vistaBase } from './vista-base.js';
import { vistaMapa } from './vista-mapa.js';

const RAIZ = resolve(import.meta.dirname, '../..');

/** La facción de un argumento de la línea de órdenes, o lanza con el uso. */
function faccionDe(arg: string | undefined, uso: string): FactionId {
  const f = FACTION_IDS.find((x) => x === arg);
  if (f === undefined) {
    throw new Error(`uso: ${uso} (la facción es una de ${FACTION_IDS.join(', ')}, no «${arg}»)`);
  }
  return f;
}
export const COLA = colaDelTaller(RAIZ);

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
        // La pose en color sobre verde y la profundidad sobre negro (`fondoDeReferencia`).
        const fondo = fondoDeReferencia(r.papel);
        await (fondo === null ? sharp(bytes) : sharp(bytes).flatten({ background: fondo }))
          .png()
          .toFile(png);
        return { ...r, sha256: sha256(bytes), png };
      }),
    );
    const prompt = promptDe(encargo);
    if (previa === undefined)
      console.log(
        `  · ${encargo.motor === undefined ? 'Codex' : `fal ${encargo.motor.endpoint}`}: ${encargo.referencias.map((r) => `${r.papel}=${r.ruta}`).join(', ') || 'sin referencias'}`,
      );
    const gen =
      previa ??
      (encargo.motor === undefined
        ? await generar(
            prompt,
            referencias.map((r) => r.png),
            encargo.reanudar?.hilo,
          )
        : encargo.motor.video === true
          ? await generarConVideo(encargo)
          : await generarConFal(encargo, prompt, referencias));
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
      // Un efecto es semitransparente a propósito (humo, resplandor): recorte suave.
      const r =
        encargo.tipo === 'efecto'
          ? recorteSuave(await aRaster(crudo))
          : await recortar(
              // Un motor sin alfa pinta sobre un fondo liso: se quita antes del recorte.
              encargo.motor?.fondo === 'liso' ? await cutoutBackground(crudo) : crudo,
            );
      if (encargo.motor?.fondo === 'liso')
        pasos.push('fondo liso del motor quitado por relleno desde el borde (cutoutBackground)');
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
        final = await recortarAlContenido(r, 24);
        pasos.push('recortado al contenido con 24 px de margen');
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
    // Y los edificios de ciudad, que se colocan igual: por el centro de su base.
    // Una rampa (§35) es una imagen entera que se corta en sus tres piezas por la guía.
    if (encargo.tipo === 'imagen' && esHojaDeRampa(basename(encargo.salida))) {
      await escribirRelieveDerivado([basename(encargo.salida)]);
      pasos.push('cortada en sus tres piezas por la guía, con las juntas de cada una');
    }
    if (
      encargo.tipo === 'imagen' &&
      /^assets\/(mapa|edificios\/[a-z-]+)\/[^/]+$/.test(encargo.salida)
    ) {
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
    if (encargo.tipo === 'efecto') {
      const d = await escribirEfectoDerivado(rutaSalida);
      pasos.push(`JSON derivado: ${d.fotogramas} fotogramas, caja ${d.caja}`);
    }
    if (encargo.tipo === 'modulos') {
      await writeFile(
        join(RAIZ, `${encargo.salida}.json`),
        `${JSON.stringify({ hoja: basename(rutaSalida), modulos: extra.indiceDeModulos }, null, 2)}\n`,
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
    if (encargo.tipo === 'iconos') {
      await writeFile(
        join(RAIZ, `${encargo.salida}.json`),
        `${JSON.stringify({ lado: LADO_ICONO, iconos: extra.indiceDeIconos, lamina: basename(rutaSalida) }, null, 2)}\n`,
      );
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
    const procedencia = {
      encargo: encargo.id,
      tipo: encargo.tipo,
      fecha: new Date().toISOString(),
      herramienta:
        encargo.motor === undefined
          ? { nombre: 'codex exec (ChatGPT por la suscripción, imagegen integrado)', version }
          : { nombre: `fal.ai ${encargo.motor.endpoint}`, params: encargo.motor.params },
      ...(gen.coste === undefined ? {} : { coste: gen.coste }),
      hilo: gen.hilo,
      ...(encargo.reanudar ? { reanuda: encargo.reanudar.hilo } : {}),
      prompt,
      referencias: referencias.map((r) => ({ ruta: r.ruta, papel: r.papel, sha256: r.sha256 })),
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
      ...(extra.encuadre === undefined ? {} : { encuadre: extra.encuadre }),
      ...(extra.porRejilla === undefined ? {} : { porRejilla: extra.porRejilla }),
      salida: { ruta: relative(RAIZ, rutaSalida), sha256: sha256(webp) },
    };
    await writeFile(
      join(RAIZ, `${encargo.salida}.procedencia.json`),
      `${JSON.stringify(procedencia, null, 2)}\n`,
    );
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

/**
 * Vacía la cola. Con `soloNpc` (`pnpm npcs trabajar`, el que lanza `pnpm dev` al
 * aceptar un mundo), solo los encargos del banco de NPC: acaba al vaciar esos y no
 * se lleva lo que otro dejó en la cola.
 */
async function trabajar(soloNpc = false): Promise<void> {
  await COLA.preparar();
  let hechos = 0;
  let fallidos = 0;
  for (;;) {
    const encargo = await COLA.tomar(undefined, soloNpc ? esEncargoDeNpc : undefined);
    if (encargo === null) break;
    console.log(`→ ${encargo.id} (${encargo.tipo})`);
    // Un maniquí sin esqueleto, de otro render o que anda hacia atrás no se pinta.
    const rechazo = await rechazarSiElManiquiFalla(COLA, encargo, RAIZ);
    if (rechazo !== null) {
      console.log(`  ✘ ${rechazo}`);
      fallidos++;
      continue;
    }
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
      // Una figura del banco de NPC no se queda a medias por una tirada mala: se
      // vuelve a pedir, con la cuenta en su ficha (QA del banco de NPC, H2). Si no se
      // puede (otro `pnpm npcs trabajar` lo reintentó a la vez, H7), se dice y la cola
      // sigue: tumbar el trabajador dejaría lo demás sin pintar.
      let vez: number | null = null;
      try {
        vez = await reintentarSiQueda(COLA, encargo.id);
      } catch (err) {
        console.log(
          `  ! no se reintenta ${encargo.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (vez !== null) {
        console.log(
          `  ↻ ${encargo.id} vuelve a pendiente/ (reintento ${vez} de ${REINTENTOS_DE_NPC})`,
        );
        continue;
      }
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
  // Solo lo que se pintó con esta cola y cuyo crudo sigue en `~/.codex` (QA, H10).
  if (!estado.hecho.includes(id) && !estado.fallido.includes(id))
    throw new Error(
      `«${id}» no está en la cola (ni en hecho/ ni en fallido/): solo se reprocesa lo que se pintó con esta cola y cuyo crudo sigue en ~/.codex. Lo pintado antes se arregla repintándolo («pnpm taller versiones <unidad> <dN> <h>»)`,
    );
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
  // De `fallido/` a `en-curso/` de un golpe: por `pendiente/`, un trabajador vivo
  // (el de la semilla del banco de NPC, p. ej.) podía llevárselo y pedirlo a Codex.
  const encargo = encargoSchema.parse((await COLA.retomar(id, desde)).encargo);
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

/**
 * Encola `todos`, o solo los que nombra `--solo=` por su nombre corto (`corto`),
 * olvidándolos antes con `--rehacer` y sin repetir lo que ya está en la cola. Un
 * nombre de `--solo=` que no está lanza diciendo cuáles hay; `tambien` acepta los
 * que existen pero aún no se pueden encolar (lo que espera en la base). Lo usan
 * las tablillas y la base.
 */
async function encolarConSolo(
  args: readonly string[],
  todos: readonly Encargo[],
  corto: (id: string) => string,
  tambien: (nombre: string) => boolean = () => false,
): Promise<void> {
  const solo = args
    .find((x) => x.startsWith('--solo='))
    ?.slice('--solo='.length)
    .split(',');
  const desconocidos = (solo ?? []).filter(
    (s) => !todos.some((e) => corto(e.id) === s) && !tambien(s),
  );
  if (desconocidos.length > 0) {
    throw new Error(
      `--solo: no hay ${desconocidos.join(', ')}; se pueden pedir ${todos.map((e) => corto(e.id)).join(', ')}`,
    );
  }
  await COLA.preparar();
  for (const bruto of todos) {
    if (solo !== undefined && !solo.includes(corto(bruto.id))) continue;
    if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
    const estado = await COLA.estado();
    if (Object.values(estado).some((ids) => ids.includes(bruto.id))) {
      console.log(`ya está en la cola: ${bruto.id}`);
      continue;
    }
    console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
  }
}

async function encolar(args: readonly string[]): Promise<void> {
  if (args.includes('--piezas-mapa')) {
    for (const bruto of encargosDePiezas()) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  if (args.includes('--hitos')) {
    for (const bruto of encargosDeHitos()) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  // Las tablillas por rumbo y la muralla norte-sur (§29). `--solo=oeste,norte`
  // o `--solo=muro-ns-1`, por el id sin el prefijo del encargo. Lo que ya está en
  // la cola no se repite.
  if (args.includes('--tablillas') || args.includes('--muralla-ns')) {
    if (args.includes('--muralla-ns')) console.log(`guía → ${await escribirGuiaDelMuro()}`);
    const todos = args.includes('--tablillas') ? encargosDeTablillas() : encargosDeMurallaNS();
    await encolarConSolo(args, todos, (id) => id.replace(/^mapa-(nodo-hito-tablilla-)?/, ''));
    return;
  }
  if (args.includes('--cofre')) {
    const bruto = encargoDeCofre();
    if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
    console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    return;
  }
  // La base caminable (vuelta 3): los maestros, las placas y las ediciones, en
  // serie; cada uno se encola cuando ya está lo que lleva de referencia, así que
  // se vuelve a correr cuando haya llegado lo de la tanda anterior. Las guías y
  // las hojas de identidad que falten se escriben antes en `fuentes/`.
  const base = args.indexOf('--base');
  if (base >= 0) {
    const faccion = faccionDe(
      args[base + 1],
      'pnpm taller encolar --base templarios [--rehacer] [--solo=maestro-t1,placa-t1,edicion-town-hall,…]',
    );
    for (const g of await escribirFuentesDeLaBase(faccion)) console.log(`fuente: ${g}`);
    const { listos, esperan } = encargosDeLaBase(faccion);
    // `--solo=`: por el id sin `base-<facción>-`. Con `--rehacer`, solo esos se
    // olvidan: sin él, `--rehacer` volvería a pedir la base entera.
    const prefijo = `base-${faccion}-`;
    await encolarConSolo(
      args,
      listos,
      (id) => id.slice(prefijo.length),
      (s) => esperan.some((e) => e.startsWith(`${s} `)),
    );
    for (const e of esperan) console.log(`espera: ${e}`);
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
  // Los puentes (§17, `paredes-puentes.ts`): primero las guías.
  if (args.includes('--paredes-puentes')) {
    await escribirGuias();
    const solo = args
      .find((x) => x.startsWith('--solo='))
      ?.slice('--solo='.length)
      .split(',');
    const sinPrefijo = (id: string) => id.replace(/^(mapa|modulos)-/, '');
    const todos = encargosDeParedesYPuentes();
    const lista = todos.filter((e) => solo === undefined || solo.includes(sinPrefijo(e.id)));
    if (solo !== undefined && lista.length !== solo.length)
      throw new Error(`--solo: hay ${todos.map((e) => sinPrefijo(e.id)).join(', ')}`);
    for (const bruto of lista) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  // Las laderas que encadenan (§20, `laderas.ts`): primero las guías.
  if (args.includes('--laderas')) {
    await escribirGuiasDeLaderas();
    const solo = args
      .find((x) => x.startsWith('--solo='))
      ?.slice('--solo='.length)
      .split(',');
    const sinPrefijo = (id: string) => id.replace(/^modulos-laderas-/, '');
    const todos = encargosDeLaderas();
    const lista = todos.filter((e) => solo === undefined || solo.includes(sinPrefijo(e.id)));
    if (solo !== undefined && lista.length !== solo.length)
      throw new Error(`--solo: hay ${todos.map((e) => sinPrefijo(e.id)).join(', ')}`);
    for (const bruto of lista) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  // Las puertas y los tramos en diagonal del recinto de una ciudad (§37): primero su guía.
  if (args.includes('--recinto')) {
    console.log(`guía → ${await escribirGuiaDelRecinto()}`);
    const bruto = encargoDelRecinto();
    if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
    console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    return;
  }
  // Las rampas (§35): primero su guía.
  if (args.includes('--rampas')) {
    await escribirGuiasDeRampas();
    const solo = args
      .find((x) => x.startsWith('--solo='))
      ?.slice('--solo='.length)
      .split(',');
    const todos = encargosDeRampas();
    const lista = todos.filter((e) => solo === undefined || solo.includes(e.id));
    if (solo !== undefined && lista.length !== solo.length)
      throw new Error(`--solo: hay ${todos.map((e) => e.id).join(', ')}`);
    for (const bruto of lista) {
      if (args.includes('--rehacer')) await COLA.olvidar(bruto.id);
      console.log(`encolado ${(await COLA.encolar(bruto)).id}`);
    }
    return;
  }
  // El relieve por celdas (§23): las diagonales y las bajadas, primero sus guías.
  if (args.includes('--relieve')) {
    await escribirGuiasDeDiagonales();
    await escribirGuiasDeBajadas();
    const solo = args
      .find((x) => x.startsWith('--solo='))
      ?.slice('--solo='.length)
      .split(',');
    const sinPrefijo = (id: string) => id.replace(/^modulos-/, '');
    const todos = encargosDelRelieve();
    const lista = todos.filter((e) => solo === undefined || solo.includes(sinPrefijo(e.id)));
    if (solo !== undefined && lista.length !== solo.length)
      throw new Error(`--solo: hay ${todos.map((e) => sinPrefijo(e.id)).join(', ')}`);
    for (const bruto of lista) {
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
  if (args.includes('--atlas')) {
    throw new Error(
      'el atlas de una dirección se retiró el 03-10-2026: toda unidad va en 8 direcciones (`--giro` y después `--ocho`)',
    );
  }
  for (const a of args.filter((x) => !x.startsWith('--'))) {
    const bruto = a.endsWith('.json')
      ? JSON.parse(await readFile(a, 'utf8'))
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

/** Los encargos del relieve por celdas (§23): diagonales de caída 1-3 y bajadas de caída 1-2, por material. */
function encargosDelRelieve() {
  return MATERIALES.flatMap((m) => [
    ...LADOS_DE_DIAGONAL.flatMap((l) =>
      NIVELES_DE_DIAGONAL.map((n) => encargoDeDiagonales(m, l, n)),
    ),
    ...NIVELES_DE_BAJADA.map((n) => encargoDeBajadas(m, n)),
  ]);
}

/**
 * Las juntas de las hojas del relieve que se pidan, o de todas las que hay en
 * disco: cada una con la derivación de su familia.
 */
async function escribirRelieveDerivado(hojas?: readonly string[]): Promise<string[]> {
  const todas =
    hojas ??
    (await readdir(join(RAIZ, 'assets/mapa/modulos')))
      .filter((f) => f.endsWith('.json') && !f.endsWith('.procedencia.json'))
      .map((f) => f.slice(0, -'.json'.length))
      .filter(esHojaDeRelieve);
  const escritas: string[] = [];
  for (const hoja of todas) {
    if (esHojaDeLadera(hoja)) escritas.push(...(await escribirLaderasDerivadas([hoja])));
    else if (esHojaDeDiagonal(hoja)) escritas.push(await escribirDiagonalesDerivadas(hoja));
    else if (esHojaDeBajada(hoja)) escritas.push(await escribirBajadasDerivadas(hoja));
    else if (esHojaDeRampa(hoja)) escritas.push(await escribirRampasDerivadas(hoja));
    else
      throw new Error(
        `«${hoja}» no es una hoja del relieve (laderas, diagonales, bajadas o rampas)`,
      );
  }
  return escritas;
}

/**
 * El maniquí de la gente del banco de NPC (`DIR_DEL_MANIQUI_CIVIL`): el juego
 * `civil` del Y Bot, sin nada en las manos, en 8 direcciones y **con su
 * profundidad** (la pose con que se pinta la tropa desde el 10-10-2026), y la pose
 * de la identidad: el primer reposo de la dirección SE, solo en su celda, para que
 * la lámina de identidad pinte una figura y no veintiuna. Se renderiza una vez:
 * `_poses/civil-8d/`, el Y Bot sin profundidad con que el cliente pinta a quien no
 * tiene figura, no se toca.
 */
async function renderizarElManiquiCivil(conHuesos = false): Promise<string> {
  if (conHuesos)
    return sacarElEsqueleto(join(RAIZ, DIR_DEL_MANIQUI_CIVIL), (temporal) =>
      renderizarOchoDirecciones('civil', temporal, {
        id: 'civil',
        atrezo: null,
        profundidad: true,
        huesos: true,
      }),
    );
  const carpeta = await renderizarOchoDirecciones(
    'civil',
    join(RAIZ, dirname(DIR_DEL_MANIQUI_CIVIL)),
    {
      id: 'civil',
      atrezo: null,
      profundidad: true,
    },
  );
  const { celda } = OCHO_DIRECCIONES;
  const d = NOMBRES_DE_DIRECCION.indexOf('frente-derecha');
  await sharp(join(carpeta, `d${d}-a.png`))
    .extract({ left: 0, top: 0, width: celda, height: celda })
    .png()
    .toFile(join(RAIZ, POSE_DE_LA_IDENTIDAD));
  return carpeta;
}

/**
 * El esqueleto de un maniquí ya renderizado (`maniqui --huesos`): lo renderiza
 * otra vez aparte apuntando los huesos y, si sus hojas salen idénticas byte a byte
 * a las de `carpeta` (en color y en profundidad), escribe junto a ellas SOLO los
 * `d<n>-<h>.huesos.json`. Si alguna difiere, lanza y no escribe nada: un esqueleto
 * de otro render mediría lo pintado contra otra pose. Así no hay una copia del
 * maniquí en la caché que se quede vieja sin que nadie se entere.
 */
async function sacarElEsqueleto(
  carpeta: string,
  renderizar: (temporal: string) => Promise<string>,
): Promise<string> {
  const temporal = await mkdtemp(join(tmpdir(), 'taller-huesos-'));
  try {
    const hecha = await renderizar(temporal);
    const hojas = (await readdir(hecha))
      .filter((n) => /^d[0-7]-[a-c](\.profundidad)?\.png$/.test(n))
      .sort();
    const distintas: string[] = [];
    for (const n of hojas) {
      const ahora = join(carpeta, n);
      let igual = false;
      try {
        igual = sha256(await readFile(ahora)) === sha256(await readFile(join(hecha, n)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      if (!igual) distintas.push(n);
    }
    if (distintas.length > 0)
      throw new Error(
        `con los huesos, ${distintas.length} hojas no salen idénticas a las de ${relative(RAIZ, carpeta)} (${distintas.slice(0, 4).join(', ')}${distintas.length > 4 ? '…' : ''}): ese maniquí es de otro render. Vuelve a renderizar sin \`--huesos\` y saca después el esqueleto`,
      );
    const esqueletos = (await readdir(hecha)).filter((n) => n.endsWith('.huesos.json'));
    for (const n of esqueletos) await writeFile(join(carpeta, n), await readFile(join(hecha, n)));
    console.log(`  · ${esqueletos.length} esqueletos, sobre ${hojas.length} hojas idénticas`);
    return carpeta;
  } finally {
    await rm(temporal, { recursive: true, force: true });
  }
}

/** Las direcciones y la hoja de `<unidad> <dN> <h>`, o lanza con el uso. */
function hojaDeLosArgumentos(
  args: readonly string[],
  uso: string,
): { id: string; d: number; h: string } {
  const [id, dir, h] = args.filter((a) => !a.startsWith('--'));
  if (
    id === undefined ||
    dir === undefined ||
    !/^d[0-7]$/.test(dir) ||
    h === undefined ||
    !/^[a-c]$/.test(h)
  )
    throw new Error(`uso: ${uso} (la dirección de d0 a d7 y la hoja a, b o c)`);
  return { id, d: Number(dir.slice(1)), h };
}

const [orden, ...resto] = process.argv.slice(2);
switch (orden) {
  case undefined:
  case 'trabajar':
    await trabajar(resto.includes('--npcs'));
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
  case 'reprocesar':
    if (resto.length === 0)
      throw new Error('uso: pnpm taller reprocesar <encargo>… | <unidad> --adoptadas');
    // Con `--adoptadas`, las hojas de una unidad que vinieron de una versión: cada una
    // se reempaqueta desde su crudo (sin repintar) y se vuelve a llevar a `assets/`,
    // diciendo cuánto cambió su encuadre (repintado del 30-10-2026, el piquero).
    if (resto.includes('--adoptadas')) {
      const [id] = resto.filter((r) => !r.startsWith('--'));
      if (id === undefined) throw new Error('uso: pnpm taller reprocesar <unidad> --adoptadas');
      const f = figura(id);
      const hojas = versionesAdoptadas(f);
      if (hojas.length === 0) {
        console.log(`${id}: ninguna hoja de assets/ viene de una versión`);
        process.exitCode = 1;
        break;
      }
      for (const { d, h, encargo } of hojas) {
        const huesos = leerHuesos(join(RAIZ, f.maniqui), d, h);
        const hoja = join(RAIZ, f.arte, `d${d}`, `hoja-${h}.webp`);
        const medir = async () =>
          huesos === null ? 0 : mayorSalto(await saltosDeLaHoja(hoja, huesos));
        const antes = await medir();
        const fallidoAntes = (await COLA.estado()).fallido.includes(encargo);
        try {
          await reprocesar(encargo);
        } catch (err) {
          console.log(
            `  ✘ d${d}-${h} (${encargo}): ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exitCode = 1;
          continue;
        }
        if (!fallidoAntes && (await COLA.estado()).fallido.includes(encargo)) continue;
        console.log(`  · d${d}-${h}: ${await readoptar(f, d, h)}`);
        console.log(`    el cuerpo saltaba ${antes} px y ahora ${await medir()} px`);
      }
      break;
    }
    for (const id of resto) await reprocesar(id);
    break;
  case 'vista-ejercitos':
    console.log(`→ ${await vistaEjercitos()}`);
    break;
  case 'vista-base': {
    const uso = 'pnpm taller vista-base templarios [carpeta-de-salida [prefijo]]';
    console.log(await vistaBase(faccionDe(resto[0], uso), resto[1], resto[2]));
    break;
  }
  case 'recortar-base': {
    const faccion = faccionDe(resto[0], 'pnpm taller recortar-base templarios');
    const { indice, avisos } = await recortarLaBase(faccion);
    for (const [id, e] of Object.entries(indice.edificios))
      console.log(`${id}: tramo ${e.tramo}, en (${e.en.join(', ')}), ${e.ancho}×${e.alto}`);
    console.log(
      `placas: ${indice.tramos.map((t, i) => `T${i + 1} ${t === null ? 'falta' : 'sí'}`).join(' · ')}`,
    );
    for (const a of avisos) console.log(`aviso: ${a}`);
    break;
  }
  case 'encoger-base': {
    const uso = 'pnpm taller encoger-base <facción> [tramo]';
    const faccion = faccionDe(resto[0], uso);
    const tramos =
      resto[1] === undefined
        ? Object.keys(ARTE_DE_LA_BASE[faccion].encoger).map(Number)
        : [Number(resto[1])];
    for (const n of tramos) console.log(`→ ${await encogerElTramo(faccion, n)}`);
    break;
  }
  case 'medir-base': {
    const faccion = faccionDe(resto[0], 'pnpm taller medir-base templarios [tramo]');
    const tramos =
      resto[1] === undefined
        ? Array.from({ length: disposicionDe(faccion).tramos }, (_, i) => i + 1)
        : [Number(resto[1])];
    for (const n of tramos) {
      try {
        for (const l of await medirLaBase(faccion, n)) console.log(`T${n} ${l}`);
      } catch (err) {
        console.log(`T${n}: ${err instanceof Error ? err.message : err}`);
      }
    }
    break;
  }
  case 'vista-edificios':
    console.log(`→ ${await vistaEdificios()}`);
    break;
  case 'vista-efectos':
    console.log(`→ ${await vistaEfectos()}`);
    break;
  case 'vista-mapa': {
    const semilla = resto[0] === undefined ? 1 : Number(resto[0]);
    if (!Number.isSafeInteger(semilla))
      throw new Error(`«${resto[0]}» no es una semilla: un entero`);
    console.log(`→ ${await vistaMapa(semilla)}`);
    break;
  }
  case 'escenario': {
    // pnpm taller escenario [semilla…] [--px=N]: a N px por casilla (48 si no se da),
    // para medir el pintor a la resolución del juego (120) como en #217.
    const opcion = resto.find((r) => r.startsWith('--px='));
    const px = opcion === undefined ? 48 : Number(opcion.slice('--px='.length));
    if (!Number.isSafeInteger(px) || px <= 0)
      throw new Error(`«${opcion}» no vale: los píxeles por casilla son un entero positivo`);
    const sueltas = resto.filter((r) => r !== opcion);
    const semillas = sueltas.length === 0 ? [1] : sueltas.map(Number);
    if (semillas.some((n) => !Number.isSafeInteger(n))) throw new Error('las semillas son enteros');
    for (const r of await escenario(semillas, px)) {
      // El de `componer`, más lo que mide la página del taller.
      const i = r.informe as Escena['informe'] & {
        desnudo: number;
        errores: string[];
        aguaEnLoAlto: number;
        espaldasSinLabio: number;
        espaldasSinCanto: number;
        sendaSobreElAgua: number;
        msPintar: number;
      };
      console.log(`→ ${r.png}`);
      console.log(
        `  suelo desnudo ${(i.desnudo * 100).toFixed(1)} % · pintar ${i.msPintar} ms · árboles sobre lo pisable ${i.arbolesSobreLoPisable} · masa sobre lo pisable ${i.masaSobreLoPisable} · pasillos tapados ${i.pasillosTapados} · cumbres sobre lo pisable ${i.cumbresSobreLoPisable} (medida) · bosque sin árbol ${i.bosqueSinArbol} · murallas partidas ${i.murallasPartidas} · muralla incoherente ${i.murallaIncoherente} · torres apiladas ${i.torresApiladas} · muralla sobre la senda ${i.murallaSobreSenda} · bases sobre reserva ${i.basesSobreReserva} · barrera sin formación ${i.casillasDeBarreraSinFormacion} · sprites sobre la senda ${i.spritesSobreSenda} · celdas mal cubiertas ${i.celdasMalCubiertas} · bajadas sin pieza ${i.bajadasSinPieza} · bajadas tapadas ${i.bajadasTapadas} · pasos tapados ${i.pasosTapados} · pasos atravesados ${i.pasosAtravesados} · pisables tapadas ${i.pisablesTapadas} · rampas desviadas ${i.rampasDesviadas} · rampas sin sus piezas ${i.rampasSinSusPiezas} · sendas por objeto ${i.sendasPorObjeto} · acantilados lisos ${i.acantiladosLisos} · espaldas sin reborde ${i.espaldasSinReborde} · cima de otro material ${i.cimaDeOtroMaterial} · cubierta de otro nivel ${i.cubiertaDeOtroNivel} · cara de otro material ${i.caraDeOtroMaterial} · paredes tapadas ${i.paredesTapadas} · caras cortadas ${i.carasCortadas} · mesas en la cordillera ${i.mesasEnLaCordillera} · senda bajo el relieve ${i.sendaBajoElRelieve} (techo de media 5) · agua en lo alto ${i.aguaEnLoAlto} · espaldas sin labio ${i.espaldasSinLabio} · espaldas sin canto ${i.espaldasSinCanto} · senda sobre el agua ${i.sendaSobreElAgua}` +
          (i.modulosQueFaltan.length > 0 ? ` · faltan ${i.modulosQueFaltan.join(', ')}` : '') +
          (i.errores.length > 0 ? ` · ERRORES: ${i.errores.join(' | ')}` : ''),
      );
    }
    break;
  }
  case 'recorte': {
    // pnpm taller recorte <semilla> <x0> <y0> <x1> <y1> <salida.png> [px por casilla = 96]
    const [semilla, x0, y0, x1, y1, salida, px] = resto;
    const n = [semilla, x0, y0, x1, y1].map(Number);
    if (salida === undefined || n.some((v) => !Number.isFinite(v)))
      throw new Error('uso: pnpm taller recorte <semilla> <x0> <y0> <x1> <y1> <salida.png> [px]');
    const [s, ...caja] = n as [number, number, number, number, number];
    await recortesDeSemilla(s, px === undefined ? 96 : Number(px), [
      { caja: caja as [number, number, number, number], salida: resolve(salida) },
    ]);
    console.log(`→ ${salida}`);
    break;
  }
  case 'guias':
    for (const g of [
      ...(await escribirGuias()),
      ...(await escribirGuiasDeLaderas()),
      ...(await escribirGuiasDeDiagonales()),
      ...(await escribirGuiasDeBajadas()),
      ...(await escribirGuiasDeRampas()),
      await escribirGuiaDelRecinto(),
      await escribirGuiaDelMuro(),
    ])
      console.log(`→ ${g}`);
    break;
  case 'derivar-puentes':
    // El ancla y la casilla de cada puente pintado, otra vez desde su guía.
    for (const f of resto) {
      await escribirPuenteDerivado(resolve(f));
      console.log(`→ ${f.replace(/\.webp$/, '.json')}`);
    }
    break;
  case 'derivar-muros':
    // El paso con que una pieza de norte a sur va detrás de otra sin enseñar su testero.
    for (const f of await escribirMurosDerivados()) console.log(`→ ${f}`);
    break;
  case 'derivar-relieve':
    // Las juntas de cada módulo del relieve, desde su guía: laderas (§20),
    // diagonales y bajadas (§23). Sin hojas, todas las que hay en disco.
    for (const f of await escribirRelieveDerivado(resto.length === 0 ? undefined : resto))
      console.log(`→ ${f}`);
    break;
  case 'derivar-recinto':
    // El pie de las dos puntas de cada puerta y tramo del recinto, desde su guía.
    console.log(`→ ${await escribirRecintoDerivado()}`);
    break;
  case 'derivar-casas':
    // Las casas sueltas de la labranza, de la hoja de pueblos: con --vista, las
    // casas teñidas y numeradas; sin él, las recorta (`CASAS_DE_LOS_PUEBLOS`).
    console.log(
      `→ ${
        resto.includes('--vista')
          ? await vistaDeLasCasas(join(RAIZ, '.cache/taller/casas-de-los-pueblos.png'))
          : await escribirCasas()
      }`,
    );
    break;
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
  case 'maniqui':
    // El de la gente (el banco de NPC): el juego civil del Y Bot, sin armas, con
    // su profundidad y la pose sola de la identidad.
    if (resto.includes('--civil')) {
      console.log(
        `→ ${relative(RAIZ, await renderizarElManiquiCivil(resto.includes('--huesos')))}`,
      );
      break;
    }
    // El maniquí propio de cada unidad que lo declara (`maniqui` en unidades.ts).
    for (const id of resto.filter((r) => !r.startsWith('--'))) {
      const u = unidad(id);
      const juego = juegoDelYBot(u);
      if (u.maniqui === undefined)
        throw new Error(`${id} no declara maniquí propio: usa el de «${juego}»`);
      if (!(juego in JUEGOS_DE_ARMAS))
        throw new Error(
          `${id}: el maniquí propio parte de un juego del Y Bot a pie, no de «${juego}»`,
        );
      const atrezo = u.maniqui;
      const opciones = (huesos: boolean) => ({
        id,
        huesos,
        atrezo,
        ...(u.clipsDelManiqui === undefined ? {} : { clips: u.clipsDelManiqui }),
        // Además, sus hojas en profundidad: la pose que se pinta.
        profundidad: true,
        // Y los fotogramas enteros de cada clip, para los vídeos del maniquí (`video.ts`).
        ...(resto.includes('--fotogramas') ? { fotogramas: carpetaDeFotogramas(id) } : {}),
      });
      // Con `--huesos`, solo el esqueleto de cada hoja, junto a ella: la verdad con que
      // la revisión mide lo pintado y la compuerta del trabajador. Las hojas no se tocan.
      const carpeta = resto.includes('--huesos')
        ? await sacarElEsqueleto(carpetaDeManiqui(id), (temporal) =>
            renderizarOchoDirecciones(juego as JuegoDeArmas, temporal, opciones(true)),
          )
        : await renderizarOchoDirecciones(juego as JuegoDeArmas, DIR_MANIQUIES, opciones(false));
      console.log(`→ ${relative(RAIZ, carpeta)}`);
    }
    break;
  case 'vision-instalar':
    instalar();
    break;
  case 'revisar-maniqui': {
    // Lo que no se ve juzgando lo pintado: el maniquí mismo (C2 de la revisión).
    let conSentido = false;
    const ids = resto.filter((r) => !r.startsWith('--'));
    if (ids.length === 0 && !resto.includes('--civil'))
      throw new Error('uso: pnpm taller revisar-maniqui <unidad>… | --civil');
    // El civil (el de la gente del banco de NPC), que también mira la compuerta.
    const carpetas = [
      ...(resto.includes('--civil')
        ? [{ id: 'civil', maniqui: DIR_DEL_MANIQUI_CIVIL, arte: null }]
        : []),
      ...ids.map((id) => figura(id)),
    ];
    for (const f of carpetas) {
      const { avisos } = await revisarElManiqui(join(RAIZ, f.maniqui));
      console.log(`${f.id}: ${avisos.length === 0 ? 'sin avisos' : `${avisos.length} avisos`}`);
      for (const a of avisos) console.log(`  ${a.tipo === 'sentido' ? '✘' : '!'} ${a.texto}`);
      conSentido ||= avisos.some((a) => a.tipo === 'sentido');
      if (f.arte === null) continue;
      const repintar = hojasSobreOtroManiqui(RAIZ, f.arte);
      if (repintar.length > 0)
        console.log(
          `  ⚠ ${repintar.length} hojas pintadas sobre OTRO maniquí (${repintar.map((r) => r.hoja).join(', ')}): no se juzgan como un fallo del pintor; van directas a «pnpm taller versiones ${f.id} <dN> <h>» (el jurado sobre ellas solo da instrucciones), y \`elegir\` las compara entre sí, no con la de ahora`,
        );
    }
    // Una marcha hacia atrás no se manda a pintar: el arreglo va en el maniquí.
    if (conSentido) process.exitCode = 1;
    break;
  }
  case 'revisar': {
    const [id] = resto.filter((r) => !r.startsWith('--') && !/^d[0-7]$/.test(r));
    if (id === undefined)
      throw new Error('uso: pnpm taller revisar <unidad> [dN…] [--sin-juez] [--clips=idle,walk]');
    const clips = bandera(resto, 'clips')?.split(',');
    await revisar(id, direccionesDe(resto), {
      sinJuez: resto.includes('--sin-juez'),
      ...(clips === undefined ? {} : { clips }),
    });
    break;
  }
  case 'jurado': {
    const [paso, id] = resto.filter((r) => !r.startsWith('--') && !/^d[0-7]$/.test(r));
    const pasos = { unir, arbitrar, cruzar } as const;
    if (paso === undefined || !(paso in pasos) || id === undefined)
      throw new Error(
        'uso: pnpm taller jurado unir|arbitrar|cruzar <unidad> [dN…] [--clips=idle,walk]',
      );
    const clipsDelJurado = bandera(resto, 'clips')?.split(',');
    comprobarClips(clipsDelJurado);
    await pasos[paso as keyof typeof pasos](figura(id), direccionesDe(resto), clipsDelJurado);
    break;
  }
  case 'visor': {
    const [id] = resto;
    if (id === undefined) throw new Error('uso: pnpm taller visor <unidad>');
    const f = figura(id);
    const { casos, clave } = await casosDelVisor(f);
    if (casos.length === 0) {
      console.log(
        `${id}: nada que enseñar (ni disputas sin mirar ni versiones que elegir); el maniquí, con «pnpm taller visor-maniqui ${id}»`,
      );
      process.exitCode = 1;
      break;
    }
    await escribirClave(f, clave);
    console.log(`${id}: ${casos.length} casos`);
    await visor(join(RAIZ, f.revision, 'visor'), casos);
    break;
  }
  case 'visor-maniqui': {
    // El visor del maniquí (paso 1 de la skill): sus clips animados de tres cuartos,
    // de lado y de espaldas, con los avisos de `revisar-maniqui`.
    const [id] = resto;
    if (id === undefined) throw new Error('uso: pnpm taller visor-maniqui <unidad>');
    const f = figura(id);
    const fps = Object.fromEntries(Object.entries(RELOJ).map(([c, r]) => [c, r.fps]));
    const casos = await casosDelManiqui(f, RAIZ, fps);
    console.log(`${id}: ${casos.length} clips del maniquí`);
    await visor(join(RAIZ, f.revision, 'visor-maniqui'), casos);
    break;
  }
  case 'versiones': {
    // Con `--rechazadas`, las hojas que la persona rechazó en el vistazo final,
    // otra vez y olvidando las de antes (decisión del usuario del 30-10-2026).
    if (resto.includes('--rechazadas')) {
      const [id] = resto.filter((r) => !r.startsWith('--'));
      if (id === undefined) throw new Error('uso: pnpm taller versiones <unidad> --rechazadas');
      const f = figura(id);
      const hojas = await rechazadas(f);
      if (hojas.length === 0) {
        console.log(
          `${id}: ninguna hoja rechazada en el vistazo final (o aún no se ha mirado: «pnpm taller visor ${id}»)`,
        );
        process.exitCode = 1;
        break;
      }
      for (const { d, h } of hojas)
        for (const e of await prepararVersiones(f, d, h)) {
          await COLA.olvidar(e.id);
          try {
            console.log(`encolado ${(await COLA.encolar(e)).id}`);
          } catch (err) {
            // Ya pedida (a mano, o por otra pasada) y aún sin pintar: no se pide dos veces.
            if (!(err instanceof YaEnLaCola)) throw err;
            console.log(`  · ${e.id} ya estaba en la cola (${err.message})`);
          }
        }
      break;
    }
    const { id, d, h } = hojaDeLosArgumentos(
      resto,
      'pnpm taller versiones <unidad> <dN> <h> | <unidad> --rechazadas',
    );
    for (const e of await prepararVersiones(figura(id), d, h)) {
      if (resto.includes('--rehacer')) await COLA.olvidar(e.id);
      console.log(`encolado ${(await COLA.encolar(e)).id}`);
    }
    break;
  }
  case 'elegir': {
    const { id, d, h } = hojaDeLosArgumentos(resto, 'pnpm taller elegir <unidad> <dN> <h>');
    const e = await elegir(figura(id), d, h);
    console.log(`d${d}-${h}: ${e.motivo}`);
    break;
  }
  case 'adoptar': {
    // Con `--todas`, lo que se puede de la unidad: las ganadoras claras de un torneo
    // solas, y lo que eligió la persona (decisión del usuario del 30-10-2026).
    if (resto.includes('--todas')) {
      const [id] = resto.filter((r) => !r.startsWith('--'));
      if (id === undefined) throw new Error('uso: pnpm taller adoptar <unidad> --todas');
      const { adoptadas, quedan } = await adoptarTodas(figura(id));
      console.log(
        `${id}: ${adoptadas.length} adoptadas${adoptadas.length > 0 ? ` (${adoptadas.join(', ')})` : ''}`,
      );
      for (const q of quedan) console.log(`  · queda ${q.hoja}: ${q.motivo}`);
      if (adoptadas.length === 0 && quedan.length === 0) {
        console.log('  nada que adoptar: ninguna elección pendiente («pnpm taller elegir»)');
        process.exitCode = 1;
      }
      break;
    }
    const { id, d, h } = hojaDeLosArgumentos(
      resto,
      'pnpm taller adoptar <unidad> <dN> <h> | <unidad> --todas',
    );
    console.log(`d${d}-${h}: ${await adoptar(figura(id), d, h)}`);
    break;
  }
  case 'muestrario': {
    // Los clips candidatos de una unidad, con su atrezo, para elegir sus acciones.
    const [id, ...clips] = resto.filter((r) => !r.startsWith('--'));
    if (id === undefined) throw new Error('pnpm taller muestrario <unidad> [clip…]');
    const u = unidad(id);
    const juego = juegoDelYBot(u);
    if (!(juego in JUEGOS_DE_ARMAS)) throw new Error(`${id}: el muestrario es de juegos a pie`);
    const destino = join(RAIZ, '.cache/taller/muestrario', `${id}.png`);
    await mkdir(dirname(destino), { recursive: true });
    await renderizarMuestrario(
      clips.length > 0 ? clips : CANDIDATOS_DEL_MUESTRARIO,
      u.maniqui ?? JUEGOS_DE_ARMAS[juego as JuegoDeArmas].atrezo,
      destino,
      160,
      // Con `--fotogramas`, cada clip entero (el visor del maniquí los anima).
      resto.includes('--fotogramas') ? join(RAIZ, '.cache/taller/muestrario', id) : undefined,
    );
    console.log(`→ ${relative(RAIZ, destino)}`);
    break;
  }
  case 'derivar-poses': {
    const { juegos } = await escribirAtlasDePoses();
    console.log(`→ ${relative(RAIZ, RUTA_DEL_ATLAS_8D)}: ${Object.keys(juegos).join(', ')}`);
    break;
  }
  case 'derivar':
    for (const r of resto) {
      // Con la derivación de su carpeta (`derivacionDeLaCarpeta`): la suelta y el
      // ritmo de su unidad, o las hojas de las acciones de una figura del banco de
      // NPC. `derivarAtlas` lanza si la hoja no tiene la fila del disparo que la
      // unidad dispara, o al revés.
      const d = await escribirDerivado(r, await derivacionDeLaCarpeta(dirname(r)).derivar());
      console.log(
        `${r}: altura ${d.altura}, fotogramas ${Object.values(d.clips)
          .map((c) => c.frames)
          .join('/')}`,
      );
    }
    break;
  default:
    throw new Error(
      `orden desconocida «${orden}»: trabajar, encolar, corregir, retirar, reprocesar, estado, devolver, derivar, derivar-poses, derivar-relieve, derivar-muros, derivar-casas, maniqui, muestrario, vision-instalar, revisar-maniqui, revisar, jurado, visor, visor-maniqui, versiones, elegir, adoptar, vista-base, recortar-base, medir-base, vista-ejercitos, vista-edificios, vista-efectos, vista-8d, vista-mapa, escenario, catalogo-escena`,
    );
}
