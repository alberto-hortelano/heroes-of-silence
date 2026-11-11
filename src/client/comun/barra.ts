/**
 * Lo que cabe en la barra de abajo (`#status`), que tiene el alto fijo (B1 de QA,
 * 14-10-2026: con la barra creciendo al pasar el ratón, el lienzo encogía bajo el
 * cursor) y recorta a dos líneas, cuatro en la batalla (`style.css`). Lo que no cabe
 * se corta por **frases enteras** y dice dónde se lee el resto (#264, 11-11-2026). El
 * recorte de la hoja cortaba a mitad de cifra, y lo primero que se perdía de una carga
 * era la armadura.
 *
 * Si no cabe ni la primera frase, se corta por sus partes: primero por «;», que es como
 * se juntan los alcanzados de un hechizo de área (708 caracteres en una frase, la
 * Tormenta de granizo sobre seis), luego por «, » y, si tampoco, por palabras; siempre
 * con el aviso a la vista (H1 del QA, 11-11-2026: la hoja recortaba esa frase a mitad
 * de un alcanzado y el aviso quedaba fuera). Un corte preferido que deja menos de la
 * mitad de lo que cabría por palabras se salta (`loQueCabe`).
 *
 * Dónde se lee el resto depende de si hay ratón (H2 del QA): con ratón, en el bocadillo
 * del lienzo (`title`), con el ratón quieto donde está: llevarlo a la barra cambiaría
 * el texto, que en la batalla sale de la casilla señalada. Sin ratón (un móvil) no hay
 * bocadillo: se toca la barra y se despliega entera; otro toque, o el siguiente texto,
 * la pliega. El toque vale también con ratón, para un aviso que no sale de señalar
 * nada (la ayuda de la tropa).
 */

/** Lo que se pone tras lo que cabe con ratón: dónde se lee el resto. */
export const SIGUE_CON_EL_RATON = ' … (el resto, con el ratón quieto)';
/** Lo mismo sin ratón: el bocadillo del lienzo no sale en una pantalla táctil. */
export const SIGUE_AL_TOCARLA = ' … (toca aquí para leer el resto)';

/** Lo último que se puso en cada barra: el texto entero, lo que se ve y si está cortada. */
interface Puesto {
  readonly entero: string;
  readonly visto: string;
  readonly cortada: boolean;
  readonly lienzo: HTMLElement;
  readonly raton: boolean | undefined;
}
const PUESTO = new WeakMap<HTMLElement, Puesto>();
/** Las barras que ya escuchan el toque que las despliega. */
const CON_TOQUE = new WeakSet<HTMLElement>();

/**
 * Pone `texto` en la barra `elStatus`; si no cabe, solo lo que cabe del principio,
 * cortado por frases (o por sus partes, o por palabras), con el aviso de dónde se lee
 * el resto, y el texto entero en el `title` de `lienzo`. Si cabe, el lienzo se queda
 * sin `title`. Con el mismo texto de antes no mide otra vez (se llama en cada
 * fotograma) y una barra desplegada sigue desplegada. Una frase acaba en punto y
 * blanco: los decimales van con coma (`conComa`). Con la página sin arrancar
 * (`data-sin-arrancar`, `partida/abrir.ts`) la barra se lee entera y no se toca.
 *
 * `raton`: si quien juega tiene ratón; sin decirlo, lo pregunta a la pantalla
 * (`(hover: hover)`) solo cuando hay que cortar.
 *
 * El corte no se rehace si cambia el ancho con el mismo texto: lo rehace el
 * siguiente cambio de texto (al mover el ratón).
 */
export function ponerEnLaBarra(
  elStatus: HTMLElement,
  texto: string,
  lienzo: HTMLElement,
  raton?: boolean,
): void {
  if (elStatus.dataset.sinArrancar !== undefined) return;
  const antes = PUESTO.get(elStatus);
  // Otro sitio pudo escribir la barra entre medias (la arena, fuera de la pelea).
  if (antes !== undefined && antes.entero === texto && antes.visto === elStatus.textContent) {
    return;
  }
  if (!CON_TOQUE.has(elStatus)) {
    CON_TOQUE.add(elStatus);
    elStatus.addEventListener('click', () => desplegarOPlegar(elStatus));
  }
  cortar(elStatus, texto, lienzo, raton);
}

/** Pone el texto y, si no cabe, el corte; anota lo puesto. */
function cortar(
  elStatus: HTMLElement,
  texto: string,
  lienzo: HTMLElement,
  raton: boolean | undefined,
): void {
  delete elStatus.dataset.desplegada;
  delete elStatus.dataset.cortada;
  elStatus.textContent = texto;
  const cortada = noCabe(elStatus);
  if (cortada) {
    const aviso = (raton ?? hayRaton()) ? SIGUE_CON_EL_RATON : SIGUE_AL_TOCARLA;
    elStatus.textContent = loQueCabe(elStatus, texto, aviso);
    elStatus.dataset.cortada = '';
    lienzo.title = texto;
  } else if (lienzo.hasAttribute('title')) {
    lienzo.removeAttribute('title');
  }
  PUESTO.set(elStatus, {
    entero: texto,
    visto: elStatus.textContent ?? '',
    cortada,
    lienzo,
    raton,
  });
}

