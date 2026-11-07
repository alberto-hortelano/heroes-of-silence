/**
 * El equipo: seis huecos por individuo, unidad y héroe —las dos armas de cuerpo a
 * cuerpo, la de disparar, la armadura, el escudo y la montura (`HUECOS`)— con una
 * pieza de `data/equipo.json` en cada uno, o nada: cada arma para lo suyo, y cada
 * golpe con las cifras de la suya (`UnitInfo.armas`). **Una sola clase de piezas**
 * (18-10-2026): las mismas en el juego y en la arena, que las edita y las guarda.
 *
 * Lo pide `NuevaJugabilidad.md` («Las tropas también ganan experiencia y equipo.
 * Cuando mueren se pierde pero dura toda la campaña»), y las cifras son
 * **inventadas y provisionales**: HoMM2 no tiene equipo de tropa.
 *
 * Dónde vive cada cosa:
 *
 * - el de un individuo, en su hoja (`Veterania.equipo`): dura lo que dura él;
 * - el de un héroe, en `Hero.equipo`, y lo que no lleva puesto en su mochila
 *   (`Hero.mochila`), sin tope;
 * - las cifras se suman en las puertas de siempre —`cifrasDeUnidad` para la
 *   tropa y `heroUnit` para el héroe—, con `conEquipo`, que es la única suma.
 *
 * Aquí, lo que da lo puesto: `conEquipo`, la única suma y el único que escribe en
 * una unidad sus armas por uso, su armadura y su montura; lo que lleva puesto
 * (`idsPuestos`, `piezasPuestas`) y si dos unidades tienen las mismas cifras
 * (`mismasCifras`).
 *
 * Era `hero/equipo.ts` hasta la fase N de la reorganización (07-11-2026), repartido
 * en `equipo/`: la pieza y el catálogo del juego (`pieza.ts`), la regla de las manos
 * (`manos.ts`), lo que suma lo puesto (aquí), el catálogo atado (`atado.ts`), a quién
 * se le pone (`portador.ts`) y cómo se dice (`dicho.ts`); el equipo base del héroe,
 * con su cuerpo (`hero/cuerpo-del-heroe.ts`). Son puros y no importan el estado: las
 * acciones que equipan, compran y reparten botín viven en `game.ts`, que es el único
 * que escribe la crónica.
 */

import {
  type ArmasDeLaUnidad,
  type Equipo,
  esArmaPorUso,
  type GolpeConArma,
  HUECOS,
  HUECOS_DE_CUERPO_A_CUERPO,
  type HuecoDeArmaPorUso,
  type MonturaPuesta,
  type NivelesDeLaRueda,
  NOMBRE_DE_HUECO,
  TIPOS_DEL_ANILLO,
  type TiroDelGolpe,
  type UnitInfo,
} from '../types.js';
import { cifrasDelCuerpo } from '../unidad/cuerpo.js';
import { esDeGuerra, esLanza } from './manos.js';
import { type CatalogoDePiezas, PIEZAS_DEL_CATALOGO, type Pieza, piezaDe } from './pieza.js';

/**
 * Los ids de lo que lleva puesto, en el orden de los huecos: lo que vuelve a una
 * mochila, y quién lleva una pieza. Sin catálogo: solo lee los huecos.
 */
export function idsPuestos(equipo: Equipo | undefined): string[] {
  return HUECOS.flatMap((h) => equipo?.[h] ?? []);
}

/** Las piezas puestas, en el orden de los huecos. */
export function piezasPuestas(equipo: Equipo | undefined): Pieza[] {
  return puestasDe(PIEZAS_DEL_CATALOGO, equipo);
}

export function puestasDe(piezas: CatalogoDePiezas, equipo: Equipo | undefined): Pieza[] {
  return idsPuestos(equipo).map((id) => piezaDe(piezas, id));
}

