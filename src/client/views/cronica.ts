/**
 * La crónica de la partida (`renderLog`): cada hecho que llega a quien lee, en una línea
 * y con su color si le suma o le resta, y la de una batalla terminada
 * (`fraseDeBatalla`). La comparten el lateral del mapa de la partida y el espectador.
 * Era parte de `views/panels.ts` hasta la fase C de la reorganización (07-11-2026).
 */
import { enRondas } from '@core/battle/effects.js';
import { HERO_BODY, SIDES, type Side } from '@core/battle/types.js';
import { pieza } from '@core/equipo/pieza.js';
import { nombreDeHechizo } from '@core/magia/catalogo.js';
import type { Lugar } from '@core/mundo/formato.js';
import { loQueLaPara } from '@core/state/asaltantes.js';
import { desenlaceDe } from '@core/state/desenlace.js';
import type { GameEventDraft } from '@core/state/events.js';
import { delSitio, nombreDelSitio, type Sitio } from '@core/state/sitios.js';
import { conMiles, describirCoste } from '@core/texto.js';
import { building } from '@core/town/buildings.js';
import type { Point } from '@core/types.js';
import { unidadDelJuego } from '@core/unidad/catalogo.js';
import { DICHO_DE_LA_OBRA } from '../comun/dichos.js';
import { type Html, html, NADA, unir } from '../comun/html.js';
import { quienesDe } from '../comun/quien-mira.js';

/**
 * «2 × Orko, 1 × Goblin»: lo que se movió entre un héroe y una guarnición, por tipo.
 * Con comas y no con «y»: la frase del reparto ya junta con «y» lo que deja y lo
 * que recoge.
 */
function tropaMovida(
  grupos: readonly { readonly creature: string; readonly count: number }[],
): string {
  return grupos.map((g) => `${g.count} × ${unidadDelJuego(g.creature).name}`).join(', ');
}

/** «1 individuo», «6 individuos». */
function individuos(n: number): string {
  return `${n} ${n === 1 ? 'individuo' : 'individuos'}`;
}

/** Cómo se llama un cuerpo del tablero en la crónica: el héroe no está en el catálogo. */
function nombreDeCuerpo(body: string): string {
  if (body === HERO_BODY) return 'el héroe';
  return unidadDelJuego(body).name;
}

/**
 * La línea de una batalla terminada: quién ganó y en cuántas rondas, qué
 * perdió cada bando y qué hechizos se lanzaron. `suyo` es el bando de quien
 * lee, o `null` si no es de ninguno (el espectador, o un tercero que miraba).
 */
