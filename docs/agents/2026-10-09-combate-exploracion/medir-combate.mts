/**
 * Medida del combate en partidas IA contra IA. Juega cada semilla como
 * `partidaDeSemilla` (misma rng, mismo bucle), pero con un `takeover` que
 * solo mira: captura la batalla, llama a `resolvePendingBattle` igual que el
 * respaldo y lee su registro. No cambia ni una tirada.
 *
 * Uso: npx tsx medir.ts [desde=1] [hasta=100] [dias=300]
 */
import { playAiTurn } from '../../../src/core/ai/turn.ts';
import { createRng } from '../../../src/core/rng.ts';
import { newGame } from '../../../src/core/state/setup.ts';
import {
  resolvePendingBattle,
  type GameState,
} from '../../../src/core/state/game.ts';
import { hasTrait, isShooter } from '../../../src/core/data.ts';
import { stackHp } from '../../../src/core/battle/damage.ts';
import { canReachMelee } from '../../../src/core/battle/battle.ts';
import { hexDistance } from '../../../src/core/battle/board.ts';
import type { BattleStack, BattleState } from '../../../src/core/battle/types.ts';

const [desde = 1, hasta = 100, dias = 300] = process.argv.slice(2).map(Number);

const C: Record<string, number> = {};
const inc = (k: string, n = 1): void => {
  C[k] = (C[k] ?? 0) + n;
};
const rondas: number[] = [];
const rondasPorTipo: Record<string, number[]> = {};
const perdidaGanador: number[] = [];
const cuerpos: Record<string, number> = {};
const cuerposActuan: Record<string, number> = {};
const cuerposMueren: Record<string, number> = {};
const tamano: number[] = [];

function vidaInicial(b: BattleState): Map<string, number> {
  return new Map(b.stacks.map((s) => [s.id, stackHp(s)]));
}

