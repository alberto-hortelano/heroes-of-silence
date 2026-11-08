/**
 * Las órdenes de la revisión de las animaciones (`revision/`, la skill
 * `/revisar-animaciones`): el maniquí, lo pintado, los jurados, los visores y las
 * versiones de una hoja (pedirlas, elegir y adoptar).
 */
import { join } from 'node:path';
import { bandera } from '../../comun/argumentos.js';
import { RAIZ } from '../../comun/raiz.js';
import { YaEnLaCola } from '../cola.js';
import { RELOJ } from '../derivar.js';
import { DIR_DEL_MANIQUI_CIVIL } from '../npcs.js';
import { arbitrar, cruzar, unir } from '../revision/jurado.js';
import { casosDelManiqui, hojasSobreOtroManiqui, revisarElManiqui } from '../revision/maniqui.js';
import { comprobarClips, direccionesDe, figura, revisar } from '../revision/revisar.js';
import {
  adoptar,
  adoptarTodas,
  casosDelVisor,
  elegir,
  escribirClave,
  prepararVersiones,
  rechazadas,
} from '../revision/versiones.js';
import { instalar, visor } from '../revision/vision.js';
import { COLA, type Orden } from './orden.js';

/** Las direcciones y la hoja de `<unidad> <dN> <h>`, o lanza con el uso. */
function hojaDeLosArgumentos(
  args: readonly string[],
  uso: string,
): { id: string; d: number; h: string } {
  const [id, dir, h] = args.filter((a) => !a.startsWith('--'));
  if (
    id === undefined ||
    dir === undefined ||
    !/^d[0-7]$/.test(dir) ||
    h === undefined ||
    !/^[a-c]$/.test(h)
  )
    throw new Error(`uso: ${uso} (la dirección de d0 a d7 y la hoja a, b o c)`);
  return { id, d: Number(dir.slice(1)), h };
}

