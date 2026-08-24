/**
 * Lo que se le cuenta al agente, probado sin sockets.
 *
 * Son las dos mitades de #31: la prosa que escribe el director (`notas.ts`) y la
 * cola que la entrega el puente (`mcp/veredictos.ts`). Las dos vivían muertas
 * por motivos distintos y las dos se prueban aquí leyendo lo que dicen, que es
 * la única forma de comprobar una nota escrita para que la lea un modelo.
 */
import { describe, expect, it } from 'vitest';
import type { BattleAction } from '../src/core/battle/types.js';
import { newGame } from '../src/core/state/setup.js';
import {
  describeAccion,
  notaAccionAceptada,
  notaAccionSustituida,
  notaFinDePartida,
  notaRespuestaInvalida,
  notaSinRespuesta,
  MOTIVO_PARTIDA_TERMINADA,
  notaTurnoAventura,
  PREFIJO_CORTE,
  PREFIJO_FIN,
  PREFIJO_RELEVO,
  textoDeCorte,
  textoDeEscucha,
  textoDeFin,
} from '../src/server/notas.js';
import type { AgentRequestMsg } from '../src/server/protocol.js';
import { ColaDeVeredictos } from '../src/server/mcp/veredictos.js';

/** Una petición cualquiera, para mirar cómo se compone la escucha. */
const PETICION: AgentRequestMsg = {
  type: 'request',
  requestId: 'req-9',
  kind: 'adventure_turn',
  payload: { day: 3 },
  responseFormat: 'responde con acciones',
};

