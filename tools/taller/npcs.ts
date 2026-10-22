/**
 * Los encargos de una figura del banco de NPC (`data/npcs.json`), **derivados del
 * disco**: lo que le falta en `assets/npcs/<id>/` es lo que se encarga.
 *
 * La definición vive en datos y no en una lista de TypeScript como `UNIDADES`
 * (decisión del usuario tras la crítica): el motor de narrativa pide figuras en su
 * `historia.json` y la semilla entra por la misma puerta (`pnpm npcs pedir`). Por eso
 * nada de aquí mira `unidades.ts` salvo el estilo de cada facción, y la carpeta es
 * otra: lo de `assets/unidades/` lo lista la arena como tropa, y una figura de gente
 * no se recluta ni pelea.
 *
 * **Se encadena sola** (decisión del usuario, 22-10-2026, «se encadena sola»): la
 * identidad, luego el giro sobre ella y luego las hojas de las ocho direcciones sobre
 * el giro, sin revisión humana. Cada encargo lleva `despues: encadenar-npc` y el
 * trabajador, al escribirlo, encola lo que sigue (`encolarLoQueSigue`). Una figura
 * mala se rehace con `pnpm npcs rehacer <id>`.
 *
 * Vive aparte de `trabajador.ts` porque aquel arranca la cola al importarse.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AccionesDeNpc, FiguraDeNpc } from '../../src/core/npcs.js';
import { type HojaDeFigura, NOMBRES_DE_DIRECCION } from '../../src/shared/arte.js';
import { Cola } from './cola.js';
import type { Encargo } from './encargo.js';
import { ESTILO_DE_FACCION } from './unidades.js';

/** Donde vive el arte del banco: fuera de `assets/unidades/`, que es la tropa de la arena. */
export const DIR_NPCS = 'assets/npcs';
/**
 * El maniquí de la gente: el juego `civil` del Y Bot (sin armas, reposo y marcha de
 * ambiente) **con su profundidad**, renderizado una vez con `pnpm taller maniqui
 * --civil`. Aparte de `_poses/civil-8d/`, que es el Y Bot con que el cliente pinta a
 * la gente sin figura y no se mueve.
 */
export const DIR_DEL_MANIQUI_CIVIL = 'assets/unidades/_poses/gente/civil-8d';
/** La pose de la identidad: el primer reposo de la dirección SE del maniquí civil, solo. */
export const POSE_DE_LA_IDENTIDAD = `${DIR_DEL_MANIQUI_CIVIL}/identidad.png`;

/** La carpeta de una figura del banco, relativa a la raíz. */
export const carpetaDeNpc = (id: string): string => `${DIR_NPCS}/${id}`;

/** La cola del taller de una raíz (la del repo, o una temporal en los tests). */
export function colaDelTaller(raiz: string): Cola {
  return new Cola(join(raiz, 'tools/taller/cola'));
}

/** Los encargos de NPC llevan este prefijo: `pnpm npcs trabajar` toma solo esos. */
export const PREFIJO_DE_NPC = 'npc-';
export const esEncargoDeNpc = (id: string): boolean => id.startsWith(PREFIJO_DE_NPC);

/** Las hojas de cada dirección según sus acciones: la A siempre; la B, con `todas`. */
export function letrasDeNpc(acciones: AccionesDeNpc): readonly HojaDeFigura[] {
  return acciones === 'todas' ? ['a', 'b'] : ['a'];
}

/**
 * Con qué se deriva el atlas de una figura del banco: sin suelta (no dispara) ni
 * ritmo propio, y con solo la hoja A, de tres filas y sin cadáver (`soloReposo`).
 */
export function derivacionDeNpc(f: Pick<FiguraDeNpc, 'acciones'>): {
  readonly soloReposo: boolean;
} {
  return { soloReposo: f.acciones === 'reposo-y-marcha' };
}

/** Lo que se le dice al pintor de toda figura del banco, además de su descripción. */
const DE_LA_GENTE =
  'Es una persona de la villa, no un soldado en guardia: de pie y tranquila. El maniquí va con las manos vacías; si la descripción le pone algo en las manos (un martillo, un libro, un cayado), que sea pequeño y no cambie la pose. Estilo: ilustración pintada de fantasía medieval oscura, materiales gastados y creíbles, paleta sobria, silueta clara; nada de acabado de juguete, de dibujo animado ni de render 3D.';

const conTalla = (f: FiguraDeNpc): { talla?: number } => (f.talla === 1 ? {} : { talla: f.talla });

