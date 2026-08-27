/**
 * Lo que se le cuenta al agente: **toda** la prosa que lee, en un solo sitio.
 *
 * Vive aparte del director y sin sockets porque es prosa, y la prosa se prueba
 * leyéndola. Quien lee esto es un modelo: la nota tiene que ser concreta y
 * accionable, y **no puede afirmar lo que no ha medido**. Ese fue el fallo que
 * cerró la crítica de este ciclo: decir siempre «te ha costado el turno de esa
 * unidad» mentía en una de cada cuatro sustituciones, porque un `cast` no
 * consume el turno del stack: gasta el maná del héroe.
 *
 * Y está entero aquí porque estuvo repartido entre cinco ficheros escribiendo
 * los mismos hechos con palabras distintas —«juega la IA de reglas en tu lugar»
 * tenía cuatro redacciones—, con el agravante de que las dos frases que el
 * agente **reconoce por su principio** (`PREFIJO_FIN`, `PREFIJO_CORTE`) estaban
 * copiadas a mano en cuatro sitios, arnés de QA incluido: cambiar una habría
 * roto `pnpm qa` señalando el sitio equivocado.
 *
 * Lo que NO está aquí es el `RESPONSE_FORMAT` del contrato (`core`): ese
 * anuncia **antes** lo que se puede hacer y esto informa **después** de lo que
 * pasó. Son papeles distintos, y además `core` no puede importar del servidor.
 */
import type { BattleAction } from '@core/battle/types.js';
import {
  type AdventureAction,
  describePlayer,
  type GameState,
  heroesOf,
  townsOf,
} from '@core/state/game.js';
import type { PlayerId } from '@core/types.js';
import type { Aviso } from './mcp/buzon.js';

/**
 * Qué pasa cuando el agente no decide: lo suyo lo juega la heurística.
 *
 * Es el hecho que más veces estaba reescrito, y el que peor se lleva con las
 * medias tintas: si el agente cree que su turno se ha quedado esperando, se
 * queda esperando él también.
 */
export const LA_JUEGA_LA_IA = 'juega la IA de reglas en tu lugar';

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

/**
 * Todavía no hay partida que consultar.
 *
 * Es la ventana entre que el agente se ata al canal y que el mapa está
 * construido: el servidor le pide el plan y no puede haber `GameState` antes de
 * que lo entregue. Sus consultas en ese hueco ni revientan con un mensaje de
 * programador ni se inventan un estado: se rechazan diciendo qué falta y quién
 * tiene que hacerlo, que es él.
 *
 * Sale por `query_result` con `ok:false`, que es el mismo camino por el que ya
 * viaja «no puedes consultar por el jugador 0: no es tuyo».
 */
export const SIN_PARTIDA_TODAVIA =
  'todavía no hay partida que consultar: estoy esperando tu plan de mapa. Contesta a la ' +
  'petición "map_generate" con heroes_respond y vuelve a preguntar cuando la partida haya ' +
  'empezado.';

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

// -------------------------------------------------------- turnos y acciones

/** Resumen de un turno de aventura ya aplicado. */
export function notaTurnoAventura(
  dia: number,
  aplicadas: number,
  pedidas: number,
  rechazos: readonly string[],
): string {
  if (rechazos.length === 0) {
    return `Turno del día ${dia} aplicado entero: ${aplicadas} ${aplicadas === 1 ? 'acción' : 'acciones'}.`;
  }
  const descartadas = rechazos.length === 1 ? '1 descartada' : `${rechazos.length} descartadas`;
  // No hay «turno que viene» si la partida ya se acabó: prometerlo sería la misma
  // mentira amable que este módulo existe para no decir, y encima en el mismo
  // mensaje que explica que había terminado.
  const seAcabo = rechazos.every((r) => r.includes(MOTIVO_PARTIDA_TERMINADA));
  const consejo = seAcabo
    ? 'No hay nada que reintentar: la partida ya había terminado.'
    : 'Las descartadas NO se reintentan solas: si todavía te interesan, vuelve a ' +
      'pedirlas el turno que viene corrigiendo el motivo.';
  return (
    `Turno del día ${dia}: ${aplicadas} de ${pedidas} acciones aplicadas, ${descartadas} ` +
    `(el motivo de cada una, debajo). ${consejo}`
  );
}