describe('notas para el agente', () => {
  it('un turno limpio se resume en una línea con el número de acciones', () => {
    const nota = notaTurnoAventura(12, 5, 5, []);
    expect(nota).toContain('día 12');
    expect(nota).toContain('5 acciones');
    // Nada de muro de texto cuando salió bien.
    expect(nota.split('\n')).toHaveLength(1);
    expect(nota.length).toBeLessThan(120);
  });

  it('un turno con descartes dice cuántos entraron y que no se reintentan', () => {
    const nota = notaTurnoAventura(3, 2, 4, ['build: ese pueblo no es tuyo', 'move_hero: héroe desconocido']);
    expect(nota).toContain('2 de 4');
    expect(nota).toContain('2 descartadas');
    expect(nota).toMatch(/NO se reintentan/);
  });

  it('si la partida ya había terminado, no promete un turno que viene', () => {
    // El mismo mensaje decía «la partida ya había terminado» y «vuelve a pedirlas
    // el turno que viene». Prometer un mañana que no existe es la mentira amable
    // que este módulo existe para no decir.
    const nota = notaTurnoAventura(4, 1, 3, [
      `build: ${MOTIVO_PARTIDA_TERMINADA}`,
      `recruit: ${MOTIVO_PARTIDA_TERMINADA}`,
    ]);
    expect(nota).toContain('1 de 3');
    expect(nota).toContain('No hay nada que reintentar');
    expect(nota).not.toMatch(/turno que viene/);
  });

  it('con un descarte corriente entre medias, el consejo vuelve a ser reintentar', () => {
    const nota = notaTurnoAventura(4, 1, 3, [
      'build: ese pueblo no es tuyo',
      `recruit: ${MOTIVO_PARTIDA_TERMINADA}`,
    ]);
    expect(nota).toMatch(/turno que viene/);
  });

  it('una sustituta que consume el turno lo dice, y NO habla de maná', () => {
    const sustituta: BattleAction = { type: 'attack', target: 'd0' };
    const nota = notaAccionSustituida('a1', 'd9 ya está destruido', sustituta, 0, 'Aldo', false);

    expect(nota).toContain('a1');
    expect(nota).toContain('ataque a d0');
    expect(nota).toMatch(/consumido el turno/);
    expect(nota).not.toMatch(/maná/);
  });

  it('una sustituta que fue hechizo habla del maná, y NO del turno consumido', () => {
    const sustituta: BattleAction = { type: 'cast', spell: 'magic_arrow', target: 'd0' };
    const nota = notaAccionSustituida('a1', 'no alcanza', sustituta, 3, 'Aldo', false);

    expect(nota).toContain('hechizo magic_arrow sobre d0');
    expect(nota).toContain('3 de maná');
    expect(nota).toContain('Aldo');
    // Un `cast` no consume el turno del stack: afirmarlo sería la mentira que
    // este ciclo vino a quitar. Y el `NO` va en mayúsculas SIEMPRE: había una
    // tercera rama que lo escribía en minúsculas y de esa diferencia colgaba un
    // detector de otro fichero.
    expect(nota).toContain('Eso NO ha consumido el turno de a1');
    expect(nota).not.toContain('Eso ha consumido el turno de a1');
  });

  it('un hechizo que no llegó a cobrar maná no se lo cobra en la nota', () => {
    // El maná se MIDE. Si la sustituta fue un `cast` pero el héroe no perdió
    // nada, decir «te ha costado 0 de maná» sería ruido con pinta de dato.
    const sustituta: BattleAction = { type: 'cast', spell: 'magic_arrow', target: 'd0' };
    const nota = notaAccionSustituida('a1', 'no alcanza', sustituta, 0, 'Aldo', false);
    expect(nota).not.toMatch(/maná/);
    expect(nota).toContain('Eso NO ha consumido el turno de a1');
  });

  it('si la sustituta TERMINÓ la batalla, no promete otra petición', () => {
    // La promesa del `cast` —«se te volverá a pedir acción para ella»— es falsa
    // si el hechizo remata: `spellValue` valora explícitamente el golpe que mata,
    // el bucle del director sale por `battle.finished` y no hay más peticiones.
    // Prometer una que no va a llegar deja al agente esperando su turno.
    const sustituta: BattleAction = { type: 'cast', spell: 'magic_arrow', target: 'd0' };
    const nota = notaAccionSustituida('a1', 'no alcanza', sustituta, 3, 'Aldo', true);

    expect(nota).toContain('ha TERMINADO la batalla');
    expect(nota).toContain('no habrá más peticiones');
    expect(nota).not.toContain('se te volverá a pedir acción');
    // Y el maná sigue midiéndose: lo que costó, costó.
    expect(nota).toContain('3 de maná');
  });

  it('una sustituta cualquiera que remata tampoco habla de la ronda que viene', () => {
    const sustituta: BattleAction = { type: 'attack', target: 'd0' };
    const nota = notaAccionSustituida('a1', 'd9 ya está destruido', sustituta, 0, 'Aldo', true);

    expect(nota).toContain('ha TERMINADO la batalla');
    expect(nota).not.toMatch(/en esta ronda/);
    expect(nota).not.toMatch(/maná/);
  });

  it('el acuse de una acción que coló es una línea corta', () => {
    const nota = notaAccionAceptada('a1', { type: 'shoot', target: 'd2' });
    expect(nota).toBe('a1: disparo a d2, aplicada.');
  });

  it('una acción de aventura rechazada se describe entera, no por su tipo', () => {
    // Decía `action.type` a secas: el agente recibía «move_hero: no hay camino»
    // con cuatro `move_hero` en el mismo turno y sin forma de saber cuál.
    expect(describeAccion({ type: 'move_hero', hero: 'h1', to: { x: 4, y: 7 } })).toContain('h1');
    expect(describeAccion({ type: 'move_hero', hero: 'h1', to: { x: 4, y: 7 } })).toContain('(4,7)');
    expect(describeAccion({ type: 'build', building: 'town_hall', town: 't2' })).toBe(
      'build town_hall en t2',
    );
    expect(describeAccion({ type: 'recruit', town: 't2', creature: 'peasant', count: 5 })).toBe(
      'recruit 5× peasant en t2',
    );
    // Y sigue cubriendo las de batalla con las mismas palabras de siempre.
    expect(describeAccion({ type: 'attack', target: 'd0' })).toBe('ataque a d0');
  });

  it('cuando no llega respuesta se dice, en vez de callar', () => {
    // El silencio ambiguo era justo lo que este canal promete no hacer: el plazo
    // agotado borraba la petición y el agente no recibía una línea sobre ella.
    const nota = notaSinRespuesta('battle_turn', 'no respondiste a tiempo (300 s)');
    expect(nota).toContain('battle_turn');
    expect(nota).toContain('no respondiste a tiempo');
    // Y le dice qué NO hacer: contestar tarde es tirar otra decisión.
    expect(nota).toMatch(/no lo contestes/);
    expect(nota).toContain('juega la IA de reglas en tu lugar');
  });

  it('una respuesta que no valida se explica con la misma frase de siempre', () => {
    const nota = notaRespuestaInvalida('map_generate');
    expect(nota).toContain('map_generate');
    expect(nota).toContain('juega la IA de reglas en tu lugar');
  });
});

