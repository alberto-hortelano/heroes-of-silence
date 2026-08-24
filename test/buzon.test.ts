/**
 * El buzón del puente: lo que espera al otro lado del socket.
 *
 * Todos estos tests comprueban lo mismo desde ángulos distintos: **que nadie se
 * queda esperando para siempre**. Ese era el fallo — `heroes_listen` colgado de
 * una promesa que nadie resolvía y el `close` del socket poniendo la referencia
 * a `null` sin tocarla—, y por eso cada espera se corre contra un plazo: si
 * vuelve a colgarse, el test falla rápido y diciendo que se colgó, en vez de
 * agotar el tiempo de vitest sin explicar nada.
 */
import { describe, expect, it } from 'vitest';
import { Buzon } from '../src/server/mcp/buzon.js';
import type { AgentRequestMsg } from '../src/server/protocol.js';

function peticion(requestId: string): AgentRequestMsg {
  return {
    type: 'request',
    requestId,
    kind: 'battle_turn',
    payload: { yourSide: 'defender' },
    responseFormat: '{ "action": … }',
  };
}

/** Una espera que no puede durar para siempre: si se cuelga, lo dice. */
async function enPlazo<T>(promesa: Promise<T>, ms = 300): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout>;
  const plazo = new Promise<never>((_, reject) => {
    temporizador = setTimeout(() => reject(new Error('la espera se ha quedado colgada')), ms);
  });
  try {
    return await Promise.race([promesa, plazo]);
  } finally {
    clearTimeout(temporizador!);
  }
}