/**
 * Por qué no se intentó siquiera una acción que venía en la lista.
 *
 * Son los dos únicos motivos por los que el turno se corta a media lista, y los
 * dos acaban en `problems` con el nombre de la acción delante, como cualquier
 * otro descarte. Antes se salía del bucle con un `break` y lo de detrás
 * desaparecía **sin una palabra**: con `[move_hero, end_turn, build, recruit]`
 * el agente recibía `problems: []` y «Turno del día 1 aplicado entero: 1
 * acción», que es exactamente lo contrario de lo que había pasado. Un silencio
 * no puede significar dos cosas en un canal que promete informar siempre.
 */
export const MOTIVO_TRAS_END_TURN =
  'no se ha intentado: va detrás de tu end_turn, y cerrar el turno lo cierra para todo lo demás';
export const MOTIVO_PARTIDA_TERMINADA = 'no se ha intentado: la partida ya había terminado';

/**
 * Qué se jugó en lugar de una acción de batalla rechazada, y qué costó.
 *
 * `manaGastado` se **mide** restando el maná del héroe antes y después de la
 * sustituta, no se deduce de su tipo: si el héroe no tenía para pagar, o el
 * hechizo rebotó, no se le cobra al agente un maná que no perdió.
 *
 * El `NO` va **siempre en mayúsculas**: hubo una rama que decía lo mismo con un
 * `no` minúsculo, y de esa diferencia colgaba un detector en
 * `agent-link.test.ts` que clasificaba al revés justo el caso que la nota existe
 * para no afirmar.
 *
 * Y la batalla terminada es una rama propia porque la promesa del `cast` —«se te
 * volverá a pedir acción para ella»— **deja de ser cierta** si la sustituta
 * remata: `spellValue` valora explícitamente el golpe que mata (`min(daño, hp)`),
 * así que un hechizo sustituto puede cerrar la batalla, el bucle del director
 * sale por `battle.finished` y no hay ninguna petición más. Prometer una que no
 * va a llegar deja al agente esperando su turno de la unidad que ya ganó.
 *
 * `wait` es la tercera rama, y hasta #52 no se veía porque la heurística no
 * esperaba nunca: la cola por defecto le decía «Eso ha consumido el turno», y
 * con una espera **eso es mentira** —el stack vuelve al final de la misma
 * ronda—. Ahora que la espera se juega de verdad, el agente recibiría una
 * explicación falsa de qué le costó su error justo en la acción que menos se
 * parece a las demás.
 *
 * Y su promesa va **condicionada**, que es donde el primer arreglo se quedó
 * corto: «se te volverá a pedir acción» falla el **21,2 %** de las veces —101
 * de las 476 esperas medidas en 200 partidas—, porque al stack lo destruyen o
 * la batalla se acaba mientras espera. La rama de `cast` tiene el guardia de
 * `batallaTerminada` para justo este problema; la de `wait` no puede usarlo,
 * porque una espera **no cierra ninguna batalla**: la cierra lo que ocurre
 * después, cuando la nota ya se ha escrito.
 */
export function notaAccionSustituida(
  unidad: string,
  motivo: string,
  sustituta: BattleAction,
  manaGastado: number,
  heroe: string | null,
  batallaTerminada: boolean,
): string {
  const cabecera = `Tu acción para ${unidad} se descartó (${motivo}); la ${LA_JUEGA_LA_IA}: ${describeAccion(sustituta)}.`;
  // El maná se MIDE, así que un `cast` que no llegó a cobrar no se cobra aquí.
  const mana =
    manaGastado === 0 ? null : `le ha costado ${manaGastado} de maná a ${heroe ?? 'tu héroe'}`;

  if (batallaTerminada) {
    return (
      `${cabecera} Con eso ha TERMINADO la batalla${mana === null ? '' : `, y ${mana}`}: ` +
      'no habrá más peticiones para ella.'
    );
  }

  if (sustituta.type === 'cast') {
    // Un `cast` no consume el turno del stack (`battle.ts`): se te volverá a
    // pedir acción para la misma unidad. Lo que sí se ha ido es el maná.
    return (
      `${cabecera} Eso NO ha consumido el turno de ${unidad} —se te volverá a pedir acción ` +
      `para ella—${mana === null ? '' : `, pero ${mana}`}.`
    );
  }
  if (sustituta.type === 'wait') {
    // Una espera tampoco lo consume: empuja al stack al final de `state.queue`
    // y `advance` lo volverá a sacar en esta misma ronda. Se le dice aparte del
    // `cast` porque el precio es otro: no se ha ido maná, se ha ido el SITIO en
    // la cola, y saberlo cambia lo que conviene responder cuando le vuelvan a
    // preguntar por la misma unidad.
    //
    // Y la petición se promete CONDICIONADA, no a secas. Medido sobre las 476
    // esperas de 200 partidas: 375 vuelven a actuar, a 67 las destruyen antes
    // de que les toque y en 34 la batalla se acaba mientras esperaban. **101 de
    // 476, el 21,2 %, no reciben la petición.** El guardia de `batallaTerminada`
    // no cubre esto: se mide justo después de aplicar la sustituta, y una espera
    // nunca cierra una batalla — la cierra lo que pase después, mientras espera.
    // Prometerla a secas sería la misma mentira que este hallazgo vino a quitar,
    // solo que una casilla más allá.
    return (
      `${cabecera} Eso NO ha consumido el turno de ${unidad}: actuará al final de la ronda, ` +
      'cuando ya hayan movido los demás. Se te volverá a pedir acción para ella SI llega viva ' +
      'a ese momento y la batalla no ha terminado antes — esperar la deja expuesta, y 1 de ' +
      'cada 5 veces no llega.'
    );
  }
  return `${cabecera} Eso ha consumido el turno de ${unidad} en esta ronda.`;
}

