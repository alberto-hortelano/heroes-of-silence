/**
 * La puerta de escapar, probada por lo que promete y no por cómo está escrita.
 *
 * Los casos salen de los criterios de `#63` y de la lista de sondas del plan: un
 * nombre que hoy ejecutaría (`<img src=x onerror=…>`), una comilla dentro de un
 * atributo, la llamada anidada que no puede salir escapada dos veces, y las
 * cuatro formas que el analizador tiene prohibido adivinar. Todas se han visto
 * rojas rompiendo la implementación a mano antes de darlas por buenas.
 *
 * El foco está en el caso INVÁLIDO, que es donde vive el fail-loud: un escapador
 * que solo se prueba con nombres normales no prueba nada.
 */
import { describe, expect, it } from 'vitest';
import {
  fondoDeColor,
  type Html,
  html,
  marcadoDe,
  NADA,
  pintar,
  srcDeImagen,
  unir,
} from '../src/client/html.js';

/** El nombre de pueblo que el agente podría escribir y hoy ejecutaría. */
const MALO = '<img src=x onerror=alert(1)>';

function pintado(fragmento: Html): string {
  return marcadoDe(fragmento);
}

describe('la puerta de escapar: texto', () => {
  it('un nombre que hoy ejecutaría sale escapado y no como etiqueta', () => {
    const salida = pintado(html`<h2>${MALO}</h2>`);
    expect(salida).toContain('&lt;img');
    expect(salida).not.toContain('<img');
    expect(salida).toBe('<h2>&lt;img src=x onerror=alert(1)&gt;</h2>');
  });

  it('el ampersand va primero, o el escape se escaparía a sí mismo', () => {
    // `&lt;` escapado en el orden equivocado sale `&amp;lt;` y en pantalla se
    // lee `&lt;` en vez de `<`. Es el fallo clásico de escribir los reemplazos
    // en el orden en que se leen.
    expect(pintado(html`<p>${'a & b < c'}</p>`)).toBe('<p>a &amp; b &lt; c</p>');
  });

  it('un número entra sin ceremonia', () => {
    expect(pintado(html`<span>${42}</span>`)).toBe('<span>42</span>');
  });

  it('`NADA` es el hueco que no pinta nada', () => {
    expect(pintado(html`<p>${NADA}</p>`)).toBe('<p></p>');
    expect(marcadoDe(NADA)).toBe('');
  });
});

describe('la puerta de escapar: atributo', () => {
  it('una comilla dentro de un atributo sale como `&quot;` y no lo cierra', () => {
    const id = 'x" onmouseover="alert(1)';
    const salida = pintado(html`<button data-town="${id}">ir</button>`);
    expect(salida).toContain('&quot;');
    expect(salida).not.toContain('onmouseover="');
    expect(salida).toBe('<button data-town="x&quot; onmouseover=&quot;alert(1)">ir</button>');
  });

  it('también escapa la comilla simple, porque el atributo puede llevarla', () => {
    expect(pintado(html`<b title='${"o'brien"}'>x</b>`)).toBe("<b title='o&#39;brien'>x</b>");
  });

  it('escapar para atributo NO es escapar para texto: son cinco y no tres', () => {
    // La diferencia entre las dos funciones, escrita como test: lo mismo por los
    // dos caminos, y las dos comillas solo salen escapadas por uno.
    const raro = `& < > " '`;
    expect(pintado(html`<p>${raro}</p>`)).toBe('<p>&amp; &lt; &gt; " \'</p>');
    expect(pintado(html`<p title="${raro}"></p>`)).toBe(
      '<p title="&amp; &lt; &gt; &quot; &#39;"></p>',
    );
  });
});

