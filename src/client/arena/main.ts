/**
 * La arena (`/arena/`, `pnpm arena`): se montan dos bandos con las hojas de las
 * cinco facciones, se cambian sus cifras, se elige quién mueve cada unidad y se
 * pelea con el mismo tablero y los mismos controles que la partida.
 *
 * Aquí solo se conecta: las reglas las aplica `SesionDeArena` (en `session.ts`,
 * la única puerta del cliente al núcleo), el ratón del tablero lo traduce
 * `EscenaBatalla` —la misma de la partida— y el marcado sale de `paneles.ts`.
 * Las cifras se guardan como borrador en el repo a través del servidor de
 * desarrollo (`vite.config.ts`); sin él la página lo dice y sigue sirviendo para
 * pelear.
 */
import {
  type CambiosDeCatalogo,
  cifrasDeCatalogoEnLaArena,
  criaturasDelCatalogo,
  type HeroeDeArena,
  type HojaDeArena,
  heroePorDefecto,
  LADOS,
  type Lado,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeLaURL,
  type PuestoDelEnlace,
  type UnidadDeArena,
  unaVezEnLaURL,
  unidadPorDefecto,
  validarHeroeDeArena,
  validarHojasDeArena,
  validarUnidadDeArena,
} from '@core/arena.js';
import {
  conRegla,
  REGLAS_DEL_JUEGO,
  type ReglasDeBatalla,
  reglasALaURL,
  reglasDeLaURL,
} from '@core/battle/reglas.js';
import { allSpells } from '@core/battle/spells.js';
import { creature, LIDERAZGO } from '@core/data.js';
import { parseSeed } from '@core/rng.js';
import type { CreatureTrait, UnitInfo } from '@core/types.js';
import { FIGURA } from '../../shared/arte.js';
import type { Direccion } from '../direccion.js';
import { EscenaBatalla } from '../escenas/batalla.js';
import { html, pintar } from '../html.js';
import { cargarArte } from '../render/assets.js';
import { COLOR_BANDO } from '../render/batalla.js';
import type { CharacterClip } from '../render/character.js';
import {
  claveDelDibujo,
  colocarFigura,
  type Figura,
  hayFigurasAnimadas,
  pintarFigura,
  pintarSombraDeFigura,
} from '../render/figura.js';
import { ajustarLienzo } from '../render/lienzo.js';
import { COLOR_NEUTRO } from '../render/palette.js';
import {
  arteDe,
  DIRECCION_DE_HOJA,
  hojaDe,
  INDICE_DE_HOJA,
  MIRADA_DE_PRESENTACION,
  registrarUnidad,
} from '../render/personajes.js';
import { semillaSorteada } from '../semilla.js';
import { type LadoDeSesion, type PuestoDeArena, SesionDeArena } from '../session.js';
import { pintarSiguiendoElFinal } from '../views/al-final.js';
import {
  type DatosDePuesto,
  type Elegida,
  FIGURA_GENERICA,
  type FiltroDeArena,
  type FuenteDePuesto,
  type HeroeDelMontaje,
  type Puesto,
  renderBando,
  renderCatalogo,
  renderEnlace,
  renderFicha,
  renderFichaDeCatalogo,
  renderFichaDeHeroe,
  renderPanelDeBatalla,
  renderReglas,
  resumenDeCifras,
  resumenDeUnidad,
} from './paneles.js';

const app = document.getElementById('app') as HTMLElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const elDay = document.getElementById('day') as HTMLElement;
const elTurn = document.getElementById('turn') as HTMLElement;
const elSeed = document.getElementById('seed') as HTMLElement;
const elStatus = document.getElementById('status') as HTMLElement;
const elSide = document.getElementById('side') as HTMLElement;
const elFicha = document.getElementById('ficha') as HTMLElement;
const elCatalogo = document.getElementById('catalogo') as HTMLElement;
const elBando: Record<Lado, HTMLElement> = {
  izquierda: document.getElementById('bando-izquierda') as HTMLElement,
  derecha: document.getElementById('bando-derecha') as HTMLElement,
};

// ---------------------------------------------------------------- estado

let hojas: readonly HojaDeArena[] = [];
/**
 * Las cifras por TIPO de hoja: cambiar el monje cambia todos los monjes. Lleva
 * también las del borrador que no tienen hoja —no se pueden montar—, para que
 * «Guardar» no las tire (H2 de QA).
 */
const borrador = new Map<string, UnidadDeArena>();
const montaje: Record<Lado, Puesto[]> = { izquierda: [], derecha: [] };
/** El héroe de cada lado, si lleva. */
const heroes: Record<Lado, HeroeDelMontaje | null> = { izquierda: null, derecha: null };
/**
 * Los cambios de prueba a las criaturas del catálogo, por tipo como el borrador.
 * **No se guardan**: ni en `data/creatures.json` ni en el borrador; se pierden al
 * cerrar la página, y la ficha lo dice.
 */
const pruebas = new Map<string, CambiosDeCatalogo>();
let filtro: FiltroDeArena = 'todas';
let elegida: Elegida | null = null;
let clipDeFicha: CharacterClip = 'idle';
/** Cuándo se eligió el clip de la ficha: los que no van en bucle se repiten desde ahí. */
let inicioDelClip = 0;
/** Lo que se queda quieto el último fotograma antes de repetir un clip que no va en bucle. */
const PAUSA_DE_LA_FICHA_MS = 700;
/**
 * Hacia dónde mira la figura de la ficha, como posición en `DIRECCION_DE_HOJA`:
 * «Girar» la pasa por las ocho direcciones en el orden de las hojas.
 */
let miraDeFicha = INDICE_DE_HOJA[MIRADA_DE_PRESENTACION];
let siguienteClave = 1;
let sesion: SesionDeArena | null = null;
/** La barra mientras se monta; en la batalla manda la de la sesión. */
let aviso = 'Cargando las hojas…';
/**
 * Las unidades con el arte a medias, dichas en la barra mientras se monta: el
 * aviso que antes era la excepción que tumbaba la lista (#140).
 */
let avisoDeIncompletas = '';
/** Por qué no se puede guardar, o `null` si se puede. */
let sinGuardado: string | null = null;
/** Hay cifras que no se han guardado: cerrar la página avisa. */
let cambiosSinGuardar = false;
const caben = LIDERAZGO.maxPorBando;

/**
 * La semilla que pide la URL, o `null` para sortear una en cada pelea. La regla
 * es la de la partida (`parseSeed`): lo que no es una semilla se dice.
 */
