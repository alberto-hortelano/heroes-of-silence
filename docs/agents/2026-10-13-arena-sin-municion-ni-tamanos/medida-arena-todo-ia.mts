/**
 * Medida (no va al repo): cuántas peleas de la arena con todo en IA no terminan
 * (las cierra el tope de rondas, `causaDelFinal` = 'agotada'), ahora que los
 * tiradores de la arena no gastan munición. Unidades de las cinco facciones,
 * sorteadas por semilla, con al menos un tirador por bando en el montaje mixto.
 * Uso, desde la raíz: npx tsx docs/agents/2026-10-13-arena-sin-municion-ni-tamanos/medida-arena-todo-ia.mts <desde> <hasta> [con-municion]
 */
// La raíz del repo: este fichero vive en docs/agents/<tarea>/.
const R = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
const { batallaDeArena, unidadPorDefecto } = await import(`${R}/src/core/arena.ts`);
const { autoResolve } = await import(`${R}/src/core/ai/tactics.ts`);
const { causaDelFinal, MAX_ROUNDS } = await import(`${R}/src/core/battle/battle.ts`);
const { REGLAS_DEL_JUEGO } = await import(`${R}/src/core/battle/reglas.ts`);
const { createRng } = await import(`${R}/src/core/rng.ts`);
const { hojasDeArena } = await import(`${R}/tools/arena/borrador.ts`);
const { FORMAS_DE_EJEMPLO } = await import(`${R}/src/core/arena-murallas.ts`);

const conMunicion = process.argv[4] === 'con-municion';
const desde = Number(process.argv[2] ?? 1);
const hasta = Number(process.argv[3] ?? 300);
const hojas = hojasDeArena(R).filter((h: any) => !h.heroe && h.incompleta === null);
const tira = (h: any) => h.perfil === 'arco' || h.perfil === 'ballesta' || h.perfil === 'montado-arco';
const tiradores = hojas.filter(tira);
const otros = hojas.filter((h: any) => !tira(h));
const facciones = new Set(hojas.map((h: any) => h.faccion));

type Montaje =
  | 'mixto'
  | 'solo-tiradores'
  | 'sin-tiradores'
  | 'mixto-rueda'
  | 'tiradores-rueda'
  | 'mixto-muralla'
  | 'sin-tiradores-muralla';
function bando(rng: any, m: Montaje): any[] {
  const n = 3 + rng.int(0, 2); // 3 a 5 unidades
  const de = (lista: any[]) => lista[rng.int(0, lista.length - 1)];
  const out: any[] = [];
  for (let i = 0; i < n; i++) {
    const h =
      m === 'solo-tiradores' || m === 'tiradores-rueda'
        ? de(tiradores)
        : m.startsWith('sin-tiradores')
          ? de(otros)
          : i === 0
            ? de(tiradores)
            : de(hojas);
    out.push({ kind: 'borrador', unidad: unidadPorDefecto(h) });
  }
  return out;
}

const resumen: Record<
  string,
  { n: number; agotadas: number[]; rondas: number[]; ms: number; tiros: number; masDe12: number; maxTiros: number }
> = {};
for (const m of [
  'mixto',
  'solo-tiradores',
  'sin-tiradores',
  'mixto-rueda',
  'tiradores-rueda',
  'mixto-muralla',
  'sin-tiradores-muralla',
] as Montaje[]) {
  const r = { n: 0, agotadas: [] as number[], rondas: [] as number[], ms: 0, tiros: 0, masDe12: 0, maxTiros: 0 };
  for (let s = desde; s <= hasta; s++) {
    const rng = createRng(s * 7919 + (m.startsWith('mixto') ? 1 : m.startsWith('sin-tiradores') ? 3 : 2));
    if (typeof rng.int !== 'function') throw new Error('createRng sin int');
    const montaje = {
      izquierda: { unidades: bando(rng, m), heroe: null },
      derecha: { unidades: bando(rng, m), heroe: null },
      reglas: REGLAS_DEL_JUEGO,
      piezas: [],
      ...(m.endsWith('rueda') ? { golpe: 'rueda' } : {}),
      ...(m.endsWith('muralla')
        ? { muralla: FORMAS_DE_EJEMPLO[s % FORMAS_DE_EJEMPLO.length].muralla }
        : {}),
    };
    const t0 = performance.now();
    const b = batallaDeArena(montaje, createRng(s));
    // Con munición, como antes del 13-10-2026: los tiros del arco (12) o la
    // ballesta (8), que se gastan. Emulado sobre el stack: `cuentaTiros` lo ve.
    if (conMunicion) {
      for (const st of b.stacks) {
        const d = st.unit.equipo?.distancia;
        if (d === undefined) continue;
        const tiros = d === 'ballesta' ? 8 : 12;
        st.unit = { ...st.unit, shots: tiros };
        st.shotsLeft = tiros;
      }
    }
    autoResolve(b, createRng(s + 1_000_000));
    r.ms += performance.now() - t0;
    r.n++;
    r.rondas.push(b.round);
    const porStack = new Map<string, number>();
    for (const e of b.log) if (e.kind === 'shoot') porStack.set(e.stack, (porStack.get(e.stack) ?? 0) + 1);
    const max = Math.max(0, ...porStack.values());
    r.tiros += [...porStack.values()].reduce((a, x) => a + x, 0);
    r.maxTiros = Math.max(r.maxTiros, max);
    if (max > 12) r.masDe12++;
    if (causaDelFinal(b) === 'agotada' || b.round >= MAX_ROUNDS) r.agotadas.push(s);
  }
  resumen[m] = r;
}
const mediana = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p90 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.9)];
console.log(conMunicion ? 'CON munición emulada (como antes)' : 'SIN munición (hoy)');
console.log(`hojas: ${hojas.length} (${tiradores.length} tiradores) de ${facciones.size} facciones; semillas ${desde}-${hasta}; MAX_ROUNDS ${MAX_ROUNDS}`);
for (const [m, r] of Object.entries(resumen)) {
  console.log(
    `${m.padEnd(15)} ${r.agotadas.length}/${r.n} sin terminar (${((100 * r.agotadas.length) / r.n).toFixed(1)} %); rondas mediana/p90/máx ${mediana(r.rondas)}/${p90(r.rondas)}/${Math.max(...r.rondas)}; ${(r.ms / r.n).toFixed(1)} ms por pelea; ${(r.tiros / r.n).toFixed(1)} tiros por pelea, ${r.masDe12} peleas con un tirador de más de 12 (máx ${r.maxTiros}); semillas: ${r.agotadas.slice(0, 15).join(', ')}${r.agotadas.length > 15 ? '…' : ''}`,
  );
}
