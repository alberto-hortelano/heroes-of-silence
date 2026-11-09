/**
 * La vista «Editar magia» de la arena (06-11-2026, el editor de magia; petición del
 * usuario: «Crear un editor de magia en la arena para que pueda crear hechizos»):
 * la lista de hechizos por su entrega y la ficha del elegido, con su descripción,
 * su coste, su entrega, a quién va, cuánto dura y sus efectos, la frase de lo que
 * hace y **todos sus problemas a la vez** (`problemasDelHechizo`). Desde el
 * 08-11-2026, también sus facciones: una casilla por cada una.
 *
 * Lo que se edita es la lista de la página (`PaginaDeMagia`): «Guardar» la escribe
 * en `data/hechizos.json` con todo lo demás, y en plena pelea cambia ya la de la
 * batalla. Los cambios los hace el núcleo (`core/magia/editar.ts`); aquí solo se
 * pinta y se lee lo que se toca. Sin estado propio salvo el elegido.
 */
import { queHaceElHechizo } from '@core/magia/dicho.js';
import {
  campoDe,
  conCampo,
  conEfecto,
  conEntrega,
  conFaccion,
  conTipoDeEfecto,
  copiaDe,
  hechizoNuevo,
} from '@core/magia/editar.js';
import {
  A_QUIEN,
  AFECTA,
  AREA_MAXIMA,
  type Cantidad,
  CIFRAS_DE_HECHIZO,
  CUANDO_SALTA,
  DISIPAR_DE,
  type Duracion,
  type Efecto,
  ENTREGAS,
  GREMIO_MAXIMO,
  type Hechizo,
  IMPEDIBLES,
  OBJETIVOS,
  TIPOS_DE_EFECTO,
  type TipoDeEfecto,
  type TipoDeEntrega,
  VOCABULARIO_DE_LA_MAGIA as V,
} from '@core/magia/formato.js';
import { problemasDeLaLista, problemasDelHechizo } from '@core/magia/validar.js';
import { esFaccion, FACTION_IDS, NOMBRE_DE_FACCION } from '@core/types.js';
import { estaMarcado } from '../comun/campos.js';
import { type Html, html, NADA, pintar, unir } from '../comun/html.js';
import { nota } from '../views/notas.js';

/** Lo que la vista necesita de la página. */
interface PaginaDeMagia {
  /** Los hechizos de la página, guardados o no, en su orden. */
  hechizos(): readonly Hechizo[];
  /** Cambia la lista (y el elegido): la página la adopta, la pelea también y repinta. */
  cambiar(lista: readonly Hechizo[], elegido: string | null): void;
  /** Los ids que «Guardar» cambiaría en disco. */
  sinGuardar(): readonly string[];
  /** Quién usa el hechizo: héroes (su libro) y unidades (como poder), por su nombre. */
  quienLoUsa(id: string): readonly string[];
  /** El poder mágico con que se dice lo que hace (el del héroe de la izquierda). */
  poder(): number;
  /** Lo que dice la barra de la página. */
  avisar(texto: string): void;
}

/** Cómo se dice cada entrega en la lista y el desplegable. */
const NOMBRE_DE_ENTREGA: Readonly<Record<TipoDeEntrega, string>> = {
  libre: 'Libre (a cualquiera)',
  sobreSi: 'Sobre sí',
  contacto: 'En contacto',
  alcance: 'A x casillas',
  proyectil: 'Proyectil',
  tablero: 'Todo el tablero',
};

const NOMBRE_DE_EFECTO: Readonly<Record<TipoDeEfecto, string>> = {
  danio: 'Daño',
  cura: 'Cura',
  disipar: 'Disipar',
  cifra: 'Cifra',
  impide: 'Impedir',
  escudo: 'Escudo',
  disparador: 'Disparador',
  levantar: 'Levantar',
};

/**
 * Lo que no va dentro de un disparador: otro disparador, ni levantar (que va solo,
 * con el objetivo «cadaver»). La validación lo dice igual; aquí no se ofrece.
 */
function seOfreceDentro(t: TipoDeEfecto): boolean {
  return t !== 'disparador' && t !== 'levantar';
}

/** `de` de un `levantar` escrito en una línea: «zombi: esqueleto-guerrero, …». */
function deEnUnaLinea(de: Readonly<Record<string, string>> | undefined): string {
  return Object.entries(de ?? {})
    .map(([cae, sale]) => `${cae}: ${sale}`)
    .join(', ');
}

