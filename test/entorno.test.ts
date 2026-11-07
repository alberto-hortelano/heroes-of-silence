/**
 * Lo que el servidor lee del entorno, y lo que no vale se rechaza diciéndolo.
 *
 * Es la misma regla que `parseSeed`, y por el mismo motivo: `HEROES_AGENT_PORT`
 * mal escrita se convertía en `NaN`, el servidor abría un puerto al azar y el
 * puente se quedaba llamando al 9881 de siempre. Un fallo así no se ve: se ve
 * un agente que no conecta.
 *
 * Las cuatro variables se prueban **aquí** y no donde se usan porque
 * `ws-server.ts` arranca el servidor al importarlo: dos de las cuatro vivían
 * allí y por eso no las probaba nadie. Lo mismo `HEROES_SERVER`, la del puente
 * MCP, que abre su transporte de stdio al importarse y la leía sin validar hasta
 * la fase S de la reorganización (07-11-2026).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import {
  AGENT_PORT_POR_DEFECTO,
  combateDelEntorno,
  ESPERA_AL_AGENTE_POR_DEFECTO,
  esperaAlAgente,
  maxDiasDelEntorno,
  ordenDelMotor,
  puertoAgente,
  puertoEspectadores,
  SPECTATOR_PORT_POR_DEFECTO,
  servidorDelPuente,
  textoDelEntorno,
} from '../src/server/entorno.js';

const VARIABLES = [
  'HEROES_AGENT_PORT',
  'HEROES_SPECTATOR_PORT',
  'HEROES_MAX_DAYS',
  'HEROES_WAIT_AGENT_MS',
  'HEROES_TROPA',
  'HEROES_RUEDA',
  'HEROES_MOTOR',
  'HEROES_SERVER',
] as const;

afterEach(() => {
  for (const v of VARIABLES) delete process.env[v];
});

describe('la configuración de entorno del servidor', () => {
  it('el motor de mundos es claude, otra orden si se pide, y nunca una línea de shell', () => {
    expect(ordenDelMotor()).toBe('claude');
    process.env.HEROES_MOTOR = 'false';
    expect(ordenDelMotor()).toBe('false');
    process.env.HEROES_MOTOR = 'claude --dangerously-skip-permissions';
    expect(() => ordenDelMotor()).toThrow(/HEROES_MOTOR=.* no es una orden/);
  });

  it('sin variable son los de siempre: quien no sepa que esto existe no nota nada', () => {
    expect(puertoAgente()).toBe(9881);
    expect(puertoEspectadores()).toBe(9880);
    expect(AGENT_PORT_POR_DEFECTO).toBe(9881);
    expect(SPECTATOR_PORT_POR_DEFECTO).toBe(9880);
  });

  it('con la variable vacía tampoco hay nada que rechazar', () => {
    process.env.HEROES_AGENT_PORT = '';
    process.env.HEROES_SPECTATOR_PORT = '   ';
    expect(puertoAgente()).toBe(9881);
    expect(puertoEspectadores()).toBe(9880);
  });

  it('un puerto se respeta, y cada canal lee el suyo', () => {
    process.env.HEROES_AGENT_PORT = '9999';
    expect(puertoAgente()).toBe(9999);
    expect(puertoEspectadores()).toBe(9880);
  });

  it('el 0 vale: es "que lo elija el sistema", y es lo que usa el arnés', () => {
    process.env.HEROES_AGENT_PORT = '0';
    process.env.HEROES_SPECTATOR_PORT = '0';
    expect(puertoAgente()).toBe(0);
    expect(puertoEspectadores()).toBe(0);
  });

  it.each(['ochomil', '9881.5', '-1', '65536', 'NaN', '8 0'])(
    'lo que no es un puerto se rechaza diciendo por qué: %s',
    (malo) => {
      process.env.HEROES_AGENT_PORT = malo;
      expect(() => puertoAgente()).toThrow(/no es un puerto/);
      // Y el mensaje nombra la variable, que es lo que hay que ir a arreglar.
      expect(() => puertoAgente()).toThrow(/HEROES_AGENT_PORT/);
    },
  );

  it('el hexadecimal cuela, igual que en parseSeed: 0x1f son 31 y 31 es un puerto', () => {
    // No es un descuido: `Number` lo entiende sin ambigüedad y la semilla se
    // comporta igual. Queda escrito para que nadie lo "arregle" y rompa la
    // simetría con `parseSeed`.
    process.env.HEROES_AGENT_PORT = '0x1f';
    expect(puertoAgente()).toBe(31);
  });

  it('el rechazo del canal de espectadores nombra SU variable, no la del agente', () => {
    process.env.HEROES_SPECTATOR_PORT = 'ochomil';
    expect(() => puertoEspectadores()).toThrow(/HEROES_SPECTATOR_PORT/);
  });
});

describe('lo pedido en una variable (textoDelEntorno)', () => {
  it('sin variable, o en blanco, no se ha pedido nada; si no, lo pedido tal cual', () => {
    expect(textoDelEntorno('HEROES_SERVER')).toBeUndefined();
    process.env.HEROES_SERVER = '';
    expect(textoDelEntorno('HEROES_SERVER')).toBeUndefined();
    process.env.HEROES_SERVER = '  \t ';
    expect(textoDelEntorno('HEROES_SERVER')).toBeUndefined();
    // Tal cual, con su blanco: el mensaje que la rechace dice lo que se escribió.
    process.env.HEROES_SERVER = ' ws://localhost:1 ';
    expect(textoDelEntorno('HEROES_SERVER')).toBe(' ws://localhost:1 ');
  });
});

describe('el servidor del puente (HEROES_SERVER)', () => {
  it('sin variable, o en blanco, el canal del agente de esta máquina: el de HEROES_AGENT_PORT', () => {
    expect(servidorDelPuente()).toBe('ws://localhost:9881');
    // En blanco era la dirección vacía, y cada herramienta que habla con la partida
    // fallaba con «Invalid URL»: no pedir no es un error.
    process.env.HEROES_SERVER = '   ';
    expect(servidorDelPuente()).toBe('ws://localhost:9881');
    process.env.HEROES_AGENT_PORT = '9999';
    expect(servidorDelPuente()).toBe('ws://localhost:9999');
  });

  it('con el puerto del agente a 0 no adivina: pide HEROES_SERVER', () => {
    process.env.HEROES_AGENT_PORT = '0';
    expect(() => servidorDelPuente()).toThrow(
      'HEROES_AGENT_PORT=0 deja que el puerto lo elija el sistema: dile al puente a dónde conectarse con HEROES_SERVER=ws://localhost:<puerto>',
    );
    process.env.HEROES_SERVER = 'ws://localhost:4567';
    expect(servidorDelPuente()).toBe('ws://localhost:4567');
  });

  it('una dirección ws:// o wss:// se respeta, sin el blanco de los lados', () => {
    process.env.HEROES_SERVER = 'ws://127.0.0.1:4567';
    expect(servidorDelPuente()).toBe('ws://127.0.0.1:4567');
    process.env.HEROES_SERVER = ' wss://partida.example/agente ';
    expect(servidorDelPuente()).toBe('wss://partida.example/agente');
  });

  it.each([
    'ochomil',
    '9881',
    'localhost:9881',
    'http://localhost:9881',
    'ws://',
    'ws://:9881',
    'ws://localhost:99999',
    'ws+unix:/tmp/partida',
  ])(
    'lo que no es la dirección de una partida se rechaza al arrancar, diciendo la variable: %s',
    (malo) => {
      // Se leía sin validar: el puente arrancaba igual y cada escucha y cada consulta
      // devolvían «Invalid URL» o el error de `ws` con los protocolos que admite.
      process.env.HEROES_SERVER = malo;
      expect(() => servidorDelPuente()).toThrow(
        `HEROES_SERVER="${malo}" no es la dirección de una partida: tiene que ser una URL ws:// o wss://, como ws://localhost:9881`,
      );
    },
  );
});

describe('el tope de días', () => {
  it('sin variable no se pide tope: manda el de newGame, que no se copia aquí', () => {
    // `undefined` y no un 200: el número por defecto es del núcleo, y escribirlo
    // también aquí sería la copia que este ciclo vino a quitar.
    expect(maxDiasDelEntorno()).toBeUndefined();
    process.env.HEROES_MAX_DAYS = '';
    expect(maxDiasDelEntorno()).toBeUndefined();
  });

  it('un tope se respeta', () => {
    process.env.HEROES_MAX_DAYS = '12';
    expect(maxDiasDelEntorno()).toBe(12);
  });

  it.each(['abc', '0', '-3', '7.5', 'NaN', '1e21', '9007199254740993'])(
    'lo que no es un tope se rechaza: %s',
    (malo) => {
      // El `abc` es el caso vivo: daba `NaN`, y con el tope dentro del núcleo un
      // `day >= NaN` no se cumple nunca — o sea una partida que no termina jamás.
      // El `0` también se rechaza: una partida de cero días no es una partida.
      //
      // Los dos últimos los encontró QA y son la misma familia que el `abc`: los
      // dos son enteros para `Number.isInteger`, y `1e21` da la partida eterna
      // por el otro lado —`day >= 1e21` tampoco se cumple nunca—, mientras que
      // `9007199254740993` vuelve del `Number` como `…992`, o sea un tope que
      // nadie escribió. Por eso el parser mira `isSafeInteger`.
      process.env.HEROES_MAX_DAYS = malo;
      expect(() => maxDiasDelEntorno()).toThrow(/HEROES_MAX_DAYS/);
      expect(() => maxDiasDelEntorno()).toThrow(/no es un tope de días/);
    },
  );
});

describe('el plazo de espera del agente', () => {
  it('sin variable son los dos minutos de siempre', () => {
    expect(esperaAlAgente()).toBe(ESPERA_AL_AGENTE_POR_DEFECTO);
    expect(ESPERA_AL_AGENTE_POR_DEFECTO).toBe(120_000);
  });

  it('el 0 vale y significa no esperar a nadie', () => {
    process.env.HEROES_WAIT_AGENT_MS = '0';
    expect(esperaAlAgente()).toBe(0);
  });

  it.each(['abc', '-1', '1.5'])('lo que no es un plazo se rechaza: %s', (malo) => {
    // Este es el que más caro salía y el que nadie miraba: `setTimeout(f, NaN)`
    // **dispara a 1 ms** (medido: «disparó a los 2 ms», y node avisa con un
    // `TimeoutNaNWarning` que se pierde entre las trazas de arranque), así que
    // con `HEROES_WAIT_AGENT_MS=abc` el servidor decidía que no había venido
    // nadie y se jugaba la partida entera con la IA de reglas mientras el agente
    // esperaba su turno — y lo que se leía era «no ha venido nadie», una frase
    // normal.
    process.env.HEROES_WAIT_AGENT_MS = malo;
    expect(() => esperaAlAgente()).toThrow(/HEROES_WAIT_AGENT_MS/);
    expect(() => esperaAlAgente()).toThrow(/no es un plazo de espera/);
  });
});

describe('la complejidad del combate (HEROES_TROPA, HEROES_RUEDA)', () => {
  it('sin ninguna, la de siempre (7 / 7); con una, la otra es la de siempre', () => {
    expect(combateDelEntorno()).toEqual(COMBATE_COMPLETO);
    process.env.HEROES_RUEDA = '5';
    expect(combateDelEntorno()).toEqual({ tope: 7, rueda: 5 });
    process.env.HEROES_TROPA = '3';
    expect(combateDelEntorno()).toEqual({ tope: 3, rueda: 5 });
  });

  it('lo que no vale se rechaza diciendo la variable y qué vale', () => {
    process.env.HEROES_TROPA = '4';
    expect(() => combateDelEntorno()).toThrow(
      'HEROES_TROPA: «4» no es un tope de tropa: valen 3, 5 o 7',
    );
    delete process.env.HEROES_TROPA;
    process.env.HEROES_RUEDA = 'siete';
    expect(() => combateDelEntorno()).toThrow(
      'HEROES_RUEDA: «siete» no es una rueda: valen 3, 5 o 7',
    );
  });
});
