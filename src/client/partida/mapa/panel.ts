/**
 * El lateral del mapa (`renderAdventurePanel`): el héroe elegido con sus cifras, su
 * libro, su equipo y su tropa; la lista de héroes, castillos y pueblos con lo que cobra
 * cada uno hoy; la crónica; y, al acabar, cómo acabó la partida (`renderFinDePartida`,
 * con `ROTULO_DE_FIN`, que lee también la barra de arriba, y `explicacionDeFin`, que
 * compara `pnpm capturas`). El libro de un héroe (`renderSpellbook`, `filaHechizo`) y
 * por qué un sitio no cobra (`sinCobrar`) los lee también el panel de la base. Era
 * parte de `views/panels.ts` hasta la fase C de la reorganización (07-11-2026).
 */
import { pieza } from '@core/equipo/pieza.js';
import { destinoDeEquipo } from '@core/equipo/portador.js';
import { cuerpoDelHeroe, heroUnit, maxMana, maxMovePoints } from '@core/hero/hero.js';
import { rangoDe, rangoDeHeroe, umbral } from '@core/hero/rango.js';
import { nombreDeTipoDeHeroe } from '@core/hero/tipos-de-heroe.js';
import { type TroopGroup, troopSummary } from '@core/hero/troop.js';
import { enOrdenDelLibro } from '@core/magia/catalogo.js';
import type { Hechizo } from '@core/magia/formato.js';
import type { Desenlace } from '@core/state/desenlace.js';
import type { DefeatReason } from '@core/state/events.js';
import { conMiles, conSigno } from '@core/texto.js';
import { type Hero, HUECOS, NOMBRE_DE_HUECO, type UnitInfo } from '@core/types.js';
import { nivelDeUnidad } from '@core/unidad/nivel.js';
import { DESHABILITADO, type Html, html, NADA, unir } from '../../comun/html.js';
import type { Session } from '../../sesion/partida.js';
import { filaDeCifra } from '../../views/cifras.js';
import { renderLog } from '../../views/cronica.js';
import { historiaDelHeroe, modificadoresEnPantalla, nota } from '../../views/notas.js';
import { botonDeLicenciar, filaDeTropa, filaLiderazgo, renderArmy } from '../ejercito.js';

/**
 * Lo que dice la barra de arriba cuando la partida ha terminado.
 *
 * Tabla y no ternario anidado: con el ternario, el empate por días se pintaba
 * «Partida perdida» —`winner === viewer` con un `null` delante es `false`— y
 * `tsc` no tenía nada que decir. Un `Record<Desenlace, …>` obliga a contestar a
 * los tres, y al cuarto que llegue.
 */
export const ROTULO_DE_FIN: Record<Desenlace, string> = {
  ganada: 'Partida ganada',
  perdida: 'Partida perdida',
  'sin resolver': 'Partida sin resolver',
  // Inalcanzable desde aquí —`Session` siempre tiene un `viewer` de verdad— pero
  // la fila no es un relleno: si algún día esta barra la pinta quien solo mira,
  // «Partida terminada» es lo que hay que decirle.
  ajena: 'Partida terminada',
};

/**
 * Por qué una ciudad o un pueblo propio no cobra hoy, según `rentaDelDia`, o `null`
 * si cobra: dicho corto para la lista («ocupada», «sin unir»), para la ficha
 * («sin cobrar: ocupada») y entero, para su nota (la frase de la ocupación). Lo leen la lista del lateral y la ficha de la
 * ciudad, que antes decían cada una lo suyo: la ficha de la ocupada cobraba «500
 * oro/día» bajo la frase que decía que no da oro (vuelta 1 de QA de la tarea 2, H1;
 * el pueblo sin unir no salía en ningún sitio, H2). `a`, la terminación: «a» la
 * ciudad, «o» el pueblo.
 */