/**
 * La inversa de `deEnUnaLinea`, sin juzgar: un trozo sin «:» queda con lo que se
 * levanta vacío, y la validación dice que eso no es un id. Vacía, sin `de`.
 */
function deDeUnaLinea(linea: string): Record<string, string> | undefined {
  const trozos = linea
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');
  if (trozos.length === 0) return undefined;
  return Object.fromEntries(
    trozos.map((t) => {
      const [cae = '', sale = ''] = t.split(':').map((x) => x.trim());
      return [cae, sale];
    }),
  );
}

/** La duración como un valor del desplegable, y su inversa. */
function claveDeDuracion(d: Duracion | undefined): string {
  if (d === undefined) return 'nada';
  if (d === 'pelea') return 'pelea';
  if ('rondas' in d) return d.rondas === 'poder' ? 'poder' : 'rondas';
  return `${d.hasta}-${d.turnoDe}`;
}

function duracionDeClave(clave: string, antes: Duracion | undefined): Duracion | undefined {
  if (clave === 'nada') return undefined;
  if (clave === 'pelea') return 'pelea';
  if (clave === 'poder') return { rondas: 'poder' };
  if (clave === 'rondas') {
    const n =
      antes !== undefined &&
      antes !== 'pelea' &&
      'rondas' in antes &&
      typeof antes.rondas === 'number'
        ? antes.rondas
        : 2;
    return { rondas: n };
  }
  const [hasta, turnoDe] = clave.split('-') as [
    'empezar' | 'terminar',
    'afectado' | 'lanzador' | 'portador',
  ];
  return { hasta, turnoDe };
}

function opcion(valor: string, texto: string, actual: string): Html {
  return html`<option value="${valor}"${valor === actual ? html` selected` : NADA}>${texto}</option>`;
}

/** Una fila de la ficha: rótulo con su nota y el campo. */
function fila(rotulo: string, ayuda: string, campo: Html): Html {
  return html`<label class="fila-magia"><span class="rotulo">${rotulo} ${nota(ayuda)}</span>${campo}</label>`;
}

/**
 * La fila de las facciones: un grupo y no un `label` (`fila`), que no admite otros
 * `label` dentro. Una casilla por facción, cada una con su `data-*`, la identidad
 * con que `pintar` le guarda el foco.
 */
function filaDeFacciones(h: Hechizo): Html {
  const rotulo = 'Facciones';
  const ayuda =
    'De qué facciones es. El gremio de una ciudad enseña solo los de su facción, y una unidad solo usa como poder los de la suya.';
  const casillas = unir(
    FACTION_IDS.map(
      (f) =>
        html`<label class="rasgo"><input type="checkbox" data-magia-faccion="${f}"${h.facciones.includes(f) ? html` checked` : NADA}> ${NOMBRE_DE_FACCION[f]}</label>`,
    ),
  );
  return html`<div class="fila-magia" role="group" aria-label="${rotulo}"><span class="rotulo">${rotulo} ${nota(ayuda)}</span><span class="facciones">${casillas}</span></div>`;
}

function campoDeTexto(ruta: string, valor: string, largo = false): Html {
  return largo
    ? html`<textarea data-magia-ruta="${ruta}" data-magia-como="texto" rows="3">${valor}</textarea>`
    : html`<input type="text" data-magia-ruta="${ruta}" data-magia-como="texto" value="${valor}">`;
}

function campoEntero(ruta: string, valor: number, min: number, max: number): Html {
  return html`<input type="number" data-magia-ruta="${ruta}" data-magia-como="entero" value="${valor}" min="${min}" max="${max}" step="1">`;
}

function desplegable(
  ruta: string,
  como: string,
  actual: string,
  opciones: readonly (readonly [string, string])[],
): Html {
  return html`<select data-magia-ruta="${ruta}" data-magia-como="${como}">${unir(
    opciones.map(([v, t]) => opcion(v, t, actual)),
  )}</select>`;
}

