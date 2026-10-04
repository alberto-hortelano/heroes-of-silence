/**
 * El marcado de la arena (`/arena/`): puro, sin DOM, y por eso con tests —la
 * lección del espectador: un panel que vive en el módulo que toca `document` al
 * importarse no lo prueba nadie—.
 *
 * Todo sale por `html.ts`. Las cifras, el nombre que la persona escribe y las
 * habilidades del cuaderno van por huecos de texto o de atributo; las imágenes
 * por `srcDeImagen`.
 */
import {
  CASILLAS_MAX,
  CASILLAS_MIN,
  FACCIONES_DE_ARENA,
  finalDeArena,
  type HojaDeArena,
  LADOS,
  type Lado,
  ladoDe,
  NOMBRE_DE_FACCION_DE_ARENA,
  type UnidadDeArena,
} from '@core/arena.js';
import { activeStack, isAlive, MAX_ROUNDS } from '@core/battle/battle.js';
import type { BattleState } from '@core/battle/types.js';
import { CATALOGO_DE_HABILIDADES, isShooter } from '@core/data.js';
import { CREATURE_TRAITS, type CreatureTrait, SPEED_TO_HEXES } from '@core/types.js';
import { type Html, html, NADA, srcDeImagen, unir } from '../html.js';
import type { SesionDeArena } from '../session.js';
import { accionesDeLaUnidad, listaDelCampo, renderBattleLog } from '../views/panels.js';

/** Un puesto del montaje: qué hoja y quién la mueve. `clave` distingue dos iguales. */
export interface Puesto {
  readonly clave: number;
  readonly hoja: string;
  readonly ia: boolean;
}

const DESHABILITADO: Html = html`disabled`;
const MARCADO: Html = html`checked`;

/** Qué hace cada rasgo del motor, dicho en corto para la casilla. */
const NOMBRE_DE_RASGO: Readonly<Record<(typeof CREATURE_TRAITS)[number], string>> = {
  undead: 'no-muerto',
  flying: 'vuela',
  no_retaliation: 'sin contraataque',
  double_attack: 'ataque doble',
  double_shot: 'disparo doble',
  life_drain: 'drena vida',
  splash_shot: 'disparo con salpicadura',
  charge: 'carga',
  curse_on_hit: 'maldice al golpear',
  bane_undead: 'azote de no-muertos',
  fear: 'terror',
};

const rutaDeIdentidad = (id: string): string => `/unidades/${id}/identidad.webp`;

/** Los rasgos dichos con palabras, o nada. */
function rasgosDichos(traits: readonly CreatureTrait[] | undefined): string {
  return (traits ?? []).map((t) => NOMBRE_DE_RASGO[t]).join(', ');
}

/**
 * Una línea con las cifras de una unidad, para la tarjeta del bando: también los
 * hexes y los rasgos, que antes no salían y un guerrero que vuela y ocupa dos
 * se veía igual que uno normal (M9 de QA).
 */
function resumenDeCifras(u: UnidadDeArena): string {
  const tiro = u.shots === undefined ? '' : ` · ${u.shots} tiros`;
  const grande = (u.hexes ?? 1) > 1 ? ` · ${u.hexes} hexes` : '';
  const rasgos = u.traits.length === 0 ? '' : ` · ${rasgosDichos(u.traits)}`;
  return `A ${u.attack} · D ${u.defense} · ${u.damage[0]}–${u.damage[1]} daño · ${u.hp} PV · ${u.casillas} casillas${tiro}${grande}${rasgos}`;
}

// ---------------------------------------------------------------- catálogo

