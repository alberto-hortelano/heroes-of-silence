/**
 * El mundo, en el menú de `pnpm dev` (F1a del mapa vivo, C3): tras elegir facción
 * (y la complejidad del combate), «El mundo» pide el tamaño del mapa (y los rivales, fijos en 1) y lo
 * genera: el servidor de desarrollo congela el plan procedimental y lanza el motor
 * de narrativa (`POST /__mundos`, `tools/mundo/motor.ts`), y una pantalla de
 * espera enseña su progreso (`GET /__mundos/<id>/progreso`). Al acabar, la partida
 * arranca con ese mundo (`?mundo=<id>`), que queda en disco y se vuelve a jugar con
 * la misma URL. Si falla, se dice por qué y se puede jugar el procedimental.
 *
 * Solo en `pnpm dev`: lo carga `inicio.ts` con un `import()` tras
 * `HERRAMIENTAS_DE_DESARROLLO`. En el build, «Empezar» juega como siempre.
 */
import { TAMAÑO_POR_DEFECTO, TAMAÑOS_DE_UN_MUNDO } from '@core/mundo/formato.js';
import type { FactionId } from '@core/types.js';
import { type Html, html, NADA, pintar, unir } from '../html.js';
import { type Fase, type Progreso, terminada } from './progreso.js';

/** Por qué los rivales están fijos en 1. */
const UN_RIVAL = 'de momento, uno: el generador aún no sabe de más bandos';

/** Cada cuánto se pregunta por el progreso. */
const CADA_MS = 1500;

/**
 * Lo que el menú ya eligió y cómo seguir. Sin héroe: desde que el de salida se
 * elige en la base (22-10-2026) el menú no lo pregunta, y el mundo nuevo lleva el
 * de por defecto de la facción (`mundoNuevo`), pagado como todo héroe.
 */
export interface AlElegirMundo {
  readonly faccion: FactionId;
  /** Juega el procedimental de siempre con esta facción (el héroe, en la base). */
  readonly sinHistoria: () => void;
  /** Juega el mundo `id`. */
  readonly conMundo: (id: string) => void;
  /** Vuelve a la elección de facción. */
  readonly volver: () => void;
}

const FASES: Readonly<Record<Fase, string>> = {
  congelar: 'Congelando el plan del mapa',
  pintar: 'Leyendo y pintando el mapa para el motor',
  motor: 'El motor escribe la trama',
  validar: 'Comprobando la historia',
  listo: 'El mundo está listo',
  fallido: 'No se ha podido generar el mundo',
};

function renderMundo(tamaño: number): Html {
  return html`<form class="eleccion-del-mundo" data-mundo="eleccion">
    <h1 class="titulo-de-inicio">El mundo</h1>
    <p class="quien-de-inicio">El motor de narrativa escribe la trama de tu mapa, con sus lugares, su gente y sus encuentros, y la deja guardada. Tarda de 5 a 15 minutos.</p>
    <fieldset class="tamanos-del-mundo">
      <legend>Tamaño del mapa</legend>
      ${unir(
        TAMAÑOS_DE_UN_MUNDO.map(
          (t) => html`<label class="opcion-de-tamano">
            <input type="radio" name="tamano" value="${String(t.regiones)}" ${t.regiones === tamaño ? html`checked` : NADA} />
            <span class="nombre-de-tamano">${t.nombre}</span> <span class="cost">${t.que} · de ${String(t.lugares.de)} a ${String(t.lugares.a)} lugares</span>
          </label>`,
        ),
      )}
    </fieldset>
    <p class="rivales-del-mundo" aria-disabled="true">
      <span>Rivales de la IA</span> <span class="valor-fijo">1</span> <span class="cost">${UN_RIVAL}</span>
    </p>
    <div class="botones-de-inicio">
      <button type="button" data-inicio="volver">Volver</button>
      <button type="button" data-mundo="sin-historia">Jugar sin historia</button>
      <button type="submit" class="primary" data-mundo="generar">Generar el mundo</button>
    </div>
  </form>`;
}

/** Un rato en minutos y segundos («7 min 05 s»; por debajo del minuto, solo segundos). */
function minutosYSegundos(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return m === 0 ? `${s} s` : `${m} min ${String(s).padStart(2, '0')} s`;
}