describe('la puerta de escapar: lo que ya es marcado', () => {
  it('un fragmento anidado NO se escapa dos veces', () => {
    // Es la trampa que avisó la crítica: una plantilla que devuelve `string` a
    // secas escaparía el `<div>` de la llamada de dentro y la pantalla se
    // llenaría de `&lt;div&gt;`.
    const dentro = html`<div class="stack">${'Valdeluz'}</div>`;
    const fuera = html`<section>${dentro}</section>`;
    expect(pintado(fuera)).toBe('<section><div class="stack">Valdeluz</div></section>');
    expect(pintado(fuera)).not.toContain('&lt;');
  });

  it('y lo escapado por dentro sigue escapado por fuera', () => {
    const dentro = html`<span>${MALO}</span>`;
    expect(pintado(html`<p>${dentro}</p>`)).toBe(
      '<p><span>&lt;img src=x onerror=alert(1)&gt;</span></p>',
    );
  });

  it('`unir` junta fragmentos sin volver a escaparlos', () => {
    const filas = ['a', '<b>'].map((t) => html`<li>${t}</li>`);
    expect(pintado(html`<ul>${unir(filas)}</ul>`)).toBe('<ul><li>a</li><li>&lt;b&gt;</li></ul>');
  });

  it('un fragmento de marcado dentro de un atributo se rechaza', () => {
    // No es medio seguro: es un error de categoría. Colarlo crudo dejaría entrar
    // sus propias comillas y la cadena de escapes se rompería por ahí.
    const dentro = html`<i>x</i>`;
    expect(() => html`<p title="${dentro}"></p>`).toThrow(/no cabe dentro de un atributo/);
  });
});

describe('la puerta de escapar: lo que el analizador NO adivina', () => {
  it('un hueco en `href` lanza, porque escapar comillas no para un `javascript:`', () => {
    expect(() => html`<a href="${'javascript:alert(1)'}">ir</a>`).toThrow(/href/);
  });

  it('un hueco en `src` lanza por lo mismo', () => {
    expect(() => html`<img src="${'x'}" alt="">`).toThrow(/src/);
  });

  it('un hueco en `style` lanza: un estilo es un lenguaje, no texto', () => {
    expect(() => html`<div style="background:${'#fff'}"></div>`).toThrow(/style/);
  });

  it('un hueco en un manejador `on*` lanza', () => {
    expect(() => html`<button onclick="${'f()'}">x</button>`).toThrow(/onclick/);
  });

  it('un hueco en `srcdoc` lanza: es un documento entero dentro de un atributo', () => {
    expect(() => html`<iframe srcdoc="${'<b>x</b>'}"></iframe>`).toThrow(/srcdoc/);
  });

  it('un atributo SIN comillas lanza, aunque el valor se escapara', () => {
    // Sin comillas el valor lo termina el primer espacio, así que `a b=c` mete
    // un atributo nuevo sin necesitar ni una comilla ni un `<`.
    expect(() => html`<b class=${'x'}>y</b>`).toThrow(/sin comillas/);
  });

  it('un `<script>` se rechaza aunque no lleve ni un hueco', () => {
    expect(() => html`<script>alert(1)</script>`).toThrow(/script/);
    expect(() => html`<div><script src="a.js"></script></div>`).toThrow(/script/);
  });

  it('una cadena en un hueco de etiqueta lanza: ahí solo cabe marcado', () => {
    expect(() => html`<div ${'class="x"'}>y</div>`).toThrow(/solo cabe marcado/);
    expect(() => html`<div ${1}>y</div>`).toThrow(/solo cabe marcado/);
  });

  it('en un hueco de etiqueta sí cabe un fragmento, que es como se ponen atributos', () => {
    const atributo = html` class="win"`;
    expect(pintado(html`<div${atributo}>x</div>`)).toBe('<div class="win">x</div>');
    expect(pintado(html`<div${NADA}>x</div>`)).toBe('<div>x</div>');
  });

  it('el motivo NOMBRA la plantilla, o con 169 huecos no se encuentra', () => {
    let motivo = '';
    try {
      html`<a class="x" href="${'y'}">ir</a>`;
    } catch (err) {
      motivo = err instanceof Error ? err.message : String(err);
    }
    expect(motivo).toContain('<a class="x" href="');
    expect(motivo).toContain(`\${…}`);
  });
});

