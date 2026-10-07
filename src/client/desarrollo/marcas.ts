/**
 * El modo «marcar fallo» del mapa de aventura, **solo en `pnpm dev`**.
 *
 * Con la tecla `M` o el botón «Marcar», un clic en el mapa no mueve al héroe:
 * recorta la pantalla alrededor del punto, reúne qué hay ahí (`queHayEn`) y
 * abre un cuadro para la nota. Al guardar, el servidor de Vite lo escribe en
 * `docs/revision/marcas/` (plugin `marcas` de `vite.config.ts`). Con
 * `?seed=N&marca=<id>` la página vuelve a mirar ese sitio a ese zoom.
 *
 * No aplica ninguna regla ni pasa por `session.ts` más que para leer el estado y
 * escribir en la barra: es una herramienta para quien revisa el escenógrafo, no
 * parte del juego. Llega por un `import()` detrás de
 * `HERRAMIENTAS_DE_DESARROLLO`, y en `vite build` no queda (`sinDesarrollo`).
 */
import { objectAt } from '@core/map/map.js';
import type { EscenaAventura } from '../escenas/aventura.js';
import { html, pintar } from '../html.js';
import { type CamaraMapa, cajaEnPixeles, mundoAPixel, pixelAMundo } from '../render/camara-mapa.js';
import { queHayEn } from '../render/escenario/inspeccion.js';
import { escenarioListo } from '../render/escenario/superficie.js';
import type { Session } from '../session.js';
import { motivoDe } from './esquema.js';
import type { Desarrollo, Marca, MarcaNueva, Punto2 } from './tipos.js';

/** Las casillas que cubre el recorte de cada lado del punto: 9×9 en total. */
const MEDIO_RECORTE = 4.5;

export interface DependenciasDeMarcas {
  readonly sesion: () => Session;
  readonly aventura: EscenaAventura;
  readonly canvas: HTMLCanvasElement;
  readonly herramientas: HTMLElement;
  readonly pedirFotograma: () => void;
  /**
   * Pinta un fotograma YA, en este hilo: el recorte se toma de él, sin el aspa
   * ni la ruta del puntero, y no del último que quedó en el lienzo.
   */
  readonly pintarYa: () => void;
}

/** Una marca a medio hacer: recortada y medida, esperando su nota. */
type Pendiente = Omit<MarcaNueva, 'nota'>;

