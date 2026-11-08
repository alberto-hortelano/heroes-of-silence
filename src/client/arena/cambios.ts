/**
 * Los cambios de la arena: lo que cambia una ficha —una cifra, un rasgo, una habilidad, un poder,
 * una pieza puesta, el cuerpo de todo héroe— o la de una pieza del equipo, y la complejidad de la
 * pelea; con la regla de cada uno, lo que no vale se dice («No se cambia: …») y, en plena pelea,
 * entra antes en la batalla. Y los oyentes que los traen: las teclas y el foco del campo del
 * nombre y cada `change` (`instalarLosCambios`). Era parte de `arena/main.ts` hasta R8 de la
 * reorganización (07-11-2026).
 */
import { type HeroeDeArena, heroeDeArena, validarHeroeDeArena } from '@core/arena/heroe.js';
import { LADOS, type Lado } from '@core/arena/lados.js';
import { topeDelBandoBlocker } from '@core/arena/montaje.js';
import {
  cambioDePiezas,
  conBase,
  conPiezas,
  enElHueco,
  equiparEnArena,
  escritaDe,
} from '@core/arena/piezas.js';
import type { RetoqueDeArena } from '@core/arena/retoque.js';
import type { ReglasDelCombate } from '@core/combate.js';
import type { CatalogoDeEquipo } from '@core/equipo/atado.js';
import {
  conLosExtras,
  DONDE_SE_CONSIGUE,
  type ExtrasDePieza,
  esPiezaConBase,
  extrasDe,
  type PiezaEscrita,
  validarPieza,
} from '@core/equipo/pieza.js';
import { type CuerpoDeTodoHeroe, combateDelHeroe } from '@core/hero/cuerpo-del-heroe.js';
import {
  CIFRAS_DE_PIEZA,
  type CreatureTrait,
  esHueco,
  esHuecoDePieza,
  esTipoDelAnillo,
} from '@core/types.js';
import { type Unidad, validarUnidad } from '@core/unidad/formato.js';
import { mensajeDe } from '../../shared/errores.js';
import { leerElCombate } from '../views/combate.js';
import { hechizosQueValen, unidadDe } from './catalogo.js';
import { claveDeFicha } from './edicion.js';
import { campoDelNombre, claveDelElemento, fichaDelElemento } from './fichas.js';
import { heroesDeLaPagina } from './montaje.js';
import type { EstadoDeLaPelea, PaginaDeLaArena } from './pagina.js';
import type { Elegida } from './paneles/bandos.js';
import { pedirRepintado } from './vista.js';

/**
 * Pone la pieza `nueva` en lugar de la de id `id` —o la borra, con `null`—, o dice
 * por qué no y no toca nada. Entra si lo deja la regla del cambio
 * (`cambioDePiezas`: el catálogo que queda vale, y ninguna unidad del catálogo ni
 * el equipo base del héroe dejan de valer) y, en
 * plena pelea, la de la batalla (`retocarEnBatalla`, `kind: 'piezas'`), como un
 * cambio de unidad en plena pelea (`cambiarUnidad`).
 */
export function cambiarPiezas(
  pagina: PaginaDeLaArena,
  id: string,
  nueva: PiezaEscrita | null,
  texto: string,
): boolean {
  const { catalogo, montaje, pelea } = pagina;
  const escritas = [...catalogo.equipo.escritas.values()];
  const cambio = cambioDePiezas(
    catalogo.equipo,
    nueva === null ? escritas.filter((p) => p.id !== id) : conPiezas(escritas, [nueva]),
    [...catalogo.unidadesDelCatalogo.values()],
    heroesDeLaPagina(montaje),
  );
  if ('motivo' in cambio) {
    noSeCambia(pagina, `${cambio.motivo}.`);
    return false;
  }
  const enLaPelea = retocarLaPelea(pelea, { kind: 'piezas', equipo: cambio.equipo });
  if (enLaPelea !== null) {
    noSeCambia(pagina, enLaPelea);
    return false;
  }
  catalogo.equipo = cambio.equipo;
  avisoTrasCambio(pagina, texto);
  return true;
}