describe('la puerta de escapar: los dos atributos interpretados que sí hacen falta', () => {
  it('`srcDeImagen` deja pasar lo que el navegador va a BUSCAR', () => {
    expect(marcadoDe(srcDeImagen('/generated/icons/wood.png'))).toBe(
      ' src="/generated/icons/wood.png"',
    );
    expect(marcadoDe(srcDeImagen('http://localhost:3100/a.png'))).toContain('http://localhost');
    expect(marcadoDe(srcDeImagen('blob:http://x/1'))).toContain('blob:');
  });

  it('`srcDeImagen` rechaza lo que el navegador va a EJECUTAR', () => {
    expect(() => srcDeImagen('javascript:alert(1)')).toThrow(/no se puede cargar una imagen/);
    expect(() => srcDeImagen('  JavaScript:alert(1)')).toThrow(/no se puede cargar una imagen/);
    expect(() => srcDeImagen('data:text/html,<script>')).toThrow(/no se puede cargar una imagen/);
  });

  it('y no falla ABIERTO con un separador dentro del esquema', () => {
    // El navegador QUITA tabuladores, saltos de línea y retornos al leer una
    // URL, así que las tres de abajo son `javascript:` para él. La expresión que
    // buscaba el esquema al principio no las veía y caían en la rama «sin
    // esquema es una ruta relativa»: la función fallaba abierto justo en el caso
    // que existe para cazar, y solo veía la escrita del tirón.
    expect(() => srcDeImagen('java\tscript:alert(1)')).toThrow(/tabulador/);
    expect(() => srcDeImagen('java\nscript:alert(1)')).toThrow(/salto de línea/);
    expect(() => srcDeImagen('java\rscript:alert(1)')).toThrow(/NUL|salto|tabulador/);
    expect(() => srcDeImagen('java\0script:alert(1)')).toThrow(/NUL|salto|tabulador/);
  });

  it('un SVG no es una imagen inerte, y por eso `data:image/svg+xml` tampoco pasa', () => {
    // Es el único formato de imagen que lleva script dentro. Aquí no se genera
    // ninguno, así que no hay nada que perder cerrándolo.
    expect(() => srcDeImagen('data:image/svg+xml,<svg onload=alert(1)>')).toThrow(
      /no se puede cargar una imagen/,
    );
    expect(marcadoDe(srcDeImagen('data:image/png;base64,AAAA'))).toContain('data:image/png');
  });

  it('y escapa igual la comilla, por si la ruta la trae', () => {
    expect(marcadoDe(srcDeImagen('/a".png'))).toBe(' src="/a&quot;.png"');
  });

  it('`fondoDeColor` acepta un color y solo un color', () => {
    expect(marcadoDe(fondoDeColor('#8b5a2b'))).toBe(' style="background:#8b5a2b"');
    expect(marcadoDe(fondoDeColor('red'))).toBe(' style="background:red"');
    expect(marcadoDe(fondoDeColor('rgb(1, 2, 3)'))).toBe(' style="background:rgb(1, 2, 3)"');
  });

  it('`fondoDeColor` rechaza lo que trae una declaración de más', () => {
    expect(() => fondoDeColor('red;background-image:url(javascript:alert(1))')).toThrow(
      /no es un color/,
    );
    expect(() => fondoDeColor('url(x)')).toThrow(/no es un color/);
    expect(() => fondoDeColor('#fff" onload="alert(1)')).toThrow(/no es un color/);
  });
});

describe('la puerta de escapar: los comentarios', () => {
  it('un hueco dentro de un comentario se escapa como texto y no miente al fallar', () => {
    // Antes lanzaba diciendo «dentro de una etiqueta», y un comentario no es una
    // etiqueta: mandaba a quien lo leyera a buscar algo que no existe.
    expect(pintado(html`<!-- ${'x'} -->`)).toBe('<!-- x -->');
  });

  it('un valor no puede cerrar el comentario que lo contiene', () => {
    // Todo terminador de comentario —`-->` y `--!>`— necesita un `>` literal, y
    // escapar como texto no deja ninguno.
    expect(pintado(html`<!-- ${'--> <img src=x>'} -->`)).toBe('<!-- --&gt; &lt;img src=x&gt; -->');
    expect(pintado(html`<!-- ${'--!> hola'} -->`)).toBe('<!-- --!&gt; hola -->');
  });

  it('un fragmento de marcado dentro de un comentario se rechaza', () => {
    // Al texto se le escapa el `>`; al marcado crudo no, así que un `-->` suyo
    // SÍ cerraría el comentario y lo de dentro pasaría a pintarse.
    expect(() => html`<!-- ${html`<i>x</i>`} -->`).toThrow(/comentario HTML/);
  });

  it('las TRES formas de cerrar un comentario cuentan, no solo `-->`', () => {
    // La norma cierra un comentario con `-->` y con `--!>`, y `<!-->` / `<!--->`
    // están cerrados de nacimiento. Reconocer solo la primera dejaba al autómata
    // dentro del comentario para siempre, así que el hueco de después —dentro de
    // un atributo de verdad— se escapaba como TEXTO: sin las comillas, la puerta
    // llegaba a emitir un `onmouseover` VIVO. Latente hoy —no hay comentarios en
    // ninguna plantilla— pero prometido en el docstring.
    const roto = 'x" onmouseover="alert(1)';
    const bien = '<div class="x&quot; onmouseover=&quot;alert(1)">hola</div>';
    expect(pintado(html`<!-- n --><div class="${roto}">hola</div>`)).toBe(`<!-- n -->${bien}`);
    expect(pintado(html`<!-- n --!><div class="${roto}">hola</div>`)).toBe(`<!-- n --!>${bien}`);
    expect(pintado(html`<!--><div class="${roto}">hola</div>`)).toBe(`<!-->${bien}`);
    expect(pintado(html`<!---><div class="${roto}">hola</div>`)).toBe(`<!--->${bien}`);
  });

  it('y lo que viene DESPUÉS de un comentario se clasifica bien', () => {
    // Este es el motivo de verdad para entender `<!-- -->`: sin el estado, la
    // comilla de dentro del comentario dejaba al analizador creyéndose en un
    // valor entrecomillado y todo el marcado de detrás salía mal clasificado.
    expect(pintado(html`<!-- <div class=" --><p>${'<b>a</b>'}</p>`)).toBe(
      '<!-- <div class=" --><p>&lt;b&gt;a&lt;/b&gt;</p>',
    );
  });
});

