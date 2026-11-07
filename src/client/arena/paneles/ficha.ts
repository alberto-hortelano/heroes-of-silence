/**
 * La ficha de una unidad o de un héroe de la arena (`renderFicha`,
 * `renderFichaDeHeroe`), una sola disposición en el montaje, la edición y el combate:
 * la figura, la tabla de cifras con su final (`tablaDeCifras`), el equipo, las armas y
 * los rasgos. Parte del marcado de la arena (`arena/paneles/`, puro y sin DOM: ver
 * `lista.ts`); era `arena/paneles.ts` hasta la fase C de la reorganización
 * (07-11-2026).
 */
import { lecturaDelNivel } from '@core/arena/ficha.js';
import {
  CIFRA_MAXIMA_DE_HEROE,
  fichaDeHeroeDeArena,
  type HeroeDeArena,
} from '@core/arena/heroe.js';
import { LADOS, type Lado } from '@core/arena/lados.js';
import { opcionesDelHueco, quitarBlocker } from '@core/arena/piezas.js';
import { armaduraDe, DICHO_DEL_USO, SIN_ARMA } from '@core/battle/armas.js';
import { DICHO_DE_LA_CARGA, dichoDeLasCifras } from '@core/battle/carga.js';
import { armasDe } from '@core/battle/damage.js';
import { enRondas } from '@core/battle/effects.js';
import type { EquipoAtado } from '@core/equipo/atado.js';
import { cifrasDePieza, DICHO_DE_LA_MONTURA } from '@core/equipo/dicho.js';
import { REGLA_DEL_ESCUDO } from '@core/equipo/manos.js';
import { idsPuestos } from '@core/equipo/vestir.js';
import { EQUIPO_BASE } from '@core/hero/cuerpo-del-heroe.js';
import {
  catalogoDeHechizos,
  HECHIZOS_DEL_JUEGO,
  nombreDeHechizo,
  todosLosHechizos,
} from '@core/magia/catalogo.js';
import { nombreDelPoder, queHaceElHechizo } from '@core/magia/dicho.js';
import type { Hechizo } from '@core/magia/formato.js';
import { problemasComoPoder } from '@core/magia/validar.js';
import { conComa } from '@core/texto.js';
import {
  CREATURE_TRAITS,
  type CreatureTrait,
  HUECOS,
  NOMBRE_DE_CIFRA,
  NOMBRE_DE_FACCION,
  NOMBRE_DE_HUECO,
  NOMBRE_DE_RASGO,
  SPEED_TO_HEXES,
  type UnitInfo,
  type UsoDeArma,
} from '@core/types.js';
import { costeDeUnaUnidad } from '@core/unidad/catalogo.js';
import {
  AGILIDAD_DEL_CUERPO_MAX,
  AGILIDAD_DEL_CUERPO_MIN,
  agilidadDe,
  CASILLAS_MAX,
  marchaDe,
  montadoDeGuerra,
  restaALaMontura,
  restaDelPesoDe,
} from '@core/unidad/cuerpo.js';
import {
  cuerpoDeCombate,
  HABILIDADES,
  type Unidad,
  unidadDeCombate,
} from '@core/unidad/formato.js';
import { type Html, html, MARCADO, NADA, unir } from '../../comun/html.js';
import { filaDeCifra } from '../../views/cifras.js';
import { modificadoresEnPantalla, nota } from '../../views/notas.js';
import { claveDeFicha } from '../edicion.js';
import { FIGURA_GENERICA, figuraEnLienzo } from './bandos.js';

/**
 * Dónde se enseña una ficha: en el montaje, con su figura animada y valiendo para
 * la pelea siguiente; o en el editor de la batalla (`enCombate`), sin figura
 * —la del tablero ya se ve— y valiendo ya.
 */
export interface ComoDeLaFicha {
  readonly enCombate: boolean;
  /** El catálogo de equipo de la arena (`catalogoDeEquipo`): con él se suma el equipo y se ofrece. */
  readonly piezas: EquipoAtado;
  /**
   * Si su título es el campo del nombre (tras pulsar «✎ Editar»): lo pone
   * `main.ts` por la clave de la ficha, y sin él el nombre se lee y no se escribe.
   */
  readonly renombrando?: boolean;
  /**
   * Los hechizos de la página que valen (el editor de magia): el libro del héroe y
   * los poderes de una unidad se eligen de ellos. Sin ellos, los del juego.
   */
  readonly hechizos?: readonly Hechizo[];
}

/** La ficha del montaje, con las piezas que tiene puestas y los hechizos de la página. */
export function enElMontaje(piezas: EquipoAtado, hechizos?: readonly Hechizo[]): ComoDeLaFicha {
  return { enCombate: false, piezas, ...(hechizos === undefined ? {} : { hechizos }) };
}

/**
 * Lo que dice la ficha al pie en el editor de la batalla: a quién alcanza el
 * cambio y qué pasa con lo gastado (`retocarEnBatalla`).
 */
export const CAMBIO_EN_COMBATE =
  'En plena pelea: el cambio vale ya para todas las de este tipo en el campo, de los dos bandos, y para la pelea siguiente. Lo gastado sigue gastado: la herida y el maná que ya se fueron se restan de las cifras nuevas (subir la vida no cura). La velocidad nueva cuenta en el orden desde la ronda siguiente y la moral no cambia. La figura del héroe solo se cambia en el montaje.';