/**
 * La pieza `p` (como está escrita) con el campo `campo` de su ficha cambiado a
 * `valor`, sin validar: lo valida el núcleo. Las cifras se cambian en unos extras
 * (`conCifraDePieza`): con base, los suyos, lo que suma encima de la base; entera,
 * lo que suma (`extrasDe`, y de vuelta `conLosExtras`). La base la cambia
 * `conBase`, que conserva lo que suma.
 */
function conCampoDePieza(
  p: PiezaEscrita,
  campo: string,
  valor: string,
  eq: CatalogoDeEquipo,
): unknown {
  // Vacío es `NaN`, y el núcleo lo dice («tiene que ser un entero ≥ 0 y no es un número»).
  const n = valor.trim() === '' ? Number.NaN : Number(valor);
  switch (campo) {
    case 'nombre':
      return { ...p, nombre: valor.trim() };
    case 'base':
      return conBase(p, valor === '' ? null : valor, eq);
    case 'se-consigue-armeria':
    case 'se-consigue-botin': {
      // Una casilla por sitio: marcada, se consigue ahí; el resto, como estaba.
      const donde = campo === 'se-consigue-armeria' ? 'armeria' : 'botin';
      const antes = p.seConsigue;
      const ahora = valor === 'true' ? [...antes, donde] : antes.filter((d) => d !== donde);
      return { ...p, seConsigue: DONDE_SE_CONSIGUE.filter((d) => ahora.includes(d)) };
    }
    case 'hueco':
    case 'manos':
    case 'lanza':
    case 'guerra':
    case 'tiro':
    case 'recarga':
    case 'cargas':
      if (esPiezaConBase(p)) {
        throw new Error(
          `«${p.nombre}» está sobre otra: su hueco, sus manos, si es una lanza o de guerra y lo que tira son los de su base`,
        );
      }
      // Lo que tira (02-11-2026): con él, lo que exige (`enElHueco` pone su agilidad,
      // su recarga o sus cargas); sin él, un arco o una ballesta, sin nada de eso.
      if (campo === 'tiro') {
        const { tiro: _t, recarga: _r, cargas: _c, agilidad: _a, ...sin } = p;
        return valor === 'fuego' || valor === 'granada'
          ? enElHueco({ ...sin, tiro: valor }, p.hueco)
          : sin;
      }
      if (campo === 'recarga') return { ...p, recarga: n };
      if (campo === 'cargas') return { ...p, cargas: n };
      if (campo === 'manos') return { ...p, manos: n };
      if (campo === 'lanza') {
        const { lanza: _antes, ...sin } = p;
        return valor === 'true' ? { ...sin, lanza: true } : sin;
      }
      if (campo === 'guerra') {
        const { guerra: _antes, ...sin } = p;
        return valor === 'true' ? { ...sin, guerra: true } : sin;
      }
      // Lo que el hueco exige va con él (`enElHueco`): una pasada a escudo deja lo
      // que el escudo no suma, y un arma lleva su rueda sin pedirlo aparte.
      if (!esHuecoDePieza(valor)) throw new Error(`«${valor}» no es el hueco de una pieza`);
      return enElHueco(p, valor);
  }
  if (esPiezaConBase(p)) return { ...p, extras: conCifraDePieza(p.extras, campo, n) };
  return conLosExtras(p, conCifraDePieza(extrasDe(p), campo, n));
}

/**
 * Unos extras con la cifra `campo` de la ficha de una pieza a `n`: el precio en
 * oro, una cifra o el nivel de un tipo de la rueda
 * (`rueda-<tipo>`; con base, lo que sube el de la base).
 */
function conCifraDePieza(x: ExtrasDePieza, campo: string, n: number): ExtrasDePieza {
  if (campo.startsWith('rueda-')) {
    const tipo = campo.slice('rueda-'.length);
    if (!esTipoDelAnillo(tipo)) {
      throw new Error(`la ficha de la pieza no tiene una fila de la rueda «${tipo}»`);
    }
    return { ...x, rueda: { ...x.rueda, [tipo]: n } };
  }
  if (campo === 'precio-gold') return { ...x, oro: n };
  // Las cifras, las de la lista (`CIFRAS_DE_PIEZA`): escritas a mano aquí se quedó
  // fuera la agilidad de la montura (26-10-2026).
  if ((CIFRAS_DE_PIEZA as readonly string[]).includes(campo)) return { ...x, [campo]: n };
  throw new Error(`la ficha de la pieza no tiene un campo «${campo}»`);
}