export function renderCatalogo(
  hojas: readonly HojaDeArena[],
  filtro: HojaDeArena['faccion'] | 'todas',
): Html {
  const botones = unir(
    (['todas', ...FACCIONES_DE_ARENA] as const).map((f) => {
      const nombre = f === 'todas' ? 'Todas' : NOMBRE_DE_FACCION_DE_ARENA[f];
      return html`<button data-arena="filtro" data-faccion="${f}" class="${f === filtro ? 'primary' : ''}">${nombre}</button>`;
    }),
  );
  const visibles = hojas.filter((h) => filtro === 'todas' || h.faccion === filtro);
  const tarjetas = unir(
    visibles.map(
      (h) => html`<div class="hoja" data-hoja-catalogo="${h.id}">
        <img${srcDeImagen(rutaDeIdentidad(h.id))} alt="${h.nombre}" loading="lazy" width="64" height="64">
        <span class="nombre">${h.nombre}</span>
        <span class="cost">${NOMBRE_DE_FACCION_DE_ARENA[h.faccion]}</span>
        <span class="botones">
          <button data-arena="añadir" data-lado="izquierda" data-hoja="${h.id}" title="Añadir al bando izquierdo">+ izq.</button>
          <button data-arena="añadir" data-lado="derecha" data-hoja="${h.id}" title="Añadir al bando derecho">+ der.</button>
        </span>
      </div>`,
    ),
  );
  return html`<h3>Unidades</h3>
    <div class="filtros">${botones}</div>
    <div class="catalogo">${tarjetas}</div>`;
}

// ---------------------------------------------------------------- bandos

export function renderBando(
  lado: Lado,
  puestos: readonly Puesto[],
  unidadDe: (hoja: string) => UnidadDeArena,
  elegida: string | null,
  caben: number,
): Html {
  const titulo = `Bando ${LADOS[lado].adjetivo}`;
  const fichas =
    puestos.length === 0
      ? html`<div class="stack empty">Sin unidades: añádelas desde la lista de la izquierda.</div>`
      : unir(
          puestos.map((p) => {
            const u = unidadDe(p.hoja);
            return html`<div class="puesto${p.hoja === elegida ? ' elegida' : ''}" data-puesto="${p.clave}">
              <button class="ver" data-arena="editar" data-hoja="${p.hoja}" title="Ver y editar sus cifras">
                <canvas class="figura" data-figura="${p.hoja}" data-lado="${lado}" width="72" height="88"></canvas>
              </button>
              <div class="datos">
                <button class="nombre" data-arena="editar" data-hoja="${p.hoja}" title="Editar sus cifras">${u.name}</button>
                <span class="cost">${resumenDeCifras(u)}</span>
                <span class="botones">
                  <button data-arena="manda" data-clave="${p.clave}" data-ia="no" class="${p.ia ? '' : 'primary'}">Yo</button>
                  <button data-arena="manda" data-clave="${p.clave}" data-ia="si" class="${p.ia ? 'primary' : ''}">IA</button>
                  <button data-arena="duplicar" data-clave="${p.clave}" ${puestos.length >= caben ? DESHABILITADO : NADA}>Duplicar</button>
                  <button data-arena="quitar" data-clave="${p.clave}">Quitar</button>
                </span>
              </div>
            </div>`;
          }),
        );
  return html`<h3>${titulo} · ${puestos.length} de ${caben}</h3><div class="stack-list">${fichas}</div>`;
}

// ---------------------------------------------------------------- ficha

/** Un campo numérico de la ficha. `data-campo` es lo que lee `main.ts` al cambiarlo. */
function numero(campo: string, rotulo: string, valor: number, minimo: number): Html {
  return html`<label class="campo"><span class="label">${rotulo}</span>
    <input type="number" data-campo="${campo}" value="${valor}" min="${minimo}" step="1"></label>`;
}

/**
 * La ficha de la unidad elegida. `dispara`: si su figura trae el clip del
 * disparo (`ArteDeFigura.dispara`); solo entonces lleva su botón, porque a
 * quien no lo trae no hay disparo que enseñarle.
 */