/** Los bytes de un PNG en base64, sin `data:`: lo que viaja en el JSON. */
async function base64De(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  // De a trozos: `fromCharCode(...bytes)` de un PNG de un mega revienta la pila.
  for (let i = 0; i < bytes.length; i += 0x8000)
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

/** Lo que se acaba de pintar con `pintar`, o lanza: sin ello el modo no funciona. */
function exigir<T>(el: T | null, que: string): T {
  if (el === null) throw new Error(`el modo «marcar fallo» no ha podido montar ${que}`);
  return el;
}

export function montar(d: DependenciasDeMarcas): Desarrollo {
  let activo = false;
  let pendiente: Pendiente | null = null;
  /** Las que se han guardado en esta página: se pintan con el modo puesto. */
  const guardadas: Punto2[] = [];
  /** La que se reproduce con `?marca=`. */
  let reproducida: Punto2 | null = null;
  /** Mientras se pinta el fotograma del recorte, sin aspas. */
  let ocultas = false;

  const caja = document.createElement('span');
  pintar(
    caja,
    html`<button type="button" aria-pressed="false" title="Marcar un fallo del mapa para revisarlo (M)">Marcar</button>`,
  );
  d.herramientas.append(caja);
  const boton = exigir(caja.querySelector('button'), 'su botón');

  const cuadro = document.createElement('div');
  pintar(
    cuadro,
    html`<dialog style="background:#292619;color:#f5dfb0;border:2px outset #857147;max-width:420px">
  <form method="dialog">
    <p style="margin:0 0 8px">¿Qué falla aquí?</p>
    <textarea name="nota" rows="4" cols="40" required placeholder="Una cara lisa, un borde recto, un puente mal casado…"></textarea>
    <p id="marca-donde" style="margin:6px 0;font-size:12px;opacity:.8"></p>
    <button value="guardar">Guardar</button>
    <button value="cancelar" formnovalidate>Cancelar</button>
  </form>
</dialog>`,
  );
  document.body.append(cuadro);
  const dialogo = exigir(cuadro.querySelector('dialog'), 'su cuadro');
  const nota = exigir(cuadro.querySelector('textarea'), 'el campo de la nota');
  const donde = exigir(cuadro.querySelector('#marca-donde'), 'la línea del sitio');

  const decir = (frase: string): void => {
    d.sesion().status = frase;
    d.pedirFotograma();
  };

  const poner = (si: boolean): void => {
    activo = si;
    boton.ariaPressed = String(si);
    boton.style.outline = si ? '2px solid #e0a83a' : '';
    d.canvas.style.cursor = si ? 'crosshair' : '';
    decir(
      si
        ? 'Marcar fallo: haz clic donde está el fallo (arrastrar sigue moviendo el mapa). Escape o M para salir.'
        : 'Modo «marcar fallo» apagado.',
    );
  };

  boton.addEventListener('click', () => {
    if (d.sesion().scene === 'adventure') poner(!activo);
  });

  dialogo.addEventListener('close', () => {
    const p = pendiente;
    pendiente = null;
    d.pedirFotograma();
    if (p === null) return;
    if (dialogo.returnValue !== 'guardar') {
      decir('Marca cancelada: no se ha guardado nada.');
      return;
    }
    void guardar({ ...p, nota: nota.value.trim() });
  });

  async function guardar(marca: MarcaNueva): Promise<void> {
    try {
      const r = await fetch('/__marcas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(marca),
      });
      const cuerpo = (await r.json()) as { id?: string; error?: string };
      if (!r.ok || cuerpo.id === undefined)
        throw new Error(cuerpo.error ?? `el servidor respondió ${r.status} sin decir por qué`);
      guardadas.push(marca.punto);
      decir(`Marca guardada: ${cuerpo.id}`);
    } catch (err) {
      console.error('[marcas] no se ha guardado la marca', err);
      decir(`No se ha guardado la marca: ${motivoDe(err)}`);
    }
  }

  /** El recorte del lienzo alrededor de `(px, py)`, en sus píxeles, y lo que cubre del mundo. */
  async function recortar(
    px: number,
    py: number,
    camara: CamaraMapa,
  ): Promise<{ png: string; recorte: MarcaNueva['recorte']; lienzo: MarcaNueva['lienzo'] }> {
    const rect = d.canvas.getBoundingClientRect();
    // La densidad que se pintó de verdad: con el presupuesto de píxeles del
    // mapa es menor que la de la pantalla, y el recorte va en SUS píxeles.
    const densidad = d.canvas.width / rect.width;
    const medio = MEDIO_RECORTE * camara.tile;
    const x0 = Math.max(0, px - medio);
    const y0 = Math.max(0, py - medio);
    const x1 = Math.min(rect.width, px + medio);
    const y1 = Math.min(rect.height, py + medio);
    const { sx, sy, sw, sh } = cajaEnPixeles([x0, y0, x1, y1], densidad);
    const lienzo = new OffscreenCanvas(sw, sh);
    const c = lienzo.getContext('2d');
    if (c === null)
      throw new Error('este navegador no da un contexto 2D para recortar la pantalla');
    c.drawImage(d.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    const png = await base64De(await lienzo.convertToBlob({ type: 'image/png' }));
    const a = pixelAMundo(camara, x0, y0);
    const b = pixelAMundo(camara, x1, y1);
    return {
      png,
      recorte: [a.x, a.y, b.x, b.y],
      lienzo: { ancho: rect.width, alto: rect.height, dpr: window.devicePixelRatio || 1, densidad },
    };
  }

  async function marcar(px: number, py: number): Promise<void> {
    const s = d.sesion();
    const { map, seed, day } = s.state;
    const esc = escenarioListo(map, seed);
    if (esc === null) {
      decir('La escena del mapa aún se está componiendo: espera un momento y vuelve a marcar.');
      return;
    }
    const { mundo, casilla } = d.aventura.puntoBajo(px, py);
    const camara = d.aventura.camaraActual;
    const queHay = queHayEn(esc, mundo, casilla);
    const objeto = objectAt(map, casilla);
    // El recorte, de un fotograma limpio: sin aspas, sin la ruta ni la casilla
    // señalada por el puntero, que taparían justo lo que se marca.
    d.aventura.salir();
    ocultas = true;
    try {
      d.pintarYa();
    } finally {
      ocultas = false;
    }
    const { png, recorte, lienzo } = await recortar(px, py, camara);
    pendiente = {
      semilla: seed,
      dia: day,
      casilla: { x: casilla.x, y: casilla.y },
      punto: { x: mundo.x, y: mundo.y },
      camara: { tile: camara.tile, x: camara.x, y: camara.y },
      lienzo,
      recorte,
      objeto: objeto === undefined ? null : { id: objeto.id, kind: objeto.kind },
      queHay,
      png,
    };
    donde.textContent = `Casilla (${casilla.x}, ${casilla.y}) · ${queHay.terreno} · ${queHay.sprites.length} sprites · semilla ${seed}, día ${day}`;
    nota.value = '';
    // El cuadro, al lado contrario del punto, para no tapar el aspa.
    const enPagina = d.canvas.getBoundingClientRect().left + px;
    dialogo.style.margin =
      enPagina > window.innerWidth / 2 ? 'auto auto auto 16px' : 'auto 16px auto auto';
    dialogo.showModal();
    nota.focus();
    d.pedirFotograma();
  }

  /** `?marca=<id>`: lee la marca y mira donde se hizo, con el mapa entero a la vista. */
  async function reproducir(id: string): Promise<void> {
    try {
      const r = await fetch(`/__marcas/${encodeURIComponent(id)}`);
      const cuerpo = (await r.json()) as Marca | { error: string };
      if (!r.ok || 'error' in cuerpo)
        throw new Error('error' in cuerpo ? cuerpo.error : `el servidor respondió ${r.status}`);
      const s = d.sesion();
      if (cuerpo.semilla !== s.state.seed)
        throw new Error(
          `la marca ${id} es de la semilla ${cuerpo.semilla} y esta partida es la ${s.state.seed}: abre ?seed=${cuerpo.semilla}&marca=${id}`,
        );
      // Lo marcado se vio; aquí, con otra partida al día 1, puede estar bajo la niebla.
      s.revealAll = true;
      d.aventura.mirarA(cuerpo.punto, cuerpo.camara.tile);
      reproducida = cuerpo.punto;
      decir(
        `Marca ${id} (${cuerpo.resuelta === null ? 'pendiente' : `resuelta con ${cuerpo.resuelta.ref}`}), casilla (${cuerpo.casilla.x}, ${cuerpo.casilla.y}), día ${cuerpo.dia} de la partida original: ${cuerpo.nota}`,
      );
    } catch (err) {
      console.error('[marcas] no se ha podido reproducir la marca', err);
      decir(`No se ha podido reproducir la marca ${id}: ${motivoDe(err)}`);
    }
  }

  const pedida = new URLSearchParams(location.search).get('marca');
  if (pedida !== null) void reproducir(pedida);

  const aspa = (ctx: CanvasRenderingContext2D, p: Punto2, color: string): void => {
    const { x, y } = mundoAPixel(d.aventura.camaraActual, p.x, p.y);
    ctx.save();
    for (const [ancho, tinta] of [
      [5, '#000'],
      [2.5, color],
    ] as const) {
      ctx.lineWidth = ancho;
      ctx.strokeStyle = tinta;
      ctx.beginPath();
      ctx.moveTo(x - 9, y - 9);
      ctx.lineTo(x + 9, y + 9);
      ctx.moveTo(x + 9, y - 9);
      ctx.lineTo(x - 9, y + 9);
      ctx.arc(x, y, 14, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  };

  return {
    get activo() {
      return activo;
    },
    dibujar(ctx) {
      if (ocultas) return;
      if (pendiente !== null) aspa(ctx, pendiente.punto, '#ff4040');
      if (activo) for (const p of guardadas) aspa(ctx, p, '#e0a83a');
      if (reproducida !== null) aspa(ctx, reproducida, '#ff4040');
    },
    tecla(ev) {
      // Con el cuadro abierto el foco está en él, y `main.ts` no llega a preguntar aquí.
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return false;
      if ((ev.key === 'm' || ev.key === 'M') && d.sesion().scene === 'adventure') {
        if (!ev.repeat) poner(!activo);
        return true;
      }
      if (ev.key === 'Escape' && activo) {
        poner(false);
        return true;
      }
      return false;
    },
    clic(px, py) {
      if (!activo || pendiente !== null) return;
      marcar(px, py).catch((err: unknown) => {
        pendiente = null;
        console.error('[marcas] no se ha podido marcar', err);
        decir(`No se ha podido marcar: ${motivoDe(err)}`);
      });
    },
  };
}