const parametros = new URLSearchParams(location.search);
let semillaPedida: number | null = null;
let avisoDeSemilla = '';
try {
  semillaPedida = parseSeed(unaVezEnLaURL(parametros.getAll('seed'), 'seed'));
} catch (err) {
  avisoDeSemilla = `${mensaje(err)} — quita "?seed=…" de la barra de direcciones para sortear la semilla. `;
}

/**
 * Las reglas de la pelea: las del juego, salvo que la URL encienda alguna de
 * fheroes2 (`?reglas=tirador,bendicion`). Van con la semilla en la URL, para que
 * una pelea se pueda repetir; lo que no es una regla se dice, como la semilla.
 */
let reglas: ReglasDeBatalla = REGLAS_DEL_JUEGO;
try {
  // Repetida (`reglas=tirador&reglas=bendicion`) se rechaza: quedarse con la
  // primera en silencio reproducía otra pelea (H4 de QA del banco).
  reglas = reglasDeLaURL(unaVezEnLaURL(parametros.getAll('reglas'), 'reglas'));
} catch (err) {
  avisoDeSemilla += `${mensaje(err)} — se pelea con las reglas del juego. `;
}

/**
 * El enlace de la pelea que se copió por última vez (`?montaje=`, H6 de QA del
 * banco), para enseñarlo en su campo mientras siga siendo el del montaje: si
 * algo cambia después, ya no lo es y se deja de enseñar.
 */
let enlaceCopiado: string | null = null;

/**
 * Escribe en la barra la dirección de ahora con las reglas del montaje, para que
 * copiarla repita también las reglas; las comas de `?reglas=` van sin escapar, y
 * así se lee y se copia como se escribe (`?seed=7&reglas=tirador,bendicion`).
 * `cambiar` pone lo demás (la semilla).
 */
function reglasALaBarra(cambiar: (url: URL) => void = () => {}): void {
  const url = new URL(location.href);
  cambiar(url);
  const enURL = reglasALaURL(reglas);
  if (enURL === '') url.searchParams.delete('reglas');
  else url.searchParams.set('reglas', enURL);
  history.replaceState(null, '', `${url.pathname}${url.search.replace(/%2C/g, ',')}${url.hash}`);
}

/** Las cifras con las que pelearía una criatura del catálogo: las suyas o las de su prueba. */
function cifrasDelCatalogo(id: string): UnitInfo {
  const cambios = pruebas.get(id);
  return cambios === undefined ? creature(id) : cifrasDeCatalogoEnLaArena(id, cambios);
}

/** Lo que la tarjeta de un puesto enseña, salga de donde salga. */
function describir(p: Puesto): DatosDePuesto {
  if (p.fuente.kind === 'hoja') {
    const u = unidadDe(p.fuente.hoja);
    return {
      nombre: u.name,
      resumen: resumenDeCifras(u),
      figura: p.fuente.hoja,
      sello: 'borrador',
    };
  }
  const u = cifrasDelCatalogo(p.fuente.id);
  return {
    nombre: u.name,
    resumen: resumenDeUnidad(u),
    figura: p.fuente.id,
    sello: pruebas.has(p.fuente.id) ? 'catálogo · prueba que no se guarda' : 'catálogo',
  };
}

/** El nombre de quien se pinta en una miniatura: una hoja, una criatura o el héroe genérico. */
function nombreDeFigura(id: string): string {
  if (id === FIGURA_GENERICA) return 'Héroe';
  if (hojas.some((h) => h.id === id)) return unidadDe(id).name;
  return creature(id).name;
}

/** Las hojas de héroe completas, para elegir la figura del héroe. */
function hojasDeHeroe(): { id: string; nombre: string }[] {
  return hojas
    .filter((h) => h.heroe && h.incompleta === null)
    .map((h) => ({ id: h.id, nombre: h.nombre }));
}

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function hojaPorId(id: string): HojaDeArena {
  const h = hojas.find((x) => x.id === id);
  if (h === undefined) throw new Error(`no hay ninguna hoja «${id}» en assets/unidades/`);
  return h;
}

function unidadDe(id: string): UnidadDeArena {
  return borrador.get(id) ?? unidadPorDefecto(hojaPorId(id));
}

// ---------------------------------------------------------------- arranque

/** Lo que contesta `GET /__arena/unidades`: en el build, solo `guardado: false`. */
interface RespuestaDelBorrador {
  readonly guardado: boolean;
  readonly ruta?: string;
  readonly unidades?: unknown;
  readonly invalidas?: readonly { readonly id: string | null; readonly motivo: string }[];
  readonly ilegible?: string;
}

/**
 * Las hojas y, si hay servidor de desarrollo, el borrador guardado. Las hojas se
 * validan al recibirlas, que es por donde entran su perfil y su facción. Del
 * borrador se cargan las unidades que valen; las que no, se dicen con su motivo
 * —y el servidor las vuelve a escribir tal cual al guardar—.
 */
