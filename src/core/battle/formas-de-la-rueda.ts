/**
 * **Las tres ruedas del golpe**: la de 7 (la de siempre: seis tipos en anillo y
 * Normal en el centro, el punto por la distancia), la de 5 y la de 3
 * (complejidad del combate, 22-10-2026, decisiones del usuario). Cada partida
 * juega con una (`ReglasDelCombate.rueda`, `core/combate.ts`) y cada batalla la
 * lleva puesta (`BattleState.rueda`); quien la lee, por `formaDeLaBatalla`.
 *
 * Aquí está la **forma** de cada una —qué sectores tiene, en qué orden, si lleva
 * centro, cómo se cruzan y cómo se llaman para la persona— y de qué está hecho
 * cada tipo (`PARTES`). Lo que da cada tipo, en `cifras-de-la-rueda.ts`
 * (`efectoDelTipo`); el punto del cruce, en `rueda.ts` (`puntoDelCruce`).
 *
 * Solo importa `types.ts`: lo leen `data.ts` (los pesos del índice, con la rueda
 * de referencia) y `cifras-de-la-rueda.ts`, que `rueda.ts` no puede ser.
 */
import {
  enumerar,
  esTipoDeGolpe,
  type NivelesDeLaRueda,
  TIPOS_DEL_ANILLO,
  type TipoDeGolpe,
  type TipoDelAnillo,
} from '../types.js';

/** De cuántos tipos es una rueda: el nivel de complejidad que se elige. */
export type TiposDeLaRueda = 3 | 5 | 7;

/** Las tres, de la más sencilla a la de siempre: el orden de los selectores. */
export const TIPOS_DE_LAS_RUEDAS: readonly TiposDeLaRueda[] = [3, 5, 7];

/**
 * Cómo se cruzan dos tipos de una rueda. `distancia`, la de 7: el punto por la
 * distancia en el anillo (igual, al lado, a dos, enfrente). `ciclo`, las de 3 y 5:
 * piedra, papel o tijera, **cada sector gana al siguiente** en el sentido del reloj.
 */
export type CruceDeLaRueda = 'distancia' | 'ciclo';

/**
 * Cómo se cruzan dos tipos de la rueda `forma`, dicho: **la única frase**, la que
 * leen la guía de la rueda de la persona y la prosa del agente (que pone delante
 * qué ruedas cruzan así). Sin números ni nombres de tipos. En un ciclo, «el de
 * enfrente» solo si la rueda lo tiene (un anillo par: la de 5); en la de 3 no hay
 * ninguno enfrente, y la frase de la de 5 se lo prometía (QA de la complejidad,
 * vuelta 2, 22-10-2026).
 */
export function dichoDelCruce(forma: FormaDeLaRueda): string {
  if (forma.cruce === 'distancia') {
    return 'cuanto más lejos en el anillo, más daño: los dos iguales, el mínimo; opuestos, el máximo.';
  }
  const tablas = tieneEnfrente(forma) ? 'con el mismo o el de enfrente' : 'con el mismo';
  return `cada tipo gana al siguiente en el sentido del reloj (y el último al primero): si gana el golpe, cae en el máximo; si gana la respuesta, en el mínimo; ${tablas}, en el medio.`;
}

/** Si cada sector del anillo de `forma` tiene uno enfrente: un anillo de un número par. */
function tieneEnfrente(forma: FormaDeLaRueda): boolean {
  return forma.anillo.length % 2 === 0;
}

/**
 * Una rueda. `T`, los tipos de su anillo: la de referencia los lleva estrechos
 * (los del anillo de un arma), para que quien mide con ella no tenga huecos.
 */
