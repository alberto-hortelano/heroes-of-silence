/**
 * Lo que suma una pieza, dicho para quien juega (`modificadoresDePieza`, la única
 * lectura de qué se enseña de una pieza, y `textoDeModificador`, el único que lo
 * formatea), lo que tira (`dichoDelTiro`) y la montura (`DICHO_DE_LA_MONTURA`).
 *
 * Era parte de `hero/equipo.ts`, repartido en `equipo/` en la fase N de la
 * reorganización (07-11-2026); qué es el equipo y dónde vive, en `vestir.ts`.
 */
import {
  CIFRAS_DE_PIEZA,
  type CifraDePieza,
  NOMBRE_DE_CIFRA,
  type TiroDelGolpe,
} from '../types.js';
import { aDosManos, esDeGuerra, esLanza } from './manos.js';
import type { Pieza } from './pieza.js';
import { tiroDelGolpe } from './vestir.js';

/**
 * La montura dicha para quien juega (26-10-2026): la nota de su hueco y de su
 * sección en el editor de equipo y la de la ficha. La regla la aplican
 * `cifrasDelCuerpo` y `marchaDe` (`unidad/cuerpo.ts`); esto la cuenta.
 */
export const DICHO_DE_LA_MONTURA =
  'La montura tiene su fuerza, su agilidad y su peso, que no se suman a las de quien monta. De guerra, se monta en batalla: lo que pesa el equipo del jinete y ella se mide contra su fuerza, las casillas son las suyas tras ese peso y el jinete pelea con su agilidad entera; con una lanza, la carga pega con la fuerza de la montura más la de la lanza. De silla, no entra en batalla: allí se pelea a pie. En el mapa cada uno anda lo de su montura, de guerra o de silla, o lo suyo a pie, y manda el más lento del grupo, el héroe incluido.';

/**
 * Una cosa que suma una pieza: una cifra con su valor (el peso no suma: pesa; la
 * fuerza y la agilidad de una montura tampoco: son suyas, `propia`) o una marca que
 * no es cifra (`dosManos`: va sola; `lanza`: con montura de guerra, carga con la
 * fuerza de ella; `guerra` y `silla`: si la montura se monta en batalla o solo en
 * el mapa).
 */
export type ModificadorDePieza =
  | {
      readonly kind: 'cifra';
      readonly cifra: CifraDePieza;
      readonly valor: number;
      /** La cifra es de la pieza y no se suma a nadie (la de una montura): se dice sin signo. */
      readonly propia?: true;
    }
  | { readonly kind: 'marca'; readonly marca: 'dosManos' | 'lanza' | 'guerra' | 'silla' }
  /** Lo que tira (02-11-2026): un arma de fuego con su recarga, o una granada con sus cargas. */
  | { readonly kind: 'tiro'; readonly cual: TiroDelGolpe };

/**
 * Lo que suma una pieza, como lista: las cifras distintas de cero en el orden de
 * `CIFRAS_DE_PIEZA` y, detrás, sus marcas. **La única lectura** de qué se enseña
 * de una pieza: la pintan igual la ficha de la arena, el editor de equipo, los
 * paneles del juego y la prosa del agente (`textoDeModificador`).
 */
export function modificadoresDePieza(p: Pieza): ModificadorDePieza[] {
  const valor: Readonly<Record<CifraDePieza, number>> = {
    ataque: p.ataque,
    fuerza: p.fuerza ?? 0,
    agilidad: p.agilidad ?? 0,
    defensa: p.defensa,
    armadura: p.armadura ?? 0,
    peso: p.peso,
  };
  const montura = p.hueco === 'montura';
  // La agilidad de un arma de fuego es suya, como la de una montura: la de su horquilla.
  const propia = (cifra: CifraDePieza): boolean =>
    (montura && cifra !== 'peso') || (p.hueco === 'distancia' && cifra === 'agilidad');
  const cifras: ModificadorDePieza[] = CIFRAS_DE_PIEZA.flatMap((cifra) =>
    valor[cifra] === 0
      ? []
      : [
          {
            kind: 'cifra' as const,
            cifra,
            valor: valor[cifra],
            ...(propia(cifra) ? { propia: true as const } : {}),
          },
        ],
  );
  const tiro = tiroDelGolpe(p);
  const marcas: ModificadorDePieza[] = [
    ...(aDosManos(p) ? [{ kind: 'marca' as const, marca: 'dosManos' as const }] : []),
    ...(esLanza(p) ? [{ kind: 'marca' as const, marca: 'lanza' as const }] : []),
    ...(montura
      ? [
          {
            kind: 'marca' as const,
            marca: esDeGuerra(p) ? ('guerra' as const) : ('silla' as const),
          },
        ]
      : []),
    ...(tiro === undefined ? [] : [{ kind: 'tiro' as const, cual: tiro }]),
  ];
  return [...cifras, ...marcas];
}

/** Cada marca de una pieza dicha para quien juega (`textoDeModificador`). */
const DICHO_DE_LA_MARCA: Readonly<
  Record<Extract<ModificadorDePieza, { kind: 'marca' }>['marca'], string>
> = {
  dosManos: 'a dos manos',
  lanza: 'lanza: carga con la fuerza de la montura de guerra',
  guerra: 'de guerra: se monta en batalla',
  silla: 'de silla: solo en el mapa',
};

/**
 * Lo que tira una pieza dicho para quien juega: «arma de fuego: perfora la armadura,
 * recarga 2 turnos» o «granada: 2 por batalla». Lo leen sus modificadores, la ficha
 * y la prosa del agente.
 */
export function dichoDelTiro(t: TiroDelGolpe): string {
  return t.kind === 'fuego'
    ? `arma de fuego: perfora la armadura, recarga ${t.recarga} ${t.recarga === 1 ? 'turno' : 'turnos'}`
    : `granada: ${t.cargas} por batalla`;
}

/** Un número con su signo siempre: «+2», «−1» (el menos tipográfico), «+0». */
export function conSigno(n: number): string {
  return n < 0 ? `−${-n}` : `+${n}`;
}

/**
 * Un modificador en texto: «+2 Ataque», «+10 Fuerza», «Peso 4», «a dos manos».
 * **El único sitio que formatea** lo que suma una pieza: el marcado lo envuelve,
 * un `<option>` y el agente lo leen tal cual. El peso va sin signo: no se suma a
 * ninguna cifra, se compara con la fuerza.
 */
export function textoDeModificador(m: ModificadorDePieza): string {
  if (m.kind === 'marca') return DICHO_DE_LA_MARCA[m.marca];
  if (m.kind === 'tiro') return dichoDelTiro(m.cual);
  if (m.cifra === 'peso' || m.propia === true) return `${NOMBRE_DE_CIFRA[m.cifra]} ${m.valor}`;
  return `${conSigno(m.valor)} ${NOMBRE_DE_CIFRA[m.cifra]}`;
}

/**
 * Lo que suma una pieza, en texto plano: los modificadores separados por comas
 * («+4 Ataque, +20 Fuerza, Peso 12, a dos manos»), o vacío si no suma nada. Para donde no
 * cabe marcado (un `<option>`, la prosa del agente).
 */
export function cifrasDePieza(p: Pieza): string {
  return modificadoresDePieza(p).map(textoDeModificador).join(', ');
}