export function renderFicha(
  u: UnidadDeArena | null,
  hoja: HojaDeArena | null,
  dispara: boolean,
): Html {
  if (u === null || hoja === null) {
    return html`<h3>Ficha</h3><p class="cost">Pulsa el nombre de una unidad de un bando para ver y cambiar sus cifras.</p>`;
  }
  const rasgos = unir(
    CREATURE_TRAITS.map(
      (t) =>
        html`<label class="rasgo"><input type="checkbox" data-rasgo="${t}" ${u.traits.includes(t) ? MARCADO : NADA}> ${NOMBRE_DE_RASGO[t]}</label>`,
    ),
  );
  const puestas =
    u.habilidades.length === 0
      ? html`<span class="cost">Ninguna.</span>`
      : unir(
          u.habilidades.map(
            (h) =>
              html`<span class="etiqueta">${h} <button data-arena="quitar-habilidad" data-habilidad="${h}" title="Quitar">×</button></span>`,
          ),
        );
  const libres = unir(
    CATALOGO_DE_HABILIDADES.filter((h) => !u.habilidades.includes(h)).map(
      (h) => html`<option value="${h}">${h}</option>`,
    ),
  );
  return html`<h3>Ficha · ${NOMBRE_DE_FACCION_DE_ARENA[u.faction]}</h3>
    <div class="ficha" data-ficha="${u.id}">
      <div class="retrato">
        <canvas class="figura grande" data-figura="${u.id}" data-ficha-clip="si" width="200" height="230"></canvas>
        <div class="botones">
          <button data-arena="clip" data-clip="idle">Reposo</button>
          <button data-arena="clip" data-clip="walk">Marcha</button>
          <button data-arena="clip" data-clip="charge">Carga</button>
          <button data-arena="clip" data-clip="attack">Ataque</button>
          ${dispara ? html`<button data-arena="clip" data-clip="shoot">Disparo</button>` : NADA}
          <button data-arena="clip" data-clip="hurt">Daño</button>
          <button data-arena="clip" data-clip="death">Muerte</button>
          <button data-arena="girar" title="Pasa la figura por sus ocho direcciones">Girar</button>
        </div>
      </div>
      <label class="campo"><span class="label">Nombre</span>
        <input type="text" data-campo="name" value="${u.name}"></label>
      ${numero('attack', 'Ataque', u.attack, 0)}
      ${numero('defense', 'Defensa', u.defense, 0)}
      ${numero('damage-min', 'Daño mínimo', u.damage[0], 1)}
      ${numero('damage-max', 'Daño máximo', u.damage[1], 1)}
      ${numero('hp', 'Vida', u.hp, 1)}
      ${numero('casillas', `Velocidad (casillas, ${CASILLAS_MIN} a ${CASILLAS_MAX})`, u.casillas, CASILLAS_MIN)}
      ${numero('shots', 'Disparos (0 = cuerpo a cuerpo)', u.shots ?? 0, 0)}
      ${numero('hexes', 'Hexes (1 o 2)', u.hexes ?? 1, 1)}
      ${numero('level', 'Nivel', u.level, 1)}
      ${numero('leadership', 'Liderazgo', u.leadership, 1)}
      ${numero('gold', 'Coste (oro)', u.cost.gold, 0)}
      <h3>Rasgos del motor</h3>
      <div class="rasgos">${rasgos}</div>
      <h3>Habilidades · sin efecto todavía</h3>
      <p class="cost">Se guardan con la unidad, pero no hay motor de habilidades: en la pelea solo cuentan los rasgos.</p>
      <div class="etiquetas">${puestas}</div>
      <label class="campo"><span class="label">Añadir</span>
        <select data-arena-habilidad="si"><option value="">— elige —</option>${libres}</select></label>
      <p class="cost">El cambio vale para todas las unidades de este tipo, en la batalla siguiente.</p>
    </div>`;
}

// ---------------------------------------------------------------- batalla

/** Lo que el panel de la batalla lee de la sesión: la sesión misma, sin copiar su forma. */
export type VistaDeArena = Pick<
  SesionDeArena,
  'battle' | 'semilla' | 'laLlevaLaIA' | 'turnoPropio' | 'battleLegalActions' | 'battleStepsLeft'
>;

/**
 * Quién gana, dicho por el lado del montaje. Si los dos siguen en pie es que se
 * acabaron las rondas, y se dice con la regla del motor: sin eso, «gana el
 * derecho» tras cien rondas sin un rasguño parecía que el derecho era más fuerte
 * (H4 de QA).
 */
function rotuloDelGanador(battle: BattleState): string {
  const fin = finalDeArena(battle);
  if (fin === null) return '';
  const quien = `el bando ${LADOS[fin.ganador].adjetivo}`;
  if (!fin.porTiempo) return `Gana ${quien}.`;
  const porque = fin.empate
    ? 'con las mismas unidades en pie, gana quien defiende'
    : 'gana quien tiene más unidades en pie';
  return `Sin vencedor en ${MAX_ROUNDS} rondas: por tiempo, ${porque}. Gana ${quien}.`;
}

