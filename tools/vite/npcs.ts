import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { CARPETA_DE_LAS_FIGURAS, RUTA_DEL_BANCO } from '../../src/core/gente/banco.js';
import { listaDelDisco } from './http.js';

/**
 * El banco de figuras de NPC (`/__npcs`): el banco crudo de `data/npcs.json` y, por
 * figura, sus ocho `dN/atlas.json` si está pintada o por qué aún no
 * (`tools/npcs/banco.ts`, `loQueSeSirve`). La página lo juzga con la regla del
 * núcleo (`leerBanco`) y registra las pintadas (`render/figuras/gente.ts`).
 *
 * Una lista del disco (`listaDelDisco`), como la de hojas de la arena: se olvida al
 * cambiar el banco, el atlas de una dirección (`dN/atlas.json` o `atlas.webp`, lo
 * único que mira del arte; el taller escribe hojas y crudos en segundo plano mientras
 * se juega, y la figura nueva sale al recargar) o un encargo de NPC de la cola del
 * taller (lo que se dice de una sin pintar: si se pinta o se quedó a medias). El banco no lo importa ningún módulo
 * de la página, así que escribirlo no recarga nada. El lado de disco se carga a
 * demanda (`ssrLoadModule`), por la misma razón que el de la arena.
 */
export function npcs(raiz: string): Plugin {
  let banco = (): Promise<typeof import('../npcs/banco.js')> => import('../npcs/banco.js');
  const arte = resolve(raiz, CARPETA_DE_LAS_FIGURAS);
  const fichero = resolve(raiz, RUTA_DEL_BANCO);
  // La cola del taller: de ella sale si una figura sin pintar se está pintando o se
  // quedó a medias (`fotoDelTaller`), así que un encargo de NPC que se mueve la olvida.
  const cola = resolve(raiz, 'tools/taller/cola');
  const lista = listaDelDisco({
    url: '__npcs',
    vigila: [arte, fichero, cola],
    olvidaCon: (ruta) =>
      ruta === fichero ||
      (ruta.startsWith(arte) && /[/\\]d[0-7][/\\]atlas\.(?:json|webp)$/.test(ruta)) ||
      (ruta.startsWith(cola) && /[/\\]npc-[^/\\]+\.json$/.test(ruta)),
    leer: async () => {
      const leido = (await banco()).loQueSeSirve(raiz);
      return {
        servida: leido,
        avisos: Object.entries(leido.hojas).flatMap(([id, h]) =>
          h.incompleta === null ? [] : [`[npcs] ${id} se sirve sin pintar: ${h.incompleta}`],
        ),
      };
    },
  });
  return {
    name: 'heroes-npcs',
    configureServer(server) {
      banco = async () =>
        (await server.ssrLoadModule(
          resolve(raiz, 'tools/npcs/banco.ts'),
        )) as typeof import('../npcs/banco.js');
      lista.servir(server);
    },
    async generateBundle() {
      await lista.emitir(this);
    },
  };
}