async function arrancar(): Promise<void> {
  const r = await fetch('/__arena/hojas');
  if (!r.ok) throw new Error(`no se ha podido leer la lista de hojas (${r.status})`);
  hojas = validarHojasDeArena(await r.json());
  // Una hoja incompleta no se registra: `arteDe` la pintaría con el Y Bot por
  // defecto, que es justo lo que no puede pasar en silencio (#140).
  for (const h of hojas) if (h.incompleta === null) registrarUnidad(h.id, h);
  const incompletas = hojas.filter((h) => h.incompleta !== null);
  if (incompletas.length > 0) {
    avisoDeIncompletas = ` A medias en el taller (se listan y no se montan): ${incompletas
      .map((h) => h.incompleta)
      .join('; ')}.`;
    console.warn(`[arena]${avisoDeIncompletas}`);
  }
  const b = await fetch('/__arena/unidades');
  if (!b.ok) throw new Error(`no se ha podido leer el borrador (${b.status})`);
  const cuerpo = (await b.json()) as RespuestaDelBorrador;
  if (!cuerpo.guardado) {
    sinGuardado = 'esta página no la sirve el servidor de desarrollo. Ábrela con pnpm arena';
    aviso =
      'Sin el servidor de desarrollo (pnpm arena) no se carga ni se guarda el borrador: las cifras que cambies aquí se pierden al cerrar.';
    return;
  }
  if (cuerpo.ilegible !== undefined) {
    sinGuardado = `${cuerpo.ruta} no se puede leer (${cuerpo.ilegible}), y guardar lo pisaría. Arréglalo o bórralo a mano`;
    aviso = `No se puede leer ${cuerpo.ruta}: ${cuerpo.ilegible}. Se empieza con las cifras por defecto, y no se guarda hasta que se arregle.`;
    return;
  }
  const unidades = Array.isArray(cuerpo.unidades) ? cuerpo.unidades : [];
  const sinHoja: string[] = [];
  for (const crudo of unidades) {
    const u = validarUnidadDeArena(crudo);
    borrador.set(u.id, u);
    if (!hojas.some((h) => h.id === u.id)) sinHoja.push(u.id);
  }
  aviso =
    borrador.size === 0
      ? `Sin borrador guardado todavía (${cuerpo.ruta}): las unidades salen con cifras por defecto, inventadas.`
      : `Cargado ${cuerpo.ruta}: ${borrador.size} ${borrador.size === 1 ? 'unidad' : 'unidades'}.`;
  // Las que no tienen hoja se quedan en el borrador y se vuelven a guardar; solo
  // no se pueden montar.
  if (sinHoja.length > 0) aviso += ` Sin hoja (no se pueden montar): ${sinHoja.join(', ')}.`;
  const invalidas = cuerpo.invalidas ?? [];
  if (invalidas.length > 0) {
    aviso += ` No valen y se conservan tal cual al guardar: ${invalidas
      .map((i) => `${i.id ?? '(sin id)'} (${i.motivo})`)
      .join('; ')}.`;
  }
}

// ---------------------------------------------------------------- montaje

/** Los lienzos de las miniaturas, recogidos al repintar: son los mismos hasta el siguiente. */
let figuras: {
  lienzo: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  id: string;
  ficha: boolean;
  /** El bando de la miniatura, que le da el color; `null` en la ficha. */
  lado: Lado | null;
  /** Las tres letras de su marcador sin arte, de `nombreDeFigura`. */
  rotulo: string;
}[] = [];

/**
 * La lista del catálogo del juego con el resumen de cada criatura: las cifras del
 * catálogo, que no cambian en la página. Se monta la primera vez que se enseña.
 */
let listaDelCatalogo: readonly { id: string; name: string; resumen: string }[] | null = null;
function criaturasDeLaLista(): readonly { id: string; name: string; resumen: string }[] {
  listaDelCatalogo ??= criaturasDelCatalogo().map((c) => ({
    ...c,
    resumen: resumenDeUnidad(creature(c.id)),
  }));
  return listaDelCatalogo;
}

/**
 * Lo último que se pintó en cada miniatura: se repinta solo si cambia su
 * fotograma, su clip, su dirección o su hoja. Un reposo a 8 fps repintaba cada
 * miniatura sesenta veces por segundo para enseñar ocho fotogramas distintos.
 * Un lienzo nuevo —el montaje se rehace entero— no tiene entrada y se pinta.
 */
const pintado = new WeakMap<HTMLCanvasElement, string>();

function repintarMontaje(): void {
  // Repintar quita el foco del campo que se acaba de cambiar: se le devuelve al
  // mismo campo, que es lo que espera quien edita con el tabulador.
  const campo = document.activeElement?.getAttribute('data-campo') ?? null;
  for (const lado of ['izquierda', 'derecha'] as const) {
    pintar(
      elBando[lado],
      renderBando(lado, montaje[lado], describir, elegida, caben, heroes[lado], ocupados(lado)),
    );
  }
  pintar(elFicha, fichaElegida());
  const criaturas = filtro === 'catalogo' ? criaturasDeLaLista() : [];
  pintar(
    elCatalogo,
    html`${renderReglas(reglas)}${renderEnlace(enlaceVigente())}${renderCatalogo(hojas, filtro, criaturas)}`,
  );
  if (campo !== null) {
    const otra = elFicha.querySelector(`[data-campo="${campo}"]`);
    if (otra instanceof HTMLElement) otra.focus();
  }
  figuras = [];
  for (const lienzo of document.querySelectorAll('canvas[data-figura]')) {
    const ctx = lienzo instanceof HTMLCanvasElement ? lienzo.getContext('2d') : null;
    if (ctx === null || !(lienzo instanceof HTMLCanvasElement)) continue;
    const id = lienzo.getAttribute('data-figura') as string;
    const lado = lienzo.getAttribute('data-lado');
    figuras.push({
      lienzo,
      ctx,
      id,
      ficha: lienzo.getAttribute('data-ficha-clip') === 'si',
      lado: lado === 'izquierda' || lado === 'derecha' ? lado : null,
      rotulo: nombreDeFigura(id).slice(0, 3),
    });
  }
  pedirFotograma();
}

function puestoPorClave(clave: number): { lado: Lado; i: number; p: Puesto } {
  for (const lado of ['izquierda', 'derecha'] as const) {
    const i = montaje[lado].findIndex((p) => p.clave === clave);
    const p = montaje[lado][i];
    if (p !== undefined) return { lado, i, p };
  }
  throw new Error(`no hay ningún puesto ${clave} en el montaje`);
}

/** La ficha de lo elegido: una hoja, una criatura del catálogo o el héroe de un lado. */
function fichaElegida() {
  if (elegida === null) return renderFicha(null, null, false);
  switch (elegida.kind) {
    case 'hoja':
      return renderFicha(unidadDe(elegida.id), hojaPorId(elegida.id), arteDe(elegida.id).dispara);
    case 'catalogo':
      return renderFichaDeCatalogo(
        elegida.id,
        cifrasDelCatalogo(elegida.id),
        pruebas.has(elegida.id),
      );
    case 'heroe': {
      const h = heroes[elegida.lado];
      if (h === null) return renderFicha(null, null, false);
      return renderFichaDeHeroe(elegida.lado, h.datos, reglas, hojasDeHeroe());
    }
  }
}

/** Los que lleva ya un lado: sus puestos y su héroe, que cuenta como uno más. */
function ocupados(lado: Lado): number {
  return montaje[lado].length + (heroes[lado] === null ? 0 : 1);
}

