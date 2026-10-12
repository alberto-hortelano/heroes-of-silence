/**
 * Calibración de `fuerzaDe`: ¿la fuerza que estima la IA sigue a la que se ve
 * al pelear? (#182)
 *
 * La IA decide a quién perseguir, a qué grupo atacar y quién embosca a quién
 * comparando dos números (`fuerzaDe`, `poderDe`, `ventajaClara`). Si el número
 * miente, la IA da batallas que pierde. Esto lo mide contra batallas de verdad:
 *
 *  1. juega partidas enteras de IA contra IA en varios lados y saca **fotos**
 *     cada dos días: de cada héroe tal como está —nivel, tropa con su veteranía
 *     y equipo, hechizos— y de cada grupo de asaltantes. Es la distribución que
 *     la IA compara de verdad, no una inventada;
 *  2. empareja fotos y las hace pelear con `autoResolve` **dos veces,
 *     cambiando quién ataca**, con la rendición del héroe abierta como en el
 *     mapa: héroe contra héroe de la otra facción, y héroe contra grupo;
 *  3. para cada peso del cuerpo del héroe de la rejilla (`F = tropa + peso ×
 *     cuerpo`), ajusta una logística `P(gana A) = σ(a + b·ln(F_A/F_B))` y da su
 *     log-pérdida. Con el grupo da además lo que mira `ventajaClara`: de las
 *     batallas en que un bando le saca el margen al otro, cuántas pierde.
 *
 * Lo que dice hoy está escrito en `PESO_DEL_CUERPO` (`src/core/ai/fuerza.ts`),
 * con su fecha. Todo es determinista: misma orden, misma salida.
 *
 * `node:*` aquí vale: esto es `tools/`, no `core`.
 *
 * Uso: npx tsx tools/qa/calibrar-fuerza.ts [parejas=2000] [semillas-por-lado=40]
 */
import {
  armyPower,
  MARGEN_CONTRA_NEUTRALES,
  PESO_DEL_CUERPO,
  poderDe,
  unitPower,
} from '../../src/core/ai/fuerza.js';
import { autoResolve } from '../../src/core/ai/tactics.js';
import { playAiTurn } from '../../src/core/ai/turn.js';
import { type BattleSide, createBattle } from '../../src/core/battle/battle.js';
import type { GrupoDeTropa } from '../../src/core/data.js';
import { rangoDeHeroe } from '../../src/core/hero/experiencia.js';
import { type Hero, heroUnit, luckBonus, moraleBonus } from '../../src/core/hero/hero.js';
import {
  characterOf,
  ejercitoDe,
  type Personajes,
  troopsAsStacks,
} from '../../src/core/hero/troop.js';
import { createRng } from '../../src/core/rng.js';
import { combatProfile } from '../../src/core/rpg/stats.js';
import { newGame } from '../../src/core/state/setup.js';

const PAREJAS = Number(process.argv[2] ?? 2000);
const SEMILLAS = Number(process.argv[3] ?? 40);
/** Lados de mapa de los que salen las fotos: el de siempre y dos que alargan la partida (y suben a los héroes). */
const LADOS = [34, 44, 56] as const;
const PESOS = [0.25, 0.4, 0.5, 0.6, 0.75, 1, 1.25, 1.5] as const;
const TRAMOS = [1, 1.1, 1.25, 1.6, 2.5, Number.POSITIVE_INFINITY] as const;
/** Desde qué nivel un héroe sin tropa es «muy subido»: el caso de #182. */
const NIVEL_DE_SUBIDO = 10;
/**
 * Héroe contra grupo, solo con razones entre estas: fuera de ahí la batalla
 * está decidida con cualquier peso y solo diluye la medida.
 */
const RAZON_CON_GRUPO = [0.4, 4] as const;

interface Foto {
  readonly hero: Hero;
  readonly characters: Personajes;
}

const fotos: Foto[] = [];
const grupos: (readonly GrupoDeTropa[])[] = [];
for (const lado of LADOS) {
  for (let semilla = 1; semilla <= SEMILLAS; semilla++) {
    const state = newGame({ seed: semilla, width: lado, height: lado, maxDays: 300 });
    const ctx = { rng: createRng(semilla) };
    let ultimo = -1;
    while (state.finished === null) {
      await playAiTurn(state, ctx);
      if (state.day === ultimo || state.day % 2 !== 0) continue;
      ultimo = state.day;
      for (const h of state.heroes) {
        // Solo los personajes que lleva: la foto tiene que poder pelear sola.
        const suyos: Record<string, NonNullable<Personajes>[string]> = {};
        for (const t of h.army) {
          if (t.member !== undefined)
            suyos[t.member] = characterOf(state.characters, t.member, 'la foto');
        }
        fotos.push({ hero: structuredClone(h), characters: structuredClone(suyos) });
      }
      for (const r of state.raiders) grupos.push(structuredClone(r.troops));
    }
  }
}