/** Un campo de la ficha de la pieza: la pieza cambiada, si vale y no rompe a nadie. */
export function cambiarCampoDePieza(
  pagina: PaginaDeLaArena,
  el: Element,
  // Una casilla de marcar dice si está marcada; las demás, lo escrito.
  valor: string = (el as { type?: unknown }).type === 'checkbox'
    ? String(marcadoDe(el))
    : valorDe(el),
): void {
  const { catalogo } = pagina;
  const id = el.closest('[data-pieza-elegida]')?.getAttribute('data-pieza-elegida');
  const campo = el.getAttribute('data-arena-pieza-campo');
  if (id === null || id === undefined || campo === null) {
    throw new Error('un campo de pieza fuera de la ficha de una pieza');
  }
  try {
    const eq = catalogo.equipo;
    const nueva = validarPieza(conCampoDePieza(escritaDe(eq, id), campo, valor, eq));
    cambiarPiezas(
      pagina,
      id,
      nueva,
      `«${nueva.nombre}» cambiada: «Guardar» la escribe en data/equipo.json.`,
    );
  } catch (err) {
    noSeCambia(pagina, `${mensajeDe(err)}.`);
  }
}

/**
 * En plena pelea, un cambio entra antes en la batalla (`SesionDeArena.retocar`):
 * devuelve por qué no entra, y entonces no se escribe nada —ni el catálogo ni el
 * héroe—; `null` si ha entrado o si no hay pelea que retocar.
 */
function retocarLaPelea(pelea: EstadoDeLaPelea, r: RetoqueDeArena): string | null {
  return pelea.sesion === null ? null : pelea.sesion.retocar(r);
}

/**
 * El aviso de un cambio que no entra. Se guarda también aparte (`rechazado`):
 * el editor lo pinta en el color del rechazo mientras siga siendo el aviso.
 */
function noSeCambia(pagina: PaginaDeLaArena, motivo: string): void {
  const { vista, pelea } = pagina;
  // Con la mayúscula siempre: la sesión ya da el motivo como frase y lo que lanza
  // el validador empieza en minúscula (M3 de QA: salían de las dos maneras).
  vista.aviso = `No se cambia: ${motivo.charAt(0).toUpperCase()}${motivo.slice(1)}`;
  vista.rechazado = vista.aviso;
  // En plena pelea la barra de abajo es la de la sesión: se quedaba con el
  // «Cambiado: vale ya en esta pelea.» del cambio anterior, justo lo contrario
  // de lo que decía el editor (H5 de QA del ciclo 2).
  if (pelea.sesion !== null) pelea.sesion.status = vista.aviso;
}

/**
 * El aviso de un cambio que ha entrado: lo que dice el cambio y, en plena pelea,
 * lo que dice la sesión al retocar (`retocar`: si ha soltado algo).
 */
function avisoTrasCambio(pagina: PaginaDeLaArena, texto: string): void {
  const { vista, pelea } = pagina;
  vista.aviso = [texto, pelea.sesion === null ? '' : pelea.sesion.status]
    .filter((t) => t !== '')
    .join(' ');
}

/** Cambia el héroe de un lado, comprobado. */
export function cambiarHeroe(
  pagina: PaginaDeLaArena,
  lado: Lado,
  cambio: (h: HeroeDeArena) => HeroeDeArena,
): boolean {
  const { catalogo, montaje, pelea } = pagina;
  const h = montaje.heroes[lado];
  if (h === null) return true;
  try {
    const nuevo = validarHeroeDeArena(cambio(h));
    // Lo que lleva, con la regla de su ficha (sin arma de cuerpo a cuerpo no se
    // combate): fuera de la pelea no lo mira nadie más.
    heroeDeArena(nuevo, catalogo.equipo);
    const motivo = retocarLaPelea(pelea, { kind: 'heroe', lado, datos: nuevo });
    if (motivo !== null) {
      noSeCambia(pagina, motivo);
      return false;
    }
    montaje.heroes[lado] = nuevo;
    avisoTrasCambio(pagina, '');
    return true;
  } catch (err) {
    noSeCambia(pagina, `${mensajeDe(err)}.`);
    return false;
  }
}

