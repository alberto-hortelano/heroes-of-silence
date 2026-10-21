/**
 * Saca los tipos de héroe de cada facción de `NuevaJugabilidad.md` y los escribe
 * en `data/tipos-de-heroe.json`.
 *
 * Hermano de `habilidades.ts`, y por la misma lección: **con una expresión
 * regular y sin teclear un nombre**. Lo único escrito a mano es qué sección del
 * cuaderno es de qué facción del motor (`SECCIONES`), porque el cuaderno habla
 * de «No muertos» y el motor de `no-muertos`.
 *
 * Las cinco facciones del juego (19-10-2026, #127): desde que sustituyeron a
 * caballeros y nigromantes, Imperio, Elfos y Orkos se extraen como las otras dos.
 *
 * `NuevaJugabilidad.md` **no se commitea**; el JSON sí, y es contra él contra
 * quien comprueba `data.ts`. Se corre a mano cuando el cuaderno cambie:
 *
 *   npx tsx tools/datos/tipos-de-heroe.ts [ruta de NuevaJugabilidad.md]
 *
 * Lanza si una sección o su lista de héroes no está o sale vacía, en vez de
 * escribir un catálogo que dejaría a una facción sin héroes que ofrecer. Dos
 * tipos de la misma facción con el mismo id no se miran aquí: los rechaza
 * `validarTiposDeHeroe` al cargar el JSON, que es la comprobación que corre en
 * cada test y no solo cuando alguien regenera el fichero.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TipoDeHeroe } from '../../src/core/data.js';
import { type FactionId, NOMBRE_DE_FACCION } from '../../src/core/types.js';
import { seccionDelCuaderno } from './cuaderno.js';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
// El cuaderno vive en la copia principal del repo, sin commitear: desde un
// worktree se le pasa la ruta (`npx tsx tools/datos/tipos-de-heroe.ts <ruta>`).
const ORIGEN = process.argv[2] ?? `${RAIZ}NuevaJugabilidad.md`;
const DESTINO = `${RAIZ}data/tipos-de-heroe.json`;

/** La sección del cuaderno de cada facción del motor. Lo único tecleado. */
/** El título de la sección de cada facción en el cuaderno: su nombre en el juego. */
const SECCIONES: Readonly<Record<FactionId, string>> = NOMBRE_DE_FACCION;

const texto = readFileSync(ORIGEN, 'utf8');

/**
 * El id de un tipo: lo que va antes del primer paréntesis, sin tildes, en
 * minúsculas y con guion bajo, como los ids de criatura (`bone_dragon`).
 * «Monje (Abad)» → `monje`; «Caballero de la muerte» → `caballero_de_la_muerte`.
 */
function idDe(nombre: string): string {
  return (nombre.split('(')[0] as string)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function tiposDeLaSeccion(titulo: string): TipoDeHeroe[] {
  // De «### Templarios:» a la siguiente cabecera y, dentro, de «- Heroes:» a
  // «- Tropas:».
  const seccion = seccionDelCuaderno(texto, titulo, ORIGEN);
  const heroes = /^- Heroes:[ \t]*$([\s\S]*?)(?=^- Tropas:)/m.exec(seccion);
  if (heroes === null) {
    throw new Error(
      `${ORIGEN}: la sección «${titulo}» no tiene «- Heroes:» seguida de «- Tropas:»`,
    );
  }

  const tipos: TipoDeHeroe[] = [];
  for (const linea of (heroes[1] as string).split('\n')) {
    // «* Nombre: descripción» o «+ Nombre: descripción»: el cuaderno usa las dos
    // viñetas según la facción, y se lee como está.
    const fila = /^\s*[*+]\s+([^:\n]+?):\s+(.*\S)\s*$/.exec(linea);
    if (fila === null) continue;
    const nombre = (fila[1] as string).replace(/\s*\(nuevo\)\s*/i, '').trim();
    tipos.push({ id: idDe(nombre), nombre, descripcion: fila[2] as string });
  }
  if (tipos.length === 0) throw new Error(`${ORIGEN}: la sección «${titulo}» sale sin héroes`);
  return tipos;
}

const tipos = Object.fromEntries(
  Object.entries(SECCIONES).map(([faccion, titulo]) => [faccion, tiposDeLaSeccion(titulo)]),
);

const json = {
  _comment:
    'GENERADO por tools/datos/tipos-de-heroe.ts a partir de las secciones «Templarios», «No muertos», «Imperio», «Elfos» y «Orkos» de NuevaJugabilidad.md (el cuaderno de diseño del usuario, que no se commitea), con una expresión regular y sin teclear ningún nombre. No se edita a mano: se regenera. id = lo que va antes del primer paréntesis, sin tildes y con guion bajo; nombre = sin «(nuevo)»; el primero de cada facción es el tipo por defecto: el del héroe inicial que nadie eligió (la partida rápida, la IA) y el del contratado. Los tipos todavía NO tienen efecto en las reglas (no hay motor de habilidades): se guardan en el héroe, se ven, se serializan y dan su figura (data/figuras-de-heroe.json).',
  tipos,
};
writeFileSync(DESTINO, `${JSON.stringify(json, null, 2)}\n`);
const cuenta = Object.entries(tipos)
  .map(([f, l]) => `${f} ${l.length}`)
  .join(', ');
console.log(`tipos de héroe (${cuenta}) → ${DESTINO.slice(RAIZ.length)}`);
