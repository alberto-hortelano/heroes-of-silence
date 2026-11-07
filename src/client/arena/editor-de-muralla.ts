/**
 * El editor de la muralla de la arena (`EstadoDelEditorDeMuralla`): tocar una casilla con la
 * herramienta, las formas guardadas en el borrador (`data/borradores/murallas.json`: leerlas al
 * abrir, guardar y borrar) y pintar el editor con lo que depende de él («Luchar», si el montaje
 * cabe con esa muralla). Era parte de `arena/main.ts` hasta R8 de la reorganización (07-11-2026).
 */
import { despliegueDeArenaBlocker } from '@core/arena/montaje.js';
import {
  FORMAS_DE_EJEMPLO,
  type FormaDeMuralla,
  validarFormaDeMuralla,
} from '@core/arena/murallas.js';
import { hexEquals, isInside } from '@core/battle/board.js';
import { esMuro, mismaPuerta, validarMuralla } from '@core/battle/muralla.js';
import type { PuertaDeMuralla } from '@core/battle/types.js';
import type { Hex } from '@core/types.js';
import { pintar } from '../comun/html.js';
import { montajeDeArena } from './montaje.js';
import type { EstadoDelEditorDeMuralla, PaginaDeLaArena } from './pagina.js';
import { renderMuralla } from './paneles/muralla.js';
import { type FalloAlGuardar, leerDelServidor, mandarAlServidor } from './servidor.js';

/**
 * Las formas de muralla guardadas, si hay servidor de desarrollo. Devuelve lo
 * que hay que añadir a la barra: las que no valen o el archivo ilegible. Las
 * que no valen se conservan al guardar, como las unidades.
 */
export async function arrancarMurallas(editorDeMuralla: EstadoDelEditorDeMuralla): Promise<string> {
  const { cuerpo, sinGuardado: porQue } = await leerDelServidor(
    '/__arena/murallas',
    'las formas de muralla',
  );
  editorDeMuralla.murallasSinGuardado = porQue;
  if (!cuerpo.guardado) return '';
  if (cuerpo.ilegible !== undefined) return ` No se puede leer ${cuerpo.ruta}: ${cuerpo.ilegible}.`;
  editorDeMuralla.formasGuardadas = (Array.isArray(cuerpo.formas) ? cuerpo.formas : []).map(
    validarFormaDeMuralla,
  );
  const invalidas = cuerpo.invalidas ?? [];
  return invalidas.length === 0
    ? ''
    : ` Formas de muralla que no valen y se conservan tal cual: ${invalidas
        .map((i) => `${i.nombre ?? '(sin nombre)'} (${i.motivo})`)
        .join('; ')}.`;
}

/**
 * Un clic en la rejilla: pone la pieza de la herramienta, o la quita si ya
 * estaba. El muro va en la casilla, y quita las puertas que la tocaban. La
 * puerta va entre la casilla y su vecina del este (las dos que resalta el
 * puntero) y quita el muro de las dos, que son suelo. La goma quita el muro de
 * la casilla y las puertas que la tocan.
 */
export function tocarHex(pagina: PaginaDeLaArena, hex: Hex): void {
  const { vista, editorDeMuralla } = pagina;
  // El clic despeja la barra, salvo lo que sigue siendo verdad: si no se puede
  // guardar, se dice hasta que se pueda (QA, M4: el primer clic lo borraba).
  vista.aviso =
    editorDeMuralla.murallasSinGuardado === null
      ? ''
      : `No se pueden guardar ni borrar formas: ${editorDeMuralla.murallasSinGuardado}.`;
  const toca = (p: PuertaDeMuralla, h: Hex): boolean => hexEquals(p.a, h) || hexEquals(p.b, h);
  if (editorDeMuralla.herramienta === 'puerta') {
    const este = { col: hex.col + 1, row: hex.row };
    if (!isInside(este)) {
      vista.aviso = `La puerta va entre una casilla y la de su este: (${hex.col},${hex.row}) es la última de su fila y no tiene.`;
      return;
    }
    const nueva = { a: hex, b: este };
    const estaba = editorDeMuralla.muralla.puertas.some((p) => mismaPuerta(p, nueva));
    editorDeMuralla.muralla = validarMuralla({
      muros: editorDeMuralla.muralla.muros.filter((h) => !hexEquals(h, hex) && !hexEquals(h, este)),
      puertas: estaba
        ? editorDeMuralla.muralla.puertas.filter((p) => !mismaPuerta(p, nueva))
        : [...editorDeMuralla.muralla.puertas, nueva],
      material: editorDeMuralla.muralla.material,
    });
    return;
  }
  const habia = esMuro(editorDeMuralla.muralla, hex);
  const muros = editorDeMuralla.muralla.muros.filter((h) => !hexEquals(h, hex));
  if (editorDeMuralla.herramienta === 'muro' && !habia) muros.push(hex);
  const puertas =
    editorDeMuralla.herramienta === 'muro' && habia
      ? editorDeMuralla.muralla.puertas
      : editorDeMuralla.muralla.puertas.filter((p) => !toca(p, hex));
  editorDeMuralla.muralla = validarMuralla({
    muros,
    puertas,
    material: editorDeMuralla.muralla.material,
  });
}

