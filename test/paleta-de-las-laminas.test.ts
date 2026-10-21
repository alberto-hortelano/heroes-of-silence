/**
 * La paleta de cada tema es la de su lámina (13-10-2026): cada ficha que
 * `tools/taller/temas/paleta.ts` mide en `assets/art/temas/<tema>.png` está en
 * `temas.css` con ese color, a ΔE OKLab ≤ 0,03 (una distancia que no se ve al
 * lado). Si alguien retoca un color medido a ojo, o cambia una muestra sin copiar
 * lo que sale, esto sale rojo con la ficha, lo de la hoja y lo de la lámina.
 *
 * Mide con sharp sobre las cinco láminas (1315×1196), las cinco a la vez: unos
 * 0,12 s (eran 1,1 s antes de medir sobre el `Buffer`, 13-10-2026).
 */
import { FACTION_IDS } from '@core/types.js';
import { describe, expect, it } from 'vitest';
import { deltaE, type FichaMedida, medirPaleta } from '../tools/taller/temas/paleta.js';
import { resuelta, temas } from './hojas-de-estilo.js';

const TOLERANCIA = 0.03;

describe('la paleta de los temas, medida de sus láminas', () => {
  it('cada ficha medida está en temas.css con el color de su lámina', async () => {
    const { bloques } = temas();
    const lejos: string[] = [];
    // Las cinco a la vez: sharp lee las láminas en paralelo.
    const paletas = await Promise.all(FACTION_IDS.map((t) => medirPaleta(t)));
    for (const [i, tema] of FACTION_IDS.entries()) {
      const bloque = bloques.get(tema);
      if (bloque === undefined) throw new Error(`temas.css no tiene el tema ${tema}`);
      const { fichas } = paletas[i] as Awaited<ReturnType<typeof medirPaleta>>;
      for (const [ficha, medida] of Object.entries(fichas) as [FichaMedida, string][]) {
        const escrita = resuelta(bloque, ficha);
        const d = deltaE(escrita, medida);
        if (d > TOLERANCIA)
          lejos.push(
            `${tema} ${ficha}: temas.css ${escrita}, lámina ${medida} (ΔE ${d.toFixed(3)})`,
          );
      }
    }
    expect(lejos).toEqual([]);
  });
});
