/**
 * La escucha del puente: lo que `heroes_listen` le entrega al agente, y cómo se
 * dice, en un solo sitio.
 *
 * Es el texto que compone el puente con lo que le llega del servidor (`Aviso`): la
 * petición con su estado y su formato, el bloque de veredictos de lo anterior y los
 * avisos de fin, de corte y de relevo, cada uno con el prefijo por el que el agente
 * lo reconoce; y la descripción de la herramienta (`LISTEN_DESCRIPTION`), que nombra
 * esas mismas marcas y cada petición que puede llegar. Hasta la fase S de la
 * reorganización (07-11-2026) vivía repartido entre `notas.ts` (el texto y sus
 * marcas), `buzon.ts` (`Aviso`) y `server.ts` (la descripción), y `notas.ts`, del
 * servidor, importaba `Aviso` del puente. Hoy nada de fuera de `src/server/mcp/`
 * importa el puente (lo vigila `invariantes-capas.test.ts`); lo que el servidor
 * escribe de lo que pasó (cada veredicto, cada nota) sigue en `notas.ts`.
 *
 * Vive aquí y no en `server.ts` porque aquel módulo abre el transporte de stdio en
 * cuanto se importa: esto se lee en los tests (`notas.test.ts`, `puente-mcp.test.ts`)
 * y en `pnpm qa`, que reconoce cada petición por estas marcas y cuenta los
 * veredictos con `leeVeredictos`.
 */

import { REQUEST_KINDS, type RequestKind } from '@core/contract/esquemas.js';
import { RANGO_MAXIMO_DE_TROPA } from '@core/hero/rango.js';
import type { AgentRequestMsg } from '../protocol.js';

/** Por dónde empieza el aviso de fin de partida. El agente lo reconoce así. */
export const PREFIJO_FIN = 'FIN DE LA PARTIDA';
/** Por dónde empieza el aviso de canal muerto. */
export const PREFIJO_CORTE = 'SE HA PERDIDO LA CONEXIÓN';
/**
 * Por dónde empieza el aviso de una escucha relevada por otra.
 *
 * Es prefijo propio y no el del corte porque **no se ha perdido nada**: el canal
 * está vivo, las consultas responden y la partida sigue. Con el texto del corte,
 * el agente leía «no consta si el servidor se ha caído» de una llamada suya que
 * simplemente sobraba — y `verify-agent.ts` diagnostica `PREFIJO_CORTE` como
 * circuito roto, así que dos escuchas a la vez habrían tumbado el arnés
 * señalando al sitio equivocado.
 */
export const PREFIJO_RELEVO = 'ESCUCHA RELEVADA';

// ------------------------------------------------- el bloque de veredictos

/** Por dónde empieza el bloque de acuses de lo anterior. */
export const CABECERA_VEREDICTOS = 'CÓMO FUE LO ANTERIOR:';
/** Coló. */
export const MARCA_OK = '✓';
/** No coló, y debajo va el motivo de cada descarte. */
export const MARCA_FALLO = '⚠';
/** Con lo que se sangra cada problema bajo su veredicto. */
export const SANGRIA_PROBLEMA = '    - ';

/**
 * Los tres marcadores por los que se reconoce una petición.
 *
 * Están aquí por el mismo motivo que las marcas del bloque de veredictos: el
 * arnés de QA los busca en el texto para sacar el kind y el estado, y los tenía
 * escritos a mano. De los tres marcadores de la escucha se ató uno mientras el
 * bloque de veredictos se mudaba, y los otros dos se quedaron esperando a que
 * alguien reescribiera `textoDeEscucha` para romperse en el sitio equivocado.
 */
export const MARCA_KIND = 'kind: ';
export const CABECERA_ESTADO = 'ESTADO:';
export const CABECERA_RESPUESTA = 'CÓMO RESPONDER:';

/** Un veredicto tal y como lo lee quien quiera contarlos. */
export interface Veredicto {
  readonly requestId: string;
  readonly ok: boolean;
  readonly nota: string;
  readonly problemas: readonly string[];
}