function fraseDeBatalla(
  e: Extract<GameEventDraft, { kind: 'battle_ended' }>,
  suyo: Side | null,
  /** El lugar de la batalla, si es de uno que se conoce: se nombran él y su encuentro. */
  lugar: Lugar | null,
  /** « en (7, 8)», o nada si la línea ya lleva a su casilla (la de `renderLog`). */
  enLaCasilla: (at: Point | null) => string,
): string {
  /**
   * Contra quién (#18), con lo que trae el hecho: el atacante es un héroe (con
   * dueño) o un grupo de asaltantes (sin él, la emboscada); el defensor lo dice
   * `foe`. Un héroe sin dueño o una guarnición de castillo sin `foe: town` no
   * existen, y se lanza en vez de inventarles nombre.
   */
  const quienLucha = (s: Side): { uno: string; el: string } => {
    const dueño = e.owners[s];
    const kind = s === 'attacker' ? (dueño === null ? 'raider' : 'hero') : e.foe.kind;
    switch (kind) {
      case 'hero':
        if (dueño === null) throw new Error('la crónica cuenta una batalla de un héroe sin dueño');
        return { uno: `un héroe del jugador ${dueño}`, el: `el jugador ${dueño}` };
      case 'monster':
        return { uno: 'un monstruo', el: 'el monstruo' };
      case 'raider':
        return { uno: 'un grupo de asaltantes', el: 'el grupo de asaltantes' };
      case 'garrison':
        // La neutral es la de una ciudad neutral (la de su región, si la ocupa).
        return dueño === null
          ? { uno: 'una guarnición neutral', el: 'la guarnición' }
          : { uno: `la guarnición de un sitio del jugador ${dueño}`, el: `el jugador ${dueño}` };
      case 'lugar': {
        const encuentro =
          e.foe.kind === 'lugar' && lugar !== null ? lugar.encuentros[e.foe.encuentro] : undefined;
        return encuentro === undefined
          ? { uno: 'los de un lugar', el: 'los del lugar' }
          : { uno: `«${encuentro.nombre}»`, el: `«${encuentro.nombre}»` };
      }
    }
  };
  // En tercera persona, cada bando por quién es —el jugador, o el monstruo, el
  // grupo, la guarnición—, como el resto de la crónica; desde un bando, tú y el
  // enemigo, que ya se ha dicho quién es en la cabeza.
  const bando = (s: Side): string =>
    suyo === null ? quienLucha(s).el : s === suyo ? 'tú' : 'el enemigo';
  const rondas = enRondas(e.rounds);
  const donde = lugar === null ? enLaCasilla(e.at) : ` en\u00a0«${lugar.nombre}»`;
  const cabeza =
    suyo === null
      ? `Batalla${donde}: ${quienLucha('attacker').uno} contra ${quienLucha('defender').uno}; gana ${bando(e.winner)} en ${rondas}`
      : `Batalla ${suyo === e.winner ? 'ganada' : 'perdida'} contra ${
          quienLucha(suyo === 'attacker' ? 'defender' : 'attacker').uno
        }${donde}, en ${rondas}`;
  const partes = [cabeza];
  for (const s of SIDES) {
    const bajas = e.lost[s];
    if (bajas.length === 0) continue;
    const quien = bando(s);
    // Con dos puntos en tercera persona (#202): «pierde el jugador 1 2 × Momia»
    // se leía como un solo número, el 12.
    const caidos = bajas.map((b) => `${b.count}\u00a0× ${nombreDeCuerpo(b.creature)}`).join(', ');
    partes.push(quien === 'tú' ? `pierdes ${caidos}` : `pierde ${quien}: ${caidos}`);
  }
  for (const c of e.casts) {
    const mata = c.killed > 0 ? ` (mata ${c.killed})` : '';
    const quien = bando(c.side);
    partes.push(
      `${quien === 'tú' ? 'lanzas' : `lanza ${quien}`} ${nombreDeHechizo(c.spell)}${c.target === null ? '' : ` sobre ${nombreDeCuerpo(c.target)}`}${mata}`,
    );
  }
  return partes.join('; ');
}

/** Lo que `renderLog` sabe además de los hechos, según quién la pinte. */
interface LecturaDeLaCronica {
  /**
   * El lugar de un mundo por su id, para nombrarlo: los hechos de un lugar llevan
   * su id y no su casilla, que no dice nada a quien juega. Sin mundo (el
   * espectador), ninguno, y la frase dice la casilla.
   */
  readonly lugarDe?: (id: string) => Lugar | null;
  /**
   * El sitio de una guarnición o de un nodo tomado por su id, para nombrarlo («la
   * guarnición del paso de montaña de (13,7)», «Pueblo tomado: El Soto»): sin él,
   * la casilla (el espectador lo da de los pasos y los pueblos del cable).
   */
  readonly sitioDe?: (id: string) => Sitio | null;
  /**
   * Cada línea con casilla es un botón que lleva la cámara a ella (#202), y la
   * frase deja de decir « en (12, 5)»: el botón ya lleva allí, y una coordenada
   * que ninguna pantalla enseña no sitúa nada. Solo la partida, que tiene cámara
   * que mover; el espectador mira el mapa entero desde lo más lejos y sigue
   * diciendo la casilla.
   */
  readonly llevaALaCasilla?: boolean;
}

