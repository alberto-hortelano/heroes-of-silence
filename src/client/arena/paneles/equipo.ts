/**
 * El editor de equipo de la arena (`renderEquipo`): el catálogo de piezas por tipo y
 * la ficha de la elegida con solo los campos de su hueco, su base, su precio, de dónde
 * se consigue y la rueda de un arma; y lo que dice «Guardar» (`guardadoEnPalabras`,
 * `sinGuardarEnPalabras`). Parte del marcado de la arena (`arena/paneles/`, puro y sin
 * DOM: ver `lista.ts`); era `arena/paneles.ts` hasta la fase C de la reorganización
 * (07-11-2026).
 */
import { baseDe, basesPosibles, cadenaDeBases, escritaDe } from '@core/arena/piezas.js';
import { DICHO_DEL_USO } from '@core/battle/armas.js';
import { DICHO_DE_LA_CARGA } from '@core/battle/carga.js';
import { NIVEL_MAXIMO, NORMAL_SIN_NIVEL } from '@core/battle/cifras-de-la-rueda.js';
import { NOMBRE_DE_GOLPE } from '@core/battle/formas-de-la-rueda.js';
import { filasDeLaRueda, ruedaDelArmaEnPalabras } from '@core/battle/rueda.js';
import type { CatalogoDeEquipo } from '@core/equipo/atado.js';
import { DICHO_DE_LA_MONTURA, textoDeModificador } from '@core/equipo/dicho.js';
import { aDosManos, esDeGuerra, esLanza, REGLA_DEL_ESCUDO } from '@core/equipo/manos.js';
import {
  ARMADURA_MAXIMA_DE_PIEZA,
  CARGAS_MAXIMAS,
  caeComoBotin,
  type ExtrasDePieza,
  esPiezaConBase,
  extrasDe,
  type Pieza,
  RECARGA_MAXIMA,
  RUTA_DEL_CATALOGO_DE_EQUIPO,
  SOLO_EN_KITS,
  seVende,
} from '@core/equipo/pieza.js';
import { tiroDelGolpe } from '@core/equipo/vestir.js';
import { RUTA_DEL_HEROE } from '@core/hero/cuerpo-del-heroe.js';
import { RUTA_DE_LOS_HECHIZOS } from '@core/magia/formato.js';
import { describirCoste } from '@core/texto.js';
import {
  type CifraDePieza,
  camposDelHueco,
  esArmaPorUso,
  type Hueco,
  type HuecoDePieza,
  NOMBRE_DE_CIFRA,
  NOMBRE_DE_HUECO,
  type TipoDelAnillo,
} from '@core/types.js';
import { AGILIDAD_DEL_CUERPO_MAX, AGILIDAD_DEL_CUERPO_MIN } from '@core/unidad/cuerpo.js';
import { ruedaDeLaPieza } from '../../batalla/rueda/disco.js';
import { DESHABILITADO, type Html, html, MARCADO, NADA, unir } from '../../comun/html.js';
import { filaDeCifra } from '../../views/cifras.js';
import { modificadoresEnPantalla, nota } from '../../views/notas.js';
import { type FilaDeCifra, tablaDeCifras } from './ficha.js';

/** Cómo dice «La llevan» de una pieza del equipo base del héroe (la Espada, el gambesón): todo héroe. */
export const LA_LLEVA_EL_HEROE = 'todo héroe (su equipo base)';

/** Lo que la vista «Editar equipo» enseña: lo da `main.ts`, que tiene las piezas y el catálogo. */
export interface VistaDeEquipo {
  /** El catálogo de equipo (`catalogoDeEquipo`), en su orden, resuelto y escrito. */
  readonly piezas: CatalogoDeEquipo;
  /** La pieza de la ficha, por su id, o `null`. */
  readonly elegida: string | null;
  /** Quiénes llevan la pieza `id`: las unidades del catálogo y, si es suya, el héroe (`LA_LLEVA_EL_HEROE`). */
  readonly llevan: (id: string) => readonly string[];
  /** El último rechazo, si sigue siendo el aviso: la ficha lo pinta en su color. */
  readonly rechazo: string | null;
  /** Si hay pelea en curso: el cambio vale ya en ella. */
  readonly enCombate: boolean;
  /** Lo que queda por guardar, en una frase, o vacío (`sinGuardarEnPalabras`). */
  readonly sinGuardar: string;
}

/**
 * Lo que queda por guardar dicho en una frase: «Sin guardar: 1 pieza y 2
 * unidades.», o vacío si nada. Lo leen la vista «Editar equipo» y la barra.
 */