/**
 * Una cifra del cuerpo de todo héroe (`hp`, los PV; `fuerza` o `agilidad`: la de un héroe
 * recién hecho): se comprueba con la regla de data/heroe.json y entra en los dos
 * héroes, también a media pelea; si uno la rechaza, el cuerpo de la página no cambia.
 */
function cambiarCuerpoDeTodoHeroe(
  pagina: PaginaDeLaArena,
  campo: 'hp' | 'fuerza' | 'agilidad',
  v: string,
): void {
  const { catalogo } = pagina;
  const n = v.trim() === '' ? Number.NaN : Number(v);
  const c = catalogo.cuerpoDeTodoHeroe;
  let nuevo: CuerpoDeTodoHeroe;
  try {
    nuevo = combateDelHeroe(
      campo === 'agilidad'
        ? { ...c, agilidad: n }
        : campo === 'hp'
          ? { ...c, pv: { ...c.pv, base: n } }
          : { ...c, fuerza: { ...c.fuerza, base: n } },
      'el cuerpo de todo héroe',
    );
  } catch (err) {
    noSeCambia(pagina, `${mensajeDe(err)}.`);
    return;
  }
  for (const lado of ['izquierda', 'derecha'] as const) {
    if (!cambiarHeroe(pagina, lado, (h) => ({ ...h, cuerpo: nuevo }))) return;
  }
  catalogo.cuerpoDeTodoHeroe = nuevo;
}

/** Aplica un cambio a la unidad de un tipo, validado: lo que no cuadra se dice y no entra. */
export function cambiarUnidad(
  pagina: PaginaDeLaArena,
  id: string,
  cambio: (u: Unidad) => unknown,
): void {
  const { catalogo, pelea } = pagina;
  try {
    const nueva = validarUnidad(cambio(unidadDe(catalogo, id)), catalogo.equipo);
    const motivo = retocarLaPelea(pelea, { kind: 'tipo', fuente: { unidad: nueva } });
    if (motivo !== null) {
      noSeCambia(pagina, motivo);
      return;
    }
    catalogo.unidadesDelCatalogo.set(id, nueva);
    catalogo.unidadesSinGuardar.add(id);
    avisoTrasCambio(pagina, '');
  } catch (err) {
    noSeCambia(pagina, `${mensajeDe(err)}.`);
  }
}

/** El nuevo valor de un campo de la ficha, en la unidad. Lo que es número lo valida el núcleo. */
function conCampo(u: Unidad, campo: string, valor: string): unknown {
  // Vacío es `NaN`, y el núcleo lo dice como «está vacío».
  const n = valor.trim() === '' ? Number.NaN : Number(valor);
  switch (campo) {
    case 'name':
      return { ...u, name: valor };

    case 'attack':
    case 'fuerza':
    case 'agilidad':
    case 'hp':
    case 'leadership':
      return { ...u, [campo]: n };
    default:
      throw new Error(`la ficha no tiene un campo «${campo}»`);
  }
}

/** El valor de un campo de formulario, sin nombrar su tipo del DOM. */
export function valorDe(el: Element): string {
  const v = (el as Element & { value?: unknown }).value;
  if (typeof v !== 'string') throw new Error('ese elemento no es un campo con valor');
  return v;
}

function marcadoDe(el: Element): boolean {
  return (el as Element & { checked?: unknown }).checked === true;
}

/**
 * Los cambios de la página, en el orden de siempre: las teclas del campo del nombre (en la
 * captura), el campo del nombre suelto y cada `change` (la complejidad de la pelea, un campo de
 * pieza, el nombre de la forma o un campo de una ficha). Eran tres oyentes de primer nivel de
 * `main.ts` hasta R8 de la reorganización (07-11-2026).
 */