/** Lo que suman las piezas de un equipo, hueco a hueco. */
export interface SumaDeEquipo {
  /**
   * Ataque y fuerza, los del golpe de cuerpo a cuerpo: los del arma. Los de un
   * arma por uso (`esArmaPorUso`) no están: son de su golpe (`UnitInfo.armas`).
   */
  readonly ataque: number;
  readonly fuerza: number;
  /** La del escudo, que suma encima de la agilidad (`cifrasDelCuerpo`). */
  readonly defensa: number;
  /** Los puntos de armadura (`Pieza.armadura`). Ninguna pieza da PV. */
  readonly armadura: number;
  /**
   * Lo que pesa todo, también las armas por uso: el peso es de lo que se lleva.
   * La montura no: carga ese peso, y el suyo cuenta solo contra su fuerza (D3 de
   * `docs/agents/2026-10-26-montura/plan.md`).
   */
  readonly peso: number;
  /** La montura puesta, o `null`: sus cifras son suyas y no se suman a nada de arriba. */
  readonly montura: Pieza | null;
  /** La fuerza de la mejor lanza de cuerpo a cuerpo puesta (`Pieza.lanza`), o `null` sin ninguna. */
  readonly fuerzaDeLaLanza: number | null;
}

/**
 * La suma, **clasificada por la clave del hueco en `equipo`**, no por el hueco
 * que dice la pieza: con un equipo válido es lo mismo. El ataque y la fuerza son
 * solo de las armas de cuerpo a cuerpo (las demás piezas no los llevan,
 * `camposDelHueco`; los de un arma por uso, `esArmaPorUso`, son de su golpe,
 * `armasPorUso`), y de las dos no se suman: cuenta la mejor en cada cifra
 * (25-10-2026, «se usa la característica de la mejor en cada tipo de ataque»). Lo
 * demás de cualquier pieza —defensa, armadura, peso—, siempre, salvo la montura
 * (26-10-2026): su fuerza no es la de un arma y su peso no lo lleva el jinete; va
 * aparte, entera (`montura`).
 */
export function sumaDe(piezas: CatalogoDePiezas, equipo: Equipo | undefined): SumaDeEquipo {
  let defensa = 0;
  let armadura = 0;
  let peso = 0;
  const { montura: idDeLaMontura, ...sinMontura } = equipo ?? {};
  for (const p of puestasDe(piezas, sinMontura)) {
    defensa += p.defensa;
    armadura += p.armadura ?? 0;
    peso += p.peso;
  }
  const armas = deCuerpoACuerpo(piezas, equipo);
  const ataque = Math.max(0, ...armas.map((p) => p.ataque));
  const fuerza = Math.max(0, ...armas.map((p) => p.fuerza ?? 0));
  // Con dos lanzas, la que más fuerza pone en la carga (D5 del plan).
  const lanzas = armas.filter(esLanza);
  const fuerzaDeLaLanza =
    lanzas.length === 0 ? null : Math.max(...lanzas.map((p) => p.fuerza ?? 0));
  const montura = idDeLaMontura === undefined ? null : piezaDe(piezas, idDeLaMontura);
  return { ataque, fuerza, defensa, armadura, peso, montura, fuerzaDeLaLanza };
}

/**
 * Las cifras de la montura `p` como las lleva la unidad (`UnitInfo.montura`): la
 * única lectura de `Pieza.agilidad` y `Pieza.guerra` fuera de la regla de una pieza.
 */
function monturaPuesta(p: Pieza): MonturaPuesta {
  return {
    id: p.id,
    nombre: p.nombre,
    fuerza: p.fuerza ?? 0,
    agilidad: p.agilidad ?? 0,
    peso: p.peso,
    guerra: esDeGuerra(p),
  };
}

/** Lo que el equipo pone en la cuenta del cuerpo (`cifrasDelCuerpo`) con la fuerza de arma `fuerzaDelArma`. */
function loQuePone(
  total: SumaDeEquipo,
  fuerzaDelArma: number,
): NonNullable<Parameters<typeof cifrasDelCuerpo>[1]> {
  return {
    peso: total.peso,
    fuerzaDelArma,
    defensaDelEscudo: total.defensa,
    ...(total.montura === null ? {} : { montura: monturaPuesta(total.montura) }),
    ...(total.fuerzaDeLaLanza === null ? {} : { fuerzaDeLaLanza: total.fuerzaDeLaLanza }),
  };
}