/** La revisión de las animaciones (`revision/`, la skill `/revisar-animaciones`). */
export const ORDENES_DE_LA_REVISION: Readonly<Record<string, Orden>> = {
  'vision-instalar': {
    uso: `pnpm taller vision-instalar
    el entorno de visión (\`.cache/vision/.venv\`, desde \`revision/requirements.txt\`)`,
    correr: () => {
      instalar();
    },
  },
  'revisar-maniqui': {
    uso: `pnpm taller revisar-maniqui <unidad>… | --civil
    si anda hacia atrás, si el reposo baila, si el arma no se lee`,
    correr: async (resto) => {
      // Lo que no se ve juzgando lo pintado: el maniquí mismo (C2 de la revisión).
      let conSentido = false;
      const ids = resto.filter((r) => !r.startsWith('--'));
      if (ids.length === 0 && !resto.includes('--civil'))
        throw new Error('uso: pnpm taller revisar-maniqui <unidad>… | --civil');
      // El civil (el de la gente del banco de NPC), que también mira la compuerta.
      const carpetas = [
        ...(resto.includes('--civil')
          ? [{ id: 'civil', maniqui: DIR_DEL_MANIQUI_CIVIL, arte: null }]
          : []),
        ...ids.map((id) => figura(id)),
      ];
      for (const f of carpetas) {
        const { avisos } = await revisarElManiqui(join(RAIZ, f.maniqui));
        console.log(`${f.id}: ${avisos.length === 0 ? 'sin avisos' : `${avisos.length} avisos`}`);
        for (const a of avisos) console.log(`  ${a.tipo === 'sentido' ? '✘' : '!'} ${a.texto}`);
        conSentido ||= avisos.some((a) => a.tipo === 'sentido');
        if (f.arte === null) continue;
        const repintar = hojasSobreOtroManiqui(RAIZ, f.arte);
        if (repintar.length > 0)
          console.log(
            `  ⚠ ${repintar.length} hojas pintadas sobre OTRO maniquí (${repintar.map((r) => r.hoja).join(', ')}): no se juzgan como un fallo del pintor; van directas a «pnpm taller versiones ${f.id} <dN> <h>» (el jurado sobre ellas solo da instrucciones), y \`elegir\` las compara entre sí, no con la de ahora`,
          );
      }
      // Una marcha hacia atrás no se manda a pintar: el arreglo va en el maniquí.
      if (conSentido) process.exitCode = 1;
    },
  },
  revisar: {
    uso: `pnpm taller revisar <unidad> [dN…] [--sin-juez] [--clips=idle,walk]
    los paneles de cada clip y el juicio de ChatGPT`,
    correr: async (resto) => {
      const [id] = resto.filter((r) => !r.startsWith('--') && !/^d[0-7]$/.test(r));
      if (id === undefined)
        throw new Error('uso: pnpm taller revisar <unidad> [dN…] [--sin-juez] [--clips=idle,walk]');
      const clips = bandera(resto, 'clips')?.split(',');
      await revisar(id, direccionesDe(resto), {
        sinJuez: resto.includes('--sin-juez'),
        ...(clips === undefined ? {} : { clips }),
      });
    },
  },
  jurado: {
    uso: `pnpm taller jurado unir|arbitrar|cruzar <unidad> [dN…] [--clips=idle,walk]
    la unión de los jurados, los árbitros, el veredicto`,
    correr: async (resto) => {
      const [paso, id] = resto.filter((r) => !r.startsWith('--') && !/^d[0-7]$/.test(r));
      const pasos = { unir, arbitrar, cruzar } as const;
      if (paso === undefined || !(paso in pasos) || id === undefined)
        throw new Error(
          'uso: pnpm taller jurado unir|arbitrar|cruzar <unidad> [dN…] [--clips=idle,walk]',
        );
      const clipsDelJurado = bandera(resto, 'clips')?.split(',');
      comprobarClips(clipsDelJurado);
      await pasos[paso as keyof typeof pasos](figura(id), direccionesDe(resto), clipsDelJurado);
    },
  },
  visor: {
    uso: `pnpm taller visor <unidad>
    lo que está en disputa y las versiones que elegir, para la persona`,
    correr: async (resto) => {
      const [id] = resto;
      if (id === undefined) throw new Error('uso: pnpm taller visor <unidad>');
      const f = figura(id);
      const { casos, clave } = await casosDelVisor(f);
      if (casos.length === 0) {
        console.log(
          `${id}: nada que enseñar (ni disputas sin mirar ni versiones que elegir); el maniquí, con «pnpm taller visor-maniqui ${id}»`,
        );
        process.exitCode = 1;
        return;
      }
      await escribirClave(f, clave);
      console.log(`${id}: ${casos.length} casos`);
      await visor(join(RAIZ, f.revision, 'visor'), casos);
    },
  },
  'visor-maniqui': {
    uso: `pnpm taller visor-maniqui <unidad>
    su maniquí animado de tres cuartos, de lado y de espaldas, con sus avisos`,
    correr: async (resto) => {
      // El visor del maniquí (paso 1 de la skill): sus clips animados de tres cuartos,
      // de lado y de espaldas, con los avisos de `revisar-maniqui`.
      const [id] = resto;
      if (id === undefined) throw new Error('uso: pnpm taller visor-maniqui <unidad>');
      const f = figura(id);
      const fps = Object.fromEntries(Object.entries(RELOJ).map(([c, r]) => [c, r.fps]));
      const casos = await casosDelManiqui(f, RAIZ, fps);
      console.log(`${id}: ${casos.length} clips del maniquí`);
      await visor(join(RAIZ, f.revision, 'visor-maniqui'), casos);
    },
  },
  versiones: {
    uso: `pnpm taller versiones <unidad> <dN> <h> [--rehacer]
    encola otra tirada, «esqueleto» y «todo» de una hoja
pnpm taller versiones <unidad> --rechazadas
    otra vez las hojas rechazadas en el vistazo final`,
    correr: async (resto) => {
      // Con `--rechazadas`, las hojas que la persona rechazó en el vistazo final,
      // otra vez y olvidando las de antes (decisión del usuario del 30-10-2026).
      if (resto.includes('--rechazadas')) {
        const [id] = resto.filter((r) => !r.startsWith('--'));
        if (id === undefined) throw new Error('uso: pnpm taller versiones <unidad> --rechazadas');
        const f = figura(id);
        const hojas = await rechazadas(f);
        if (hojas.length === 0) {
          console.log(
            `${id}: ninguna hoja rechazada en el vistazo final (o aún no se ha mirado: «pnpm taller visor ${id}»)`,
          );
          process.exitCode = 1;
          return;
        }
        for (const { d, h } of hojas)
          for (const e of await prepararVersiones(f, d, h)) {
            await COLA.olvidar(e.id);
            try {
              console.log(`encolado ${(await COLA.encolar(e)).id}`);
            } catch (err) {
              // Ya pedida (a mano, o por otra pasada) y aún sin pintar: no se pide dos veces.
              if (!(err instanceof YaEnLaCola)) throw err;
              console.log(`  · ${e.id} ya estaba en la cola (${err.message})`);
            }
          }
        return;
      }
      const { id, d, h } = hojaDeLosArgumentos(
        resto,
        'pnpm taller versiones <unidad> <dN> <h> | <unidad> --rechazadas',
      );
      for (const e of await prepararVersiones(figura(id), d, h)) {
        if (resto.includes('--rehacer')) await COLA.olvidar(e.id);
        console.log(`encolado ${(await COLA.encolar(e)).id}`);
      }
    },
  },
  elegir: {
    uso: `pnpm taller elegir <unidad> <dN> <h>
    las compara a ciegas con la de ahora, en los dos órdenes`,
    correr: async (resto) => {
      const { id, d, h } = hojaDeLosArgumentos(resto, 'pnpm taller elegir <unidad> <dN> <h>');
      const e = await elegir(figura(id), d, h);
      console.log(`d${d}-${h}: ${e.motivo}`);
    },
  },
  adoptar: {
    uso: `pnpm taller adoptar <unidad> <dN> <h>
    la ganadora, si la persona la prefirió (o ganó claro su torneo), a \`assets/\`
pnpm taller adoptar <unidad> --todas
    todas las que se pueden; dice cuáles quedan para el visor`,
    correr: async (resto) => {
      // Con `--todas`, lo que se puede de la unidad: las ganadoras claras de un torneo
      // solas, y lo que eligió la persona (decisión del usuario del 30-10-2026).
      if (resto.includes('--todas')) {
        const [id] = resto.filter((r) => !r.startsWith('--'));
        if (id === undefined) throw new Error('uso: pnpm taller adoptar <unidad> --todas');
        const { adoptadas, quedan } = await adoptarTodas(figura(id));
        console.log(
          `${id}: ${adoptadas.length} adoptadas${adoptadas.length > 0 ? ` (${adoptadas.join(', ')})` : ''}`,
        );
        for (const q of quedan) console.log(`  · queda ${q.hoja}: ${q.motivo}`);
        if (adoptadas.length === 0 && quedan.length === 0) {
          console.log('  nada que adoptar: ninguna elección pendiente («pnpm taller elegir»)');
          process.exitCode = 1;
        }
        return;
      }
      const { id, d, h } = hojaDeLosArgumentos(
        resto,
        'pnpm taller adoptar <unidad> <dN> <h> | <unidad> --todas',
      );
      console.log(`d${d}-${h}: ${await adoptar(figura(id), d, h)}`);
    },
  },
};