/**
 * Un veredicto, escrito tal y como lo lee `leeVeredictos`.
 *
 * Las dos caras del codec viven pegadas **de verdad**: la cola del puente
 * componía la línea a mano en su fichero y aquí solo estaba el parser, unidos
 * por cuatro constantes compartidas. Compartir las marcas no es lo mismo que
 * compartir el formato — el `:` que separa el id de la nota, y la sangría de
 * cada problema, seguían escritos dos veces.
 *
 * Y aquí es donde se cumple lo que el parser SUPONE: que un veredicto ocupa una
 * línea y cada problema otra. Era cierto por costumbre y no por contrato, y el
 * día que un `err.message` traiga un `\n` —el `message` crudo de un `ZodError`
 * es JSON multilínea— el bloque se cerraría a media lista y `pnpm qa` contaría
 * de menos **sin ponerse rojo**. Lo garantiza quien escribe, que es el único que
 * puede.
 */
export function lineaDeVeredicto(v: Veredicto): string {
  const problemas = v.problemas.map((p) => `${SANGRIA_PROBLEMA}${unaLinea(p)}`).join('\n');
  return (
    `${v.ok ? MARCA_OK : MARCA_FALLO} ${v.requestId}: ${unaLinea(v.nota)}` +
    `${problemas === '' ? '' : `\n${problemas}`}`
  );
}

function unaLinea(texto: string): string {
  return texto.replace(/\n/g, ' ');
}

/**
 * Vuelve a leer el bloque de veredictos de una escucha.
 *
 * Existe porque `pnpm qa` daba verde sin mirarlo: cuatro de cuatro acciones
 * descartadas salían igual de verdes que un turno perfecto. Contarlas obliga a
 * leer prosa, y **el acoplamiento se asume**: es la única prueba de que el
 * agente recibe lo que decimos, así que atarlo a un canal aparte dejaría de
 * verificar justo el texto que él lee.
 *
 * Lo que sí se elige es DÓNDE vive: aquí, pegado al escritor. Reescribir la
 * cabecera o las marcas rompe `pnpm test` en cuatro segundos y en el mismo
 * fichero que se acaba de tocar, en vez de romper `pnpm qa` en CI señalando al
 * arnés — que es donde nadie va a buscar la causa.
 */
export function leeVeredictos(texto: string): Veredicto[] {
  const desde = texto.indexOf(CABECERA_VEREDICTOS);
  if (desde < 0) return [];

  const out: { requestId: string; ok: boolean; nota: string; problemas: string[] }[] = [];
  const cuerpo = texto.slice(desde + CABECERA_VEREDICTOS.length).replace(/^\n/, '');

  for (const linea of cuerpo.split('\n')) {
    // La marca se resuelve una vez y se corta por SU longitud. Cortar siempre
    // por la de `MARCA_OK` cuela mientras las dos midan una unidad UTF-16; el
    // día que una sea `⚠️` o `[ok]`, el parser se come un carácter de más —o de
    // menos— y lo hace en silencio.
    const marca = [MARCA_OK, MARCA_FALLO].find((m) => linea.startsWith(m));
    if (marca !== undefined) {
      const resto = linea.slice(marca.length).trimStart();
      const corte = resto.indexOf(':');
      // El id no lleva dos puntos («req-3»), así que un veredicto sin ellos es
      // que el formato ha cambiado. Se lanza en vez de devolver medio dato: un
      // contador que cuenta mal es peor que no contar.
      if (corte < 0) throw new Error(`veredicto sin requestId: ${linea}`);
      out.push({
        requestId: resto.slice(0, corte),
        ok: marca === MARCA_OK,
        nota: resto.slice(corte + 1).trim(),
        problemas: [],
      });
      continue;
    }
    if (linea.startsWith(SANGRIA_PROBLEMA)) {
      const ultimo = out[out.length - 1];
      if (ultimo === undefined) throw new Error(`problema sin veredicto delante: ${linea}`);
      ultimo.problemas.push(linea.slice(SANGRIA_PROBLEMA.length));
      continue;
    }
    // Cualquier otra cosa cierra el bloque: detrás viene el ESTADO, y seguir
    // leyendo contaría el JSON entero como veredictos.
    break;
  }
  return out;
}

// ------------------------------------------------- los avisos que no traen decisión

/** Fin de partida, tal y como lo recibe el agente: qué pasó y qué puede hacer. */
export function textoDeFin(nota: string): string {
  return (
    `${PREFIJO_FIN} · ${nota}\n\n` +
    'No va a haber más peticiones: deja de llamar a heroes_listen, no queda ningún ' +
    'turno que decidir. Si quieres mirar cómo quedó todo antes de contarlo, ' +
    'game_state sigue respondiendo mientras el servidor siga vivo.'
  );
}

/**
 * Otra escucha ha relevado a esta. No es un corte, y no hay que decírselo como si
 * lo fuera: lo único que ha pasado es que sobraba una llamada.
 */