export function sinGuardarEnPalabras(piezas: number, unidades: number, heroe = false): string {
  const partes = [
    piezas === 0 ? null : `${piezas} ${piezas === 1 ? 'pieza' : 'piezas'}`,
    unidades === 0 ? null : `${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}`,
    heroe ? 'el cuerpo del héroe' : null,
  ].filter((x) => x !== null);
  return partes.length === 0 ? '' : `Sin guardar: ${partes.join(' y ')}.`;
}

/**
 * Lo que dice el servidor al guardar (`escribirCatalogo`): dónde, cuántas unidades
 * y las que no valen y se conservan, y cuántas piezas (en `data/equipo.json`, que
 * se escribe entero o nada).
 */
export interface Guardado {
  readonly ruta?: string;
  readonly unidades?: number;
  readonly conservadas?: number;
  readonly piezas?: number;
  /** Si escribió el cuerpo de todo héroe en data/heroe.json. */
  readonly heroe?: boolean;
  /** Cuántos hechizos escribió en data/hechizos.json. */
  readonly hechizos?: number;
}

/**
 * Lo guardado dicho en una frase: «Guardado en …: 3 unidades. Y en …: 1 pieza.»,
 * con lo que no vale y se conserva tal cual. Junto a `sinGuardarEnPalabras`: son
 * las dos caras de «Guardar».
 */
export function guardadoEnPalabras(g: Guardado): string {
  const parte = (ruta: string | undefined, n: number, malas: number, una: string, varias: string) =>
    `en ${ruta}: ${n} ${n === 1 ? una : varias}${malas === 0 ? '' : `, y ${malas} que ${malas === 1 ? 'no vale, tal como estaba' : 'no valen, tal como estaban'}`}.`;
  const unidades = `Guardado ${parte(g.ruta, g.unidades ?? 0, g.conservadas ?? 0, 'unidad', 'unidades')}`;
  const piezas = g.piezas ?? 0;
  const conPiezas =
    piezas === 0
      ? unidades
      : `${unidades} Y ${parte(RUTA_DEL_CATALOGO_DE_EQUIPO, piezas, 0, 'pieza', 'piezas')}`;
  const conHeroe =
    g.heroe === true ? `${conPiezas} Y en ${RUTA_DEL_HEROE}: el cuerpo de todo héroe.` : conPiezas;
  const n = g.hechizos ?? 0;
  return n === 0
    ? conHeroe
    : `${conHeroe} Y en ${RUTA_DE_LOS_HECHIZOS}: ${n} ${n === 1 ? 'hechizo' : 'hechizos'}.`;
}

/**
 * Las secciones de «Editar equipo», por tipo (decisión del usuario, 18-10-2026:
 * «diferencia por tipo: armas, armadura, arma a distancia»): cada una con sus
 * huecos y aquel en que nace una «+ Nueva pieza». Cuerpo a cuerpo junta los huecos
 * que golpean en la rueda (`HUECOS_DE_CUERPO_A_CUERPO`). Entre todas, los seis.
 */
const SECCIONES_DE_EQUIPO: readonly {
  readonly id: string;
  readonly nombre: string;
  readonly huecos: readonly HuecoDePieza[];
  readonly nace: HuecoDePieza;
  readonly nota: string;
}[] = [
  {
    id: 'cuerpo',
    nombre: 'Cuerpo a cuerpo',
    huecos: ['arma'],
    nace: 'arma',
    nota: `${DICHO_DEL_USO.arma.cuando} ${DICHO_DE_LA_CARGA.cuando} Cada una cambia la rueda del golpe; una lanza es un arma más.`,
  },
  {
    id: 'distancia',
    nombre: 'A distancia',
    huecos: ['distancia'],
    nace: 'distancia',
    nota: DICHO_DEL_USO.distancia.cuando,
  },
  {
    id: 'armadura',
    nombre: 'Armadura',
    huecos: ['armadura'],
    nace: 'armadura',
    nota: 'Protege con armadura: puntos que se restan del daño de cada golpe, disparo o hechizo que recibe quien la lleva.',
  },
  {
    id: 'escudo',
    nombre: 'Escudo',
    huecos: ['escudo'],
    nace: 'escudo',
    nota: `Regla: ${REGLA_DEL_ESCUDO}.`,
  },
  {
    id: 'montura',
    nombre: 'Montura',
    huecos: ['montura'],
    nace: 'montura',
    nota: DICHO_DE_LA_MONTURA,
  },
];