/**
 * El título de una ficha: el nombre de lo que enseña y, debajo, qué es. Si el
 * nombre se cambia (`campo`: el atributo con el que lo lee `main.ts`), lleva su
 * botón «✎ Editar» (`renombrar`), y renombrando (`como.renombrando`) el nombre
 * es ese campo. Es el único sitio donde se escribe el nombre: entre las cifras
 * no va (12-10-2026, el usuario: «quita el nombre de las características y pon
 * un botón de editar en el nombre de arriba»).
 */
function tituloDeFicha(
  nombre: string,
  subtitulo: string,
  como: ComoDeLaFicha,
  campo: Html | null,
  notaDelPie: string | null,
): Html {
  const nombreDicho =
    campo !== null && como.renombrando === true
      ? html`<input type="text" class="renombrar" ${campo} value="${nombre}" aria-label="Nombre" title="Intro lo guarda; Escape deja el de antes">`
      : html`<span class="nombre">${nombre}</span>${
          campo === null
            ? NADA
            : html`<button class="boton-de-cabecera" data-arena="renombrar" title="Cambiar el nombre" aria-label="Cambiar el nombre de ${nombre}">✎ Editar</button>`
        }`;
  return html`<header class="titulo-de-ficha">
      <div class="nombre-de-ficha">${nombreDicho}</div>
      <span class="subtitulo">${subtitulo}${notaDelPie === null ? NADA : html` ${nota(notaDelPie)}`}</span>
    </header>`;
}

/**
 * La parte de arriba de una ficha. En el montaje y en la edición, a la izquierda
 * la figura animada, a su lado sus clips en columna (`clips`, más «Girar» y
 * `siempre`) y a la derecha las cifras (`cifras`); si la columna es estrecha, las
 * cifras bajan (`arena.css`). En el editor de la batalla, sin figura —la del
 * tablero ya se ve—: las cifras a todo el ancho y, encima, `siempre` (volver a
 * las del catálogo), lo único de la columna que vale también allí.
 */
function cabezaDeFicha(o: {
  readonly figura: string;
  readonly como: ComoDeLaFicha;
  readonly clips: Html;
  readonly siempre?: Html;
  readonly cifras: Html;
}): Html {
  const siempre = o.siempre ?? NADA;
  if (o.como.enCombate) {
    return html`<div class="cabeza sin-retrato">
      ${siempre === NADA ? NADA : html`<div class="botones">${siempre}</div>`}
      <div class="cifras">${o.cifras}</div>
    </div>`;
  }
  return html`<div class="cabeza">
      <div class="retrato">
        ${figuraEnLienzo(o.figura, null, 'ficha')}
        <div class="clips">
          ${o.clips}
          <button data-arena="girar" title="Pasa la figura por sus ocho direcciones">Girar</button>
          ${siempre}
        </div>
      </div>
      <div class="cifras">${o.cifras}</div>
    </div>`;
}

/**
 * Una etiqueta con su ×: una habilidad o un rasgo puesto. `quitar`, los
 * atributos del botón que lo quita.
 */
function etiquetaConQuitar(texto: string, quitar: Html, detras: Html = NADA): Html {
  return html`<span class="etiqueta">${texto}${detras === NADA ? NADA : html` ${detras}`} <button ${quitar} title="Quitar" aria-label="Quitar ${texto}">×</button></span>`;
}

/**
 * Adónde va el foco al quitar con el teclado la etiqueta `quitado` (M2 de QA,
 * 12-10-2026): al × de la siguiente de su grupo (`enSuGrupo`, en el orden en que
 * se pintan), y si era la última, `null`: el desplegable «Añadir» de su ficha.
 * Sin esto el foco caía al `body`, porque el botón pulsado ya no existe tras
 * repintar. Lo mismo para rasgos y habilidades.
 */
export function focoTrasQuitar(enSuGrupo: readonly string[], quitado: string): string | null {
  const i = enSuGrupo.indexOf(quitado);
  if (i < 0) throw new Error(`no hay ninguna etiqueta «${quitado}» que quitar en su grupo`);
  return enSuGrupo[i + 1] ?? null;
}

/**
 * Los rasgos del motor de una ficha, como las habilidades: los puestos, en
 * etiquetas con su ×, y los demás de `CREATURE_TRAITS` en un desplegable para
 * añadir (12-10-2026: antes eran trece casillas, que ocupaban media ficha para
 * decir uno o dos). Lo que no se puede poner lo dice el validador al añadirlo.
 */
function rasgosDeLaFicha(puestos: readonly CreatureTrait[]): Html {
  const etiquetas =
    puestos.length === 0
      ? html`<span class="cost">Ninguno.</span>`
      : unir(
          puestos.map((t) =>
            etiquetaConQuitar(
              NOMBRE_DE_RASGO[t],
              html`data-arena="quitar-rasgo" data-rasgo="${t}"`,
            ),
          ),
        );
  const libres = CREATURE_TRAITS.filter((t) => !puestos.includes(t));
  const añadir =
    libres.length === 0
      ? NADA
      : html`<label class="campo"><span class="label">Añadir</span>
        <select data-arena-rasgo="si"><option value="">— elige —</option>${unir(
          libres.map((t) => html`<option value="${t}">${NOMBRE_DE_RASGO[t]}</option>`),
        )}</select></label>`;
  return html`<h3>Rasgos del motor ${nota(NOTA_DE_LOS_RASGOS)}</h3>
      <div class="etiquetas rasgos-puestos">${etiquetas}</div>
      ${añadir}`;
}

