/**
 * Cómo se escribe un número o una lista en una frase para la persona: un precio
 * (`describirCoste`), una lista en prosa (`enumerar`), un entero con miles
 * (`conMiles`), una cifra con coma (`conComa`), un número con su signo
 * (`conSigno`) y un número con su palabra en singular o en plural (`conPlural`).
 *
 * Sin dependencias: lo leen los motivos del núcleo, la prosa del agente y el
 * cliente. Vivían en `types.ts` (los cuatro primeros), en `equipo/dicho.ts`
 * (`conSigno`, que la rueda del golpe importaba de allí) y en `battle/salida.ts`
 * (`conPlural`, que se llamaba `unaOVarias`), hasta la fase N de la reorganización
 * (07-11-2026).
 */

/**
 * Un precio en prosa: «15 000 oro» (con `conMiles`), o «gratis» si no cuesta
 * nada. **El único formateador de precios**: lo leen los motivos del núcleo
 * (`buildBlocker`, `recruitBlocker`), la prosa del agente y el cliente. Un
 * precio es un número de oro, el único recurso, y el monedero también
 * (`Player.oro`).
 */
export function describirCoste(oro: number): string {
  if (!Number.isSafeInteger(oro) || oro < 0) {
    throw new Error(`describirCoste: ${oro} no es un precio en oro (un entero ≥ 0)`);
  }
  return oro === 0 ? 'gratis' : `${conMiles(oro)} oro`;
}

/**
 * Una lista en prosa: «a», «a y b», «a, b y c», con `o`, «3, 5 o 7», o con `ni`,
 * «a, b ni c» (tras un «no»: «no lo llevan su tipo ni el goblin»). **El único
 * enumerador** de los motivos y avisos del núcleo, que antes lo escribían cada
 * uno. Lanza con la lista vacía: «nada» lo dice quien llama, que sabe de qué.
 */
export function enumerar(lista: readonly string[], conjuncion: 'y' | 'o' | 'ni' = 'y'): string {
  const ultimo = lista.at(-1);
  if (ultimo === undefined) throw new Error('enumerar: la lista está vacía');
  return lista.length === 1 ? ultimo : `${lista.slice(0, -1).join(', ')} ${conjuncion} ${ultimo}`;
}

/**
 * Un entero con separador de miles, como se lee en castellano: «176 000», con un
 * espacio que no se parte (U+00A0), no con punto ni coma, que en una barra con
 * decimales a coma se confundirían. Los de cuatro cifras van juntos («2500»),
 * como pide la RAE. El único formateador de miles: lo leen los paneles del
 * cliente y del espectador; el contrato del agente sigue con números.
 */
export function conMiles(n: number): string {
  if (!Number.isSafeInteger(n)) {
    throw new Error(`conMiles: ${n} no es un entero que se pueda escribir con sus cifras`);
  }
  const cifras = Math.abs(n).toString();
  if (cifras.length <= 4) return n.toString();
  const agrupadas = cifras.replace(/\B(?=(\d{3})+$)/g, '\u00A0');
  return n < 0 ? `-${agrupadas}` : agrupadas;
}

/**
 * Una cifra con, como mucho, `decimales` decimales y coma, como se lee en
 * castellano: `10,8`, no `10.8`. El único formateador de decimales: lo leen la
 * previsión del núcleo (`damage.ts`), la de la barra y la ficha de la arena, que
 * antes lo escribían cada uno.
 */
export function conComa(n: number, decimales: number): string {
  // Sin `**`: `core` no usa potencias (CLAUDE.md, coma flotante portable).
  let f = 1;
  for (let i = 0; i < decimales; i++) f *= 10;
  return (Math.round(n * f) / f).toString().replace('.', ',');
}

/** Un número con su signo siempre: «+2», «−1» (el menos tipográfico), «+0». */
export function conSigno(n: number): string {
  return n < 0 ? `−${-n}` : `+${n}`;
}

/**
 * Un número con su palabra, en singular o en plural: «1 casilla», «0 casillas», «3
 * casillas». Para las palabras que hacen el plural con una «s» (casilla, ronda,
 * turno, problema); no para «vez», ni para un verbo. QA vio «deja 1 filas de
 * salida» (M6) y el parte decía «1 rondas» (H5 de QA del banco).
 */
export function conPlural(n: number, palabra: string): string {
  return `${n} ${palabra}${n === 1 ? '' : 's'}`;
}
