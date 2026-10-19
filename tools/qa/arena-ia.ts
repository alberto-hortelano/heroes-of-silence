/**
 * La IA contra la IA en la arena, con las reglas del juego (la rueda del golpe,
 * salir del contacto, la carga a pie y la armadura, #259, #260, #262, siempre
 * desde el 19-10-2026): cuántas peleas no terminan, cuánto duran y qué pasa en
 * ellas, sobre `autoResolve` (el bucle de la IA, el mismo de la página) y
 * `causaDelFinal` («agotada» = la que no termina: sin vencido, por el tope de
 * rondas o de jugadas).
 *
 *     npx tsx tools/qa/arena-ia.ts [semillas=100]
 *
 * Cuatro tandas, cada una con sus montajes de su propia corriente de azar, sin
 * muralla:
 *
 * - **mezcla**: de 3 a `LIDERAZGO.maxPorBando` hojas de tropa por bando.
 * - **armadura**: tres contra tres de todas las hojas (mezcla) y un jinete contra
 *   tres de arco, ballesta o bastón, con la barda, sin ella y como antes de #262
 *   (sin barda y con lo que sumaba, +5 de defensa y +220 PV, en el cuerpo);
 *   cuenta los golpes que la armadura paró enteros.
 * - **con héroes**: tres contra tres de todas las hojas, con un héroe por bando
 *   sin libro (que pega con la Espada).
 *
 * Cuenta en todas las cargas a pie y del jinete, los golpes parados y los cruces
 * de la rueda. Las variantes de reglas (contacto libre, sin carga a pie, golpe al
 * azar) se fueron con los interruptores. Las variantes se alternan por semilla,
 * para que la carga de la máquina (compartida) caiga igual en todas.
 */
import { resolve } from 'node:path';
import { autoResolve } from '../../src/core/ai/tactics.js';
import { batallaDeArena, heroePorDefecto, type Lado, quitarEnArena } from '../../src/core/arena.js';
import { causaDelFinal, MAX_ROUNDS } from '../../src/core/battle/battle.js';
import { SIN_MURALLA } from '../../src/core/battle/muralla.js';
import { unidad } from '../../src/core/catalogo.js';
import { hasTrait, LIDERAZGO } from '../../src/core/data.js';
import { EQUIPO_DEL_JUEGO } from '../../src/core/hero/equipo.js';
import { createRng, type Rng } from '../../src/core/rng.js';
import type { Hoja, Unidad } from '../../src/core/unidad.js';
import { hojasDelTaller } from '../arena/borrador.js';

/** Un montaje de la medida: las unidades de cada bando. */
type Montaje = readonly [readonly Unidad[], readonly Unidad[]];

/** Una variante: lo que se le cambia a cada unidad. */
interface Variante {
  readonly nombre: string;
  readonly cambia: (u: Unidad) => Unidad;
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

const HOJAS = hojasDelTaller(resolve(import.meta.dirname, '../..'));
// Solo la tropa: los héroes no tienen unidad en el catálogo, que es de donde salen las cifras.
const TROPA = HOJAS.filter((h) => !h.heroe);
const JINETES = TROPA.filter((h) => h.perfil.startsWith('montado-'));
const FLOJAS = TROPA.filter((h) => ['arco', 'ballesta', 'baston'].includes(h.perfil));

const TANDAS: readonly Tanda[] = (() => {
  const elegir = (rng: Rng, de: readonly Hoja[], n: number): Unidad[] =>
    // Las cifras, del catálogo: la misma fuente que la arena y el juego.
    Array.from({ length: n }, () => unidad(rng.pick(de).id));
  const igual = (u: Unidad): Unidad => u;
  const sinBarda = (u: Unidad): Unidad =>
    u.equipo.armadura === 'barda' ? quitarEnArena(u, 'armadura') : u;
  // Para comparar, no para jugar: sin barda y lo que sumaba la barda en el cuerpo.
  const comoAntes = (u: Unidad): Unidad => {
    if (u.equipo.armadura !== 'barda') return u;
    const sin = quitarEnArena(u, 'armadura');
    return { ...sin, defense: sin.defense + 5, hp: sin.hp + 220 };
  };
  const conArmadura: readonly Variante[] = [
    { nombre: 'con barda', cambia: igual },
    { nombre: 'sin barda', cambia: sinBarda },
    { nombre: 'como antes', cambia: comoAntes },
  ];
  const elJuego: readonly Variante[] = [{ nombre: 'el juego', cambia: igual }];
  return [
    {
      nombre: 'mezcla',
      montar: (rng) => {
        const n = () => rng.int(3, LIDERAZGO.maxPorBando);
        return [elegir(rng, TROPA, n()), elegir(rng, TROPA, n())];
      },
      variantes: elJuego,
    },
    {
      nombre: 'armadura: mezcla',
      montar: (rng) => [elegir(rng, TROPA, 3), elegir(rng, TROPA, 3)],
      variantes: conArmadura,
    },
    {
      nombre: 'armadura: jinete contra floja',
      montar: (rng) => [elegir(rng, JINETES, 1), elegir(rng, FLOJAS, 3)],
      variantes: conArmadura,
    },
    {
      nombre: 'con héroes',
      montar: (rng) => [elegir(rng, TROPA, 3), elegir(rng, TROPA, 3)],
      variantes: elJuego,
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
      const lado = (us: readonly Unidad[], cual: Lado) => ({
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
          muralla: SIN_MURALLA,
          equipo: EQUIPO_DEL_JUEGO,
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