/**
 * La vista «Editar equipo»: a la izquierda el catálogo de equipo por tipo
 * (`SECCIONES_DE_EQUIPO`), cada pieza con de dónde se consigue
 * (`dondeEnPantalla`), su base y lo que suma, y un «+ Nueva pieza» por tipo; a la
 * derecha, la ficha de la elegida. Sin reglas: lo que no vale lo dice el núcleo
 * (`validarPieza`, `cambioDePiezas`, `conBase`).
 */
export function renderEquipo(v: VistaDeEquipo): Html {
  const todas = [...v.piezas.piezas.values()];
  const secciones = unir(
    SECCIONES_DE_EQUIPO.map((sec) => {
      const suyas = todas.filter((p) => sec.huecos.includes(p.hueco));
      return html`<div class="hueco-de-equipo" data-seccion-de-equipo="${sec.id}">
        <h3 class="cabecera-hueco"><span>${sec.nombre} ${nota(sec.nota)}</span>
          <button class="boton-de-cabecera" data-arena="crear-pieza" data-hueco="${sec.nace}" title="Crea una pieza nueva de ${sec.nombre}, sin nada que sumar">+ Nueva pieza</button></h3>
        <div class="lista-de-piezas">${unir(suyas.map((p) => tarjetaDePieza(p, v)))}</div>
      </div>`;
    }),
  );
  const p = v.elegida === null ? null : v.piezas.piezaSiExiste(v.elegida);
  return html`<section class="equipo-lista">
      <h3>Piezas de equipo ${nota('El catálogo de equipo del juego (data/equipo.json): «Guardar» lo escribe, y lo que se guarda aquí es lo que se compra en la armería, cae como botín y lleva todo héroe. Una pieza puede ir sobre otra de su hueco: suma lo de su base más sus extras, y si cambia la base, cambia ella. Una unidad suma a sus cifras las de la pieza que lleva, y su nivel lo ve.')}</h3>
      ${v.sinGuardar === '' ? NADA : html`<p class="aviso-sin-guardar" role="status" data-sin-guardar="si">${v.sinGuardar}</p>`}
      ${secciones}
    </section>
    <section class="equipo-ficha">${
      p === null
        ? html`<h3>Pieza</h3><p class="cost">Elige una pieza de la lista para ver y cambiar sus cifras.</p>`
        : fichaDePieza(p, v)
    }</section>`;
}

/** Una pieza en la lista: su nombre, de dónde sale, su base y lo que suma; pulsarla la abre en la ficha. */
function tarjetaDePieza(p: Pieza, v: VistaDeEquipo): Html {
  const elegida = p.id === v.elegida;
  const base = baseDe(v.piezas, p.id);
  return html`<button class="pieza${elegida ? ' elegida' : ''}" data-arena="elegir-pieza" data-pieza="${p.id}" aria-pressed="${elegida ? 'true' : 'false'}">
      <span class="nombre">${p.nombre}</span>
      ${dondeEnPantalla(p)}
      ${base === null ? NADA : html`<span class="sobre-su-base" data-sobre="${base.id}">sobre ${base.nombre}</span>`}
      <span class="cost">${modificadoresEnPantalla(p)}</span>
      ${p.rueda === undefined ? NADA : html`<span class="cost rueda-del-arma">Rueda: ${ruedaDelArmaEnPalabras(p.rueda)}</span>`}
    </button>`;
}

/**
 * De dónde se consigue una pieza, como se pinta en la lista y en su ficha: un
 * sello por sitio («armería», «botín»), o «solo en kits» si de ninguno.
 */
function dondeEnPantalla(p: Pieza): Html {
  const sellos = [
    ...(seVende(p) ? [html` <span class="sello" data-se-consigue="armeria">armería</span>`] : []),
    ...(caeComoBotin(p) ? [html` <span class="sello" data-se-consigue="botin">botín</span>`] : []),
  ];
  return sellos.length === 0
    ? html`<span class="sello sello-solo-en-kits" data-se-consigue="ninguno" title="${SOLO_EN_KITS.charAt(0).toUpperCase()}${SOLO_EN_KITS.slice(1)}">solo en kits</span>`
    : unir(sellos);
}

