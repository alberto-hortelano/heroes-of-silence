/**
 * Qué hechizos lanza la IA de reglas en partida, y a quién.
 *
 * Lee SOLO la crónica (`battle_ended.casts`, #93), con el bucle del banco
 * (`partidaDeSemilla`): ni arnés propio ni un contador dentro de `core`. Existe
 * por #92 —en 100 partidas, 1 471 lanzamientos y los 1 471 Flecha mágica— y es
 * la cifra que hay que mirar al tocar cómo valora los hechizos `tactics.ts`;
 * si eso gana o no batallas lo dice `enfrentamiento.ts --magia`, no esto.
 *
 * Uso: npx tsx tools/qa/hechizos-de-partida.ts [partidas=100]
 */
import { HERO_BODY } from '../../src/core/battle/types.js';
import { DIAS_POR_DEFECTO, partidaDeSemilla } from './partidas.js';

const N = Number(process.argv[2] ?? 100);
if (!Number.isInteger(N) || N < 1) {
  throw new Error(
    `el número de partidas tiene que ser un entero positivo, no "${process.argv[2]}"`,
  );
}

let batallas = 0;
let conHechizo = 0;
let lanzados = 0;
let muertos = 0;
let rondas = 0;
let partidasConHechizo = 0;
const porHechizo = new Map<string, number>();
const porBando = { attacker: 0, defender: 0 };
/** Al héroe o a la tropa: matar al héroe gana la batalla. */
const porObjetivo = { heroe: 0, tropa: 0 };

for (let semilla = 1; semilla <= N; semilla++) {
  const { state } = await partidaDeSemilla(semilla, DIAS_POR_DEFECTO);
  let enEsta = 0;
  for (const e of state.log) {
    if (e.kind !== 'battle_ended') continue;
    batallas++;
    rondas += e.rounds;
    if (e.casts.length > 0) conHechizo++;
    for (const c of e.casts) {
      lanzados++;
      enEsta++;
      muertos += c.killed;
      porBando[c.side]++;
      if (c.target === HERO_BODY) porObjetivo.heroe++;
      else porObjetivo.tropa++;
      porHechizo.set(c.spell, (porHechizo.get(c.spell) ?? 0) + 1);
    }
  }
  if (enEsta > 0) partidasConHechizo++;
}

const lista = [...porHechizo]
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${v}`)
  .join(', ');
console.log(`${N} partidas, ${batallas} batallas, ${rondas} rondas`);
console.log(
  `hechizos lanzados: ${lanzados} en ${conHechizo} batallas y ${partidasConHechizo} partidas; matan ${muertos}`,
);
console.log(`por bando: atacante ${porBando.attacker}, defensor ${porBando.defender}`);
console.log(`por objetivo: al héroe ${porObjetivo.heroe}, a la tropa ${porObjetivo.tropa}`);
console.log(`por hechizo: ${lista || 'ninguno'}`);
