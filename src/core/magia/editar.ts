/**
 * Lo que hace el editor de magia de la arena con un hechizo, puro y sin la página:
 * uno nuevo, una copia, cambiar un campo por su ruta («efectos.0.cantidad»), poner
 * o quitar un efecto y cambiar la entrega con lo que pide. Ninguna de estas
 * funciones valida: lo que deja se juzga con `problemasDelHechizo`, que la ficha
 * enseña entero. Así el editor puede pasar por estados a medias (un disparador sin
 * efectos todavía) y decir qué falta.
 */
import {
  type Efecto,
  type Hechizo,
  INSTANTANEOS,
  type TipoDeEfecto,
  type TipoDeEntrega,
} from './formato.js';

/** Un efecto recién puesto de `tipo`, con valores que valen. */
export function efectoNuevo(tipo: TipoDeEfecto): Efecto {
  switch (tipo) {
    case 'danio':
      return { tipo, cantidad: 10, armadura: true };
    case 'cura':
      return { tipo, cantidad: 10 };
    case 'disipar':
      return { tipo, de: 'contrarios' };
    case 'cifra':
      return { tipo, cifra: 'ataque', valor: 1 };
    case 'impide':
      return { tipo, que: ['moverse'] };
    case 'escudo':
      return { tipo, absorbe: 10 };
    case 'disparador':
      return {
        tipo,
        cuando: 'empezarSuTurno',
        a: 'portador',
        efectos: [{ tipo: 'danio', cantidad: 5, armadura: false }],
      };
  }
}

/** Un id libre a partir de `base` («hechizo», «hechizo_2»…). */
export function idLibre(base: string, ocupados: ReadonlySet<string>): string {
  if (!ocupados.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}_${n}`;
    if (!ocupados.has(id)) return id;
  }
}

/** Un nombre libre a partir de `base` («Hechizo nuevo», «Hechizo nuevo 2»…). */
export function nombreLibre(base: string, ocupados: ReadonlySet<string>): string {
  if (!ocupados.has(base)) return base;
  for (let n = 2; ; n++) {
    const nombre = `${base} ${n}`;
    if (!ocupados.has(nombre)) return nombre;
  }
}

/** Un hechizo nuevo que vale: libre a un enemigo, 10 de daño, sin gremio. */
export function hechizoNuevo(lista: readonly Hechizo[]): Hechizo {
  return {
    id: idLibre('hechizo', new Set(lista.map((h) => h.id))),
    nombre: nombreLibre('Hechizo nuevo', new Set(lista.map((h) => h.nombre))),
    descripcion: 'Describe aquí lo que hace.',
    mana: 3,
    gremio: null,
    entrega: { tipo: 'libre' },
    objetivo: 'enemigo',
    efectos: [efectoNuevo('danio')],
  };
}

/** Una copia de `h` con otro id y otro nombre. */
export function copiaDe(h: Hechizo, lista: readonly Hechizo[]): Hechizo {
  return {
    ...h,
    id: idLibre(`${h.id}_copia`, new Set(lista.map((x) => x.id))),
    nombre: nombreLibre(`${h.nombre} (copia)`, new Set(lista.map((x) => x.nombre))),
  };
}

type Valor = unknown;

/** El objeto o la lista de `o` en `clave`, copiado (o `undefined` si no hay). */
function hijo(o: unknown, clave: string): unknown {
  if (Array.isArray(o)) return o[Number(clave)];
  if (typeof o === 'object' && o !== null) return (o as Record<string, unknown>)[clave];
  return undefined;
}

/** `o` con `valor` en la ruta `partes` (copias en el camino; `undefined` quita la clave). */
function poner(o: unknown, partes: readonly string[], valor: Valor): unknown {
  const [clave, ...resto] = partes;
  if (clave === undefined) return valor;
  const nuevo = resto.length === 0 ? valor : poner(hijo(o, clave), resto, valor);
  if (Array.isArray(o)) {
    const copia = [...o];
    const i = Number(clave);
    if (nuevo === undefined) copia.splice(i, 1);
    else copia[i] = nuevo;
    return copia;
  }
  const base = typeof o === 'object' && o !== null ? (o as Record<string, unknown>) : {};
  const { [clave]: _fuera, ...sin } = base;
  return nuevo === undefined ? sin : { ...sin, [clave]: nuevo };
}

/**
 * `h` con `valor` en la ruta (`"mana"`, `"entrega.casillas"`, `"efectos.1.cifra"`,
 * `"efectos.0.efectos.0.cantidad"`); `undefined` quita el campo o el elemento. No
 * valida: lo juzga `problemasDelHechizo`.
 */
export function conCampo(h: Hechizo, ruta: string, valor: Valor): Hechizo {
  return poner(h, ruta.split('.'), valor) as Hechizo;
}

/** Lo que hay en la ruta de `h`. */
export function campoDe(h: Hechizo, ruta: string): unknown {
  return ruta.split('.').reduce<unknown>((o, k) => hijo(o, k), h);
}

/** `h` con un efecto nuevo de `tipo` al final de la lista de la ruta (`"efectos"`, `"efectos.0.efectos"`). */
export function conEfecto(h: Hechizo, ruta: string, tipo: TipoDeEfecto): Hechizo {
  const lista = campoDe(h, ruta);
  const antes = Array.isArray(lista) ? lista : [];
  let conEl = conCampo(h, ruta, [...antes, efectoNuevo(tipo)]);
  // Lo que dura pide duración: se le pone una si no la tiene, para que valga.
  if (!INSTANTANEOS.includes(tipo)) {
    const dueño = ruta.split('.').slice(0, -1).join('.');
    const dRuta = dueño === '' ? 'duracion' : `${dueño}.duracion`;
    if (campoDe(conEl, dRuta) === undefined) conEl = conCampo(conEl, dRuta, { rondas: 2 });
  }
  return conEl;
}

/** `h` con el efecto de la ruta cambiado a uno nuevo de `tipo` (sus valores de partida). */
export function conTipoDeEfecto(h: Hechizo, ruta: string, tipo: TipoDeEfecto): Hechizo {
  return conCampo(h, ruta, efectoNuevo(tipo));
}

/**
 * `h` con otra entrega, con lo que pide: sobre sí y al tablero no eligen nada; un
 * proyectil se apunta a una casilla y afecta a alguien; a x casillas lleva su
 * alcance. Lo demás se queda (y si no casa, lo dice la validación).
 */
export function conEntrega(h: Hechizo, tipo: TipoDeEntrega): Hechizo {
  const { objetivo: _o, afecta: _a, area: _ar, ...sin } = h;
  switch (tipo) {
    case 'sobreSi':
      return { ...sin, entrega: { tipo } };
    case 'tablero':
      return { ...sin, entrega: { tipo }, afecta: h.afecta ?? 'enemigos' };
    case 'proyectil':
      return { ...sin, entrega: { tipo }, objetivo: 'casilla', afecta: h.afecta ?? 'enemigos' };
    case 'alcance':
      return {
        ...h,
        objetivo: h.objetivo ?? 'enemigo',
        entrega: { tipo, casillas: 4 },
      };
    case 'libre':
    case 'contacto':
      return { ...h, objetivo: h.objetivo ?? 'enemigo', entrega: { tipo } };
  }
}
