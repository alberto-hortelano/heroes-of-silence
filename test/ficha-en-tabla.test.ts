/**
 * La ficha de la arena en tabla, con las notas como tooltip (13-10-2026, el
 * usuario: «quita la parte superior donde se muestra lo que tendría en la pelea
 * […] Cualquier aclaración o nota debe ir como tooltip […] Las características
 * en una sola columna con su valor y después otra casilla no editable con el
 * valor final […] Estandariza la forma de mostrar los modificadores del equipo»).
 *
 * Se prueba la FORMA de lo pintado —sin notas en párrafo, la columna final que no
 * se escribe y lleva lo que pelea, una sola forma de los modificadores— en las
 * tres fichas, en el montaje y en el combate. Nada de comparar combates.
 */
import { describe, expect, it } from 'vitest';
import {
  type ComoDeLaFicha,
  enElMontaje,
  renderEquipo,
  renderFicha,
  renderFichaDeHeroe,
} from '../src/client/arena/paneles.js';
import { marcadoDe } from '../src/client/html.js';
import { fichaDeHeroeDeArena, heroePorDefecto } from '../src/core/arena/heroe.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { unidadDeArena } from './pelea-de-arena.js';

const MONTAJE = enElMontaje(EQUIPO_DEL_JUEGO);
const COMBATE: ComoDeLaFicha = { ...MONTAJE, enCombate: true };

/** Un templario con escudo y sin arma: la defensa sube; el ataque y las casillas no cambian. */
const CON_ESCUDO = unidadDeArena('templario-escudo', { equipo: { escudo: 'escudo' } });

/**
 * Las dos fichas, en el montaje y en el combate: la de una unidad y la del héroe.
 * La de una criatura del catálogo se fue con el catálogo (13-10-2026).
 */
function lasDos(): readonly { readonly quien: string; readonly marcado: string }[] {
  return [MONTAJE, COMBATE].flatMap((como) => [
    {
      quien: `unidad (${como.enCombate ? 'combate' : 'montaje'})`,
      marcado: marcadoDe(renderFicha(CON_ESCUDO, false, como)),
    },
    {
      quien: `héroe (${como.enCombate ? 'combate' : 'montaje'})`,
      marcado: marcadoDe(renderFichaDeHeroe('izquierda', heroePorDefecto('izquierda'), como, [])),
    },
  ]);
}

/** El número de la casilla final de la fila `clave`, o lanza si no la hay. */
function finalDe(marcado: string, clave: string): { valor: number; cambiada: boolean } {
  const m = new RegExp(
    `<output class="(cambiada|igual)" data-final="${clave}"[^>]*>(-?\\d+)</output>`,
  ).exec(marcado);
  if (m === null) throw new Error(`la ficha no lleva la casilla final de «${clave}»`);
  return { valor: Number(m[2]), cambiada: m[1] === 'cambiada' };
}

