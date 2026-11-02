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
import { CARPETA_DE_LAS_FIGURAS, type FiguraDeNpc } from '../../src/core/npcs.js';
import {
  type HojaDeFigura,
  hojasDeLasAcciones,
  NOMBRES_DE_DIRECCION,
} from '../../src/shared/arte.js';
import { prefijoDeLaFigura, quedanReintentos } from '../npcs/en-el-taller.js';
import { type Cola, colaDelTaller, NoEstaEn, YaEnLaCola } from './cola.js';
import { type Encargo, figuraDelGiro } from './encargo.js';
import { ESTILO_DE_FACCION } from './unidades.js';

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
export const carpetaDeNpc = (id: string): string => `${CARPETA_DE_LAS_FIGURAS}/${id}`;

/** Lo que se le dice al pintor de toda figura del banco, además de su descripción. */
const DE_LA_GENTE =
  'Es una persona de la villa, no un soldado en guardia: de pie y tranquila. El maniquí va con las manos vacías; si la descripción le pone algo en las manos (un martillo, un libro, un cayado), que sea pequeño y no cambie la pose. Estilo: ilustración pintada de fantasía medieval oscura, materiales gastados y creíbles, paleta sobria, silueta clara; nada de acabado de juguete, de dibujo animado ni de render 3D.';

const conTalla = (f: FiguraDeNpc): { talla?: number } => (f.talla === 1 ? {} : { talla: f.talla });

/**
 * Lo de todo encargo de una figura: su id (`npc-<id>-<que>`), su descripción con
 * lo de la gente, su salida en su carpeta, el fondo y la cadena.
 */
function encargoDeLaFigura(
  f: FiguraDeNpc,
  que: string,
): Pick<Encargo, 'id' | 'descripcion' | 'salida' | 'fondo' | 'despues'> {
  return {
    id: `${prefijoDeLaFigura(f.id)}${que}`,
    descripcion: `${f.descripcion}\n${DE_LA_GENTE}`,
    salida: `${carpetaDeNpc(f.id)}/${que}`,
    fondo: 'transparente',
    despues: { orden: 'encadenar-npc', npc: f.id },
  };
}

/** El encargo de la identidad: el maniquí en su reposo y el estilo de su facción. */
function encargoDeIdentidad(f: FiguraDeNpc): Encargo {
  return {
    ...encargoDeLaFigura(f, 'identidad'),
    tipo: 'identidad',
    referencias: [
      { ruta: POSE_DE_LA_IDENTIDAD, papel: 'pose' },
      { ruta: ESTILO_DE_FACCION[f.etiquetas.faccion], papel: 'estilo' },
    ],
  };
}

/** El giro: el maniquí en el reposo de cada dirección, con la identidad ya pintada. */
function encargoDeGiro(f: FiguraDeNpc): Encargo {
  return {
    ...encargoDeLaFigura(f, 'giro'),
    tipo: 'giro',
    referencias: [
      { ruta: `${DIR_DEL_MANIQUI_CIVIL}/giro.png`, papel: 'pose' },
      { ruta: `${carpetaDeNpc(f.id)}/identidad.webp`, papel: 'identidad' },
    ],
  };
}