function renderEspera(p: Progreso, ahora: number): Html {
  const segundos = Math.round((ahora - p.empezo) / 1000);
  const callado = Math.round((ahora - p.ultima) / 1000);
  const final = terminada(p.fase);
  return html`<section class="espera-del-mundo" data-mundo="espera" data-fase="${p.fase}" aria-live="polite">
    <h1 class="titulo-de-inicio">${FASES[p.fase]}</h1>
    <p class="quien-de-inicio">${p.id} · ${minutosYSegundos(segundos)}${
      p.fase === 'motor' && callado > 20
        ? ` · sin noticias del motor desde hace ${callado} s (piensa)`
        : ''
    }${p.validaciones > 0 ? ` · ${p.validaciones} ${p.validaciones === 1 ? 'validación' : 'validaciones'}` : ''}</p>
    ${
      p.ultimoProblema === undefined || terminada(p.fase)
        ? NADA
        : html`<p class="cost">La última validación no pasó: ${p.ultimoProblema}</p>`
    }
    ${p.motivo === undefined ? NADA : html`<p class="motivo-del-mundo">${p.motivo}</p>`}
    ${
      p.problemas === undefined || p.problemas.length === 0
        ? NADA
        : html`<ul class="problemas-del-mundo">${unir(p.problemas.slice(0, 12).map((x) => html`<li>${x}</li>`))}</ul>`
    }
    <ol class="lineas-del-motor">${unir(p.lineas.slice(-12).map((l) => html`<li>${l}</li>`))}</ol>
    <div class="botones-de-inicio">${
      final
        ? p.fase === 'fallido'
          ? html`<button type="button" data-inicio="volver">Volver</button><button type="button" class="primary" data-mundo="sin-historia">Jugar el procedimental</button>`
          : NADA
        : html`<button type="button" data-mundo="cancelar">Cancelar</button>`
    }</div>
  </section>`;
}

async function pedir(
  ruta: string,
  opciones?: RequestInit,
): Promise<{ ok: boolean; cuerpo: unknown }> {
  const r = await fetch(ruta, opciones);
  return { ok: r.ok, cuerpo: await r.json() };
}

/**
 * Pinta «El mundo» en `inicio` y conduce lo que siga. `signal` suelta lo que
 * escucha cuando el menú se va (empezar, o volver a la elección de facción).
 */
export function elegirMundo(inicio: HTMLElement, a: AlElegirMundo, signal: AbortSignal): void {
  let tamaño: number = TAMAÑO_POR_DEFECTO;
  let enCurso: string | null = null;
  let reloj: ReturnType<typeof setTimeout> | null = null;
  const parar = (): void => {
    if (reloj !== null) clearTimeout(reloj);
    reloj = null;
  };
  // Salir de la espera (Escape, «Volver») cancela la generación: si no, seguiría
  // en el servidor y la siguiente se encontraría la plaza ocupada (409).
  signal.addEventListener('abort', () => {
    parar();
    if (enCurso !== null) void pedir(`/__mundos/${enCurso}`, { method: 'DELETE' });
    enCurso = null;
  });

  pintar(inicio, renderMundo(tamaño));
  inicio.querySelector<HTMLElement>('[data-mundo="generar"]')?.focus();

  const seguir = async (id: string): Promise<void> => {
    const { ok, cuerpo } = await pedir(`/__mundos/${id}/progreso`);
    if (signal.aborted || enCurso !== id) return;
    if (!ok) {
      parar();
      pintar(
        inicio,
        html`<p class="motivo-del-mundo">${(cuerpo as { error?: string }).error ?? 'sin progreso'}</p>`,
      );
      return;
    }
    const p = cuerpo as Progreso;
    pintar(inicio, renderEspera(p, Date.now()));
    if (p.fase === 'listo') {
      parar();
      enCurso = null;
      a.conMundo(id);
    } else if (p.fase === 'fallido') {
      parar();
      enCurso = null;
    } else {
      // La siguiente pregunta, cuando ha llegado esta respuesta: con un intervalo,
      // un servidor lento acumulaba preguntas en vuelo.
      reloj = setTimeout(() => void seguir(id), CADA_MS);
    }
  };

  inicio.addEventListener(
    'change',
    (ev) => {
      const radio = (ev.target as Element).closest('input[name="tamano"]');
      if (radio !== null) tamaño = Number(radio.getAttribute('value'));
    },
    { signal },
  );
  inicio.addEventListener(
    'click',
    (ev) => {
      const boton = (ev.target as Element).closest<HTMLElement>('[data-mundo]');
      if (boton === null) return;
      switch (boton.dataset.mundo) {
        case 'sin-historia':
          parar();
          a.sinHistoria();
          return;
        case 'cancelar':
          if (enCurso !== null) void pedir(`/__mundos/${enCurso}`, { method: 'DELETE' });
          return;
      }
    },
    { signal },
  );
  inicio.addEventListener(
    'submit',
    (ev) => {
      if ((ev.target as Element).closest('[data-mundo="eleccion"]') === null) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      void (async () => {
        const { ok, cuerpo } = await pedir('/__mundos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ faccion: a.faccion, regionesPorBando: tamaño }),
        });
        if (!ok) {
          pintar(
            inicio,
            html`${renderMundo(tamaño)}<p class="motivo-del-mundo">${(cuerpo as { error?: string }).error ?? 'no se pudo empezar'}</p>`,
          );
          return;
        }
        enCurso = (cuerpo as { id: string }).id;
        void seguir(enCurso);
      })();
    },
    { signal, capture: true },
  );
}