describe('buzón del puente', () => {
  it('quien espera una decisión se entera de que la partida ha terminado', async () => {
    const buzon = new Buzon();
    const esperando = buzon.espera();

    buzon.fin('La partida ha terminado el día 4. Gana el jugador 0 (knight) — has perdido.');

    const aviso = await enPlazo(esperando);
    expect(aviso.clase).toBe('fin');
    // La frase la lee un modelo: tiene que decir quién ganó, no solo que acabó.
    if (aviso.clase !== 'fin') throw new Error('no es un fin');
    expect(aviso.nota).toContain('Gana el jugador 0');
  });

  it('quien espera una decisión se entera de que se ha cortado el canal', async () => {
    // El test que pedía el hallazgo: con una petición en vuelo se cierra el
    // socket y quien esperaba recibe la frase, en vez de quedarse colgado.
    const buzon = new Buzon();
    const esperando = buzon.espera();

    buzon.corta('el servidor de la partida ha cerrado el canal');

    const aviso = await enPlazo(esperando);
    expect(aviso.clase).toBe('corte');
    if (aviso.clase !== 'corte') throw new Error('no es un corte');
    expect(aviso.motivo).toContain('cerrado el canal');
  });

  it('tras el fin, volver a escuchar contesta en el acto y siempre lo mismo', async () => {
    // Un agente que no se cree el final y vuelve a llamar no puede colgarse.
    const buzon = new Buzon();
    buzon.fin('Gana el jugador 1 (necromancer) — has ganado.');
    expect(buzon.haTerminado).toBe(true);

    const primera = await enPlazo(buzon.espera());
    const segunda = await enPlazo(buzon.espera());
    expect(primera).toEqual(segunda);
    expect(primera.clase).toBe('fin');
  });

  it('una petición sin recoger no tapa el fin de partida', async () => {
    // Al otro lado ya no hay nadie esperando esa respuesta: entregarla sería
    // mandar al agente a decidir un turno que no existe.
    const buzon = new Buzon();
    buzon.entrega(peticion('req-9'));
    buzon.fin('La partida ha terminado el día 4. Gana el jugador 0 (knight).');

    const aviso = await enPlazo(buzon.espera());
    expect(aviso.clase).toBe('fin');
  });

  it('el corte NO se recuerda: el puente puede reconectar y seguir jugando', async () => {
    // Al revés que el fin. Una desconexión pasajera no puede dejar al agente
    // sin partida para el resto de la sesión.
    const buzon = new Buzon();
    buzon.corta('se ha caído el canal');
    expect(buzon.haTerminado).toBe(false);

    buzon.entrega(peticion('req-1'));
    const aviso = await enPlazo(buzon.espera());
    expect(aviso.clase).toBe('peticion');
    if (aviso.clase !== 'peticion') throw new Error('no es una petición');
    expect(aviso.msg.requestId).toBe('req-1');
  });

  it('al cortar se tiran las peticiones sin recoger: son de un servidor que ya no está', async () => {
    // Se guardaban, y al reconectar `espera()` entregaba PRIMERO la caduca: el
    // agente gastaba una decisión entera en ella, el servidor nuevo la
    // descartaba con «respuesta a una petición que ya no existe» y la petición
    // de verdad esperaba detrás hasta agotar el plazo y caer en la heurística.
    const buzon = new Buzon();
    buzon.entrega(peticion('req-vieja'));
    buzon.corta('se ha caído el canal');

    buzon.entrega(peticion('req-nueva'));
    const aviso = await enPlazo(buzon.espera());
    if (aviso.clase !== 'peticion') throw new Error('no es una petición');
    expect(aviso.msg.requestId).toBe('req-nueva');
  });

  it('recoger una petición es quedársela hasta contestarla', async () => {
    // `enCurso` vivía como un global fuera del buzón y cada uso lo combinaba a
    // mano con «¿ha terminado?»; aquí dentro es una sola pregunta.
    const buzon = new Buzon();
    buzon.entrega(peticion('req-1'));
    expect(buzon.enCurso).toBeNull();

    await enPlazo(buzon.espera());
    expect(buzon.enCurso).toBe('req-1');

    buzon.suelta();
    expect(buzon.enCurso).toBeNull();
  });

  it('terminada la partida no queda ninguna petición en curso', async () => {
    const buzon = new Buzon();
    buzon.entrega(peticion('req-1'));
    await enPlazo(buzon.espera());
    expect(buzon.enCurso).toBe('req-1');

    buzon.fin('Gana el jugador 0 (knight).');
    // Nadie espera ya esa respuesta: retenerla dejaba al agente atascado en el
    // guardia de `heroes_listen`, que es la forma tonta de volver a colgarlo.
    expect(buzon.enCurso).toBeNull();
  });

  it('una petición que llega antes de que nadie escuche se guarda y se entrega', async () => {
    const buzon = new Buzon();
    buzon.entrega(peticion('req-1'));
    buzon.entrega(peticion('req-2'));

    const primera = await enPlazo(buzon.espera());
    const segunda = await enPlazo(buzon.espera());
    expect(
      [primera, segunda].map((a) => (a.clase === 'peticion' ? a.msg.requestId : a.clase)),
    ).toEqual(['req-1', 'req-2']);
  });

  it('dos escuchas a la vez no dejan colgada a la primera', async () => {
    // Es el mismo fallo con otro disfraz: la segunda pisaba al que esperaba y
    // la promesa de la primera no la resolvía ya nadie.
    const buzon = new Buzon();
    const vieja = buzon.espera();
    const nueva = buzon.espera();

    const aviso = await enPlazo(vieja);
    // Y se despierta como lo que es —un relevo— y no como un canal muerto: el
    // canal está vivo, la partida sigue y no se ha perdido ninguna decisión.
    expect(aviso.clase).toBe('relevo');

    buzon.entrega(peticion('req-1'));
    expect((await enPlazo(nueva)).clase).toBe('peticion');
  });

  it('un relevo NO le quita la petición a la escucha que sí la recogió', async () => {
    // La recogida se ANOTA al recibir una petición y no se limpia al recibir
    // cualquier otra cosa: el aviso de relevo llega después del de la buena, y
    // con un `else` le borraba a esa su petición recién recogida.
    const buzon = new Buzon();
    const buena = buzon.espera();
    buzon.entrega(peticion('req-1'));
    expect((await enPlazo(buena)).clase).toBe('peticion');
    expect(buzon.enCurso).toBe('req-1');

    const sobrante = buzon.espera();
    void buzon.espera(); // la releva
    expect((await enPlazo(sobrante)).clase).toBe('relevo');
    expect(buzon.enCurso).toBe('req-1');
  });

  it('al cortar se suelta la petición recogida: contestarla ya no serviría', async () => {
    // `corta()` limpiaba consultas y pendientes pero NO la recogida, así que el
    // texto del corte le decía «vuelve a llamar a heroes_listen» y al hacerlo se
    // encontraba con el guardia exigiéndole contestar a una petición muerta: dos
    // vueltas y dos consejos que se contradicen.
    const buzon = new Buzon();
    buzon.entrega(peticion('req-1'));
    await enPlazo(buzon.espera());
    expect(buzon.enCurso).toBe('req-1');

    buzon.corta('el servidor de la partida ha cerrado el canal');
    expect(buzon.enCurso).toBeNull();
  });

  it('una consulta en vuelo se rechaza al cortar, en vez de quedarse huérfana', async () => {
    // Preguntar `game_state` al agotar la espera tampoco respondía: la consulta
    // viajaba por el mismo socket muerto y su promesa moría con él.
    const buzon = new Buzon();
    const enVuelo = buzon.consulta('q-1', () => {});
    expect(buzon.consultasEnVuelo).toBe(1);

    buzon.corta('el servidor de la partida ha cerrado el canal');

    await expect(enPlazo(enVuelo)).rejects.toThrow(/cerrado el canal.*no va a responder nunca/);
    expect(buzon.consultasEnVuelo).toBe(0);
  });

  it('una consulta que responde bien devuelve sus datos, y una que falla su motivo', async () => {
    const buzon = new Buzon();
    const buena = buzon.consulta('q-1', () => {});
    buzon.resuelveConsulta('q-1', { ok: true, data: { day: 4 } });
    expect(await enPlazo(buena)).toEqual({ day: 4 });

    const mala = buzon.consulta('q-2', () => {});
    buzon.resuelveConsulta('q-2', { ok: false, error: 'consulta desconocida: "mapa"' });
    await expect(enPlazo(mala)).rejects.toThrow('consulta desconocida: "mapa"');
    expect(buzon.consultasEnVuelo).toBe(0);
  });

  it('una consulta que no responde NUNCA se rinde sola, no se cuelga', async () => {
    // `AgentLink` daba plazo a cada petición y el buzón no daba ninguno: un
    // `query_result` que no llegara con el socket vivo dejaba la promesa
    // esperando para siempre. Es el mismo cuelgue en el camino que no se miró.
    const buzon = new Buzon(60);
    const enVuelo = buzon.consulta('q-1', () => {});

    await expect(enPlazo(enVuelo, 400)).rejects.toThrow(/no ha respondido a la consulta/);
    expect(buzon.consultasEnVuelo).toBe(0);
  });

  it('una consulta que no llega a salir no se queda esperando respuesta', async () => {
    const buzon = new Buzon();
    const consulta = buzon.consulta('q-1', () => {
      throw new Error('no hay conexión con el servidor de la partida');
    });
    await expect(enPlazo(consulta)).rejects.toThrow('no hay conexión');
    expect(buzon.consultasEnVuelo).toBe(0);
  });
});
