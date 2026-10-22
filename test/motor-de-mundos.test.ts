/**
 * La generación de un mundo desde el menú (`tools/mundo/motor.ts`): lo que se le
 * deja hacer al motor y cómo se cuenta lo que hace. Lanzarlo de verdad es la
 * verificación en el navegador (C3), no un test: gasta la suscripción.
 */
import { describe, expect, it } from 'vitest';
import { RAIZ } from '../tools/mundo/disco.js';
import {
  argumentosDelMotor,
  esSuValidacion,
  leerPedido,
  lineaDelMotor,
  respuestaDelValidador,
} from '../tools/mundo/motor.js';

describe('el motor de mundos', () => {
  it('solo puede escribir la historia de su mundo y validar ese mundo, sin preguntar a nadie', () => {
    const a = argumentosDelMotor('gen-20261022-7');
    expect(a.slice(0, 2)).toEqual(['-p', '/motor-de-mundos gen-20261022-7']);
    expect(a[a.indexOf('--permission-mode') + 1]).toBe('dontAsk');
    expect(a[a.indexOf('--permission-prompts') + 1]).toBe('none');
    expect(a[a.indexOf('--allowedTools') + 1]).toBe(
      'Read Glob Grep Write(assets/mundos/gen-20261022-7/historia.json) Edit(assets/mundos/gen-20261022-7/historia.json) Bash(pnpm mundo validar gen-20261022-7)',
    );
    expect(a).toContain('--strict-mcp-config');
    expect(a[a.indexOf('--settings') + 1]).toBe('{"disableAllHooks":true}');
  });

  it('cuenta en una línea lo que hace el motor, sin rutas ni lo que se le deniega', () => {
    const id = 'gen-20261022-7';
    const usa = (...content: unknown[]) =>
      JSON.stringify({ type: 'assistant', message: { content } });
    const uso = usa(
      { type: 'text', text: 'Leo el mapa.' },
      { type: 'tool_use', name: 'Bash', input: { command: `pnpm mundo validar ${id}` } },
    );
    expect(lineaDelMotor(uso, id)).toBe('Leo el mapa. · valida la historia');
    expect(esSuValidacion(uso, id)).toBe(true);
    // Lo que no tiene permiso no es noticia, y una ruta de la máquina no sale.
    expect(
      lineaDelMotor(
        usa({ type: 'tool_use', name: 'Bash', input: { command: `ls ${RAIZ}/assets` } }),
        id,
      ),
    ).toBeNull();
    expect(
      lineaDelMotor(
        usa({
          type: 'tool_use',
          name: 'Read',
          input: { file_path: `${RAIZ}/.cache/mundos/${id}/lectura.json` },
        }),
        id,
      ),
    ).toBe('lee el mapa por regiones');
    expect(lineaDelMotor(usa({ type: 'text', text: `Escribo ${RAIZ}/assets/x` }), id)).toBe(
      'Escribo assets/x',
    );
    expect(lineaDelMotor(JSON.stringify({ type: 'system', subtype: 'init' }), id)).toBe(
      'el motor ha arrancado',
    );
    expect(
      lineaDelMotor(JSON.stringify({ type: 'user', message: { content: [] } }), id),
    ).toBeNull();
  });

  it('lee lo que le contesta el validador: sus problemas, o que vale', () => {
    const contesta = (texto: string) =>
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'tool_result', content: texto, is_error: true }] },
      });
    expect(
      respuestaDelValidador(
        contesta(
          'historia.json: lugares[0].at: (0, 0) está en el borde del mapa\nhistoria.json: marcas.x: sobra',
        ),
      ),
    ).toEqual([
      'historia.json: lugares[0].at: (0, 0) está en el borde del mapa',
      'historia.json: marcas.x: sobra',
    ]);
    expect(respuestaDelValidador(contesta('el mundo "x" vale: se juega con ?mundo=x'))).toEqual([]);
    expect(respuestaDelValidador(contesta('Permission denied'))).toBeNull();
  });

  it('rechaza lo que el menú no puede pedir', () => {
    expect(() => leerPedido({ faccion: 'elfos', regionesPorBando: 6 })).toThrow(
      '«regionesPorBando» tiene que ser 4, 5, 7; es 6',
    );
    expect(() => leerPedido({ faccion: 'enanos', regionesPorBando: 5 })).toThrow(
      'no es una facción',
    );
    expect(leerPedido({ faccion: 'elfos', regionesPorBando: 5 }).faccion).toBe('elfos');
    // El héroe de otra facción, antes de gastar el motor (H7 del QA).
    expect(() => leerPedido({ faccion: 'imperio', heroe: 'orko', regionesPorBando: 5 })).toThrow(
      '«heroe»: "orko" no es un tipo de héroe de imperio',
    );
  });
});
