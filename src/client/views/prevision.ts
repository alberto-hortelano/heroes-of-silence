/**
 * La previsión de daño dicha para la barra: lo que daría el golpe, el disparo o
 * el hechizo que se señala. Las cifras son del núcleo (`previsionDe`, la misma
 * cuenta que aplica el daño); aquí solo se escriben. Lo comparten la partida y
 * la arena a través de la escena de batalla, que es una.
 */
import type {
  Prevision,
  PrevisionDeContraataque,
  PrevisionDeGolpe,
  PrevisionDeHechizo,
} from '@core/battle/battle.js';
import type { Horquilla, Modificador, RamaDeSuerte } from '@core/battle/damage.js';
import { DESCRIPCION_DE_REGLA } from '@core/battle/reglas.js';
import { spell } from '@core/battle/spells.js';
import { conComa } from '@core/types.js';
import { cifraDeEfecto, enRondas } from './panels.js';

/** Un número con coma decimal y dos decimales como mucho. */
function decimal(n: number): string {
  return conComa(n, 2);
}

function horquilla(h: Horquilla): string {
  return h.min === h.max ? `${h.min}` : `${h.min}–${h.max}`;
}

function porciento(p: number): string {
  return `${decimal(p * 100)} %`;
}

function suerte(buena: RamaDeSuerte | null, mala: RamaDeSuerte | null): string {
  const partes: string[] = [];
  if (buena !== null)
    partes.push(`con suerte (${porciento(buena.probabilidad)}) ${horquilla(buena)}`);
  if (mala !== null) {
    partes.push(`con mala suerte (${porciento(mala.probabilidad)}) ${horquilla(mala)}`);
  }
  return partes.length === 0 ? '' : `, ${partes.join(', ')}`;
}

function modificadores(ms: readonly Modificador[]): string {
  if (ms.length === 0) return '';
  const dichos = ms.map((m) => (m.factor === null ? m.causa : `${m.causa} ×${decimal(m.factor)}`));
  return ` Cuenta: ${dichos.join('; ')}.`;
}

function reglas(p: Prevision): string {
  if (p.reglas.length === 0) return '';
  return ` Reglas de fheroes2: ${p.reglas.map((r) => DESCRIPCION_DE_REGLA[r].nombre.toLowerCase()).join(', ')}.`;
}

function contraataque(c: PrevisionDeContraataque | null): string {
  if (c === null) return ' Sin contraataque.';
  const si = c.seguro ? '' : ' si sobrevive';
  return ` Contraataque${si}: ${horquilla(c.danio)}${suerte(c.buena, c.mala)}.`;
}

function deGolpe(p: PrevisionDeGolpe, nombre: (id: string) => string): string {
  const golpes = p.golpes > 1 ? ` por golpe (${p.golpes} golpes)` : '';
  const bajas =
    p.bajas.max === 0
      ? 'no caería ninguno'
      : p.bajas.max === 1 && p.bajas.min === 1
        ? 'caería 1'
        : `caerían ${horquilla(p.bajas)}`;
  const leQuedan =
    p.leQuedan.max === 0 ? 'no le quedaría nada' : `le quedarían ${horquilla(p.leQuedan)} PV`;
  const salpica = p.salpica.length === 0 ? '' : ` Salpica a ${p.salpica.map(nombre).join(', ')}.`;
  return (
    `Daño ${horquilla(p.danio)}${golpes}${suerte(p.buena, p.mala)}: ${bajas} y ${leQuedan}.` +
    `${p.kind === 'golpe' ? contraataque(p.contraataque) : ''}${salpica}` +
    `${modificadores(p.modificadores)}${reglas(p)}`
  );
}

function deHechizo(p: PrevisionDeHechizo): string {
  const s = spell(p.hechizo);
  if (p.danio !== null) {
    const bajas =
      p.bajas === 0 ? 'no caería ninguno' : p.bajas === 1 ? 'caería 1' : `caerían ${p.bajas}`;
    const leQuedan = p.leQuedan === 0 ? 'no le quedaría nada' : `le quedarían ${p.leQuedan} PV`;
    return `${s.name}: ${p.danio} de daño, ${bajas} y ${leQuedan}.${reglas(p)}`;
  }
  if (p.cura !== null) return `${s.name}: cura ${p.cura} PV.${reglas(p)}`;
  if (p.efecto !== null) {
    const e = p.efecto;
    const que = cifraDeEfecto(e.kind, e.amount);
    return `${s.name}: ${que} durante ${enRondas(e.roundsLeft)}.${reglas(p)}`;
  }
  return `${s.name}.${reglas(p)}`;
}

/**
 * La previsión en una frase para la barra. `nombre` dice cómo se llama en el
 * campo cada stack (`nombreEnElCampo`), para la salpicadura.
 */
export function textoDePrevision(p: Prevision, nombre: (id: string) => string): string {
  return p.kind === 'hechizo' ? deHechizo(p) : deGolpe(p, nombre);
}
