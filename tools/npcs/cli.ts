/**
 * `pnpm npcs`: el banco de figuras de NPC (`data/npcs.json`, `assets/npcs/<id>/`).
 *
 *   pnpm npcs estado
 *       cada figura con lo que tiene pintado, lo de NPC que hay en la cola y cuántas
 *       pintadas tiene cada facción
 *   pnpm npcs pedir <fichero.json> [--por=<mundo>]
 *       acepta unas peticiones (`{ "<id>": { descripcion, etiquetas, talla, acciones } }`,
 *       el formato de `figuras` de una historia) y encola su identidad; `--por`, quién
 *       las pide (`semilla` si no se dice). Por aquí entra la semilla:
 *       `pnpm npcs pedir tools/npcs/semilla.json`
 *   pnpm npcs encolar [id…]
 *       vuelve a encolar lo que falta de esas figuras (o de todas las que no están
 *       pintadas): lo pedido en otro clon, o lo que falló
 *   pnpm npcs rehacer <id>
 *       borra el arte de una figura mala y la vuelve a encolar desde la identidad
 *   pnpm npcs trabajar
 *       el trabajador del taller, solo con los encargos de NPC (Codex por la
 *       suscripción); antes rescata lo que se quedó a medias (lo que falta y lo
 *       fallido con reintentos; un encargo que falla se reintenta solo dos veces) y
 *       acaba al vaciarlos
 *
 * Nada gasta dinero: el taller pinta con Codex por la suscripción, nunca con fal.ai.
 */
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { CARPETA_DE_LAS_FIGURAS, figuraDelBanco } from '../../src/core/npcs.js';
import { personasDeLaFaccion } from '../../src/core/town/voces.js';
import { FACTION_IDS } from '../../src/core/types.js';
import { bandera } from '../argumentos.js';
import { colaDelTaller } from '../taller/cola.js';
import { encolarLoQueSigue, rescatar } from '../taller/npcs.js';
import {
  aceptarPeticiones,
  carpetasSinFigura,
  type EstadoDeFigura,
  estadoDeFigura,
  leerBancoDeDisco,
  RAIZ,
} from './banco.js';
import { esEncargoDeNpc, fotoDelTaller, prefijoDeLaFigura } from './en-el-taller.js';

async function estado(): Promise<void> {
  const banco = leerBancoDeDisco();
  const cola = await colaDelTaller(RAIZ).estado();
  const deNpc = Object.fromEntries(
    Object.entries(cola).map(([e, ids]) => [e, ids.filter(esEncargoDeNpc)]),
  ) as typeof cola;
  // Cada figura, una vez y con una foto de la cola: lo leen su línea y la cuenta de su facción.
  const taller = fotoDelTaller(RAIZ);
  const estados = new Map<string, EstadoDeFigura>(
    banco.figuras.map((f) => [f.id, estadoDeFigura(f.id, RAIZ, taller)]),
  );
  for (const f of banco.figuras) {
    const e = estados.get(f.id) as EstadoDeFigura;
    const suyos = (ids: readonly string[]) =>
      ids.filter((i) => i.startsWith(prefijoDeLaFigura(f.id)));
    const cuentas = (['pendiente', 'en-curso', 'hecho', 'fallido'] as const)
      .map((k) => [k, suyos(deNpc[k]).length] as const)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
    console.log(
      `${f.id.padEnd(30)} ${f.etiquetas.faccion.padEnd(10)} ${e.estado}${e.estado === 'pintada' ? '' : ` (${e.motivo})`}${cuentas === '' ? '' : ` · cola: ${cuentas}`}`,
    );
  }
  for (const [k, ids] of Object.entries(deNpc))
    if (ids.length > 0) console.log(`cola ${k.padEnd(9)} ${ids.length}  ${ids.join(' ')}`);
  for (const faccion of FACTION_IDS) {
    const suyas = banco.figuras.filter((f) => f.etiquetas.faccion === faccion);
    const pintadas = suyas.filter((f) => estados.get(f.id)?.estado === 'pintada');
    const especies = new Set(pintadas.map((f) => f.etiquetas.especie));
    const sinSuEspecie = personasDeLaFaccion(faccion).filter((p) => !especies.has(p.especie));
    console.log(
      `${faccion.padEnd(10)} ${pintadas.length} pintadas de ${suyas.length}` +
        (pintadas.length === 0
          ? ' · su gente va con el Y Bot'
          : sinSuEspecie.length > 0
            ? ` · ${sinSuEspecie.length} de su gente sin una de su especie (${[...new Set(sinSuEspecie.map((p) => p.especie))].join(', ')})`
            : ''),
    );
  }
  for (const c of carpetasSinFigura(banco))
    console.log(`aviso: ${CARPETA_DE_LAS_FIGURAS}/${c} no es de ninguna figura del banco`);
}