function medirBatalla(state: GameState, b: BattleState, vida0: Map<string, number>, tipo: string, pos0: Map<string, {col:number,row:number}>): void {
  const pos = new Map(pos0);
  const ultimo = new Map<string,string>();
  const herido = new Set<string>();
  const byId = new Map(b.stacks.map((s) => [s.id, s]));
  const fin = b.finished!;
  const ganador = fin.winner;
  inc('batallas');
  inc(`tipo:${tipo}`);
  rondas.push(b.round);
  (rondasPorTipo[tipo] ??= []).push(b.round);
  tamano.push(b.stacks.length);
  // Final
  const heroeMuerto = (side: string): boolean =>
    b.stacks.some((s) => s.side === side && s.origen.kind === 'heroe' && s.count === 0);
  const perdedor = ganador === 'attacker' ? 'defender' : 'attacker';
  const tropaPerdedoraViva = b.stacks.some(
    (s) => s.side === perdedor && s.origen.kind !== 'heroe' && s.count > 0,
  );
  const finK = fin.surrender ? 'rendicion' : heroeMuerto(perdedor) ? (tropaPerdedoraViva ? 'comandante_con_tropa' : 'comandante_y_todo') : 'aniquilacion';
  inc(`finPorTipo:${tipo}:${finK}`);
  inc(`ganaPorTipo:${tipo}:${ganador}`);
  if (fin.surrender) inc('fin:rendicion');
  else if (heroeMuerto(perdedor) && tropaPerdedoraViva) inc('fin:comandante_con_tropa_viva');
  else if (heroeMuerto(perdedor)) inc('fin:comandante_y_todo');
  else if (b.round >= 100) inc('fin:agotamiento');
  else inc('fin:aniquilacion');
  if (b.heroes[perdedor] !== null && !heroeMuerto(perdedor) && !fin.surrender) inc('fin:perdedor_con_heroe_vivo?');
  inc(`gana:${ganador}`);
  // Pérdidas del ganador
  let hp0 = 0;
  let hp1 = 0;
  let muertosG = 0;
  for (const s of b.stacks) {
    if (s.side !== ganador) continue;
    hp0 += vida0.get(s.id)!;
    hp1 += stackHp(s);
    muertosG += s.initialCount - s.count;
  }
  const frac = hp0 === 0 ? 0 : 1 - hp1 / hp0;
  perdidaGanador.push(frac);
  if (muertosG === 0) inc('ganador:sin_bajas');
  if (frac === 0) inc('ganador:sin_un_rasguno');
  if (muertosG === 0 && frac < 0.1) inc('ganador:aplastante(<10%PV,0 bajas)');
  if (frac >= 0.5) inc('ganador:reñida(>=50%PV)');
  // Tamaño
  for (const s of b.stacks) {
    const k = s.origen.kind === 'heroe' ? 'HEROE' : s.body;
    cuerpos[k] = (cuerpos[k] ?? 0) + 1;
    if (s.count === 0) cuerposMueren[k] = (cuerposMueren[k] ?? 0) + 1;
  }
  const actuo = new Set<string>();
  // Registro
  for (const e of b.log) {
    inc(`ev:${e.kind}`);
    switch (e.kind) {
      case 'attack': {
        const a = byId.get(e.stack)!;
        const t = byId.get(e.target)!;
        if (!e.retaliation) {
          if (isShooter(t.unit)) inc('melee:contra_tirador');
          if (t.origen.kind === 'heroe') inc('melee:contra_heroe');
          if (herido.has(t.id)) inc('melee:a_herido');
          if (ultimo.get(e.stack) === 'wait') inc('espera->golpea');
          ultimo.set(e.stack, 'attack');
        }
        if (e.killed > 0 || t.count === 0) {} else herido.add(t.id);
        actuo.add(e.stack);
        if (e.retaliation) inc('golpe:represalia');
        else inc('golpe:cuerpo_a_cuerpo');
        if (e.charge) inc(`rasgo:charge(${e.charge})`);
        if (!e.retaliation && hasTrait(a.unit, 'double_attack')) inc('rasgo:double_attack(golpes)');
        if (!e.retaliation && hasTrait(a.unit, 'life_drain')) inc('rasgo:life_drain(golpes)');
        if (!e.retaliation && hasTrait(a.unit, 'bane_undead') && hasTrait(t.unit, 'undead')) inc('rasgo:bane_undead');
        if (!e.retaliation && hasTrait(a.unit, 'no_retaliation')) inc('rasgo:no_retaliation(golpes)');
        if (!e.retaliation && isShooter(a.unit)) inc('golpe:tirador_cuerpo_a_cuerpo');
        if (a.origen.kind === 'heroe' && !e.retaliation) inc('heroe:golpea');
        if (t.origen.kind === 'heroe') inc('heroe:recibe_golpe');
        if (charge(e)) {}
        break;
      }
      case 'shoot':
        actuo.add(e.stack);
        if (e.splash) {
          inc('rasgo:splash_shot(salpicados)');
          const a = byId.get(e.stack)!;
          const t = byId.get(e.target)!;
          if (a.side === t.side) inc('rasgo:splash_fuego_amigo');
        } else {
          inc('golpe:disparo');
          {
            const a = byId.get(e.stack)!; const t = byId.get(e.target)!;
            const d = hexDistance(pos.get(a.id)!, pos.get(t.id)!);
            if (d > 5) inc('disparo:lejano(>5,mitad)');
            if (isShooter(t.unit)) inc('disparo:contra_tirador');
            if (t.origen.kind === 'heroe') inc('disparo:contra_heroe');
          }
          herido.add(e.target);
          if (hasTrait(byId.get(e.stack)!.unit, 'double_shot')) inc('rasgo:double_shot(disparos)');
          if (byId.get(e.target)!.origen.kind === 'heroe') inc('heroe:recibe_disparo');
        }
        break;
      case 'cast':
        inc(`hechizo:${e.spell}`);
        if (e.target && byId.get(e.target)!.origen.kind === 'heroe') inc('hechizo:al_heroe');
        break;
      case 'morale':
        inc(e.good ? 'moral:buena' : 'moral:mala');
        break;
      case 'luck':
        inc(e.good ? 'suerte:buena' : 'suerte:mala');
        break;
      case 'effect':
        inc(`efecto:${e.source}`);
        break;
      case 'immune':
        inc(`inmune:${e.source}`);
        break;
      case 'move':
        actuo.add(e.stack);
        pos.set(e.stack, e.to);
        if (ultimo.get(e.stack) === 'wait') inc('espera->mueve');
        ultimo.set(e.stack, 'move');
        if (hasTrait(byId.get(e.stack)!.unit, 'flying')) inc('rasgo:flying(movs)');
        if (byId.get(e.stack)!.origen.kind === 'heroe') inc('heroe:se_mueve');
        break;
      case 'wait':
        ultimo.set(e.stack, 'wait');
        inc(isShooter(byId.get(e.stack)!.unit) ? 'espera:tirador' : 'espera:otro');
        break;
      case 'defend':
        actuo.add(e.stack);
        break;
      default:
    }
  }
  for (const s of b.stacks) {
    const k = s.origen.kind === 'heroe' ? 'HEROE' : s.body;
    if (actuo.has(s.id)) cuerposActuan[k] = (cuerposActuan[k] ?? 0) + 1;
    if (isShooter(s.unit)) {
      inc('tirador:stacks');
      if (s.shotsLeft === 0) inc('tirador:sin_flechas_al_final');
    }
  }
  // Moral de partida
  for (const s of b.stacks) {
    if (s.origen.kind === 'heroe') continue;
    inc(`moralInicial:${s.morale}`);
    inc(`suerteInicial:${s.luck}`);
  }
  if (b.heroes.attacker || b.heroes.defender) {
    for (const side of ['attacker', 'defender'] as const) {
      const h = b.heroes[side];
      if (h) {
        inc(`heroe:poder${h.spellPower}`);
        inc(`heroe:libro${h.spells.length}`);
      }
    }
  }
  void state;
}
function charge(_: unknown): boolean {
  return false;
}