export function textoDeRelevo(): string {
  return (
    `${PREFIJO_RELEVO} · otra llamada a heroes_listen ha tomado el relevo de esta.\n\n` +
    'El canal con la partida sigue vivo y la partida sigue: no se ha perdido nada y no ' +
    'hay ninguna decisión tuya en el aire. La petición que venga se la lleva la escucha ' +
    'que te ha relevado, así que NO vuelvas a llamar a heroes_listen por esto —dos a la ' +
    'vez se relevan en círculo—: espera a que esa termine, y sigue el ciclo desde ahí.'
  );
}

/** Canal muerto: qué se sabe, qué no, y qué hacer con cada caso. */
export function textoDeCorte(motivo: string): string {
  return (
    `${PREFIJO_CORTE} CON LA PARTIDA · ${motivo}.\n\n` +
    'No consta si la partida había terminado o si el servidor se ha caído: se cortó ' +
    'antes de decirlo, y las consultas viajan por ese mismo canal, así que preguntarlo ' +
    'ahora tampoco serviría. Si el servidor sigue en pie ("pnpm partida"), vuelve a ' +
    'llamar a heroes_listen y el puente se reconecta solo; si no vuelve, tu sesión ' +
    'se acaba aquí y puedes contar lo último que sí viste.'
  );
}

// ------------------------------------------------------- lo que devuelve la escucha

/**
 * Lo que puede recibir quien espera en `heroes_listen`. Nunca «nada».
 *
 * `relevo` y `corte` son clases distintas porque son hechos distintos: en el
 * relevo el canal está vivo y solo sobraba una llamada; en el corte el cable se
 * ha muerto. Compartían clase, y el agente leía «se ha perdido la conexión con
 * la partida» de algo que no había perdido nada.
 */
export type Aviso =
  | { readonly clase: 'peticion'; readonly msg: AgentRequestMsg }
  | { readonly clase: 'fin'; readonly nota: string }
  | { readonly clase: 'relevo' }
  | { readonly clase: 'corte'; readonly motivo: string };

/** Lo que `heroes_listen` le acaba entregando al agente. */
export interface TextoDeEscucha {
  readonly texto: string;
  readonly esError: boolean;
}

/**
 * Compone la respuesta de `heroes_listen`, veredictos pendientes incluidos.
 *
 * Está aquí y no en `mcp/server.ts` porque allí no se puede leer en un test —ese
 * módulo abre el transporte de stdio en cuanto se importa—, y hace falta poder
 * leerlo, porque la decisión menos evidente del puente vive en estas tres ramas:
 * los veredictos se entregan en la **petición** y en el **fin de partida**, y
 * **nunca en el corte**. Un corte es una escucha a la que otra acaba de relevar;
 * llevárselos y devolverlos marcados `isError` los sacaba de la cola, y la
 * escucha buena —la que sí iba a leerlos— recibía una cadena vacía.
 */
export function textoDeEscucha(aviso: Aviso, veredictos: { recoge(): string }): TextoDeEscucha {
  // El relevo y el corte comparten lo importante —esta llamada no trae decisión
  // y no se lleva los veredictos— y no comparten nada más: uno es una llamada de
  // sobra y el otro es el cable roto.
  if (aviso.clase === 'relevo') {
    return { texto: textoDeRelevo(), esError: true };
  }
  if (aviso.clase === 'corte') {
    return { texto: textoDeCorte(aviso.motivo), esError: true };
  }

  // También cuando ya no habrá más turnos: son los acuses de sus últimas
  // acciones, y esa es su única oportunidad de leerlos.
  const recogidos = veredictos.recoge();
  const cola = recogidos === '' ? '' : `\n\n${CABECERA_VEREDICTOS}\n${recogidos}`;

  if (aviso.clase === 'fin') {
    // El fin de partida NO es un error: es el final normal de una sesión.
    return { texto: textoDeFin(aviso.nota) + cola, esError: false };
  }

  const msg = aviso.msg;
  return {
    esError: false,
    texto:
      `Petición ${msg.requestId} · ${MARCA_KIND}${msg.kind}${cola === '' ? '' : `${cola}\n`}\n\n` +
      `${CABECERA_ESTADO}\n${JSON.stringify(msg.payload, null, 2)}\n\n` +
      `${CABECERA_RESPUESTA}\n${msg.responseFormat}`,
  };
}

// ------------------------------------------------- la descripción de la herramienta