describe('cómo acabó la partida, contado al agente', () => {
  it('cuando gana el rival lo dice, y dice con qué se queda el agente', () => {
    const state = newGame({ seed: 7 });
    state.day = 4;
    state.finished = { winner: 0 };
    // Al agente le han barrido: sin castillos y sin héroes, como en la partida
    // del arnés de QA que destapó el cuelgue.
    state.towns = state.towns.filter((t) => t.owner !== 1);
    state.heroes = state.heroes.filter((h) => h.owner !== 1);

    const nota = notaFinDePartida(state, new Set([1]));
    expect(nota).toContain('día 4');
    expect(nota).toContain('Gana el jugador 0');
    expect(nota).toContain('has perdido');
    expect(nota).toContain('0 castillos y 0 héroes');
    // No es un muro de texto: lo que hace falta para decidir y parar.
    expect(nota.split('\n')).toHaveLength(1);
  });

  it('cuando gana el agente dice que ha ganado', () => {
    const state = newGame({ seed: 7 });
    state.day = 30;
    state.finished = { winner: 1 };

    const nota = notaFinDePartida(state, new Set([1]));
    expect(nota).toContain('Gana el jugador 1');
    expect(nota).toContain('has ganado');
    expect(nota).not.toContain('has perdido');
  });

  it('sin resolver no inventa un ganador ni un veredicto', () => {
    const state = newGame({ seed: 7 });
    state.day = 12;

    const nota = notaFinDePartida(state, new Set([1]));
    expect(nota).toContain('sin resolver tras 12 días');
    expect(nota).toContain('no gana nadie');
    expect(nota).not.toMatch(/has (ganado|perdido)/);
  });

  it('sin jugadores del agente no le atribuye ni victoria ni derrota', () => {
    // Una partida que mira sin jugar: decirle «has perdido» sería mentirle.
    const state = newGame({ seed: 7 });
    state.finished = { winner: 0 };

    const nota = notaFinDePartida(state, new Set());
    expect(nota).toContain('Gana el jugador 0');
    expect(nota).not.toMatch(/has (ganado|perdido)|Tú llevabas/);
  });
});

describe('cola de veredictos del puente', () => {
  it('entrega el veredicto también cuando fue bien, y con su nota', () => {
    const cola = new ColaDeVeredictos();
    cola.anota({ type: 'result', requestId: 'req-7', ok: true, note: 'Turno del día 2 aplicado entero: 3 acciones.' });

    const texto = cola.recoge();
    expect(texto).toContain('✓ req-7');
    expect(texto).toContain('Turno del día 2 aplicado entero: 3 acciones.');
  });

  it('lee `note` también cuando falló, además de los problemas', () => {
    const cola = new ColaDeVeredictos();
    cola.anota({
      type: 'result',
      requestId: 'req-8',
      ok: false,
      problems: ['d9 ya está destruido'],
      note: 'Tu acción para a1 se descartó',
    });

    const texto = cola.recoge();
    expect(texto).toContain('⚠ req-8');
    expect(texto).toContain('Tu acción para a1 se descartó');
    expect(texto).toContain('d9 ya está destruido');
  });

  it('dos veredictos entre dos escuchas llegan LOS DOS', () => {
    // Era una ranura de uno: el informe del turno pisaba al aviso de la acción
    // de batalla, que es justo el que había que leer.
    const cola = new ColaDeVeredictos();
    cola.anota({ type: 'result', requestId: 'req-1', ok: false, note: 'la acción no coló' });
    cola.anota({ type: 'result', requestId: 'req-2', ok: true, note: 'el turno sí' });

    const texto = cola.recoge();
    expect(texto).toContain('req-1');
    expect(texto).toContain('req-2');
    // Y recoger vacía: no se repiten en la siguiente escucha.
    expect(cola.recoge()).toBe('');
  });

  it('sin nada que contar no se dice nada', () => {
    expect(new ColaDeVeredictos().recoge()).toBe('');
  });
});