export function instalarLosCambios(pagina: PaginaDeLaArena): void {
  const { montaje, vista, editorDeMuralla } = pagina;
  // Las teclas del campo del nombre: Intro lo guarda y Escape deja el de antes; en
  // los dos casos el campo se suelta y el título vuelve. Guardar es soltar el foco:
  // el `change` que dispara es el mismo de cualquier campo (`cambiarEnFicha`). Va
  // antes que las teclas de la pelea y las corta: en el editor de la batalla,
  // Escape cerraba el diálogo entero.
  document.addEventListener(
    'keydown',
    (ev) => {
      const el = campoDelNombre(ev.target);
      if (el === null) return;
      if (ev.key !== 'Enter' && ev.key !== 'Escape') return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      // Con el valor de antes, soltar el foco no dispara `change`: no se cambia nada.
      if (ev.key === 'Escape') el.value = el.defaultValue;
      el.blur();
    },
    { capture: true },
  );

  // El campo del nombre suelto: la ficha vuelve a su título. Se mira en la tarea
  // siguiente, no al soltarlo: un repintado de la ficha (otro gesto) sustituye el
  // campo y `pintar` le devuelve el foco al nuevo, y entonces se sigue renombrando.
  document.addEventListener('focusout', (ev) => {
    const el = campoDelNombre(ev.target);
    if (el === null) return;
    const clave = claveDelElemento(el);
    if (clave === null) return;
    setTimeout(() => {
      const ahora = campoDelNombre(document.activeElement);
      const sigue = ahora !== null && claveDelElemento(ahora) === clave;
      if (sigue || !vista.renombrando.delete(clave)) return;
      pedirRepintado(pagina, clave);
    }, 0);
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target as Element;
    // La complejidad de la pelea: no es de ninguna unidad.
    const delCombate = leerElCombate(el, montaje.combate);
    if (delCombate !== null) {
      cambiarElCombate(pagina, delCombate);
      return;
    }
    // Un campo de la ficha de una pieza (vista de equipo): no es de ninguna unidad.
    if (el.getAttribute('data-arena-pieza-campo') !== null) {
      cambiarCampoDePieza(pagina, el);
      pedirRepintado(pagina);
      return;
    }
    // El nombre de la forma no es de ninguna unidad: se apunta y nada más.
    if (el.getAttribute('data-muralla-nombre') !== null) {
      editorDeMuralla.nombreDeForma = valorDe(el);
      return;
    }
    // Escribe en la ficha que contiene el campo, no en `elegida`: en la edición hay
    // hasta cuatro. Lo que no está en una ficha no es de ninguna unidad.
    const ficha = fichaDelElemento(el);
    if (ficha !== null) cambiarEnFicha(pagina, ficha, el);
  });
}

/**
 * Cambia la complejidad de la pelea. Un tope que deja fuera a alguien no entra: lo
 * dice la regla del núcleo (`topeDelBandoBlocker`, la del montaje y el enlace), y
 * el selector vuelve a lo de antes (un montaje que no cabe no se puede ni enlazar).
 */
function cambiarElCombate(pagina: PaginaDeLaArena, nuevo: ReglasDelCombate): void {
  const { montaje, vista } = pagina;
  const noCabe = (['izquierda', 'derecha'] as const)
    .map((l) =>
      topeDelBandoBlocker(
        `El bando ${LADOS[l].adjetivo}`,
        montaje.puestos[l].length,
        montaje.heroes[l] !== null,
        nuevo.tope,
      ),
    )
    .find((motivo) => motivo !== null);
  if (noCabe !== undefined && noCabe !== null) {
    vista.aviso = `${noCabe} antes de bajar el tope a ${nuevo.tope}.`;
  } else {
    montaje.combate = nuevo;
    vista.aviso = `La pelea será con ${montaje.combate.tope} por bando y la rueda de ${montaje.combate.rueda}.`;
  }
  pedirRepintado(pagina);
}

/** Un campo, un rasgo o una habilidad de la ficha `ficha`, y su repintado. */
function cambiarEnFicha(pagina: PaginaDeLaArena, ficha: Elegida, el: Element): void {
  switch (ficha.kind) {
    case 'unidad':
      cambiarDeLaUnidad(pagina, ficha.id, el);
      break;
    case 'heroe':
      cambiarDelHeroe(pagina, ficha.lado, el);
      break;
    default: {
      const nunca: never = ficha;
      throw new Error(`una ficha de un tipo que no existe: ${JSON.stringify(nunca)}`);
    }
  }
  pedirRepintado(pagina, claveDeFicha(ficha));
}