/** Lo que dice la nota de los rasgos del motor. */
const NOTA_DE_LOS_RASGOS =
  'Lo que el motor sabe hacer en la pelea (volar, doble golpe, no-muerto…). Lo que no se puede poner a esta unidad lo dice la barra al añadirlo.';

/**
 * Lo que decía el pie de una ficha —a quién alcanza el cambio—, que ahora es la
 * nota de su título (`tituloDeFicha`). En el montaje, `enElMontaje` si dice algo.
 */
function notaDelPie(como: ComoDeLaFicha, enElMontaje: string | null): string | null {
  return como.enCombate ? CAMBIO_EN_COMBATE : enElMontaje;
}

/**
 * El nivel de la ficha, que no se escribe: «Índice 340 · nivel 3», calculado por
 * el núcleo de las cifras con el equipo puesto (`lecturaDelNivel`). Va encima de las cifras
 * y se repinta con la ficha, así que cambia al tocar cualquiera de ellas.
 */
function filaDelNivel(lectura: string): Html {
  return html`<div class="row nivel-de-la-ficha" data-nivel-de-la-ficha="si"><span class="label">Nivel</span><span>${lectura}</span></div>`;
}

/** «De 0 en adelante.», «De 2 a 7.»: el rango de una cifra, para su nota. */
function rangoDicho(minimo: number | null, maximo: number | null): string {
  if (minimo === null) return maximo === null ? 'Puede restar.' : `Hasta ${maximo}.`;
  return maximo === null ? `De ${minimo} en adelante.` : `De ${minimo} a ${maximo}.`;
}

/**
 * Una fila de la tabla de cifras: su rótulo corto, su nota (lo que antes iba
 * entre paréntesis en el rótulo, y su rango), la casilla que se escribe —o
 * ninguna, una cifra que solo se lee— y el valor final con el que pelea.
 */
export interface FilaDeCifra {
  /** Lo que la distingue en el marcado (`data-cifra-de-la-ficha`, `data-final`). */
  readonly clave: string;
  readonly rotulo: string;
  /** Qué es, si hace falta decirlo; la nota añade el rango de la casilla. */
  readonly nota?: string;
  /**
   * La casilla que se escribe: el atributo con que la lee `main.ts`
   * (`data-campo="attack"`…), su valor y su rango. Sin ella, la cifra solo se lee.
   */
  readonly casilla?: {
    readonly atributo: Html;
    readonly valor: number;
    /** Sin él, la casilla no tiene tope por abajo (el extra de una pieza, que puede restar). */
    readonly minimo?: number;
    readonly maximo?: number;
  };
  /**
   * Con todos los modificadores: lo que pelea. Una cifra, o cómo queda dicho en
   * una línea cuando no es una (un tipo de la rueda con el arma: «Daño ×1,45»).
   */
  readonly final: number | string;
  /**
   * Sin casilla, lo que valdría sin modificadores (la armadura: 0, el cuerpo no
   * lleva): el final va en el otro tono si no es esto, como con la casilla (A5 de
   * QA de #262). Sin casilla ni esto, el final no se compara con nada.
   */
  readonly sinModificar?: number;
  /**
   * Si el final va en el otro tono, dicho a mano: cuando el final no es una cifra
   * que se pueda comparar con la casilla (la rueda: cambia si el arma suma algo).
   */
  readonly cambia?: boolean;
}

/**
 * Las cifras de una ficha en una tabla de una columna (13-10-2026, el usuario:
 * «las características en una sola columna con su valor y después otra casilla no
 * editable con el valor final, aplicados todos los modificadores»): una fila por
 * cifra con su rótulo y su nota, la casilla que se escribe y, a la derecha, el
 * final, que no se escribe (un `<output>`) y va en otro tono si no es el escrito.
 * `columna`, cómo se llama lo escrito («Cuerpo», «Catálogo», «Héroe»), con su
 * nota; `notaDelFinal`, de dónde sale el final; `marca`, un atributo de la tabla
 * (con su espacio delante) con que la encuentran las pruebas (la rueda de una
 * pieza). **La única tabla de
 * cifras**: la de una unidad, la de un héroe, la de una pieza y su rueda.
 */
