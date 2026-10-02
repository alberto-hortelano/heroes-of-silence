/**
 * Saca los tipos de héroe de cada facción de `NuevaJugabilidad.md` y los escribe
 * en `data/tipos-de-heroe.json`.
 *
 * Hermano de `habilidades.ts`, y por la misma lección: **con una expresión
 * regular y sin teclear un nombre**. Lo único escrito a mano es qué sección del
 * cuaderno es de qué facción del motor (`SECCIONES`), porque el cuaderno habla
 * de «Templarios» y el motor de `knight`, y esa traducción no está en ninguna
 * parte que se pueda leer.
 *
 * Solo las dos facciones que están en juego. Imperio, Elfos y Orkos tienen sus
 * héroes escritos en el cuaderno y se quedan sin extraer hasta que existan: un
 * tipo de una facción que no se puede jugar es un dato que nadie lee.
 *
 * `NuevaJugabilidad.md` **no se commitea**; el JSON sí, y es contra él contra
 * quien comprueba `data.ts`. Se corre a mano cuando el cuaderno cambie:
 *
 *   npx tsx tools/datos/tipos-de-heroe.ts
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

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const ORIGEN = `${RAIZ}NuevaJugabilidad.md`;
const DESTINO = `${RAIZ}data/tipos-de-heroe.json`;

/** La sección del cuaderno de cada facción del motor. Lo único tecleado. */
const SECCIONES = { knight: 'Templarios', necromancer: 'No muertos' } as const;

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
  // De «### Templarios:» a la siguiente cabecera de nivel 3 o 2. El título se
  // escapa por si algún día lleva un carácter de expresión regular.
  const escapado = titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seccion = new RegExp(`^### ${escapado}:?[ \\t]*$([\\s\\S]*?)(?=^##)`, 'm').exec(texto);
  if (seccion === null) throw new Error(`${ORIGEN}: no encuentro la sección «### ${titulo}»`);
  // Dentro, de «- Heroes:» a «- Tropas:».
  const heroes = /^- Heroes:[ \t]*$([\s\S]*?)(?=^- Tropas:)/m.exec(seccion[1] as string);
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
    'GENERADO por tools/datos/tipos-de-heroe.ts a partir de las secciones «Templarios» (knight) y «No muertos» (necromancer) de NuevaJugabilidad.md (el cuaderno de diseño del usuario, que no se commitea), con una expresión regular y sin teclear ningún nombre. No se edita a mano: se regenera. id = lo que va antes del primer paréntesis, sin tildes y con guion bajo; nombre = sin «(nuevo)»; el primero de cada facción es el tipo por defecto del héroe inicial y del contratado. Los tipos todavía NO tienen efecto (no hay motor de habilidades): se guardan en el héroe, se ven y se serializan.',
  tipos,
};
writeFileSync(DESTINO, `${JSON.stringify(json, null, 2)}\n`);
const cuenta = Object.entries(tipos)
  .map(([f, l]) => `${f} ${l.length}`)
  .join(', ');
console.log(`tipos de héroe (${cuenta}) → ${DESTINO.slice(RAIZ.length)}`);