export function sinCobrar(
  x: { readonly ocupada: string | null },
  unido: boolean,
  a: 'a' | 'o',
): { readonly corto: string; readonly dicho: string; readonly motivo: string } | null {
  if (x.ocupada !== null)
    return { corto: `ocupad${a}`, dicho: `sin cobrar: ocupad${a}`, motivo: x.ocupada };
  if (!unido) {
    const dicho = `sin cobrar: no está unid${a} a tu base`;
    return { corto: 'sin unir', dicho, motivo: dicho };
  }
  return null;
}

/** Lo que da hoy una ciudad o un pueblo de la renta en la lista del lateral: su oro, o +0 con su motivo. */
function cuantoDa(
  x: { readonly oro: number; readonly ocupada: string | null },
  unido: boolean,
  a: 'a' | 'o',
): Html {
  const no = sinCobrar(x, unido, a);
  if (no === null) return html`<span class="count">+${conMiles(x.oro)}</span>`;
  const clase = x.ocupada === null ? 'count' : 'count ocupado';
  return html`<span class="${clase}" title="${no.motivo}">+0 · ${no.corto}</span>`;
}

/**
 * Cómo acabó la partida, contado en el lateral. Ganar y perder se explican por **la causa** que selló `checkDefeat`, no por
 * una frase fija: la fija era la regla de antes del mapa de nodos —«no te
 * quedan castillos ni héroes»— y se leía con el héroe del derrotado todavía en
 * el mapa (I1 de la 2a). Tabla por causa por lo mismo que las de arriba: una
 * causa nueva sin frase no compila.
 */
const POR_QUE_SE_DECIDIO: Record<DefeatReason, { ganada: string; perdida: string }> = {
  lost_base: {
    ganada: 'Has tomado la base rival: sin ella, el rival queda eliminado.',
    perdida: 'Has perdido tu base: sin ella quedas eliminado, aunque te queden héroes o ciudades.',
  },
  nothing_left: {
    ganada: 'El rival se ha quedado sin héroes y sin ciudades.',
    perdida: 'Te has quedado sin héroes y sin ciudades.',
  },
};

/**
 * Las dos que no tienen causa salen antes; con un quinto desenlace, el índice
 * de la última línea deja de compilar, que es el mismo guardia que la tabla.
 */
export function explicacionDeFin(desenlace: Desenlace, causa: DefeatReason | null): string {
  if (desenlace === 'sin resolver') return 'Se han agotado los días y nadie ha vencido.';
  if (desenlace === 'ajena') return 'La partida ha terminado.';
  if (causa === null) throw new Error(`la partida está ${desenlace} y no consta por qué`);
  return POR_QUE_SE_DECIDIO[causa][desenlace];
}

function renderFinDePartida(desenlace: Desenlace, causa: DefeatReason | null): Html {
  const explicacion = explicacionDeFin(desenlace, causa);
  return html`<div class="fin ${desenlace === 'perdida' ? 'perdida' : 'ganada'}">
    <p class="eyebrow">FIN DE LA PARTIDA</p>
    <h2>${ROTULO_DE_FIN[desenlace]}</h2>
    <p>${explicacion}</p>
  </div>`;
}

/**
 * «3 (+3) / 6»: con lo que el héroe pelea sin nada puesto —sus atributos más lo
 * que le da el rango y, en la defensa, su agilidad— y, entre paréntesis, lo que le
 * cambia el equipo (25-10-2026: el peso puede restar defensa, y se dice). `puesto`
 * es su `heroUnit`, la misma puerta con la que entra en batalla, y lo de sin nada
 * puesto, `desnudo`, su `cuerpoDelHeroe`: sumar aquí al ataque del héroe lo que
 * suma su equipo se saltaba el rango, y a un héroe de rango 6 la ficha le enseñaba uno menos de
 * lo que pegaba.
 */
function ataqueYDefensa(desnudo: UnitInfo, puesto: UnitInfo): string {
  const cifra = (base: number, total: number) =>
    total === base ? `${base}` : `${base} (${conSigno(total - base)})`;
  return `${cifra(desnudo.attack, puesto.attack)} / ${cifra(desnudo.defense, puesto.defense)}`;
}

