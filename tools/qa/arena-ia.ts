/**
 * La IA contra la IA en la arena, con los modos y la armadura de la arena (#259,
 * #260, #262): cuántas peleas no terminan, cuánto duran y qué pasa en ellas. Una
 * medida para las tres reglas, sobre `autoResolve` (el bucle de la IA, el mismo
 * de la página) y `causaDelFinal` («agotada» = la que no termina: sin vencido,
 * por el tope de rondas o de jugadas).
 *
 *     npx tsx tools/qa/arena-ia.ts [semillas=100]
 *
 * Tres tandas, cada una con sus variantes sobre los mismos montajes (de su
 * propia corriente de azar, sin héroes ni muralla, con las reglas del juego y el
 * golpe al azar):
 *
 * - **contacto**: de 3 a `LIDERAZGO.maxPorBando` hojas de tropa por bando, salir
 *   del contacto libre y pagando (`?contacto=paga`).
 * - **carga**: cuatro hojas de tropa por bando, con la carga a pie de la arena y
 *   sin ella (la de antes de #260); cuenta las cargas a pie y del jinete.
 * - **armadura**: tres contra tres de todas las hojas (mezcla) y un jinete contra
 *   tres de arco, ballesta o bastón, con la barda, sin ella y como antes de #262
 *   (sin barda y con lo que sumaba, +5 de defensa y +220 PV, en el cuerpo);
 *   cuenta los golpes que la armadura paró enteros.
 * - **rueda: mezcla** (18-10-2026, vuelta 2 de los niveles del arma): tres contra
 *   tres de todas las hojas, **con un héroe por bando** sin libro (que pega con la
 *   Espada de la arena), al azar y con la rueda del golpe; cuenta los cruces.
 *   Con los niveles absolutos cambia el equilibrio de la rueda (Ofensivo +3, la
 *   Finta que resta de 1 a 5…), y sin esta tanda la medida no pelearía con ella.
 *
 * Sustituye a `tools/qa/contacto.ts` y a las medidas de las tareas de la carga y
 * de la armadura (14-10-2026, /simplify). Las variantes se alternan por semilla,
 * para que la carga de la máquina (compartida) caiga igual en todas.
 */
import { resolve } from 'node:path';
import { autoResolve } from '../../src/core/ai/tactics.js';
import {
  batallaDeArena,
  type HojaDeArena,
  heroePorDefecto,
  type Lado,
  quitarEnArena,
  type UnidadDeArena,
  unidadPorDefecto,
} from '../../src/core/arena.js';
import { causaDelFinal, MAX_ROUNDS } from '../../src/core/battle/battle.js';
import type { ModosDeArena } from '../../src/core/battle/modos.js';
import { SIN_MURALLA } from '../../src/core/battle/muralla.js';
import { REGLAS_DEL_JUEGO } from '../../src/core/battle/reglas.js';
import { hasTrait, LIDERAZGO } from '../../src/core/data.js';
import { createRng, type Rng } from '../../src/core/rng.js';
import { hojasDeArena } from '../arena/borrador.js';

/** Un montaje de la medida: las unidades de cada bando. */
type Montaje = readonly [readonly UnidadDeArena[], readonly UnidadDeArena[]];

/** Una variante: los modos con que se pelea (`con`) y lo que se le cambia a cada unidad. */
interface Variante {
  readonly nombre: string;
  readonly con: Partial<ModosDeArena>;
  readonly cambia: (u: UnidadDeArena) => UnidadDeArena;
}

/** Una tanda: cómo se monta cada semilla, con qué variantes se pelea y si con héroes. */
interface Tanda {
  readonly nombre: string;
  readonly montar: (rng: Rng) => Montaje;
  readonly variantes: readonly Variante[];
  readonly conHeroes?: boolean;
}

interface Cuenta {
  ms: number;
  agotadas: number[];
  rondas: number[];
  ganaIzquierda: number;
  golpes: number;
  parados: number;
  cargasAPie: number;
  cargasDeJinete: number;
  cruces: number;
}

const HOJAS = hojasDeArena(resolve(import.meta.dirname, '../..'));
const TROPA = HOJAS.filter((h) => !h.heroe);
const JINETES = TROPA.filter((h) => h.perfil.startsWith('montado-'));
const FLOJAS = TROPA.filter((h) => ['arco', 'ballesta', 'baston'].includes(h.perfil));