/**
 * Qué es cada petición, dicho al agente en la descripción de `heroes_listen`: una
 * frase por `RequestKind`, y la lista sale de `REQUEST_KINDS`, en su orden. Con
 * `Record<RequestKind, …>`, una petición nueva sin su frase no compila.
 *
 * Era una lista escrita a mano dentro de la descripción (en `server.ts`), y le faltó
 * `battle_response` desde que el agente elige en la rueda (19-10-2026) hasta la fase S
 * de la reorganización (07-11-2026): la recibía sin que la descripción le dijera que
 * podía llegar. Las frases van partidas en líneas como iban, con la sangría de la
 * lista; `puente-mcp.test.ts` mira que cada petición salga en la que publica el
 * puente.
 */
const DICHO_DE_LA_PETICION: Readonly<Record<RequestKind, string>> = {
  adventure_turn: `te toca el turno en el mapa: mueve héroes, construye,
  recluta. Devuelves una lista de acciones.`,
  battle_turn: `una unidad tuya espera órdenes en la batalla. Devuelves
  UNA acción. La petición incluye "legalActions" con todo lo que se puede
  hacer: elegir de ahí nunca falla. Puedes ser el atacante o el DEFENSOR: mira
  "yourSide" en cada petición y no des por hecho que atacas.`,
  battle_response: `el rival golpea cuerpo a cuerpo a una unidad tuya y
  eliges tu respuesta en la rueda del golpe, a la vez que él su golpe y sin
  verlo. Devuelves UNA respuesta: si no vale o no llega, la elige la IA solo
  para ese golpe, y la batalla sigue siendo tuya.`,
  map_generate: `diseña un mapa. No dibujas nada: devuelves un plan
  declarativo y el motor lo construye y lo valida.`,
  hero_from_troop: `un veterano de rango ${RANGO_MAXIMO_DE_TROPA} está en tu base y se hace héroe:
  le das nombre, historia y tipo. Llega antes de tu "adventure_turn".`,
  town_voices: `pon voz a la gente de tus bases (una línea por persona y
  día) cuando empieza semana o se levanta un edificio en un sitio vacío. Es
  presentación: no cambia el juego. Llega antes de tu "adventure_turn".`,
};

/**
 * La descripción de `heroes_listen`, que publica `server.ts`: cómo es el ciclo, qué
 * trae cada mensaje (con las marcas de aquí, las mismas que escribe la escucha) y
 * qué peticiones pueden llegar (`DICHO_DE_LA_PETICION`).
 */
export const LISTEN_DESCRIPTION = `Espera bloqueado hasta que la partida te pida una decisión, y te la entrega.

Es la mitad de un ciclo: llama a heroes_listen para recibir una petición,
decide, llama a heroes_respond UNA sola vez con tu respuesta, y vuelve a
heroes_listen. Repite durante toda la partida.

Cada mensaje que devuelve empieza por un campo "kind" y trae EMBEBIDO el
formato exacto de respuesta para ese kind: léelo ahí, no hace falta que lo
recuerdes entre turnos.

Y trae, cuando lo hay, un bloque "${CABECERA_VEREDICTOS}" con el veredicto de
CADA respuesta tuya que se haya aplicado desde la última vez que escuchaste:
"${MARCA_OK}" es que entró y "${MARCA_FALLO}" que no, con el motivo. Se informa
siempre, también cuando salió bien: no tienes que deducir de un silencio si coló
o si el mensaje se perdió.

Tipos de petición que puedes recibir:
${REQUEST_KINDS.map((k) => `- "${k}" → ${DICHO_DE_LA_PETICION[k]}`).join('\n')}

El ciclo tiene final y te avisa de él: cuando la partida termina recibes un
mensaje que empieza por "${PREFIJO_FIN}" y te dice quién ganó. Ahí se para
el bucle. Y si el canal con la partida se muere, recibes uno que empieza por
"${PREFIJO_CORTE}" con lo que se sabe y lo que puedes intentar. En
ninguno de los dos casos te quedas esperando a ciegas.

Llama de una en una: si dos heroes_listen se solapan, la primera vuelve con
"${PREFIJO_RELEVO}" —el canal sigue vivo y no se pierde nada, pero esa
llamada ya no trae decisión: la trae la que la relevó—.

Aparte de responder, puedes consultar el estado en cualquier momento con
game_state, battle_state, map, creature_stats, spell_list y building_list, sin
volcarte la partida entera en el contexto.`;