export function tablaDeCifras(
  columna: { readonly nombre: string; readonly nota: string },
  notaDelFinal: string,
  filas: readonly FilaDeCifra[],
  marca: Html = NADA,
): Html {
  const cuerpo = unir(
    filas.map((f) => {
      const c = f.casilla;
      const dicho = [
        f.nota ?? null,
        c === undefined
          ? 'Se deriva: no se escribe.'
          : rangoDicho(c.minimo ?? null, c.maximo ?? null),
      ]
        .filter((x) => x !== null)
        .join(' ');
      const escrita =
        c === undefined
          ? html`<span class="sin-casilla" aria-hidden="true">—</span>`
          : html`<input type="number" ${c.atributo} value="${c.valor}" ${c.minimo === undefined ? NADA : html`min="${c.minimo}"`} ${c.maximo === undefined ? NADA : html`max="${c.maximo}"`} step="1" aria-label="${f.rotulo}" aria-description="${dicho}">`;
      const escrito = c?.valor ?? f.sinModificar;
      const cambia = f.cambia ?? (escrito !== undefined && f.final !== escrito);
      return html`<tr data-cifra-de-la-ficha="${f.clave}">
        <th scope="row">${f.rotulo} ${nota(dicho, false)}</th>
        <td class="escrita">${escrita}</td>
        <td class="final"><output class="${cambia ? 'cambiada' : 'igual'}" data-final="${f.clave}" aria-label="${f.rotulo}, final">${f.final}</output></td>
      </tr>`;
    }),
  );
  return html`<table class="tabla-de-cifras"${marca}>
      <thead><tr><th scope="col"><span class="solo-lector">Cifra</span></th><th scope="col">${columna.nombre} ${nota(columna.nota)}</th><th scope="col">Final ${nota(notaDelFinal)}</th></tr></thead>
      <tbody>${cuerpo}</tbody>
    </table>`;
}

/**
 * Las filas de las cifras de una unidad: las de `UnitInfo` que se escriben
 * (ataque, fuerza, agilidad y vida), cada una con lo que pelea (`final`), y las
 * que se derivan de ellas y del equipo (defensa, daño, casillas y peso; 25-10-2026,
 * `cifrasDelCuerpo`), sin casilla. `atributo`, el nombre del atributo con que la
 * lee `main.ts` (`data-campo`): el valor es el campo (`attack`, `fuerza`…). Sin
 * disparos ni casillas que ocupa: en la arena dispara quien lleva arma a
 * distancia, sin munición, y toda unidad ocupa una (13-10-2026).
 */
function filasDeUnidad(
  escrito: Pick<UnitInfo, 'attack' | 'fuerza' | 'agilidad' | 'hp'>,
  final: UnitInfo,
  atributo: (campo: string) => Html,
  cuerpo: UnitInfo,
): FilaDeCifra[] {
  const fila = (
    campo: string,
    rotulo: string,
    valor: number,
    fin: number,
    minimo: number,
    extra: { readonly nota?: string; readonly maximo?: number } = {},
  ): FilaDeCifra => ({
    clave: campo,
    rotulo,
    ...(extra.nota === undefined ? {} : { nota: extra.nota }),
    casilla: {
      atributo: atributo(campo),
      valor,
      minimo,
      ...(extra.maximo === undefined ? {} : { maximo: extra.maximo }),
    },
    final: fin,
  });
  return [
    fila('attack', NOMBRE_DE_CIFRA.ataque, escrito.attack, final.attack, 0),
    fila('fuerza', NOMBRE_DE_CIFRA.fuerza, escrito.fuerza, final.damage[0], 1, {
      nota: 'Su daño mínimo; la final, con la que suma su arma de cuerpo a cuerpo.',
    }),
    fila(
      'agilidad',
      NOMBRE_DE_CIFRA.agilidad,
      escrito.agilidad,
      agilidadDe(final),
      AGILIDAD_DEL_CUERPO_MIN,
      {
        nota: 'De ella salen la defensa, el daño máximo (fuerza × agilidad) y las casillas; la final, con lo que le resta el peso.',
        maximo: AGILIDAD_DEL_CUERPO_MAX,
      },
    ),
    ...filasDerivadas(final, cuerpo),
    fila('hp', NOMBRE_DE_CIFRA.pv, escrito.hp, final.hp, 1, { nota: 'La vida de cada uno.' }),
  ];
}

/**
 * Las filas de lo que se deriva del cuerpo y el equipo, sin casilla (25-10-2026,
 * `cifrasDelCuerpo`): la defensa, la armadura, el daño de cuerpo a cuerpo, las
 * casillas y el peso, con lo que le resta a la agilidad. Las de una unidad y las
 * de un héroe. Con `cuerpo` (el desnudo), cada final va en el otro tono si el
 * equipo lo cambia.
 */
