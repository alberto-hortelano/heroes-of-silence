/**
 * Lo que hace un hechizo, dicho en una frase y generado de sus datos: lo leen el
 * editor de la arena («Lo que hace»), el libro del héroe, la ficha y el agente
 * (`spell_list`). La descripción la escribe quien lo crea; esto lo escribe el
 * formato, así que no miente.
 */
import { conPlural } from '../texto.js';
import {
  type Afecta,
  type Cantidad,
  type Duracion,
  type Efecto,
  esDiferido,
  type Hechizo,
  type Impedible,
  rinde,
  type SeAcabaSiMuere,
  VOCABULARIO_DE_LA_MAGIA,
} from './formato.js';

/** Una cantidad dicha: con el poder, el número; sin él, «30 + 30 por poder». */
function dichoDeCantidad(c: Cantidad, poder?: number): string {
  if (typeof c === 'number') return String(c);
  if (poder !== undefined) return String(rinde(c, poder));
  if (c.porPoder === 0) return String(c.base);
  return c.base === 0 ? `${c.porPoder} por poder` : `${c.base} + ${c.porPoder} por poder`;
}

const DE_QUIEN = {
  afectado: 'quien lo recibe',
  lanzador: 'quien lo lanzó',
  portador: 'quien lo lleva',
};

/** «durante 3 rondas», «hasta que empiece el próximo turno de quien lo lanzó», «toda la pelea». */
function dichoDeDuracion(d: Duracion, poder?: number): string {
  if (d === 'pelea') return 'toda la pelea';
  if ('rondas' in d) {
    if (d.rondas === 'poder') {
      return poder === undefined
        ? 'tantas rondas como poder mágico'
        : enRondas(Math.max(1, poder), 'durante ');
    }
    return enRondas(d.rondas, 'durante ');
  }
  const verbo = d.hasta === 'empezar' ? 'empiece' : 'termine';
  return `hasta que ${verbo} el próximo turno de ${DE_QUIEN[d.turnoDe]}`;
}

function enRondas(n: number, antes: string): string {
  return `${antes}${conPlural(n, 'ronda')}`;
}

/** «no puede golpear ni disparar». */
export function dichoDeImpide(que: readonly Impedible[]): string {
  const verbos = que.map((q) => (q === 'lanzar' ? 'lanzar ni usar poderes' : q));
  if (verbos.length === 1) return `no puede ${verbos[0]}`;
  return `no puede ${verbos.slice(0, -1).join(', ')} ni ${verbos[verbos.length - 1]}`;
}

/** Un efecto dicho, sin su duración. */
export function dichoDelEfecto(e: Efecto, poder?: number): string {
  switch (e.tipo) {
    case 'danio':
      return `${dichoDeCantidad(e.cantidad, poder)} de daño${e.armadura ? '' : ' sin armadura'}`;
    case 'cura':
      return `cura ${dichoDeCantidad(e.cantidad, poder)} PV`;
    case 'disipar':
      return `quita ${VOCABULARIO_DE_LA_MAGIA.disipar[e.de]}`;
    case 'cifra':
      return `${e.cifra} ${e.valor > 0 ? '+' : ''}${e.valor}`;
    case 'impide':
      return dichoDeImpide(e.que);
    case 'escudo':
      return `escudo de ${dichoDeCantidad(e.absorbe, poder)}`;
    case 'disparador': {
      const a =
        e.a === 'alrededor'
          ? `a ${losQue(e.afecta ?? 'todos')} a ${e.radio ?? 1} ${e.radio === 1 ? 'casilla' : 'casillas'}`
          : e.a === 'otro'
            ? e.cuando === 'alGolpear'
              ? 'al golpeado'
              : 'a quien le golpeó'
            : VOCABULARIO_DE_LA_MAGIA.aQuien[e.a];
      const cuando = `${VOCABULARIO_DE_LA_MAGIA.cuando[e.cuando]}${e.yAlLanzarse === true ? ' (y al lanzarse)' : ''}`;
      const hace = e.efectos.map((x) => dichoDelEfecto(x, poder)).join(', ');
      const dura = e.duracion === undefined ? '' : ` ${dichoDeDuracion(e.duracion, poder)}`;
      const cargas =
        e.cargas === undefined ? '' : ` (${e.cargas} ${e.cargas === 1 ? 'vez' : 'veces'})`;
      return `${cuando}, ${a}: ${hace}${dura}${seAcaba(e.seAcabaSiMuere)}${cargas}`;
    }
    case 'levantar': {
      const de = Object.entries(e.de ?? {}).map(
        ([cae, sale]) => `; del de ${porSuId(cae)}, ${porSuId(sale)}`,
      );
      return `levanta ${porSuId(e.vivos)} del cadáver de un vivo${de.join('')}; de otro no-muerto o del héroe, nada`;
    }
  }
}

