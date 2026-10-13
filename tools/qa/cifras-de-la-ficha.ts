/**
 * El guardia de la tabla de cifras de la ficha de la arena (13-10-2026, H1 de QA
 * de `docs/agents/2026-10-13-ficha-en-tabla/`): a 1440 px, en «Editar fichas», la
 * casilla medía 34 px y se leía «8» por 80 de PV y «1» por 150 de coste, y las
 * cabeceras se partían («Cuerp/o», «Fina/l»). El recorrido de entonces medía
 * cajas que se salen, no texto cortado dentro de un `<input>`, y no lo vio.
 *
 * Se pasa tal cual a `page.evaluate` (lo usan `capturas.ts` y el recorrido de la
 * tarea): por eso no declara funciones dentro, que tsx les pone `__name`, y esa
 * función no existe en la página. Devuelve los fallos de cada tabla visible bajo
 * `raiz`: una cabecera o un rótulo en más de una línea, una casilla en la que no
 * caben cinco cifras (o su valor) con su relleno y las flechas del `number`, un
 * final que no cabe en su celda, y un número que no va a la derecha.
 */
export function cifrasCortadas(raiz: string): string[] {
  const fallos: string[] = [];
  // Lo que ocupan las flechas de un `<input type="number">` en Chromium (15 px y
  // un píxel de aire): se cuentan siempre, que salen al pasar el ratón.
  const FLECHAS = 16;
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx === null) return ['no hay contexto 2d para medir el texto'];
  for (const tabla of document.querySelectorAll<HTMLElement>(`${raiz} .tabla-de-cifras`)) {
    if (tabla.getClientRects().length === 0) continue;
    const quien =
      tabla.closest('[data-clave-de-ficha]')?.getAttribute('data-clave-de-ficha') ??
      tabla.closest('[id]')?.id ??
      raiz;
    for (const th of tabla.querySelectorAll<HTMLElement>('th')) {
      if (th.querySelector('.solo-lector') !== null) continue;
      // Las líneas, por la parte de arriba de cada trozo de texto: el «ⓘ» va en
      // otra letra y su caja no empieza en el mismo píxel que el rótulo.
      const tops: number[] = [];
      const recorrido = document.createTreeWalker(th, NodeFilter.SHOW_TEXT);
      for (let n = recorrido.nextNode(); n !== null; n = recorrido.nextNode()) {
        if ((n.textContent ?? '').trim() === '') continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const caja of r.getClientRects()) if (caja.width > 0) tops.push(caja.top);
      }
      tops.sort((a, b) => a - b);
      const alto = Number.parseFloat(getComputedStyle(th).fontSize) * 0.6;
      let lineas = tops.length === 0 ? 0 : 1;
      for (let i = 1; i < tops.length; i++)
        if ((tops[i] ?? 0) - (tops[i - 1] ?? 0) > alto) lineas++;
      const texto = (th.textContent ?? '').replace('ⓘ', '').trim();
      if (lineas > 1) fallos.push(`${quien}: «${texto}» se parte en ${lineas} líneas`);
    }
    for (const casilla of tabla.querySelectorAll<HTMLInputElement>('td.escrita input')) {
      const cs = getComputedStyle(casilla);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const relleno = Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.paddingRight);
      const rotulo = casilla.getAttribute('aria-label') ?? '?';
      const cinco = Math.ceil(ctx.measureText('00000').width + relleno + FLECHAS);
      const suyo = Math.ceil(ctx.measureText(casilla.value).width + relleno + FLECHAS);
      if (casilla.scrollWidth > casilla.clientWidth)
        fallos.push(
          `${quien}: «${casilla.value}» de ${rotulo} se corta (${casilla.scrollWidth} > ${casilla.clientWidth})`,
        );
      else if (casilla.clientWidth < Math.max(cinco, suyo))
        fallos.push(
          `${quien}: en la casilla de ${rotulo} (${casilla.clientWidth} px) no caben cinco cifras ni «${casilla.value}» con sus flechas (${Math.max(cinco, suyo)} px)`,
        );
      if (cs.textAlign !== 'right' && cs.textAlign !== 'end')
        fallos.push(`${quien}: la casilla de ${rotulo} va a ${cs.textAlign}, no a la derecha`);
    }
    for (const celda of tabla.querySelectorAll<HTMLElement>('td.final')) {
      const salida = celda.querySelector('output');
      const rotulo = salida?.getAttribute('aria-label') ?? '?';
      if (celda.scrollWidth > celda.clientWidth)
        fallos.push(`${quien}: ${rotulo} no cabe en su celda`);
      if (salida !== null && salida.getClientRects().length > 1)
        fallos.push(`${quien}: ${rotulo} se parte en líneas`);
      const alineado = getComputedStyle(celda).textAlign;
      if (alineado !== 'right' && alineado !== 'end')
        fallos.push(`${quien}: ${rotulo} va a ${alineado}, no a la derecha`);
    }
  }
  return fallos;
}