/**
 * La ficha de una pieza: lo que suma (`modificadoresEnPantalla`), quién la lleva,
 * de dónde se consigue (dos casillas: se vende en la armería, cae como botín), su
 * base con la cadena dicha (`cadenaDeBases`) y, en una tabla, solo las cifras de su
 * tipo (`camposDelHueco`) más el precio en oro: con base, la casilla es el extra y
 * el final lo que suma de verdad (como la tabla de cifras de una unidad). Una de
 * cuerpo a cuerpo lleva la tabla «Rueda del golpe» (`filasDeLaRueda`). Botones:
 * Duplicar, Nueva sobre esta y Borrar. Cada campo lleva `data-arena-pieza-campo`,
 * que lee `main.ts`.
 */
function fichaDePieza(p: Pieza, v: VistaDeEquipo): Html {
  const eq = v.piezas;
  const escrita = escritaDe(eq, p.id);
  const extras = esPiezaConBase(escrita) ? escrita.extras : null;
  const campos = camposDelHueco(p.hueco);
  const hueco = filaDeCifra(html`Hueco${notaDelHueco(p.hueco)}`, NOMBRE_DE_HUECO[p.hueco]);
  // La lanza (25-10-2026): un arma de cuerpo a cuerpo que, montado, da la carga del
  // jinete. Una casilla, como «Se consigue»; con base, la de su base.
  const lanza = !campos.conManos
    ? NADA
    : extras === null
      ? html`<label class="casilla-de-marcar"><input type="checkbox" data-arena-pieza-campo="lanza" ${esLanza(p) ? MARCADO : NADA}> es una lanza ${nota(DICHO_DE_LA_CARGA.cuando)}</label>`
      : filaDeCifra(html`Lanza ${nota('La de su base.')}`, esLanza(p) ? 'Sí' : 'No');
  // De guerra o de silla (26-10-2026): una casilla, como la lanza; con base, la de su base.
  const guerra =
    p.hueco !== 'montura'
      ? NADA
      : extras === null
        ? html`<label class="casilla-de-marcar"><input type="checkbox" data-arena-pieza-campo="guerra" ${esDeGuerra(p) ? MARCADO : NADA}> de guerra ${nota(DICHO_DE_LA_MONTURA)}</label>`
        : filaDeCifra(html`De guerra ${nota('La de su base.')}`, esDeGuerra(p) ? 'Sí' : 'No');
  const tiro = tiroDelPanel(p, extras !== null);
  const cadena = cadenaDeBases(eq, p.id);
  const suBase = baseDe(eq, p.id);
  const base = html`<label class="campo"><span class="label">Base ${nota('Otra pieza de su hueco de la que parte: suma lo de la base más sus extras, y si cambia la base, cambia ella. Al cambiar de base se queda con lo que suma ahora.')}</span>
      <select data-arena-pieza-campo="base">
        <option value="" ${extras === null ? html`selected` : NADA}>ninguna (entera)</option>
        ${unir(
          basesPosibles(eq, p.id).map(
            (b) =>
              html`<option value="${b.id}" ${suBase?.id === b.id ? html`selected` : NADA}>${b.nombre}</option>`,
          ),
        )}
      </select></label>
      ${cadena.length > 1 ? html`<p class="cadena-de-bases" data-cadena-de-bases="si">${cadena.map((x) => x.nombre).join(' → ')}</p>` : NADA}`;
  const manos =
    campos.conManos && extras === null
      ? html`<label class="campo"><span class="label">Manos ${nota(`Regla: ${REGLA_DEL_ESCUDO}.`)}</span>
          <select data-arena-pieza-campo="manos">
            <option value="1" ${aDosManos(p) ? NADA : html`selected`}>Una mano</option>
            <option value="2" ${aDosManos(p) ? html`selected` : NADA}>Dos manos</option>
          </select></label>`
      : campos.conManos
        ? filaDeCifra(
            html`Manos ${nota('Las de su base.')}`,
            aDosManos(p) ? 'Dos manos' : 'Una mano',
          )
        : NADA;
  const llevan = v.llevan(p.id);
  const botones = html`<button data-arena="crear-pieza" title="Crea una pieza nueva igual que esta, con su base si la tiene">Duplicar</button>
      <button data-arena="crear-pieza-sobre" title="Crea una pieza nueva sobre esta: suma lo mismo y le pones extras; si esta cambia, cambia con ella">Nueva sobre esta</button>
      <button data-arena="retirar-pieza" title="La borra del catálogo; si una unidad o el héroe la lleva, o es la base de otra pieza, el núcleo te dirá qué hacer antes">Borrar</button>`;
  const marcada = (si: boolean): Html => (si ? MARCADO : NADA);
  const seConsigue = html`<div class="row se-consigue" data-se-consigue-de-la-ficha="si"><span class="label">Se consigue ${nota(`En la partida: la vende la armería, al precio de abajo, o cae como botín de asaltantes y ciudades neutrales. Sin ninguna, ${SOLO_EN_KITS}.`)}</span>
      <label class="casilla-de-marcar"><input type="checkbox" data-arena-pieza-campo="se-consigue-armeria" ${marcada(seVende(p))}> en la armería</label>
      <label class="casilla-de-marcar"><input type="checkbox" data-arena-pieza-campo="se-consigue-botin" ${marcada(caeComoBotin(p))}> como botín</label></div>`;
  return html`<div class="ficha ficha-de-pieza" data-pieza-elegida="${p.id}">
      <header class="titulo-de-ficha">
        <div class="nombre-de-ficha"><span class="nombre">${p.nombre}</span> ${dondeEnPantalla(p)}</div>
        <span class="subtitulo">Pieza · ${NOMBRE_DE_HUECO[p.hueco]} ${nota(`Del catálogo de equipo del juego (data/equipo.json): «Guardar» escribe lo que cambies.${v.enCombate ? ' En plena pelea: el cambio vale ya para todos los que la llevan (y las que están sobre ella), de los dos bandos, y lo gastado sigue gastado.' : ''}`)}</span>
      </header>
      ${v.rechazo === null ? NADA : html`<p class="aviso-de-pieza rechazo" role="status">${v.rechazo}</p>`}
      <div class="row resumen-de-pieza" data-resumen-de-pieza="si"><span class="label">Suma</span>${modificadoresEnPantalla(p, 'nada')}</div>
      ${filaDeCifra('Precio', describirCoste(p.precio))}
      <div class="row" data-la-llevan="si"><span class="label">La llevan</span><span>${llevan.length === 0 ? 'ninguna unidad del catálogo' : llevan.join(', ')}</span></div>
      ${seConsigue}
      <div class="botones">${botones}</div>
      <div class="cifras">
        <label class="campo nombre-de-pieza"><span class="label">Nombre</span>
          <input type="text" data-arena-pieza-campo="nombre" value="${p.nombre}"></label>
        ${hueco}
        ${base}
        ${manos}
        ${lanza}
        ${guerra}
        ${tiro}
        ${tablaDeCifras(
          extras === null
            ? { nombre: 'Suma', nota: 'Lo que suma a quien la lleva.' }
            : {
                nombre: 'Extra',
                nota: 'Lo que suma encima de su base; puede restar.',
              },
          extras === null
            ? 'Lo que suma a quien la lleva.'
            : 'Lo de su base más el extra: lo que suma a quien la lleva.',
          filasDePieza(p, extras),
        )}
        ${campos.conRueda ? tablaDeLaRueda(p, extras) : NADA}
      </div>
    </div>`;
}

