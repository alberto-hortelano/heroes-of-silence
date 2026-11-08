/**
 * El catálogo de la arena (`EstadoDelCatalogo`): lo que se pregunta de él —una unidad, una hoja,
 * los hechizos que valen, lo que queda por guardar—, cómo se lee de disco al abrir (`arrancar`) y
 * cómo se guarda (`guardar`), y el aviso al cerrar con algo sin guardar. Lo que solo lee el
 * catálogo lo recibe a él; lo que también escribe la barra, la página. Era parte de
 * `arena/main.ts` hasta R8 de la reorganización (07-11-2026).
 */
import { mismaPieza } from '@core/arena/piezas.js';
import { type CatalogoDeEquipo, catalogoDeEquipo } from '@core/equipo/atado.js';
import { combateDelHeroe } from '@core/hero/cuerpo-del-heroe.js';
import { type CatalogoDeHechizos, catalogoDeHechizos } from '@core/magia/catalogo.js';
import type { Hechizo } from '@core/magia/formato.js';
import { leerHechizos, problemasDelHechizo } from '@core/magia/validar.js';
import { UNIDADES } from '@core/unidad/catalogo.js';
import {
  type Hoja,
  RUTA_DEL_CATALOGO_DE_UNIDADES,
  type Unidad,
  validarUnidad,
} from '@core/unidad/formato.js';
import { registrarLasHojas } from '../render/figuras/personajes.js';
import type { EstadoDelCatalogo, PaginaDeLaArena } from './pagina.js';
import { FIGURA_GENERICA } from './paneles/bandos.js';
import { type Guardado, guardadoEnPalabras } from './paneles/equipo.js';
import {
  avisoDelCatalogoLeido,
  type ListaDeUnidades,
  porQueNoSeMonta as porQueNoSeMontaEntre,
  type TarjetaDeUnidad,
  tarjetasDelCatalogo,
} from './paneles/lista.js';
import { leerDelServidor, mandarAlServidor, type RespuestaDeBorrador } from './servidor.js';

/** Los ids de las piezas que «Guardar» cambiaría en disco: lo que de verdad queda sin guardar. */
export function piezasSinGuardar(catalogo: EstadoDelCatalogo): readonly string[] {
  return idsQueCambian(catalogo.equipoGuardado, catalogo.equipo);
}

/** Los hechizos de la página que valen, y con los que se pelea. */
export function hechizosQueValen(catalogo: EstadoDelCatalogo): readonly Hechizo[] {
  const vistos = new Set<string>();
  return catalogo.hechizosDeLaPagina.filter((h) => {
    if (vistos.has(h.id) || problemasDelHechizo(h).length > 0) return false;
    vistos.add(h.id);
    return true;
  });
}

/** El catálogo con que se pelea: los hechizos de la página que valen. */
export function catalogoDeMagia(catalogo: EstadoDelCatalogo): CatalogoDeHechizos {
  return catalogoDeHechizos(hechizosQueValen(catalogo));
}

/** Los ids de los hechizos que «Guardar» cambiaría en disco. */
export function hechizosSinGuardar(catalogo: EstadoDelCatalogo): readonly string[] {
  const antes = new Map(catalogo.hechizosGuardados.map((h) => [h.id, JSON.stringify(h)]));
  const ahora = new Map(catalogo.hechizosDeLaPagina.map((h) => [h.id, JSON.stringify(h)]));
  const ids = new Set([...antes.keys(), ...ahora.keys()]);
  return [...ids].filter((id) => antes.get(id) !== ahora.get(id));
}

/** Si el cuerpo de todo héroe de la página no es el del disco. */
export function cuerpoSinGuardar(catalogo: EstadoDelCatalogo): boolean {
  return JSON.stringify(catalogo.cuerpoDeTodoHeroe) !== JSON.stringify(catalogo.cuerpoGuardado);
}

/** El nombre de quien se pinta en una miniatura: una hoja o el héroe genérico. */
export function nombreDeFigura(catalogo: EstadoDelCatalogo, id: string): string {
  if (id === FIGURA_GENERICA) return 'Héroe';
  return hojaPorId(catalogo, id).nombre;
}

/** Las hojas de héroe completas, para elegir la figura del héroe. */
export function hojasDeHeroe(catalogo: EstadoDelCatalogo): { id: string; nombre: string }[] {
  return catalogo.hojas
    .filter((h) => h.heroe && h.incompleta === null)
    .map((h) => ({ id: h.id, nombre: h.nombre }));
}

export function hojaPorId(catalogo: EstadoDelCatalogo, id: string): Hoja {
  const h = catalogo.hojasPorId.get(id);
  if (h === undefined) throw new Error(`no hay ninguna hoja «${id}» en assets/unidades/`);
  return h;
}

/**
 * La unidad `id`, del catálogo (`data/unidades.json`): **la única fuente de sus
 * cifras**. Lo que la lista ofrece sale de él (`tarjetasDeLaLista`), así que pedir
 * una que no está es un fallo del gesto, no una unidad con cifras inventadas.
 */