/** El encargo de la identidad: el maniquí en su reposo y el estilo de su facción. */
function encargoDeIdentidad(f: FiguraDeNpc): Encargo {
  return {
    id: `${PREFIJO_DE_NPC}${f.id}-identidad`,
    tipo: 'identidad',
    descripcion: `${f.descripcion}\n${DE_LA_GENTE}`,
    referencias: [
      { ruta: POSE_DE_LA_IDENTIDAD, papel: 'pose' },
      { ruta: ESTILO_DE_FACCION[f.etiquetas.faccion], papel: 'estilo' },
    ],
    salida: `${carpetaDeNpc(f.id)}/identidad`,
    fondo: 'transparente',
    despues: { orden: 'encadenar-npc', npc: f.id },
  };
}

/** El giro: el maniquí en el reposo de cada dirección, con la identidad ya pintada. */
function encargoDeGiro(f: FiguraDeNpc): Encargo {
  return {
    id: `${PREFIJO_DE_NPC}${f.id}-giro`,
    tipo: 'giro',
    descripcion: `${f.descripcion}\n${DE_LA_GENTE}`,
    referencias: [
      { ruta: `${DIR_DEL_MANIQUI_CIVIL}/giro.png`, papel: 'pose' },
      { ruta: `${carpetaDeNpc(f.id)}/identidad.webp`, papel: 'identidad' },
    ],
    salida: `${carpetaDeNpc(f.id)}/giro`,
    fondo: 'transparente',
    despues: { orden: 'encadenar-npc', npc: f.id },
  };
}

/** Una hoja de una dirección, sobre la profundidad del maniquí civil y con el giro como identidad. */
function encargoDeHoja(f: FiguraDeNpc, d: number, hoja: HojaDeFigura): Encargo {
  return {
    id: `${PREFIJO_DE_NPC}${f.id}-d${d}-${hoja}`,
    tipo: 'atlas',
    descripcion: [
      f.descripcion,
      `En la lámina de giro (imagen 2), la figura ${d + 1} en orden de lectura es la que mira hacia «${NOMBRES_DE_DIRECCION[d]}», como esta hoja: así se ve el personaje desde este lado.`,
      ...(hoja === 'b'
        ? [
            'El ATAQUE de esta hoja es un empujón o un manotazo con las manos vacías: no lleva arma.',
          ]
        : []),
      DE_LA_GENTE,
    ].join('\n'),
    referencias: [
      { ruta: `${DIR_DEL_MANIQUI_CIVIL}/d${d}-${hoja}.profundidad.png`, papel: 'pose-profundidad' },
      { ruta: `${carpetaDeNpc(f.id)}/giro.webp`, papel: 'identidad' },
    ],
    salida: `${carpetaDeNpc(f.id)}/d${d}/hoja-${hoja}`,
    fondo: 'transparente',
    celda: 384,
    ...conTalla(f),
    ocho: { direccion: d, hoja },
    despues: { orden: 'encadenar-npc', npc: f.id },
  };
}

/**
 * Lo que toca encargar de una figura según lo que ya hay en disco (`raiz`): sin
 * identidad, la identidad; con ella y sin giro, el giro; con el giro, la hoja de
 * cada dirección que falte (la A, y la B con `todas`). Vacío: está entera.
 */
export function encargosQueSiguen(f: FiguraDeNpc, raiz: string): Encargo[] {
  const hay = (ruta: string): boolean => existsSync(join(raiz, ruta));
  const dir = carpetaDeNpc(f.id);
  if (!hay(`${dir}/identidad.webp`)) return [encargoDeIdentidad(f)];
  if (!hay(`${dir}/giro.webp`)) return [encargoDeGiro(f)];
  return NOMBRES_DE_DIRECCION.flatMap((_, d) =>
    letrasDeNpc(f.acciones)
      .filter((h) => !hay(`${dir}/d${d}/hoja-${h}.webp`))
      .map((h) => encargoDeHoja(f, d, h)),
  );
}

/**
 * Encola lo que sigue de una figura (`encargosQueSiguen`) y devuelve los ids
 * encolados. Lo que ya está en la cola —pendiente, en curso, hecho o fallido— no se
 * repite: al encadenar, cada hoja que acaba volvería a pedir las otras siete. Con
 * `repescar`, lo hecho o fallido cuya imagen no está se olvida y se encola otra vez
 * (`pnpm npcs encolar` y `rehacer`): lo pedido en otro clon, o lo que falló.
 */
export async function encolarLoQueSigue(
  f: FiguraDeNpc,
  raiz: string,
  { repescar = false }: { readonly repescar?: boolean } = {},
): Promise<string[]> {
  const cola = colaDelTaller(raiz);
  await cola.preparar();
  const encolados: string[] = [];
  for (const e of encargosQueSiguen(f, raiz)) {
    const estado = await cola.estado();
    const vivo = estado.pendiente.includes(e.id) || estado['en-curso'].includes(e.id);
    const cerrado = estado.hecho.includes(e.id) || estado.fallido.includes(e.id);
    if (vivo || (cerrado && !repescar)) continue;
    if (cerrado) await cola.olvidar(e.id);
    encolados.push((await cola.encolar(e)).id);
  }
  return encolados;
}
