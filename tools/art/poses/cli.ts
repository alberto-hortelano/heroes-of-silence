/**
 * Las hojas de REFERENCIA DE POSE: el maniquí Y Bot renderizado por sprite-forge
 * con la cámara del juego (ortográfica, 25° hacia abajo). Es la primera imagen de
 * todo encargo de atlas: manda en la cámara, la anatomía y el movimiento; la
 * identidad del personaje solo pone el aspecto.
 *
 *   npx tsx tools/art/poses/cli.ts espada-escudo
 *   npx tsx tools/art/poses/cli.ts --todos
 *
 * Escribe `assets/unidades/_poses/<perfil>.png` (7 columnas × 3 filas de 256:
 * reposo, marcha y ataque) y su `.json` con la cámara, los clips y los índices.
 *
 * Rescatado de `tools/art/prepare-*.mjs` de la rama `archivo/gpt-rpg`, que eran
 * tres copias del mismo script. sprite-forge solo publica `frontal_8`, así que
 * se copia a un directorio temporal y se le añade `tactical_25` allí: el
 * servicio instalado no se toca. Sin servicios de pago: es render local.
 *
 * Dónde están sprite-forge y los FBX lo dicen `SPRITE_FORGE_DIR` y
 * `SPRITE_FORGE_ASSETS`; por defecto, los repos hermanos de este checkout.
 */
import { resolve } from 'node:path';
import {
  carpetaDePoses,
  JUEGOS_DE_ARMAS,
  type JuegoDeArmas,
  PERFILES,
  type Perfil,
} from './juegos.js';
import { componerGiro, renderizarOchoDirecciones, renderizarPerfil } from './render.js';

const esScript = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (esScript) {
  const arg = process.argv[2];
  if (arg === '--giro' || arg === '--8d') {
    const juego = process.argv[3] as JuegoDeArmas;
    if (!(juego in JUEGOS_DE_ARMAS)) {
      throw new Error(
        `juego de armas desconocido «${juego}». Hay: ${Object.keys(JUEGOS_DE_ARMAS).join(', ')}`,
      );
    }
    console.log(
      arg === '--giro'
        ? await componerGiro(carpetaDePoses(juego))
        : `→ ${await renderizarOchoDirecciones(juego, process.argv[4])}`,
    );
    process.exit(0);
  }
  const todos = Object.keys(PERFILES) as Perfil[];
  const pedidos = arg === '--todos' ? todos : [arg as Perfil];
  for (const p of pedidos) {
    if (!(p in PERFILES)) {
      throw new Error(`perfil desconocido «${p}». Hay: ${todos.join(', ')}, o --todos`);
    }
    console.log(`→ ${await renderizarPerfil(p)}`);
  }
}
