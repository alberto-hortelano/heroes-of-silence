/**
 * La rueda del golpe de la arena: todo el sector responde (#258) y la cabecera
 * enseña a los dos que se cruzan, con su figura, su vista previa y su ficha
 * (#261). Docs: docs/agents/2026-10-14-rueda-sectores-y-contrincantes/.
 *
 * Lo que se ve en el navegador —que el recorte del botón recibe de verdad el
 * clic en toda la corona y solo en ella, la vista previa al pasar el ratón, la
 * ficha encima de la rueda— lo mira `pnpm capturas` (pasada
 * «rueda-contrincantes»). Aquí, el marcado: que la forma que recorta cada botón es
 * la que pinta el disco, que la colocación sale del ángulo y no del tipo, y que lo
 * nuevo no deja ver lo que eligió el otro.
 */
import { describe, expect, it } from 'vitest';
import { caraDeLaArena } from '../src/client/arena/paneles.js';
import { EscenaBatalla } from '../src/client/escenas/batalla.js';
import { marcadoDe } from '../src/client/html.js';
import {
  anguloDe,
  haciaDe,
  idDeLaForma,
  medidasDeLaRueda,
  renderDesenlace,
  renderEleccion,
  sitioEnLaRueda,
} from '../src/client/rueda/rueda.js';
import type { SesionDeArena } from '../src/client/session.js';
import { efectoEnCurso } from '../src/client/views/panels.js';
import { stackById } from '../src/core/battle/battle.js';
import {
  contraataqueDelCruce,
  duracion,
  formaDeLaBatalla,
  LAS_TRES_RUEDAS,
  RUEDA_DE_REFERENCIA,
  type TipoDeGolpe,
} from '../src/core/battle/rueda.js';
import { spell } from '../src/core/battle/spells.js';
import { TIPOS_DEL_ANILLO } from '../src/core/types.js';
import { hastaLaRueda, PESADA, sesionDeArena, TROPA, unidadDeArena } from './helpers.js';

/** Las peleas de estos tests, con la rueda de siempre (7). */
const RUEDA = RUEDA_DE_REFERENCIA;
const TIPOS_DE_GOLPE = RUEDA.golpes;
const MEDIDAS_DE_LA_RUEDA = medidasDeLaRueda(RUEDA);

/** Tres guerreros con escudo contra tres con mandoble, los dos bandos «Yo», con la rueda. */
function sesion(semilla = 1): SesionDeArena {
  const tres = (id: string) => [0, 1, 2].map(() => ({ unidad: unidadDeArena(id), ia: false }));
  const s = sesionDeArena(tres(TROPA), tres(PESADA), semilla);
  s.empezar();
  return s;
}

/** Juega hasta que la rueda pide el golpe (`hastaLaRueda`). */
function hastaElGolpe(s: SesionDeArena): void {
  hastaLaRueda(s, true, 'golpe');
}

/** El atributo `nombre` del elemento que empieza en `desde` dentro de `m`. */
function atributo(m: string, desde: number, nombre: string): string | null {
  const fin = m.indexOf('>', desde);
  const etiqueta = m.slice(desde, fin);
  return new RegExp(`\\s${nombre}="([^"]*)"`).exec(etiqueta)?.[1] ?? null;
}