export interface FormaDeLaRueda<T extends TipoDeGolpe = TipoDeGolpe> {
  /**
   * Los sectores del anillo en el sentido de las agujas del reloj desde arriba:
   * también el orden de las teclas (1, 2…) y, en un ciclo, a quién gana cada uno
   * (al siguiente).
   */
  readonly anillo: readonly T[];
  /** Si lleva Normal en el centro (la de 3, no). */
  readonly centro: boolean;
  readonly cruce: CruceDeLaRueda;
  /**
   * Los tipos que se juegan con ella: el anillo y, si lo lleva, Normal al final.
   * **Lo único que se itera para jugar**: la IA, la previsión, los `hits` del
   * agente, el disco y las teclas. Con la de 7 es el orden de siempre (el `Rng` de
   * la IA gasta lo mismo). Cuántos son es de cuántos tipos es la rueda.
   */
  readonly golpes: readonly (T | 'normal')[];
  /** Los tipos que en esta rueda se llaman de otra manera que en `NOMBRE_DE_GOLPE`. */
  readonly renombra: Readonly<Partial<Record<T, string>>>;
}

/**
 * De qué tipos del anillo está hecho cada tipo: un simple, de sí mismo; Normal, de
 * ninguno; un fusionado, de los dos que junta (decisión del usuario: «ofensivo,
 * fusionando ofensivo y fuerte, defensivo, fusionando defensivo y finta, y rápido
 * que es la fusión de romper guardia y rápido»). Lo que da cada parte sale del
 * nivel del arma en ella (`Pieza.rueda`), y en un fusionado, a la mitad.
 */
export const PARTES: Readonly<Record<TipoDeGolpe, readonly TipoDelAnillo[]>> = {
  ofensivo: ['ofensivo'],
  fuerte: ['fuerte'],
  finta: ['finta'],
  defensivo: ['defensivo'],
  rapido: ['rapido'],
  romperGuardia: ['romperGuardia'],
  normal: [],
  ofensivoFuerte: ['ofensivo', 'fuerte'],
  defensivoFinta: ['defensivo', 'finta'],
  rapidoRomper: ['rapido', 'romperGuardia'],
};

/**
 * El nivel de cada tipo de la rueda `forma` con un arma de niveles `niveles`: un
 * tipo del anillo, el suyo; un fusionado (ruedas de 5 y de 3), la media truncada
 * de sus partes; Normal, ninguno (siempre ×1, no lleva nivel). Con él se tiñe cada
 * sector del diálogo de la rueda, en la misma escala que la ficha del arma
 * (requisito 5 del 25-10-2026: «los tonos de rojo a verde … también en la rueda de
 * combate»). Es solo lo que se enseña: lo que da un fusionado lo cuenta
 * `efectoDelTipo` con cada parte a la mitad, no con esta media.
 */
export function nivelesEnLaForma(
  niveles: NivelesDeLaRueda,
  forma: FormaDeLaRueda,
): Readonly<Partial<Record<TipoDeGolpe, number>>> {
  const r: Partial<Record<TipoDeGolpe, number>> = {};
  for (const tipo of forma.golpes) {
    const partes = PARTES[tipo];
    if (partes.length === 0) continue;
    const suma = partes.reduce((n, p) => n + niveles[p], 0);
    r[tipo] = Math.floor(suma / partes.length);
  }
  return r;
}

/** Si `tipo` junta dos del anillo (y sus cifras van a la mitad). */
export function esFusionado(tipo: TipoDeGolpe): boolean {
  return PARTES[tipo].length > 1;
}

/**
 * Cómo se llama cada tipo para la persona: **la única tabla de nombres**. La lee
 * `nombreEnLaRueda`, que antes mira si la rueda lo renombra (en la de 3, el
 * Ofensivo-fuerte es «Ofensivo»), y, tal cual, la ficha de un arma (sus niveles,
 * uno por tipo del anillo) y la nota de un fusionado («la mitad de Ofensivo y de
 * Fuerte»).
 */
