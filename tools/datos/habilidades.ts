/**
 * Saca el catálogo de habilidades de `NuevaJugabilidad.md` y lo escribe en
 * `data/habilidades.json`.
 *
 * **Con una expresión regular y sin teclear un nombre**, y es la lección más
 * cara de este repositorio: la tabla de experiencia que decía venir de
 * fheroes2 se había escrito de memoria y coincidía en 8 de 39 filas. Un
 * catálogo copiado a mano es el sitio exacto donde se cuela «Antiinfantería
 * montada» con otra tilde, y el guardia de nombres (`data.ts`) compararía
 * contra la errata.
 *
 * `NuevaJugabilidad.md` **no se commitea** (decisión del usuario, 02-10-2026):
 * es el cuaderno de diseño. Por eso el JSON sí se commitea y es contra él contra
 * quien comparan `data.ts` y CI, que no tienen el `.md`. Esto se corre a mano
 * cuando el cuaderno cambie, y el diff del JSON dice qué cambió:
 *
 *   npx tsx tools/datos/habilidades.ts
 *
 * Lanza si la sección no está o sale vacía, en vez de escribir un catálogo
 * vacío que dejaría a `data/experiencia.json` sin un solo nombre válido.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const ORIGEN = `${RAIZ}NuevaJugabilidad.md`;
const DESTINO = `${RAIZ}data/habilidades.json`;

const texto = readFileSync(ORIGEN, 'utf8');

// La sección va de «## Habilidades:» a la siguiente cabecera de nivel 2 o a las
// notas de implementación, que ya no son habilidades.
const seccion = /^## Habilidades:?\s*$([\s\S]*?)(?=^## |^\*Notas para implementarlas\*)/m.exec(
  texto,
);
if (seccion === null) throw new Error(`${ORIGEN}: no encuentro la sección «## Habilidades»`);

interface Habilidad {
  readonly nombre: string;
  readonly categoria: string;
  readonly disparador: 'pasivo' | 'automático' | 'activo' | null;
}

const habilidades: Habilidad[] = [];
let categoria: string | null = null;
for (const linea of (seccion[1] as string).split('\n')) {
  const cabecera = /^### (.+?)\s*$/.exec(linea);
  if (cabecera !== null) {
    categoria = cabecera[1] as string;
    continue;
  }
  // «- Nombre: descripción». El guion es opcional porque «Sin flanqueo» está
  // escrita sin él, y el cuaderno es del usuario: se lee como está.
  const fila = /^\s*(?:-\s+)?([A-ZÁÉÍÓÚÑ][^:\n]{0,40}?):\s+(.*)$/.exec(linea);
  if (fila === null) continue;
  if (categoria === null) {
    throw new Error(`${ORIGEN}: «${fila[1]}» aparece antes de la primera categoría (###)`);
  }
  // Sin tilde también: Salto y Carga dicen «es automatico», y una tilde que
  // falta en el cuaderno no es un disparador distinto.
  const tipo = /\bes (pasivo|autom[aá]tico|activo)\b/i.exec(fila[2] as string);
  const palabra = tipo?.[1]?.toLowerCase().replace('automatico', 'automático');
  habilidades.push({
    nombre: (fila[1] as string).trim(),
    categoria,
    disparador: (palabra ?? null) as Habilidad['disparador'],
  });
}

if (habilidades.length === 0) throw new Error(`${ORIGEN}: la sección de habilidades sale vacía`);
const repetidas = habilidades.map((h) => h.nombre).filter((n, i, todos) => todos.indexOf(n) !== i);
if (repetidas.length > 0) {
  throw new Error(`${ORIGEN}: habilidades repetidas: ${repetidas.join(', ')}`);
}

const json = {
  _comment:
    'GENERADO por tools/datos/habilidades.ts a partir de la sección «Habilidades» de NuevaJugabilidad.md (el cuaderno de diseño del usuario, que no se commitea), con una expresión regular y sin teclear ningún nombre. No se edita a mano: se regenera. disparador = la palabra «Es pasivo/automático/activo» de la descripción, o null si no la dice. Es el catálogo contra el que data.ts comprueba los nombres de data/experiencia.json; las habilidades todavía NO tienen efecto (no hay motor de habilidades).',
  habilidades,
};
writeFileSync(DESTINO, `${JSON.stringify(json, null, 2)}\n`);
console.log(`${habilidades.length} habilidades → ${DESTINO.slice(RAIZ.length)}`);