/** Una cantidad: lo fijo y lo que suma por cada punto de poder mágico. */
function campoDeCantidad(ruta: string, c: Cantidad): Html {
  const base = typeof c === 'number' ? c : c.base;
  const porPoder = typeof c === 'number' ? 0 : c.porPoder;
  return html`<span class="cantidad"><input type="number" data-magia-ruta="${ruta}" data-magia-como="base" value="${base}" min="0" step="1"> + <input type="number" data-magia-ruta="${ruta}" data-magia-como="porPoder" value="${porPoder}" min="0" step="1"> × poder</span>`;
}

/** Las opciones de la duración; dentro de un disparador, también «de quien lo lleva». */
function opcionesDeDuracion(dentro: boolean): readonly (readonly [string, string])[] {
  const turnos = dentro
    ? (['afectado', 'lanzador', 'portador'] as const)
    : (['afectado', 'lanzador'] as const);
  return [
    ['nada', 'En el acto (no dura)'],
    ['rondas', 'Unas rondas'],
    ['poder', 'Tantas rondas como poder'],
    ...turnos.flatMap((t) => [
      [`empezar-${t}`, `Hasta que empiece el turno ${V.turnoDe[t]}`] as const,
      [`terminar-${t}`, `Hasta que termine el turno ${V.turnoDe[t]}`] as const,
    ]),
    ['pelea', 'Toda la pelea'],
  ];
}

function campoDeDuracion(ruta: string, d: Duracion | undefined, dentro: boolean): Html {
  const clave = claveDeDuracion(d);
  const rondas =
    d !== undefined && d !== 'pelea' && 'rondas' in d && typeof d.rondas === 'number'
      ? html` ${campoEntero(`${ruta}.rondas`, d.rondas, 1, 9)} rondas`
      : NADA;
  return html`<span class="duracion">${desplegable(ruta, 'duracion', clave, opcionesDeDuracion(dentro))}${rondas}</span>`;
}

/** Los campos de un efecto, por su tipo. */
function camposDelEfecto(e: Efecto, ruta: string): Html {
  switch (e.tipo) {
    case 'danio':
      return html`${campoDeCantidad(`${ruta}.cantidad`, e.cantidad)} <label><input type="checkbox" data-magia-ruta="${ruta}.armadura" data-magia-como="siempre-bool"${e.armadura ? html` checked` : NADA}> la armadura lo para ${nota('Sin marcar, el daño llega entero: no lo resta la armadura.')}</label>`;
    case 'cura':
      return campoDeCantidad(`${ruta}.cantidad`, e.cantidad);
    case 'escudo':
      return html`absorbe ${campoDeCantidad(`${ruta}.absorbe`, e.absorbe)}`;
    case 'disipar':
      return desplegable(
        `${ruta}.de`,
        'opcion',
        e.de,
        DISIPAR_DE.map((d) => [d, V.disipar[d]] as const),
      );
    case 'cifra':
      return html`${desplegable(
        `${ruta}.cifra`,
        'opcion',
        e.cifra,
        CIFRAS_DE_HECHIZO.map((c) => [c, V.cifras[c]] as const),
      )} ${campoEntero(`${ruta}.valor`, e.valor, -12, 12)}`;
    case 'impide':
      return unir(
        IMPEDIBLES.map(
          (q) =>
            html`<label class="rasgo"><input type="checkbox" data-magia-impide="${ruta}" value="${q}"${e.que.includes(q) ? html` checked` : NADA}> ${q}</label>`,
        ),
      );
    case 'disparador':
      return html`<div class="disparador">
        ${fila(
          'Cuándo',
          'Qué hace que salte.',
          desplegable(
            `${ruta}.cuando`,
            'opcion',
            e.cuando,
            CUANDO_SALTA.map((c) => [c, V.cuando[c]] as const),
          ),
        )}
        ${fila(
          'A quién',
          V.aQuien[e.a],
          desplegable(
            `${ruta}.a`,
            'opcion',
            e.a,
            A_QUIEN.map((a) => [a, V.aQuien[a]] as const),
          ),
        )}
        ${
          e.a === 'alrededor'
            ? html`${fila('Radio', 'A cuántas casillas de quien lo lleva.', campoEntero(`${ruta}.radio`, e.radio ?? 1, 1, AREA_MAXIMA))}
               ${fila(
                 'Afecta',
                 'De los de alrededor, a quién.',
                 desplegable(
                   `${ruta}.afecta`,
                   'opcion',
                   e.afecta ?? 'enemigos',
                   AFECTA.map((a) => [a, V.afecta[a]] as const),
                 ),
               )}`
            : NADA
        }
        ${fila('Y al lanzarse', 'Salta también al colgarse (un aura que se nota ya).', html`<input type="checkbox" data-magia-ruta="${ruta}.yAlLanzarse" data-magia-como="bool"${e.yAlLanzarse === true ? html` checked` : NADA}>`)}
        ${fila('Veces', 'Cuántas veces salta antes de irse; vacío, mientras dure.', html`<input type="number" data-magia-ruta="${ruta}.cargas" data-magia-como="enteroOVacio" value="${e.cargas ?? ''}" min="1" max="9" step="1">`)}
        ${fila('Lo que deja dura', 'Lo que dura lo que deja (si deja algo que dura).', campoDeDuracion(`${ruta}.duracion`, e.duracion, true))}
        ${fila(
          'Se acaba si cae',
          'Lo que deja se va si cae quien lo lleva o quien lo lanzó.',
          desplegable(`${ruta}.seAcabaSiMuere`, 'opcionOVacio', e.seAcabaSiMuere ?? '', [
            ['', '—'],
            ['portador', 'quien lo lleva'],
            ['lanzador', 'quien lo lanzó'],
          ]),
        )}
        <div class="efectos-dentro">${listaDeEfectos(e.efectos, `${ruta}.efectos`, true)}</div>
      </div>`;
    case 'levantar':
      return html`<div class="levantar">
        ${fila('De un vivo', 'El id de la unidad que se levanta del cadáver de un vivo (sin el rasgo no-muerto), de cualquier bando.', campoDeTexto(`${ruta}.vivos`, e.vivos))}
        ${fila('De un no-muerto', 'Lo que sale del cadáver de cada no-muerto nombrado, «cae: sale» separados por comas (zombi: esqueleto-guerrero). Del que no se nombra, ni del héroe, no sale nada.', html`<input type="text" data-magia-ruta="${ruta}.de" data-magia-como="pares" value="${deEnUnaLinea(e.de)}">`)}
      </div>`;
  }
}