describe('lo que devuelve una escucha', () => {
  it('la petición llega con su estado, su formato y los veredictos pendientes', () => {
    const cola = new ColaDeVeredictos();
    cola.anota({ type: 'result', requestId: 'req-8', ok: true, note: 'el turno entró entero' });

    const { texto, esError } = textoDeEscucha({ clase: 'peticion', msg: PETICION }, cola);

    expect(esError).toBe(false);
    expect(texto).toContain('kind: adventure_turn');
    expect(texto).toContain('CÓMO FUE LO ANTERIOR');
    expect(texto).toContain('el turno entró entero');
    expect(texto).toContain('responde con acciones');
  });

  it('un relevo NO se cuenta como una conexión perdida', () => {
    // Lo que leía el agente al llamar dos veces a heroes_listen era «SE HA
    // PERDIDO LA CONEXIÓN CON LA PARTIDA · no consta si el servidor se ha
    // caído», y no se había perdido nada: el canal estaba vivo, las consultas
    // respondían y la partida seguía. Encima `verify-agent.ts` lee ese prefijo
    // como circuito roto, así que un relevo habría tumbado el arnés apuntando al
    // sitio equivocado.
    const { texto, esError } = textoDeEscucha({ clase: 'relevo' }, new ColaDeVeredictos());

    expect(texto.startsWith(PREFIJO_RELEVO)).toBe(true);
    expect(texto).not.toContain(PREFIJO_CORTE);
    expect(texto).not.toMatch(/No consta|se ha caído|pnpm server/);
    // Dice lo que sí ha pasado y qué hacer: nada, esperar a la otra escucha.
    expect(texto).toMatch(/sigue vivo/);
    expect(texto).toMatch(/NO vuelvas a llamar a heroes_listen/);
    // Sigue siendo un error para quien llamó: esta llamada no trae decisión.
    expect(esError).toBe(true);
  });

  it('una escucha RELEVADA no se lleva los veredictos de la buena', () => {
    // Era el mismo mensaje perdido con otro disfraz: al llegar una segunda
    // escucha, la primera despertaba con `corte`, recogía TODOS los veredictos y
    // los devolvía marcados con un texto que dice que esa llamada ya no vale. La
    // escucha buena recibía una cadena vacía.
    const cola = new ColaDeVeredictos();
    cola.anota({ type: 'result', requestId: 'req-7', ok: false, note: 'esa acción no coló' });

    const relevada = textoDeEscucha({ clase: 'relevo' }, cola);
    expect(relevada.esError).toBe(true);
    expect(relevada.texto).not.toContain('req-7');

    const buena = textoDeEscucha({ clase: 'peticion', msg: PETICION }, cola);
    expect(buena.texto).toContain('req-7');
    expect(buena.texto).toContain('esa acción no coló');
  });

  it('el fin de partida sí los entrega: es la última oportunidad de leerlos', () => {
    const cola = new ColaDeVeredictos();
    cola.anota({ type: 'result', requestId: 'req-6', ok: true, note: 'el último acuse' });

    const { texto, esError } = textoDeEscucha({ clase: 'fin', nota: 'gana el jugador 0' }, cola);

    // No es un error: es el final normal de una sesión.
    expect(esError).toBe(false);
    expect(texto.startsWith(PREFIJO_FIN)).toBe(true);
    expect(texto).toContain('el último acuse');
  });
});

describe('las dos frases terminales', () => {
  it('el fin de partida nombra al ganador y dice qué hacer', () => {
    const texto = textoDeFin('La partida ha terminado el día 4. Gana el jugador 0 (knight).');
    expect(texto.startsWith(PREFIJO_FIN)).toBe(true);
    expect(texto).toContain('Gana el jugador 0');
    expect(texto).toMatch(/deja de llamar a heroes_listen/);
    expect(texto).toContain('game_state');
  });

  it('el corte no afirma lo que no sabe', () => {
    const texto = textoDeCorte('el servidor ha cerrado el canal');
    expect(texto.startsWith(PREFIJO_CORTE)).toBe(true);
    // Ni «ha terminado» ni «se ha caído»: no consta cuál de las dos.
    expect(texto).toMatch(/No consta/);
    expect(texto).toContain('pnpm server');
  });
});