export const NOMBRE_DE_GOLPE: Readonly<Record<TipoDeGolpe, string>> = {
  ofensivo: 'Ofensivo',
  fuerte: 'Fuerte',
  finta: 'Finta',
  defensivo: 'Defensivo',
  rapido: 'Rápido',
  romperGuardia: 'Romper guardia',
  normal: 'Normal',
  ofensivoFuerte: 'Ofensivo-fuerte',
  defensivoFinta: 'Defensivo-finta',
  rapidoRomper: 'Rápido-romper guardia',
};

/** Una rueda, con sus golpes hechos una vez al declararla. */
function rueda<T extends TipoDeGolpe>(
  anillo: readonly T[],
  centro: boolean,
  cruce: CruceDeLaRueda,
  renombra: Readonly<Partial<Record<T, string>>> = {} as Partial<Record<T, string>>,
): FormaDeLaRueda<T> {
  return { anillo, centro, cruce, golpes: centro ? [...anillo, 'normal'] : anillo, renombra };
}

/**
 * La rueda de siempre, la de 7, letra a letra (`pnpm banco` con 7 no cambia): el
 * anillo es el de un arma (`TIPOS_DEL_ANILLO`). Es también **la de referencia**:
 * con ella se mide el índice de poder (lo que vale un arma no depende del nivel
 * que se juegue; `data.ts`, `nivel.ts`) y se pinta la ficha de un arma, que tiene
 * un nivel por tipo del anillo (`disco.ts`). Nadie más la toma fija: el combate
 * juega la de su batalla (`formaDeLaBatalla`; lo vigila `invariantes.test.ts`).
 */
export const RUEDA_DE_REFERENCIA: FormaDeLaRueda<TipoDelAnillo> = rueda(
  TIPOS_DEL_ANILLO,
  true,
  'distancia',
);

/** Los tipos de la rueda de referencia: los del anillo de un arma y Normal. */
export type GolpeDeReferencia = (typeof RUEDA_DE_REFERENCIA.golpes)[number];

/**
 * Las tres ruedas. La de 5: Ofensivo-fuerte > Rápido > Romper guardia >
 * Defensivo-finta > Ofensivo-fuerte, con Normal en el centro; la de 3: Ofensivo >
 * Rápido > Defensivo > Ofensivo, sin centro (decisión del usuario: «defensivo gana
 * a ofensivo, ofensivo a rápido y rápido a defensivo»). **Privada en la práctica**:
 * fuera de aquí nadie la indexa (`formaDeLaBatalla`; lo vigila `invariantes.test.ts`).
 */
export const RUEDAS: Readonly<Record<TiposDeLaRueda, FormaDeLaRueda>> = {
  7: RUEDA_DE_REFERENCIA,
  5: rueda(['ofensivoFuerte', 'rapido', 'romperGuardia', 'defensivoFinta'], true, 'ciclo'),
  3: rueda(['ofensivoFuerte', 'rapidoRomper', 'defensivoFinta'], false, 'ciclo', {
    ofensivoFuerte: 'Ofensivo',
    rapidoRomper: 'Rápido',
    defensivoFinta: 'Defensivo',
  }),
};

/**
 * La rueda con que se pelea: la de una batalla (`BattleState.rueda`) o la de una
 * partida (`ReglasDelCombate.rueda`, que es la de todas sus batallas). **La única
 * lectura de `RUEDAS`**: el motor, la IA, el contrato, el servidor y el cliente
 * piden aquí la forma de lo que juegan.
 */
export function formaDeLaBatalla(b: { readonly rueda: TiposDeLaRueda }): FormaDeLaRueda {
  return RUEDAS[b.rueda];
}

/**
 * El golpe de `forma` que no deja nada y cae en el medio sea cual sea la respuesta:
 * Normal, si la rueda lo lleva en el centro; la de 3 no tiene ninguno (`null`). Con
 * él se compara lo que un golpe le deja al rival antes de su contraataque
 * (`previsionDeLaRueda`). Escribir `'normal'` a mano ahí atascaba el golpe de la
 * persona en la rueda de 3: la previsión lanzaba y la rueda no se abría (QA,
 * vuelta 1, 22-10-2026).
 */
