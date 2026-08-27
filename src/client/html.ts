/**
 * La puerta por la que sale TODO el marcado del cliente.
 *
 * El problema que resuelve: el navegador acabará pintando texto que no escribe
 * este repositorio —el nombre de un pueblo que inventa el agente, el del héroe
 * que se deriva de él, la prosa libre de `reasoning`— y una plantilla llana lo
 * mete en el DOM tal cual. Un `escapar()` suelto no vale: hay que acordarse de
 * llamarlo, y la primera vez que alguien añada un campo se olvidará. Aquí no hay
 * nada que recordar — lo que no ha pasado por esta etiqueta **no compila** en
 * `pintar`, que es el único `innerHTML` del repo.
 *
 * Cómo se sostiene, en tres cerrojos:
 *
 *  1. `Html` es una interfaz con una propiedad de símbolo **privado de este
 *     módulo**: fuera de aquí ese símbolo no se puede nombrar, así que fabricar
 *     un `Html` exige un `as unknown as` visible — y ese cast solo puede
 *     aparecer en este fichero, que es lo que vigila `invariantes.test.ts`.
 *  2. Un valor que YA es `Html` se inserta **crudo**, y se detecta por el
 *     símbolo y no por su tipo, que en ejecución no existe. Sin esto, la llamada
 *     anidada —`${renderArmy(...)}` dentro de otro panel— saldría escapada dos
 *     veces y la pantalla se llenaría de `&lt;div&gt;`.
 *  3. Cómo se escapa lo demás **no lo decide quien escribe la plantilla**: lo
 *     deduce el analizador de la porción estática que precede al hueco. Texto y
 *     atributo son dos operaciones distintas —dentro de un atributo una comilla
 *     sola lo cierra y deja inyectar los que vengan detrás— y confundirlas es el
 *     agujero clásico.
 *
 * **Lo que el analizador no entiende, LANZA.** No entiende HTML en general: solo
 * el marcado que este repositorio escribe. Un atributo sin comillas, un hueco en
 * `href`/`src`/`style`/`on*` o un `<script>` no se adivinan — se rechazan
 * nombrando la plantilla, que es el trato de fail-loud de esta casa.
 *
 * El LÍMITE, dicho para que nadie lo herede creyendo que ve más: el estado del
 * analizador sale de las porciones ESTÁTICAS. Un `Html` insertado en un hueco de
 * texto se da por equilibrado —abre y cierra sus propias etiquetas—, porque es
 * marcado que salió de aquí. Lo que no puede pasar es que un hueco de texto
 * cambie el contexto de los siguientes: para eso tendría que ser `Html`, y para
 * ser `Html` tuvo que salir de esta puerta.
 */

/**
 * La marca de «esto ya es marcado, no lo vuelvas a escapar».
 *
 * Es un símbolo privado del módulo a propósito: no se exporta y no se crea con
 * `Symbol.for`, así que no hay forma de nombrarlo desde fuera ni de recuperarlo
 * del registro global. Un objeto que lo lleve solo puede haber salido de aquí.
 */
const MARCA = Symbol('marcado');

/** Marcado ya construido y ya escapado. Solo lo fabrican las funciones de aquí. */
export interface Html {
  readonly [MARCA]: string;
}

/** El único constructor. Privado: lo que entra aquí ya tiene que estar escapado. */
function crudo(marcado: string): Html {
  return { [MARCA]: marcado };
}

/**
 * Lo que lleva dentro, para quien tenga que mirarlo en vez de pintarlo: los
 * tests y el ancla de `test/fixtures/paneles.txt`. Solo lee.
 */
export function marcadoDe(fragmento: Html): string {
  return fragmento[MARCA];
}

/** Hueco vacío: la rama del ternario que no pinta nada. */
export const NADA: Html = crudo('');

function esHtml(valor: unknown): valor is Html {
  return typeof valor === 'object' && valor !== null && MARCA in valor;
}

/**
 * Escapar para TEXTO: lo que sacaría al hueco de su elemento.
 *
 * Es una función de verdad y no un modo de otra, y su gemela de abajo tampoco:
 * la diferencia entre las dos —las dos comillas— es justo lo que se pierde
 * cuando se escriben como una sola con un parámetro, y es el agujero por el que
 * `data-town="${…}"` deja inyectar atributos nuevos.
 */