/**
 * La fila «Infiltración» del héroe: si su grupo cruza barreras, o por qué no
 * (`Session.infiltracion`, la regla del núcleo), en una nota: es largo y casi
 * nadie lo lleva.
 */
function filaDeInfiltracion(motivo: string | null): Html {
  return filaDeCifra(
    'Infiltración',
    motivo === null ? 'cruza barreras, un día por casilla' : html`no ${nota(motivo)}`,
  );
}

export function renderAdventurePanel(session: Session): Html {
  const hero = session.selectedHero;
  const heroes = session.myHeroes();
  const desenlace = session.desenlace;
  const fin = desenlace === null ? NADA : renderFinDePartida(desenlace, session.causaDelFinal);

  // Sus cifras, una vez: de ellas salen el nivel y el ataque y la defensa.
  const puesto = hero === null ? null : heroUnit(hero);
  const heroPanel =
    hero === null || puesto === null
      ? session.heroeDeSalidaPendiente
        ? html`<p>Aún no tienes héroe: elige el de salida ante el ayuntamiento de tu base (púlsala en el mapa o en «Castillos»). Hasta entonces no se pasa el turno.</p>`
        : html`<p>No tienes héroes en el mapa. Contrata uno en tu castillo.</p>`
      : html`
        <p class="eyebrow">HÉROE · RANGO ${rangoDeHeroe(hero)} · NIVEL ${nivelDeUnidad(puesto)} · ${nombreDeTipoDeHeroe(hero.faction, hero.tipo)}</p>
        <h2>${hero.name}</h2>${historiaDelHeroe(hero.origen?.historia ?? null)}
        ${botonDeSueño(session, hero)} ${botonDeLaTropa(session)}${
          session.enSuPasoOPueblo(hero)
            ? html` <button data-action="abrir-guarnicion" data-hero="${hero.id}" title="Dejar aquí tropa de guarnición o recogerla">Guarnición</button>`
            : NADA
        }
        ${filaLiderazgo(session.liderazgo({ heroe: hero.id }))}
        ${filaDeCifra('Movimiento', `${session.movimientoALaVista(hero)} / ${maxMovePoints(hero)}`)}
        ${filaDeInfiltracion(session.infiltracion(hero))}
        ${filaDeCifra('Maná', `${hero.mana} / ${maxMana(hero)}`)}
        ${filaDeCifra('Ataque / Defensa', ataqueYDefensa(cuerpoDelHeroe(hero), puesto))}
        ${filaDeCifra('Poder / Conocimiento', `${hero.spellPower} / ${hero.knowledge}`)}
        ${filaDeCifra('Experiencia', experienciaDeHeroe(hero.experience))}
        <h3>Hechizos</h3>
        ${renderSpellbook(hero.spells)}
        ${renderEquipoDelHeroe(hero, session.selectedItem)}
        <h3>Tropa · ${hero.army.length} ${hero.army.length === 1 ? 'individuo' : 'individuos'}</h3>
        ${renderTropaEquipable(hero, session.selectedItem)}`;

  // Con uno solo también (#17): con `<= 1` la lista aparecía al contratar el
  // segundo y se iba al perderlo, y con ella el sitio donde mirar quién duerme.
  const listaHeroes =
    heroes.length === 0
      ? NADA
      : html`<h3>Héroes</h3><div class="stack-list">${unir(
          heroes.map((h) => {
            const elegido = h.id === hero?.id;
            const duerme = session.estaDormido(h.id)
              ? html` <span class="duerme">· duerme</span>`
              : NADA;
            return html`<button data-action="select-hero" data-hero="${h.id}" class="stack${elegido ? ' primary' : ''}">
              <span>${h.name}${duerme}</span><span class="count">${h.movePoints}</span>
            </button>`;
          }),
        )}</div>`;

  // Cada ciudad propia con lo que cobra hoy (`Session.renta`): una que han dejado
  // aislada de la base no da nada, aunque siga siendo suya.
  const renta = session.renta;
  const listaPueblos =
    renta.ciudades.length === 0
      ? NADA
      : html`<h3>Castillos</h3><div class="stack-list">${unir(
          renta.ciudades.map(
            (c) => html`<button data-action="open-town" data-town="${c.id}" class="stack">
              <span>${c.nombre}</span>${cuantoDa(c, c.unida, 'a')}
            </button>`,
          ),
        )}</div>`;
  const listaAldeas =
    renta.pueblos.length === 0
      ? NADA
      : html`<h3>Pueblos</h3><div class="stack-list">${unir(
          renta.pueblos.map(
            (p) =>
              html`<div class="stack"><span>${p.nombre}</span>${cuantoDa(p, p.unido, 'o')}</div>`,
          ),
        )}</div>`;

  return html`${fin}${heroPanel}${listaHeroes}${listaPueblos}${listaAldeas}
    <h3>Crónica</h3>${renderLog(
      session.cronica(60),
      session.viewer,
      (id) => session.lugarDelMundo(id),
      (id) => session.sitioDeLaCronica(id),
    )}`;
}