export function golpeNeutro(forma: FormaDeLaRueda): 'normal' | null {
  return forma.centro ? 'normal' : null;
}

/** Las tres, de la más sencilla a la de siempre (`TIPOS_DE_LAS_RUEDAS`): lo que recorre la prosa. */
export const LAS_TRES_RUEDAS: readonly FormaDeLaRueda[] = TIPOS_DE_LAS_RUEDAS.map((n) => RUEDAS[n]);

/** Si `tipo` es de la rueda `forma`. */
export function esDeLaRueda(tipo: TipoDeGolpe, forma: FormaDeLaRueda): boolean {
  return (forma.golpes as readonly TipoDeGolpe[]).includes(tipo);
}

/**
 * Por qué `x` no es un golpe de la rueda `forma`, dicho para la persona; `null` si
 * lo es. **La única validación de un tipo contra su rueda**: la leen el cruce
 * (`cruceBlocker`, `puntoDelCruce`), la sesión y el contrato (`golpeDelHit`).
 */
export function tipoDeGolpeBlocker(x: unknown, forma: FormaDeLaRueda): string | null {
  if (esTipoDeGolpe(x) && esDeLaRueda(x, forma)) return null;
  const que = esTipoDeGolpe(x)
    ? `no es un golpe de la rueda de ${forma.golpes.length}`
    : 'no es un tipo de golpe';
  return `«${String(x)}» ${que}: valen ${forma.golpes.join(', ')}`;
}

/**
 * Cómo se llama `tipo` en la rueda `forma`, para la persona: el de la tabla común
 * (`NOMBRE_DE_GOLPE`) o el que le da su rueda. Lanza si no es de ella (un fallo:
 * nadie juega un tipo de otra rueda, `cruceBlocker` lo rechaza antes).
 */
export function nombreEnLaRueda(tipo: TipoDeGolpe, forma: FormaDeLaRueda): string {
  const motivo = tipoDeGolpeBlocker(tipo, forma);
  if (motivo !== null) throw new Error(motivo);
  return forma.renombra[tipo] ?? NOMBRE_DE_GOLPE[tipo];
}

/**
 * En una rueda que cruza en ciclo, a quién gana `tipo` (el siguiente del anillo en
 * el sentido del reloj) y con quién pierde (el anterior): lo mismo al golpear que
 * al responder, como lo cuenta `puntoDelCruce`. `null` en la de 7, que cruza por
 * la distancia, y con Normal, que no gana ni pierde. Lanza con un tipo que no es
 * de la rueda.
 */
export function cicloDe(
  tipo: TipoDeGolpe,
  forma: FormaDeLaRueda,
): { readonly gana: TipoDeGolpe; readonly pierde: TipoDeGolpe } | null {
  const motivo = tipoDeGolpeBlocker(tipo, forma);
  if (motivo !== null) throw new Error(motivo);
  const i = forma.anillo.indexOf(tipo);
  if (forma.cruce !== 'ciclo' || i < 0) return null;
  const n = forma.anillo.length;
  return {
    gana: forma.anillo[(i + 1) % n] as TipoDeGolpe,
    pierde: forma.anillo[(i + n - 1) % n] as TipoDeGolpe,
  };
}

/**
 * Las ruedas que cumplen `cumple`, dichas por de cuántos tipos son: «la de 7», «las
 * de 3 y 5». Lo lee la prosa (qué ruedas cruzan cómo, cuáles llevan fusionados).
 */
export function lasRuedasQue(cumple: (forma: FormaDeLaRueda) => boolean): string {
  const de = LAS_TRES_RUEDAS.filter(cumple).map((f) => String(f.golpes.length));
  return `${de.length === 1 ? 'la' : 'las'} de ${enumerar(de)}`;
}
