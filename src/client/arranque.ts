/**
 * **La entrada de cada página** (la partida, la arena y el espectador): carga su
 * `main.ts` a demanda y, si no carga, dice en la página por qué.
 *
 * El núcleo valida sus datos al importarse y lanza con un mensaje para la
 * persona: una unidad que no vale en `data/unidades.json` (editada a mano;
 * «Guardar» no la deja pasar) tumba `core/catalogo.ts`, y con él todo lo que lo
 * importa, que es casi todo. Con `main.ts` de entrada, eso pasaba antes de que la
 * página pintase nada: la arena se quedaba en «Cargando las hojas…», la partida
 * en blanco y el motivo solo en la consola (H5 de QA, 19-10-2026). Por eso esto
 * **no importa nada del núcleo** (lo vigila `test/arranque.test.ts`): es lo único
 * que se evalúa seguro, y lo que cuenta el fallo de lo demás.
 */
import { type Html, html, pintar } from './html.js';

/** El motivo para la persona: el mensaje entero, tal cual lo escribió quien lanzó. */
export function motivoDeNoArrancar(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Lo que enseña la página que no arranca: qué pasa, el motivo entero (sin
 * cortar: dice el fichero, la unidad y por qué) y qué hacer.
 */
export function renderNoArranca(err: unknown): Html {
  return html`<section id="no-arranca" role="alert">
    <h1>La página no arranca</h1>
    <p>Algo de lo que carga al empezar no vale:</p>
    <pre class="motivo">${motivoDeNoArrancar(err)}</pre>
    <p class="que-hacer">Arréglalo y recarga la página. Lo demás, en la consola del navegador.</p>
  </section>`;
}

/**
 * Carga la página (`cargar`, un `import('./main.js')`) y, si lanza al cargarse,
 * pinta el motivo en lugar de la página (`#app`, `data-escena="no-arranca"`).
 */
export function arrancar(cargar: () => Promise<unknown>): void {
  cargar().catch((err: unknown) => {
    console.error('[arranque] la página no arranca', err);
    const app = document.getElementById('app') ?? document.body;
    app.dataset.escena = 'no-arranca';
    pintar(app, renderNoArranca(err));
  });
}