/**
 * Acuse de una acción de batalla que sí entró.
 *
 * Es **una línea corta y no un informe**, a propósito: el canal informa siempre
 * —un silencio es ambiguo cuando se pueden perder mensajes—, así que el precio
 * de no callar nunca es que lo bueno ocupe poco.
 */
export function notaAccionAceptada(unidad: string, accion: BattleAction): string {
  return `${unidad}: ${describeAccion(accion)}, aplicada.`;
}

/** Lo que pasa con el mapa cuando el del agente no llega o no sirve. */
const EL_MAPA_LO_PONE_EL_GENERADOR =
  'el mapa lo pone el generador procedimental y la partida empieza igual';

/**
 * Qué se juega en lugar de lo que el agente no entregó.
 *
 * `LA_JUEGA_LA_IA` —«juega la IA de reglas en tu lugar»— es cierto para un turno
 * y **falso para un mapa**: un `map_generate` que no llega no lo juega nadie,
 * porque no es un turno y no hay heurística que lo sustituya. Lo que pasa es que
 * el mapa lo pone el generador procedimental y la partida empieza igual, y eso
 * es lo que el agente necesita saber para no quedarse esperando una segunda
 * oportunidad que no va a existir.
 *
 * Es el mismo fallo que cerró la crítica del ciclo de los veredictos —una nota
 * que afirma lo que no ha pasado— una petición más allá: la cola estaba escrita
 * cuando el único `kind` que se pedía era un turno, y se quedó igual el día en
 * que dejó de serlo.
 */
function enSuLugar(kind: string): string {
  if (kind === 'map_generate') {
    return `${mayuscula(EL_MAPA_LO_PONE_EL_GENERADOR)}.`;
  }
  return `Ese turno lo ${LA_JUEGA_LA_IA}.`;
}

function mayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Su respuesta no encajaba con el esquema y no se aplicó nada de ella. */
export function notaRespuestaInvalida(kind: string): string {
  return (
    `Tu respuesta a "${kind}" no encaja con el esquema y no se ha aplicado nada. ` + enSuLugar(kind)
  );
}

/**
 * No llegó a haber respuesta: se agotó el plazo, o se cayó el canal.
 *
 * Sin esta nota, el plazo agotado descartaba la petición **sin decir nada**: el
 * agente perdía el turno y su siguiente escucha no traía una sola línea sobre
 * ese `requestId`. Es el silencio ambiguo en el caso donde más importa
 * distinguir «se perdió» de «llegó tarde», que es justo lo contrario de lo que
 * el canal promete.
 */
export function notaSinRespuesta(kind: string, motivo: string): string {
  return (
    `No llegó tu respuesta a "${kind}": ${motivo}. ${enSuLugar(kind)} ` +
    'No la contestes ahora: si la contestas se descarta por llegar tarde. ' +
    'Vuelve a heroes_listen y sigue desde la petición siguiente.'
  );
}

// -------------------------------------------------------------- el mapa

/**
 * El plan de mapa llegó, con su forma buena, y no se puede jugar.
 *
 * Es el tercer camino de `map_generate` y el único en el que el agente hizo su
 * parte: contestó a tiempo y el esquema lo aceptó, pero el mapa deja un castillo
 * aislado, dos cosas en la misma casilla o los jugadores cambiados. Se le
 * devuelven los problemas uno a uno —como una acción de aventura ilegal— y **no
 * hay reintento**: la partida no se queda esperando un segundo plan, igual que
 * un turno descartado no se vuelve a pedir.
 */
