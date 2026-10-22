/**
 * La generación de un mundo desde el menú (`tools/mundo/motor.ts`): lo que se le
 * deja hacer al motor y cómo se cuenta lo que hace. Lanzarlo de verdad es la
 * verificación en el navegador (C3), no un test: gasta la suscripción.
 */
import { describe, expect, it } from 'vitest';
import { argumentosDelMotor, leerPedido, lineaDelMotor } from '../tools/mundo/motor.js';

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

  it('cuenta en una línea lo que hace el motor', () => {
    const uso = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Leo el mapa.' },
          { type: 'tool_use', name: 'Bash', input: { command: 'pnpm mundo validar x' } },
        ],
      },
    });
    expect(lineaDelMotor(uso)).toBe('Leo el mapa. · Bash pnpm mundo validar x');
    expect(lineaDelMotor(JSON.stringify({ type: 'system', subtype: 'init' }))).toBe(
      'el motor ha arrancado',
    );
    expect(lineaDelMotor(JSON.stringify({ type: 'user', message: { content: [] } }))).toBeNull();
  });

  it('rechaza lo que el menú no puede pedir', () => {
    expect(() => leerPedido({ faccion: 'elfos', regionesPorBando: 6 })).toThrow(
      '«regionesPorBando» tiene que ser 4, 5, 7; es 6',
    );
    expect(() => leerPedido({ faccion: 'enanos', regionesPorBando: 5 })).toThrow(
      'no es una facción',
    );
    expect(leerPedido({ faccion: 'elfos', regionesPorBando: 5 }).faccion).toBe('elfos');
  });
});