/**
 * Una casilla de la ficha de una pieza: su campo (`data-arena-pieza-campo`, que
 * lee `main.ts`), su rótulo, de qué parte de lo que suma sale (`de`, sobre unos
 * extras: los de su base o lo que suma entera, `extrasDe`), su rango sin base y su
 * nota.
 */
interface CasillaDePieza {
  readonly campo: string;
  readonly rotulo: string;
  readonly de: (x: ExtrasDePieza) => number;
  readonly limites: { readonly minimo?: number; readonly maximo?: number };
  readonly nota?: string;
}

/** Las casillas de cada cifra que puede sumar una pieza (`camposDelHueco`). */
const CASILLAS_DE_LA_CIFRA: Readonly<
  Record<CifraDePieza, (hueco: Hueco) => readonly CasillaDePieza[]>
> = {
  ataque: () => [
    {
      campo: 'ataque',
      rotulo: NOMBRE_DE_CIFRA.ataque,
      de: (x) => x.ataque ?? 0,
      limites: { minimo: 0 },
    },
  ],
  fuerza: (hueco) => [
    hueco === 'montura'
      ? {
          campo: 'fuerza',
          rotulo: NOMBRE_DE_CIFRA.fuerza,
          de: (x) => x.fuerza ?? 0,
          limites: { minimo: 1 },
          nota: 'La de la montura, que no se suma a la de quien monta: lo que carga sin perder casillas (el equipo del jinete y ella) y, con una lanza, la que pone en la carga.',
        }
      : {
          campo: 'fuerza',
          rotulo: NOMBRE_DE_CIFRA.fuerza,
          de: (x) => x.fuerza ?? 0,
          limites: { minimo: 0 },
          nota: 'Lo que suma a la fuerza de quien la lleva para el daño de su golpe: de la fuerza al de la fuerza por la agilidad.',
        },
  ],
  agilidad: (hueco) => {
    // La lleva una montura (sus casillas) o un arma de fuego (su horquilla).
    const minimo = hueco === 'distancia' ? 1 : AGILIDAD_DEL_CUERPO_MIN;
    return [
      {
        campo: 'agilidad',
        rotulo: NOMBRE_DE_CIFRA.agilidad,
        de: (x) => x.agilidad ?? 0,
        limites: { minimo, maximo: AGILIDAD_DEL_CUERPO_MAX },
        nota:
          hueco === 'distancia'
            ? `La de un arma de fuego, de 1 a ${AGILIDAD_DEL_CUERPO_MAX}, que no se suma a la de quien la lleva: su disparo tira [F, F × esta agilidad], estrecho si es baja (con 1, siempre lo mismo).`
            : `La de la montura, de ${AGILIDAD_DEL_CUERPO_MIN} a ${AGILIDAD_DEL_CUERPO_MAX}: sus casillas, menos lo que le reste el peso que carga.`,
      },
    ];
  },
  defensa: () => [
    {
      campo: 'defensa',
      rotulo: NOMBRE_DE_CIFRA.defensa,
      de: (x) => x.defensa ?? 0,
      limites: { minimo: 0 },
    },
  ],
  armadura: () => [
    {
      campo: 'armadura',
      rotulo: NOMBRE_DE_CIFRA.armadura,
      de: (x) => x.armadura ?? 0,
      limites: { minimo: 0, maximo: ARMADURA_MAXIMA_DE_PIEZA },
      nota: `Puntos que se restan del daño de cada golpe, disparo o hechizo que recibe quien la lleva, con mínimo 0; hasta ${ARMADURA_MAXIMA_DE_PIEZA}.`,
    },
  ],
  peso: () => [
    {
      campo: 'peso',
      rotulo: NOMBRE_DE_CIFRA.peso,
      de: (x) => x.peso ?? 0,
      limites: { minimo: 0 },
      nota: 'Lo que pesa: lo puesto que pase de la fuerza de quien lo lleva le resta 1 de agilidad por cada fuerza entera, o parte, que la pase.',
    },
  ],
};

