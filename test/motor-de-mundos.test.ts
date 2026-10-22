/**
 * La generación de un mundo desde el menú (`tools/mundo/motor.ts`): lo que se le
 * deja hacer al motor y cómo se cuenta lo que hace. Lanzarlo de verdad es la
 * verificación en el navegador (C3), no un test: gasta la suscripción.
 */

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mundoNuevo } from '../src/core/mundo/partida.js';
import {
  borrarMundoGenerado,
  borrarSinHistoria,
  leerMundoDeDisco,
  lineaDeProblema,
  PALABRAS_MINIMAS_DE_LA_BIBLIA,
  problemaDeLaBiblia,
  problemaDeLaLinea,
  RAIZ,
} from '../tools/mundo/disco.js';
import { describirMedida, medirMundo } from '../tools/mundo/medida.js';
import {
  argumentosDelMotor,
  Conflicto,
  ESFUERZO_DEL_MOTOR,
  empezar,
  esSuValidacion,
  leerPedido,
  lineaDelMotor,
  MODELO_DEL_MOTOR,
  progresoDe,
  respuestaDelValidador,
  sinRutas,
} from '../tools/mundo/motor.js';

describe('el motor de mundos', () => {
  it('solo puede escribir la biblia y la historia de su mundo y validar ese mundo, sin preguntar a nadie', () => {
    const a = argumentosDelMotor('gen-20261022-7');
    expect(a.slice(0, 2)).toEqual(['-p', '/motor-de-mundos gen-20261022-7']);
    // Opus con esfuerzo alto, fijos: que no dependa de los ajustes de quien lo lanza.
    expect(a[a.indexOf('--model') + 1]).toBe(MODELO_DEL_MOTOR);
    expect(a[a.indexOf('--effort') + 1]).toBe(ESFUERZO_DEL_MOTOR);
    expect(a[a.indexOf('--permission-mode') + 1]).toBe('dontAsk');
    expect(a[a.indexOf('--permission-prompts') + 1]).toBe('none');
    expect(a[a.indexOf('--allowedTools') + 1]).toBe(
      'Read Glob Grep Write(assets/mundos/gen-20261022-7/biblia.md) Edit(assets/mundos/gen-20261022-7/biblia.md) Write(assets/mundos/gen-20261022-7/historia.json) Edit(assets/mundos/gen-20261022-7/historia.json) Bash(pnpm mundo validar gen-20261022-7)',
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
    expect(lineaDelMotor(uso, id)).toBe('Leo el mapa. · valida el mundo');
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
    // La biblia se cuenta como la historia: escribirla, corregirla y releerla.
    const conFichero = (name: string, fichero: string) =>
      lineaDelMotor(
        usa({ type: 'tool_use', name, input: { file_path: `${RAIZ}/assets/mundos/${fichero}` } }),
        id,
      );
    expect(conFichero('Write', `${id}/biblia.md`)).toBe('escribe la biblia');
    expect(conFichero('Edit', `${id}/biblia.md`)).toBe('corrige la biblia');
    expect(conFichero('Read', `${id}/biblia.md`)).toBe('relee la biblia');
    expect(conFichero('Read', 'prueba/biblia.md')).toBe('lee una biblia de ejemplo');
    expect(conFichero('Write', `${id}/historia.json`)).toBe('escribe la historia');
    // La de otro mundo no tiene permiso: no es noticia.
    expect(conFichero('Write', 'prueba/biblia.md')).toBeNull();
    expect(lineaDelMotor(JSON.stringify({ type: 'system', subtype: 'init' }), id)).toBe(
      'el motor ha arrancado',
    );
    expect(
      lineaDelMotor(JSON.stringify({ type: 'user', message: { content: [] } }), id),
    ).toBeNull();
  });

  it('ninguna ruta absoluta, tampoco las de fuera del repositorio (M4 de la vuelta 2)', () => {
    expect(sinRutas('… y miro /home/al/.claude/skills.')).toBe('… y miro skills.');
    expect(sinRutas('leo ~/.claude/skills/motor/SKILL.md, y sigo')).toBe('leo SKILL.md, y sigo');
    expect(sinRutas(`(${RAIZ}/assets/mundos/x/historia.json)`)).toBe(
      '(assets/mundos/x/historia.json)',
    );
    // Ni una URL ni una fracción son rutas de la máquina.
    expect(sinRutas('mira https://x.com/a/b y 1/2')).toBe('mira https://x.com/a/b y 1/2');
    const usa = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Busco en /home/al/.claude/skills/x' }] },
    });
    expect(lineaDelMotor(usa, 'gen-1')).toBe('Busco en x');
  });

  it('lee lo que le contesta el validador: sus problemas, o que vale', () => {
    const contesta = (texto: string) =>
      JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'tool_result', content: texto, is_error: true }] },
      });
    // Tal como lo escribe `pnpm mundo validar` (`lineaDeProblema`), con la biblia: una
    // corta también es un problema de la espera.
    const problemas = [
      problemaDeLaBiblia('doce palabras', 'x') as string,
      'historia.json: lugares[0].at: (0, 0) está en el borde del mapa',
      'plan.json: no está en assets/mundos/x/',
    ];
    expect(
      respuestaDelValidador(
        contesta(`el mundo "x" tiene 3 problemas:\n${problemas.map(lineaDeProblema).join('\n')}`),
      ),
    ).toEqual(problemas);
    // Una línea suelta que no es de un fichero del mundo, o sin el «- », no es un problema.
    expect(problemaDeLaLinea('- leo el mapa')).toBeNull();
    expect(problemaDeLaLinea('historia.json: marcas.x: sobra')).toBeNull();
    expect(problemaDeLaLinea(`  ${lineaDeProblema('mundo.json: id: sobra')}`)).toBe(
      'mundo.json: id: sobra',
    );
    expect(respuestaDelValidador(contesta('el mundo "x" vale: se juega con ?mundo=x'))).toEqual([]);
    expect(respuestaDelValidador(contesta('Permission denied'))).toBeNull();
  });

  it('una biblia que no está, vacía o corta no vale, y lo dice con su fichero', () => {
    expect(problemaDeLaBiblia(null, 'gen-1')).toBe(
      'biblia.md: no está; la escribe el motor antes que la historia (assets/mundos/gen-1/biblia.md)',
    );
    expect(problemaDeLaBiblia(' \n\t ', 'gen-1')).toMatch(/^biblia\.md: tiene 0 palabras y /);
    const palabras = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`).join(' \n');
    expect(problemaDeLaBiblia(palabras(PALABRAS_MINIMAS_DE_LA_BIBLIA - 1), 'gen-1')).toBe(
      'biblia.md: tiene 399 palabras y una biblia lleva al menos 400: qué pasó antes, quién es quién, la trama y sus desenlaces',
    );
    expect(problemaDeLaBiblia(palabras(PALABRAS_MINIMAS_DE_LA_BIBLIA), 'gen-1')).toBeNull();
  });

  it('«pnpm mundo medir» cuenta la trama de un mundo (prueba: dos lugares sueltos)', async () => {
    const { mundo, biblia } = await leerMundoDeDisco('prueba');
    const m = medirMundo(mundo, biblia);
    expect(m).toMatchObject({
      lugares: 2,
      regiones: 1,
      marcas: 5,
      marcasQueCruzan: [],
      encadenados: 1,
      exclusiones: [],
    });
    expect(m.palabrasDeLaBiblia).toBeGreaterThanOrEqual(PALABRAS_MINIMAS_DE_LA_BIBLIA);
    expect(m.personas).toEqual([
      {
        lugar: 'puente-de-corvo',
        punto: 'corvo',
        nombre: 'Corvo',
        nodos: 4,
        hondura: 2,
        conHace: 3,
      },
    ]);
    expect(describirMedida('prueba', { ...m, palabrasDeLaBiblia: 412 })).toEqual([
      'prueba: lugares: 2 · regiones: 1 · marcas: 5 · marcas que cruzan: — · lugares encadenados: 1 · desenlaces que se excluyen: — · palabras de la biblia: 412',
      '  puente-de-corvo · Corvo: nodos: 4 · hondura: 2 · opciones que hacen algo: 3',
    ]);
  });

  // Sus cifras no se fijan: `ejemplo` se regenerará con la trama (fase B).
  it('«pnpm mundo medir» mide «ejemplo» sin lanzar', async () => {
    const { mundo, biblia } = await leerMundoDeDisco('ejemplo');
    expect(describirMedida('ejemplo', medirMundo(mundo, biblia))[0]).toMatch(/^ejemplo: lugares: /);
  });

  it('un mundo que no está o no se lee no se mide: lanza diciéndolo', async () => {
    await expect(leerMundoDeDisco('no-hay-tal-mundo')).rejects.toThrow(
      'no hay ningún mundo "no-hay-tal-mundo" en assets/mundos/',
    );
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
    // Lo que no lleva un pedido no se ignora (M5 de la vuelta 2), ni lo que no es un objeto.
    expect(() => leerPedido({ faccion: 'elfos', regionesPorBando: 5, rivales: 2 })).toThrow(
      'el pedido no lleva «rivales»: lleva «faccion», «regionesPorBando», «heroe», «id», «semilla»',
    );
    expect(() => leerPedido([])).toThrow('el pedido tiene que ser un objeto');
    expect(() => leerPedido({ faccion: 'elfos', regionesPorBando: 5, id: '../x' })).toThrow(
      '«id»: "../x" no es el id de un mundo',
    );
  });

  it('la orden admite los tamaños del menú, y no otros (M5 de la vuelta 2)', () => {
    expect(() =>
      mundoNuevo({ id: 'gen-x', semilla: 1, faccion: 'elfos', regionesPorBando: 6 }),
    ).toThrow('«regionesPorBando» tiene que ser 4, 5, 7; es 6');
  });

  it('un id que ya existe es un conflicto, antes de lanzar nada (M5 de la vuelta 2)', () => {
    expect(() => empezar({ faccion: 'imperio', regionesPorBando: 5, id: 'prueba' })).toThrow(
      Conflicto,
    );
    expect(() => empezar({ faccion: 'imperio', regionesPorBando: 5, id: 'prueba' })).toThrow(
      'ya hay un mundo "prueba": pide otro id u otra semilla, o bórralo a mano',
    );
    expect(progresoDe('prueba')).toBeNull();
  });

  it('un mundo que no es «gen-*» no se borra nunca (M7 de la vuelta 2)', async () => {
    // Con un id que no está en disco: si el guardia fallara, no borraría nada de nadie.
    expect(existsSync(`${RAIZ}/assets/mundos/de-nadie`)).toBe(false);
    await expect(borrarMundoGenerado('de-nadie')).rejects.toThrow(
      'el mundo "de-nadie" no es uno generado («gen-…»): no se borra',
    );
    await expect(borrarSinHistoria('de-nadie')).rejects.toThrow('no se borra');
  });
});
