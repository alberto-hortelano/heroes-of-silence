/**
 * Saca el rasgo de una línea de cada facción de `NuevaJugabilidad.md` y lo escribe
 * en `data/facciones.json`: lo que enseña la elección de facción del menú.
 *
 * Hermano de `tipos-de-heroe.ts`, y por la misma lección: **una cita se extrae, no
 * se teclea**. El rasgo es la primera línea con texto bajo `### <Facción>:`, tal
 * como la escribió el usuario (con sus erratas: corregirla sería teclearla).
 *
 * `NuevaJugabilidad.md` **no se commitea**; el JSON sí, y es contra él contra
 * quien comprueba `data.ts` al cargar. Se corre a mano cuando el cuaderno cambie:
 *
 *   npx tsx tools/datos/facciones.ts [ruta de NuevaJugabilidad.md]
 *
 * Lanza si una sección no está o no tiene texto, en vez de escribir una facción
 * sin rasgo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FACTION_IDS, NOMBRE_DE_FACCION } from '../../src/core/types.js';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
// El cuaderno vive en la copia principal del repo, sin commitear: desde un
// worktree se le pasa la ruta (`npx tsx tools/datos/facciones.ts <ruta>`).
const ORIGEN = process.argv[2] ?? `${RAIZ}NuevaJugabilidad.md`;
const DESTINO = `${RAIZ}data/facciones.json`;

const texto = readFileSync(ORIGEN, 'utf8');

function rasgoDeLaSeccion(titulo: string): string {
  const escapado = titulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seccion = new RegExp(`^### ${escapado}:?[ \\t]*$([\\s\\S]*?)(?=^##)`, 'm').exec(texto);
  if (seccion === null) throw new Error(`${ORIGEN}: no encuentro la sección «### ${titulo}»`);
  const linea = (seccion[1] as string)
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '');
  if (linea === undefined) throw new Error(`${ORIGEN}: la sección «${titulo}» no tiene texto`);
  return linea;
}

const rasgos = Object.fromEntries(
  FACTION_IDS.map((f) => [f, rasgoDeLaSeccion(NOMBRE_DE_FACCION[f])]),
);

const json = {
  _comment:
    'GENERADO por tools/datos/facciones.ts a partir de las secciones «Templarios», «No muertos», «Imperio», «Elfos» y «Orkos» de NuevaJugabilidad.md (el cuaderno de diseño del usuario, que no se commitea): el rasgo de cada facción es la primera línea con texto bajo su título, tal cual, con una expresión regular y sin teclear nada. No se edita a mano: se regenera. Lo enseña la elección de facción del menú.',
  rasgos,
};
writeFileSync(DESTINO, `${JSON.stringify(json, null, 2)}\n`);
console.log(`rasgos de ${FACTION_IDS.length} facciones → ${DESTINO.slice(RAIZ.length)}`);