/**
 * «Dormir» o «Despertar»: un héroe dormido no lo ofrece «Siguiente héroe» ni
 * cuenta en la pregunta de fin de turno (#17). Mandarlo a andar lo despierta.
 */
function botonDeSueño(session: Session, hero: Hero): Html {
  const duerme = session.estaDormido(hero.id);
  return html`<button data-action="sleep-hero" data-hero="${hero.id}" class="dormir"
    title="${duerme ? 'Vuelve a contar con él al pasar el turno' : 'No se le esperará al pasar el turno'}">${duerme ? 'Despertar' : 'Dormir'}</button>`;
}

/**
 * «Tropa»: abre la escena de la tropa del héroe elegido (también con la T). Fuera
 * de tu turno sale apagado con el motivo del núcleo (`tropaBlocker`).
 */
function botonDeLaTropa(session: Session): Html {
  const motivo = session.tropaBlocker();
  return html`<button data-action="abrir-tropa" class="abrir-tropa" title="${motivo ?? 'Ver a la tropa en escena y repartirle equipo (tecla T)'}" ${motivo === null ? NADA : DESHABILITADO}>Tropa</button>`;
}

/**
 * La experiencia del héroe con el umbral del rango siguiente: «176 000 / 304 000». El
 * héroe no tiene tope, así que siempre hay siguiente —y si la tabla se acabara,
 * `umbral` lo diría lanzando en vez de pintar un «null»—; el umbral lo da el
 * núcleo —una sola tabla para tropa y héroe— y el panel no sabe cuánto cuesta
 * un rango.
 */
function experienciaDeHeroe(experiencia: number): string {
  return `${conMiles(experiencia)} / ${conMiles(umbral(rangoDe(experiencia) + 1))}`;
}

/**
 * Una fila de hechizo: nombre —con su nivel donde importa— y coste en maná. La
 * pintan el libro del héroe y la lista del gremio, que solo se diferencian en
 * eso. El tercer pintor, `renderSpells`, NO entra aquí: son botones con
 * `disabled` y `title`, y forzarlos en este molde saldría más caro que la copia.
 */
export function filaHechizo(s: Hechizo, conNivel = false): Html {
  const nivel =
    conNivel && s.gremio !== null ? html` <span class="count">n.${s.gremio}</span>` : NADA;
  return html`<div class="stack"><span>${s.nombre}${nivel}</span><span class="count">${s.mana}</span></div>`;
}

/**
 * El libro de un héroe: nombre y coste, que es lo que se decide con ellos. En
 * el orden del libro (`enOrdenDelLibro`) y no en el que se aprendió: el héroe
 * inicial y uno contratado con los mismos hechizos los enseñaban distinto (#54).
 */