function filasDerivadas(final: UnitInfo, cuerpo: UnitInfo | null): FilaDeCifra[] {
  const peso = final.peso ?? 0;
  const resta = restaDelPesoDe(final);
  const danio = (u: UnitInfo): string => `${u.damage[0]}–${u.damage[1]}`;
  // Montado de guerra (26-10-2026), el peso lo carga la montura: se mide contra su
  // fuerza, con lo que pesa ella, y le resta casillas a ella, no agilidad al jinete.
  const montura = final.montura;
  const deGuerra = montura !== undefined && montadoDeGuerra(final) ? montura : null;
  const aLaMontura = restaALaMontura(final) ?? 0;
  const filaDelPeso: FilaDeCifra =
    deGuerra === null
      ? {
          clave: 'peso',
          rotulo: NOMBRE_DE_CIFRA.peso,
          nota: 'Lo que pesa lo puesto, de su fuerza: por encima, −1 de agilidad por cada fuerza entera, o parte, que lo pase.',
          final:
            resta === 0
              ? `${peso} de ${final.fuerza}`
              : `${peso} de ${final.fuerza}: −${resta} agilidad`,
          cambia: resta > 0,
        }
      : {
          clave: 'peso',
          rotulo: NOMBRE_DE_CIFRA.peso,
          nota: 'Montado de guerra, lo carga la montura: lo que pesa lo del jinete y ella, de la fuerza de ella; por encima, −1 casilla por cada fuerza entera, o parte, que lo pase. El jinete no pierde agilidad.',
          final: `${peso + deGuerra.peso} de ${deGuerra.fuerza} (${deGuerra.nombre})${aLaMontura === 0 ? '' : `: −${aLaMontura} casillas`}`,
          cambia: aLaMontura > 0,
        };
  return [
    {
      clave: 'defensa',
      rotulo: NOMBRE_DE_CIFRA.defensa,
      nota: 'La agilidad, más la del escudo (y la Defensa del héroe).',
      final: final.defense,
      ...(cuerpo === null ? {} : { sinModificar: cuerpo.defense }),
    },
    filaDeArmadura(final),
    {
      clave: 'danio',
      rotulo: NOMBRE_DE_CIFRA.danio,
      nota: 'De la fuerza (con la del arma) a la fuerza por la agilidad: lo torpe pega parejo y lo ágil, con mucha variación.',
      final: danio(final),
      ...(cuerpo === null ? {} : { cambia: danio(final) !== danio(cuerpo) }),
    },
    {
      clave: 'casillas',
      rotulo: NOMBRE_DE_CIFRA.casillas,
      nota:
        deGuerra === null
          ? `Las que anda por turno: la agilidad, hasta ${CASILLAS_MAX}.`
          : `Las que anda por turno: las de la montura (${deGuerra.nombre}), su agilidad tras el peso que carga, hasta ${CASILLAS_MAX}.`,
      final: SPEED_TO_HEXES[final.speed],
      ...(cuerpo === null ? {} : { sinModificar: SPEED_TO_HEXES[cuerpo.speed] }),
    },
    filaDelPeso,
    // Con montura, lo que cuenta en el mapa: la de silla no cambia la batalla.
    ...(montura === undefined
      ? []
      : [
          {
            clave: 'marcha',
            rotulo: 'Marcha',
            nota: `Las casillas con que cuenta en la marcha del mapa: las de su montura (${montura.nombre}), tras el peso que carga. La marcha del héroe la marca el más lento del grupo, el héroe incluido.`,
            final: SPEED_TO_HEXES[marchaDe(final)],
            ...(cuerpo === null ? {} : { sinModificar: SPEED_TO_HEXES[marchaDe(cuerpo)] }),
          },
        ]),
  ];
}

/**
 * La fila de la armadura (#262): sin casilla, porque el cuerpo no la tiene (la
 * dan las piezas), y con su final, lo que se resta de cada golpe.
 */
function filaDeArmadura(final: UnitInfo): FilaDeCifra {
  return {
    clave: 'armadura',
    rotulo: NOMBRE_DE_CIFRA.armadura,
    nota: 'La suma de la de sus piezas: se resta del daño de cada golpe, disparo o hechizo que recibe, y puede dejarlo en 0.',
    final: armaduraDe(final),
    // Toda la armadura es del equipo: el cuerpo no lleva.
    sinModificar: 0,
  };
}

/**
 * El equipo de la ficha: una fila por hueco que tenga piezas, con la pieza
 * puesta, lo que suma y su × o «—», y un desplegable con lo que se le puede
 * poner. Las reglas son del núcleo y la ficha solo las lee: qué entra en cada
 * hueco (`opcionesDelHueco`; lo que rechazaría —un escudo con un arma a dos
 * manos— va desactivado y con su motivo) y si se puede quitar lo puesto (`quitarBlocker`: sin arma de cuerpo a
 * cuerpo no se combate, y el arma no lleva ×, sino su motivo en nota).
 */
function equipoDeLaFicha(u: Unidad | HeroeDeArena, piezas: EquipoAtado): Html {
  const filas = unir(
    HUECOS.flatMap((hueco) => {
      const id = u.equipo[hueco];
      const p = id === undefined ? null : piezas.pieza(id);
      const ofrecidas = opcionesDelHueco(u, hueco, piezas);
      if (p === null && ofrecidas.length === 0) return [];
      const noSeQuita = p === null ? null : quitarBlocker(u, hueco, piezas);
      const puesta =
        p === null
          ? html`<span class="cost">—</span>`
          : noSeQuita === null
            ? etiquetaConQuitar(
                p.nombre,
                html`data-arena="quitar-pieza" data-hueco="${hueco}"`,
                modificadoresEnPantalla(p),
              )
            : html`<span class="etiqueta" data-no-se-quita="${hueco}">${p.nombre} ${modificadoresEnPantalla(p)} ${nota(`No se quita: ${noSeQuita}. Para cambiarla, elige otra en «Poner».`)}</span>`;
      const opciones = unir(
        ofrecidas.map(({ pieza: x, motivo }) => {
          const cifras = cifrasDePieza(x) || 'no suma nada';
          return motivo === null
            ? html`<option value="${x.id}">${x.nombre} · ${cifras}</option>`
            : html`<option value="${x.id}" disabled>${x.nombre} · no: ${motivo}</option>`;
        }),
      );
      return [
        html`<div class="hueco" data-hueco-de-la-ficha="${hueco}">
        <span class="label">${NOMBRE_DE_HUECO[hueco]}</span> ${puesta}
        <label class="campo"><span class="label">Poner</span>
          <select data-arena-pieza="${hueco}"><option value="">— elige —</option>${opciones}</select></label>
      </div>`,
      ];
    }),
  );
  return html`<h3>Equipo ${nota(`Suma a las cifras del cuerpo y no cambia el nivel. Lo que no es arma suma a todo golpe; cada arma, solo al suyo (abajo, «Armas»): ${NOMBRE_DE_HUECO.arma} y ${NOMBRE_DE_HUECO.segunda} al cuerpo a cuerpo y a la carga (con dos, lo mejor de cada una), ${NOMBRE_DE_HUECO.distancia} al disparo. Una lanza es un arma más: con una montura de guerra, la carga va con la fuerza de la montura. ${NOMBRE_DE_HUECO.montura}: ${DICHO_DE_LA_MONTURA} Regla: ${REGLA_DEL_ESCUDO}.`)}</h3>
      <div class="equipo-de-la-ficha">${filas}</div>`;
}