export function notaMapaRechazado(problemas: readonly string[]): string {
  const cuantos = problemas.length === 1 ? '1 problema' : `${problemas.length} problemas`;
  return (
    `Tu plan de mapa no se puede jugar (${cuantos}, debajo). No se te va a volver a pedir: ` +
    `${EL_MAPA_LO_PONE_EL_GENERADOR}.`
  );
}

/**
 * El plan entró: se juega en el mapa que diseñó él.
 *
 * Corta, como el acuse de una acción de batalla que cuela, y por el mismo
 * motivo: se informa siempre, también cuando salió bien, y el precio de no
 * callar nunca es que lo bueno ocupe poco.
 */
export function notaMapaAceptado(width: number, height: number, pueblos: number): string {
  return (
    `Tu plan de mapa entró: la partida se juega en ${width}×${height} con ${pueblos} pueblos. ` +
    'A partir de aquí las peticiones son de turno.'
  );
}

// ------------------------------------------------------------ fin de partida

/**
 * Cómo acabó la partida, para quien se quedó esperando el turno siguiente.
 *
 * Es lo que faltaba en el hueco más tonto del puente: la partida terminaba, el
 * servidor dejaba de pedir decisiones y el agente seguía bloqueado en
 * `heroes_listen` sin enterarse ni de que había acabado ni de quién ganó. Esta
 * frase la lee un modelo, así que dice las tres cosas que necesita para decidir
 * qué hacer: que se acabó, quién ganó, y cómo quedó lo suyo.
 */
export function notaFinDePartida(state: GameState, tuyos: ReadonlySet<PlayerId>): string {
  // Lo primero, como las demás guardas de este fichero: contar el final de una
  // partida viva es un fallo del llamante, no un final que redactar. Antes se
  // contestaba «sin resolver», que es lo que decía también el empate de verdad.
  const fin = state.finished;
  if (fin === null) {
    throw new Error('no se puede contar cómo acabó una partida que no ha terminado');
  }

  const balance = [...tuyos]
    .sort((a, b) => a - b)
    .map((id) => `llevabas al ${describePlayer(state, id)} y acabas con ${recuento(state, id)}`)
    .join('; ');
  // Sin jugadores del agente no se dice «has perdido»: no llevaba a nadie.
  const cola = balance === '' ? '' : ` Tú ${balance}.`;

  const ganador = fin.winner;
  if (ganador === null) {
    const dias = `${state.day} ${state.day === 1 ? 'día' : 'días'}`;
    return `La partida se ha quedado sin resolver tras ${dias}: no gana nadie.${cola}`;
  }

  const veredicto = tuyos.size === 0 ? '' : tuyos.has(ganador) ? ' — has ganado' : ' — has perdido';
  return `La partida ha terminado el día ${state.day}. Gana el ${describePlayer(state, ganador)}${veredicto}.${cola}`;
}

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

function recuento(state: GameState, id: PlayerId): string {
  const castillos = townsOf(state, id).length;
  const heroes = heroesOf(state, id).length;
  return (
    `${castillos} ${castillos === 1 ? 'castillo' : 'castillos'} y ` +
    `${heroes} ${heroes === 1 ? 'héroe' : 'héroes'}`
  );
}

/**
 * La acción, dicha en palabras: el agente no debería tener que releer su JSON.
 *
 * Cubre las dos uniones porque el rechazo de aventura decía `action.type` a
 * secas: el agente recibía `move_hero: no hay camino` con cuatro `move_hero` en
 * el mismo turno, y ya no se reintentan solos.
 */
export function describeAccion(accion: BattleAction | AdventureAction): string {
  switch (accion.type) {
    case 'move':
      return `movimiento a (${accion.to.col},${accion.to.row})`;
    case 'attack':
      return `ataque a ${accion.target}`;
    case 'shoot':
      return `disparo a ${accion.target}`;
    case 'wait':
      return 'espera';
    case 'defend':
      return 'defensa';
    case 'cast':
      return `hechizo ${accion.spell}${accion.target === undefined ? '' : ` sobre ${accion.target}`}`;
    case 'move_hero':
      return `move_hero ${accion.hero} → (${accion.to.x},${accion.to.y})`;
    case 'hire_hero':
      return `hire_hero en ${accion.town}`;
    case 'recruit':
      return `recruit ${accion.count}× ${accion.creature} en ${accion.town}`;
    case 'build':
      return `build ${accion.building} en ${accion.town}`;
    case 'end_turn':
      return 'end_turn';
  }
}
