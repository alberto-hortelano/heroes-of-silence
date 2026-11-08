/**
 * Las órdenes del mapa: el escenógrafo (componer, pintar, capturar y medir), un
 * recorte de su escena y la vista de un mapa denso.
 */
import { resolve } from 'node:path';
import type { Escena } from '../../../src/client/render/escenario/colocar/escena.js';
import { escenario, recortesDeSemilla } from '../escenario/escenario.js';
import { vistaMapa } from '../vista-mapa.js';
import type { Orden } from './orden.js';

/** El mapa: el escenógrafo y lo que pinta. */
export const ORDENES_DEL_MAPA: Readonly<Record<string, Orden>> = {
  escenario: {
    uso: `pnpm taller escenario [semilla…] [--px=N]
    el escenógrafo: compone, pinta, captura y mide (a N px por casilla; 48 si no se da)`,
    correr: async (resto) => {
      // pnpm taller escenario [semilla…] [--px=N]: a N px por casilla (48 si no se da),
      // para medir el pintor a la resolución del juego (120) como en #217.
      const opcion = resto.find((r) => r.startsWith('--px='));
      const px = opcion === undefined ? 48 : Number(opcion.slice('--px='.length));
      if (!Number.isSafeInteger(px) || px <= 0)
        throw new Error(`«${opcion}» no vale: los píxeles por casilla son un entero positivo`);
      const sueltas = resto.filter((r) => r !== opcion);
      const semillas = sueltas.length === 0 ? [1] : sueltas.map(Number);
      if (semillas.some((n) => !Number.isSafeInteger(n)))
        throw new Error('las semillas son enteros');
      for (const r of await escenario(semillas, px)) {
        // El de `componer`, más lo que mide la página del taller.
        const i = r.informe as Escena['informe'] & {
          desnudo: number;
          errores: string[];
          aguaEnLoAlto: number;
          espaldasSinLabio: number;
          espaldasSinCanto: number;
          sendaSobreElAgua: number;
          msPintar: number;
        };
        console.log(`→ ${r.png}`);
        console.log(
          `  suelo desnudo ${(i.desnudo * 100).toFixed(1)} % · pintar ${i.msPintar} ms · árboles sobre lo pisable ${i.arbolesSobreLoPisable} · masa sobre lo pisable ${i.masaSobreLoPisable} · pasillos tapados ${i.pasillosTapados} · cumbres sobre lo pisable ${i.cumbresSobreLoPisable} (medida) · bosque sin árbol ${i.bosqueSinArbol} · murallas partidas ${i.murallasPartidas} · muralla incoherente ${i.murallaIncoherente} · torres apiladas ${i.torresApiladas} · muralla sobre la senda ${i.murallaSobreSenda} · bases sobre reserva ${i.basesSobreReserva} · barrera sin formación ${i.casillasDeBarreraSinFormacion} · sprites sobre la senda ${i.spritesSobreSenda} · celdas mal cubiertas ${i.celdasMalCubiertas} · bajadas sin pieza ${i.bajadasSinPieza} · bajadas tapadas ${i.bajadasTapadas} · pasos tapados ${i.pasosTapados} · pasos atravesados ${i.pasosAtravesados} · pisables tapadas ${i.pisablesTapadas} · rampas desviadas ${i.rampasDesviadas} · rampas sin sus piezas ${i.rampasSinSusPiezas} · sendas por objeto ${i.sendasPorObjeto} · acantilados lisos ${i.acantiladosLisos} · espaldas sin reborde ${i.espaldasSinReborde} · cima de otro material ${i.cimaDeOtroMaterial} · cubierta de otro nivel ${i.cubiertaDeOtroNivel} · cara de otro material ${i.caraDeOtroMaterial} · paredes tapadas ${i.paredesTapadas} · caras cortadas ${i.carasCortadas} · mesas en la cordillera ${i.mesasEnLaCordillera} · senda bajo el relieve ${i.sendaBajoElRelieve} (techo de media 5) · agua en lo alto ${i.aguaEnLoAlto} · espaldas sin labio ${i.espaldasSinLabio} · espaldas sin canto ${i.espaldasSinCanto} · senda sobre el agua ${i.sendaSobreElAgua}` +
            (i.modulosQueFaltan.length > 0 ? ` · faltan ${i.modulosQueFaltan.join(', ')}` : '') +
            (i.errores.length > 0 ? ` · ERRORES: ${i.errores.join(' | ')}` : ''),
        );
      }
    },
  },
  recorte: {
    uso: `pnpm taller recorte <semilla> <x0> <y0> <x1> <y1> <salida.png> [px por casilla = 96]
    un trozo de la escena de una semilla, de casilla a casilla`,
    correr: async (resto) => {
      // pnpm taller recorte <semilla> <x0> <y0> <x1> <y1> <salida.png> [px por casilla = 96]
      const [semilla, x0, y0, x1, y1, salida, px] = resto;
      const n = [semilla, x0, y0, x1, y1].map(Number);
      if (salida === undefined || n.some((v) => !Number.isFinite(v)))
        throw new Error('uso: pnpm taller recorte <semilla> <x0> <y0> <x1> <y1> <salida.png> [px]');
      const [s, ...caja] = n as [number, number, number, number, number];
      await recortesDeSemilla(s, px === undefined ? 96 : Number(px), [
        { caja: caja as [number, number, number, number], salida: resolve(salida) },
      ]);
      console.log(`→ ${salida}`);
    },
  },
  'vista-mapa': {
    uso: `pnpm taller vista-mapa [semilla]
    un mapa denso del generador pintado con ese arte (\`.cache/taller/vista/mapa-denso.html\`)`,
    correr: async (resto) => {
      const semilla = resto[0] === undefined ? 1 : Number(resto[0]);
      if (!Number.isSafeInteger(semilla))
        throw new Error(`«${resto[0]}» no es una semilla: un entero`);
      console.log(`→ ${await vistaMapa(semilla)}`);
    },
  },
};
