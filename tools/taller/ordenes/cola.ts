/**
 * Las órdenes de la cola del taller: vaciarla (`trabajar`), mirarla (`estado`) y
 * arreglar lo que se quedó a medias (`corregir`, `devolver`, `retirar`,
 * `reprocesar`).
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RAIZ } from '../../comun/raiz.js';
import { esEncargoDeNpc, REINTENTOS_DE_NPC, reintentarSiQueda } from '../../npcs/en-el-taller.js';
import { FalloDeCodex } from '../codex.js';
import { encargoSchema } from '../encargo.js';
import { FalloTrasGenerar, procesar, sinHome } from '../proceso.js';
import { leerHuesos, rechazarSiElManiquiFalla } from '../revision/maniqui.js';
import { figura } from '../revision/revisar.js';
import { mayorSalto, saltosDeLaHoja } from '../revision/salto.js';
import { readoptar, versionesAdoptadas } from '../revision/versiones.js';
import { COLA, type Orden } from './orden.js';

/**
 * Vacía la cola. Con `soloNpc` (`pnpm npcs trabajar`, el que lanza `pnpm dev` al
 * aceptar un mundo), solo los encargos del banco de NPC: acaba al vaciar esos y no
 * se lleva lo que otro dejó en la cola.
 */
async function trabajar(soloNpc = false): Promise<void> {
  await COLA.preparar();
  let hechos = 0;
  let fallidos = 0;
  for (;;) {
    const encargo = await COLA.tomar(undefined, soloNpc ? esEncargoDeNpc : undefined);
    if (encargo === null) break;
    console.log(`→ ${encargo.id} (${encargo.tipo})`);
    // Un maniquí sin esqueleto, de otro render o que anda hacia atrás no se pinta.
    const rechazo = await rechazarSiElManiquiFalla(COLA, encargo, RAIZ);
    if (rechazo !== null) {
      console.log(`  ✘ ${rechazo}`);
      fallidos++;
      continue;
    }
    const t0 = Date.now();
    try {
      const r = await procesar(encargo);
      await COLA.cerrar(encargo.id, 'hecho', { cuando: new Date().toISOString(), ...r });
      console.log(`  ✔ ${r.salida} en ${Math.round((Date.now() - t0) / 1000)} s`);
      hechos++;
    } catch (err) {
      if (err instanceof FalloDeCodex && err.sinCuota) {
        // Sin cuota no falla el encargo: falla todo lo que quede. Se devuelve
        // a la cola y se para, diciendo cuándo vuelve a haber cuota.
        await COLA.devolver(encargo.id, 'en-curso');
        console.log(
          `  ⏸ ${err.message}\n  ${encargo.id} vuelve a pendiente/; la cola se para aquí.`,
        );
        process.exitCode = 2;
        break;
      }
      const motivo = err instanceof Error ? err.message : String(err);
      await COLA.cerrar(encargo.id, 'fallido', {
        cuando: new Date().toISOString(),
        motivo,
        ...(err instanceof FalloTrasGenerar ? { hilo: err.hilo, crudo: sinHome(err.crudo) } : {}),
      });
      console.log(`  ✘ ${motivo}`);
      // Una figura del banco de NPC no se queda a medias por una tirada mala: se
      // vuelve a pedir, con la cuenta en su ficha (QA del banco de NPC, H2). Si no se
      // puede (otro `pnpm npcs trabajar` lo reintentó a la vez, H7), se dice y la cola
      // sigue: tumbar el trabajador dejaría lo demás sin pintar.
      let vez: number | null = null;
      try {
        vez = await reintentarSiQueda(COLA, encargo.id);
      } catch (err) {
        console.log(
          `  ! no se reintenta ${encargo.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (vez !== null) {
        console.log(
          `  ↻ ${encargo.id} vuelve a pendiente/ (reintento ${vez} de ${REINTENTOS_DE_NPC})`,
        );
        continue;
      }
      fallidos++;
    }
  }
  console.log(`cola vacía: ${hechos} hechos, ${fallidos} fallidos`);
  if (fallidos > 0) process.exitCode = 1;
}

/**
 * Rehace el post-proceso de un encargo fallido sobre el crudo que ya generó
 * Codex. Para cuando lo que falló fue el recorte o el empaquetado, no la imagen.
 */
async function reprocesar(id: string): Promise<void> {
  const estado = await COLA.estado();
  // Solo lo que se pintó con esta cola y cuyo crudo sigue en `~/.codex` (QA, H10).
  if (!estado.hecho.includes(id) && !estado.fallido.includes(id))
    throw new Error(
      `«${id}» no está en la cola (ni en hecho/ ni en fallido/): solo se reprocesa lo que se pintó con esta cola y cuyo crudo sigue en ~/.codex. Lo pintado antes se arregla repintándolo («pnpm taller versiones <unidad> <dN> <h>»)`,
    );
  const desde = estado.hecho.includes(id) ? 'hecho' : 'fallido';
  const ficha = await COLA.leer(desde, id);
  const { hilo, crudo: guardado } = ficha.resultado ?? {};
  // Un hecho no apunta el crudo en la cola: está en su procedencia.
  const crudo =
    guardado ??
    (desde === 'hecho'
      ? (JSON.parse(await readFile(join(RAIZ, `${ficha.encargo.salida}.procedencia.json`), 'utf8'))
          .crudo.fichero as string)
      : undefined);
  if (hilo === undefined || crudo === undefined) {
    throw new Error(`«${id}» falló antes de que Codex generara nada: devuélvelo a la cola`);
  }
  // De `fallido/` a `en-curso/` de un golpe: por `pendiente/`, un trabajador vivo
  // (el de la semilla del banco de NPC, p. ej.) podía llevárselo y pedirlo a Codex.
  const encargo = encargoSchema.parse((await COLA.retomar(id, desde)).encargo);
  try {
    const r = await procesar(encargo, { hilo, crudo: crudo.replace(/^~/, homedir()), mensaje: '' });
    await COLA.cerrar(id, 'hecho', { cuando: new Date().toISOString(), ...r });
    console.log(`  ✔ ${r.salida}`);
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    await COLA.cerrar(id, 'fallido', { cuando: new Date().toISOString(), motivo, hilo, crudo });
    console.log(`  ✘ ${motivo}`);
    process.exitCode = 1;
  }
}

/** Corrige un encargo hecho en su mismo hilo: encola `<id>-c<n>` con `reanudar`. */
async function corregir(id: string, correccion: string): Promise<void> {
  const desde = (await COLA.estado()).hecho.includes(id) ? 'hecho' : 'fallido';
  const ficha = await COLA.leer(desde, id);
  const hilo = ficha.resultado?.hilo;
  if (hilo === undefined) throw new Error(`el encargo «${id}» no apuntó su hilo de Codex`);
  const base = id.replace(/-c\d+$/, '');
  const ya = (await COLA.estado()) as Record<string, string[]>;
  const usados = Object.values(ya).flat();
  let n = 1;
  while (usados.includes(`${base}-c${n}`)) n++;
  // Las referencias vuelven a adjuntarse: la pose sigue mandando en la corrección.
  const e = await COLA.encolar({
    ...ficha.encargo,
    id: `${base}-c${n}`,
    reanudar: { hilo, correccion },
  });
  console.log(`encolado ${e.id} sobre el hilo ${hilo}`);
}

/** La cola: vaciarla, mirarla y arreglar lo que se quedó a medias. */
export const ORDENES_DE_LA_COLA: Readonly<Record<string, Orden>> = {
  trabajar: {
    uso: `pnpm taller [trabajar] [--npcs]
    trabaja hasta vaciar la cola; con --npcs, solo los encargos del banco de NPC (lo que lanza «pnpm npcs trabajar»)`,
    correr: async (resto) => {
      await trabajar(resto.includes('--npcs'));
    },
  },
  corregir: {
    uso: `pnpm taller corregir <encargo> "<corrección>"
    reabre el hilo de Codex de un encargo hecho`,
    correr: async (resto) => {
      if (resto[0] === undefined || resto[1] === undefined) {
        throw new Error('uso: pnpm taller corregir <encargo> "<corrección>"');
      }
      await corregir(resto[0], resto[1]);
    },
  },
  estado: {
    uso: `pnpm taller estado
    cuántos encargos hay en cada carpeta de la cola, y cuáles`,
    correr: async () => {
      for (const [e, ids] of Object.entries(await COLA.estado())) {
        console.log(`${e.padEnd(10)} ${ids.length}  ${ids.join(' ')}`);
      }
    },
  },
  devolver: {
    uso: `pnpm taller devolver <id>
    de en-curso/ o fallido/ a pendiente/`,
    correr: async (resto) => {
      const id = resto[0];
      if (id === undefined) throw new Error('uso: pnpm taller devolver <id>');
      const estado = await COLA.estado();
      const desde = estado['en-curso'].includes(id) ? 'en-curso' : 'fallido';
      await COLA.devolver(id, desde);
      console.log(`${id}: de ${desde}/ a pendiente/`);
    },
  },
  retirar: {
    uso: `pnpm taller retirar <id>…
    borra pendientes que ya no valen`,
    correr: async (resto) => {
      for (const id of resto)
        console.log(`${id}: ${(await COLA.retirar(id)) ? 'retirado' : 'no estaba pendiente'}`);
    },
  },
  reprocesar: {
    uso: `pnpm taller reprocesar <id>…
    rehace el post-proceso sobre el crudo ya generado
pnpm taller reprocesar <unidad> --adoptadas
    reempaqueta desde su crudo las hojas adoptadas de versiones y las vuelve a adoptar`,
    correr: async (resto) => {
      if (resto.length === 0)
        throw new Error('uso: pnpm taller reprocesar <encargo>… | <unidad> --adoptadas');
      // Con `--adoptadas`, las hojas de una unidad que vinieron de una versión: cada una
      // se reempaqueta desde su crudo (sin repintar) y se vuelve a llevar a `assets/`,
      // diciendo cuánto cambió su encuadre (repintado del 30-10-2026, el piquero).
      if (resto.includes('--adoptadas')) {
        const [id] = resto.filter((r) => !r.startsWith('--'));
        if (id === undefined) throw new Error('uso: pnpm taller reprocesar <unidad> --adoptadas');
        const f = figura(id);
        const hojas = versionesAdoptadas(f);
        if (hojas.length === 0) {
          console.log(`${id}: ninguna hoja de assets/ viene de una versión`);
          process.exitCode = 1;
          return;
        }
        for (const { d, h, encargo } of hojas) {
          const huesos = leerHuesos(join(RAIZ, f.maniqui), d, h);
          const hoja = join(RAIZ, f.arte, `d${d}`, `hoja-${h}.webp`);
          const medir = async () =>
            huesos === null ? 0 : mayorSalto(await saltosDeLaHoja(hoja, huesos));
          const antes = await medir();
          const fallidoAntes = (await COLA.estado()).fallido.includes(encargo);
          try {
            await reprocesar(encargo);
          } catch (err) {
            console.log(
              `  ✘ d${d}-${h} (${encargo}): ${err instanceof Error ? err.message : String(err)}`,
            );
            process.exitCode = 1;
            continue;
          }
          if (!fallidoAntes && (await COLA.estado()).fallido.includes(encargo)) continue;
          console.log(`  · d${d}-${h}: ${await readoptar(f, d, h)}`);
          console.log(`    el cuerpo saltaba ${antes} px y ahora ${await medir()} px`);
        }
        return;
      }
      for (const id of resto) await reprocesar(id);
    },
  },
};
