/**
 * El banco de figuras de NPC en una prueba: una figura que vale y una raíz de
 * repo temporal con su `data/npcs.json`. (De `test/helpers.ts`, fase T de la
 * reorganización, 06-11-2026.)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type FiguraDeNpc, RUTA_DEL_BANCO } from '../src/core/npcs.js';
import { carpetaTemporal } from './comun.js';

/**
 * Una figura del banco de NPC que vale: para romperla campo a campo, pedirla o
 * pintarla en una raíz temporal (`raizDeNpcs`).
 */
export const FIGURA_DE_PRUEBA: FiguraDeNpc = {
  id: 'vecino-de-prueba',
  descripcion: 'Un vecino de prueba: camisa de lino, chaleco de lana parda, calzas y zuecos.',
  etiquetas: {
    oficio: 'campesino',
    sexo: 'hombre',
    edad: 'adulto',
    especie: 'humano',
    faccion: 'templarios',
    clase: 'baja',
  },
  talla: 1,
  acciones: 'reposo-y-marcha',
  pedidaPor: 'semilla',
};

/**
 * Una raíz de repo temporal con su `data/npcs.json` de `figuras` (y nada más: ni
 * arte, ni cola, ni mundos), que se borra al acabar el test que la pide.
 */
export function raizDeNpcs(figuras: readonly FiguraDeNpc[]): string {
  const dir = carpetaTemporal('npcs-');
  mkdirSync(join(dir, 'data'), { recursive: true });
  writeFileSync(join(dir, RUTA_DEL_BANCO), JSON.stringify({ _comment: 'de prueba', figuras }));
  return dir;
}