/**
 * Lo que tira una pieza a distancia en su ficha (02-11-2026): el desplegable «Tiro»
 * (arco o ballesta, arma de fuego o granada) y, según él, su recarga o sus cargas,
 * cada una con su nota. Con base, lo de su base, sin casillas: no son extras. Nada
 * fuera de `distancia`.
 */
function tiroDelPanel(p: Pieza, conBase: boolean): Html {
  if (p.hueco !== 'distancia') return NADA;
  const t = tiroDelGolpe(p);
  const notaDelTiro = nota(
    'Un arco o una ballesta dispara como siempre. Un arma de fuego dispara igual, pero perfora la armadura (llega entero), tira con su propia agilidad y recarga unos turnos tras disparar. Una granada no se dispara: se lanza a una casilla a la fuerza de quien la lleva y explota al empezar su siguiente turno en ella y sus vecinas, a quien esté; se gasta.',
  );
  const notaDeLaRecarga = nota(
    `Los turnos, de 1 a ${RECARGA_MAXIMA}, que pasa sin poder apuntar tras disparar, contando aquel en que sale el disparo: con 1, apunta un turno sí y otro no.`,
  );
  const notaDeLasCargas = nota(
    `Las que lleva a cada batalla, de 1 a ${CARGAS_MAXIMAS}: lanzar gasta una, y con 0 no se lanza. Fuera de batalla no se gastan.`,
  );
  if (conBase) {
    const dicho =
      t === undefined ? 'Arco o ballesta' : textoDeModificador({ kind: 'tiro', cual: t });
    return filaDeCifra(html`Tiro ${nota('El de su base, con su recarga o sus cargas.')}`, dicho);
  }
  const opcion = (valor: string, rotulo: string, si: boolean): Html =>
    html`<option value="${valor}" ${si ? html`selected` : NADA}>${rotulo}</option>`;
  const desplegable = html`<label class="campo"><span class="label">Tiro ${notaDelTiro}</span>
      <select data-arena-pieza-campo="tiro">
        ${opcion('', 'Arco o ballesta', t === undefined)}
        ${opcion('fuego', 'Arma de fuego', t?.kind === 'fuego')}
        ${opcion('granada', 'Granada', t?.kind === 'granada')}
      </select></label>`;
  const numero = (campo: string, rotulo: string, valor: number, maximo: number, n: Html): Html =>
    html`<label class="campo"><span class="label">${rotulo} ${n}</span>
      <input type="number" data-arena-pieza-campo="${campo}" value="${String(valor)}" min="1" max="${String(maximo)}"></label>`;
  return html`${desplegable}${
    t?.kind === 'fuego'
      ? numero('recarga', 'Recarga', t.recarga, RECARGA_MAXIMA, notaDeLaRecarga)
      : t?.kind === 'granada'
        ? numero('cargas', 'Cargas', t.cargas, CARGAS_MAXIMAS, notaDeLasCargas)
        : NADA
  }`;
}