/**
 * Las armas de una unidad, una fila por golpe (`armasDe`, del núcleo, con los
 * nombres de `piezas`): para qué, con cuál —o `SIN_ARMA`— y con qué ataque y daño
 * lo da, y en su nota cuándo se usa (`DICHO_DEL_USO`).
 * `ataqueEnLaPelea` da el ataque de ese golpe en la pelea (sus efectos y su
 * héroe), si lo hay; si no, el de sus cifras.
 */
export function filasDeArmas(unidad: UnitInfo, ataqueEnLaPelea?: (uso: UsoDeArma) => number): Html {
  return unir(
    armasDe(unidad).map((a) => {
      const con = a.arma ?? SIN_ARMA;
      const ataque = ataqueEnLaPelea?.(a.uso) ?? a.attack;
      const cifras = `${NOMBRE_DE_CIFRA.ataque} ${conComa(ataque, 1)} · ${NOMBRE_DE_CIFRA.danio} ${a.damage[0]}–${a.damage[1]}`;
      // Lo que cobra la carga, en su propio trozo sin cortes: con las cifras en uno
      // solo, la fila pedía 398 px en un panel de 274.
      const cobra =
        a.carga === null
          ? NADA
          : html` <span class="cifras-del-arma">· ${dichoDeLasCifras(a.montada)}</span>`;
      const { rotulo, cuando } = a.carga === null ? DICHO_DEL_USO[a.uso] : DICHO_DE_LA_CARGA;
      return html`<div class="row" data-arma-de-la-ficha="${a.carga === null ? a.uso : 'carga'}"><span class="label">${rotulo} ${nota(cuando)}</span><span class="golpe-del-arma"><span>${con} ·</span> <span class="cifras-del-arma">${cifras}</span>${cobra}</span></div>`;
    }),
  );
}

/** «Armas» en la ficha de una unidad del catálogo: lo que pelea, golpe a golpe. */
function armasDeLaFicha(combate: UnitInfo): Html {
  return html`<h3>Armas ${nota('Cada golpe va con las cifras de su arma: el ataque y el daño del cuerpo, con lo que suma todo el equipo y, del arma, solo la de ese golpe. La columna «Final» de arriba es la del cuerpo a cuerpo.')}</h3>
      <div class="armas-de-la-ficha">${filasDeArmas(combate)}</div>`;
}

/**
 * La ficha de la unidad elegida. `dispara`: si su figura trae el clip del
 * disparo (`ArteDeFigura.dispara`); solo entonces lleva su botón, porque a
 * quien no lo trae no hay disparo que enseñarle. Las cifras que se escriben son
 * las del CUERPO, de las que sale el nivel; con el equipo encima se pelea, y la
 * columna «Final» de su tabla lo dice (`tablaDeCifras`).
 */