/** Una lista de efectos con su «Añadir»; `dentro`, la de un disparador (sin otro dentro). */
function listaDeEfectos(efectos: readonly Efecto[], ruta: string, dentro: boolean): Html {
  const filas = efectos.map(
    (e, i) => html`<div class="efecto" data-efecto-de-la-ficha="${ruta}.${i}">
      <div class="cabecera-efecto">${desplegable(
        `${ruta}.${i}`,
        'tipo-de-efecto',
        e.tipo,
        TIPOS_DE_EFECTO.filter((t) => !dentro || seOfreceDentro(t)).map(
          (t) => [t, NOMBRE_DE_EFECTO[t]] as const,
        ),
      )} ${nota(V.efectos[e.tipo])}
      <button data-magia="quitar-efecto" data-magia-ruta="${ruta}.${i}" title="Quitar este efecto">×</button></div>
      ${camposDelEfecto(e, `${ruta}.${i}`)}
    </div>`,
  );
  const anadir = html`<select data-magia-anadir="${ruta}"><option value="" selected>+ Añadir efecto…</option>${unir(
    TIPOS_DE_EFECTO.filter((t) => !dentro || seOfreceDentro(t)).map(
      (t) => html`<option value="${t}">${NOMBRE_DE_EFECTO[t]}</option>`,
    ),
  )}</select>`;
  return html`${unir(filas)}${anadir}`;
}