describe('#258: el botón de cada sector se recorta a lo que se ve', () => {
  const s = sesion();
  hastaElGolpe(s);
  const p = s.ruedaPendiente;
  if (p === null) throw new Error('la rueda no pide el golpe');
  const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));

  it('cada tipo tiene su <clipPath>, con la misma forma que pinta el disco', () => {
    for (const t of TIPOS_DE_GOLPE) {
      const forma = m.indexOf(`<clipPath id="${idDeLaForma(t)}"`);
      expect(forma, t).toBeGreaterThan(-1);
      // El trazo del recorte y el del disco, el mismo: una sola geometría.
      const dentro = m.slice(forma, m.indexOf('</clipPath>', forma));
      const delDisco = m.indexOf(`data-sector="${t}"`, m.indexOf('class="disco"'));
      if (t === 'normal') {
        expect(dentro).toContain(`r="${MEDIDAS_DE_LA_RUEDA.radioDelCentro}"`);
        expect(m.slice(delDisco - 40, delDisco + 60)).toContain(
          `r="${MEDIDAS_DE_LA_RUEDA.radioDelCentro}"`,
        );
      } else {
        const d = atributo(dentro, dentro.indexOf('<path'), 'd');
        const inicio = m.lastIndexOf('<path', delDisco);
        expect(d, t).not.toBeNull();
        expect(atributo(m, inicio, 'd'), t).toBe(d);
      }
      expect(dentro).toContain('clipPathUnits="objectBoundingBox"');
      // Un botón por tipo, dentro de su sitio.
      expect(m).toContain(`data-golpe="${t}"`);
    }
    // Los ids, una vez cada uno: el `url(#…)` del recorte no puede dudar.
    expect(m.match(/<clipPath id="/g)).toHaveLength(TIPOS_DE_GOLPE.length);
    expect(m.match(/id="forma-de-/g)).toHaveLength(TIPOS_DE_GOLPE.length);
  });

  it('el desenlace no lleva recortes: no tiene botones, y sus ids chocarían con los de otra rueda', () => {
    const otra = sesion();
    hastaElGolpe(otra);
    otra.elegirEnLaRueda('fuerte');
    otra.elegirEnLaRueda('normal');
    const b = otra.battle;
    const i = b.log.findIndex((e) => e.kind === 'cruce');
    const e = b.log[i];
    if (e?.kind !== 'cruce') throw new Error('sin cruce');
    const d = marcadoDe(
      renderDesenlace(b, e, contraataqueDelCruce(b.log, i), null, caraDeLaArena(otra)),
    );
    expect(d).not.toContain('<clipPath');
    expect(d).not.toContain('data-golpe=');
  });
});

describe('R3 de QA (#263): R. guardia dice en cuánto deja el contraataque antes de elegir', () => {
  it('su nota, y su etiqueta, llevan el contraataque con cada éxito frente al de Normal', () => {
    // La 2: en la 1, desde la fuerza y la agilidad (25-10-2026), pega antes el del mandoble.
    const s = sesion(2);
    hastaElGolpe(s);
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no pide el golpe');
    const ahora = p.prevision.contraataque;
    const porExito = p.prevision.porTipo?.romperGuardia?.contraataquePorExito ?? [];
    expect(ahora).not.toBeNull();
    // Pega el guerrero con escudo, con la espada: Romper guardia en el nivel 3
    // (quita 0, 0, 1, 2 y 3 del mínimo al máximo). El medio, el alto y el máximo
    // rebajan el contraataque; el bajo y el mínimo, no.
    expect(p.atacante.body).toBe(TROPA);
    expect(porExito.map((x) => x.punto)).toEqual([4, 3, 2]);
    const h = (x: { min: number; max: number }) =>
      x.min === x.max ? `${x.min}` : `${x.min}–${x.max}`;
    const frase = `Su contraataque (con Normal, ${h(ahora ?? { min: 0, max: 0 })}) queda, según el éxito, en: ${porExito
      .map((x) => `${['mínimo', 'bajo', 'medio', 'alto', 'máximo'][x.punto]}, ${h(x.danio)}`)
      .join('; ')}.`;
    const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
    const rg = m.slice(m.indexOf('data-golpe="romperGuardia"'), m.indexOf('data-golpe="normal"'));
    // Una vez en la etiqueta del botón y otra en su «ⓘ».
    expect(rg.split(frase)).toHaveLength(3);
    // Los demás tipos no lo dicen.
    expect(m.split('Su contraataque (con Normal')).toHaveLength(3);
  });
});

describe('#258: la colocación sale del ángulo del sector, no de su tipo', () => {
  it('haciaDe: hacia fuera, por cuartos', () => {
    expect([-90, -30, 30, 90, 150, 210, -150].map(haciaDe)).toEqual([
      'arriba',
      'derecha',
      'derecha',
      'abajo',
      'izquierda',
      'izquierda',
      'izquierda',
    ]);
    // Los bordes de cada cuarto, al siguiente en el sentido de las agujas.
    expect([-135, -45, 45, 135].map(haciaDe)).toEqual(['arriba', 'derecha', 'abajo', 'izquierda']);
  });

  it('cada sitio dice hacia dónde abre su nota con su ángulo, y Normal hacia abajo', () => {
    const s = sesion();
    hastaElGolpe(s);
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no pide el golpe');
    const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
    for (const t of TIPOS_DE_GOLPE) {
      const sitio = m.indexOf(`<div class="sector-de-rueda" data-sector="${t}"`);
      expect(sitio, t).toBeGreaterThan(-1);
      expect(atributo(m, sitio, 'data-hacia'), t).toBe(
        t === 'normal' ? 'abajo' : haciaDe(anguloDe(t, RUEDA)),
      );
    }
  });

  it('el rótulo y el «ⓘ» de cada sector caen dentro de su sector, sea cual sea el orden del anillo y en las tres ruedas', () => {
    for (const forma of LAS_TRES_RUEDAS) {
      const { dentro, fuera, radioDelCentro, medioSector } = medidasDeLaRueda(forma);
      for (const t of forma.golpes) {
        const { rotulo, nota } = sitioEnLaRueda(t, forma);
        for (const [que, q] of [
          ['rótulo', rotulo],
          ['nota', nota],
        ] as const) {
          const r = Math.hypot(q.x, q.y);
          if (t === 'normal') {
            expect(r, `${t}, ${que}`).toBeLessThan(radioDelCentro);
            continue;
          }
          expect(r, `${t}, ${que}`).toBeGreaterThan(dentro);
          expect(r, `${t}, ${que}`).toBeLessThan(fuera);
          const g = (Math.atan2(q.y, q.x) * 180) / Math.PI;
          const desvio = Math.abs(((g - anguloDe(t, forma) + 540) % 360) - 180);
          expect(desvio, `${t}, ${que}`).toBeLessThan(medioSector);
        }
      }
    }
  });
});

describe('#261: los dos contrincantes en la cabecera', () => {
  it('las dos figuras, de quien pega y de quien recibe, en ese orden, con su hoja y su bando, en las dos fases', () => {
    const s = sesion();
    hastaElGolpe(s);
    for (const fase of ['golpe', 'respuesta'] as const) {
      const p = s.ruedaPendiente;
      if (p?.fase !== fase) throw new Error(`la rueda no pide ${fase}`);
      const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
      const figuras = [
        ...m.matchAll(/<canvas class="figura" data-figura="([^"]*)" data-bando="([^"]*)"/g),
      ];
      expect(
        figuras.map((f) => `${f[1]}/${f[2]}`),
        fase,
      ).toEqual([p.atacante, p.objetivo].map((x) => `${x.body}/${x.side}`));
      // Cada figura es el botón de su ficha, con su vista previa.
      for (const x of [p.atacante, p.objetivo]) {
        expect(m).toContain(`data-arena="ficha-en-la-rueda" data-stack="${x.id}"`);
        expect(m).toContain(`aria-describedby="previa-${x.id}"`);
        expect(m).toContain(`<div class="vista-previa" id="previa-${x.id}" role="tooltip">`);
      }
      // «ataca a» entre los dos.
      const ataca = m.indexOf('ataca a');
      expect(m.indexOf(`data-contrincante="${p.atacante.id}"`)).toBeLessThan(ataca);
      expect(m.indexOf(`data-contrincante="${p.objetivo.id}"`)).toBeGreaterThan(ataca);
      if (fase === 'golpe') s.elegirEnLaRueda('fuerte');
    }
  });

  it('en el desenlace, las dos figuras sin botón ni vista previa', () => {
    const s = sesion();
    hastaElGolpe(s);
    s.elegirEnLaRueda('fuerte');
    s.elegirEnLaRueda('normal');
    const b = s.battle;
    const i = b.log.findIndex((e) => e.kind === 'cruce');
    const e = b.log[i];
    if (e?.kind !== 'cruce') throw new Error('sin cruce');
    const m = marcadoDe(
      renderDesenlace(b, e, contraataqueDelCruce(b.log, i), null, caraDeLaArena(s)),
    );
    expect(m.match(/<canvas class="figura"/g)).toHaveLength(2);
    expect(m).not.toContain('ficha-en-la-rueda');
    expect(m).not.toContain('vista-previa');
  });

  it('en la respuesta, nada de lo nuevo deja ver el golpe: dos golpes distintos, la misma rueda', () => {
    const conGolpe = (golpe: TipoDeGolpe): string => {
      const s = sesion();
      hastaElGolpe(s);
      s.elegirEnLaRueda(golpe);
      const p = s.ruedaPendiente;
      if (p?.fase !== 'respuesta') throw new Error('la rueda no pide la respuesta');
      return marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
    };
    const fuerte = conGolpe('fuerte');
    expect(fuerte).toContain('vista-previa');
    expect(conGolpe('rapido')).toBe(fuerte);
    expect(conGolpe('defensivo')).toBe(fuerte);
  });
});

describe('#261: la vista previa', () => {
  /** La vista previa de `id` en la rueda del golpe de la sesión. */
  const previa = (s: SesionDeArena, id: string): string => {
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('sin rueda');
    const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
    const desde = m.indexOf(`id="previa-${id}"`);
    return m.slice(desde, m.indexOf('</div><span class="quien">', desde));
  };

  it('el nombre, la vida y las cifras con lo que cambia el equipo (el guerrero con escudo: espada, brigantina y escudo)', () => {
    const s = sesion();
    hastaElGolpe(s);
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('sin rueda');
    const guerrero = [p.atacante, p.objetivo].find((x) => x.body === TROPA);
    if (guerrero === undefined) throw new Error('el guerrero no se cruza');
    const v = previa(s, guerrero.id);
    expect(v).toContain('Guerrero con escudo');
    expect(v).toContain(`${guerrero.topHp} / 50 PV`);
    // Del catálogo de piezas (data/equipo.json): Espada +3 ataque y +3 de fuerza;
    // Brigantina 2 de armadura y ningún PV (#262); el escudo, defensa. Lo puesto
    // pesa 8, y con fuerza 7 no le resta agilidad: las casillas no cambian.
    expect(v).toContain('data-cifra="ataque">+3 Ataque');
    expect(v).toContain('data-cifra="danio">+3 / +12 Daño');
    expect(v).not.toContain('data-cifra="pv"');
    expect(v).toContain('<span class="label">Armadura</span><span>2</span>');
    expect(v).not.toContain('data-cifra="casillas"');
    expect(v).toMatch(/data-cifra="defensa">\+3 Defensa/);
    // El daño de la rueda es el del cuerpo a cuerpo, en una fila y sin notas: su
    // fuerza (7) con la de la Espada (3), por su agilidad (4).
    expect(v).toContain('<span class="label">Daño</span><span>10–40');
    expect(v).not.toContain('class="nota"');
  });

  it('los efectos que lleva, con lo que le queda; sin ninguno, «ninguno»', () => {
    const s = sesion();
    hastaElGolpe(s);
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('sin rueda');
    const x = stackById(s.battle, p.objetivo.id);
    expect(previa(s, x.id)).toContain('<span class="sin-efectos">ninguno</span>');
    x.effects.push(
      {
        kind: 'defense',
        amount: 1,
        source: 'defensivo',
        roundsLeft: 2,
        hasta: { turno: 1, al: 'empezar' },
      },
      { kind: 'speed', amount: -2, source: 'slow', roundsLeft: 3 },
    );
    const v = previa(s, x.id);
    expect(v).toContain(`Defensivo: defensa +1 ${duracion('empezar', 'su')}`);
    expect(v).toContain(`${spell('slow').name}: velocidad -2 durante 3 rondas`);
    expect(v).not.toContain('ninguno');
    // La frase es la de `efectoEnCurso`, la única.
    for (const e of x.effects) expect(v).toContain(efectoEnCurso(e, formaDeLaBatalla(s.battle)));
  });

  it('si ya devolvió un golpe esta ronda', () => {
    const s = sesion();
    hastaElGolpe(s);
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('sin rueda');
    const x = stackById(s.battle, p.objetivo.id);
    x.retaliated = false;
    expect(previa(s, x.id)).toContain('data-contraataco="no">aún puede devolver uno esta ronda');
    x.retaliated = true;
    expect(previa(s, x.id)).toContain('data-contraataco="si">ya devolvió un golpe esta ronda');
  });
});

describe('#261: los dos, señalados en el tablero', () => {
  it('con la rueda esperando el golpe, la escena da los dos que se cruzan; sin rueda, nadie', () => {
    const s = sesion();
    const escena = new EscenaBatalla(() => s);
    // El animador cuenta lo nuevo desde que lo ve: se le deja ver y luego acabar.
    let ahora = 0;
    const despues = (ms: number): number => {
      ahora += ms;
      return ahora;
    };
    const alDia = (): void => {
      escena.sincronizar(despues(1e7));
      escena.sincronizar(despues(1e7));
    };
    alDia();
    expect(escena.enLaRueda()).toBeNull();
    hastaElGolpe(s);
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('sin rueda');
    // Mientras se cuenta la marcha hasta el enemigo, aún no: la rueda espera.
    escena.sincronizar(despues(1));
    expect(escena.ocupada).toBe(true);
    expect(escena.enLaRueda()).toBeNull();
    alDia();
    expect(escena.enLaRueda()).toEqual({ atacante: p.atacante.id, objetivo: p.objetivo.id });
    // Escape antes de elegir: suelta el golpe, y la escena ya no señala a nadie.
    expect(s.cancelarGolpe()).toBe(true);
    alDia();
    expect(escena.enLaRueda()).toBeNull();
  });
});

describe('la veta del anillo alterna como una ruleta', () => {
  it('dos sectores vecinos nunca tienen el mismo color, tampoco el último y el primero', () => {
    // Marca del usuario (19-10-2026): ofensivo y romper guardia salían con el color
    // cambiado, porque el CSS los elegía por una lista de tipos de antes de #263.
    const s = sesion();
    hastaElGolpe(s);
    const p = s.ruedaPendiente;
    if (p === null) throw new Error('la rueda no pide el golpe');
    const m = marcadoDe(renderEleccion(s.battle, p, null, caraDeLaArena(s)));
    const disco = m.indexOf('class="disco"');
    const veta = (t: string) => atributo(m, m.indexOf(`data-sector="${t}"`, disco), 'data-veta');
    const vetas = TIPOS_DEL_ANILLO.map(veta);
    expect(vetas.every((v) => v === 'mesa' || v === 'madera')).toBe(true);
    for (const [i, v] of vetas.entries()) {
      expect(v, TIPOS_DEL_ANILLO[i]).not.toBe(vetas[(i + 1) % vetas.length]);
    }
  });
});