function añadir(lado: Lado, fuente: FuenteDePuesto, ia: boolean): void {
  const adjetivo = LADOS[lado].adjetivo;
  if (ocupados(lado) >= caben) {
    aviso = `El bando ${adjetivo} ya lleva ${caben}: no cabe ninguna más.`;
    return;
  }
  if (fuente.kind === 'hoja') {
    const hoja = fuente.hoja;
    const h = hojaPorId(hoja);
    if (h.incompleta !== null) {
      aviso = `${h.nombre} no se monta: ${h.incompleta}.`;
      return;
    }
    // La unidad entra en el borrador al montarla: es lo que se probó y lo que se guarda.
    if (!borrador.has(hoja)) {
      borrador.set(hoja, unidadPorDefecto(h));
      cambiosSinGuardar = true;
    }
    elegida = { kind: 'hoja', id: hoja };
  } else {
    elegida = { kind: 'catalogo', id: creature(fuente.id).id };
  }
  montaje[lado].push({ clave: siguienteClave++, fuente, ia });
  aviso = `${describir({ clave: 0, fuente, ia }).nombre} entra en el bando ${adjetivo}.`;
}

/** Cambia la prueba de una criatura del catálogo, comprobada: lo que no cuadra se dice y no entra. */
function cambiarPrueba(id: string, cambio: (c: CambiosDeCatalogo) => CambiosDeCatalogo): void {
  try {
    const nuevos = cambio(pruebas.get(id) ?? {});
    cifrasDeCatalogoEnLaArena(id, nuevos);
    pruebas.set(id, nuevos);
    aviso = `${creature(id).name}: prueba que no se guarda en data/creatures.json.`;
  } catch (err) {
    aviso = `No se cambia: ${mensaje(err)}.`;
  }
}

/** Cambia el héroe de un lado, comprobado. */
function cambiarHeroe(lado: Lado, cambio: (h: HeroeDeArena) => HeroeDeArena): void {
  const h = heroes[lado];
  if (h === null) return;
  try {
    heroes[lado] = { ...h, datos: validarHeroeDeArena(cambio(h.datos)) };
    aviso = '';
  } catch (err) {
    aviso = `No se cambia: ${mensaje(err)}.`;
  }
}

/** Aplica un cambio a la unidad de un tipo, validado: lo que no cuadra se dice y no entra. */
function cambiarUnidad(id: string, cambio: (u: UnidadDeArena) => unknown): void {
  try {
    borrador.set(id, validarUnidadDeArena(cambio(unidadDe(id))));
    cambiosSinGuardar = true;
    aviso = '';
  } catch (err) {
    aviso = `No se cambia: ${mensaje(err)}.`;
  }
}

/** El nuevo valor de un campo de la ficha, en la unidad. Lo que es número lo valida el núcleo. */
function conCampo(u: UnidadDeArena, campo: string, valor: string): unknown {
  // Vacío es `NaN`, y el núcleo lo dice como «está vacío».
  const n = valor.trim() === '' ? Number.NaN : Number(valor);
  switch (campo) {
    case 'name':
      return { ...u, name: valor };

    case 'damage-min':
      return { ...u, damage: [n, u.damage[1]] };
    case 'damage-max':
      return { ...u, damage: [u.damage[0], n] };
    case 'gold':
      return { ...u, cost: { gold: n } };
    case 'shots': {
      // 0 disparos es cuerpo a cuerpo: el campo se va, como en el catálogo.
      const { shots: _fuera, ...resto } = u;
      return n === 0 ? resto : { ...u, shots: n };
    }
    case 'hexes': {
      const { hexes: _fuera, ...resto } = u;
      return n === 1 ? resto : { ...u, hexes: n };
    }
    case 'casillas':
    case 'attack':
    case 'defense':
    case 'hp':
    case 'level':
    case 'leadership':
      return { ...u, [campo]: n };
    default:
      throw new Error(`la ficha no tiene un campo «${campo}»`);
  }
}

/** El valor de un campo de formulario, sin nombrar su tipo del DOM. */
function valorDe(el: Element): string {
  const v = (el as Element & { value?: unknown }).value;
  if (typeof v !== 'string') throw new Error('ese elemento no es un campo con valor');
  return v;
}

function marcadoDe(el: Element): boolean {
  return (el as Element & { checked?: unknown }).checked === true;
}

async function guardar(): Promise<void> {
  if (sinGuardado !== null) {
    aviso = `No se puede guardar: ${sinGuardado}.`;
    return;
  }
  const orden = hojas.map((h) => h.id);
  // Las que no tienen hoja (`indexOf` −1) van al final, en el orden en que llegaron.
  const puesto = (id: string): number => {
    const i = orden.indexOf(id);
    return i < 0 ? orden.length : i;
  };
  const unidades = [...borrador.values()].sort((a, b) => puesto(a.id) - puesto(b.id));
  const r = await fetch('/__arena/unidades', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ unidades }),
  });
  const cuerpo = (await r.json()) as {
    ruta?: string;
    unidades?: number;
    conservadas?: number;
    error?: string;
  };
  if (!r.ok) {
    aviso = `No se ha guardado: ${cuerpo.error ?? r.status}.`;
    return;
  }
  cambiosSinGuardar = false;
  const n = cuerpo.unidades ?? 0;
  aviso = `Guardado en ${cuerpo.ruta}: ${n} ${n === 1 ? 'unidad' : 'unidades'}.`;
  if ((cuerpo.conservadas ?? 0) > 0) {
    aviso +=
      cuerpo.conservadas === 1
        ? ' Y 1 que no vale, tal como estaba.'
        : ` Y ${cuerpo.conservadas} que no valen, tal como estaban.`;
  }
}

// Cerrar o recargar con cifras sin guardar las perdía sin decir nada (M5 de QA).
window.addEventListener('beforeunload', (ev) => {
  if (cambiosSinGuardar && sinGuardado === null) ev.preventDefault();
});

// ---------------------------------------------------------------- el enlace de la pelea

/**
 * El montaje de ahora tal como va en el enlace: los puestos y héroes de cada
 * lado, las cifras de cada hoja montada (guardadas o no) y la prueba de cada
 * criatura del catálogo montada que la lleve.
 */