function escaparTexto(texto: string): string {
  return texto.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * Escapar para el VALOR DE UN ATRIBUTO entrecomillado.
 *
 * Las cinco, y las dos últimas son las que hacen falta aquí y no en el texto:
 * una comilla suelta cierra el atributo y todo lo que venga detrás lo lee el
 * navegador como atributos nuevos —`onerror` incluido—. Se escapan las dos
 * clases de comilla porque la plantilla puede usar cualquiera de las dos.
 */
function escaparAtributo(valor: string): string {
  return valor
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Dónde cae un hueco, que es lo que decide cómo se escapa. */
type Clase = 'texto' | 'atributo' | 'marcado' | 'comentario';

/** Lo que puede ir en un hueco. Un `undefined` o un objeto cualquiera no. */
type Valor = Html | string | number;

/**
 * Atributos cuyo valor NO es texto: es una URL o son declaraciones de estilo, o
 * sea otro lenguaje que el navegador interpreta. Escaparlos como texto no basta
 * —`javascript:alert(1)` no lleva ni una comilla ni un `<`—, así que un hueco
 * aquí dentro se rechaza en vez de fingir que está cubierto. Lo que de verdad
 * necesite una URL o un color pasa por `srcDeImagen` y `fondoDeColor`, que
 * validan el contenido en su propio idioma.
 */
const ATRIBUTOS_INTERPRETADOS = [
  'href',
  'xlink:href',
  'src',
  'srcset',
  'action',
  'formaction',
  'poster',
  'background',
  'style',
  'data',
  // `srcdoc` es un DOCUMENTO entero dentro de un atributo: escaparlo como texto
  // lo dejaría inerte, pero es exactamente el sitio donde alguien metería
  // marcado creyendo que la puerta se lo escapa.
  'srcdoc',
];

function esInterpretado(nombre: string): boolean {
  // `on*` son manejadores: su valor es JavaScript. `data-algo` NO entra por el
  // `includes`, que compara el nombre entero.
  return nombre.startsWith('on') || ATRIBUTOS_INTERPRETADOS.includes(nombre);
}

/** Caracteres que forman un nombre de etiqueta o de atributo. */
const NOMBRE = /[A-Za-z0-9_:.-]/;

/**
 * La plantilla escrita de un tirón, para el mensaje del fallo: sin ella el
 * motivo diría qué pasa pero no dónde, y hay 169 huecos donde buscarlo.
 */
function comoSeEscribio(estaticas: readonly string[]): string {
  // El hueco se dibuja como se escribe en el código —con el dólar escapado para
  // que aquí no lo sea— y no con un símbolo inventado: así el motivo del fallo
  // se puede buscar tal cual en `panels.ts`.
  return estaticas.join(`\${…}`);
}

/**
 * Análisis cacheado por SITIO DE LLAMADA.
 *
 * El objeto de las porciones estáticas está internado por sitio —el motor
 * devuelve el mismo en cada vuelta—, así que un `WeakMap` sobre él analiza cada
 * plantilla una vez en la vida del proceso y no sesenta veces por segundo.
 */
const ANALIZADAS = new WeakMap<TemplateStringsArray, readonly Clase[]>();

function clasesDe(estaticas: TemplateStringsArray): readonly Clase[] {
  const guardado = ANALIZADAS.get(estaticas);
  if (guardado !== undefined) return guardado;
  const clases = analizar(estaticas);
  ANALIZADAS.set(estaticas, clases);
  return clases;
}

/**
 * Recorre el marcado estático y dice, para cada hueco, dónde cae.
 *
 * El autómata tiene CUATRO sitios —fuera de una etiqueta, dentro de una
 * etiqueta, dentro de un valor entrecomillado y dentro de un comentario— y va
 * recordando el nombre del atributo cuyo valor está leyendo. Corre entero aunque
 * la plantilla no tenga ni un hueco: `<script>` se rechaza igual.
 *
 * **El comentario no está por el hueco: está por lo que viene DESPUÉS.** Sin
 * este estado, un `<!-- <div class=" -->` deja al autómata creyéndose dentro de
 * un valor entrecomillado, y todo el marcado de detrás se clasifica mal — que es
 * peor que equivocarse en el comentario. De paso, un hueco dentro de un
 * comentario deja de decir «dentro de una etiqueta», que era mentira y mandaba a
 * quien lo leyera a buscar una etiqueta que no existe.
 */
function analizar(estaticas: TemplateStringsArray): readonly Clase[] {
  const clases: Clase[] = [];
  let donde: 'texto' | 'etiqueta' | 'valor' | 'comentario' = 'texto';
  let comilla = '';
  /** Nombre del atributo cuyo valor se está leyendo, en minúsculas. */
  let atributo = '';
  /** Se acaba de ver un `=` y todavía no ha llegado la comilla de apertura. */
  let esperaValor = false;
  /** Identificador que se está acumulando: nombre de etiqueta o de atributo. */
  let pendiente = '';
  /** Lo acumulado es el nombre de la etiqueta, no el de un atributo. */
  let esNombreDeEtiqueta = false;

  for (let i = 0; i < estaticas.length; i++) {
    // Se recorre por índice y no con `for…of` porque hacen falta cuatro
    // caracteres de vista: `<!--` y `-->` no se reconocen de uno en uno.
    const trozo = estaticas[i] as string;
    for (let j = 0; j < trozo.length; j++) {
      const c = trozo[j] as string;

      if (donde === 'comentario') {
        // La norma cierra un comentario de DOS formas, no de una: `-->` y
        // `--!>`. Reconocer solo la primera dejaba al autómata creyéndose dentro
        // del comentario para siempre, así que el hueco siguiente —que podía
        // estar dentro de un atributo de verdad— se escapaba como TEXTO, sin las
        // comillas. O sea que la puerta llegaba a emitir un `onmouseover` vivo,
        // que es justo lo que existe para impedir.
        if (trozo.startsWith('-->', j)) {
          donde = 'texto';
          j += 2;
        } else if (trozo.startsWith('--!>', j)) {
          donde = 'texto';
          j += 3;
        }
        continue;
      }

      if (donde === 'valor') {
        if (c === comilla) {
          donde = 'etiqueta';
          comilla = '';
          atributo = '';
        }
        continue;
      }

      if (donde === 'texto') {
        if (trozo.startsWith('<!--', j)) {
          // Y los comentarios ABRUPTOS: `<!-->` y `<!--->` están cerrados en el
          // sitio, según la norma. Sin esto, un `<!-->` abría un comentario que
          // no se cerraba nunca — el mismo agujero que el `--!>` por el otro lado.
          if (trozo.startsWith('<!-->', j)) {
            j += 4;
          } else if (trozo.startsWith('<!--->', j)) {
            j += 5;
          } else {
            donde = 'comentario';
            j += 3;
          }
        } else if (c === '<') {
          donde = 'etiqueta';
          pendiente = '';
          esNombreDeEtiqueta = true;
          esperaValor = false;
          atributo = '';
        }
        continue;
      }

      // Dentro de una etiqueta, fuera de un valor.
      if (NOMBRE.test(c)) {
        pendiente += c;
        continue;
      }
      if (pendiente !== '') {
        if (esNombreDeEtiqueta) {
          if (pendiente.toLowerCase() === 'script') {
            throw new Error(
              `<script> no se pinta desde una plantilla: ${comoSeEscribio(estaticas)}`,
            );
          }
          esNombreDeEtiqueta = false;
        } else {
          // Se recuerda aunque el cierre no sea un `=`: así `attr = "x"`, con
          // espacios, sigue sabiendo de qué atributo es el valor que viene.
          atributo = pendiente.toLowerCase();
        }
        pendiente = '';
      }
      if (c === '=') {
        esperaValor = true;
      } else if (c === '"' || c === "'") {
        donde = 'valor';
        comilla = c;
        esperaValor = false;
      } else if (c === '>') {
        donde = 'texto';
        esperaValor = false;
        atributo = '';
      }
    }

    // El último trozo no lleva hueco detrás.
    if (i === estaticas.length - 1) break;

    if (donde === 'texto') {
      clases.push('texto');
    } else if (donde === 'comentario') {
      clases.push('comentario');
    } else if (donde === 'valor') {
      if (esInterpretado(atributo)) {
        throw new Error(
          `el atributo "${atributo}" no lleva texto sino una URL o estilo, ` +
            `y escaparlo como texto no lo hace seguro: ${comoSeEscribio(estaticas)}`,
        );
      }
      clases.push('atributo');
    } else {
      if (esperaValor) {
        throw new Error(
          `atributo sin comillas: un valor sin entrecomillar lo termina el primer espacio, ` +
            `así que escaparlo no basta — ponle comillas: ${comoSeEscribio(estaticas)}`,
        );
      }
      clases.push('marcado');
    }
  }

  return clases;
}

/** Cómo se describe en el mensaje del fallo lo que llegó a un hueco. */
function describir(valor: unknown): string {
  if (esHtml(valor)) return 'marcado ya construido';
  if (typeof valor === 'string') return `la cadena ${JSON.stringify(valor)}`;
  return `un valor de tipo ${typeof valor}`;
}

function pegar(clase: Clase, valor: Valor, estaticas: TemplateStringsArray): string {
  if (clase === 'marcado') {
    // Dentro de una etiqueta solo caben atributos, y un atributo se escribe
    // entero o no se escribe: no hay forma de escapar media declaración.
    if (!esHtml(valor)) {
      throw new Error(
        `dentro de una etiqueta solo cabe marcado ya construido, y llegó ${describir(valor)}: ` +
          comoSeEscribio(estaticas),
      );
    }
    return valor[MARCA];
  }

  if (esHtml(valor)) {
    // Un fragmento de marcado dentro de unas comillas no es medio seguro: es un
    // error de categoría, y colarlo crudo dejaría entrar sus propias comillas.
    if (clase === 'atributo') {
      throw new Error(
        `un fragmento de marcado no cabe dentro de un atributo: ${comoSeEscribio(estaticas)}`,
      );
    }
    // Y dentro de un comentario, menos: un fragmento que lleve `-->` cerraría el
    // comentario y todo lo suyo pasaría a pintarse. El texto llano no puede
    // —se le escapa el `>`— pero el marcado crudo sí.
    if (clase === 'comentario') {
      throw new Error(
        `un fragmento de marcado no cabe dentro de un comentario HTML, porque un ` +
          `\`-->\` suyo lo cerraría: ${comoSeEscribio(estaticas)}`,
      );
    }
    // Y aquí está la trampa del doble escape: lo que ya salió de esta puerta
    // entra CRUDO, o los paneles anidados se llenarían de `&lt;div&gt;`.
    return valor[MARCA];
  }

  if (typeof valor !== 'string' && typeof valor !== 'number') {
    throw new Error(
      `un hueco solo admite texto, número o marcado, y llegó ${describir(valor)}: ` +
        comoSeEscribio(estaticas),
    );
  }
  const texto = String(valor);
  // El comentario se escapa como texto, y con eso queda cerrado: todo
  // terminador de comentario —`-->` y `--!>`— necesita un `>` LITERAL, y ahí ya
  // no queda ninguno. Las entidades no se decodifican dentro de un comentario,
  // así que el `&lt;` que salga se queda ahí escrito sin significar nada, que es
  // lo que se quiere de algo que no lee nadie.
  return clase === 'atributo' ? escaparAtributo(texto) : escaparTexto(texto);
}

/**
 * La etiqueta. `html\`<p>${nombre}</p>\`` escapa `nombre` según dónde cae.
 *
 * Un `Html` pasa crudo; una cadena o un número se escapan; cualquier otra cosa
 * lanza. No hay parámetro que decida el modo: lo decide el marcado de al lado.
 */
export function html(estaticas: TemplateStringsArray, ...huecos: readonly Valor[]): Html {
  const clases = clasesDe(estaticas);
  let salida = estaticas[0] as string;
  for (let i = 0; i < huecos.length; i++) {
    salida += pegar(clases[i] as Clase, huecos[i] as Valor, estaticas);
    salida += estaticas[i + 1] as string;
  }
  return crudo(salida);
}

/**
 * Junta fragmentos, que es lo que hacían los veinte `.join('')` de los paneles.
 *
 * Toma `Html` y no cadenas a propósito: un `.join('')` sobre cadenas es
 * exactamente el sitio por el que el marcado se escapaba de la puerta.
 */
export function unir(partes: readonly Html[]): Html {
  let salida = '';
  for (const parte of partes) {
    if (!esHtml(parte)) {
      throw new Error(`unir() junta marcado, y le ha llegado ${describir(parte)}`);
    }
    salida += parte[MARCA];
  }
  return crudo(salida);
}

/**
 * El ÚNICO `innerHTML` del repositorio, y lo vigila `invariantes.test.ts`.
 *
 * Que solo acepte `Html` es el cerrojo que hace que olvidarse no compile: en
 * cuanto los paneles devuelven `Html`, cualquiera nuevo que devuelva `string`
 * lo caza `tsc` en esta línea sin que nadie tenga que acordarse de nada.
 */
export function pintar(destino: Element, contenido: Html): void {
  if (!esHtml(contenido)) {
    throw new Error(
      `pintar() solo pinta marcado construido con \`html\`, y llegó ${describir(contenido)}`,
    );
  }
  destino.innerHTML = contenido[MARCA];
}

/**
 * La URL, comprobada, o se lanza. **La única regla de «esta URL se puede
 * cargar» del repositorio.**
 *
 * Vive aparte de `srcDeImagen` porque hay DOS sumideros y no uno: la plantilla
 * (`<img${srcDeImagen(u)}>`) y la propiedad del DOM (`img.src = u` en
 * `render/assets.ts`, que carga el arte). Escrita dos veces, se desincroniza;
 * escrita aquí, las dos puertas comprueban lo mismo.
 *
 * Tres reglas, y la primera es la que faltaba:
 *
 *  1. **Ni tabuladores, ni saltos de línea, ni NUL.** El navegador los QUITA al
 *     leer una URL, así que `java\tscript:alert(1)` es `javascript:` para él —y
 *     no para una expresión regular que busque el esquema al principio—. Sin
 *     esta regla la función fallaba ABIERTO justo en el caso que existe para
 *     cazar: aceptaba las tres variantes con separador dentro y rechazaba solo
 *     la escrita del tirón.
 *  2. El esquema, sobre el valor ya recortado: sin esquema es una ruta relativa
 *     y no hay nada que ejecutar; con esquema, solo `http`, `https` y `blob`.
 *  3. `data:` solo para imágenes, y **no `svg+xml`**: un SVG es el único formato
 *     de imagen que lleva script dentro. Aquí no se genera ninguno.
 */
export function urlDeImagenSegura(url: string): string {
  if (/[\t\n\r\0]/.test(url)) {
    throw new Error(
      `no se puede cargar una imagen desde "${url}": lleva un tabulador, un salto de línea o un NUL, y el navegador los quita antes de mirar el esquema`,
    );
  }
  const limpia = url.trim();
  const esquema = /^([a-z][a-z0-9+.-]*):/i.exec(limpia);
  const permitido =
    esquema === null ||
    ['http', 'https', 'blob'].includes((esquema[1] as string).toLowerCase()) ||
    (/^data:image\//i.test(limpia) && !/^data:image\/svg\+xml/i.test(limpia));
  if (!permitido) {
    throw new Error(
      `no se puede cargar una imagen desde "${url}": solo valen rutas relativas, http, https, blob o data:image (menos svg)`,
    );
  }
  return limpia;
}

/**
 * ` src="…"` con la URL comprobada, para la única imagen que pintan los paneles.
 *
 * `src` está en la lista de atributos interpretados y un hueco ahí lo rechaza el
 * analizador, con razón: escapar comillas no para un `javascript:`. Lo que sí
 * vale es mirar el esquema, y eso lo decide `urlDeImagenSegura`, que es la misma
 * regla que aplica `render/assets.ts` antes de tocar `img.src`.
 */
export function srcDeImagen(url: string): Html {
  return crudo(` src="${escaparAtributo(urlDeImagenSegura(url))}"`);
}

/**
 * ` style="background:…"` con el color comprobado, para la muestra de recurso.
 *
 * Mismo trato que `srcDeImagen` y por el mismo motivo: `style` es un lenguaje,
 * no texto, y `url(javascript:…)` no lleva ni comillas ni `<`. Lo que se acepta
 * es un color y nada más — un `#rgb`, una función de color o un nombre de los de
 * la norma.
 */
export function fondoDeColor(color: string): Html {
  const limpio = color.trim();
  const esColor =
    /^#[0-9a-f]{3,8}$/i.test(limpio) ||
    /^[a-z]+$/i.test(limpio) ||
    /^(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/-]+\)$/i.test(limpio);
  if (!esColor) {
    throw new Error(
      `"${color}" no es un color: en un atributo \`style\` solo entra un color (#rgb, rgb(...) o un nombre)`,
    );
  }
  return crudo(` style="background:${escaparAtributo(limpio)}"`);
}