describe('la ficha en tabla, con las notas como tooltip (13-10-2026)', () => {
  it('ni «En la pelea», ni la frase del cuerpo, ni aclaraciones en los rótulos, ni notas en párrafo', () => {
    for (const { quien, marcado } of lasDos()) {
      expect(marcado, quien).not.toContain('data-en-la-pelea');
      expect(marcado, quien).not.toContain('En la pelea (con el equipo)');
      expect(marcado, quien).not.toContain('<p class="cost">');
      for (const aclaracion of [
        '(casillas,',
        '(0 = cuerpo a cuerpo)',
        '(1 o 2)',
        '(oro)',
        '(su Poder)',
      ]) {
        expect(marcado, `${quien}: ${aclaracion}`).not.toContain(aclaracion);
      }
      // La frase del cuerpo solo vive en la nota de la columna (unidad).
      expect(marcado.replace(/title="[^"]*"|aria-label="[^"]*"/g, ''), quien).not.toContain(
        'Cifras del cuerpo',
      );
    }
  });

  it('toda fila de la tabla lleva su nota, la casilla final no se escribe y el nivel va arriba sin nota', () => {
    for (const { quien, marcado } of lasDos()) {
      expect(marcado, quien).toContain('<table class="tabla-de-cifras">');
      const filas = [...marcado.matchAll(/<tr data-cifra-de-la-ficha="([^"]+)">([\s\S]*?)<\/tr>/g)];
      expect(filas.length, quien).toBeGreaterThanOrEqual(7);
      for (const [, clave, fila] of filas) {
        expect(fila, `${quien}: ${clave}`).toMatch(
          /<th scope="row">[^<]+<span class="nota" tabindex="-1" role="note" aria-label="[^"]+"/,
        );
        // La casilla lleva la nota de su fila: el «ⓘ» no está en el orden del tabulador.
        const casilla = /<input [^>]*>/.exec(fila ?? '')?.[0];
        if (casilla !== undefined)
          expect(casilla, `${quien}: ${clave}`).toMatch(/aria-description="[^"]+"/);
        const final = /<td class="final">([\s\S]*?)<\/td>/.exec(fila ?? '')?.[1] ?? '';
        expect(final, `${quien}: ${clave}`).toContain('<output');
        expect(final, `${quien}: ${clave}`).not.toMatch(/<input|<select|contenteditable/);
      }
      const nivel = /<div class="row nivel-de-la-ficha"[\s\S]*?<\/div>/.exec(marcado)?.[0] ?? '';
      expect(nivel, quien).toMatch(/Índice \d+ · nivel \d/);
      expect(nivel, quien).not.toContain('class="nota"');
      // La nota de cada sección va en su título.
      for (const h3 of marcado.match(/<h3>[\s\S]*?<\/h3>/g) ?? []) {
        if (/Equipo|Rasgos|Poderes|Habilidades/.test(h3))
          expect(h3, quien).toContain('class="nota"');
      }
    }
  });

  it('la del héroe: ataque y defensa de su cuerpo, y PV, fuerza y agilidad del de todo héroe', () => {
    const h = heroePorDefecto('izquierda');
    const { cuerpo } = fichaDeHeroeDeArena(h, EQUIPO_DEL_JUEGO);
    const m = marcadoDe(renderFichaDeHeroe('izquierda', h, MONTAJE, []));
    expect(finalDe(m, 'ataque').valor).toBe(cuerpo.attack);
    expect(finalDe(m, 'defensa').valor).toBe(cuerpo.defense);
    expect(finalDe(m, 'poder')).toEqual({ valor: h.poder, cambiada: false });
    expect(finalDe(m, 'hp').valor).toBe(cuerpo.hp);
    // Las tres del cuerpo de todo héroe se escriben (03-11-2026): la casilla, la
    // del héroe recién hecho de data/heroe.json.
    const casilla = (campo: string) =>
      new RegExp(`data-heroe-campo="${campo}" value="(\\d+)"`).exec(m)?.[1];
    expect(casilla('hp')).toBe(String(h.cuerpo.pv.base));
    expect(casilla('fuerza')).toBe(String(h.cuerpo.fuerza.base));
    expect(casilla('agilidad')).toBe(String(h.cuerpo.agilidad));
    expect(m).not.toContain('Cuerpo (con el equipo base)');
  });

  it('ninguna nota lleva `title`: el bocadillo es el único tooltip (H2 de QA)', () => {
    for (const { quien, marcado } of lasDos()) {
      const notas = [...marcado.matchAll(/<span class="nota"[^>]*>/g)].map((m) => m[0]);
      expect(notas.length, quien).toBeGreaterThan(0);
      for (const n of notas) {
        expect(n, quien).toMatch(/aria-label="[^"]+"/);
        expect(n, quien).not.toContain('title=');
      }
    }
  });

  it('el editor de equipo, con la misma regla: sus notas son «ⓘ» y sus rótulos van sin paréntesis', () => {
    for (const [elegida, enCombate] of [
      ['escudo', false],
      ['mandoble', true],
    ] as const) {
      const quien = `${elegida}${enCombate ? ', en combate' : ''}`;
      const m = marcadoDe(
        renderEquipo({
          piezas: EQUIPO_DEL_JUEGO,
          elegida,
          llevan: () => [],
          rechazo: null,
          enCombate,
          sinGuardar: '',
        }),
      );
      // Ningún párrafo de nota: ni la introducción, ni la de la ficha, ni la regla.
      expect(m, quien).not.toMatch(/<p class="(cost|aviso-sin-guardar|aviso-del-enlace)"/);
      for (const dicho of [
        'El catálogo de equipo del juego (data/equipo.json)',
        'Del catálogo de equipo del juego (data/equipo.json)',
        'Regla: ',
      ])
        expect(m, `${quien}: ${dicho}`).toMatch(
          new RegExp(`<span class="nota"[^>]*aria-label="[^"]*${dicho.replace(/[()]/g, '\\$&')}`),
        );
      // Los rótulos de los campos y los de las filas de su tabla (18-10-2026: las
      // cifras de una pieza, en tabla como las de una unidad).
      const rotulos = [
        ...m.matchAll(/<span class="label">([^<]*)/g),
        ...m.matchAll(/<th scope="row">([^<]*)/g),
      ].map((r) => (r[1] ?? '').trim());
      expect(rotulos, quien).toContain(elegida === 'escudo' ? 'Peso' : 'Fuerza');
      expect(rotulos, quien).toContain('Precio en oro');
      expect(
        rotulos.filter((r) => r.includes('(')),
        quien,
      ).toEqual([]);
      expect(m, quien).not.toContain('(sin escudo)');
      if (enCombate) expect(m, quien).toMatch(/aria-label="[^"]*En plena pelea/);
    }
    // Lo que queda por guardar es estado, no nota: se queda en su línea.
    const conSinGuardar = marcadoDe(
      renderEquipo({
        piezas: EQUIPO_DEL_JUEGO,
        elegida: null,
        llevan: () => [],
        rechazo: null,
        enCombate: false,
        sinGuardar: 'Sin guardar: 1 pieza.',
      }),
    );
    expect(conSinGuardar).toContain(
      'role="status" data-sin-guardar="si">Sin guardar: 1 pieza.</p>',
    );
  });
});