function montajeDelEnlace(): MontajeDelEnlace {
  const todos = [...montaje.izquierda, ...montaje.derecha];
  const hojasMontadas = [
    ...new Set(todos.flatMap((p) => (p.fuente.kind === 'hoja' ? [p.fuente.hoja] : []))),
  ];
  const pruebasMontadas: Record<string, CambiosDeCatalogo> = {};
  for (const p of todos) {
    const cambios = p.fuente.kind === 'catalogo' ? pruebas.get(p.fuente.id) : undefined;
    if (p.fuente.kind === 'catalogo' && cambios !== undefined) {
      pruebasMontadas[p.fuente.id] = cambios;
    }
  }
  const lado = (l: Lado) => ({
    puestos: montaje[l].map(
      (p): PuestoDelEnlace =>
        p.fuente.kind === 'hoja'
          ? { kind: 'hoja', hoja: p.fuente.hoja, ia: p.ia }
          : { kind: 'catalogo', id: p.fuente.id, ia: p.ia },
    ),
    heroe: heroes[l],
  });
  return {
    unidades: hojasMontadas.map(unidadDe),
    pruebas: pruebasMontadas,
    izquierda: lado('izquierda'),
    derecha: lado('derecha'),
  };
}

/**
 * La dirección que monta la pelea de ahora: la semilla, las reglas y el montaje.
 * Las comas de `?reglas=` van sin escapar, como en la barra.
 */
function enlaceDe(semilla: number): string {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('seed', String(semilla));
  const enURL = reglasALaURL(reglas);
  if (enURL !== '') url.searchParams.set('reglas', enURL);
  url.searchParams.set('montaje', montajeALaURL(montajeDelEnlace()));
  return url.href.replace(/%2C/g, ',');
}

/** El enlace copiado, si sigue siendo el de este montaje; si no, `null`. */
function enlaceVigente(): string | null {
  if (enlaceCopiado === null || semillaPedida === null) return null;
  return enlaceDe(semillaPedida) === enlaceCopiado ? enlaceCopiado : null;
}

/**
 * «Copiar enlace de la pelea»: el montaje entero no cabe con comodidad en la
 * barra, así que se escribe al pedirlo (H6 de QA del banco, decisión del
 * usuario). Sin semilla fijada, se sortea una y se fija, en la barra también:
 * la pelea que se lucha aquí después es la del enlace.
 */
async function copiarEnlace(): Promise<void> {
  const semilla = semillaPedida ?? semillaSorteada();
  const enlace = enlaceDe(semilla);
  semillaPedida = semilla;
  reglasALaBarra((url) => url.searchParams.set('seed', String(semilla)));
  enlaceCopiado = enlace;
  try {
    await navigator.clipboard.writeText(enlace);
    aviso = `Enlace de la pelea copiado (semilla ${semilla}): abrirlo monta esta misma pelea.`;
  } catch (err) {
    aviso = `El enlace de la pelea (semilla ${semilla}) está en su campo, junto a las reglas: no se ha podido copiar solo (${mensaje(err)}).`;
  }
}

/**
 * Monta la pelea de `?montaje=` si la URL trae una. Se comprueba ENTERA antes de
 * tocar nada —el formato y lo que existe, en `montajeDeLaURL`; que cada hoja
 * tenga arte, aquí—: un enlace que no vale se dice y la página sigue con el
 * montaje vacío. Abrirla no lucha sola. Devuelve lo que dice la barra, o `null`
 * si la URL no trae montaje.
 */
function montarDelEnlace(): { readonly montado: boolean; readonly aviso: string } | null {
  const noSeMonta = (err: unknown) => ({
    montado: false,
    aviso: `El enlace de la pelea no se monta: ${mensaje(err)}. `,
  });
  let texto: string | null;
  try {
    texto = unaVezEnLaURL(parametros.getAll('montaje'), 'montaje');
  } catch (err) {
    return noSeMonta(err);
  }
  if (texto === null) return null;
  try {
    // Con la semilla o las reglas mal, el montaje pelearía otra pelea.
    if (avisoDeSemilla !== '') throw new Error('la semilla o las reglas del enlace no valen');
    const m = montajeDeLaURL(texto);
    for (const u of m.unidades) {
      const h = hojaPorId(u.id);
      if (h.incompleta !== null) throw new Error(`${h.nombre} no se monta: ${h.incompleta}`);
    }
    for (const l of ['izquierda', 'derecha'] as const) {
      const figura = m[l].heroe?.datos.figura ?? null;
      if (figura !== null && !hojasDeHeroe().some((h) => h.id === figura)) {
        throw new Error(
          `la figura «${figura}» del héroe ${LADOS[l].adjetivo} no es una hoja de héroe`,
        );
      }
    }
    const distintas = m.unidades.filter(
      (u) => JSON.stringify(borrador.get(u.id) ?? null) !== JSON.stringify(u),
    );
    for (const u of m.unidades) borrador.set(u.id, u);
    if (distintas.length > 0) cambiosSinGuardar = true;
    for (const [id, cambios] of Object.entries(m.pruebas)) pruebas.set(id, cambios);
    for (const l of ['izquierda', 'derecha'] as const) {
      montaje[l] = m[l].puestos.map((p) => ({
        clave: siguienteClave++,
        fuente: p.kind === 'hoja' ? { kind: 'hoja', hoja: p.hoja } : { kind: 'catalogo', id: p.id },
        ia: p.ia,
      }));
      heroes[l] = m[l].heroe;
    }
    // La barra se queda con la semilla y las reglas: el montaje, si cambia, ya no
    // sería el del enlace.
    reglasALaBarra((url) => url.searchParams.delete('montaje'));
    const cifras =
      distintas.length === 0
        ? ''
        : ` Las cifras de ${distintas.map((u) => u.name).join(', ')} son las del enlace, sin guardar.`;
    return {
      montado: true,
      aviso: `Montada la pelea del enlace${semillaPedida === null ? '' : ` (semilla ${semillaPedida})`}: pulsa Luchar.${cifras} `,
    };
  } catch (err) {
    return noSeMonta(err);
  }
}

// ---------------------------------------------------------------- batalla

const batalla = new EscenaBatalla(() => {
  if (sesion === null) throw new Error('la escena de batalla se ha usado sin batalla');
  return sesion;
});

