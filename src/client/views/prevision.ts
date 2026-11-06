/**
 * La previsión de daño dicha para la barra: lo que daría el golpe, el disparo o
 * el hechizo o el poder que se señala. Las cifras son del núcleo (`previsionDe`, la misma
 * cuenta que aplica el daño); aquí solo se escriben. Lo comparten la partida y
 * la arena a través de la escena de batalla, que es una.
 */
import type {
  ImpactoDeHechizo,
  Prevision,
  PrevisionDeContraataque,
  PrevisionDeGolpe,
  PrevisionDeGranada,
  PrevisionDeLanzar,
} from '@core/battle/battle.js';
import type { Horquilla, Modificador } from '@core/battle/damage.js';
import { curaOEfecto } from '@core/battle/effects.js';
import { type LibroDeHechizos, nombreDeHechizo } from '@core/magia/catalogo.js';
import { conComa } from '@core/types.js';

/** Un número con coma decimal y dos decimales como mucho. */
function decimal(n: number): string {
  return conComa(n, 2);
}

/** «7–12», o «9» si las dos puntas son la misma: la horquilla de la previsión y de la rueda. */
export function horquilla(h: Horquilla): string {
  return h.min === h.max ? `${h.min}` : `${h.min}–${h.max}`;
}

function modificadores(ms: readonly Modificador[]): string {
  if (ms.length === 0) return '';
  const dichos = ms.map((m) => (m.factor === null ? m.causa : `${m.causa} ×${decimal(m.factor)}`));
  return ` Cuenta: ${dichos.join('; ')}.`;
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
  return ` Contraataque${con}${si}: ${horquilla(c.danio)}.`;
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
    `Daño ${horquilla(p.danio)}${golpes}: ${bajas} y ${leQuedan}.` +
    `${p.kind === 'golpe' ? contraataque(p.contraataque) : ''}${salpica}` +
    `${modificadores(p.modificadores)}`
  );
}

/**
 * Un hechizo (del héroe o de un poder) en una frase: «Prisa: velocidad +2
 * durante 3 rondas.», «Curar a Escudero: cura 4 PV.». `quien` es lo que va
 * delante de los dos puntos.
 */
function deLanzar(quien: string, p: PrevisionDeLanzar, nombre: (id: string) => string): string {
  const uno = (i: ImpactoDeHechizo): string => {
    const partes: string[] = [];
    if (i.danio !== null) {
      const bajas =
        i.bajas === 0 ? 'no caería ninguno' : i.bajas === 1 ? 'caería 1' : `caerían ${i.bajas}`;
      const leQuedan = i.leQuedan === 0 ? 'no le quedaría nada' : `le quedarían ${i.leQuedan} PV`;
      // Lo que para la armadura, como en el parte («193 de daño (−7 armadura)»): sin
      // ello se veía 193 donde se esperaba 200 (A1 de QA de #262).
      const armadura = i.parado > 0 ? ` (−${i.parado} armadura)` : '';
      partes.push(`${i.danio} de daño${armadura}, ${bajas} y ${leQuedan}`);
    }
    const hace = curaOEfecto(i.cura, i.efectos);
    if (hace !== null) partes.push(hace);
    return partes.join('; ');
  };
  const diferido = p.diferido ? ' Cae al empezar su siguiente turno; si cayera ahora:' : '';
  if (p.impactos.length === 0) return `${quien}:${diferido} no alcanzaría a nadie.`;
  const [solo] = p.impactos;
  if (p.impactos.length === 1 && solo !== undefined && solo.objetivo === p.objetivo) {
    const hace = uno(solo);
    return `${quien}${diferido}${hace === '' ? '' : `: ${hace}`}.`;
  }
  return `${quien}:${diferido} ${p.impactos.map((i) => `a ${nombre(i.objetivo)}, ${uno(i) || 'nada'}`).join('; ')}.`;
}

/**
 * La previsión en una frase para la barra. `nombre` dice cómo se llama en el
 * campo cada stack (`nombreEnElCampo`), para la salpicadura y el poder.
 */
export function textoDePrevision(
  p: Prevision,
  nombre: (id: string) => string,
  libro?: LibroDeHechizos,
): string {
  switch (p.kind) {
    case 'hechizo':
      return deLanzar(nombreDeHechizo(p.hechizo, libro), p, nombre);
    case 'poder': {
      const a = p.objetivo === null ? '' : ` a ${nombre(p.objetivo)}`;
      return deLanzar(`${nombreDeHechizo(p.poder, libro)}${a}`, p, nombre);
    }
    case 'golpe':
    case 'disparo':
    case 'explosion':
      return deGolpe(p, nombre);
    case 'granada':
      return deGranada(p, nombre);
  }
}

/**
 * Lo que daría una granada, uno a uno: «A Piquero: daño 8: …; a Escudero: …», o que
 * hoy no daría a nadie. Los del bando de quien la lanza, con «(¡tuyo!)»
 * (`ImpactoDeGranada.aliado`, del núcleo).
 */
function deGranada(p: PrevisionDeGranada, nombre: (id: string) => string): string {
  if (p.impactos.length === 0) return 'Hoy no daría a nadie.';
  return p.impactos
    .map((i) => `A ${nombre(i.objetivo)}${i.aliado ? ' (¡tuyo!)' : ''}: ${deGolpe(i, nombre)}`)
    .join(' ');
}