/** La casilla del precio, la última de toda pieza: solo en oro. */
const PRECIO_EN_ORO: CasillaDePieza = {
  campo: 'precio-gold',
  rotulo: 'Precio en oro',
  de: (x) => x.oro ?? 0,
  limites: { minimo: 0 },
  nota: 'Lo que cuesta en la armería, solo en oro; la que cae como botín lo lleva igual.',
};

/**
 * Las filas de la tabla de una pieza: solo las cifras de su tipo
 * (`camposDelHueco`, `CASILLAS_DE_LA_CIFRA`) y el precio en oro. Sin base, la
 * casilla es lo que suma; con base (`extras`), lo que suma de más, y el final, lo
 * que suma resuelta.
 */
function filasDePieza(p: Pieza, extras: ExtrasDePieza | null): FilaDeCifra[] {
  const final = extrasDe(p);
  const escrito = extras ?? final;
  // A distancia, la agilidad solo la lleva un arma de fuego (`problemasDePieza`).
  const sinAgilidad = p.hueco === 'distancia' && tiroDelGolpe(p)?.kind !== 'fuego';
  const casillas = [
    ...camposDelHueco(p.hueco)
      .cifras.filter((c) => !(sinAgilidad && c === 'agilidad'))
      .flatMap((c) => CASILLAS_DE_LA_CIFRA[c](p.hueco)),
    PRECIO_EN_ORO,
  ];
  return casillas.map((c) => ({
    clave: c.campo,
    rotulo: c.rotulo,
    ...(c.nota === undefined ? {} : { nota: c.nota }),
    casilla: {
      atributo: html`data-arena-pieza-campo="${c.campo}"`,
      valor: c.de(escrito),
      // Un extra puede restar: lo que no vale lo dice la pieza resuelta.
      ...(extras === null ? c.limites : {}),
    },
    final: c.de(final),
  }));
}

/**
 * La barra de un nivel: siete muescas, del 0 al `NIVEL_MAXIMO`, llena desde la
 * izquierda hasta el nivel (0, vacía; 6, llena), en un SVG (el ancho es un
 * atributo: un `style` con un número no pasa por `html.ts`). La misma para toda
 * arma: el nivel es absoluto.
 */
function barraDelNivel(nivel: number): Html {
  const paso = 60 / NIVEL_MAXIMO;
  const muescas = unir(
    Array.from({ length: NIVEL_MAXIMO - 1 }, (_, i) => {
      const x = String(Math.round(paso * (i + 1) * 100) / 100);
      return html`<line class="muesca" x1="${x}" y1="0" x2="${x}" y2="10"/>`;
    }),
  );
  const ancho = String(Math.round(paso * nivel * 100) / 100);
  return html`<svg class="barra" data-nivel="${String(nivel)}" viewBox="0 0 60 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect class="pista" x="0" y="0" width="60" height="10"/>
      ${nivel <= 0 ? NADA : html`<rect class="relleno" x="0" y="1.5" width="${ancho}" height="7"/>`}
      ${muescas}
    </svg>`;
}

/**
 * La nota de la fila de un tipo: su nivel y, en Romper guardia y la Finta, lo que
 * da cada éxito (el nivel dice el del éxito máximo); en la Finta, además, que
 * subir es restar menos.
 */
function notaDelNivel(tipo: TipoDelAnillo, nivel: number, porExito: string | null): string {
  const exito =
    porExito === null
      ? ''
      : ` Del éxito mínimo al máximo: ${porExito}; el nivel dice el del máximo.`;
  const finta = tipo === 'finta' ? ' Subir es restar menos casillas.' : '';
  return `Nivel ${nivel} de ${NIVEL_MAXIMO}, el mismo en toda arma: 0 es lo peor y ${NIVEL_MAXIMO} lo mejor.${exito}${finta}`;
}