export function renderFicha(u: Unidad | null, dispara: boolean, como: ComoDeLaFicha): Html {
  if (u === null) {
    return html`<h3>Ficha</h3><p class="cost">Pulsa el nombre de una unidad de un bando para ver y cambiar sus cifras.</p>`;
  }
  // Con lo que pelea, una vez: de ahí salen el nivel y la columna «Final».
  const combate = unidadDeCombate(u, como.piezas);
  // Las habilidades del cuaderno, todavía sin efecto; los poderes son hechizos que
  // usa la unidad con su turno (`Unidad.hechizos`).
  const etiqueta = (h: string): Html =>
    etiquetaConQuitar(h, html`data-arena="quitar-habilidad" data-habilidad="${h}"`);
  const hechizos = u.hechizos ?? [];
  const deLaPagina = como.hechizos ?? todosLosHechizos();
  const poderes =
    hechizos.length === 0
      ? html`<span class="cost">Ninguno.</span>`
      : unir(
          hechizos.map((id) => {
            const h = deLaPagina.find((x) => x.id === id) ?? HECHIZOS_DEL_JUEGO.get(id);
            const que = h === undefined ? '' : `${queHaceElHechizo(h, 0)}.`;
            return html`<div class="poder" data-poder-de-la-ficha="${id}">${etiquetaConQuitar(
              h === undefined ? nombreDeHechizo(id) : nombreDelPoder(h),
              html`data-arena="quitar-poder" data-poder="${id}"`,
            )} ${nota(que)}</div>`;
          }),
        );
  // Solo los que una unidad puede usar (sin poder mágico): los demás se ofrecen apagados.
  const poderesLibres = unir(
    deLaPagina
      .filter((h) => !hechizos.includes(h.id))
      .map((h) => {
        const [motivo] = problemasComoPoder(h);
        return motivo === undefined
          ? html`<option value="${h.id}">${h.nombre}</option>`
          : html`<option value="${h.id}" disabled title="${motivo}">${h.nombre} (crece con el poder)</option>`;
      }),
  );
  const puestas =
    u.habilidades.length === 0
      ? html`<span class="cost">Ninguna.</span>`
      : unir(u.habilidades.map(etiqueta));
  const libres = unir(
    HABILIDADES.filter((h) => !u.habilidades.includes(h)).map(
      (h) => html`<option value="${h}">${h}</option>`,
    ),
  );
  return html`<div class="ficha" data-clave-de-ficha="${claveDeFicha({ kind: 'unidad', id: u.id })}">
      ${tituloDeFicha(
        u.name,
        `Ficha · ${NOMBRE_DE_FACCION[u.faction]}`,
        como,
        html`data-campo="name"`,
        notaDelPie(
          como,
          'El cambio vale para todas las unidades de este tipo, en la batalla siguiente.',
        ),
      )}
      ${cabezaDeFicha({
        figura: u.cuerpo.hoja,
        como,
        clips: html`<button data-arena="clip" data-clip="idle">Reposo</button>
          <button data-arena="clip" data-clip="walk">Marcha</button>
          <button data-arena="clip" data-clip="charge">Carga</button>
          <button data-arena="clip" data-clip="attack">Ataque</button>
          ${dispara ? html`<button data-arena="clip" data-clip="shoot">Disparo</button>` : NADA}
          <button data-arena="clip" data-clip="hurt">Daño</button>
          <button data-arena="clip" data-clip="death">Muerte</button>`,
        cifras: html`${filaDelNivel(lecturaDelNivel(combate))}
      ${tablaDeCifras(
        {
          nombre: 'Cuerpo',
          nota: 'Las cifras del cuerpo, sin el equipo. El nivel sale de las finales, con él puesto.',
        },
        'Con lo que pelea: el cuerpo con el equipo puesto. En otro tono, la que el equipo cambia.',
        [
          ...filasDeUnidad(u, combate, (c) => html`data-campo="${c}"`, cuerpoDeCombate(u)),
          {
            clave: 'leadership',
            rotulo: 'Liderazgo',
            nota: 'Lo que cuenta cada uno en el liderazgo de su bando.',
            casilla: { atributo: html`data-campo="leadership"`, valor: u.leadership, minimo: 1 },
            final: u.leadership,
          },
          {
            clave: 'gold',
            rotulo: 'Coste',
            nota: 'En oro, en la partida. No se escribe: sale de su índice de poder (data/economia.json).',
            final: costeDeUnaUnidad(combate),
          },
        ],
      )}`,
      })}
      ${equipoDeLaFicha(u, como.piezas)}
      ${armasDeLaFicha(combate)}
      ${rasgosDeLaFicha(u.traits)}
      <h3>Poderes · actúan en la pelea ${nota('Se usan en su turno en vez de golpear, al principio, sin haberse movido: el turno entero. Lo que hace cada uno, en la nota de su etiqueta.')}</h3>
      <div class="etiquetas poderes">${poderes}</div>
      <label class="campo"><span class="label">Añadir poder ${nota('Un hechizo de «Editar magia» que la unidad usa con su turno, sin maná. Los que crecen con el poder mágico no: una unidad no tiene.')}</span>
        <select data-arena-poder="si"><option value="">— elige un hechizo —</option>${poderesLibres}</select></label>
      <h3>Habilidades · sin efecto todavía ${nota('Se guardan con la unidad, pero solo Curar tiene motor: en la pelea, de lo demás, solo cuentan los rasgos.')}</h3>
      <div class="etiquetas">${puestas}</div>
      <label class="campo"><span class="label">Añadir</span>
        <select data-arena-habilidad="si"><option value="">— elige —</option>${libres}</select></label>
    </div>`;
}

/**
 * La ficha del héroe de un lado: su figura (una hoja de héroe o la genérica), sus
 * cuatro cifras, su libro y los valores con los que pelea, que salen del núcleo
 * (`fichaDeHeroeDeArena`).
 */