/** Un destino de `pintar` sin foco dentro, para los tests que solo miran el marcado. */
function destinoSinFoco(): Element {
  return { innerHTML: '', ownerDocument: { activeElement: null } } as unknown as Element;
}

describe('la puerta de escapar: pintar', () => {
  it('`pintar` escribe el marcado en el elemento', () => {
    const destino = destinoSinFoco();
    pintar(destino, html`<p>${MALO}</p>`);
    expect(destino.innerHTML).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  });

  it('`pintar` rechaza una cadena por mucho que parezca marcado', () => {
    // En TypeScript esto no compila, que es el primer cerrojo. El segundo es
    // este: en ejecución tampoco, porque el símbolo no lo lleva.
    const destino = destinoSinFoco();
    const impostor = { toString: () => '<p>x</p>' } as unknown as Html;
    expect(() => pintar(destino, impostor)).toThrow(/solo pinta marcado/);
    expect(destino.innerHTML).toBe('');
  });
});

/**
 * Un DOM de juguete con lo justo que mira `pintar` para el foco: atributos,
 * padres, `contains`, `matches(':focus-visible')`, el cursor y `focus`. Lo que
 * repinta no lo analiza: el test dice qué encuentra cada selector después, y
 * comprueba con qué selector se buscó. En el navegador lo ejerce `pnpm capturas`
 * (la pasada «edicion»: tras cambiar el ataque y tabular, el foco en la defensa
 * de la MISMA ficha).
 */
class Nodo {
  readonly attributes: { name: string; value: string }[];
  parentElement: Nodo | null = null;
  enfocado: { preventScroll?: boolean } | null = null;
  seleccion: [number, number, string] | null = null;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: string | null = 'forward';
  visible = true;
  constructor(
    readonly tagName: string,
    atributos: Record<string, string> = {},
    readonly hijos: Nodo[] = [],
    cursor: [number, number] | null = null,
  ) {
    this.attributes = Object.entries(atributos).map(([name, value]) => ({ name, value }));
    for (const h of hijos) h.parentElement = this;
    this.selectionStart = cursor?.[0] ?? null;
    this.selectionEnd = cursor?.[1] ?? null;
  }
  contains(otro: Nodo): boolean {
    for (let n: Nodo | null = otro; n !== null; n = n.parentElement) if (n === this) return true;
    return false;
  }
  matches(s: string): boolean {
    if (s !== ':focus-visible') throw new Error(`el juguete no sabe de ${s}`);
    return this.visible;
  }
  focus(o: { preventScroll?: boolean }): void {
    this.enfocado = o;
  }
  setSelectionRange(a: number, b: number, s: string): void {
    this.seleccion = [a, b, s];
  }
}

/** Pinta en un destino cuyo foco es `activo` y cuyo repintado deja `despues` para cada selector. */
function pintarConFoco(
  destino: Nodo,
  activo: Nodo | null,
  despues: Record<string, Nodo[]>,
): string[] {
  const buscados: string[] = [];
  const doc = { activeElement: activo };
  const falso = Object.assign(destino, {
    ownerDocument: doc,
    innerHTML: '',
    querySelectorAll(s: string): Nodo[] {
      buscados.push(s);
      return despues[s] ?? [];
    },
  });
  pintar(falso as unknown as Element, html`<p>x</p>`);
  return buscados;
}

