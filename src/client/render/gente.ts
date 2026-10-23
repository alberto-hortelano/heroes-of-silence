/**
 * El banco de figuras de NPC en la página: lo pide a `/__npcs` (lo sirve `pnpm dev`
 * desde `data/npcs.json` y `assets/npcs/`, y lo emite `vite build`), lo juzga con la
 * regla del núcleo (`leerBanco`) y registra cada figura pintada (`registrarGente`).
 *
 * Lo espera la entrada de la partida antes de cargar el mundo y `main.ts`
 * (`entrada.ts`): un banco roto lanza y la página dice por qué (`arranque.ts`), como
 * un catálogo roto. **Sin respuesta**, la página sigue con el banco vacío y lo dice en
 * la consola: el juego se juega sin arte, y la gente sale con el Y Bot. Un mundo, no:
 * sus personas nombran figuras del banco y se validan contra él, así que sin banco no
 * se juega, y lo dice con este motivo (`GenteCargada.sinBanco`, `mundo/cargar.ts`; H3
 * del QA del banco de NPC, 22-10-2026: culpaba al mundo de nombrar figuras que no
 * existen, con las frases del motor).
 */
import { type BancoPintado, leerBanco, SIN_BANCO } from '@core/npcs.js';
import { registrarGente } from './personajes.js';

/** El banco de la página y, si no se pudo cargar, por qué (`null`: se cargó). */
export interface GenteCargada extends BancoPintado {
  readonly sinBanco: string | null;
}

let cargada: Promise<GenteCargada> | null = null;
let hecha: GenteCargada | null = null;

/**
 * La página sin banco, con su motivo, avisado en la consola: la partida sigue con el Y
 * Bot, y un mundo lo dirá al no poder validarse.
 */
function sinBanco(motivo: string): GenteCargada {
  console.warn(
    `[npcs] sin banco de figuras (${motivo}): la gente de la base sale con el Y Bot, y un mundo (?mundo=) no se puede jugar sin él`,
  );
  return { ...SIN_BANCO, sinBanco: motivo };
}

/** La respuesta de `/__npcs`: el banco crudo y, por figura, sus direcciones o por qué aún no. */
interface RespuestaDelBanco {
  readonly banco: unknown;
  readonly hojas: Readonly<
    Record<
      string,
      { readonly direcciones: readonly unknown[] | null; readonly incompleta: string | null }
    >
  >;
}

async function pedir(): Promise<GenteCargada> {
  let r: Response;
  try {
    r = await fetch('/__npcs');
  } catch (err) {
    return sinBanco(`no responde /__npcs: ${err instanceof Error ? err.message : err}`);
  }
  // El build lo emite como un fichero sin extensión: el tipo que diga el servidor no
  // cuenta, cuenta que sea JSON. Lo que no lo es (una página de «no está») no es banco.
  let respuesta: RespuestaDelBanco | null = null;
  if (r.ok) {
    try {
      respuesta = (await r.json()) as RespuestaDelBanco;
    } catch {
      respuesta = null;
    }
  }
  if (respuesta === null) return sinBanco(`/__npcs responde ${r.status} y no es JSON`);
  const { banco: crudo, hojas } = respuesta;
  const banco = leerBanco(crudo);
  const pintadas = new Set<string>();
  for (const f of banco.figuras) {
    const h = hojas?.[f.id];
    if (!h?.direcciones) continue;
    registrarGente(f.id, h.direcciones);
    pintadas.add(f.id);
  }
  return { banco, pintadas, sinBanco: null };
}

/** Pide y registra el banco una vez; las siguientes llamadas esperan a la misma. */
export function cargarLaGente(): Promise<GenteCargada> {
  cargada ??= pedir().then((b) => {
    hecha = b;
    return b;
  });
  return cargada;
}

/** El banco ya cargado (`cargarLaGente`), o lanza: quien lo lee va después de esperarlo. */
export function genteCargada(): GenteCargada {
  if (hecha === null)
    throw new Error('el banco de figuras de NPC aún no se ha cargado (cargarLaGente)');
  return hecha;
}