const TANDAS: readonly Tanda[] = (() => {
  const elegir = (rng: Rng, de: readonly HojaDeArena[], n: number): UnidadDeArena[] =>
    Array.from({ length: n }, () => unidadPorDefecto(rng.pick(de)));
  const igual = (u: UnidadDeArena): UnidadDeArena => u;
  const sinBarda = (u: UnidadDeArena): UnidadDeArena =>
    u.equipo.armadura === 'barda' ? quitarEnArena(u, 'armadura') : u;
  // Para comparar, no para jugar: sin barda y lo que sumaba la barda en el cuerpo.
  const comoAntes = (u: UnidadDeArena): UnidadDeArena => {
    if (u.equipo.armadura !== 'barda') return u;
    const sin = quitarEnArena(u, 'armadura');
    return { ...sin, defense: sin.defense + 5, hp: sin.hp + 220 };
  };
  const conArmadura: readonly Variante[] = [
    { nombre: 'con barda', con: {}, cambia: igual },
    { nombre: 'sin barda', con: {}, cambia: sinBarda },
    { nombre: 'como antes', con: {}, cambia: comoAntes },
  ];
  return [
    {
      nombre: 'contacto',
      montar: (rng) => {
        const n = () => rng.int(3, LIDERAZGO.maxPorBando);
        return [elegir(rng, TROPA, n()), elegir(rng, TROPA, n())];
      },
      variantes: [
        { nombre: 'libre', con: {}, cambia: igual },
        { nombre: 'paga', con: { contacto: 'paga' }, cambia: igual },
      ],
    },
    {
      nombre: 'carga',
      montar: (rng) => [elegir(rng, TROPA, 4), elegir(rng, TROPA, 4)],
      variantes: [
        { nombre: 'con carga a pie', con: {}, cambia: igual },
        { nombre: 'sin carga a pie', con: { cargaAPie: false }, cambia: igual },
      ],
    },
    {
      nombre: 'armadura: mezcla',
      montar: (rng) => [elegir(rng, HOJAS, 3), elegir(rng, HOJAS, 3)],
      variantes: conArmadura,
    },
    {
      nombre: 'armadura: jinete contra floja',
      montar: (rng) => [elegir(rng, JINETES, 1), elegir(rng, FLOJAS, 3)],
      variantes: conArmadura,
    },
    {
      nombre: 'rueda: mezcla',
      montar: (rng) => [elegir(rng, HOJAS, 3), elegir(rng, HOJAS, 3)],
      variantes: [
        { nombre: 'golpe: azar', con: {}, cambia: igual },
        { nombre: 'golpe: rueda', con: { golpe: 'rueda' }, cambia: igual },
      ],
      conHeroes: true,
    },
  ];
})();

/** Juega la tanda `t` en `semillas` semillas, la IA contra la IA, y cuenta cada variante. */
function medir(t: Tanda, semillas: number): Cuenta[] {
  const cuentas: Cuenta[] = t.variantes.map(() => ({
    ms: 0,
    agotadas: [],
    rondas: [],
    ganaIzquierda: 0,
    golpes: 0,
    parados: 0,
    cargasAPie: 0,
    cargasDeJinete: 0,
    cruces: 0,
  }));
  for (let semilla = 1; semilla <= semillas; semilla++) {
    // El montaje, de su corriente: el mismo para todas las variantes.
    const [izquierda, derecha] = t.montar(createRng(semilla * 7919));
    const orden = t.variantes.map((_, i) => i);
    if (semilla % 2 === 0) orden.reverse();
    for (const i of orden) {
      const v = t.variantes[i] as Variante;
      const c = cuentas[i] as Cuenta;
      const lado = (us: readonly UnidadDeArena[], cual: Lado) => ({
        unidades: us.map((u) => ({ unidad: v.cambia(u) })),
        // Sin libro: con el de serie, sus hechizos acaban la pelea en la primera
        // ronda y nadie llega a golpear.
        heroe: t.conHeroes === true ? { ...heroePorDefecto(cual), hechizos: [] } : null,
      });
      const rng = createRng(semilla);
      const b = batallaDeArena(
        {
          izquierda: lado(izquierda, 'izquierda'),
          derecha: lado(derecha, 'derecha'),
          reglas: REGLAS_DEL_JUEGO,
          muralla: SIN_MURALLA,
          piezas: [],
          modos: v.con,
        },
        rng,
      );
      const t0 = performance.now();
      autoResolve(b, rng);
      c.ms += performance.now() - t0;
      if (causaDelFinal(b) === 'agotada') c.agotadas.push(semilla);
      c.rondas.push(b.round);
      if (b.finished?.winner === 'attacker') c.ganaIzquierda++;
      for (const e of b.log) {
        if (e.kind === 'cruce') c.cruces++;
        if (e.kind !== 'attack' && e.kind !== 'shoot') continue;
        c.golpes++;
        if (e.damage === 0 && (e.parado ?? 0) > 0) c.parados++;
        if (e.kind !== 'attack' || e.retaliation || (e.charge ?? 0) === 0) continue;
        const quien = b.stacks.find((x) => x.id === e.stack);
        if (quien !== undefined && hasTrait(quien.unit, 'charge')) c.cargasDeJinete++;
        else c.cargasAPie++;
      }
    }
  }
  return cuentas;
}

const semillas = Number(process.argv[2] ?? 100);
if (!Number.isInteger(semillas) || semillas < 1) {
  throw new Error(`«${process.argv[2]}» no es un número de semillas: pon un entero de 1 o más`);
}
console.log(`${semillas} peleas por variante, la IA contra la IA (tope ${MAX_ROUNDS} rondas)`);
for (const t of TANDAS) {
  const cuentas = medir(t, semillas);
  console.log(t.nombre);
  for (const [i, c] of cuentas.entries()) {
    const rondas = [...c.rondas].sort((a, b) => a - b);
    const sinTerminar =
      c.agotadas.length === 0 ? '0' : `${c.agotadas.length} (s${c.agotadas.join(', s')})`;
    console.log(
      `  ${(t.variantes[i] as Variante).nombre.padEnd(16)} sin terminar ${sinTerminar}` +
        `; rondas ${rondas[Math.floor(rondas.length / 2)]} / ${rondas.at(-1)} (mediana / máx.)` +
        `; gana la izquierda ${c.ganaIzquierda}; ${(c.ms / semillas).toFixed(1)} ms/pelea` +
        `; cargas a pie ${c.cargasAPie}, de jinete ${c.cargasDeJinete}` +
        `; golpes parados del todo ${c.parados} de ${c.golpes}; cruces de la rueda ${c.cruces}`,
    );
  }
}