/** El bando como lo monta el mapa (`battleSideForHero`), con la rendición abierta. */
function bando(f: Foto): BattleSide {
  const members = new Map(
    f.hero.army.flatMap((t) => {
      if (t.member === undefined) return [];
      const c = characterOf(f.characters, t.member, 'la foto');
      return [[t.member, { profile: combatProfile(c), hp: c.hp }] as const];
    }),
  );
  return {
    ...(members.size === 0 ? {} : { members }),
    army: troopsAsStacks(f.hero.army),
    hero: {
      cuerpo: heroUnit(f.hero),
      mando: {
        name: f.hero.name,
        retreat: { purse: Number.MAX_SAFE_INTEGER },
        ataque: f.hero.attack,
        defensa: f.hero.defense,
        spellPower: f.hero.spellPower,
        knowledge: f.hero.knowledge,
        mana: f.hero.mana,
        castThisRound: false,
        spells: f.hero.spells,
      },
    },
    moraleBonus: moraleBonus(f.hero),
    luckBonus: luckBonus(f.hero),
  };
}

/** Las dos piezas de `fuerzaDe`, por separado, para poder pesarlas. */
interface Pieza {
  readonly tropa: number;
  readonly cuerpo: number;
  /** Sin tropa y de nivel ≥ `NIVEL_DE_SUBIDO`. */
  readonly solo: boolean;
}

const piezas = (f: Foto): Pieza => ({
  tropa: armyPower(f.hero.army, f.characters),
  cuerpo: unitPower(heroUnit(f.hero)),
  solo: f.hero.army.length === 0 && rangoDeHeroe(f.hero) >= NIVEL_DE_SUBIDO,
});

const fuerza = (p: Pieza, peso: number): number => p.tropa + peso * p.cuerpo;

interface Fila {
  readonly a: Pieza;
  /** El rival: otro héroe, o un grupo (`cuerpo` 0, y el peso no lo toca). */
  readonly b: Pieza;
  /** 0, 0,5 o 1: lo que ganó A en las dos batallas. */
  readonly ganaA: number;
}

/** Las dos batallas de una pareja, cambiando quién ataca: lo que gana `a`. */
function pelear(a: BattleSide, b: BattleSide, rng: ReturnType<typeof createRng>): number {
  let gana = 0;
  for (const aAtaca of [true, false]) {
    const { winner } = autoResolve(createBattle(aAtaca ? a : b, aAtaca ? b : a, rng), rng);
    if ((winner === 'attacker') === aAtaca) gana += 0.5;
  }
  return gana;
}

const rng = createRng(182);
const contraHeroe: Fila[] = [];
while (contraHeroe.length < PAREJAS) {
  const a = fotos[rng.int(0, fotos.length - 1)];
  const b = fotos[rng.int(0, fotos.length - 1)];
  if (a === undefined || b === undefined) throw new Error('no hay fotos de héroes');
  if (a.hero.faction === b.hero.faction) continue;
  contraHeroe.push({ a: piezas(a), b: piezas(b), ganaA: pelear(bando(a), bando(b), rng) });
}

const contraGrupo: Fila[] = [];
while (contraGrupo.length < PAREJAS) {
  const a = fotos[rng.int(0, fotos.length - 1)];
  const g = grupos[rng.int(0, grupos.length - 1)];
  if (a === undefined || g === undefined) throw new Error('no hay fotos de héroes o de grupos');
  const yo = piezas(a);
  const suya = poderDe({ troops: g });
  const razon = fuerza(yo, 1) / suya;
  if (razon < RAZON_CON_GRUPO[0] || razon > RAZON_CON_GRUPO[1]) continue;
  const grupo: BattleSide = { army: troopsAsStacks(ejercitoDe(g)), hero: null };
  contraGrupo.push({
    a: yo,
    b: { tropa: suya, cuerpo: 0, solo: false },
    ganaA: pelear(bando(a), grupo, rng),
  });
}

const sigma = (z: number): number => 1 / (1 + Math.exp(-z));

/** Logística de una variable por descenso de gradiente: sin dependencias y de sobra para 2 parámetros. */
function ajustar(
  xs: readonly number[],
  ys: readonly number[],
): { a: number; b: number; ll: number } {
  let a = 0;
  let b = 1;
  for (let it = 0; it < 3000; it++) {
    let ga = 0;
    let gb = 0;
    xs.forEach((x, i) => {
      const e = sigma(a + b * x) - (ys[i] ?? 0);
      ga += e;
      gb += e * x;
    });
    a -= (0.5 * ga) / xs.length;
    b -= (0.5 * gb) / xs.length;
  }
  let ll = 0;
  xs.forEach((x, i) => {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, sigma(a + b * x)));
    const y = ys[i] ?? 0;
    ll -= y * Math.log(p) + (1 - y) * Math.log(1 - p);
  });
  return { a, b, ll: ll / xs.length };
}

const pct = (n: number, de: number): string =>
  de === 0 ? '-' : `${((100 * n) / de).toFixed(1)} %`;