/** Las armas de cuerpo a cuerpo puestas en `equipo`: ninguna, una o dos, en el orden de sus huecos. */
function deCuerpoACuerpo(piezas: CatalogoDePiezas, equipo: Equipo | undefined): Pieza[] {
  return HUECOS_DE_CUERPO_A_CUERPO.flatMap((h) => {
    const id = equipo?.[h];
    return id === undefined ? [] : [piezaDe(piezas, id)];
  });
}

/**
 * Las cifras de `unit` con el equipo sumado (`sumaDe`). La llaman
 * `cifrasDeUnidad`, `cifrasDelIndividuo` y `heroUnit`, y un test exige que las
 * puertas de la tropa den lo mismo.
 *
 * Sin piezas devuelve **la misma referencia**, no una copia. El ataque y la
 * armadura suman; la defensa, el daño y la velocidad se derivan otra vez del
 * cuerpo con todo lo puesto (`cifrasDelCuerpo`: el peso resta agilidad, el arma
 * suma fuerza al daño y el escudo, defensa). Un arma en `distancia` hace tirador
 * a quien la lleva (`isShooter`, que mira `equipo`), sin munición que contar.
 *
 * Deja en `equipo` lo puesto: es de donde se deriva qué suma el equipo
 * (`modificadoresDePieza`). Las cifras sin él no se guardan (19-10-2026: fuera
 * `sinEquipo`): quien necesite el cuerpo desnudo lo saca de su origen.
 */
export function conEquipo<U extends UnitInfo>(unit: U, equipo: Equipo | undefined): U {
  return vestir(PIEZAS_DEL_CATALOGO, unit, equipo);
}

export function vestir<U extends UnitInfo>(
  piezas: CatalogoDePiezas,
  unit: U,
  equipo: Equipo | undefined,
): U {
  if (idsPuestos(equipo).length === 0) return unit;
  // Lo que ya llevaba y lo de ahora, juntos: la misma pieza en un hueco dos veces
  // se sumaría dos veces y el registro diría una.
  const yaPuesto = HUECOS.find((h) => unit.equipo?.[h] !== undefined && equipo?.[h] !== undefined);
  if (yaPuesto !== undefined) {
    throw new Error(
      `${unit.name} ya lleva algo en ${NOMBRE_DE_HUECO[yaPuesto]}: no se suma otra pieza encima`,
    );
  }
  const todo: Equipo = { ...unit.equipo, ...equipo };
  // Todo de lo puesto entero (lo que ya llevaba y lo de ahora): con dos armas el
  // ataque es el de la mejor, y no se suma pieza a pieza. Lo que ya llevaba se
  // quita del ataque y la armadura que traía para no contarlo dos veces; las
  // primitivas del cuerpo no cambian.
  const antes = sumaDe(piezas, unit.equipo);
  const total = sumaDe(piezas, todo);
  const puntosDeArmadura = (unit.puntosDeArmadura ?? 0) - antes.armadura + total.armadura;
  const derivadas = cifrasDelCuerpo(unit, loQuePone(total, total.fuerza));
  // El peso y la montura, siempre los de todo lo puesto: los de `unit` (si los
  // traía) ya van en ellos.
  const { peso: _antes, montura: _montura, ...sinPeso } = unit;
  const vestida: U = {
    ...(sinPeso as U),
    attack: unit.attack - antes.ataque + total.ataque,
    defense: derivadas.defense,
    damage: derivadas.damage,
    speed: derivadas.speed,
    // La armadura y el peso, solo si los hay: sin piezas que los den la unidad
    // sale con los mismos campos.
    ...(puntosDeArmadura > 0 ? { puntosDeArmadura } : {}),
    ...(total.peso > 0 ? { peso: total.peso } : {}),
    ...(total.montura === null ? {} : { montura: monturaPuesta(total.montura) }),
    equipo: todo,
  };
  const armas = armasPorUso(piezas, vestida, todo, total, derivadas.carga);
  return armas === null ? vestida : { ...vestida, armas };
}