function tipoDe(state: GameState): string {
  const p = state.pendingBattle!;
  const a = p.attacker.kind;
  const f = p.foe.kind;
  return `${a}->${f}`;
}

const t0 = Date.now();
let sinTerminar = 0;
for (let seed = desde; seed <= hasta; seed++) {
  const state = newGame({ seed, maxDays: dias });
  const ctx = { rng: createRng(seed) };
  const takeover = async (st: GameState): Promise<void> => {
    const p = st.pendingBattle!;
    const b = p.battle;
    const tipo = tipoDe(st);
    const vida0 = vidaInicial(b);
    const pos0 = new Map(b.stacks.map((s) => [s.id, { ...s.hex }]));
    // Lo mismo que hace el respaldo en `playAiTurn`.
    resolvePendingBattle(st, ctx);
    medirBatalla(st, b, vida0, tipo, pos0);
  };
  while (state.finished === null) await playAiTurn(state, ctx, { takeover });
  if (state.finished.winner === null) sinTerminar++;
  inc('partidas');
  inc('dias_total', state.day);
}

const pct = (a: number, b: number): string => `${((100 * a) / b).toFixed(1)} %`;
const q = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
};
const N = C.batallas ?? 0;
console.log(`semillas ${desde}-${hasta}, ${N} batallas, ${(Date.now() - t0) / 1000}s, sin terminar ${sinTerminar}`);
console.log(`rondas: media ${(rondas.reduce((a, b) => a + b, 0) / N).toFixed(2)} p50 ${q(rondas, 0.5)} p90 ${q(rondas, 0.9)} max ${Math.max(...rondas)}`);
const hist: Record<number, number> = {};
for (const r of rondas) hist[r] = (hist[r] ?? 0) + 1;
console.log('hist rondas', JSON.stringify(hist));
for (const [t, rs] of Object.entries(rondasPorTipo)) {
  console.log(`  ${t}: ${rs.length} batallas, rondas media ${(rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(2)}`);
}
console.log(`tamaño (stacks): media ${(tamano.reduce((a, b) => a + b, 0) / N).toFixed(1)} p50 ${q(tamano, 0.5)} max ${Math.max(...tamano)}`);
console.log(`PV perdidos por el ganador: p50 ${q(perdidaGanador, 0.5).toFixed(2)} p90 ${q(perdidaGanador, 0.9).toFixed(2)}`);
for (const k of Object.keys(C).sort()) console.log(`${k.padEnd(40)} ${C[k]}  ${k.startsWith('ev:') || k.startsWith('golpe') ? '' : pct(C[k]!, N)}`);
console.log('\ncuerpo: en batalla / actúan / mueren');
for (const k of Object.keys(cuerpos).sort((a, b) => cuerpos[b]! - cuerpos[a]!)) {
  console.log(`  ${k.padEnd(20)} ${cuerpos[k]} / ${cuerposActuan[k] ?? 0} / ${cuerposMueren[k] ?? 0}`);
}