export function unidadDe(catalogo: EstadoDelCatalogo, id: string): Unidad {
  const u = catalogo.unidadesDelCatalogo.get(id);
  if (u === undefined) throw new Error(`no hay ninguna unidad «${id}» en el catálogo de unidades`);
  return u;
}

/**
 * Lo que la lista enseña: las unidades del catálogo, con su nombre
 * (`tarjetasDelCatalogo`). Una hoja sin la suya (un héroe, o una hoja nueva del
 * taller) no se monta con cifras por defecto: se crea con «Nueva unidad», que
 * ofrece todas.
 */
export function tarjetasDeLaLista(catalogo: EstadoDelCatalogo): readonly TarjetaDeUnidad[] {
  return tarjetasDelCatalogo(catalogo.unidadesDelCatalogo.values(), catalogo.hojas);
}

/** Por qué la unidad `u` no se monta con las hojas de la página (`porQueNoSeMontaEntre`). */
export function porQueNoSeMonta(catalogo: EstadoDelCatalogo, u: Unidad): string | null {
  return porQueNoSeMontaEntre(u, catalogo.hojasPorId);
}

/**
 * Lo que la lista enseña además de las unidades, en el montaje y en la edición:
 * los cuerpos que ofrece «Nueva unidad» (las hojas con su arte entero).
 */
export function listaDeUnidades(catalogo: EstadoDelCatalogo): ListaDeUnidades {
  return {
    cuerpos: catalogo.hojas
      .filter((h) => h.incompleta === null)
      .map((h) => ({ id: h.id, nombre: h.nombre })),
  };
}

/**
 * Las hojas y el catálogo de unidades. Las hojas se validan al recibirlas, que es
 * por donde entran su perfil y su facción. Con el servidor de desarrollo, el
 * catálogo de disco, que vale entero: si una unidad no valiera, el núcleo no
 * habría cargado y la página diría por qué sin llegar aquí (`arranque.ts`). Sin
 * él (la arena construida), el catálogo del núcleo.
 */
export async function arrancar(pagina: PaginaDeLaArena): Promise<void> {
  const { catalogo, vista } = pagina;
  // Una hoja incompleta no se registra: `arteDe` la pintaría con el Y Bot por
  // defecto, que es justo lo que no puede pasar en silencio (#140).
  catalogo.hojas = await registrarLasHojas();
  catalogo.hojasPorId = new Map(catalogo.hojas.map((h) => [h.id, h]));
  const incompletas = catalogo.hojas.filter((h) => h.incompleta !== null);
  if (incompletas.length > 0) {
    catalogo.avisoDeIncompletas = ` A medias en el taller (se listan y no se montan): ${incompletas
      .map((h) => h.incompleta)
      .join('; ')}.`;
    console.warn(`[arena]${catalogo.avisoDeIncompletas}`);
  }
  const leido = await leerDelServidor('/__arena/unidades', 'el catálogo de unidades');
  const cuerpo = leido.cuerpo;
  catalogo.sinGuardado = leido.sinGuardado;
  if (!cuerpo.guardado) {
    vista.aviso = `${delCatalogoDelNucleo(catalogo)} Sin el servidor de desarrollo (pnpm arena) no se guarda: las cifras que cambies aquí se pierden al cerrar.`;
    return;
  }
  if (cuerpo.ilegible !== undefined) {
    vista.aviso = `No se puede leer ${RUTA_DEL_CATALOGO_DE_UNIDADES}: ${cuerpo.ilegible}. No hay unidades que montar ni se guarda hasta que se arregle; «Nueva unidad» sí crea.`;
    return;
  }
  catalogo.versionLeida = cuerpo.version ?? null;
  if (cuerpo.heroe === undefined) {
    throw new Error('el servidor no ha mandado el cuerpo del héroe con las unidades');
  }
  catalogo.cuerpoDeTodoHeroe = combateDelHeroe(
    cuerpo.heroe,
    'el cuerpo del héroe que manda el servidor',
  );
  catalogo.cuerpoGuardado = catalogo.cuerpoDeTodoHeroe;
  // Las piezas antes que las unidades: una unidad puede llevar una nueva.
  cargarPiezas(catalogo, cuerpo);
  if (cuerpo.hechizos !== undefined) {
    catalogo.hechizosDeLaPagina = leerHechizos(
      { hechizos: cuerpo.hechizos },
      'los hechizos del servidor',
    );
    catalogo.hechizosGuardados = catalogo.hechizosDeLaPagina;
  }
  const unidades = Array.isArray(cuerpo.unidades) ? cuerpo.unidades : [];
  const sinHoja: string[] = [];
  for (const crudo of unidades) {
    const u = validarUnidad(crudo, catalogo.equipo);
    catalogo.unidadesDelCatalogo.set(u.id, u);
    const motivo = porQueNoSeMonta(catalogo, u);
    if (motivo !== null) sinHoja.push(`${u.id} (${motivo})`);
  }
  vista.aviso = avisoDelCatalogoLeido(
    RUTA_DEL_CATALOGO_DE_UNIDADES,
    catalogo.unidadesDelCatalogo.size,
  );
  // Las que no tienen hoja se quedan en el catálogo y se vuelven a guardar; solo
  // no se pueden montar.
  if (sinHoja.length > 0) vista.aviso += ` No se pueden montar: ${sinHoja.join(', ')}.`;
}