export function renderFichaDeHeroe(
  lado: Lado,
  h: HeroeDeArena,
  como: ComoDeLaFicha,
  hojasDeHeroe: readonly { readonly id: string; readonly nombre: string }[],
): Html {
  const deLaPagina = como.hechizos ?? todosLosHechizos();
  const ficha = fichaDeHeroeDeArena(h, como.piezas, catalogoDeHechizos(deLaPagina));
  const c = ficha.cuerpo;
  const figuras = unir([
    html`<option value="" ${h.figura === null ? html`selected` : NADA}>Genérica del juego</option>`,
    ...hojasDeHeroe.map(
      (x) =>
        html`<option value="${x.id}" ${h.figura === x.id ? html`selected` : NADA}>${x.nombre}</option>`,
    ),
  ]);
  const escrita = (
    campo: string,
    rotulo: string,
    valor: number,
    minimo: number,
    final: number,
    queEs?: string,
  ): FilaDeCifra => ({
    clave: campo,
    rotulo,
    ...(queEs === undefined ? {} : { nota: queEs }),
    casilla: {
      atributo: html`data-heroe-campo="${campo}"`,
      valor,
      minimo,
      maximo: CIFRA_MAXIMA_DE_HEROE,
    },
    final,
  });
  // El cuerpo de todo héroe (`HeroeDeArena.cuerpo`, `combate` de data/heroe.json):
  // cambiarlo aquí cambia los dos héroes, y «Guardar» lo escribe.
  const delCuerpo = (campo: string, rotulo: string, valor: number, final: number): FilaDeCifra => ({
    clave: campo,
    rotulo,
    nota: 'Del cuerpo de todo héroe (data/heroe.json): cambiarlo cambia a los dos héroes, y «Guardar» lo escribe.',
    casilla: {
      atributo: html`data-heroe-campo="${campo}"`,
      valor,
      minimo: 1,
    },
    final,
  });
  const libro = unir(
    deLaPagina.map(
      (s) =>
        html`<label class="rasgo"><input type="checkbox" data-heroe-hechizo="${s.id}" ${h.hechizos.includes(s.id) ? MARCADO : NADA}> ${s.nombre} (${s.mana})</label>`,
    ),
  );
  const rinde = unir(ficha.hechizos.map((x) => filaDeCifra(`${x.nombre} (${x.coste})`, x.hace)));
  return html`<div class="ficha" data-clave-de-ficha="${claveDeFicha({ kind: 'heroe', lado })}">
      ${tituloDeFicha(
        h.nombre,
        `Ficha · héroe del bando ${LADOS[lado].adjetivo}`,
        como,
        html`data-heroe-campo="nombre"`,
        notaDelPie(como, null),
      )}
      ${cabezaDeFicha({
        figura: h.figura ?? FIGURA_GENERICA,
        como,
        clips: NADA,
        cifras: html`<label class="campo figura-del-heroe"><span class="label">Figura</span>
        <select data-heroe-campo="figura">${figuras}</select></label>
      ${filaDelNivel(lecturaDelNivel(c))}
      ${tablaDeCifras(
        { nombre: 'Héroe', nota: 'Las cifras del héroe, las que se escriben.' },
        'Con lo que pelea: su cuerpo en el tablero suma a su ataque y su defensa los de su rango, su agilidad y su equipo base. Fuerza, agilidad y PV son del cuerpo de todo héroe.',
        [
          escrita('ataque', NOMBRE_DE_CIFRA.ataque, h.ataque, 0, c.attack),
          escrita(
            'defensa',
            NOMBRE_DE_CIFRA.defensa,
            h.defensa,
            0,
            c.defense,
            'Su Defensa: suma a la defensa, encima de su agilidad y su escudo.',
          ),
          escrita(
            'poder',
            'Poder',
            h.poder,
            1,
            h.poder,
            'Lo que rinden sus hechizos y cuántas rondas dura lo que lanza.',
          ),
          escrita(
            'conocimiento',
            'Conocimiento',
            h.conocimiento,
            0,
            h.conocimiento,
            'Su maná: 10 por punto.',
          ),
          delCuerpo('fuerza', NOMBRE_DE_CIFRA.fuerza, h.cuerpo.fuerza.base, c.fuerza),
          delCuerpo('agilidad', NOMBRE_DE_CIFRA.agilidad, h.cuerpo.agilidad, agilidadDe(c)),
          delCuerpo('hp', NOMBRE_DE_CIFRA.pv, h.cuerpo.pv.base, c.hp),
          ...filasDerivadas(c, null).filter((f) => f.clave !== 'defensa'),
        ],
      )}`,
      })}
      ${equipoDeLaFicha(h, como.piezas)}
      <h3>Armas ${nota(
        `Empieza con el equipo base de todo héroe (${idsPuestos(EQUIPO_BASE)
          .map((id) => como.piezas.pieza(id).nombre)
          .join(
            ', ',
          )}) y lleva lo que le pongas en «Equipo», con las cifras de «Editar equipo»; es de este héroe de la arena y «Guardar» no lo escribe. Cada golpe va con las cifras de su arma.`,
      )}</h3>
      <div class="armas-de-la-ficha" data-armas-del-heroe="si">${filasDeArmas(c)}</div>
      <h3>Libro de hechizos</h3>
      <div class="rasgos">${libro}</div>
      <h3>En la pelea</h3>
      <div class="efectivos">
        <div class="row" data-mana-de-la-ficha="${ficha.mana}"><span class="label">Maná ${nota('10 × Conocimiento.')}</span><span>${ficha.mana}</span></div>
        ${filaDeCifra(html`Duración de lo que lanza ${nota('Tantas rondas como su Poder.')}`, enRondas(ficha.duracion))}
        ${rinde}
      </div>
    </div>`;
}