/** Una hoja de una dirección, sobre la profundidad del maniquí civil y con el giro como identidad. */
export function encargoDeHoja(f: FiguraDeNpc, d: number, hoja: HojaDeFigura): Encargo {
  return {
    id: `${prefijoDeLaFigura(f.id)}d${d}-${hoja}`,
    tipo: 'atlas',
    descripcion: [
      f.descripcion,
      figuraDelGiro(d),
      ...(hoja === 'b'
        ? [
            'El ATAQUE de esta hoja es un empujón o un manotazo con las manos vacías: no lleva arma.',
          ]
        : []),
      DE_LA_GENTE,
    ].join('\n'),
    referencias: [
      { ruta: `${DIR_DEL_MANIQUI_CIVIL}/d${d}-${hoja}.profundidad.png`, papel: 'pose-profundidad' },
      { ruta: `${carpetaDeNpc(f.id)}/giro.webp`, papel: 'identidad', figura: d },
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
    hojasDeLasAcciones(f.acciones)
      .filter((h) => !hay(`${dir}/d${d}/hoja-${h}.webp`))
      .map((h) => encargoDeHoja(f, d, h)),
  );
}

/**
 * Encola en `cola` un encargo, o `false` si otro proceso lo acaba de encolar: dos
 * `pnpm npcs trabajar` que rescatan a la vez miran la cola y encolan lo mismo, y al
 * segundo eso no es un fallo (QA del banco de NPC, H7).
 */
async function encolarSiNoEsta(cola: Cola, e: Encargo): Promise<boolean> {
  try {
    await cola.encolar(e);
    return true;
  } catch (err) {
    if (err instanceof YaEnLaCola) return false;
    throw err;
  }
}

/**
 * Encola lo que sigue de una figura (`encargosQueSiguen`) y devuelve los ids
 * encolados. Lo que ya está en la cola —pendiente, en curso, hecho o fallido— no se
 * repite: al encadenar, cada hoja que acaba volvería a pedir las otras siete. Con
 * `repescar`, lo hecho o fallido cuya imagen no está se olvida y se encola otra vez
 * (`pnpm npcs encolar` y `rehacer`): lo pedido en otro clon, o lo que falló. Lo suyo en
 * curso cuyo trabajador murió vuelve antes a la cola (`Cola.devolverHuerfanos`, QA del
 * banco de NPC, H6), y cuenta como encolado.
 */
export async function encolarLoQueSigue(
  f: FiguraDeNpc,
  raiz: string,
  { repescar = false }: { readonly repescar?: boolean } = {},
): Promise<string[]> {
  const cola = colaDelTaller(raiz);
  await cola.preparar();
  const encolados = await cola.devolverHuerfanos((i) => i.startsWith(prefijoDeLaFigura(f.id)));
  // Una vez: lo que se encola aquí son ids distintos, y ninguno estaba.
  const estado = await cola.estado();
  for (const e of encargosQueSiguen(f, raiz)) {
    const vivo = estado.pendiente.includes(e.id) || estado['en-curso'].includes(e.id);
    const cerrado = estado.hecho.includes(e.id) || estado.fallido.includes(e.id);
    if (vivo || (cerrado && !repescar)) continue;
    if (cerrado) await cola.olvidar(e.id);
    if (await encolarSiNoEsta(cola, e)) encolados.push(e.id);
  }
  return encolados;
}

/**
 * Rescata una figura que se quedó a medias (QA del banco de NPC, H2, 22-10-2026). Lo suyo
 * en curso cuyo trabajador murió vuelve a la cola con sus fallos (`Cola.devolverHuerfanos`,
 * H6). Luego, si no tiene nada pendiente ni en curso, encola lo que le falte
 * (`encargosQueSiguen`). Lo
 * fallido se reintenta **llevando la cuenta** (`Cola.reintentar`) mientras le queden
 * reintentos (`quedanReintentos`), y lo que los agotó se queda en `fallido/` y se
 * devuelve en `agotados`: eso ya lo arregla una persona, con `pnpm npcs encolar`. Lo
 * hecho cuya imagen no está se olvida y se pide otra vez, como con `repescar`.
 *
 * Lo llama `pnpm npcs trabajar` al arrancar, para toda figura del banco: así un reinicio,
 * o el trabajador que lanza un mundo nuevo (`lanzarElTaller`), recogen lo que se quedó a
 * medias sin que nadie lo pida. Dos a la vez no chocan (H7): lo que el otro ya encoló,
 * reintentó u olvidó se salta.
 */
export async function rescatar(
  f: FiguraDeNpc,
  raiz: string,
): Promise<{ readonly encolados: readonly string[]; readonly agotados: readonly string[] }> {
  const cola = colaDelTaller(raiz);
  await cola.preparar();
  const suyo = (i: string): boolean => i.startsWith(prefijoDeLaFigura(f.id));
  const devueltos = await cola.devolverHuerfanos(suyo);
  const estado = await cola.estado();
  if ([...estado.pendiente, ...estado['en-curso']].some(suyo))
    return { encolados: devueltos, agotados: [] };
  const encolados: string[] = [];
  const agotados: string[] = [];
  for (const e of encargosQueSiguen(f, raiz)) {
    if (estado.fallido.includes(e.id)) {
      try {
        if (quedanReintentos(await cola.leer('fallido', e.id))) {
          await cola.reintentar(e.id);
          encolados.push(e.id);
        } else agotados.push(e.id);
      } catch (err) {
        if (!(err instanceof NoEstaEn)) throw err; // otro rescate, o su trabajador, lo reintentó
      }
      continue;
    }
    if (estado.hecho.includes(e.id)) await cola.olvidar(e.id);
    if (await encolarSiNoEsta(cola, e)) encolados.push(e.id);
  }
  return { encolados, agotados };
}
