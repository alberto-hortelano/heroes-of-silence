/**
 * Los bordes de barrera no van en tramos rectos largos (#169), ni las caras de
 * roca en filas largas: las tres cuentas de `tools/qa/rectitud.ts` en 1-3000,
 * con sus techos (`TECHOS`, que explica la medida de main, de #230 y de una
 * perturbación neutra del azar, por bloques de 1000).
 *
 * Un tramo recto: casillas de barrera seguidas en una fila o columna con la de
 * al lado, del mismo lado, pisable (`tramosRectos`); una cara en fila, casillas
 * seguidas de frontal del relieve del escenógrafo (`carasEnFila`). Desde #226
 * los largos van a la escala del mapa (`largoALaEscala`).
 *
 * Va en su fichero y en tres procesos, uno por bloque (`rectitudPorBloques`):
 * 3 000 mapas con su relieve son ~50 s de pared con la máquina libre (~160 s en
 * serie, cerca del `testTimeout` lento de 180 s), y en `regiones.test.ts` se
 * sumaba a los ~55 s del generador. Hasta #230 contaba 1-1000 y solo tramos y
 * mapas; ahí el ruido de una tirada nueva del azar ya era el margen.
 */
import { expect } from 'vitest';
import { rectitudPorBloques, TECHOS } from '../tools/qa/rectitud.js';
import { itLento } from './lento.js';

itLento(
  'en 1-3000, los tramos rectos, las caras en fila y los mapas con un tramo largo no pasan de su techo (#169)',
  async () => {
    const { total, bloques } = await rectitudPorBloques();
    expect(bloques.map((b) => `${b.desde}-${b.hasta}`)).toEqual([
      '1-1000',
      '1001-2000',
      '2001-3000',
    ]);
    expect(total.tramos).toBeLessThanOrEqual(TECHOS.tramos.techo);
    expect(total.caras).toBeLessThanOrEqual(TECHOS.caras.techo);
    expect(total.mapas).toBeLessThanOrEqual(TECHOS.mapas.techo);
  },
);