/**
 * Los rasgos del motor de la ficha `f`, cambiados por `cambio` (añadir uno del
 * desplegable o quitar una etiqueta): su tipo en el catálogo. Lo que no vale lo
 * dice el mismo validador de siempre (`cambiarUnidad`).
 */
export function cambiarRasgos(
  pagina: PaginaDeLaArena,
  f: Elegida,
  cambio: (ts: readonly CreatureTrait[]) => readonly CreatureTrait[],
): void {
  switch (f.kind) {
    case 'unidad':
      cambiarUnidad(pagina, f.id, (u) => ({ ...u, traits: cambio(u.traits) }));
      return;
    case 'heroe':
      throw new Error('la ficha del héroe no lleva rasgos del motor');
  }
}

/** El rasgo elegido en el desplegable «Añadir» de los rasgos, al final de los puestos. */
function añadirRasgo(pagina: PaginaDeLaArena, f: Elegida, el: Element): void {
  const t = valorDe(el);
  if (t !== '') cambiarRasgos(pagina, f, (ts) => [...ts, t as CreatureTrait]);
}

/** Un campo de la ficha de una unidad: su tipo en el catálogo. */
function cambiarDeLaUnidad(pagina: PaginaDeLaArena, id: string, el: Element): void {
  const { catalogo } = pagina;
  const campo = el.getAttribute('data-campo');
  const hueco = el.getAttribute('data-arena-pieza');
  if (campo !== null) {
    cambiarUnidad(pagina, id, (u) => conCampo(u, campo, valorDe(el)));
  } else if (hueco !== null) {
    // Ponerle una pieza en ese hueco (un arma va también en la segunda): lo que no
    // se puede (un escudo con un arma a dos manos) lo dice el núcleo
    // (`manosBlocker`) y sale en la barra.
    if (!esHueco(hueco)) throw new Error(`«${hueco}» no es un hueco`);
    const puesta = valorDe(el);
    if (puesta !== '')
      cambiarUnidad(pagina, id, (u) => equiparEnArena(u, puesta, catalogo.equipo, hueco));
  } else if (el.getAttribute('data-arena-rasgo') !== null) {
    añadirRasgo(pagina, { kind: 'unidad', id }, el);
  } else if (el.getAttribute('data-arena-habilidad') !== null) {
    const h = valorDe(el);
    if (h !== '') cambiarUnidad(pagina, id, (u) => ({ ...u, habilidades: [...u.habilidades, h] }));
  } else if (el.getAttribute('data-arena-poder') !== null) {
    const h = valorDe(el);
    if (h !== '')
      cambiarUnidad(pagina, id, (u) => ({ ...u, hechizos: [...(u.hechizos ?? []), h] }));
  }
}

/** Un campo de la ficha del héroe. */
function cambiarDelHeroe(pagina: PaginaDeLaArena, lado: Lado, el: Element): void {
  const { catalogo } = pagina;
  const campo = el.getAttribute('data-heroe-campo');
  const hechizo = el.getAttribute('data-heroe-hechizo');
  const hueco = el.getAttribute('data-arena-pieza');
  if (hueco !== null) {
    // Ponerle una pieza, como a una unidad: lo que no se puede lo dice el núcleo.
    if (!esHueco(hueco)) throw new Error(`«${hueco}» no es un hueco`);
    const puesta = valorDe(el);
    if (puesta !== '')
      cambiarHeroe(pagina, lado, (h) => equiparEnArena(h, puesta, catalogo.equipo, hueco));
  } else if (campo === 'hp' || campo === 'fuerza' || campo === 'agilidad') {
    cambiarCuerpoDeTodoHeroe(pagina, campo, valorDe(el));
  } else if (campo !== null) {
    const v = valorDe(el);
    cambiarHeroe(pagina, lado, (h) => {
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
    cambiarHeroe(pagina, lado, (h) => ({
      ...h,
      hechizos: puesto
        ? hechizosQueValen(catalogo)
            .map((s) => s.id)
            .filter((id) => id === hechizo || h.hechizos.includes(id))
        : h.hechizos.filter((id) => id !== hechizo),
    }));
  }
}