/**
 * Con qué armas y qué cifras da `vestida` cada golpe, si lleva un arma por uso
 * (`esArmaPorUso`) o un arma de cuerpo a cuerpo, que dice su rueda
 * (`Pieza.rueda`), o `null`. El de cuerpo a cuerpo es el de arriba, con sus dos
 * armas si lleva dos: la rueda, tipo a tipo la mejor de las dos (`mejorRueda`), y
 * montado de guerra y con lanza, la horquilla de la carga (`carga`, la de
 * `cifrasDelCuerpo`); el de cada arma por uso, el de arriba con
 * esa arma en lugar de las de cuerpo a cuerpo (su ataque y su fuerza no suben
 * arriba, `sumaDe`). Cada golpe lleva la rueda de su arma: así el motor no busca la
 * pieza. El único escritor de `UnitInfo.armas`.
 */
function armasPorUso(
  piezas: CatalogoDePiezas,
  vestida: UnitInfo,
  todo: Equipo,
  total: SumaDeEquipo,
  carga: readonly [number, number] | undefined,
): ArmasDeLaUnidad | null {
  const delCuerpo = deCuerpoACuerpo(piezas, todo);
  const porUso = HUECOS.filter(
    (h): h is HuecoDeArmaPorUso => esArmaPorUso(h) && todo[h] !== undefined,
  );
  const rueda = mejorRueda(delCuerpo);
  // Sin arma ni arma por uso, sin `armas`: todo golpe va con las cifras de arriba.
  // Antes de reservar nada, que por aquí pasan cada individuo y cada héroe
  // (`cifrasDeUnidad`, `heroUnit`).
  if (porUso.length === 0 && rueda === undefined) return null;
  const armas: { -readonly [U in keyof ArmasDeLaUnidad]: ArmasDeLaUnidad[U] } = {
    arma: {
      piezas: delCuerpo.map(nombreDeLaPieza),
      ...(carga === undefined ? {} : { carga }),
      attack: vestida.attack,
      damage: vestida.damage,
      ...(rueda === undefined ? {} : { rueda }),
    },
  };
  for (const hueco of porUso) {
    const id = todo[hueco] as string;
    const p = piezaDe(piezas, id);
    const tiro = tiroDelGolpe(p);
    // Un arma de fuego tira con su propia agilidad (02-11-2026): lo estrecho de su
    // horquilla. Solo en este golpe; la agilidad no sube arriba (`sumaDe`).
    const pone = loQuePone(total, p.fuerza ?? 0);
    armas[hueco] = {
      piezas: [nombreDeLaPieza(p)],
      attack: vestida.attack - total.ataque + p.ataque,
      // El cuerpo con todo lo puesto y la fuerza de esta arma en lugar de la de
      // cuerpo a cuerpo: la misma cuenta que el golpe de arriba (las primitivas de
      // `vestida` son las del cuerpo).
      damage: cifrasDelCuerpo(
        vestida,
        tiro?.kind === 'fuego' ? { ...pone, agilidadDelArma: p.agilidad ?? 1 } : pone,
      ).damage,
      ...(tiro === undefined ? {} : { tiro }),
    };
  }
  return armas;
}

/**
 * Lo que tira la pieza `p` en su golpe (`GolpeConArma.tiro`): un arma de fuego con
 * su recarga o una granada con sus cargas; `undefined`, un arco o una ballesta. La
 * única lectura de `Pieza.tiro`, `Pieza.recarga` y `Pieza.cargas` fuera de la regla
 * de una pieza: la escribe en la unidad `conEquipo`, y la ficha la enseña.
 */
export function tiroDelGolpe(p: Pieza): TiroDelGolpe | undefined {
  switch (p.tiro) {
    // Con `fuego`, la recarga, y con `granada`, las cargas: las exige `problemasDelTiro`
    // al leer la pieza, y la arena las pone al cambiar el tiro (`enElHueco`).
    case 'fuego':
      return { kind: 'fuego', recarga: p.recarga as number };
    case 'granada':
      return { kind: 'granada', cargas: p.cargas as number };
    case undefined:
      return undefined;
  }
}