function luchar(): void {
  const puesto = (p: Puesto): PuestoDeArena => ({
    fuente:
      p.fuente.kind === 'hoja'
        ? { kind: 'borrador', unidad: unidadDe(p.fuente.hoja) }
        : { kind: 'catalogo', id: p.fuente.id, cambios: pruebas.get(p.fuente.id) ?? null },
    ia: p.ia,
  });
  const lado = (l: Lado): LadoDeSesion => ({
    puestos: montaje[l].map(puesto),
    heroe: heroes[l],
  });
  // Una pelea nueva sortea su semilla, salvo que la URL fije una; y la URL la
  // lleva siempre, como en la partida: un resultado raro se repite copiando la
  // barra de direcciones (M6 de QA). Con las reglas, que también la cambian.
  const semilla = semillaPedida ?? semillaSorteada();
  let nueva: SesionDeArena;
  try {
    nueva = new SesionDeArena(
      { izquierda: lado('izquierda'), derecha: lado('derecha'), reglas },
      semilla,
    );
  } catch (err) {
    aviso = `No se puede luchar: ${mensaje(err)}.`;
    return;
  }
  reglasALaBarra((url) => url.searchParams.set('seed', String(semilla)));
  sesion = nueva;
  elSeed.textContent = `semilla ${semilla}`;
  app.dataset.escena = 'battle';
  principal.remedir();
  paneles = null;
  // El animador mira el tablero de salida ANTES de que la IA juegue: así cuenta
  // lo que juega, también con todas las unidades en IA (H1 de QA).
  batalla.sincronizar(performance.now());
  nueva.empezar();
}

function volverAlMontaje(): void {
  sesion = null;
  app.dataset.escena = 'montaje';
  elDay.textContent = 'Montaje';
  elTurn.textContent = '';
  aviso = 'De vuelta al montaje: todo sigue como estaba.';
  repintarMontaje();
}

/** La puerta de los gestos mientras se cuenta la jugada, como en la partida. */
function jugadaEnCurso(): boolean {
  if (sesion === null) return true;
  if (!batalla.rechazarSiOcupada(performance.now())) return false;
  pedirFotograma();
  return true;
}

// ---------------------------------------------------------------- dibujo

let fotogramaPedido = false;
function pedirFotograma(): void {
  if (fotogramaPedido) return;
  fotogramaPedido = true;
  requestAnimationFrame(render);
}

const principal = ajustarLienzo(canvas, pedirFotograma);
cargarArte(pedirFotograma, { manifiesto: false, mapa: false });

let paneles: { version: string; ocupada: boolean } | null = null;

function render(ahora: number): void {
  fotogramaPedido = false;
  let otraVez = false;
  try {
    if (sesion === null) otraVez = dibujarFiguras(ahora);
    else {
      dibujarBatalla(ahora, sesion);
      otraVez = hayFigurasAnimadas() || batalla.ocupada;
    }
  } catch (err) {
    console.error('[arena] fallo al pintar', err);
    elStatus.textContent = `No se ha podido pintar la pantalla: ${mensaje(err)}`;
  } finally {
    if (otraVez) pedirFotograma();
  }
}

/**
 * Las miniaturas animadas del montaje. Devuelve si ha pintado alguna: sin
 * ninguna —al arrancar, con los bandos vacíos y sin ficha— no hay nada que
 * repintar, y el bucle se para hasta el siguiente gesto o la siguiente imagen.
 */
/** El instante dentro de un clip que no va en bucle, repetido con una pausa al final. */
function repeticion(ahora: number, c: { readonly frames: number; readonly fps: number }): number {
  const dura = (c.frames / c.fps) * 1000;
  return (ahora - inicioDelClip) % (dura + PAUSA_DE_LA_FICHA_MS);
}

function dibujarFiguras(ahora: number): boolean {
  if (elStatus.textContent !== aviso) elStatus.textContent = aviso;
  for (const [i, { lienzo, ctx, id, ficha, lado, rotulo }] of figuras.entries()) {
    const arte = arteDe(id);
    // En la miniatura cada figura llena su marco: aquí se mira una, no se
    // comparan. `pintarFigura` escala contra un adulto, así que se le pide el
    // alto que deja a ESTA figura en el 80 % del marco. Se pinta como en el
    // tablero —teñida del color de su bando, o el marcador si no ha llegado—.
    const clip: CharacterClip = ficha ? clipDeFicha : 'idle';
    // Los dos bandos se miran; la ficha, hacia donde la haya girado quien mira.
    const mira: Direccion = ficha
      ? (DIRECCION_DE_HOJA[miraDeFicha] as Direccion)
      : lado === 'derecha'
        ? 'SO'
        : MIRADA_DE_PRESENTACION;
    // El cadáver tendido es más ancho que alto y cae por debajo de los pies
    // —hacia la cámara, y en las hojas pintadas su fila va subida en la celda—:
    // con la muerte la figura se achica y el suelo sube hasta que quepa la celda
    // entera, o la ficha lo cortaba por abajo y por los lados.
    const llena = clip === 'death' ? 0.4 : 0.8;
    const alto = (lienzo.height * llena * FIGURA.alturaAdulto) / arte.alturaPropia;
    const atlas = hojaDe(arte, mira);
    const bajoLosPies =
      clip === 'death'
        ? ((atlas.cell - atlas.clips.death.anchor[1]) * alto) / FIGURA.alturaAdulto
        : 8;
    const figura: Figura = {
      // El compás va por miniatura y no por hoja: la misma unidad puede estar
      // en el catálogo y en los dos bandos, y no tiene por qué respirar igual.
      id: `miniatura-${i}-${id}`,
      body: id,
      clip,
      // Un clip que no va en bucle (ataque, disparo, daño, muerte) se repite en
      // la ficha: con el reloj de siempre se quedaba en su último fotograma.
      tiempo: ficha && !atlas.clips[clip].loop ? repeticion(ahora, atlas.clips[clip]) : ahora,
      x: lienzo.width / 2,
      suelo: lienzo.height - bajoLosPies,
      alto,
      mira,
      color: lado === null ? COLOR_NEUTRO : COLOR_BANDO[LADOS[lado].bando],
      rotulo,
    };
    const colocada = colocarFigura(figura);
    const clave = claveDelDibujo(colocada);
    if (pintado.get(lienzo) === clave) continue;
    pintado.set(lienzo, clave);
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    pintarSombraDeFigura(ctx, colocada);
    pintarFigura(ctx, colocada);
  }
  // Con alguna figura con arte en pantalla, respira: el bucle sigue. Sin arte,
  // la imagen que llegue avisa y repinta.
  return figuras.length > 0 && hayFigurasAnimadas();
}