/**
 * Una unidad dicha por su id («esqueleto-guerrero» → «esqueleto guerrero»), y no por
 * su nombre del catálogo: `magia/` no lee el catálogo de unidades, que llega aquí
 * por `battle/effects.ts` (`unidad/nivel.ts` → `battle/armas.ts`) y cerraría un ciclo
 * de importación; y la arena levanta con lo que hay en la pelea, que puede no ser el
 * catálogo guardado.
 */
function porSuId(id: string): string {
  return id.replace(/-/g, ' ');
}

function seAcaba(s: SeAcabaSiMuere | undefined): string {
  if (s === undefined) return '';
  return s === 'lanzador'
    ? ', o hasta que caiga quien lo lanzó'
    : ', o hasta que caiga quien lo lleva';
}

/** «los aliados», «los enemigos», «todos». */
function losQue(a: Afecta): string {
  return a === 'todos' ? 'todos' : `los ${a}`;
}

const OBJETIVO_DICHO = {
  aliado: 'un aliado',
  enemigo: 'un enemigo',
  cualquiera: 'una unidad',
  casilla: 'una casilla',
  cadaver: 'un cadáver',
};

/** A dónde va, dicho: «a un enemigo a 5 casillas o menos y a los de alrededor». */
function dichoDelAlcance(h: Hechizo): string {
  const e = h.entrega;
  const obj = h.objetivo === undefined ? '' : OBJETIVO_DICHO[h.objetivo];
  const area = h.area ?? 0;
  let donde: string;
  switch (e.tipo) {
    case 'libre':
      donde = `a ${obj} del tablero`;
      break;
    case 'sobreSi':
      donde = 'sobre quien lo lanza';
      break;
    case 'contacto':
      donde = `a ${obj} pegado a quien lo lanza`;
      break;
    case 'alcance':
      donde = `a ${obj} a ${conPlural(e.casillas, 'casilla')} o menos`;
      break;
    case 'proyectil':
      donde =
        area === 'recta'
          ? `en recta hacia una casilla, a ${h.afecta === 'todos' ? 'todos' : `todos ${losQue(h.afecta ?? 'todos')}`} de la recta`
          : `en recta hacia una casilla, al primero que encuentre${e.casillas === undefined ? '' : ` (hasta ${e.casillas} casillas)`}`;
      break;
    case 'tablero':
      donde = `a ${h.afecta === 'todos' ? 'todos' : `todos ${losQue(h.afecta ?? 'todos')}`} del tablero`;
      break;
  }
  if (typeof area === 'number' && area > 0) {
    donde += `, y a ${losQue(h.afecta ?? 'todos')} a ${conPlural(area, 'casilla')} de allí`;
  } else if (h.objetivo === 'casilla' && e.tipo !== 'proyectil') {
    donde += ` (a ${losQue(h.afecta ?? 'todos')})`;
  } else if (e.tipo === 'proyectil' && area !== 'recta' && h.afecta !== 'todos') {
    donde += ` (si es de ${losQue(h.afecta ?? 'todos')})`;
  }
  if (esDiferido(h)) donde += '; cae al empezar el siguiente turno de quien lo lanza';
  return donde;
}

/**
 * Lo que hace el hechizo, en una frase: a dónde, qué y cuánto dura. Con `poder`,
 * las cifras ya calculadas con el poder mágico de quien lo lanza.
 */
export function queHaceElHechizo(h: Hechizo, poder?: number): string {
  const hace = h.efectos.map((e) => dichoDelEfecto(e, poder)).join('; ');
  const dura =
    h.duracion === undefined
      ? ''
      : `, ${dichoDeDuracion(h.duracion, poder)}${seAcaba(h.seAcabaSiMuere)}`;
  const frase = `${dichoDelAlcance(h)}: ${hace}${dura}`;
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

/**
 * Cómo se dice un hechizo que usa una unidad como poder (sin poder mágico): el que
 * solo cura, con lo que cura («Curar (12 PV)»; S9 de la morada: decía «Curar»); los
 * demás, por su nombre. Lo leen la ficha de la morada y la de la arena.
 */
export function nombreDelPoder(h: Hechizo): string {
  let total = 0;
  for (const e of h.efectos) {
    if (e.tipo !== 'cura') return h.nombre;
    total += rinde(e.cantidad, 0);
  }
  return `${h.nombre} (${total} PV)`;
}