/** La ficha del elegido. */
function fichaDe(h: Hechizo, p: PaginaDeMagia, problemas: readonly string[]): Html {
  const e = h.entrega;
  const usan = p.quienLoUsa(h.id);
  const conCasillas = e.tipo === 'alcance' || e.tipo === 'proyectil';
  const conDiferido = e.tipo === 'libre' || e.tipo === 'alcance' || e.tipo === 'proyectil';
  const sinObjetivo = e.tipo === 'sobreSi' || e.tipo === 'tablero';
  const area = h.area ?? 0;
  const lista =
    problemas.length === 0
      ? html`<p class="vale">Vale: se puede lanzar y guardar.</p>`
      : html`<ul class="problemas-de-magia">${unir(problemas.map((x) => html`<li>${x}</li>`))}</ul>`;
  return html`<section class="magia-ficha" data-hechizo-elegido="${h.id}">
    <h3>${h.nombre} <span class="cost">(${h.id})</span></h3>
    ${fila('Nombre', 'Como se dice en el libro, el botón y el parte.', campoDeTexto('nombre', h.nombre))}
    ${fila('Descripción', 'El campo para describirlo: lo leen quien juega y el agente.', campoDeTexto('descripcion', h.descripcion, true))}
    ${fila('Maná', 'Lo que cuesta al héroe, puesto a mano. Una unidad que lo usa como poder no paga.', campoEntero('mana', h.mana, 0, 99))}
    ${fila('Gremio', 'El nivel del gremio de magia que lo enseña en la partida; «ninguno», solo la arena y los poderes.', desplegable('gremio', 'enteroONulo', h.gremio === null ? '' : String(h.gremio), [['', 'ninguno'], ...Array.from({ length: GREMIO_MAXIMO }, (_, i) => [String(i + 1), `nivel ${i + 1}`] as const)]))}
    ${filaDeFacciones(h)}
    <h3>Alcance</h3>
    ${fila('Entrega', V.entregas[e.tipo], html`<select data-magia-entrega>${unir(ENTREGAS.map((t) => opcion(t, NOMBRE_DE_ENTREGA[t], e.tipo)))}</select>`)}
    ${conCasillas ? fila('Casillas', 'Hasta cuántas casillas de quien lo lanza (en el proyectil, vacío: sin tope).', html`<input type="number" data-magia-ruta="entrega.casillas" data-magia-como="enteroOVacio" value="${e.casillas ?? ''}" min="1" max="12" step="1">`) : NADA}
    ${conDiferido ? fila('Diferido', 'Cae al empezar el siguiente turno de quien lo lanza, sobre la casilla elegida.', html`<input type="checkbox" data-magia-ruta="entrega.diferido" data-magia-como="bool"${e.diferido === true ? html` checked` : NADA}>`) : NADA}
    ${
      sinObjetivo
        ? NADA
        : fila(
            'Objetivo',
            'Qué se elige al lanzarlo.',
            desplegable(
              'objetivo',
              'opcion',
              h.objetivo ?? 'enemigo',
              OBJETIVOS.map((o) => [o, V.objetivos[o]] as const),
            ),
          )
    }
    ${e.tipo === 'tablero' ? NADA : fila('Área', 'A cuántas casillas del punto de impacto alcanza (0: solo él); «la recta», todos los del proyectil.', desplegable('area', 'area', String(area), [...Array.from({ length: AREA_MAXIMA + 1 }, (_, i) => [String(i), i === 0 ? 'solo él' : `${i} casillas`] as const), ...(e.tipo === 'proyectil' ? [['recta', 'la recta'] as const] : [])]))}
    ${fila('Afecta', 'De los que alcanza, a quién (si alcanza a quien esté donde caiga).', desplegable('afecta', 'opcionOVacio', h.afecta ?? '', [['', '—'], ...AFECTA.map((a) => [a, V.afecta[a]] as const)]))}
    <h3>Duración</h3>
    ${fila('Dura', 'Cuánto dura lo que deja.', campoDeDuracion('duracion', h.duracion, false))}
    ${fila('Se acaba si cae quien lo lanzó', 'Lo que dejó se va si cae quien lo lanzó.', html`<input type="checkbox" data-magia-ruta="seAcabaSiMuere" data-magia-como="lanzador"${h.seAcabaSiMuere === 'lanzador' ? html` checked` : NADA}>`)}
    <h3>Efectos</h3>
    <div class="efectos">${listaDeEfectos(h.efectos, 'efectos', false)}</div>
    <h3>Lo que hace</h3>
    <p class="lo-que-hace">${queHaceElHechizo(h, p.poder())}</p>
    ${lista}
    <div class="botones">
      <button data-magia="duplicar">Duplicar</button>
      <button data-magia="borrar"${usan.length > 0 ? html` disabled title="${`Lo usan ${usan.join(', ')}: quítaselo antes de borrarlo`}"` : NADA}>Borrar</button>
    </div>
    ${usan.length === 0 ? NADA : html`<p class="cost">Lo usan: ${usan.join(', ')}.</p>`}
  </section>`;
}