/**
 * «Rueda del golpe» de un arma de cuerpo a cuerpo (18-10-2026, vuelta 2: niveles
 * absolutos): un tipo del anillo por fila, una barra de 0 a 6 llena desde la
 * izquierda, con «−» (baja un nivel, peor) y «+» (sube, mejor; en la Finta, resta
 * menos casillas), sin pasar de 0 ni de 6, y lo que da su nivel al lado; Normal no
 * tiene fila (siempre ×1). Al lado, la rueda teñida por nivel, solo para leer
 * (`ruedaDeLaPieza`). La barra y el tinte son el nivel final (con su base); la
 * casilla, lo que se escribe: sin base, el nivel; con base, lo que lo sube o lo
 * baja sobre el de ella. Lo que da cada nivel, `filasDeLaRueda`, la misma cuenta
 * del golpe; si un nivel no vale, lo dice el núcleo.
 */
function tablaDeLaRueda(p: Pieza, extras: ExtrasDePieza | null): Html {
  if (p.rueda === undefined) {
    throw new Error(`«${p.nombre}» es un arma de cuerpo a cuerpo sin rueda`);
  }
  const filas = filasDeLaRueda(p.rueda);
  const barras = unir(
    filas.map((f) => {
      const nombre = NOMBRE_DE_GOLPE[f.tipo];
      const escrito = extras === null ? f.nivel : (extras.rueda?.[f.tipo] ?? 0);
      const limites = extras === null ? html`min="0" max="${String(NIVEL_MAXIMO)}"` : NADA;
      // El nivel no va en la fila sino en la barra y en lo que da: `pintar` busca
      // el botón pulsado con el teclado por los `data-*` de sus antepasados, y uno
      // que cambia a cada paso le perdía el foco (QA de la vuelta 2, H1).
      return html`<div class="barra-de-la-rueda" data-tipo="${f.tipo}">
        <span class="rotulo">${nombre} ${nota(notaDelNivel(f.tipo, f.nivel, f.porExito), false)}</span>
        <button class="paso" data-arena="paso-de-rueda" data-tipo="${f.tipo}" data-sentido="-1" aria-label="${nombre}: un nivel menos" ${f.nivel <= 0 ? DESHABILITADO : NADA}>−</button>
        ${barraDelNivel(f.nivel)}
        <button class="paso" data-arena="paso-de-rueda" data-tipo="${f.tipo}" data-sentido="1" aria-label="${nombre}: un nivel más" ${f.nivel >= NIVEL_MAXIMO ? DESHABILITADO : NADA}>+</button>
        <input type="number" step="1" ${limites} data-arena-pieza-campo="rueda-${f.tipo}" value="${escrito}" aria-label="${nombre}: ${extras === null ? `nivel, de 0 a ${NIVEL_MAXIMO}` : 'niveles que sube o baja sobre su base'}">
        <output class="final" data-final="rueda-${f.tipo}" data-nivel="${String(f.nivel)}">${f.final}</output>
      </div>`;
    }),
  );
  return html`<h4>Rueda del golpe ${nota(`El nivel del arma en cada tipo de la rueda (solo con «Golpe: rueda»), de 0 (izquierda, lo peor) a ${NIVEL_MAXIMO} (derecha, lo mejor), el mismo en toda arma. ${NORMAL_SIN_NIVEL}. La casilla es ${extras === null ? 'el nivel' : 'lo que sube o baja el de su base; la barra, el nivel con ella'}. Cada golpe va con su arma: la lanza en el primero de una carga; esta en los demás y en el contraataque.`)}</h4>
    <div class="rueda-del-arma" data-rueda-de-la-pieza="si">
      <div class="barras-de-la-rueda">${barras}</div>
      ${ruedaDeLaPieza(filas)}
    </div>`;
}

/**
 * La nota del hueco de una pieza: la regla del escudo en el escudo, y en un hueco
 * de arma cuándo se usa (`DICHO_DEL_USO`); en los demás, nada.
 */
function notaDelHueco(hueco: Hueco): Html {
  if (hueco === 'escudo') return html` ${nota(`Regla: ${REGLA_DEL_ESCUDO}.`)}`;
  if (hueco === 'montura') return html` ${nota(DICHO_DE_LA_MONTURA)}`;
  if (hueco !== 'arma' && !esArmaPorUso(hueco)) return NADA;
  return html` ${nota(DICHO_DEL_USO[hueco].cuando)}`;
}