function dibujarBatalla(ahora: number, s: SesionDeArena): void {
  const rect = principal.preparar();
  principal.ctx.clearRect(0, 0, rect.width, rect.height);
  batalla.sincronizar(ahora);
  batalla.dibujar(principal.ctx, rect.width, rect.height);
  const ocupada = batalla.ocupada;
  if (paneles === null || paneles.version !== s.version || paneles.ocupada !== ocupada) {
    paneles = { version: s.version, ocupada };
    // El parte se lee de arriba abajo y lo último queda al fondo: sigue ahí, o
    // al acabar no se veía lo que acababa de pasar (M11 de QA), salvo que la
    // persona haya subido a leer (#198).
    pintarSiguiendoElFinal(elSide, renderPanelDeBatalla(s, ocupada));
    // La barra de arriba, igual que el panel: mientras se cuenta no adelanta ni
    // la ronda ni el final.
    elDay.textContent = ocupada ? 'Batalla' : `Batalla · ronda ${s.battle.round}`;
    elTurn.textContent = ocupada
      ? 'Contando…'
      : s.battle.finished !== null
        ? 'Terminada'
        : s.turnoPropio === null
          ? 'Mueve la IA'
          : 'Te toca';
  }
  // «La batalla ha terminado» espera a que el tablero llegue al final.
  const estado = ocupada && s.battle.finished !== null ? '' : s.status;
  if (elStatus.textContent !== estado) elStatus.textContent = estado;
}

// ---------------------------------------------------------------- gestos

function enLienzo(ev: { clientX: number; clientY: number }): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

canvas.addEventListener('pointermove', (ev) => {
  if (sesion === null) return;
  const p = enLienzo(ev);
  batalla.mover(p.x, p.y);
  pedirFotograma();
});

canvas.addEventListener('pointerup', (ev) => {
  if (ev.button !== 0 || sesion === null) return;
  const p = enLienzo(ev);
  batalla.mover(p.x, p.y);
  if (!jugadaEnCurso()) batalla.pulsar(p.x, p.y);
  pedirFotograma();
});

canvas.addEventListener('pointerleave', () => {
  if (sesion !== null) batalla.salir();
  pedirFotograma();
});

/** Los botones de la batalla, los mismos de la partida (`accionesDeLaUnidad`). */
const JUGADA_DE_BOTON = {
  'battle-end-turn': 'end_turn',
  'battle-defend': 'defend',
  'battle-wait': 'wait',
} as const;

document.addEventListener('click', (ev) => {
  const conAccion = (ev.target as Element).closest('[data-action]');
  const accion = conAccion?.getAttribute('data-action');
  // El libro, como en la partida: elegir el hechizo no es una jugada, apuntar sí.
  if (
    accion === 'battle-spell' &&
    sesion !== null &&
    conAccion !== null &&
    conAccion !== undefined
  ) {
    if (!jugadaEnCurso())
      sesion.hechizos.selectSpell(conAccion.getAttribute('data-spell') as string);
    pedirFotograma();
    return;
  }
  if (accion !== undefined && accion !== null && accion in JUGADA_DE_BOTON) {
    // Un doble clic no son dos jugadas: el segundo caía en el botón ya repintado
    // y cerraba el turno de la SIGUIENTE unidad tuya sin que nadie lo pidiera
    // (M12 de QA). `detail` cuenta los clics seguidos.
    if (ev.detail > 1 || sesion === null || jugadaEnCurso()) return;
    sesion.playBattleAction({ type: JUGADA_DE_BOTON[accion as keyof typeof JUGADA_DE_BOTON] });
    pedirFotograma();
    return;
  }
  const el = (ev.target as Element).closest('[data-arena]');
  if (el === null) return;
  const que = el.getAttribute('data-arena');
  const clave = Number(el.getAttribute('data-clave'));
  const hoja = el.getAttribute('data-hoja');
  try {
    switch (que) {
      case 'filtro':
        filtro = el.getAttribute('data-faccion') as typeof filtro;
        break;
      case 'añadir': {
        // Por defecto la izquierda la mueve la persona y la derecha la IA: se cambia con Yo / IA.
        const lado = el.getAttribute('data-lado') as Lado;
        añadir(lado, { kind: 'hoja', hoja: hoja as string }, lado === 'derecha');
        break;
      }
      case 'añadir-catalogo': {
        const lado = el.getAttribute('data-lado') as Lado;
        const id = el.getAttribute('data-criatura') as string;
        añadir(lado, { kind: 'catalogo', id }, lado === 'derecha');
        break;
      }
      case 'editar':
        elegida = { kind: 'hoja', id: hoja as string };
        aviso = '';
        break;
      case 'editar-catalogo':
        elegida = { kind: 'catalogo', id: el.getAttribute('data-criatura') as string };
        aviso = '';
        break;
      case 'deshacer-prueba': {
        const id = el.getAttribute('data-criatura') as string;
        pruebas.delete(id);
        aviso = `${creature(id).name}, con las cifras del catálogo.`;
        break;
      }
      case 'poner-heroe': {
        const lado = el.getAttribute('data-lado') as Lado;
        if (ocupados(lado) >= caben) {
          aviso = `El bando ${LADOS[lado].adjetivo} ya lleva ${caben}: no cabe el héroe.`;
          break;
        }
        heroes[lado] = { datos: heroePorDefecto(lado), ia: lado === 'derecha' };
        elegida = { kind: 'heroe', lado };
        aviso = `El bando ${LADOS[lado].adjetivo} lleva héroe: cambia sus cifras y su libro en la ficha.`;
        break;
      }
      case 'editar-heroe':
        elegida = { kind: 'heroe', lado: el.getAttribute('data-lado') as Lado };
        aviso = '';
        break;
      case 'manda-heroe': {
        const lado = el.getAttribute('data-lado') as Lado;
        const h = heroes[lado];
        if (h !== null) heroes[lado] = { ...h, ia: el.getAttribute('data-ia') === 'si' };
        break;
      }
      case 'quitar-heroe': {
        const lado = el.getAttribute('data-lado') as Lado;
        heroes[lado] = null;
        if (elegida?.kind === 'heroe' && elegida.lado === lado) elegida = null;
        break;
      }
      case 'regla': {
        reglas = conRegla(
          reglas,
          el.getAttribute('data-regla') ?? '',
          el.getAttribute('data-version') ?? '',
        );
        // La URL la lleva ya, para que copiarla repita también el montaje de reglas.
        reglasALaBarra();
        aviso = '';
        break;
      }
      case 'manda': {
        const { lado, i, p } = puestoPorClave(clave);
        montaje[lado][i] = { ...p, ia: el.getAttribute('data-ia') === 'si' };
        break;
      }
      case 'duplicar': {
        const { lado, p } = puestoPorClave(clave);
        añadir(lado, p.fuente, p.ia);
        break;
      }
      case 'quitar': {
        const { lado, i } = puestoPorClave(clave);
        montaje[lado].splice(i, 1);
        break;
      }
      case 'clip':
        clipDeFicha = el.getAttribute('data-clip') as CharacterClip;
        inicioDelClip = performance.now();
        pedirFotograma();
        return;
      case 'girar':
        miraDeFicha = (miraDeFicha + 1) % DIRECCION_DE_HOJA.length;
        pedirFotograma();
        return;
      case 'quitar-habilidad': {
        const h = el.getAttribute('data-habilidad') as string;
        if (elegida?.kind === 'hoja') {
          cambiarUnidad(elegida.id, (u) => ({
            ...u,
            habilidades: u.habilidades.filter((x) => x !== h),
          }));
        }
        break;
      }
      case 'luchar':
        luchar();
        break;
      case 'enlace':
        void copiarEnlace().then(repintarMontaje, (err: unknown) => {
          aviso = `No se ha podido escribir el enlace de la pelea: ${mensaje(err)}.`;
          repintarMontaje();
        });
        return;
      case 'guardar':
        void guardar().then(repintarMontaje, (err: unknown) => {
          aviso = `No se ha guardado: ${mensaje(err)}.`;
          repintarMontaje();
        });
        return;
      case 'otra-vez':
        volverAlMontaje();
        return;
      default:
        return;
    }
  } catch (err) {
    aviso = mensaje(err);
  }
  if (sesion === null) repintarMontaje();
  else pedirFotograma();
});