/**
 * La crónica de la pantalla.
 *
 * Aquí NO se filtra: llega filtrada. Quien juega la pide a `Session.cronica`,
 * que pasa por `cronicaPara` como la del agente; el espectador, entera. Fue
 * entera también para quien juega mientras el lienzo pintaba con `player.fog`
 * —filtrar solo la crónica dejaba al rival andando por el mapa sin una línea
 * que lo contara—, y se filtró con el lienzo, a la vez (#64).
 *
 * Lo que sí se arregla es que MENTÍA. Sin dueño en el evento, `built`,
 * `recruited` y la guarnición recogida se pintaban igual fueran de quien fueran —lo
 * del rival parecía tuyo—, `spells_learned` salía siempre en verde y
 * `hero_defeated` siempre en rojo: cuando el que caía era el héroe ENEMIGO, a
 * la persona se le pintaba como derrota propia. El color se sigue usando para
 * distinguir lo tuyo de lo suyo, que es presentación y es a propósito, pero
 * ahora con el dato en la mano en vez de suponiéndolo.
 *
 * Toma `GameEventDraft` y no `GameEvent`, o sea la crónica **sin el sello**: no
 * lee `seen` ni una vez, y así vale también para el espectador, al que la crónica
 * le llega ya sin él. Un `GameEvent` encaja donde se pide un borrador, así que el
 * cliente que juega sigue llamando igual.
 *
 * `viewer` es quien la lee. El espectador no es nadie —no tiene un «tú»—, y por
 * eso pasa un id que no es de ningún jugador: entonces toda la crónica se lee en
 * tercera persona, que es lo correcto para quien mira desde fuera, y sin color
 * (`linea`): ni gana ni pierde nada de lo que pasa.
 */
