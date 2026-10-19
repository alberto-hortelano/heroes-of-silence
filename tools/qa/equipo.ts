/**
 * El equipo, medido: cuánto dura la partida, quién gana y por dónde se mueven las
 * piezas, en 100 semillas de la IA contra sí misma. Cien y no mil por decisión
 * del usuario (02-10-2026): quedan cambios grandes y la medida tiene que poder
 * repetirse a menudo (2 s y no 19). Con mil se eligió el puesto de la armería en
 * la lista de construcción; lo que se publica en CLAUDE.md es de cien.
 *
 * Es la medida que pidió el ciclo del equipo antes de re-anclar el banco: el
 * equipo base sube las cifras de todo héroe desde el día 1, así que el
 * equilibrio se mueve y hay que publicarlo antes de darlo por bueno —sin
 * compensar nada por cuenta propia—. Imprime una fila con:
 *
 *  - la duración —mediana, p90 y máximo— y las que no terminan;
 *  - cuántas gana el jugador 0 (el caballero);
 *  - las emboscadas por partida;
 *  - las piezas por partida: las de serie (las del equipo base, `EQUIPO_BASE`,
 *    por héroe que nace), las de botín (entre paréntesis, las que van sobre otra),
 *    las compradas —con su reparto entre partidas, mediana / p90 / máximo, y en
 *    cuántas se compra algo: la media sola escondía que 1 187 compras del banco
 *    salían de 14 semillas atascadas comprando 18 piezas al día—, las que la tropa lleva puestas al acabar y las que se han
 *    perdido —con quien murió, con el héroe que cayó sin base o con la
 *    guarnición de una ciudad tomada—;
 *  - en cuántas partidas se levanta la armería, y el día mediano en que se hace;
 *  - y en cuántas se levanta la morada 5, que es lo que avisaría de que comprar
 *    piezas le está quitando el oro a la cadena de moradas.
 *
 * «Perdidas» se cuenta por diferencia —lo que entró menos lo que queda puesto o
 * en una mochila al acabar— porque equipar no es un hecho de la crónica: es
 * estado, como la patrulla de un asaltante. Contar desde fuera no cambia la
 * partida: se lee el estado y la crónica al terminar, sin una tirada de más.
 *
 * Uso: npx tsx tools/qa/equipo.ts [semillas=100] [lado=28] [desde=1] [dias=300]
 */
import { playAiGame } from '../../src/core/ai/turn.js';
import { esPiezaConBase } from '../../src/core/data.js';
import {
  EQUIPO_BASE,
  EQUIPO_DEL_JUEGO,
  idsPuestos,
  piezasPuestas,
} from '../../src/core/hero/equipo.js';
import { createRng } from '../../src/core/rng.js';
import { newGame } from '../../src/core/state/setup.js';
import { duracion, mediana } from './estadistica.js';

const SEMILLAS = Number(process.argv[2] ?? 100);
const LADO = Number(process.argv[3] ?? 28);
const DESDE = Number(process.argv[4] ?? 1);
const DIAS = Number(process.argv[5] ?? 300);

const dias: number[] = [];
let sinTerminar = 0;
let ganaJ0 = 0;
let emboscadas = 0;
let deSerie = 0;
let botin = 0;
let botinSobreOtra = 0;
/** Cuántas piezas trae puestas cada héroe que nace (`EQUIPO_BASE`). */
const DE_SERIE_POR_HEROE = idsPuestos(EQUIPO_BASE).length;
let compradas = 0;
const compradasPorPartida: number[] = [];
let puestasEnTropa = 0;
let perdidas = 0;
let conArmeria = 0;
let conMorada5 = 0;
const diaDeArmeria: number[] = [];
const t0 = performance.now();

for (let semilla = DESDE; semilla < DESDE + SEMILLAS; semilla++) {
  const state = newGame({ seed: semilla, maxDays: DIAS, width: LADO, height: LADO });
  // Los héroes con los que nace la partida traen su equipo de serie.
  let entraron = state.heroes.length * 3;
  deSerie += state.heroes.length * DE_SERIE_POR_HEROE;
  await playAiGame(state, { rng: createRng(semilla) });
  if (state.finished === null) throw new Error('playAiGame volvió sin terminar la partida');

  let dia = 1;
  let armeria: number | null = null;
  let morada5 = false;
  let compradasAqui = 0;
  for (const e of state.log) {
    if (e.kind === 'day_start') dia = e.day;
    if (e.kind === 'hero_hired' || e.kind === 'hero_promoted') {
      entraron += DE_SERIE_POR_HEROE;
      deSerie += DE_SERIE_POR_HEROE;
    }
    if (e.kind === 'loot_found') {
      entraron++;
      botin++;
      const escrita = EQUIPO_DEL_JUEGO.escritas.get(e.item);
      if (escrita !== undefined && esPiezaConBase(escrita)) botinSobreOtra++;
    }
    if (e.kind === 'item_bought') {
      entraron++;
      compradas++;
      compradasAqui++;
    }
    if (e.kind === 'battle_started' && e.attacker.kind === 'raider') emboscadas++;
    if (e.kind === 'built' && e.building === 'armory' && armeria === null) armeria = dia;
    if (e.kind === 'built' && e.building.endsWith('_dwelling_5')) morada5 = true;
  }
  compradasPorPartida.push(compradasAqui);
  if (morada5) conMorada5++;
  if (armeria !== null) {
    conArmeria++;
    diaDeArmeria.push(armeria);
  }

  // Lo que queda al acabar: puesto en héroes, en mochilas y en la tropa de los
  // héroes y de las guarniciones.
  let quedan = 0;
  let enTropa = 0;
  for (const h of state.heroes) {
    quedan += piezasPuestas(h.equipo).length + h.mochila.length;
    for (const t of h.army) enTropa += piezasPuestas(t.veterania?.equipo).length;
  }
  for (const town of state.towns) {
    for (const t of town.garrison) enTropa += piezasPuestas(t.veterania?.equipo).length;
  }
  quedan += enTropa;
  puestasEnTropa += enTropa;
  perdidas += entraron - quedan;

  if (state.finished.winner === null) sinTerminar++;
  if (state.finished.winner === 0) ganaJ0++;
  dias.push(state.day);
}

const ms = performance.now() - t0;
const porPartida = (x: number): string => (x / SEMILLAS).toFixed(2).replace('.', ',');
console.log(
  '| lado | días (mediana / p90 / máx) | sin terminar | gana j0 | emboscadas/partida | de serie | botín (sobre otra) | compradas | compradas por partida (mediana / p90 / máx) · partidas con alguna | puestas en tropa al acabar | perdidas | con armería (día mediano) | con morada 5 | tiempo |',
);
console.log(
  [
    `| ${LADO}`,
    duracion(dias),
    `${sinTerminar}/${SEMILLAS}`,
    `${ganaJ0}`,
    porPartida(emboscadas),
    porPartida(deSerie),
    `${porPartida(botin)} (${porPartida(botinSobreOtra)})`,
    porPartida(compradas),
    `${duracion(compradasPorPartida)} · ${compradasPorPartida.filter((n) => n > 0).length}`,
    porPartida(puestasEnTropa),
    porPartida(perdidas),
    `${conArmeria} (${diaDeArmeria.length === 0 ? '—' : mediana(diaDeArmeria)})`,
    `${conMorada5}`,
    `${(ms / 1000).toFixed(1).replace('.', ',')} s |`,
  ].join(' | '),
);