/**
 * El panel lateral de la batalla. Las acciones, su ayuda —la de la carga
 * incluida— y la lista del campo son las piezas de la partida
 * (`views/panels.ts`); lo de aquí es lo que solo tiene la arena: quién mueve
 * cada unidad y el resultado por lados.
 *
 * @param contandoAun si el tablero aún cuenta la última jugada: con la batalla
 *   ya resuelta en el estado, el resultado se calla hasta que el tablero llega a
 *   él, como en el espectador.
 */
export function renderPanelDeBatalla(s: VistaDeArena, contandoAun: boolean): Html {
  const b = s.battle;
  // Mientras el tablero cuenta, el estado ya va por delante de lo que se ve: el
  // parte, las vidas y la ficha de la activa contarían el final antes de que
  // llegue —con todo en IA, la pelea entera—. Se calla todo hasta que el tablero
  // alcanza al estado.
  if (contandoAun) {
    return html`<div class="row"><span class="label">Ronda</span><span>…</span></div>
      <p>Contando la jugada…</p>`;
  }
  if (b.finished !== null) {
    return html`<h2>${rotuloDelGanador(b)}</h2>
      <p>Ronda ${b.round}. Semilla ${s.semilla}.</p>
      <div class="stack-list"><button data-arena="otra-vez" class="primary">Otra vez</button></div>
      <h3>Parte de guerra</h3>${renderBattleLog(b, null)}`;
  }
  const activa = activeStack(b);
  const mia = s.turnoPropio !== null;
  const rasgos = activa === null ? '' : rasgosDichos(activa.unit.traits);
  const ficha =
    activa === null
      ? NADA
      : html`<h2>${activa.unit.name}</h2>
        <div class="row"><span class="label">Bando</span><span>${LADOS[ladoDe(activa.side)].rotulo}</span></div>
        <div class="row"><span class="label">La mueve</span><span>${s.laLlevaLaIA(activa.id) ? 'la IA' : 'tú'}</span></div>
        <div class="row"><span class="label">Vida</span><span>${isAlive(activa) ? activa.topHp : 0} / ${activa.unit.hp}</span></div>
        <div class="row"><span class="label">Ataque / Defensa</span><span>${activa.unit.attack} / ${activa.unit.defense}</span></div>
        <div class="row"><span class="label">Daño</span><span>${activa.unit.damage[0]}–${activa.unit.damage[1]}</span></div>
        <div class="row"><span class="label">Velocidad</span><span>${SPEED_TO_HEXES[activa.unit.speed]} casillas</span></div>
        ${(activa.unit.hexes ?? 1) > 1 ? html`<div class="row"><span class="label">Hexes</span><span>${activa.unit.hexes ?? 1}</span></div>` : NADA}
        ${rasgos === '' ? NADA : html`<div class="row"><span class="label">Rasgos</span><span>${rasgos}</span></div>`}
        ${isShooter(activa.unit) ? html`<div class="row"><span class="label">Munición</span><span>${activa.shotsLeft}</span></div>` : NADA}`;
  const acciones =
    mia && activa !== null
      ? accionesDeLaUnidad({
          activa,
          legales: s.battleLegalActions(),
          pasos: s.battleStepsLeft(),
          rendicion: NADA,
          hechizos: NADA,
        })
      : html`<p>Mueve la IA…</p>`;
  const campo = listaDelCampo(b, (x) => ({
    flecha: x.side === LADOS.izquierda.bando ? '▶' : '◀',
    nombre: x.unit.name,
    cuenta: `${x.topHp} PV · ${s.laLlevaLaIA(x.id) ? 'IA' : 'tú'}`,
  }));
  return html`${ficha}
    <div class="row"><span class="label">Ronda</span><span>${b.round}</span></div>
    ${acciones}
    <h3>En el campo</h3><div class="stack-list">${campo}</div>
    <h3>Parte de guerra</h3>${renderBattleLog(b, null)}`;
}
