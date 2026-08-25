/**
 * Los dos puertos del servidor salen del entorno, y lo que no es un puerto se
 * rechaza diciéndolo.
 *
 * Es la misma regla que `parseSeed`, y por el mismo motivo: `HEROES_AGENT_PORT`
 * mal escrita se convertía en `NaN`, el servidor abría un puerto al azar y el
 * puente se quedaba llamando al 9881 de siempre. Un fallo así no se ve: se ve
 * un agente que no conecta.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  AGENT_PORT_POR_DEFECTO,
  puertoAgente,
  puertoEspectadores,
  SPECTATOR_PORT_POR_DEFECTO,
} from '../src/server/puertos.js';

const VARIABLES = ['HEROES_AGENT_PORT', 'HEROES_SPECTATOR_PORT'] as const;

afterEach(() => {
  for (const v of VARIABLES) delete process.env[v];
});

describe('los puertos del servidor', () => {
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
