/**
 * La previsión de daño dicha para la barra: lo que daría el golpe, el disparo o
 * el hechizo o el poder que se señala. Las cifras son del núcleo (`previsionDe`, la misma
 * cuenta que aplica el daño); aquí solo se escriben. Lo comparten la partida y
 * la arena a través de la escena de batalla, que es una.
 */
import type {
  Prevision,
  PrevisionDeContraataque,
  PrevisionDeGolpe,
  PrevisionDeLanzar,
} from '@core/battle/battle.js';
import type { Horquilla, Modificador, RamaDeSuerte } from '@core/battle/damage.js';
import type { StackEffect } from '@core/battle/effects.js';
import { poder } from '@core/battle/poderes.js';
import { DESCRIPCION_DE_REGLA } from '@core/battle/reglas.js';
import { spell } from '@core/battle/spells.js';
import { conComa } from '@core/types.js';
import { cifraDeEfecto, enRondas } from './panels.js';

/** Un número con coma decimal y dos decimales como mucho. */
function decimal(n: number): string {
  return conComa(n, 2);
}

/** «7–12», o «9» si las dos puntas son la misma: la horquilla de la previsión y de la rueda. */
export function horquilla(h: Horquilla): string {
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

function reglas(p: Pick<Prevision, 'reglas'>): string {
  if (p.reglas.length === 0) return '';
  return ` Reglas de fheroes2: ${p.reglas.map((r) => DESCRIPCION_DE_REGLA[r].nombre.toLowerCase()).join(', ')}.`;
}

/**
 * «Contraataque con Daga (cuerpo a cuerpo), si sobrevive: 9–18.»: el arma con que
 * lo devuelve, en la arena, es la de cuerpo a cuerpo y no la del golpe (un jinete
 * carga con la lanza y devuelve con la espada), y la barra lo dice.
 */
function contraataque(c: PrevisionDeContraataque | null): string {
  if (c === null) return ' Sin contraataque.';
  const con = c.conArma === null ? '' : ` ${c.conArma}`;
  const si = c.seguro ? '' : `${con === '' ? '' : ','} si sobrevive`;
  return ` Contraataque${con}${si}: ${horquilla(c.danio)}${suerte(c.buena, c.mala)}.`;
}

function deGolpe(p: PrevisionDeGolpe, nombre: (id: string) => string): string {
  // Con carga y más de un golpe, solo el primero la cobra (`intercambio`).
  const golpes =
    p.siguientes !== null
      ? ` el primer golpe, con la carga, y ${horquilla(p.siguientes)} ${p.golpes === 2 ? 'el segundo' : `cada uno de los otros ${p.golpes - 1}`}`
      : p.golpes > 1
        ? ` por golpe (${p.golpes} golpes)`
        : '';
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

/**
 * Lo que hace un hechizo que no hiere, en pocas palabras: «cura 4 PV», «suerte +1
 * durante 3 rondas»; `null` si no cura ni deja nada. Una sola redacción para la
 * previsión del hechizo, la del poder y lo que la ficha de la arena dice del
 * poder (`queHaceElPoder`).
 */
export function curaOEfecto(cura: number | null, efecto: StackEffect | null): string | null {
  if (cura !== null) return `cura ${cura} PV`;
  if (efecto !== null) {
    return `${cifraDeEfecto(efecto.kind, efecto.amount)} durante ${enRondas(efecto.roundsLeft)}`;
  }
  return null;
}

/**
 * Un hechizo (del héroe o de un poder) en una frase: «Bendición: suerte +1
 * durante 3 rondas.», «Curar a Escudero: cura 4 PV.». `quien` es lo que va
 * delante de los dos puntos.
 */
function deLanzar(quien: string, p: PrevisionDeLanzar): string {
  if (p.danio !== null) {
    const bajas =
      p.bajas === 0 ? 'no caería ninguno' : p.bajas === 1 ? 'caería 1' : `caerían ${p.bajas}`;
    const leQuedan = p.leQuedan === 0 ? 'no le quedaría nada' : `le quedarían ${p.leQuedan} PV`;
    // Lo que para la armadura, como en el parte («193 de daño (−7 armadura)»): sin
    // ello se veía 193 donde se esperaba 200 (A1 de QA de #262).
    const armadura = p.parado > 0 ? ` (−${p.parado} armadura)` : '';
    return `${quien}: ${p.danio} de daño${armadura}, ${bajas} y ${leQuedan}.${reglas(p)}`;
  }
  const hace = curaOEfecto(p.cura, p.efecto);
  return `${quien}${hace === null ? '' : `: ${hace}`}.${reglas(p)}`;
}

/**
 * La previsión en una frase para la barra. `nombre` dice cómo se llama en el
 * campo cada stack (`nombreEnElCampo`), para la salpicadura y el poder.
 */
export function textoDePrevision(p: Prevision, nombre: (id: string) => string): string {
  switch (p.kind) {
    case 'hechizo':
      return deLanzar(spell(p.hechizo).name, p);
    case 'poder':
      return deLanzar(`${poder(p.poder).nombre} a ${nombre(p.objetivo)}`, p);
    case 'golpe':
    case 'disparo':
      return deGolpe(p, nombre);
  }
}
