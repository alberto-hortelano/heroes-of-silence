/**
 * La dirección de la arena y el enlace de la pelea: lo que pide la URL al abrir (`leerLaURL`: la
 * semilla, el clima y lo que no vale), lo que se escribe en la barra (`aLaBarraDeLaArena`), el
 * montaje tal como va en el enlace (`?montaje=`), copiarlo y montar el que trae la URL, con sus
 * piezas, sus hechizos y su cuerpo de héroe como cambios sin guardar. Era parte de
 * `arena/main.ts` hasta R8 de la reorganización (07-11-2026).
 */
import {
  hechizosDelMontaje,
  type MontajeDelEnlace,
  montajeALaURL,
  montajeDeLaURL,
  type PuestoDelEnlace,
  retiradosDeLaURL,
} from '@core/arena/enlace.js';
import { LADOS, type Lado } from '@core/arena/lados.js';
import { cambioDePiezas, conPiezas, piezasDelMontaje } from '@core/arena/piezas.js';
import { hayMuralla, murallaVacia } from '@core/battle/muralla.js';
import type { CatalogoDeEquipo } from '@core/equipo/atado.js';
import type { Pieza } from '@core/equipo/pieza.js';
import { parseSeed } from '@core/rng.js';
import { climaSinRegiones } from '@core/state/clima.js';
import { unaVezEnLaURL } from '@core/validar.js';
import { avisoDelClima, climaDeLaURL } from '../comun/clima-de-la-url.js';
import { mensajeDe } from '../comun/errores.js';
import { aLaBarra, semillaSorteada } from '../comun/semilla.js';
import {
  catalogoDeMagia,
  cuerpoSinGuardar,
  hojasDeHeroe,
  idsQueCambian,
  porQueNoSeMonta,
  unidadDe,
} from './catalogo.js';
import { heroesDeLaPagina } from './montaje.js';
import type { EstadoDelCatalogo, EstadoDelMontaje, PaginaDeLaArena } from './pagina.js';

/**
 * Lo que pide la URL al abrir: la semilla (o sortear una en cada pelea), el clima y lo que no vale
 * (`montaje.semillaPedida`, `climaDeLaArena`, `avisoDeSemilla`, `parametrosQueNoValen`), en este
 * orden, que es el de lo que dice la barra. Eran sentencias de primer nivel de `main.ts` hasta R8
 * de la reorganización (07-11-2026).
 */
export function leerLaURL(montaje: EstadoDelMontaje, parametros: URLSearchParams): void {
  try {
    montaje.semillaPedida = parseSeed(unaVezEnLaURL(parametros.getAll('seed'), 'seed'));
  } catch (err) {
    montaje.avisoDeSemilla = `${mensajeDe(err)} — quita "?seed=…" de la barra de direcciones para sortear la semilla. `;
    montaje.parametrosQueNoValen.push('seed');
  }
  {
    const pedido = climaDeLaURL(parametros);
    montaje.avisoDeSemilla += pedido.aviso;
    try {
      montaje.climaDeLaArena = climaSinRegiones(pedido.forzado, 'la arena');
    } catch (err) {
      montaje.avisoDeSemilla += avisoDelClima(err);
    }
  }

  // Los interruptores retirados (19-10-2026: la arena pelea con las reglas del
  // juego): un `?reglas=`, `?golpe=` o `?contacto=` no se ignora, se dice
  // (`retiradosDeLaURL`), y el enlace que los trae no se monta.
  for (const { nombre, motivo } of retiradosDeLaURL(parametros.keys())) {
    montaje.avisoDeSemilla += `${motivo}. `;
    montaje.parametrosQueNoValen.push(nombre);
  }
}

/**
 * Escribe en la barra la dirección de ahora con lo que ponga `cambiar` (la
 * semilla), sin los parámetros retirados: ya se dijeron al abrir, y copiar la
 * barra no los arrastra.
 */
export function aLaBarraDeLaArena(cambiar: (url: URL) => void): void {
  aLaBarra((url) => {
    cambiar(url);
    for (const { nombre } of retiradosDeLaURL([...url.searchParams.keys()])) {
      url.searchParams.delete(nombre);
    }
  });
}

/** Nombres de piezas para la barra: «Espada», «Brigantina». */
function nombresDe(piezas: readonly Pieza[]): string {
  return piezas.map((p) => `«${p.nombre}»`).join(', ');
}

/**
 * El montaje de ahora tal como va en el enlace: los puestos y héroes de cada
 * lado y las cifras de cada unidad montada (guardadas o no).
 */