async function pedir(args: readonly string[]): Promise<void> {
  const fichero = args.find((a) => !a.startsWith('--'));
  if (fichero === undefined) throw new Error('uso: pnpm npcs pedir <fichero.json> [--por=<mundo>]');
  const peticiones: unknown = JSON.parse(await readFile(fichero, 'utf8'));
  const { figuras, encolados } = await aceptarPeticiones(
    peticiones,
    bandera(args, 'por') ?? 'semilla',
  );
  console.log(
    `${figuras.length} figuras nuevas en el banco: ${figuras.map((f) => f.id).join(', ')}`,
  );
  console.log(`encolados ${encolados.length}: ${encolados.join(' ')}`);
  console.log('el taller las pinta con `pnpm npcs trabajar`');
}

async function encolar(ids: readonly string[]): Promise<void> {
  const banco = leerBancoDeDisco();
  const desconocidas = ids.filter((id) => figuraDelBanco(banco, id) === undefined);
  if (desconocidas.length > 0) throw new Error(`no están en el banco: ${desconocidas.join(', ')}`);
  const elegidas = banco.figuras.filter((f) =>
    ids.length === 0 ? estadoDeFigura(f.id).estado !== 'pintada' : ids.includes(f.id),
  );
  for (const f of elegidas) {
    const e = await encolarLoQueSigue(f, RAIZ, { repescar: true });
    console.log(`${f.id}: ${e.length === 0 ? 'nada que encolar' : e.join(' ')}`);
  }
}

async function rehacer(id: string | undefined): Promise<void> {
  if (id === undefined) throw new Error('uso: pnpm npcs rehacer <id>');
  const f = figuraDelBanco(leerBancoDeDisco(), id);
  if (f === undefined) throw new Error(`"${id}" no está en el banco`);
  const cola = colaDelTaller(RAIZ);
  const estado = await cola.estado();
  const suyo = (i: string): boolean => i.startsWith(prefijoDeLaFigura(id));
  const vivos = [...estado.pendiente, ...estado['en-curso']].filter(suyo);
  if (vivos.length > 0)
    throw new Error(
      `"${id}" tiene encargos en la cola (${vivos.join(', ')}): espera a que acaben o retíralos con pnpm taller retirar`,
    );
  await rm(join(RAIZ, CARPETA_DE_LAS_FIGURAS, id), { recursive: true, force: true });
  for (const i of [...estado.hecho, ...estado.fallido].filter(suyo)) await cola.olvidar(i);
  console.log(`${id}: arte borrado; encolado ${(await encolarLoQueSigue(f, RAIZ)).join(' ')}`);
}

/**
 * El trabajador del taller con `--npcs`: el mismo proceso de `pnpm taller`, que
 * arranca su cola al importarse, así que va en un hijo con el mismo `tsx`.
 *
 * Antes, **rescata** lo que se quedó a medias de toda figura sin pintar que no tiene
 * nada pendiente ni en curso (`rescatar`): lo que falta se encola y lo fallido se
 * reintenta mientras le queden reintentos. Así lo recoge un reinicio, o el trabajador
 * que lanza un mundo nuevo (`lanzarElTaller`), sin que nadie lo pida (QA del banco de
 * NPC, H2, 22-10-2026).
 */
async function trabajar(): Promise<number> {
  for (const f of leerBancoDeDisco().figuras) {
    const { encolados, agotados } = await rescatar(f, RAIZ);
    if (encolados.length > 0) console.log(`${f.id}: se rescata ${encolados.join(' ')}`);
    if (agotados.length > 0)
      console.log(
        `${f.id}: ${agotados.join(' ')} agotó sus reintentos y sigue en fallido/: se reintenta con \`pnpm npcs encolar ${f.id}\``,
      );
  }
  const r = spawnSync(
    process.execPath,
    [...process.execArgv, join(RAIZ, 'tools/taller/trabajador.ts'), 'trabajar', '--npcs'],
    { cwd: RAIZ, stdio: 'inherit' },
  );
  if (r.error !== undefined) throw r.error;
  return r.status ?? 1;
}

async function main(argv: readonly string[]): Promise<number> {
  const [orden, ...resto] = argv;
  switch (orden) {
    case 'estado':
      await estado();
      return 0;
    case 'pedir':
      await pedir(resto);
      return 0;
    case 'encolar':
      await encolar(resto);
      return 0;
    case 'rehacer':
      await rehacer(resto[0]);
      return 0;
    case 'trabajar':
      return await trabajar();
    default:
      console.error(
        `orden ${orden === undefined ? 'que falta' : `desconocida «${orden}»`}: estado, pedir, encolar, rehacer o trabajar (mira tools/npcs/cli.ts)`,
      );
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (codigo) => process.exit(codigo),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