console.log(
  `fotos: ${fotos.length} de héroes y ${grupos.length} de grupos, de ${SEMILLAS} semillas × lados ${LADOS.join(', ')}`,
);
console.log(`parejas: ${PAREJAS} de cada clase, cada una peleada dos veces cambiando quién ataca`);

console.log('');
console.log('== héroe contra héroe');
let mejor = { peso: Number.NaN, ll: Number.POSITIVE_INFINITY };
for (const peso of PESOS) {
  const xs = contraHeroe.map((r) => Math.log(fuerza(r.a, peso) / fuerza(r.b, peso)));
  const ys = contraHeroe.map((r) => r.ganaA);
  const { b, ll } = ajustar(xs, ys);
  let acierto = 0;
  const tramos = TRAMOS.slice(0, -1).map(() => ({ n: 0, gana: 0 }));
  xs.forEach((x, i) => {
    const ganaElFuerte = x >= 0 ? (ys[i] ?? 0) : 1 - (ys[i] ?? 0);
    acierto += ganaElFuerte;
    const razon = Math.exp(Math.abs(x));
    const t = tramos[TRAMOS.findIndex((c, k) => razon >= c && razon < (TRAMOS[k + 1] ?? c))];
    if (t === undefined) throw new Error(`razón fuera de los tramos: ${razon}`);
    t.n++;
    t.gana += ganaElFuerte;
  });
  if (ll < mejor.ll) mejor = { peso, ll };
  const marca = peso === PESO_DEL_CUERPO ? ' ← PESO_DEL_CUERPO' : '';
  console.log(
    `peso ${peso.toFixed(2)}: log-pérdida ${ll.toFixed(4)}  acierto ${pct(acierto, xs.length)}  pendiente ${b.toFixed(2)}${marca}`,
  );
  console.log(
    `   gana el fuerte por razón: ${tramos
      .map((t, k) => `[${TRAMOS[k]}, ${TRAMOS[k + 1]}) ${t.n} → ${pct(t.gana, t.n)}`)
      .join(' · ')}`,
  );
}
console.log(`mejor peso contra un héroe: ${mejor.peso} (log-pérdida ${mejor.ll.toFixed(4)})`);

// El caso de #182, aparte: un héroe muy subido sin tropa contra uno con ella.
const solos = contraHeroe.flatMap((r) =>
  r.a.solo === r.b.solo ? [] : [r.a.solo ? r : { a: r.b, b: r.a, ganaA: 1 - r.ganaA }],
);
console.log(
  `héroe sin tropa de nivel ≥ ${NIVEL_DE_SUBIDO} contra uno con tropa: ${solos.length} parejas, gana el ${pct(
    solos.reduce((t, r) => t + r.ganaA, 0),
    solos.length,
  )}`,
);
for (const peso of PESOS) {
  const fuerte = solos.filter((r) => fuerza(r.a, peso) >= fuerza(r.b, peso)).length;
  console.log(`   con peso ${peso}, se le da por el más fuerte en el ${pct(fuerte, solos.length)}`);
}

console.log('');
console.log(
  `== héroe contra grupo de asaltantes (razón con peso 1 entre ${RAZON_CON_GRUPO.join(' y ')})`,
);
mejor = { peso: Number.NaN, ll: Number.POSITIVE_INFINITY };
const margen = Math.log(MARGEN_CONTRA_NEUTRALES);
for (const peso of PESOS) {
  const xs = contraGrupo.map((r) => Math.log(fuerza(r.a, peso) / fuerza(r.b, peso)));
  const ys = contraGrupo.map((r) => r.ganaA);
  const { a, b, ll } = ajustar(xs, ys);
  // Lo que mira `ventajaClara`, en las dos direcciones: el héroe ataca si le
  // saca el margen; el grupo embosca si es él quien se lo saca.
  let heroe = 0;
  let pierdeHeroe = 0;
  let grupo = 0;
  let pierdeGrupo = 0;
  xs.forEach((x, i) => {
    const y = ys[i] ?? 0;
    if (x > margen) {
      heroe++;
      pierdeHeroe += 1 - y;
    }
    if (x < -margen) {
      grupo++;
      pierdeGrupo += y;
    }
  });
  if (ll < mejor.ll) mejor = { peso, ll };
  const marca = peso === PESO_DEL_CUERPO ? ' ← PESO_DEL_CUERPO' : '';
  console.log(
    `peso ${peso.toFixed(2)}: log-pérdida ${ll.toFixed(4)}  sesgo ${a.toFixed(2)}  pendiente ${b.toFixed(2)} | con margen el héroe: ${heroe}, pierde ${pct(pierdeHeroe, heroe)} | con margen el grupo: ${grupo}, pierde ${pct(pierdeGrupo, grupo)}${marca}`,
  );
}
console.log(`mejor peso contra un grupo: ${mejor.peso} (log-pérdida ${mejor.ll.toFixed(4)})`);