function montajeDelEnlace(pagina: PaginaDeLaArena): MontajeDelEnlace {
  const { catalogo, montaje, editorDeMuralla } = pagina;
  const todos = [...montaje.puestos.izquierda, ...montaje.puestos.derecha];
  const unidadesMontadas = [...new Set(todos.map((p) => p.unidad))];
  const lado = (l: Lado) => ({
    ia: montaje.iaDelBando[l],
    puestos: montaje.puestos[l].map(
      (p): PuestoDelEnlace => ({ unidad: p.unidad, escalera: p.escalera }),
    ),
    heroe: montaje.heroes[l],
  });
  const unidades = unidadesMontadas.map((id) => unidadDe(catalogo, id));
  return {
    unidades,
    piezas: piezasDelMontaje(
      unidades,
      heroesDeLaPagina(montaje).map((h) => h.equipo),
      [...catalogo.equipo.escritas.values()],
    ),
    hechizos: hechizosDelMontaje(unidades, heroesDeLaPagina(montaje), catalogoDeMagia(catalogo)),
    izquierda: lado('izquierda'),
    derecha: lado('derecha'),
    muralla: hayMuralla(editorDeMuralla.muralla) ? editorDeMuralla.muralla : null,
    combate: montaje.combate,
  };
}

/** La dirección que monta la pelea de ahora: la semilla y el montaje. */
function enlaceDe(pagina: PaginaDeLaArena, semilla: number): string {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('seed', String(semilla));
  url.searchParams.set('montaje', montajeALaURL(montajeDelEnlace(pagina)));
  return url.href;
}

/** El enlace copiado, si sigue siendo el de este montaje; si no, `null`. */
export function enlaceVigente(pagina: PaginaDeLaArena): string | null {
  const { montaje } = pagina;
  if (montaje.enlaceCopiado === null || montaje.semillaPedida === null) return null;
  return enlaceDe(pagina, montaje.semillaPedida) === montaje.enlaceCopiado
    ? montaje.enlaceCopiado
    : null;
}

/**
 * «Copiar enlace de la pelea»: el montaje entero no cabe con comodidad en la
 * barra, así que se escribe al pedirlo (H6 de QA del banco, decisión del
 * usuario). Sin semilla fijada, se sortea una y se fija, en la barra también:
 * la pelea que se lucha aquí después es la del enlace.
 */
export async function copiarEnlace(pagina: PaginaDeLaArena): Promise<void> {
  const { montaje, vista } = pagina;
  const semilla = montaje.semillaPedida ?? semillaSorteada();
  const enlace = enlaceDe(pagina, semilla);
  montaje.semillaPedida = semilla;
  aLaBarraDeLaArena((url) => url.searchParams.set('seed', String(semilla)));
  montaje.enlaceCopiado = enlace;
  try {
    await navigator.clipboard.writeText(enlace);
    vista.aviso = `Enlace de la pelea copiado (semilla ${semilla}): abrirlo monta esta misma pelea.`;
  } catch (err) {
    vista.aviso = `El enlace de la pelea (semilla ${semilla}) está en su campo: no se ha podido copiar solo (${mensajeDe(err)}).`;
  }
}

/**
 * Monta la pelea de `?montaje=` si la URL trae una. Se comprueba ENTERA antes de
 * tocar nada —el formato y lo que existe, en `montajeDeLaURL`; que cada hoja
 * tenga arte, aquí—: un enlace que no vale se dice y la página sigue con el
 * montaje vacío. Abrirla no lucha sola. Devuelve lo que dice la barra, o `null`
 * si la URL no trae montaje.
 */