document.addEventListener('change', (ev) => {
  const el = ev.target as Element;
  if (elegida === null) return;
  if (elegida.kind === 'catalogo') {
    cambiarDelCatalogo(elegida.id, el);
    repintarMontaje();
    return;
  }
  if (elegida.kind === 'heroe') {
    cambiarDelHeroe(elegida.lado, el);
    repintarMontaje();
    return;
  }
  const id = elegida.id;
  const campo = el.getAttribute('data-campo');
  const rasgo = el.getAttribute('data-rasgo');
  if (campo !== null) {
    cambiarUnidad(id, (u) => conCampo(u, campo, valorDe(el)));
  } else if (rasgo !== null) {
    const puesto = marcadoDe(el);
    cambiarUnidad(id, (u) => ({
      ...u,
      traits: puesto ? [...u.traits, rasgo as CreatureTrait] : u.traits.filter((t) => t !== rasgo),
    }));
  } else if (el.getAttribute('data-arena-habilidad') !== null) {
    const h = valorDe(el);
    if (h !== '') cambiarUnidad(id, (u) => ({ ...u, habilidades: [...u.habilidades, h] }));
  } else {
    return;
  }
  repintarMontaje();
});

/** Un campo de la ficha de una criatura del catálogo: su prueba. */
function cambiarDelCatalogo(id: string, el: Element): void {
  const campo = el.getAttribute('data-catalogo-campo');
  const rasgo = el.getAttribute('data-catalogo-rasgo');
  const actual = cifrasDelCatalogo(id);
  if (campo !== null) {
    const v = valorDe(el);
    const n = v.trim() === '' ? Number.NaN : Number(v);
    cambiarPrueba(id, (c) => {
      switch (campo) {
        case 'damage-min':
          return { ...c, damage: [n, actual.damage[1]] };
        case 'damage-max':
          return { ...c, damage: [actual.damage[0], n] };
        case 'attack':
        case 'defense':
        case 'hp':
        case 'casillas':
        case 'shots':
          return { ...c, [campo]: n };
        default:
          throw new Error(`la ficha del catálogo no tiene un campo «${campo}»`);
      }
    });
  } else if (rasgo !== null) {
    const puesto = marcadoDe(el);
    const antes = actual.traits ?? [];
    cambiarPrueba(id, (c) => ({
      ...c,
      traits: puesto ? [...antes, rasgo as CreatureTrait] : antes.filter((t) => t !== rasgo),
    }));
  }
}

/** Un campo de la ficha del héroe. */
function cambiarDelHeroe(lado: Lado, el: Element): void {
  const campo = el.getAttribute('data-heroe-campo');
  const hechizo = el.getAttribute('data-heroe-hechizo');
  if (campo !== null) {
    const v = valorDe(el);
    cambiarHeroe(lado, (h) => {
      switch (campo) {
        case 'nombre':
          return { ...h, nombre: v };
        case 'figura':
          return { ...h, figura: v === '' ? null : v };
        case 'ataque':
        case 'defensa':
        case 'poder':
        case 'conocimiento':
          return { ...h, [campo]: v.trim() === '' ? Number.NaN : Number(v) };
        default:
          throw new Error(`la ficha del héroe no tiene un campo «${campo}»`);
      }
    });
  } else if (hechizo !== null) {
    const puesto = marcadoDe(el);
    cambiarHeroe(lado, (h) => ({
      ...h,
      hechizos: puesto
        ? allSpells()
            .map((s) => s.id)
            .filter((id) => id === hechizo || h.hechizos.includes(id))
        : h.hechizos.filter((id) => id !== hechizo),
    }));
  }
}

document.addEventListener('keydown', (ev) => {
  // Escape suelta el hechizo elegido, como en la partida.
  if (ev.key === 'Escape' && sesion !== null && !jugadaEnCurso()) {
    sesion.hechizos.clearSpell();
    pedirFotograma();
    return;
  }
  // Espacio cierra el turno de tu unidad activa, como en la partida; con el foco
  // en un botón, Espacio pulsa ese botón.
  const enUnBoton = ev.target instanceof Element && ev.target.closest('button') !== null;
  if (ev.key !== ' ' || sesion === null || enUnBoton) return;
  ev.preventDefault();
  if (!ev.repeat && sesion.turnoPropio !== null && !jugadaEnCurso()) {
    sesion.playBattleAction({ type: 'end_turn' });
  }
  pedirFotograma();
});

arrancar().then(
  () => {
    const delEnlace = montarDelEnlace();
    aviso = delEnlace?.montado
      ? `${delEnlace.aviso}${aviso}${avisoDeIncompletas}`
      : `${avisoDeSemilla}${delEnlace?.aviso ?? ''}${aviso}${avisoDeIncompletas} Añade unidades a los dos bandos y pulsa Luchar.`;
    repintarMontaje();
  },
  (err: unknown) => {
    console.error('[arena] no ha arrancado', err);
    aviso = `La arena no ha podido arrancar: ${mensaje(err)}`;
    elStatus.textContent = aviso;
  },
);