/**
 * La arena construida (sin servidor de desarrollo) pelea con el catálogo del
 * núcleo (`core/unidad/catalogo.ts`), el mismo que lee el juego. Un catálogo roto no
 * llega aquí: lanza al cargarse el núcleo y lo dice `arranque.ts`. Devuelve la
 * frase de la barra.
 */
function delCatalogoDelNucleo(catalogo: EstadoDelCatalogo): string {
  for (const u of UNIDADES) catalogo.unidadesDelCatalogo.set(u.id, u);
  return `Cargado ${RUTA_DEL_CATALOGO_DE_UNIDADES}: ${UNIDADES.length} unidades.`;
}

/**
 * El catálogo de equipo en disco (`data/equipo.json`), que llega con las unidades:
 * el que se edita y se guarda. El servidor lo lee con la regla del juego, así que
 * llega entero y válido (si no, no llega nada y se dice, `ilegible`); aquí se
 * hace con la misma (`catalogoDeEquipo`).
 */
function cargarPiezas(catalogo: EstadoDelCatalogo, cuerpo: RespuestaDeBorrador): void {
  if (!Array.isArray(cuerpo.piezas)) {
    throw new Error('el servidor no ha mandado el catálogo de equipo con las unidades');
  }
  catalogo.equipo = catalogoDeEquipo(cuerpo.piezas);
  catalogo.equipoGuardado = catalogo.equipo;
}

/**
 * «Guardar»: las unidades y las piezas con que se pelea, en una sola operación
 * (`escribirCatalogo`): si algo no vale no se escribe nada y se dice por qué.
 */
export async function guardar(pagina: PaginaDeLaArena): Promise<void> {
  const { catalogo, vista } = pagina;
  const orden = catalogo.hojas.map((h) => h.id);
  // Las nuevas y las que no tienen hoja (`indexOf` −1) van al final, en el orden
  // en que llegaron.
  const puesto = (id: string): number => {
    const i = orden.indexOf(id);
    return i < 0 ? orden.length : i;
  };
  const unidades = [...catalogo.unidadesDelCatalogo.values()].sort(
    (a, b) => puesto(a.id) - puesto(b.id),
  );
  const guardado = catalogo.equipo;
  const piezas = [...guardado.escritas.values()];
  // Con la versión que se leyó: si otra pestaña guardó entre medias, el servidor
  // lo rechaza en vez de pisarlo (`guardarCatalogo`).
  const heroe = catalogo.cuerpoDeTodoHeroe;
  const hechizos = catalogo.hechizosDeLaPagina;
  const hecho = await mandarAlServidor(
    vista,
    '/__arena/unidades',
    { unidades, piezas, heroe, hechizos, version: catalogo.versionLeida },
    catalogo.sinGuardado,
    { noSePuede: 'No se puede guardar', noSeHa: 'No se ha guardado' },
  );
  if (hecho === null) return;
  catalogo.versionLeida = hecho.version ?? null;
  catalogo.unidadesSinGuardar.clear();
  catalogo.equipoGuardado = guardado;
  catalogo.cuerpoGuardado = heroe;
  catalogo.hechizosGuardados = hechizos;
  vista.aviso = guardadoEnPalabras(hecho as Guardado);
}

/**
 * Cerrar o recargar con cifras sin guardar las perdía sin decir nada (M5 de QA): con algo sin
 * guardar, y si se puede guardar, el navegador pregunta antes. Era un oyente de primer nivel de
 * `main.ts` hasta R8 de la reorganización (07-11-2026).
 */
export function instalarElAvisoAlCerrar(catalogo: EstadoDelCatalogo): void {
  window.addEventListener('beforeunload', (ev) => {
    const algo =
      catalogo.unidadesSinGuardar.size +
        piezasSinGuardar(catalogo).length +
        hechizosSinGuardar(catalogo).length >
        0 || cuerpoSinGuardar(catalogo);
    if (algo && catalogo.sinGuardado === null) ev.preventDefault();
  });
}

/**
 * Los ids de las piezas que cambian, aparecen o desaparecen de `antes` a
 * `despues`, por id y, antes de comparar su contenido (`mismaPieza`), por
 * identidad: lo que no se ha tocado es el mismo objeto.
 */
export function idsQueCambian(antes: CatalogoDeEquipo, despues: CatalogoDeEquipo): string[] {
  const ids = new Set([...antes.escritas.keys(), ...despues.escritas.keys()]);
  return [...ids].filter((id) => {
    const a = antes.escritas.get(id);
    const d = despues.escritas.get(id);
    if (a === d) return false;
    return a === undefined || d === undefined || !mismaPieza(a, d);
  });
}