export function montarDelEnlace(
  pagina: PaginaDeLaArena,
): { readonly montado: boolean; readonly aviso: string } | null {
  const { catalogo, montaje, editorDeMuralla, parametros } = pagina;
  const noSeMonta = (err: unknown) => ({
    montado: false,
    aviso: `El enlace de la pelea no se monta: ${mensajeDe(err)}. `,
  });
  let texto: string | null;
  try {
    texto = unaVezEnLaURL(parametros.getAll('montaje'), 'montaje');
  } catch (err) {
    return noSeMonta(err);
  }
  if (texto === null) return null;
  try {
    // Con la semilla mal o un interruptor retirado, el montaje pelearía otra pelea.
    if (montaje.parametrosQueNoValen.length > 0) {
      const cuales = montaje.parametrosQueNoValen.map((p) => `«?${p}=»`).join(', ');
      throw new Error(
        montaje.parametrosQueNoValen.length === 1
          ? `${cuales} del enlace no vale`
          : `${cuales} del enlace no valen`,
      );
    }
    const m = montajeDeLaURL(texto);
    for (const u of m.unidades) {
      const motivo = porQueNoSeMonta(catalogo, u);
      if (motivo !== null) throw new Error(`${u.name} no se monta: ${motivo}`);
    }
    for (const l of ['izquierda', 'derecha'] as const) {
      const figura = m[l].heroe?.figura ?? null;
      if (figura !== null && !hojasDeHeroe(catalogo).some((h) => h.id === figura)) {
        throw new Error(
          `la figura «${figura}» del héroe ${LADOS[l].adjetivo} no es una hoja de héroe`,
        );
      }
    }
    const distintas = m.unidades.filter(
      (u) => JSON.stringify(catalogo.unidadesDelCatalogo.get(u.id) ?? null) !== JSON.stringify(u),
    );
    const { despues, dicho: piezasDichas } = equipoAlAbrir(catalogo, m);
    catalogo.equipo = despues;
    // Los hechizos del enlace entran en los de la página, como sus piezas: los que
    // son otros, sin guardar.
    catalogo.hechizosDeLaPagina = [
      ...catalogo.hechizosDeLaPagina.map((h) => m.hechizos.find((x) => x.id === h.id) ?? h),
      ...m.hechizos.filter((x) => !catalogo.hechizosDeLaPagina.some((h) => h.id === x.id)),
    ];
    for (const u of m.unidades) catalogo.unidadesDelCatalogo.set(u.id, u);
    for (const u of distintas) catalogo.unidadesSinGuardar.add(u.id);
    for (const l of ['izquierda', 'derecha'] as const) {
      montaje.puestos[l] = m[l].puestos.map((p) => ({
        clave: montaje.siguienteClave++,
        unidad: p.unidad,
        escalera: p.escalera,
      }));
      montaje.heroes[l] = m[l].heroe;
      montaje.iaDelBando[l] = m[l].ia;
    }
    // El cuerpo de sus héroes (el mismo en los dos: `montajeDeLaURL`) es el de todo
    // héroe de la página, como sus piezas: sin guardar si no es el del disco.
    const conCuerpo = montaje.heroes.izquierda ?? montaje.heroes.derecha;
    if (conCuerpo !== null) catalogo.cuerpoDeTodoHeroe = conCuerpo.cuerpo;
    // La muralla del enlace sustituye a la dibujada; sin ella, el tablero va limpio.
    editorDeMuralla.muralla = m.muralla ?? murallaVacia('piedra');
    montaje.combate = m.combate;
    editorDeMuralla.nombreDeForma = '';
    // La barra se queda con la semilla: el montaje, si cambia, ya no sería el del
    // enlace.
    aLaBarraDeLaArena((url) => url.searchParams.delete('montaje'));
    const cifras =
      (distintas.length === 0
        ? ''
        : ` Las cifras de ${distintas.map((u) => u.name).join(', ')} son las del enlace, sin guardar.`) +
      (cuerpoSinGuardar(catalogo) ? ' El cuerpo de todo héroe es el del enlace, sin guardar.' : '');
    return {
      montado: true,
      aviso: `Montada la pelea del enlace${montaje.semillaPedida === null ? '' : ` (semilla ${montaje.semillaPedida})`}: pulsa Luchar.${cifras}${piezasDichas} `,
    };
  } catch (err) {
    return noSeMonta(err);
  }
}

/**
 * El catálogo de equipo tras abrir `m`, sin tocar nada todavía, y lo que hay que
 * decir. **El enlace no se superpone: aplica** (decisión del coordinador, simplify
 * de F2): trae todas las piezas que lleva lo montado (`MontajeDelEnlace.piezas`), y
 * las que el catálogo no tiene, o tiene con otro contenido, entran en él como
 * cambios sin guardar, lo mismo que editarlas a mano; «Guardar» las escribe. Lanza
 * con lo que no entraría a mano (`cambioDePiezas`, con las unidades del catálogo y
 * las del enlace).
 */
function equipoAlAbrir(
  catalogo: EstadoDelCatalogo,
  m: MontajeDelEnlace,
): {
  readonly despues: CatalogoDeEquipo;
  readonly dicho: string;
} {
  const unidades = new Map(catalogo.unidadesDelCatalogo);
  for (const u of m.unidades) unidades.set(u.id, u);
  const cambio = cambioDePiezas(
    catalogo.equipo,
    conPiezas([...catalogo.equipo.escritas.values()], m.piezas),
    [...unidades.values()],
  );
  if ('motivo' in cambio) throw new Error(`sus piezas no entran en las tuyas: ${cambio.motivo}`);
  const despues = cambio.equipo;
  const cambian = idsQueCambian(catalogo.equipo, despues).map((id) => despues.pieza(id));
  return {
    despues,
    dicho:
      cambian.length === 0
        ? ''
        : ` Este enlace cambia ${cambian.length === 1 ? 'una pieza' : `${cambian.length} piezas`} (${nombresDe(cambian)}), sin guardar: «Guardar» ${cambian.length === 1 ? 'la escribe' : 'las escribe'}.`,
  };
}