/** Una pieza en un golpe (`GolpeConArma.piezas`): su id y su nombre. */
function nombreDeLaPieza(p: Pieza): GolpeConArma['piezas'][number] {
  return { id: p.id, nombre: p.nombre };
}

/**
 * Los niveles de la rueda de un golpe con estas armas: tipo a tipo, el mejor
 * (25-10-2026); sin ninguna que golpee en la rueda, `undefined`.
 */
function mejorRueda(armas: readonly Pieza[]): NivelesDeLaRueda | undefined {
  const con = armas.flatMap((p) => (p.rueda === undefined ? [] : [p.rueda]));
  const [primera] = con;
  if (primera === undefined || con.length === 1) return primera;
  return Object.fromEntries(
    TIPOS_DEL_ANILLO.map((t) => [t, Math.max(...con.map((r) => r[t]))]),
  ) as NivelesDeLaRueda;
}

/**
 * Si `a` y `b` tienen las mismas cifras en todo lo que el equipo suma y la vida:
 * ataque, fuerza, agilidad, defensa, daño, PV, armadura, peso y velocidad, y las
 * de cada arma (`armas`). Junto a `conEquipo` porque es quien
 * sabe qué campos toca: si mañana suma otro, esta comparación tiene que verlo.
 * La lee el cambio de una pieza a media pelea de la arena (`retocarEnBatalla`):
 * solo cambia las cifras, y lo escribe en el parte, de quien de verdad cambia.
 */
export function mismasCifras(a: UnitInfo, b: UnitInfo): boolean {
  return (
    a.attack === b.attack &&
    a.fuerza === b.fuerza &&
    a.agilidad === b.agilidad &&
    a.defensaPropia === b.defensaPropia &&
    (a.peso ?? 0) === (b.peso ?? 0) &&
    a.defense === b.defense &&
    a.damage[0] === b.damage[0] &&
    a.damage[1] === b.damage[1] &&
    a.hp === b.hp &&
    (a.puntosDeArmadura ?? 0) === (b.puntosDeArmadura ?? 0) &&
    a.speed === b.speed &&
    mismaMontura(a.montura, b.montura) &&
    mismasArmas(a.armas, b.armas)
  );
}

function mismaMontura(a: MonturaPuesta | undefined, b: MonturaPuesta | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.id === b.id &&
    a.nombre === b.nombre &&
    a.fuerza === b.fuerza &&
    a.agilidad === b.agilidad &&
    a.peso === b.peso &&
    a.guerra === b.guerra
  );
}

function mismasArmas(a: ArmasDeLaUnidad | undefined, b: ArmasDeLaUnidad | undefined): boolean {
  const golpe = (x: GolpeConArma | undefined, y: GolpeConArma | undefined): boolean =>
    x === undefined || y === undefined
      ? x === y
      : x.piezas.length === y.piezas.length &&
        x.piezas.every((p, i) => p.id === y.piezas[i]?.id && p.nombre === y.piezas[i]?.nombre) &&
        x.carga?.[0] === y.carga?.[0] &&
        x.carga?.[1] === y.carga?.[1] &&
        x.attack === y.attack &&
        x.damage[0] === y.damage[0] &&
        x.damage[1] === y.damage[1] &&
        // La rueda también, tipo a tipo: sin ella, el retoque de la rueda de la
        // Maza a media pelea no llegaba a quien la lleva.
        TIPOS_DEL_ANILLO.every((t) => x.rueda?.[t] === y.rueda?.[t]) &&
        // Lo que tira: retocar la recarga o las cargas a media pelea llega a quien la lleva.
        mismoTiroDelGolpe(x.tiro, y.tiro);
  if (a === undefined || b === undefined) return a === b;
  return golpe(a.arma, b.arma) && golpe(a.distancia, b.distancia);
}

/** Si dos golpes tiran lo mismo (`GolpeConArma.tiro`): la clase, y su recarga o sus cargas. */
function mismoTiroDelGolpe(a: TiroDelGolpe | undefined, b: TiroDelGolpe | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.kind === 'fuego') return b.kind === 'fuego' && a.recarga === b.recarga;
  return b.kind === 'granada' && a.cargas === b.cargas;
}