/** La lista, por entrega. */
function listaDe(
  hechizos: readonly Hechizo[],
  elegido: string | null,
  sinGuardar: readonly string[],
): Html {
  const grupos = ENTREGAS.map((t) => {
    const suyos = hechizos.filter((h) => h.entrega.tipo === t);
    if (suyos.length === 0) return NADA;
    return html`<h3 class="cabecera-hueco">${NOMBRE_DE_ENTREGA[t]}</h3><div class="lista-de-piezas">${unir(
      suyos.map((h) => {
        const malo = problemasDelHechizo(h).length > 0;
        const sello = h.gremio === null ? 'solo arena' : `gremio ${h.gremio}`;
        return html`<button class="pieza${h.id === elegido ? ' elegida' : ''}${malo ? ' no-vale' : ''}" data-magia="elegir" data-hechizo="${h.id}"><span class="nombre">${h.nombre}${sinGuardar.includes(h.id) ? ' •' : ''}</span><span class="cost">${h.mana} maná</span><span class="sello">${sello}${malo ? ' · no vale' : ''}</span></button>`;
      }),
    )}</div>`;
  });
  return html`<section class="magia-lista"><h3 class="cabecera-hueco">Hechizos <button data-magia="nuevo">+ Nuevo hechizo</button></h3>${unir(grupos)}</section>`;
}

/** Monta la vista en `el` y devuelve con qué repintarla y elegir. */
export function montarEditorDeMagia(
  el: Element,
  p: PaginaDeMagia,
): { repintar(): void; elegido(): string | null; elegir(id: string | null): void } {
  let elegido: string | null = null;

  const repintar = (): void => {
    const lista = p.hechizos();
    if (elegido !== null && !lista.some((h) => h.id === elegido)) elegido = null;
    elegido ??= lista[0]?.id ?? null;
    const h = lista.find((x) => x.id === elegido) ?? null;
    // Los problemas del elegido y los del catálogo entero que le tocan (id o nombre repetido).
    const problemas =
      h === null
        ? []
        : [
            ...problemasDelHechizo(h),
            ...problemasDeLaLista(lista)
              .filter((x) => x.includes(`«${h.id}»`) || x.includes(`«${h.nombre}»`))
              .filter((x) => x.includes('dos veces')),
          ];
    pintar(
      el,
      html`${listaDe(lista, elegido, p.sinGuardar())}${h === null ? html`<section class="magia-ficha"><p class="cost">No hay ningún hechizo: crea uno.</p></section>` : fichaDe(h, p, problemas)}`,
    );
  };

  /** Cambia el elegido con `f` y lo da a la página. */
  const cambiarElElegido = (f: (h: Hechizo) => Hechizo): void => {
    const lista = p.hechizos();
    const i = lista.findIndex((x) => x.id === elegido);
    const h = lista[i];
    if (h === undefined) return;
    const nueva = [...lista];
    nueva[i] = f(h);
    p.cambiar(nueva, elegido);
  };

  el.addEventListener('change', (ev) => {
    const t = ev.target as Element;
    const valor = valorDe(t);
    if (t.getAttribute('data-magia-entrega') !== null) {
      cambiarElElegido((h) => conEntrega(h, valor as TipoDeEntrega));
      return;
    }
    const anadir = t.getAttribute('data-magia-anadir');
    if (anadir !== null) {
      if (valor === '') return;
      cambiarElElegido((h) => conEfecto(h, anadir, valor as TipoDeEfecto));
      return;
    }
    const faccion = t.getAttribute('data-magia-faccion');
    if (faccion !== null) {
      if (!esFaccion(faccion))
        throw new Error(`la casilla de la facción «${faccion}» no es de ninguna`);
      cambiarElElegido((h) => conFaccion(h, faccion, estaMarcado(t)));
      return;
    }
    const impide = t.getAttribute('data-magia-impide');
    if (impide !== null) {
      cambiarElElegido((h) => {
        const que = (campoDe(h, `${impide}.que`) as readonly string[] | undefined) ?? [];
        const nuevo = estaMarcado(t) ? [...que, valor] : que.filter((q) => q !== valor);
        return conCampo(h, `${impide}.que`, nuevo);
      });
      return;
    }
    const ruta = t.getAttribute('data-magia-ruta');
    const como = t.getAttribute('data-magia-como');
    if (ruta === null || como === null) return;
    cambiarElElegido((h) => conElValor(h, ruta, como, t));
  });

  el.addEventListener('click', (ev) => {
    const b = (ev.target as Element).closest('[data-magia]');
    if (b === null || !el.contains(b)) return;
    const lista = p.hechizos();
    switch (b.getAttribute('data-magia')) {
      case 'elegir':
        elegido = b.getAttribute('data-hechizo');
        repintar();
        return;
      case 'nuevo': {
        const h = hechizoNuevo(lista);
        elegido = h.id;
        p.cambiar([...lista, h], h.id);
        p.avisar(
          `«${h.nombre}» creado: dale nombre, descripción y efectos; «Guardar» lo escribe en data/hechizos.json.`,
        );
        return;
      }
      case 'duplicar': {
        const h = lista.find((x) => x.id === elegido);
        if (h === undefined) return;
        const copia = copiaDe(h, lista);
        elegido = copia.id;
        p.cambiar([...lista, copia], copia.id);
        return;
      }
      case 'borrar': {
        const h = lista.find((x) => x.id === elegido);
        if (h === undefined) return;
        const usan = p.quienLoUsa(h.id);
        if (usan.length > 0) {
          p.avisar(`No se borra «${h.nombre}»: lo usan ${usan.join(', ')}.`);
          return;
        }
        p.cambiar(
          lista.filter((x) => x.id !== h.id),
          null,
        );
        p.avisar(`«${h.nombre}» borrado: «Guardar» lo quita de data/hechizos.json.`);
        return;
      }
      case 'quitar-efecto': {
        const ruta = b.getAttribute('data-magia-ruta');
        if (ruta === null) return;
        cambiarElElegido((h) => conCampo(h, ruta, undefined));
        return;
      }
    }
  });

  return {
    repintar,
    elegido: () => elegido,
    elegir: (id) => {
      elegido = id;
    },
  };
}