export function formaPorNombre(
  editorDeMuralla: EstadoDelEditorDeMuralla,
  nombre: string,
): FormaDeMuralla {
  const f = [...FORMAS_DE_EJEMPLO, ...editorDeMuralla.formasGuardadas].find(
    (x) => x.nombre === nombre,
  );
  if (f === undefined) throw new Error(`no hay ninguna forma de muralla «${nombre}»`);
  return f;
}

/**
 * Manda la lista entera de formas al servidor —guardar es mandarla con una más
 * o con una cambiada; borrar, sin ella— y, si la acepta, es la nueva lista.
 */
async function escribirFormas(
  pagina: PaginaDeLaArena,
  formas: readonly FormaDeMuralla[],
  fallo: FalloAlGuardar,
): Promise<boolean> {
  const { vista, editorDeMuralla } = pagina;
  const hecho = await mandarAlServidor(
    vista,
    '/__arena/murallas',
    { formas },
    editorDeMuralla.murallasSinGuardado,
    fallo,
  );
  if (hecho === null) return false;
  editorDeMuralla.formasGuardadas = formas;
  return true;
}

export async function guardarForma(pagina: PaginaDeLaArena): Promise<void> {
  const { vista, editorDeMuralla } = pagina;
  // La regla del nombre y de la muralla es la del núcleo: aquí solo se le pasa.
  const forma = validarFormaDeMuralla({
    nombre: editorDeMuralla.nombreDeForma,
    muralla: editorDeMuralla.muralla,
  });
  const yaEstaba = editorDeMuralla.formasGuardadas.some((f) => f.nombre === forma.nombre);
  const formas = yaEstaba
    ? editorDeMuralla.formasGuardadas.map((f) => (f.nombre === forma.nombre ? forma : f))
    : [...editorDeMuralla.formasGuardadas, forma];
  const fallo = {
    noSePuede: 'No se puede guardar la muralla',
    noSeHa: 'No se ha guardado la muralla',
  };
  if (await escribirFormas(pagina, formas, fallo)) {
    editorDeMuralla.nombreDeForma = forma.nombre;
    vista.aviso = `${yaEstaba ? 'Cambiada' : 'Guardada'} la forma «${forma.nombre}» en data/borradores/murallas.json.`;
  }
}

export async function borrarForma(pagina: PaginaDeLaArena, nombre: string): Promise<void> {
  const { vista, editorDeMuralla } = pagina;
  const fallo = {
    noSePuede: `No se puede borrar la forma «${nombre}»`,
    noSeHa: `No se ha borrado la forma «${nombre}»`,
  };
  if (
    await escribirFormas(
      pagina,
      editorDeMuralla.formasGuardadas.filter((f) => f.nombre !== nombre),
      fallo,
    )
  ) {
    vista.aviso = `Borrada la forma «${nombre}».`;
  }
}

/**
 * El editor de la muralla y lo que depende de él: si el montaje cabe con ella
 * (el aviso del editor y «Luchar», deshabilitado con el motivo). Las acciones de
 * la muralla repintan solo esto (`repintarMuralla`); el resto del montaje no
 * cambia con ellas.
 */
export function pintarMuralla(pagina: PaginaDeLaArena): void {
  const { editorDeMuralla, elMuralla, botonLuchar } = pagina;
  const despliegue = despliegueDeArenaBlocker(montajeDeArena(pagina));
  pintar(
    elMuralla,
    renderMuralla({
      muralla: editorDeMuralla.muralla,
      herramienta: editorDeMuralla.herramienta,
      nombre: editorDeMuralla.nombreDeForma,
      ejemplos: FORMAS_DE_EJEMPLO,
      guardadas: editorDeMuralla.formasGuardadas,
      sinGuardado: editorDeMuralla.murallasSinGuardado,
      despliegue,
      plegado: editorDeMuralla.murallaPlegada,
    }),
  );
  botonLuchar.toggleAttribute('disabled', despliegue !== null);
  botonLuchar.title = despliegue === null ? '' : `No se puede luchar: ${despliegue}.`;
}

/** Solo el editor de la muralla, y la barra de estado en el siguiente fotograma. */
export function repintarMuralla(pagina: PaginaDeLaArena): void {
  const { pedirFotograma } = pagina;
  pintarMuralla(pagina);
  pedirFotograma();
}