export function renderSpellbook(spells: readonly string[]): Html {
  if (spells.length === 0) {
    return html`<div class="stack-list"><div class="stack empty">Sin hechizos: llévalo a un castillo con gremio</div></div>`;
  }
  const filas = unir(enOrdenDelLibro(spells).map((s) => filaHechizo(s)));
  return html`<div class="stack-list">${filas}</div>`;
}

/**
 * El equipo del héroe —los cuatro huecos, con «×» para quitar— y su mochila, donde
 * cada pieza se pulsa para elegirla y ponérsela a alguien. Sin reglas: el motivo
 * de un rechazo lo escribe el núcleo y sale en la barra.
 */
function renderEquipoDelHeroe(hero: Hero, elegida: string | null): Html {
  const huecos = unir(
    HUECOS.map((hueco) => {
      const id = hero.equipo[hueco];
      if (id === undefined) {
        return html`<div class="stack empty"><span>${NOMBRE_DE_HUECO[hueco]}: —</span></div>`;
      }
      const p = pieza(id);
      return html`<div class="stack"><span>${NOMBRE_DE_HUECO[hueco]}: ${p.nombre}<span class="veterania">${modificadoresEnPantalla(p)}</span></span><span class="count"><button data-action="unequip" data-hero="${hero.id}" data-slot="${hueco}" title="Quitársela y guardarla en la mochila">×</button></span></div>`;
    }),
  );
  const mochila =
    hero.mochila.length === 0
      ? html`<div class="stack empty"><span>Vacía: el botín y lo que compres caen aquí</span></div>`
      : unir(
          hero.mochila.map((id) => {
            const p = pieza(id);
            const marca = id === elegida ? ' ◆' : '';
            return html`<button data-action="select-item" data-item="${id}" class="stack" title="Elegirla para ponérsela a alguien">
              <span>${p.nombre}${marca}<span class="veterania">${NOMBRE_DE_HUECO[p.hueco]} · ${modificadoresEnPantalla(p)}</span></span>
            </button>`;
          }),
        );
  const ponersela =
    elegida === null
      ? NADA
      : html`<button data-action="equip" data-hero="${hero.id}" class="primary">Ponérsela a ${hero.name}</button>
        <p class="cost">O pulsa «Equipar» en una fila de la tropa.</p>`;
  return html`<h3>Equipo</h3><div class="stack-list">${huecos}</div>
    <h3>Mochila · ${hero.mochila.length}</h3><div class="stack-list">${mochila}</div>${ponersela}`;
}

/**
 * La tropa del héroe en el mapa, con lo que lleva cada uno, el «−1» que licencia
 * uno de cada tipo (`botonDeLicenciar`, en cualquier casilla desde el 09-11-2026)
 * y, si hay una pieza elegida, un «Equipar» por fila. En la fila de un individuo
 * con hoja se le pone a ÉL (`veteran`); en la de novatos, al primero sin equipar
 * de ese tipo (`creature`), que es a quien se la pone el núcleo (`quienRecibe`).
 */
function renderTropaEquipable(hero: Hero, elegida: string | null): Html {
  if (hero.army.length === 0) return renderArmy(hero.army);
  // A quién iría la pieza desde esta fila lo dice el núcleo (`destinoDeEquipo`):
  // el de hoja, por su id; una fila de novatos, por su tipo.
  const boton = (g: TroopGroup): Html => {
    if (elegida === null) return NADA;
    if (g.veterania !== undefined) {
      return html` <button data-action="equip" data-hero="${hero.id}" data-veteran="${g.veterania.id}">Equipar</button>`;
    }
    return 'motivo' in destinoDeEquipo(hero, { creature: g.creature })
      ? NADA
      : html` <button data-action="equip" data-hero="${hero.id}" data-creature="${g.creature}">Equipar</button>`;
  };
  const filas = unir(
    troopSummary(hero.army).map((g) =>
      filaDeTropa(g, {
        boton: html`${botonDeLicenciar(hero.id, hero.army, g)}${boton(g)}`,
        quitarDe: hero.id,
      }),
    ),
  );
  return html`<div class="stack-list">${filas}</div>`;
}