/** `h` con lo que dice el campo `t` en la ruta, leído según `como`. */
function conElValor(h: Hechizo, ruta: string, como: string, t: Element): Hechizo {
  const v = valorDe(t);
  const marcado = estaMarcado(t);
  switch (como) {
    case 'texto':
      return conCampo(h, ruta, v);
    case 'entero':
      return conCampo(h, ruta, v.trim() === '' ? Number.NaN : Number(v));
    case 'enteroOVacio':
      return conCampo(h, ruta, v.trim() === '' ? undefined : Number(v));
    case 'enteroONulo':
      return conCampo(h, ruta, v === '' ? null : Number(v));
    case 'opcion':
      return conCampo(h, ruta, v);
    case 'opcionOVacio':
      return conCampo(h, ruta, v === '' ? undefined : v);
    case 'bool':
      return conCampo(h, ruta, marcado ? true : undefined);
    case 'siempre-bool':
      return conCampo(h, ruta, marcado);
    case 'lanzador':
      return conCampo(h, ruta, marcado ? 'lanzador' : undefined);
    case 'area':
      return conCampo(h, ruta, v === '0' ? undefined : v === 'recta' ? 'recta' : Number(v));
    case 'duracion':
      return conCampo(h, ruta, duracionDeClave(v, campoDe(h, ruta) as Duracion | undefined));
    case 'pares':
      return conCampo(h, ruta, deDeUnaLinea(v));
    case 'tipo-de-efecto':
      return conTipoDeEfecto(h, ruta, v as TipoDeEfecto);
    case 'base':
    case 'porPoder': {
      const antes = campoDe(h, ruta) as Cantidad | undefined;
      const base = typeof antes === 'number' ? antes : (antes?.base ?? 0);
      const porPoder = typeof antes === 'number' ? 0 : (antes?.porPoder ?? 0);
      const n = v.trim() === '' ? 0 : Number(v);
      const nueva = como === 'base' ? { base: n, porPoder } : { base, porPoder: n };
      return conCampo(h, ruta, nueva.porPoder === 0 ? nueva.base : nueva);
    }
    default:
      throw new Error(`el editor de magia no sabe leer un campo «${como}»`);
  }
}

/** Lo que dice un campo (`value`), sin nombrar su tipo del DOM. */
function valorDe(el: Element): string {
  const v = (el as Element & { value?: unknown }).value;
  return typeof v === 'string' ? v : '';
}
