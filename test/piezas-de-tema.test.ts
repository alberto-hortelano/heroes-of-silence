/**
 * Las piezas en imagen de los temas (`tools/taller/temas/piezas.ts`): la hoja
 * generada es la del disco y solo lleva fichas, y `forma.css` lee las de cada
 * pieza. Los encargos de Codex se quedaron en la rama de los temas (19-10-2026,
 * backlog): de ellos queda que el trozo de la lámina de cada pieza cae dentro.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { FACTION_IDS } from '../src/core/types.js';
import {
  corteDeMarco,
  cssDePiezas,
  DEFINICIONES,
  GRIS_DE_LA_MEZCLA,
  HOJA_DE_PIEZAS,
  laminaDe,
  MARCOS,
  PIEZAS,
  type PiezaEnDisco,
  POR_TEMA,
  piezasDe,
  piezasEnDisco,
  piezasMedidasEnDisco,
  salidaDe,
  sliceDe,
  sobrantesEnDisco,
} from '../tools/taller/temas/piezas.js';
import { bloquesCss, COLOR, leerHoja, temas } from './hojas-de-estilo.js';

const RAIZ = join(import.meta.dirname, '..');

describe('las piezas en imagen de los temas', () => {
  it('la hoja generada es la del disco: la imagen de cada pieza presente, ninguna de la que falta, y el corte medido de cada marco', async () => {
    // Un `url()` a una pieza que no está da un 404 (rojo en `pnpm capturas`) y un
    // hueco en la pantalla; una pieza en disco sin su ficha no se ve nunca. Roto a
    // mano: una ficha de `marco-mapa` de los elfos escrita en la hoja sin la
    // imagen sale rojo, y una imagen puesta sin rehacer la hoja, también. El corte
    // de un marco se mide en su imagen: uno cambiado a mano en la hoja (el 65 de
    // los templarios a 64) sale rojo.
    expect(readFileSync(join(RAIZ, HOJA_DE_PIEZAS), 'utf8')).toBe(
      cssDePiezas(await piezasMedidasEnDisco()),
    );
    expect(sobrantesEnDisco()).toEqual([]);
  });

  it('el corte de un marco es su banda: la mide en la imagen y lanza si no la encuentra', async () => {
    // Codex no respetó el 12,5 % pedido (del 4,7 al 16,8 %): cortado como se
    // pidió, el hueco gris entraba en la moldura. Un marco hecho con sharp, con
    // una banda clara de 40 px arriba, 30 a los lados y 56 abajo sobre un hueco
    // oscuro con ruido, da esas bandas; uno liso, no tiene banda.
    const dir = mkdtempSync(join(tmpdir(), 'corte-'));
    try {
      const lado = 512;
      const datos = Buffer.alloc(lado * lado * 3);
      for (let y = 0; y < lado; y++)
        for (let x = 0; x < lado; x++) {
          const banda = y < 40 || y >= lado - 56 || x < 30 || x >= lado - 30;
          // Ruido de ±6 en el hueco: no es la banda.
          const v = banda ? 180 + ((x * 7 + y * 13) % 40) : 30 + ((x * 31 + y * 17) % 12) - 6;
          datos.fill(v, (y * lado + x) * 3, (y * lado + x) * 3 + 3);
        }
      const conBanda = join(dir, 'marco.png');
      await sharp(datos, { raw: { width: lado, height: lado, channels: 3 } }).toFile(conBanda);
      expect(await corteDeMarco(conBanda)).toEqual({
        arriba: 40,
        derecha: 30,
        abajo: 56,
        izquierda: 30,
      });
      const liso = join(dir, 'liso.png');
      await sharp({
        create: { width: lado, height: lado, channels: 3, background: '#333' },
      }).toFile(liso);
      await expect(corteDeMarco(liso)).rejects.toThrow(/fuera de lo que es un marco/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // Los de disco, todos entre el 2 y el 30 % (si no, la hoja no se habría escrito).
    for (const { tema, pieza } of piezasEnDisco().filter((x) =>
      (MARCOS as readonly string[]).includes(x.pieza),
    )) {
      const c = await corteDeMarco(join(RAIZ, `${salidaDe(tema, pieza)}.webp`));
      for (const v of Object.values(c)) expect(v, `${tema}/${pieza}`).toBeGreaterThan(0);
    }
  });

  it('cada textura de tema está en gris medio: mezclada en soft-light no mueve el color de su ficha', async () => {
    // Con las texturas del color de su material, el margen del imperio pasó de
    // luz 29 a 61 (pardo) y el de los no muertos de 19 a 6. Roto a mano: la
    // textura del marco del imperio de antes (media 214) sale rojo.
    const texturas = piezasEnDisco().filter((x) => x.pieza.startsWith('textura-'));
    for (const { tema, pieza } of texturas) {
      const { channels } = await sharp(join(RAIZ, `${salidaDe(tema, pieza)}.webp`)).stats();
      const [r, g, b] = channels;
      expect(Math.abs((r?.mean ?? 0) - GRIS_DE_LA_MEZCLA), `${tema}/${pieza}`).toBeLessThan(3);
      // En gris: el color es de la ficha.
      expect(
        Math.abs((r?.mean ?? 0) - (g?.mean ?? 0)) + Math.abs((g?.mean ?? 0) - (b?.mean ?? 0)),
        `${tema}/${pieza}`,
      ).toBeLessThan(1);
    }
  });

  it('forma.css lee la imagen de cada pieza y las medidas de la tabla, y ninguna que no exista', () => {
    // Sin la regla de `forma.css` la pieza no tendría sitio, y una ficha mal
    // escrita (`var(--pieza-marco-mpa, none)`) no daría error: pintaría el
    // respaldo para siempre. Roto a mano: las dos cosas salen rojo.
    const css = leerHoja('forma.css');
    const leidas = new Set([...css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]));
    for (const p of PIEZAS) {
      const d = DEFINICIONES[p];
      expect(leidas.has(`--pieza-${p}`), p).toBe(true);
      if (d.corte !== undefined) expect(leidas.has(`--corte-${p}`), p).toBe(true);
      if (d.remates !== undefined) expect(leidas.has(`--remates-${p}`), p).toBe(true);
    }
    // Las propias de cada regla acaban en `-con-pieza` (`--corte-con-pieza`).
    const ajenas = [...leidas].filter((f) => {
      const m = /^--(?:con-pieza|pieza|corte|remates)-(.+)$/.exec(f as string);
      if (/-con-pieza$/.test(f as string)) return false;
      return m !== null && !(PIEZAS as readonly string[]).includes(m[1] as string);
    });
    expect(ajenas).toEqual([]);
  });

  it('con todas las piezas, la hoja solo lleva fichas: medidas, imágenes de la carpeta pública y marcas', () => {
    // Lo que se generará mañana, pieza a pieza: ni una regla (son de
    // `forma.css`) ni un color escrito.
    const corte = { arriba: 60, derecha: 64, abajo: 80, izquierda: 64 };
    const todas: PiezaEnDisco[] = FACTION_IDS.flatMap((tema) =>
      piezasDe(tema).map((pieza) =>
        (MARCOS as readonly string[]).includes(pieza)
          ? { tema, pieza, corte }
          : pieza === 'remate'
            ? { tema, pieza, proporcion: 3 }
            : { tema, pieza },
      ),
    );
    const bloques = bloquesCss(cssDePiezas(todas));
    expect(bloques.map((b) => b.selector)).toEqual([
      ':root[data-tema]',
      ...FACTION_IDS.map((t) => `:root[data-tema='${t}']`),
    ]);
    for (const { declaraciones } of bloques)
      for (const { propiedad, valor } of declaraciones) {
        expect(propiedad, valor).toMatch(/^--/);
        expect(COLOR.test(valor), `${propiedad}: ${valor}`).toBe(false);
      }
    for (const [i, tema] of FACTION_IDS.entries()) {
      const suyas = new Map(bloques[i + 1]?.declaraciones.map((d) => [d.propiedad, d.valor]));
      for (const pieza of piezasDe(tema)) {
        expect(suyas.get(`--pieza-${pieza}`)).toBe(`url('/temas/${tema}/${pieza}.webp')`);
        expect(suyas.get(`--con-pieza-${pieza}`)).toBe('');
      }
      // Cada marco, su corte medido y cada lado frente a los costados; el remate y
      // la cartela, su alto en la lámina (el rectángulo de `POR_TEMA`).
      for (const m of MARCOS) {
        expect(suyas.get(`--corte-${m}`)).toBe('60 64 80 64');
        expect(suyas.get(`--banda-${m}-arriba`)).toBe('0.938');
        expect(suyas.get(`--banda-${m}-abajo`)).toBe('1.25');
      }
      expect(suyas.get('--proporcion-remate')).toBe('3');
      expect(Number(suyas.get('--remate-en-la-lamina'))).toBeGreaterThan(0);
      const cartela = piezasDe(tema).includes('cartela');
      expect(suyas.has('--cartela-en-la-lamina')).toBe(cartela);
      expect(suyas.size).toBe(
        2 * piezasDe(tema).length + 5 * MARCOS.length + 2 + (cartela ? 1 : 0),
      );
    }
    // El corte de las tiras va en la hoja, que lo saca de la tabla: el mismo que se
    // le pide a Codex; el de los marcos, no (es el medido, arriba).
    const medidas = new Map(bloques[0]?.declaraciones.map((d) => [d.propiedad, d.valor]));
    expect(medidas.has('--corte-marco-mapa')).toBe(false);
    expect(medidas.get('--corte-barra-seccion')).toBe('0% 14% fill');
    // Un marco sin su corte medido no se escribe.
    expect(() => cssDePiezas([{ tema: 'elfos', pieza: 'marco-mapa' }])).toThrow(/corte medido/);
    expect(() =>
      sliceDe({ arriba: 0, derecha: 0.14, abajo: 0.1, izquierda: 0.14, relleno: true }),
    ).toThrow(/simétrico/);
  });

  it('la cartela es de los temas con lema, como en las láminas', () => {
    // Elfos y orkos no llevan cartela (decisión del usuario): ni respaldo, que es
    // el `::before` de `content: var(--lema)`, ni encargo.
    const { bloques } = temas();
    for (const tema of FACTION_IDS) {
      const lema = bloques.get(tema)?.get('--lema');
      expect(lema, tema).toBeDefined();
      expect(piezasDe(tema).includes('cartela'), tema).toBe(lema !== 'none');
    }
  });

  it('el trozo de la lámina de cada pieza cae dentro de su lámina', async () => {
    // Viajaría recortado al vuelo con su encargo: uno que se sale lanzaría el
    // día que se encargue, con Codex esperando.
    for (const tema of FACTION_IDS) {
      const { width = 0, height = 0 } = await sharp(join(RAIZ, laminaDe(tema))).metadata();
      for (const pieza of piezasDe(tema)) {
        const r = POR_TEMA[tema][pieza]?.en;
        expect(r, `${tema} ${pieza}`).toBeDefined();
        if (r === undefined) continue;
        expect(
          r.x + r.w <= width && r.y + r.h <= height,
          `${tema} ${pieza} en ${width}×${height}`,
        ).toBe(true);
      }
    }
  });
});