/**
 * El toque en la barra: si está cortada, la despliega entera (`data-desplegada`, que en
 * la hoja la deja crecer y desplazarse); si está desplegada, la vuelve a cortar.
 */
function desplegarOPlegar(elStatus: HTMLElement): void {
  const p = PUESTO.get(elStatus);
  if (p === undefined || !p.cortada || p.visto !== elStatus.textContent) return;
  if (elStatus.dataset.desplegada !== undefined) {
    cortar(elStatus, p.entero, p.lienzo, p.raton);
    return;
  }
  elStatus.textContent = p.entero;
  elStatus.dataset.desplegada = '';
  PUESTO.set(elStatus, { ...p, visto: p.entero });
}

/**
 * Dónde se puede cortar, de lo que más se prefiere a lo que menos: tras cada frase
 * (punto y blanco), antes de cada «;», antes de cada «, » (una coma sin blanco detrás
 * es un decimal) y antes de cada blanco (no el duro de `conMiles`, que es una cifra).
 * Cada lista, de menos a más largo.
 */
function cortesDe(texto: string): number[][] {
  const donde = (re: RegExp, despues: number): number[] =>
    [...texto.matchAll(re)].map((m) => m.index + despues).filter((i) => i > 0);
  return [donde(/\.(?=\s)/g, 1), donde(/;/g, 0), donde(/,(?= )/g, 0), donde(/ /g, 0)];
}

/**
 * Lo más largo del principio de `texto` que cabe con `aviso`, cortado donde más se
 * prefiere (`cortesDe`) siempre que ese corte deje al menos la mitad de lo que cabría
 * cortando por palabras: en el móvil, la ayuda de la tropa por su primera «, » se
 * quedaba en «Tu formación …» con sitio para cuarenta letras más. Sin ningún corte que
 * quepa, solo el aviso.
 */
function loQueCabe(el: HTMLElement, texto: string, aviso: string): string {
  const con = (corte: number): string => `${texto.slice(0, corte).trimEnd()}${aviso}`;
  const mejores = cortesDe(texto).map((cortes) => elMasLargoQueCabe(el, cortes, con));
  const porPalabras = mejores[mejores.length - 1] ?? 0;
  const corte = mejores.find((m) => m > 0 && 2 * m >= porPalabras);
  return corte === undefined ? aviso.trimStart() : con(corte);
}

/**
 * De `cortes` (de menos a más largo), el más largo cuyo principio cabe en la barra con
 * el aviso (`con`), buscado a medias: lo que mide la barra crece con lo que se le pone.
 * Sin ninguno, 0.
 */
function elMasLargoQueCabe(
  el: HTMLElement,
  cortes: readonly number[],
  con: (corte: number) => string,
): number {
  let bajo = 0;
  let alto = cortes.length - 1;
  let mejor = 0;
  while (bajo <= alto) {
    const medio = (bajo + alto) >> 1;
    const corte = cortes[medio] as number;
    el.textContent = con(corte);
    if (noCabe(el)) alto = medio - 1;
    else {
      mejor = corte;
      bajo = medio + 1;
    }
  }
  return mejor;
}

/** Si quien mira la página tiene ratón: lo que dice la pantalla (`hover`). */
function hayRaton(): boolean {
  return typeof matchMedia !== 'function' || matchMedia('(hover: hover)').matches;
}

/** Si lo que hay en la barra pasa de lo que se ve (`line-clamp` recorta por abajo). */
function noCabe(el: HTMLElement): boolean {
  return desbordaLaBarra(el.scrollHeight, el.clientHeight);
}

/**
 * Lo que la barra puede medir de más sin que le falte nada: el redondeo de la letra.
 * Con la de los elfos, dos líneas de 19,5 px dan 40 de texto en 39 de barra, y cuatro,
 * 79 en 78 (medido a 380, 1024 y 1440 px en las cinco facciones; las otras cuatro dan
 * justo): todo texto de dos líneas «no cabía» y se cortaba a una, y en la batalla se
 * perdía la cuarta (H1 del QA de #336, 11-11-2026: a 380 con ratón quedaba «No hay
 * camino hasta … (el resto, con el ratón quieto)», sin el porqué). Una línea que de
 * verdad no cabe pasa 19 px; uno es lo que se vio.
 */
const REDONDEO_DE_LA_LETRA = 1;

/**
 * Si un texto de `alto` px desborda una barra de `visible` px. La única cuenta: la
 * leen el corte y la pasada `arena` de `pnpm capturas`, que mira que la previsión de
 * la carga quepa.
 */
export function desbordaLaBarra(alto: number, visible: number): boolean {
  return alto > visible + REDONDEO_DE_LA_LETRA;
}