export function renderLog(
  log: readonly GameEventDraft[],
  viewer: number,
  { lugarDe = () => null, sitioDe = () => null, llevaALaCasilla = false }: LecturaDeLaCronica = {},
): Html {
  /**
   * El color de la línea, para quien no lleva bando, ninguno: lo decide aquí una
   * vez y no cada rama. Con la pregunta de dos de cada rama, `clase(!mio, mio)`
   * —la caída y la vuelta a la base de un héroe, donde lo tuyo es lo malo— salía
   * en el verde de victoria en el espectador, que no es nadie y para quien `mio`
   * es siempre falso (#202).
   */
  const sinBando = quienesDe(viewer).size === 0;
  /**
   * Una línea de la crónica: verde lo que te suma, rojo lo que te resta (como
   * `clase` en el parte de batalla) y, con `llevaALaCasilla` y una casilla, el
   * botón que lleva la cámara a `lleva`. Sin él, el marcado de siempre.
   */
  const linea = (bueno: boolean, malo: boolean, contenido: string, lleva: Point | null): Html => {
    const tono = sinBando ? null : bueno ? 'win' : malo ? 'lose' : null;
    if (llevaALaCasilla && lleva !== null) {
      const clases = tono === null ? 'a-la-casilla' : `a-la-casilla ${tono}`;
      return html`<button type="button" class="${clases}" data-action="mirar-la-casilla" data-x="${lleva.x}" data-y="${lleva.y}" title="Ver en el mapa">${contenido}</button>`;
    }
    return tono === null
      ? html`<div>${contenido}</div>`
      : html`<div class="${tono}">${contenido}</div>`;
  };
  /**
   * « en (12, 5)»: dónde pasó un hecho de la crónica, o nada si no pasa en ningún
   * sitio (el día, el final) o si la línea ya lleva a su casilla. Es la casilla que
   * el hecho ya trae (`at`) y no un nombre de castillo o de región: el hecho no
   * lleva más, y buscarlo en el estado haría de la crónica algo que el espectador
   * —que no tiene el estado— no puede pintar. La casilla ya pasó la niebla con el
   * hecho (`cronicaPara`): o el hecho es tuyo, o la mirabas cuando ocurrió.
   */
  const enLaCasilla = (at: Point | null): string =>
    // Espacios duros: en la caja estrecha la casilla se partía en «(10,» y «4)»
    // (visto en la captura), y una coordenada partida no se lee como una.
    at === null || llevaALaCasilla ? '' : ` en\u00a0(${at.x},\u00a0${at.y})`;
  /** «El osario», con sus comillas, si se conoce; si no, `null`. */
  const nombreDelLugar = (lugar: string): string | null => {
    const l = lugarDe(lugar);
    return l === null ? null : `«${l.nombre}»`;
  };
  /** «en «El osario»» si el hecho es de un lugar que se conoce; si no, la casilla. */
  const enElLugar = (lugar: string | undefined, at: Point | null): string => {
    const l = lugar === undefined ? null : lugarDe(lugar);
    return l === null ? enLaCasilla(at) : ` en\u00a0«${l.nombre}»`;
  };
  /**
   * Quién, en las tres formas que pide la frase: sujeto, genitivo y dativo.
   * Son tres y no una porque componer «de» o «a» con el sujeto no vale en
   * español, y no es teórico: en pantalla salió «Castillo de tú capturado» y
   * habría salido «Mina capturada a el jugador 1». El número es el mismo que
   * enseña todo lo demás — dos numeraciones para la misma cosa es una trampa.
   *
   * El genitivo de quien lee, «tuyo», concuerda con lo que lleva delante: solo
   * va tras un nombre masculino del texto («un héroe tuyo»), nunca tras el de
   * una unidad del catálogo, que puede ser «Sacerdotisa» (#202).
   */
  const jugador = (id: number | null): string =>
    id === null ? 'Alguien' : id === viewer ? 'Tú' : `El jugador ${id}`;
  const deJugador = (id: number | null): string =>
    id === null ? 'de alguien' : id === viewer ? 'tuyo' : `del jugador ${id}`;
  const alJugador = (id: number | null): string =>
    id === null ? 'a alguien' : id === viewer ? 'a ti' : `al jugador ${id}`;

  /**
   * El sitio `site` de un hecho dicho con `delSitioA` si se conoce y, si no (el
   * espectador), `sinSitio` con la casilla: «el puente de (12,8)» o «el puesto en
   * (12, 8)».
   */
  const sitioOCasilla = (
    site: string,
    at: Point | null,
    delSitioA: (s: Sitio) => string,
    sinSitio: string,
  ): string => {
    const sitio = sitioDe(site);
    return sitio === null ? `${sinSitio}${enLaCasilla(at)}` : delSitioA(sitio);
  };
  /** «en la guarnición de Valdeluz», o, sin el sitio, «en la guarnición en (3, 4)». */
  const enLaGuarnicion = (site: string, at: Point | null): string =>
    sitioOCasilla(site, at, (s) => `en la guarnición ${delSitio(s)}`, 'en la guarnición');
  /** «de la guarnición del puente de (12,8)», o, sin el sitio, con su casilla. */
  const deLaGuarnicion = (site: string, at: Point | null): string =>
    sitioOCasilla(site, at, (s) => `de la guarnición ${delSitio(s)}`, 'de la guarnición');

  const lineas = log
    .slice(-60)
    // El `switch` de dentro cubre la unión entera de `e.kind` y NO tiene
    // `default`: un `kind` al que nadie le haya escrito su frase tiene que
    // ponerse rojo, no colarse por la rama de abajo. Quien lo pone rojo es el
    // `never` del final, igual que en `contract/mapa-conocido.ts`.
    //
    // Cada rama lleva a `e.at` salvo la dispersión de un grupo, que lo esconde.
    .map((e): Html => {
      const mio = e.actor === viewer;
      // Dónde (#18): «Paso tomado» no decía cuál, y con once nodos por bando
      // eso es no decir nada. Va al final de la frase para que lo primero que
      // se lea siga siendo qué pasó.
      const aqui = enLaCasilla(e.at);
      switch (e.kind) {
        case 'day_start':
          return linea(false, false, `— Día ${e.day} —`, e.at);
        case 'gold_gained':
          return mio
            ? linea(
                true,
                false,
                `+${conMiles(e.amount)} de oro${enElLugar(
                  e.from === 'lugar' ? e.lugar : undefined,
                  e.at,
                )}`,
                e.at,
              )
            : NADA;
        case 'gold_paid':
          return mio
            ? linea(false, true, `−${conMiles(e.amount)} de oro${enElLugar(e.lugar, e.at)}`, e.at)
            : NADA;
        case 'place_state':
          // El nombre del lugar y el de su estado los escribió el motor: van en
          // huecos de texto y la plantilla los escapa.
          return linea(mio, false, `«${e.nombre}» queda ${e.dicho}`, e.at);
        case 'item_given':
          return linea(
            false,
            mio,
            `${mio ? 'Entregado' : `${jugador(e.actor)} entrega`}${enElLugar(e.lugar, e.at)}: ${
              pieza(e.item).nombre
            }`,
            e.at,
          );
        case 'troops_joined':
          // Con dos puntos tras el jugador (#202): «Se unen al jugador 1 3 × …» se
          // leía como un solo número.
          return linea(
            mio,
            false,
            `${mio ? 'Se te unen' : `Se unen ${alJugador(e.actor)}:`} ${e.count} × ${
              unidadDelJuego(e.creature).name
            }${enElLugar(e.lugar, e.at)}`,
            e.at,
          );
        case 'node_captured': {
          // El pueblo del muro se toma como un paso y es el mismo hecho, pero se
          // nombra por lo que es: «Paso tomado en (8, 14)» de El Soto no decía qué
          // se había tomado (vuelta 1 de QA de la tarea 2, H2). El paso, sin
          // nombre, por su casilla.
          const sitio = sitioDe(e.node);
          if (sitio?.kind === 'pueblo') {
            const nombre = nombreDelSitio(sitio);
            return linea(
              mio,
              e.from === viewer,
              mio
                ? `Pueblo tomado${e.from === null ? '' : ` ${alJugador(e.from)}`}: ${nombre}`
                : e.from === viewer
                  ? `${jugador(e.actor)} te ha quitado ${nombre}`
                  : `${jugador(e.actor)} toma el pueblo de ${nombre}`,
              e.at,
            );
          }
          return linea(
            mio,
            e.from === viewer,
            `${
              mio
                ? `Paso tomado${e.from === null ? '' : ` ${alJugador(e.from)}`}`
                : e.from === viewer
                  ? `${jugador(e.actor)} te ha quitado un paso`
                  : `${jugador(e.actor)} toma un paso`
            }${aqui}`,
            e.at,
          );
        }
        case 'town_captured':
          // El criterio 9: a costa de quién. «Castillo capturado» a secas era
          // media verdad justo en el evento que decide la partida.
          return linea(
            mio,
            e.from === viewer,
            `${
              mio
                ? `Has capturado un castillo ${e.from === null ? 'neutral' : deJugador(e.from)}`
                : e.from === viewer
                  ? `${jugador(e.actor)} te ha capturado un castillo`
                  : `${jugador(e.actor)} captura un castillo ${
                      e.from === null ? 'neutral' : deJugador(e.from)
                    }`
            }${aqui}`,
            e.at,
          );
        case 'town_owner_changed': {
          // La ciudad de dentro de una región, que va con ella: nadie la toma.
          const ciudad = sitioOCasilla(e.town, e.at, (s) => nombreDelSitio(s), 'una ciudad');
          return linea(
            e.to === viewer,
            e.from === viewer,
            e.to === viewer
              ? `${ciudad} es tuya: su región ya es tuya`
              : e.from === viewer
                ? `Pierdes ${ciudad}: su región ya no es tuya`
                : `${ciudad} pasa ${e.to === null ? 'a no ser de nadie' : alJugador(e.to)}`,
            e.at,
          );
        }
        case 'site_occupied': {
          const sitio = sitioOCasilla(e.site, e.at, (s) => nombreDelSitio(s), 'un sitio');
          // «una guarnición tuya»: `deJugador` dice «tuyo», que es para «un héroe».
          const quien =
            e.by.kind === 'heroe'
              ? `un héroe ${deJugador(e.by.dueño)}`
              : e.by.dueño === null
                ? 'una guarnición neutral'
                : e.by.dueño === viewer
                  ? 'una guarnición tuya'
                  : `una guarnición ${deJugador(e.by.dueño)}`;
          // Mío: me lo ocupan (rojo). Del ocupante: lo ocupa él (verde).
          const ocupa = quien.charAt(0).toUpperCase() + quien.slice(1);
          return linea(
            e.by.dueño === viewer,
            mio,
            mio
              ? `${ocupa} ocupa ${sitio}: no te da nada hasta que eches al ocupante`
              : `${ocupa} ocupa ${sitio}`,
            e.at,
          );
        }
        case 'site_freed': {
          const sitio = sitioOCasilla(e.site, e.at, (s) => nombreDelSitio(s), 'un sitio');
          return linea(
            mio,
            false,
            mio ? `${sitio} queda libre: vuelve a darte lo suyo` : `${sitio} queda libre`,
            e.at,
          );
        }
        case 'built':
          return linea(
            mio,
            false,
            `${mio ? 'Construido' : `${jugador(e.actor)} construye`}${aqui}: ${
              building(e.building).name
            }`,
            e.at,
          );
        case 'recruited':
          return linea(
            mio,
            false,
            `${mio ? 'Reclutados' : `${jugador(e.actor)} recluta`} ${e.count} × ${
              unidadDelJuego(e.creature).name
            }${aqui}`,
            e.at,
          );
        case 'dismissed':
          return linea(
            mio,
            false,
            `${mio ? 'Licenciados' : `${jugador(e.actor)} licencia`} ${e.count} × ${
              unidadDelJuego(e.creature).name
            }${aqui}`,
            e.at,
          );
        // Lo que no cupo tras una batalla (08-11-2026, «Levantar zombi»): quién lo
        // deja y, si es una guarnición, lo que se perdió con ellos (P7).
        case 'left_behind': {
          const quien =
            e.site === null
              ? mio
                ? 'Tu héroe deja'
                : `${jugador(e.actor)} deja`
              : `La guarnición ${sitioOCasilla(e.site, e.at, delSitio, 'de un sitio')} deja`;
          const pierde =
            e.lost.length === 0
              ? ''
              : `; se pierde lo que llevaban: ${e.lost.map((id) => pieza(id).nombre).join(', ')}`;
          return linea(
            false,
            mio,
            `${quien} ${e.count} × ${unidadDelJuego(e.creature).name}${aqui}: no cabe tras la batalla${pierde}`,
            e.at,
          );
        }
        case 'hero_hired':
          return linea(
            mio,
            false,
            `${mio ? 'Héroe contratado' : `${jugador(e.actor)} contrata un héroe`}${aqui}`,
            e.at,
          );
        case 'loot_found':
          // El botín se cuenta porque cae en la mochila, que no se ve en el mapa:
          // sin esta línea la pieza aparecería en el panel sin saber de dónde.
          return linea(
            mio,
            false,
            `${mio ? 'Botín' : `${jugador(e.actor)} se lleva un botín`} ${
              e.from === 'lugar'
                ? `de ${nombreDelLugar(e.lugar) ?? `un lugar${aqui}`}`
                : e.from === 'raider'
                  ? `de unos asaltantes${aqui}`
                  : `de una ciudad neutral${aqui}`
            }: ${pieza(e.item).nombre}`,
            e.at,
          );
        case 'item_bought':
          return linea(
            mio,
            false,
            `${mio ? 'Comprado en la armería' : `${jugador(e.actor)} compra en la armería`}${aqui}: ${
              pieza(e.item).nombre
            }`,
            e.at,
          );
        case 'hero_promoted': {
          // El nombre lo escribió el narrador: va en un hueco de texto y la
          // plantilla lo escapa, como el de cualquier pueblo del agente.
          //
          // Con posesivo y no con «Un … tuyo» (#202): el nombre de la unidad puede
          // ser femenino («Un Sacerdotisa») y el catálogo no dice el género. «Tu» y
          // «su» valen para cualquiera.
          const unidad = unidadDelJuego(e.creature).name;
          return linea(
            mio,
            false,
            mio
              ? `Haces héroe a tu ${unidad}${aqui}: ${e.name}`
              : `${jugador(e.actor)} hace héroe a su ${unidad}${aqui}: ${e.name}`,
            e.at,
          );
        }
        // La guarnición se nombra por su sitio (H4 del QA de la fase 1): «la guarnición
        // del paso de montaña de (13,7)» dice cuál; «en (13, 7)», no.
        case 'troops_left':
          return linea(
            mio,
            false,
            `${mio ? 'Dejas' : `${jugador(e.actor)} deja`} ${tropaMovida([e])} ${enLaGuarnicion(
              e.site,
              e.at,
            )}`,
            e.at,
          );
        case 'troops_taken':
          return linea(
            mio,
            false,
            `${mio ? 'Recoges' : `${jugador(e.actor)} recoge`} ${tropaMovida([e])} ${deLaGuarnicion(
              e.site,
              e.at,
            )}`,
            e.at,
          );
        case 'troops_exchanged': {
          const deja = e.left.length === 0 ? null : tropaMovida(e.left);
          const recoge = e.taken.length === 0 ? null : tropaMovida(e.taken);
          const partes = [
            deja === null ? null : `${mio ? 'dejas' : 'deja'} ${deja}`,
            recoge === null ? null : `${mio ? 'recoges' : 'recoge'} ${recoge}`,
          ].filter((x) => x !== null);
          const frase = partes.join(' y ');
          return linea(
            mio,
            false,
            `${
              mio ? frase.charAt(0).toUpperCase() + frase.slice(1) : `${jugador(e.actor)} ${frase}`
            } ${enLaGuarnicion(e.site, e.at)}`,
            e.at,
          );
        }
        case 'outpost_upgraded': {
          const elPuesto = sitioOCasilla(e.site, e.at, nombreDelSitio, 'el puesto');
          const obra = DICHO_DE_LA_OBRA[e.to].cronica(mio, elPuesto);
          return linea(
            mio,
            false,
            `${mio ? obra : `${jugador(e.actor)} ${obra}`} por ${describirCoste(e.cost)}`,
            e.at,
          );
        }
        case 'defense_set': {
          const sitio = sitioDe(e.site);
          const donde = sitio === null ? '' : ` ${nombreDelSitio(sitio)}`;
          const fuera = sitio === null ? aqui : '';
          return linea(
            mio,
            false,
            `${
              mio
                ? `Defiendes${donde} con ${individuos(e.fighting)} y dejas fuera ${individuos(e.staying)}`
                : `${jugador(e.actor)} defiende${donde} con ${individuos(e.fighting)} y deja fuera ${individuos(e.staying)}`
            }${fuera}`,
            e.at,
          );
        }
        case 'spells_learned':
          return linea(
            mio,
            false,
            `${mio ? 'Aprendido' : `${jugador(e.actor)} aprende`}${aqui}: ${e.spells
              .map((id) => nombreDeHechizo(id))
              .join(', ')}`,
            e.at,
          );
        case 'battle_ended': {
          // Lo que sobrevive de la batalla (#93): antes, «Batalla resuelta» y
          // nada más, ni quién ganó. El bando de quien lee sale de `owners`, que
          // viaja en el hecho; el espectador no tiene bando y lo lee en tercera.
          const suyo: Side | null =
            e.owners.attacker === viewer
              ? 'attacker'
              : e.owners.defender === viewer
                ? 'defender'
                : null;
          return linea(
            suyo === e.winner,
            suyo !== null && suyo !== e.winner,
            fraseDeBatalla(
              e,
              suyo,
              e.foe.kind === 'lugar' ? lugarDe(e.foe.lugar) : null,
              enLaCasilla,
            ),
            e.at,
          );
        }
        case 'hero_defeated':
          // `actor` es el dueño del MUERTO, así que aquí «mío» es la derrota y
          // lo del rival es una victoria. Antes las dos salían en rojo, y a la
          // persona se le pintaba como propia la muerte del héroe enemigo.
          return linea(
            !mio,
            mio,
            `${mio ? 'Un héroe tuyo ha caído' : `Ha caído un héroe ${deJugador(e.actor)}`}${aqui}`,
            e.at,
          );
        case 'hero_returned':
          // Volver a la base es perder (la tropa o el oro) pero no la partida:
          // el color es el de una derrota tuya o una victoria sobre el rival.
          return linea(
            !mio,
            mio,
            `${
              mio
                ? 'Un héroe tuyo vuelve a la base'
                : `Un héroe ${deJugador(e.actor)} vuelve a su base`
            }${aqui}${e.surrendered ? ` tras rendirse por ${conMiles(e.gold)} de oro` : ''}`,
            e.at,
          );
        case 'rank_up':
          // El rango reparte cuerpo y liderazgo, pero eso no se ve en el mapa:
          // si no se contara aquí, subir pasaría sin que nadie lo notara. Todo
          // héroe nace en el 5 (una sola escala con la tropa), así que la
          // primera línea de estas que se lee es «sube a rango 6». El nivel no
          // va: es el de sus cifras de hoy, no el de entonces.
          return linea(
            mio,
            false,
            `Un héroe ${deJugador(e.actor)} sube a rango ${e.rank}${aqui}`,
            e.at,
          );
        case 'troop_rank_up': {
          // La tropa también sube, y es lo que se pidió que se viera: un
          // veterano no se distingue en el mapa, así que el ascenso se cuenta.
          // Ni «Un», ni «tuyo», ni «veterano» concuerdan con un nombre femenino
          // (#202): la frase no depende del género de la unidad.
          const unidad = unidadDelJuego(e.creature).name;
          return linea(
            mio,
            false,
            mio
              ? `Tu ${unidad} sube a rango ${e.rank} de veteranía${aqui}`
              : `${jugador(e.actor)}: su ${unidad} sube a rango ${e.rank} de veteranía${aqui}`,
            e.at,
          );
        }
        case 'game_over': {
          // El ganador es `actor`, y ya no hay un `winner` al lado diciendo lo
          // mismo: `visibleTo` enrutaba por uno y esta línea pintaba por el
          // otro, sin que nada comprobara que coincidían.
          //
          // Y NO va por `mio`, que es la pregunta de dos: con `actor: null` —el
          // empate por días— `!mio` es `true` y el fin de partida salía en el
          // rojo de derrota. Es el mismo fallo que `desenlaceDe` existe para
          // impedir, un panel más allá, y esta línea la pinta también el
          // espectador, que no tiene bando.
          const fin = desenlaceDe(e.actor, quienesDe(viewer));
          return linea(fin === 'ganada', fin === 'perdida', 'Fin de la partida', e.at);
        }

        // Los que la pantalla NO pinta, escritos uno a uno en vez de
        // caer por un `default`. El núcleo ya te obliga a decidir si un `kind`
        // nuevo se reparte (`visibleTo`); esto te obliga a decidir si se lee, y
        // con el `default` puesto se colaba sin frase y sin ponerse nada rojo
        // — que es como `built` y `recruited` se pasaron la vida
        // misatribuyendo.
        //
        // El turno y la derrota los cuenta ya la barra de arriba, el paso a
        // paso del héroe ahogaría el resto de la crónica, y el principio de una
        // batalla se ve en el propio tablero.
        case 'battle_started':
          // El principio de una batalla se ve en el tablero, salvo el de una
          // emboscada: ahí la batalla no la pidió nadie y hay que decir por qué
          // se ha parado el héroe.
          if (e.attacker.kind !== 'raider') return NADA;
          return linea(
            false,
            mio,
            `${
              mio
                ? '¡Emboscada! Unos asaltantes atacan a un héroe tuyo'
                : `Unos asaltantes emboscan a un héroe ${deJugador(e.actor)}`
            }${aqui}`,
            e.at,
          );
        case 'march_halted':
          // Es lo que explica que el héroe se haya quedado a medio camino con
          // puntos de sobra: sin esta línea parecería un fallo de la marcha.
          return linea(
            false,
            false,
            `${
              mio ? 'Un héroe tuyo se detiene' : `Un héroe ${deJugador(e.actor)} se detiene`
            }${aqui}: ${loQueLaPara(e.troops)}`,
            e.at,
          );
        case 'raider_dispersed':
          // Sin casilla, y es la única: `actor` es quien cerró la región, que
          // puede estar lejos, y el hecho le consta por ser suyo aunque no viera
          // al grupo. Su `at` es donde estaba el grupo, que la niebla le
          // escondía: decirlo aquí —o llevar la cámara allí— sería enseñarle la
          // patrulla que no veía.
          return linea(
            mio,
            false,
            mio ? 'Los asaltantes de tu región se dispersan' : 'Unos asaltantes se dispersan',
            null,
          );
        // Que hay un grupo en el mapa es un hecho DE MAPA, y el mapa lo pinta:
        // contarlo aquí eran catorce líneas el día 1, y esta crónica no pasa por
        // la niebla. Uno solo —ni los de salida ni los que brotan—, para que la
        // regla no dependa de cuándo nació el grupo.
        // Una marca del mundo es contabilidad del motor de narrativa: lo que se ve
        // es lo que hace (el estado del lugar, lo que se da), que va en su línea.
        case 'world_mark':
        case 'raider_spawned':
        case 'turn_start':
        case 'hero_moved':
        case 'player_defeated':
          return NADA;
        // Que la marcha se corte al acabarse los puntos ya lo enseñaba la ruta,
        // que pinta aparte lo que no llega hoy: aquí sería ruido en cada clic
        // lejano. Es para el agente, que no ve la ruta.
        case 'march_cut':
          return NADA;
      }
      // Exhaustivo: con un `kind` nuevo, `e` deja de ser `never` aquí y esta
      // línea no compila hasta que alguien decida si se pinta o no.
      const sinFrase: never = e;
      throw new Error(`hecho de la crónica sin frase: ${JSON.stringify(sinFrase)}`);
    })
    .filter((l) => l !== NADA);
  return html`<div class="log" data-al-final="cronica">${unir(lineas)}</div>`;
}