describe('pintar conserva el foco', () => {
  const SELECTOR = '[data-clave-de-ficha="hoja:templario"] input[data-campo="attack"][id="a\\"b"]';
  const campo = (): Nodo =>
    new Nodo('INPUT', { class: 'x', 'data-campo': 'attack', id: 'a"b' }, [], [2, 4]);
  const enUnaFicha = (activo: Nodo): Nodo =>
    new Nodo('DIV', {}, [new Nodo('DIV', { 'data-clave-de-ficha': 'hoja:templario' }, [activo])]);

  it('lo devuelve al de la misma identidad, sin desplazar la vista y con su cursor', () => {
    const activo = campo();
    const destino = enUnaFicha(activo);
    const nuevo = campo();
    const buscados = pintarConFoco(destino, activo, { [SELECTOR]: [nuevo] });
    // La identidad es la del campo Y la de su ficha: con cuatro, cada «Ataque» es otro.
    expect(buscados).toEqual([SELECTOR]);
    expect(nuevo.enfocado).toEqual({ preventScroll: true });
    expect(nuevo.seleccion).toEqual([2, 4, 'forward']);
  });

  it('un campo sin cursor (un número) recibe el foco sin selección', () => {
    const activo = new Nodo('INPUT', { 'data-campo': 'hp' });
    const nuevo = new Nodo('INPUT', { 'data-campo': 'hp' }, [], [0, 0]);
    const destino = new Nodo('DIV', {}, [activo]);
    pintarConFoco(destino, activo, { 'input[data-campo="hp"]': [nuevo] });
    expect(nuevo.enfocado).not.toBeNull();
    expect(nuevo.seleccion).toBeNull();
  });

  it('no adivina: dos iguales, ninguno, o un foco sin identidad se quedan sin devolver', () => {
    const activo = new Nodo('INPUT', { 'data-campo': 'hp' });
    const a = new Nodo('INPUT');
    const b = new Nodo('INPUT');
    pintarConFoco(new Nodo('DIV', {}, [activo]), activo, { 'input[data-campo="hp"]': [a, b] });
    expect(a.enfocado).toBeNull();
    expect(b.enfocado).toBeNull();
    const anonimo = new Nodo('INPUT', { class: 'x' });
    const ficha = new Nodo('DIV', { 'data-clave-de-ficha': 'hoja:x' }, [anonimo]);
    expect(pintarConFoco(new Nodo('DIV', {}, [ficha]), anonimo, {})).toEqual([]);
  });

  it('el foco de fuera del destino no se toca', () => {
    const fuera = new Nodo('INPUT', { 'data-campo': 'hp' });
    expect(pintarConFoco(new Nodo('DIV'), fuera, {})).toEqual([]);
    expect(pintarConFoco(new Nodo('DIV'), null, {})).toEqual([]);
  });

  it('un botón pulsado con el ratón no lo conserva; con el teclado, sí', () => {
    // Conservárselo haría que el Espacio volviera a pulsar «Esperar» en vez de cerrar el turno.
    const conRaton = new Nodo('BUTTON', { 'data-action': 'wait' });
    conRaton.visible = false;
    expect(pintarConFoco(new Nodo('DIV', {}, [conRaton]), conRaton, {})).toEqual([]);
    const conTeclado = new Nodo('BUTTON', { 'data-action': 'wait' });
    const nuevo = new Nodo('BUTTON', { 'data-action': 'wait' });
    pintarConFoco(new Nodo('DIV', {}, [conTeclado]), conTeclado, {
      'button[data-action="wait"]': [nuevo],
    });
    expect(nuevo.enfocado).not.toBeNull();
  });
});

describe('la puerta de escapar: el análisis se cachea por sitio, no por valor', () => {
  it('el mismo sitio de llamada escapa cada valor por su cuenta', () => {
    // El análisis se guarda en un `WeakMap` sobre las porciones estáticas, que
    // el motor interna por sitio de llamada. Si lo que se guardara fuera la
    // SALIDA, la segunda vuelta pintaría el valor de la primera — y con el
    // bucle de dibujo a 60 fps no se notaría hasta que el nombre cambiara.
    const fila = (n: string): string => pintado(html`<li>${n}</li>`);
    expect(fila('uno')).toBe('<li>uno</li>');
    expect(fila('<dos>')).toBe('<li>&lt;dos&gt;</li>');
    expect(fila('tres')).toBe('<li>tres</li>');
  });
});
