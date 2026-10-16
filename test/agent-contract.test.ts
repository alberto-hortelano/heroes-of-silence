import { describe, expect, it } from 'vitest';
import { MARGEN_CONTRA_NEUTRALES } from '../src/core/ai/fuerza.js';
import {
  planBuildings,
  planHires,
  planRecruits,
  siguienteDeEquipo,
} from '../src/core/ai/strategy.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import { playAiTurn } from '../src/core/ai/turn.js';
import {
  activeStack,
  applyAction,
  CARGA_MINIMA,
  createBattle,
  legalActions,
} from '../src/core/battle/battle.js';
import { FORMA_DEL_TABLERO, tableroDelContrato } from '../src/core/battle/board.js';
import { CHARGE_BONUS_PER_HEX, MAX_CHARGE_HEXES } from '../src/core/battle/damage.js';
import {
  adventureActionSchema,
  battleActionSchema,
  mapPlanSchema,
  REQUEST_KINDS,
  RESPONSE_FORMAT,
  responseSchemas,
} from '../src/core/contract/agent.js';
import { accionDelAgente, SLOT_DE_HUECO } from '../src/core/contract/huecos.js';
import {
  CATALOGO_DE_EQUIPO_EN_PROSA,
  COMO_SE_LEE_EL_MAPA,
  fichaDeCriatura,
  serializeAdventureTurn,
  serializeBattleTurn,
  serializeKnownMap,
  serializeMapRequest,
  serializeTownVoices,
} from '../src/core/contract/serialize.js';
import { ASALTANTES, allCreatures, creature, EQUIPO } from '../src/core/data.js';
import { NOMBRE_DE_CALIDAD, PIEZAS_DEL_JUEGO } from '../src/core/hero/equipo.js';
import { armyLeadership, GARRISON_LEADERSHIP, heroLeadership } from '../src/core/hero/troop.js';
import {
  buildMap,
  caminosDelPlan,
  generateMapPlan,
  LADO_DEL_MAPA,
  type MapPlan,
  planDelAgente,
  REGIONES_POR_BANDO,
  validateMapPlan,
} from '../src/core/map/generate.js';
import { pointFromKey, pointKey, RedDeCaminos, stepCost } from '../src/core/map/map.js';
import { BARRERAS, costeDeEntrada, isWalkable, TERRAIN_KINDS } from '../src/core/map/terrain.js';
import { indiceDePoder, nivelDeUnidad } from '../src/core/nivel.js';
import { createRng } from '../src/core/rng.js';
import { cronicaPara } from '../src/core/state/events.js';
import {
  applyAdventureAction,
  heroesOf,
  resolvePendingBattle,
  revealEverything,
  townsOf,
  unequipBlocker,
  visibleNow,
} from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import { mageGuildLevel, townSpells } from '../src/core/town/town.js';
import { FACTION_IDS } from '../src/core/types.js';
import { conCaminos, forzarBatalla, forzarTurno, planDeNodos } from './helpers.js';

describe('contrato con el agente', () => {
  it('cada tipo de petición tiene esquema y formato de respuesta', () => {
    for (const kind of REQUEST_KINDS) {
      expect(responseSchemas[kind]).toBeDefined();
      expect(RESPONSE_FORMAT[kind].length).toBeGreaterThan(20);
    }
  });

  // Si el motor genera una acción que el esquema rechaza, el agente no podría
  // imitar a la IA de reglas. Este test ata las dos definiciones.
  it('las acciones que produce la IA de reglas pasan el esquema del agente', () => {
    const state = newGame({ seed: 77 });
    const acciones = [
      ...planHires(state, 0),
      ...planBuildings(state, 0),
      ...planRecruits(state, 0),
      { type: 'move_hero' as const, hero: heroesOf(state, 0)[0]!.id, to: { x: 5, y: 5 } },
      // La que la IA usa para cambiar tropa (`planRecruits`), que en esta
      // semilla y este día no le hace falta.
      { type: 'dismiss' as const, hero: heroesOf(state, 0)[0]!.id, creature: 'peasant', count: 1 },
      { type: 'end_turn' as const },
    ];
    // Y la prosa la anuncia: un agente no descubre una acción que no le cuentan.
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/"type": "dismiss"/);
    expect(acciones.length).toBeGreaterThan(2);
    for (const accion of acciones) {
      const r = adventureActionSchema.safeParse(accion);
      expect(r.success, `rechazada: ${JSON.stringify(accion)}`).toBe(true);
    }
  });

  it('el equipo en el contrato: las tres acciones pasan el esquema, se anuncian y la IA las produce', () => {
    const state = newGame({ seed: 7 });
    const hero = heroesOf(state, 0)[0]!;
    const base = townsOf(state, 0)[0]!;
    hero.at = base.at;
    base.buildings.push('armory');
    state.players[0]!.resources = { ...state.players[0]!.resources, gold: 20000 };
    const deLaIA = siguienteDeEquipo(state, 0);
    expect(deLaIA).toMatchObject({ type: 'buy_item' });
    const acciones = [
      deLaIA,
      { type: 'equip', hero: hero.id, item: 'garrote' },
      { type: 'equip', hero: hero.id, item: 'garrote', veteran: 'veterano-1' },
      { type: 'equip', hero: hero.id, item: 'garrote', creature: 'peasant' },
      { type: 'unequip', hero: hero.id, slot: 'weapon' },
      { type: 'unequip', hero: hero.id, slot: 'accessory', veteran: 'veterano-1' },
      { type: 'unequip', hero: hero.id, slot: 'shield' },
    ];
    for (const accion of acciones) {
      const r = adventureActionSchema.safeParse(accion);
      expect(r.success, `rechazada: ${JSON.stringify(accion)}`).toBe(true);
    }
    // El hueco es texto en el esquema, como la pieza y la criatura: uno inventado
    // lo rechaza la traducción con su motivo (`huecoDelSlot`, dentro del `try` del
    // director), y así se descarta ESA acción y no el turno entero (M3).
    expect(
      adventureActionSchema.safeParse({ type: 'unequip', hero: hero.id, slot: 'casco' }).success,
    ).toBe(true);
    // Los huecos viajan en inglés (12-10-2026) y se traducen al entrar
    // (`accionDelAgente`, dentro del `try` del director): el nombre de dentro,
    // «arma», ya no es un hueco del contrato, y se dice con los cuatro que valen.
    expect(() => accionDelAgente({ type: 'unequip', hero: hero.id, slot: 'arma' })).toThrow(
      'no hay ningún hueco "arma": son weapon, armor, accessory, shield',
    );
    expect(accionDelAgente({ type: 'unequip', hero: hero.id, slot: 'shield' })).toEqual({
      type: 'unequip',
      hero: hero.id,
      slot: 'escudo',
    });
    expect(() => accionDelAgente({ type: 'unequip', hero: hero.id, slot: 'casco' })).toThrow(
      'no hay ningún hueco "casco": son weapon, armor, accessory, shield',
    );
    // Y el motivo del núcleo nombra el hueco para la persona, no por su clave: el
    // agente lo pidió como `shield`, y «escudo» en minúscula no le decía nada.
    expect(unequipBlocker(state, 0, { type: 'unequip', hero: hero.id, slot: 'escudo' })).toBe(
      `${hero.name} no lleva nada en Escudo`,
    );
    // La prosa ofrece los cuatro en inglés y explica el escudo y las dos manos.
    expect(RESPONSE_FORMAT.adventure_turn).toContain(
      '"slot": "weapon" | "armor" | "accessory" | "shield"',
    );
    expect(RESPONSE_FORMAT.adventure_turn).not.toContain('"slot": "arma"');
    expect(RESPONSE_FORMAT.adventure_turn).toContain('"shield" es opcional');
    // Lo que el héroe trae vacío de serie sale del equipo base, no de la prosa.
    expect(RESPONSE_FORMAT.adventure_turn).toContain('(y nada en "shield")');
    expect(RESPONSE_FORMAT.adventure_turn).toContain('un arma a dos manos no admite escudo');
    for (const tipo of ['buy_item', 'equip', 'unequip']) {
      expect(RESPONSE_FORMAT.adventure_turn).toContain(`"type": "${tipo}"`);
    }
  });

  it('el catálogo que se le anuncia al agente sale de `EQUIPO`, pieza a pieza y con sus cifras', () => {
    // Lo de la arena no le puede caer ni lo puede comprar: no se le anuncia.
    for (const p of EQUIPO.filter((x) => x.calidad === 'arena')) {
      expect(CATALOGO_DE_EQUIPO_EN_PROSA, p.id).not.toMatch(new RegExp(`^ *${p.id} \\(`, 'm'));
    }
    expect(PIEZAS_DEL_JUEGO.length).toBeGreaterThan(0);
    for (const p of PIEZAS_DEL_JUEGO) {
      const linea = CATALOGO_DE_EQUIPO_EN_PROSA.split('\n').find((l) =>
        l.trim().startsWith(`${p.id} (`),
      );
      expect(linea, p.id).toBeDefined();
      expect(linea).toContain(`(${SLOT_DE_HUECO[p.hueco]}, ${NOMBRE_DE_CALIDAD[p.calidad]})`);
      if (p.ataque > 0) expect(linea).toContain(`+${p.ataque} Ataque`);
      if (p.pv > 0) expect(linea).toContain(`+${p.pv} PV`);
      expect(linea?.includes('se compra por'), p.id).toBe(p.calidad === 'armeria');
    }
    expect(RESPONSE_FORMAT.adventure_turn).toContain(CATALOGO_DE_EQUIPO_EN_PROSA);
  });

  it('el turno trae el equipo del héroe, su mochila, el de cada veterano y la armería solo si la hay', () => {
    const state = newGame({ seed: 7 });
    const hero = heroesOf(state, 0)[0]!;
    const base = townsOf(state, 0)[0]!;
    hero.mochila = ['garrote'];
    hero.army = [
      {
        creature: 'pikeman',
        veterania: {
          id: 'veterano-4',
          experiencia: 0,
          batallas: 0,
          bajas: 0,
          heroes: [],
          equipo: { armadura: 'cota_de_malla' },
        },
      },
      { creature: 'pikeman' },
    ];
    const turno = (): any => serializeAdventureTurn(state, 0);
    const h = turno().heroes[0];
    // Los cuatro huecos, en inglés, y el escudo vacío: el héroe nace sin él.
    expect(h.equipment).toEqual({
      weapon: 'espada_de_armeria',
      armor: 'cota_de_malla',
      accessory: 'brazal_de_armeria',
      shield: null,
    });
    expect(h.backpack).toEqual(['garrote']);
    // La fila de un individuo lleva el equipo con la misma forma que el héroe.
    expect(h.army[0]).toMatchObject({
      id: 'veterano-4',
      equipment: { weapon: null, armor: 'cota_de_malla', accessory: null, shield: null },
    });
    expect(h.army[1]).not.toHaveProperty('id');
    const pueblo = (): any => turno().towns.find((t: any) => t.id === base.id);
    expect(pueblo()).not.toHaveProperty('armory');
    base.buildings.push('armory');
    expect(pueblo().armory.map((x: any) => [x.item, x.slot])).toEqual([
      ['espada_de_armeria', 'weapon'],
      ['cota_de_malla', 'armor'],
      ['brazal_de_armeria', 'accessory'],
    ]);
  });

  it('las acciones de batalla de la IA pasan su esquema', () => {
    const rng = createRng(88);
    const battle = createBattle(
      {
        army: [
          { creature: 'swordsman', count: 10 },
          { creature: 'archer', count: 6 },
        ],
        hero: null,
      },
      { army: [{ creature: 'skeleton', count: 20 }], hero: null },
      rng,
    );
    for (const accion of legalActions(battle)) {
      expect(battleActionSchema.safeParse(accion).success).toBe(true);
    }
    expect(battleActionSchema.safeParse(chooseBattleAction(battle)).success).toBe(true);
  });

  it('la prosa de battle_turn dice la forma del tablero, la misma frase que el dato', () => {
    // Prosa y dato salen de la misma constante (`FORMA_DEL_TABLERO`): si uno
    // cambia, el otro con él.
    expect(RESPONSE_FORMAT.battle_turn).toContain(FORMA_DEL_TABLERO);
    expect(tableroDelContrato().layout).toContain(FORMA_DEL_TABLERO);
    // Sin repetir la forma con otro número escrito: el descarte se dice sin él.
    expect(RESPONSE_FORMAT.battle_turn).toContain(
      'Una acción a una casilla\nque no existe se descarta',
    );
    expect(RESPONSE_FORMAT.battle_turn).not.toMatch(/\(11, fila impar\)/);
  });

  it('el agente no puede encender un interruptor de reglas: el esquema no los lleva', () => {
    // Las reglas de la batalla (`battle/reglas.ts`) solo las cambia la arena. Lo
    // que el agente manda pasa por estos esquemas, y un `reglas` colado se cae
    // al parsear: no llega a ningún sitio que lo pudiera leer.
    const conReglas = {
      action: { type: 'end_turn', reglas: { tirador: 'fheroes2' } },
      reasoning: 'probando',
      reglas: { bendicion: 'fheroes2' },
    };
    const r = responseSchemas.battle_turn.safeParse(conReglas);
    expect(r.success).toBe(true);
    expect(JSON.stringify(r.data)).not.toContain('reglas');
    expect(JSON.stringify(r.data)).not.toContain('fheroes2');
  });

  it('el plan del generador procedural pasa el esquema de mapa', () => {
    for (const semilla of [1, 5, 50]) {
      const plan = generateMapPlan(createRng(semilla));
      const r = mapPlanSchema.safeParse(plan);
      expect(r.success, JSON.stringify(r.success ? '' : r.error.issues)).toBe(true);
    }
  });

  it('el id y el nombre de un pueblo están acotados, no son `string` a secas (#97)', () => {
    // Los dos únicos textos del plan que el motor usa VERBATIM: de `buildMap`
    // salen al `MapObject`, al `Town`, y de ahí a la consulta `map`, a
    // `game_state` y al canal del espectador. Un id con un salto de línea
    // dentro además parte el bloque de veredictos, que se lee línea a línea.
    const base = generateMapPlan(createRng(13));
    const conPueblo = (parche: Record<string, unknown>): unknown => ({
      ...base,
      towns: [{ ...base.towns[0], ...parche }, base.towns[1]],
    });

    // Lo que ya se juega tiene que seguir pasando: `town-0` es el id del
    // procedimental, y si el acotado lo rechazara no habría partida sin agente.
    expect(mapPlanSchema.safeParse(conPueblo({ id: 'town-0' })).success).toBe(true);

    for (const malo of ['', 'Pueblo Uno', '-town', 'TOWN', 'town/0', 'x'.repeat(33)]) {
      const r = mapPlanSchema.safeParse(conPueblo({ id: malo }));
      expect(r.success, `id ${JSON.stringify(malo)} debería rechazarse`).toBe(false);
    }
    for (const malo of ['', 'x'.repeat(41), 'Valde\nluz']) {
      const r = mapPlanSchema.safeParse(conPueblo({ name: malo }));
      expect(r.success, `name ${JSON.stringify(malo)} debería rechazarse`).toBe(false);
    }
    // Y el motivo se le dice al agente: un rechazo sin forma no se corrige.
    const r = mapPlanSchema.safeParse(conPueblo({ id: 'Pueblo Uno' }));
    if (r.success) throw new Error('«Pueblo Uno» debería rechazarse');
    expect(r.error.issues.map((i) => i.message).join(' ')).toMatch(/minúsculas/);
  });

  it('un nombre o una historia en blanco no pasan, ni en el plan ni en el héroe nacido (M1)', () => {
    // QA: `{name: '   ', story: '   '}` pasaba, y con él un héroe sin nombre
    // visible en el panel, la crónica y el veredicto. El hueco era el de #97
    // —«una sola línea» no es «algo que se lea»—, así que se cierra en la puerta
    // compartida y lo heredan el plan de mapa y el ascenso.
    const base = generateMapPlan(createRng(13));
    const conPueblo = (name: string): unknown => ({
      ...base,
      towns: [{ ...base.towns[0], name }, base.towns[1]],
    });
    const heroe = responseSchemas.hero_from_troop;
    const bueno = { name: 'Ana la Paciente', story: 'Guardó la puerta.', heroType: 'lich' };
    expect(heroe.safeParse(bueno).success).toBe(true);
    expect(mapPlanSchema.safeParse(conPueblo('Valdeluz')).success).toBe(true);
    // Un nombre con espacios, acentos y un apóstrofo sigue valiendo.
    expect(heroe.safeParse({ ...bueno, name: "Ño D'Arnés" }).success).toBe(true);

    const blancos = ['   ', '\t', '\u0000', 'Ana\u0000', '\u00a0\u200b', 'A\tB', '\u0007'];
    for (const malo of blancos) {
      const n = heroe.safeParse({ ...bueno, name: malo });
      expect(n.success, `name ${JSON.stringify(malo)} debería rechazarse`).toBe(false);
      const h = heroe.safeParse({ ...bueno, story: malo });
      expect(h.success, `story ${JSON.stringify(malo)} debería rechazarse`).toBe(false);
      const m = mapPlanSchema.safeParse(conPueblo(malo));
      expect(m.success, `pueblo ${JSON.stringify(malo)} debería rechazarse`).toBe(false);
    }
    // Con un motivo que se entiende, que es lo que corrige al agente.
    const r = heroe.safeParse({ ...bueno, name: '   ' });
    if (r.success) throw new Error('un nombre en blanco debería rechazarse');
    expect(r.error.issues.map((i) => i.message).join(' ')).toMatch(/en blanco/);
    const c = heroe.safeParse({ ...bueno, story: 'Cayó\u0000' });
    if (c.success) throw new Error('una historia con un carácter de control debería rechazarse');
    expect(c.error.issues.map((i) => i.message).join(' ')).toMatch(/caracteres de control/);
  });

  it('lo que parte la línea, le da la vuelta o se pinta en blanco tampoco pasa; lo legible, sí (#128)', () => {
    const base = generateMapPlan(createRng(13));
    const conPueblo = (name: string): unknown => ({
      ...base,
      towns: [{ ...base.towns[0], name }, base.towns[1]],
    });
    const heroe = responseSchemas.hero_from_troop;
    const bueno = { name: 'Ana la Paciente', story: 'Guardó la puerta.', heroType: 'lich' };
    const motivos = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
      r.success ? '' : r.error!.issues.map((i) => i.message).join(' ');

    // Cada uno con el motivo que le corresponde: es lo que corrige al agente.
    const malos: [string, RegExp][] = [
      ['Ana\u2028Bo', /marcas de dirección/], // separador de línea
      ['Ana\u2029Bo', /marcas de dirección/], // separador de párrafo
      ['Ana\u202eoB', /marcas de dirección/], // RLO: da la vuelta al resto
      ['\u2066Ana', /marcas de dirección/], // aislamiento de dirección
      ['Ana\u200e', /marcas de dirección/], // marca de izquierda a derecha
      ['\u2800', /en blanco/], // braille vacío
      ['\u3164', /en blanco/], // relleno coreano
      ['\uffa0', /en blanco/], // relleno coreano de media anchura
      ['\u115f', /en blanco/], // relleno de inicial coreana
      ['\u2800\u3164 \u0301', /en blanco/],
      ['\u0301', /acento o una marca suelta/], // acento combinante solo
      ['\u0301abc', /acento o una marca suelta/], // y delante de un texto
      ['Ana\ue000', /caracteres que existen/], // uso privado
      ['Ana\u{f0000}', /caracteres que existen/], // uso privado suplementario
      ['Ana\uffff', /caracteres que existen/], // no-carácter
      ['Ana\ufdd0', /caracteres que existen/], // no-carácter
      ['Ana\ud800', /caracteres que existen/], // sustituto suelto
      // Lo invisible entre lo visible (#158): se ve «AnaBo» y es otro nombre.
      ['Ana\u200bBo', /invisibles/], // espacio de anchura cero
      ['Ana\u2060Bo', /invisibles/], // WORD JOINER
      ['Ana\u00adBo', /invisibles/], // guion blando
      ['Ana\u200dBo', /invisibles/], // ZWJ entre letras
      ['Ana\ufeffBo', /invisibles/], // BOM / ZWNBSP
      ['Ana\u{e0068}\u{e0069}Bo', /invisibles/], // etiquetas fuera de una bandera
      ['\u{1F409}\u200dBo', /invisibles/], // ZWJ de un emoji a una letra
      ['\u200d\u{1F409}', /invisibles/], // ZWJ delante de todo
      ['Ana\ufe0fBo', /invisibles/], // selector de variante tras una letra
      // Los tres huecos que encontró QA (M-1): se veían igual que otro nombre.
      ['Bo1\ufe0f', /invisibles/], // tecla a medias, sin U+20E3: se ve «Bo1»
      ['Bo1\ufe0f\u200d🐉', /invisibles/], // ZWJ tras la tecla a medias: se ve «Bo1🐉»
      ['Bo🏴\u{e0061}\u{e0062}\u{e007f}', /invisibles/], // bandera inventada: se ve «Bo🏴»
      ['🏴\u{e0065}\u{e0073}\u{e006d}\u{e0064}\u{e007f}', /invisibles/], // subdivisión con forma válida que no es emoji
    ];
    // La regla entera, sobre una superficie: el nombre del héroe.
    for (const [malo, motivo] of malos) {
      const r = heroe.safeParse({ ...bueno, name: malo });
      expect(r.success, `${JSON.stringify(malo)} debería rechazarse`).toBe(false);
      expect(motivos(r), JSON.stringify(malo)).toMatch(motivo);
    }

    // Lo legible de hoy sigue pasando: la ñ escrita de las dos formas, un emoji,
    // el corazón con su selector de variante (U+FE0F) y la familia unida con ZWJ
    // (U+200D), que son ignorables y por eso no pueden ir en la primera regla.
    const buenos = [
      'Peña',
      'Pen\u0303a',
      '🐉',
      '❤️',
      '👨‍👩‍👧',
      'Ana ❤️ Bo',
      '🇪🇸 Valdeluz',
      'هران',
      '한강',
      '🇪🇸',
      '🏴\u{e0067}\u{e0062}\u{e0073}\u{e0063}\u{e0074}\u{e007f}', // Escocia, con etiquetas (Cf)
      '🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}', // Inglaterra
      '🏴\u{e0067}\u{e0062}\u{e0077}\u{e006c}\u{e0073}\u{e007f}', // Gales
      '#️⃣',
      '🏳️‍⚧️', // selector y ZWJ tras un pictográfico, y selector al final
      '🏳️‍🌈',
      '1️⃣',
      '👩🏽‍💻', // modificador de tono y ZWJ
      '🧑‍🦰',
      // Lo que depende de la tabla Unicode del Node (#158 b) no se juzga: un emoji
      // de Unicode 17 (U+1FAEA) y un pictográfico aún sin asignar (U+1F02C) pasan
      // igual con Node 24.11 (Unicode 16) que con Node 26 (17). Y un sin asignar
      // cualquiera también: se pinta como una caja, no tira el plan.
      '\u{1FAEA}',
      '\u{1F02C}',
      'Ana\u0378',
    ];
    for (const b of buenos) {
      expect(motivos(heroe.safeParse({ ...bueno, name: b })), JSON.stringify(b)).toBe('');
    }

    // Y el cableado del otro esquema: el nombre de un pueblo del plan de mapa
    // pasa por la misma puerta.
    expect(motivos(mapPlanSchema.safeParse(conPueblo('Ana\u202eoB')))).toMatch(
      /marcas de dirección/,
    );
    expect(motivos(mapPlanSchema.safeParse(conPueblo('Ana ❤️ Bo')))).toBe('');
    expect(motivos(mapPlanSchema.safeParse(conPueblo('Ana\u200bBo')))).toMatch(/invisibles/);
    // La historia del héroe, también.
    expect(motivos(heroe.safeParse({ ...bueno, story: 'Guardó\u2060la puerta.' }))).toMatch(
      /invisibles/,
    );
  });

  it('la prosa de los dos formatos dice la regla de los invisibles (#158)', () => {
    expect(RESPONSE_FORMAT.map_generate).toMatch(/sin caracteres invisibles/);
    expect(RESPONSE_FORMAT.hero_from_troop).toMatch(/sin caracteres\s+invisibles/);
    expect(RESPONSE_FORMAT.map_generate).not.toMatch(/sin asignar/);
    expect(RESPONSE_FORMAT.hero_from_troop).not.toMatch(/sin asignar/);
  });

  it('un plan de mapa rechazado no promete reintento: se juega el procedimental (#122)', () => {
    expect(RESPONSE_FORMAT.map_generate).not.toMatch(/corrij/);
    expect(RESPONSE_FORMAT.map_generate).toMatch(/procedimental/);
    expect(RESPONSE_FORMAT.map_generate).toMatch(/no se te vuelve a pedir/);
  });
});

describe('los caminos del plan del agente: casillas, y los tramos se derivan (#153)', () => {
  const en = (x: number, y: number) => ({ x, y });
  const clave = (tramos: RedDeCaminos['tramos']) =>
    tramos.map(([p, q]) => `${p.x},${p.y}-${q.x},${q.y}`);

  it('en L, en un bloque 2×2 y suelto: los tramos de la regla con que siempre se pintaron', () => {
    const plan = planDeNodos();
    const roads = [
      // Una L: el codo es camino, así que la diagonal no se traza.
      en(1, 1),
      en(2, 1),
      en(2, 2),
      // Un bloque 2×2: sus cuatro lados, ninguna diagonal.
      en(1, 4),
      en(2, 4),
      en(1, 5),
      en(2, 5),
      // Una casilla suelta: sin tramo, va en las sueltas.
      en(4, 7),
    ];
    const red = caminosDelPlan({ ...plan, roads });
    expect(clave(red.tramos)).toEqual([
      '1,1-2,1',
      '2,1-2,2',
      '1,4-2,4',
      '1,4-1,5',
      '2,4-2,5',
      '1,5-2,5',
    ]);
    expect(red.sueltas).toEqual([en(4, 7)]);
    expect([...red.casillas].sort()).toEqual(roads.map(pointKey).sort());
    // Y la suelta abarata entrar en ella, como cualquier casilla de camino.
    const { map } = buildMap({ ...plan, roads });
    const sin = buildMap({ ...plan, roads: [] }).map;
    expect(stepCost(map, en(3, 7), en(4, 7))).toBeLessThan(stepCost(sin, en(3, 7), en(4, 7)));
  });

  it('el esquema del agente no conoce los tramos: zod los quita del plan del procedimental', () => {
    const plan = generateMapPlan(createRng(1));
    expect(plan.tramos.length).toBeGreaterThan(0);
    expect(plan.roads).toBeUndefined();
    expect(mapPlanSchema.parse(plan)).not.toHaveProperty('tramos');
  });

  it('planDelAgente: el plan procedimental pasa por el esquema con sus caminos', () => {
    // Lo que hace la política de `pnpm qa`: reenviar al agente un plan del
    // generador. Sin la conversión, zod quita `tramos` y el mapa sale sin un
    // camino; con ella, las casillas de camino son las mismas.
    for (const semilla of [1, 3]) {
      const plan = generateMapPlan(createRng(semilla));
      const casillas = (p: MapPlan) => [...buildMap(p).map.caminos.casillas].sort();
      const delAgente = mapPlanSchema.parse(planDelAgente(plan));
      expect(casillas(delAgente).length, `semilla ${semilla}`).toBeGreaterThan(0);
      expect(casillas(delAgente), `semilla ${semilla}`).toEqual(casillas(plan));
    }
  });

  it('un plan con casillas y tramos a la vez no compila', () => {
    const plan = planDeNodos();
    // @ts-expect-error: un plan lleva sus caminos de una manera, no de las dos.
    const doble: MapPlan = { ...plan, roads: [en(1, 1)], tramos: [[en(1, 1), en(2, 1)]] };
    expect(doble.roads).toEqual([en(1, 1)]);
  });

  it('la red lanza con lo que no es una red: tramos de no vecinas o repetidos, fuera del mapa, sueltas repetidas', () => {
    const red = (tramos: RedDeCaminos['tramos'], sueltas: { x: number; y: number }[] = []) =>
      RedDeCaminos.desdeTramos(tramos, 10, 10, sueltas);
    expect(() => red([[en(1, 1), en(3, 1)]])).toThrow(
      /de \(1,1\) a \(3,1\) no une dos casillas vecinas distintas/,
    );
    expect(() => red([[en(1, 1), en(1, 1)]])).toThrow(
      /de \(1,1\) a \(1,1\) no une dos casillas vecinas distintas/,
    );
    expect(() =>
      red([
        [en(1, 1), en(2, 1)],
        [en(2, 1), en(1, 1)],
      ]),
    ).toThrow(/de \(1,1\) a \(2,1\) está repetido/);
    expect(() => red([[en(9, 9), en(10, 9)]])).toThrow(
      /el camino de \(10,9\) cae fuera del mapa de 10×10/,
    );
    expect(() => red([], [en(-1, 0)])).toThrow(/el camino de \(-1,0\) cae fuera del mapa/);
    expect(() => red([[en(1, 1), en(2, 1)]], [en(2, 1)])).toThrow(
      /el camino suelto de \(2,1\) está repetido o ya va en un tramo/,
    );
    expect(() => red([], [en(5, 5), en(5, 5)])).toThrow(/el camino suelto de \(5,5\)/);
    // Lo que no es una casilla (H2 de la QA de #153): con `NaN` cada `<` da
    // falso y pasaba todos los filtros; es lo que deja un cable al que le falta
    // un índice. Y media casilla está «dentro» y «a menos de una» de la otra.
    expect(() => red([[en(1, 1), en(Number.NaN, Number.NaN)]])).toThrow(
      /el camino de \(NaN,NaN\) no cae en una casilla: van de enteros/,
    );
    expect(() => red([[en(1, 1), en(1.5, 1)]])).toThrow(
      /el camino de \(1\.5,1\) no cae en una casilla/,
    );
    expect(() => red([], [en(2, 0.5)])).toThrow(/el camino de \(2,0\.5\) no cae en una casilla/);
  });
});

describe('lo que ve el agente', () => {
  it('el estado del turno viaja como JSON sin perder nada', () => {
    const state = newGame({ seed: 91 });
    const payload = serializeAdventureTurn(state, 0);
    const roundtrip = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    expect(roundtrip).toEqual(payload);
    expect(roundtrip.kind).toBe('adventure_turn');
    expect(Array.isArray(roundtrip.heroes)).toBe(true);
    expect((roundtrip.towns as unknown[]).length).toBeGreaterThan(0);
  });

  it('el turno dice el orden de hoy, en serpiente, y la prosa explica qué supone', () => {
    // El agente es el jugador 1: el día 1 juega segundo y cierra, y el 2 lo
    // abre él justo después, sin que el rival haya movido.
    const state = newGame({ seed: 91 });
    const ctx = { rng: createRng(91) };
    const orden = (): unknown => (serializeAdventureTurn(state, 1) as any).you.turnOrder;
    expect(orden()).toEqual([0, 1]);
    applyAdventureAction(state, { type: 'end_turn' }, ctx, 0);
    applyAdventureAction(state, { type: 'end_turn' }, ctx, 1);
    expect([state.day, state.current]).toEqual([2, 1]);
    expect(orden()).toEqual([1, 0]);
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(
      /en serpiente: quien cierra un día abre el siguiente/,
    );
    expect(RESPONSE_FORMAT.adventure_turn).toContain('"you.turnOrder"');
  });

  it('solo enseña lo que ese jugador ha explorado', () => {
    const state = newGame({ seed: 92 });
    const payload = serializeAdventureTurn(state, 0) as {
      knownMap: { objects: { at: { x: number; y: number } }[] };
    };
    const jugador = state.players[0]!;
    for (const obj of payload.knownMap.objects) {
      expect(jugador.fog.has(obj.at)).toBe(true);
    }
    // El castillo enemigo está al otro lado del mapa: no debe asomar.
    const puebloEnemigo = state.towns.find((t) => t.owner === 1)!;
    expect(
      payload.knownMap.objects.some(
        (o) => o.at.x === puebloEnemigo.at.x && o.at.y === puebloEnemigo.at.y,
      ),
    ).toBe(false);
  });

  it('el turno lleva el TERRENO y los caminos que ha explorado, no solo objetos (#85)', () => {
    // `knownMap` era `{width, height, objects}`: el agente elegía el "to" de
    // cada `move_hero` sin saber por dónde se anda ni dónde hay carretera,
    // mientras la tool `map` le prometía traer «lo mismo». Ahora sale del mismo
    // serializador, así que trae terreno y caminos filtrados por la niebla.
    const state = newGame({ seed: 92 });
    // Un camino a mano: el generador procedimental no pone ninguno, así que sin
    // esto `roads` sería siempre `[]` y el filtro no probaría nada. Uno dentro
    // de la niebla del jugador 0 y otro fuera, para que haya algo que filtrar.
    const jugador = state.players[0]!;
    // Fuera de la diagonal a propósito: en (15,15) intercambiar x por y es la
    // identidad, y una fixtura así deja pasar un serializador que lea la clave
    // del revés. Se vio: la sonda que hacía justo eso salió verde en los 400.
    // Y sin camino todavía: `conCaminos` lanza con una casilla que ya lo lleva.
    const asimetrica = (k: string): boolean => {
      const p = pointFromKey(k);
      return p.x !== p.y && !state.map.caminos.casillas.has(k);
    };
    const dentro = [...jugador.fog].map(pointKey).find(asimetrica);
    const fuera = [...state.players[1]!.fog]
      .map(pointKey)
      .find((k) => !jugador.fog.has(pointFromKey(k)) && asimetrica(k));
    // Y se comprueba que la semilla sigue dando las dos casillas, en vez de
    // taparlo con un `!`. Con `fuera` a `undefined` se colaba un `undefined` en
    // `roads` y el `not.toContain(fuera)` de abajo pasaba **por vacío**: un
    // guardia verde sin haber probado nada, que es justo lo que este ciclo
    // persigue. El test hermano de `agent-link` ya lo hacía así.
    if (dentro === undefined || fuera === undefined) {
      throw new Error(
        'la semilla 92 ya no deja una casilla fuera de la diagonal dentro de la niebla del 0 y otra fuera',
      );
    }
    state.map = conCaminos(state.map, dentro, fuera);
    // Y la niebla tiene que ser ASIMÉTRICA, o el barrido de abajo tampoco puede
    // morder: el generador pone los inicios en la diagonal de un mapa cuadrado
    // —(4,4) y (19,19)—, así que hasta el día 3 la niebla es simétrica bajo
    // transponer y leer la clave del revés no cambia ni una casilla. Se fuerza
    // una casilla explorada cuya transpuesta NO lo esté, y se comprueba que
    // queda así en vez de suponerlo.
    const espejo = pointFromKey(dentro);
    const transpuesta = { x: espejo.y, y: espejo.x };
    jugador.fog.delete(transpuesta);
    if (!jugador.fog.has(espejo) || jugador.fog.has(transpuesta)) {
      throw new Error(`la niebla del jugador 0 sigue siendo simétrica en ${dentro}`);
    }

    const payload = serializeAdventureTurn(state, 0) as {
      knownMap: {
        width: number;
        height: number;
        terrain: (string | null)[];
        roads: { x: number; y: number }[];
        objects: unknown[];
      };
    };
    const { width, height, terrain, roads } = payload.knownMap;

    // El array es plano y completo: el índice `y*width+x` se conserva, así que
    // el agente no aprende una convención nueva para leerlo.
    expect(terrain.length).toBe(width * height);

    // Las dos mitades, y las dos importan. Sin el `null` esto pasaría con un
    // mapa revelado entero; sin el terreno real pasaría con el mapa a oscuras.
    expect(
      terrain.some((t) => t === null),
      'lo no explorado va como null',
    ).toBe(true);
    expect(
      terrain.some((t) => t !== null),
      'lo explorado trae su terreno',
    ).toBe(true);

    // Y el `null` es EXACTAMENTE la niebla, casilla a casilla: ni una de más
    // —eso sería fuga— ni una de menos —eso sería terreno inventado—.
    //
    // Se recorre (x, y) y se calcula el índice, y NO al revés. La primera
    // redacción sacaba la casilla del índice con `{x: i % width, y: floor(i /
    // width)}`, que es **la misma expresión que la implementación**: un espejo,
    // no un guardia. Transponerla en `serializeKnownMap` dejaba los 402 en
    // verde. Es `pointFromKey` otra vez, una función más allá.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const explorada = jugador.fog.has({ x, y });
        expect(terrain[y * width + x] === null, `(${x},${y})`).toBe(!explorada);
      }
    }

    // Los caminos salen como PUNTOS y no como la clave con la que se guardan,
    // igual que `at` y que los `roads` que el propio agente escribe en un plan
    // de mapa. Se compara por `pointKey` para no depender del orden.
    expect(roads.map(pointKey)).toContain(dentro);
    expect(roads.map(pointKey)).not.toContain(fuera);
    for (const p of roads) {
      expect(typeof p.x, 'un camino viaja como {x,y}, no como "x,y"').toBe('number');
      expect(jugador.fog.has(p)).toBe(true);
    }
  });

  it('lo que se dejó atrás se manda como se vio, con el día en que se vio', () => {
    // La niebla filtraba el espacio pero no el tiempo: pisar una casilla el día
    // 1 bastaba para saber, el día 20, de quién es el nodo AHORA. (Era una
    // mina; desde el mapa de nodos lo que cambia de dueño es el nodo.)
    const state = newGame({ seed: 92 });
    revealEverything(state, 0);
    const mirando = visibleNow(state, 0);

    const lejos = state.map.objects.find((o) => o.kind === 'node' && !mirando.has(o.at));
    expect(lejos, 'la semilla no deja ningún nodo fuera de la vista').toBeDefined();
    if (lejos === undefined || lejos.kind !== 'node') throw new Error('sin nodo lejano');

    // Pasan diecinueve días y el rival la captura sin que nadie lo vea.
    state.day = 20;
    lejos.owner = 1;

    const payload = serializeAdventureTurn(state, 0) as {
      knownMap: { objects: { id: string; owner?: number | null; lastSeen: number }[] };
    };
    const vista = payload.knownMap.objects.find((o) => o.id === lejos.id)!;
    expect(vista.owner).toBeNull();
    expect(vista.lastSeen).toBe(1);
  });

  it('lo que se está mirando ahora sí es el presente', () => {
    // La primera semilla con un nodo a la vista al empezar: se busca, porque
    // la que estaba escrita (la 92) dejó de tenerlo con los mapas densos y
    // lo que se mira aquí es el presente, no un mapa concreto.
    const conNodoALaVista = () => {
      for (let seed = 1; seed <= 200; seed++) {
        const state = newGame({ seed });
        revealEverything(state, 0);
        const mirando = visibleNow(state, 0);
        const nodo = state.map.objects.find((o) => o.kind === 'node' && mirando.has(o.at));
        if (nodo !== undefined && nodo.kind === 'node') return { state, cerca: nodo };
      }
      throw new Error('ninguna de 200 semillas deja un nodo a la vista al empezar');
    };
    const { state, cerca } = conNodoALaVista();

    state.day = 20;
    cerca.owner = 1;

    const payload = serializeAdventureTurn(state, 0) as {
      knownMap: { objects: { id: string; owner?: number | null; lastSeen: number }[] };
    };
    const vista = payload.knownMap.objects.find((o) => o.id === cerca.id)!;
    // Con un héroe delante no hay recuerdo que valga: se ve lo que hay.
    expect(vista.owner).toBe(1);
    expect(vista.lastSeen).toBe(20);
  });

  it('un héroe enemigo se ve solo si alguien lo está mirando', () => {
    const state = newGame({ seed: 92 });
    revealEverything(state, 0);

    const mio = heroesOf(state, 0)[0]!;
    const suyo = state.heroes.find((h) => h.owner === 1)!;

    // Con el mapa entero explorado, antes se le seguía por medio mapa sin tener
    // a nadie cerca: bastaba con haber pisado esa casilla alguna vez.
    const lejos = serializeAdventureTurn(state, 0) as { enemyHeroes: unknown[] };
    expect(lejos.enemyHeroes).toEqual([]);

    suyo.at = { ...mio.at };
    const delante = serializeAdventureTurn(state, 0) as { enemyHeroes: { id: string }[] };
    expect(delante.enemyHeroes.map((h) => h.id)).toEqual([suyo.id]);
  });

  it('un grupo de asaltantes se ve AHORA o no se ve, en el turno y en la tool `map`', () => {
    const state = newGame({ seed: 92 });
    // Con el mapa entero explorado: lo que se mira aquí es el presente, no la niebla.
    revealEverything(state, 0);
    const mio = heroesOf(state, 0)[0]!;
    const lejos = serializeAdventureTurn(state, 0) as {
      knownMap: { raiders: { id: string }[] };
    };
    const ids = (m: { raiders: { id: string }[] }) => m.raiders.map((r) => r.id);
    // Uno que no se ve desde la salida (con los ríos de #144, el primero de s92
    // ya se ve: su región asoma desde casa).
    const grupo = state.raiders.find((r) => !ids(lejos.knownMap).includes(r.id))!;
    expect(grupo).toBeDefined();
    // Que sea la regla del núcleo y no una copia lo prueba `asaltantes.test.ts`
    // en 20 semillas; aquí, que el turno y la tool dicen lo mismo.
    expect(ids(lejos.knownMap)).not.toContain(grupo.id);
    expect(ids(serializeKnownMap(state, 0))).toEqual(ids(lejos.knownMap));

    // Con el héroe al lado sí, con su tropa y su fuerza; y el héroe con la suya.
    mio.at = { x: grupo.at.x, y: grupo.at.y - 1 };
    const cerca = serializeAdventureTurn(state, 0);
    const visto = cerca.knownMap.raiders.find((r) => r.id === grupo.id)!;
    expect(visto.troops.length).toBeGreaterThan(0);
    expect(visto.strength).toBeGreaterThan(0);
    expect(cerca.heroes[0]!.strength).toBeGreaterThan(0);
    expect(serializeKnownMap(state, 0)).toEqual(cerca.knownMap);
  });

  it('que hay un grupo solo le llega a quien lo vio nacer, también a los del mapa de salida', async () => {
    const state = newGame({ seed: 17, maxDays: 40 });
    // Los de salida se cuentan al crear la partida, uno por grupo: la regla no
    // depende de cuándo nació.
    const deSalida = state.log.filter((e) => e.kind === 'raider_spawned');
    expect(deSalida.map((e) => e.kind === 'raider_spawned' && e.raider)).toEqual(
      state.raiders.map((r) => r.id),
    );
    const ctx = { rng: createRng(17) };
    while (state.finished === null) await playAiTurn(state, ctx);
    const brotes = state.log.filter((e) => e.kind === 'raider_spawned');
    for (const p of [0, 1] as const) {
      const leidas = cronicaPara(state, p, 10_000).filter((e) => e.kind === 'raider_spawned');
      expect(leidas.length).toBe(brotes.filter((e) => e.seen.includes(p)).length);
    }
    // Y que alguno no se vea, o el filtro no estaría filtrando nada.
    expect(brotes.some((e) => e.seen.length === 0)).toBe(true);
    // La patrulla ya no es un hecho: dónde está un grupo es estado.
    expect(state.log.some((e) => (e.kind as string) === 'raider_moved')).toBe(false);
  });

  it('la prosa cuenta los asaltantes donde el agente decide: mapa, turno y batalla', () => {
    expect(COMO_SE_LEE_EL_MAPA).toMatch(/"raiders"/);
    expect(COMO_SE_LEE_EL_MAPA).toMatch(/EMBOSCA/);
    // El margen sale de la regla y no de un número escrito a mano.
    expect(COMO_SE_LEE_EL_MAPA).toContain(String(MARGEN_CONTRA_NEUTRALES).replace('.', ','));
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/EMBOSCADA/);
    // Qué grupo se ve y la marcha que se para (#130): si la regla cambia sin la
    // prosa, el agente creerá que «no aparece» es «no está cerca».
    expect(COMO_SE_LEE_EL_MAPA).toMatch(/cualquier casilla de su región/);
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/march_halted/);
    expect(RESPONSE_FORMAT.battle_turn).toMatch(/ASALTANTES emboscan/);
    expect(RESPONSE_FORMAT.map_generate).toMatch(/raiders\?/);
    expect(RESPONSE_FORMAT.map_generate).toMatch(/palette\.raiders\.maxStrength/);
  });

  it('el esquema del plan acepta `raiders` y lo deja opcional', () => {
    const plan = generateMapPlan(createRng(4));
    expect(plan.raiders?.length).toBeGreaterThan(0);
    expect(mapPlanSchema.safeParse(plan).success).toBe(true);
    const { raiders: _fuera, ...sin } = plan;
    expect(mapPlanSchema.safeParse(sin).success).toBe(true);
    // Y la paleta que se le manda trae el techo, sacado de los datos.
    const peticion = serializeMapRequest({ width: 28, height: 28, players: [0, 1] });
    expect(peticion.palette.raiders.maxStrength).toBe(ASALTANTES.fuerzaMax);
    expect(peticion.palette.raiders.examples).toEqual(ASALTANTES.composiciones);
  });

  it('un grupo de asaltantes sin nadie dentro no pasa el esquema, y lo dice (H3)', () => {
    const plan = generateMapPlan(createRng(4));
    const uno = plan.raiders![0]!;
    const vacio = mapPlanSchema.safeParse({ ...plan, raiders: [{ at: uno.at, troops: [] }] });
    expect(vacio.success).toBe(false);
    expect(vacio.error?.issues.map((i) => i.message).join(' | ')).toMatch(
      /"troops" no puede ir vacío/,
    );
  });

  it('la petición de batalla trae todas las acciones legales', () => {
    const state = newGame({ seed: 93 });
    const ctx = { rng: createRng(93) };
    const hero = heroesOf(state, 0)[0]!;
    forzarBatalla(state, ctx, hero);

    const battle = state.pendingBattle!.battle;
    // El bando sale del stack activo y no de un `'attacker'` escrito a mano,
    // que es lo que hace el director: `legalActions` es la lista de quien
    // decide, y desde #73 solo se manda cuando le toca a él.
    const activo = activeStack(battle)!;
    const payload = serializeBattleTurn(battle, activo.side, 'propia', 1000) as {
      legalActions: unknown[];
    };
    expect(payload.legalActions.length).toBeGreaterThan(0);
    expect(payload.legalActions).toEqual(legalActions(battle));
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);

    resolvePendingBattle(state, ctx);
  });

  it('el pueblo manda qué enseña su gremio, y el héroe qué sabe', () => {
    const state = newGame({ seed: 94 });
    const c = { rng: createRng(94) };
    const town = state.towns.find((t) => t.owner === 0)!;
    const hero = heroesOf(state, 0)[0]!;
    hero.at = { ...town.at };

    // Sin gremio no enseña nada: el agente no ve una lista que no existe.
    const sinGremio = serializeAdventureTurn(state, 0) as {
      towns: { id: string; mageGuild: number; teaches: string[] }[];
    };
    expect(sinGremio.towns.find((t) => t.id === town.id)!.teaches).toEqual([]);

    applyAdventureAction(
      state,
      { type: 'build', town: town.id, building: 'mage_guild_1' },
      c,
      state.current,
    );

    const payload = serializeAdventureTurn(state, 0) as {
      heroes: { id: string; spells: string[] }[];
      towns: { id: string; mageGuild: number; teaches: string[] }[];
    };

    // Qué enseña cada nivel de gremio es una regla del núcleo y la prueba
    // `game.test.ts`. Lo que se prueba AQUÍ es lo del contrato: que el campo
    // existe y refleja al núcleo sin inventarse nada por el camino.
    const vista = payload.towns.find((t) => t.id === town.id)!;
    expect(vista.mageGuild).toBe(mageGuildLevel(town));
    expect(vista.teaches).toEqual(townSpells(town).map((s) => s.id));

    // Y el libro del héroe que está dentro, igual: sin que el agente haya
    // mandado ninguna acción de aprender, porque no existe tal acción.
    expect(payload.heroes.find((h) => h.id === hero.id)!.spells).toEqual(hero.spells);
    expect(hero.spells.length).toBeGreaterThan(0);
  });

  it('el ejército viaja agrupado en individuos, con el liderazgo al lado', () => {
    const state = newGame({ seed: 94 });
    const hero = heroesOf(state, 0)[0]!;
    const town = state.towns.find((t) => t.owner === 0)!;
    const payload = serializeAdventureTurn(state, 0) as {
      heroes: {
        id: string;
        army: Record<string, unknown>[];
        leadership: { used: number; max: number };
      }[];
      towns: {
        id: string;
        recruitable: { creature: string; leadership: number }[];
        garrisonLeadership: { used: number; max: number };
      }[];
    };
    const mio = payload.heroes.find((h) => h.id === hero.id)!;
    // Un grupo por criatura, con cuántos individuos: los que hay en la lista.
    const total = mio.army.reduce((n, g) => n + (g.count as number), 0);
    expect(total).toBe(hero.army.length);
    // Sin `slot`: con la tropa de individuos no hay huecos que numerar, y un
    // campo que ya no significa nada es un campo que el agente intentaría leer.
    expect(mio.army.every((g) => !('slot' in g))).toBe(true);
    expect(mio.leadership).toEqual({ used: armyLeadership(hero.army), max: heroLeadership(hero) });

    const vista = payload.towns.find((t) => t.id === town.id)!;
    for (const r of vista.recruitable) {
      expect(r.leadership).toBe(creature(r.creature).leadership);
    }
    // La base nace guarnecida (`guarnicionBase`), así que lo usado no es 0: es
    // lo que ocupa esa tropa, y la vista tiene que decirlo.
    expect(town.garrison.length).toBeGreaterThan(0);
    expect(vista.garrisonLeadership).toEqual({
      used: armyLeadership(town.garrison),
      max: GARRISON_LEADERSHIP,
    });
  });

  it('el formato de respuesta explica el liderazgo, y el de mapa el tamaño de un monstruo', () => {
    // Un dato nuevo que la prosa no nombra es un dato que el agente no mira, y un
    // rechazo que no se anuncia se reintenta en vez de corregirse.
    const turno = RESPONSE_FORMAT.adventure_turn;
    expect(turno).toContain('heroes[].leadership');
    expect(turno).toContain('recruitable[].leadership');
    expect(turno).toContain('garrisonLeadership');
    expect(turno).toMatch(/INDIVIDUOS/);
    expect(RESPONSE_FORMAT.map_generate).toMatch(/"monsters\[\]\.count" son individuos/);
  });

  it('cada acción de batalla del esquema está en la prosa, `surrender` incluida (fase 1b)', () => {
    // En las dos direcciones del mismo hecho: lo que el esquema acepta se le
    // anuncia al agente, y lo que se le anuncia lo acepta el esquema. Un
    // `surrender` en el esquema y no en la prosa es una acción que nadie pide;
    // al revés, una que se le promete y se le rechaza.
    const prosa = RESPONSE_FORMAT.battle_turn;
    const tipos = battleActionSchema.options.map((o) => o.shape.type.value);
    expect(tipos).toContain('surrender');
    for (const t of tipos) expect(prosa, t).toContain(`"type": "${t}"`);
    const anunciados = [...prosa.matchAll(/"type": "([a-z_]+)"/g)].map((m) => m[1]);
    for (const t of anunciados) expect(tipos, t).toContain(t);
    expect(battleActionSchema.safeParse({ type: 'surrender' }).success).toBe(true);
    // Y lo que hay que saber para usarla: el héroe en el tablero y su precio.
    expect(prosa).toMatch(/"commander": true/);
    expect(prosa).toMatch(/oro/);
    expect(prosa).toMatch(/defend/i);
  });

  it('el precio de rendirse viaja en el esquema y en la prosa (H-2)', () => {
    // Antes `legalActions` traía `{ "type": "surrender" }` a secas y el turno no
    // llevaba el oro: el agente pagaba a ciegas lo que la persona veía en el botón.
    const prosa = RESPONSE_FORMAT.battle_turn;
    expect(prosa).toContain('{ "type": "surrender", "gold": N }');
    expect(prosa).toContain('"yourGold"');
    expect(battleActionSchema.safeParse({ type: 'surrender', gold: 75 }).success).toBe(true);
    expect(battleActionSchema.safeParse({ type: 'surrender', gold: -1 }).success).toBe(false);
    expect(battleActionSchema.safeParse({ type: 'surrender', gold: 7.5 }).success).toBe(false);
  });

  it('el turno de batalla propio lleva el oro de quien decide, y el ajeno no', () => {
    const state = newGame({ seed: 7 });
    forzarBatalla(state, { rng: createRng(7) }, heroesOf(state, 0)[0]!);
    const batalla = state.pendingBattle!.battle;
    const propia = serializeBattleTurn(batalla, 'attacker', 'propia', 4321) as Record<
      string,
      unknown
    >;
    expect(propia.yourGold).toBe(4321);
    const ajena = serializeBattleTurn(batalla, 'attacker', 'ajena', null) as Record<
      string,
      unknown
    >;
    expect('yourGold' in ajena).toBe(false);
    // Fail-loud: una vista propia sin oro no sabría leer el precio de rendirse.
    expect(() => serializeBattleTurn(batalla, 'attacker', 'propia', null)).toThrow(
      'necesita el oro de su dueño',
    );
  });

  it('sin `legalActions` viaja el motivo que decidió omitirla, y nunca los dos (#107)', () => {
    // Un solo sitio decide si la lista va y por qué no: el serializador. Cada
    // motivo sale de una batalla real, no de un estado fabricado.
    const battle = createBattle(
      { army: [{ creature: 'swordsman', count: 5 }], hero: null },
      { army: [{ creature: 'pikeman', count: 5 }], hero: null },
      createRng(3),
    );
    forzarTurno(battle, 'attacker-0');
    const exactamenteUno = (v: object) =>
      expect(('legalActions' in v ? 1 : 0) + ('legalActionsOmitted' in v ? 1 : 0)).toBe(1);

    const suyo = serializeBattleTurn(battle, 'attacker', 'propia', 0);
    exactamenteUno(suyo);
    expect('legalActions' in suyo && suyo.legalActions.length).toBeGreaterThan(0);

    const otro = serializeBattleTurn(battle, 'defender', 'propia', 0);
    exactamenteUno(otro);
    expect('legalActionsOmitted' in otro && otro.legalActionsOmitted).toBe('not_your_turn');

    // La vista ajena gana a todo lo demás: aunque el activo sea del bando
    // mirado, no es tuya.
    const ajena = serializeBattleTurn(battle, 'attacker', 'ajena', null);
    exactamenteUno(ajena);
    expect('legalActionsOmitted' in ajena && ajena.legalActionsOmitted).toBe('not_your_battle');

    const rng = createRng(3);
    for (let i = 0; i < 2000 && battle.finished === null; i++) {
      const [accion] = legalActions(battle);
      if (accion === undefined) break;
      applyAction(battle, accion, rng);
    }
    expect(battle.finished).not.toBeNull();
    for (const side of ['attacker', 'defender'] as const) {
      const fin = serializeBattleTurn(battle, side, 'propia', 0);
      exactamenteUno(fin);
      expect('legalActionsOmitted' in fin && fin.legalActionsOmitted).toBe('nobody_active');
    }
  });

  it('el turno en tramos y la carga viajan en el esquema, en la prosa y en el turno (02-10-2026)', () => {
    expect(battleActionSchema.safeParse({ type: 'end_turn' }).success).toBe(true);
    const prosa = RESPONSE_FORMAT.battle_turn;
    expect(prosa).toContain('{ "type": "end_turn" }');
    expect(prosa).toContain('"stepsLeft"');
    expect(prosa).toContain('"chargeFrom"');
    expect(prosa).toMatch(/"move" NO acaba el turno/);
    expect(prosa).toMatch(/LÍNEA RECTA/);
    expect(prosa).toMatch(/el "target" está EN ESA RECTA/);
    expect(prosa).toMatch(/Un "move" a esa casilla NO carga/);

    // `chargeFrom` solo con el rasgo; `stepsLeft` siempre que el activo sea tuyo.
    const turno = (criatura: string): Record<string, unknown> => {
      const battle = createBattle(
        { army: [{ creature: criatura, count: 5 }], hero: null },
        { army: [{ creature: 'pikeman', count: 5 }], hero: null },
        createRng(3),
      );
      battle.stacks.find((x) => x.id === 'attacker-0')!.hex = { col: 0, row: 4 };
      battle.stacks.find((x) => x.id === 'defender-0')!.hex = { col: 5, row: 4 };
      forzarTurno(battle, 'attacker-0');
      return serializeBattleTurn(battle, 'attacker', 'propia', 0) as Record<string, unknown>;
    };
    const jinetes = turno('cavalry');
    expect(jinetes.stepsLeft).toBe(6);
    // Contra quién y desde dónde: la casilla de la recta con el piquero detrás,
    // y ninguna de las vacías (H1).
    expect(jinetes.chargeFrom).toEqual([{ target: 'defender-0', col: 4, row: 4, hexes: 4 }]);
    const espadas = turno('swordsman');
    expect(espadas.stepsLeft).toBe(4);
    expect('chargeFrom' in espadas).toBe(false);
  });

  it('`chargeFrom` viaja cuando hay alguna casilla de carga, no cuando la unidad tiene el rasgo', () => {
    // Caballería con el tramo entero gastado y pegada al enemigo: le queda
    // golpear, pero no hay casilla a la que ir ni, por tanto, desde la que cargar.
    const battle = createBattle(
      { army: [{ creature: 'cavalry', count: 5 }], hero: null },
      { army: [{ creature: 'pikeman', count: 5 }], hero: null },
      createRng(3),
    );
    battle.stacks.find((x) => x.id === 'attacker-0')!.hex = { col: 0, row: 4 };
    battle.stacks.find((x) => x.id === 'defender-0')!.hex = { col: 7, row: 4 };
    forzarTurno(battle, 'attacker-0');
    applyAction(battle, { type: 'move', to: { col: 6, row: 4 } }, createRng(1));
    expect(battle.turno?.stack).toBe('attacker-0');
    const vista = serializeBattleTurn(battle, 'attacker', 'propia', 0) as Record<string, unknown>;
    expect(vista.stepsLeft).toBe(0);
    expect('chargeFrom' in vista).toBe(false);
  });

  it('`turnId` es el ordinal del turno: no cambia con un tramo y sí con el turno siguiente', () => {
    const battle = createBattle(
      { army: [{ creature: 'swordsman', count: 5 }], hero: null },
      { army: [{ creature: 'pikeman', count: 5 }], hero: null },
      createRng(3),
    );
    battle.stacks.find((x) => x.id === 'attacker-0')!.hex = { col: 0, row: 4 };
    battle.stacks.find((x) => x.id === 'defender-0')!.hex = { col: 10, row: 4 };
    forzarTurno(battle, 'attacker-0');
    const vista = () =>
      serializeBattleTurn(battle, 'attacker', 'propia', 0) as Record<string, unknown>;
    const primero = vista().turnId;
    expect(primero).toBe(battle.turno?.n);
    applyAction(battle, { type: 'move', to: { col: 1, row: 4 } }, createRng(1));
    expect(vista().turnId).toBe(primero);
    applyAction(battle, { type: 'end_turn' }, createRng(1));
    expect(vista().turnId).toBe((primero as number) + 1);
  });

  it('la prosa de la carga sale de las constantes que la cobran', () => {
    const prosa = RESPONSE_FORMAT.battle_turn;
    expect(prosa).toContain(`a ${CARGA_MINIMA} casillas o\n  más`);
    expect(prosa).toContain(
      `suma un ${Math.round(CHARGE_BONUS_PER_HEX * 100)} % de daño, hasta ${MAX_CHARGE_HEXES}`,
    );
    expect(prosa).toContain('"turnId"');
  });

  it('la prosa dice el tope de 7 por bando y dónde está tu base', () => {
    expect(RESPONSE_FORMAT.map_generate).toMatch(/de 1 a 7/);
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/6 individuos además del héroe/);
    expect(RESPONSE_FORMAT.adventure_turn).toContain('yourBase');
  });

  it('la prosa avisa de que, con un héroe dentro, la ciudad la defiende solo él (regla del usuario, I2)', () => {
    // La regla está fijada en `game.test.ts`; esto fija que el agente la sepa
    // antes de llevar a su héroe a casa a defender contando con la guarnición.
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/la defiende SOLO ese héroe con su tropa/);
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/la guarnición NO se suma a la batalla/);
  });

  it('el turno dice cuál es tu base, y la batalla cuál es tu héroe', () => {
    const state = newGame({ seed: 12 });
    const turno = serializeAdventureTurn(state, 0) as { yourBase: string | null };
    expect(turno.yourBase).toBe(townsOf(state, 0)[0]!.id);
    const hero = heroesOf(state, 0)[0]!;
    forzarBatalla(state, { rng: createRng(12) }, hero);
    const batalla = serializeBattleTurn(
      state.pendingBattle!.battle,
      'attacker',
      'propia',
      state.players[0]!.resources.gold,
    ) as {
      stacks: { side: string; commander?: boolean; name: string }[];
      hero: Record<string, unknown>;
    };
    const mios = batalla.stacks.filter((s) => s.side === 'attacker' && s.commander === true);
    expect(mios.map((s) => s.name)).toEqual([hero.name]);
    // El héroe ya no lleva ataque ni defensa: no bonifica, pelea con su cuerpo.
    expect(batalla.hero.attack).toBeUndefined();
    expect(batalla.hero.defense).toBeUndefined();
  });

  it('el formato de respuesta avisa de que `cast` no gasta el turno y de que no hay acción de aprender', () => {
    // La prosa viaja con el campo: un campo nuevo que el agente no sabe leer es
    // ruido, y una acción que no existe la intentaría igual si nadie se lo dice.
    expect(RESPONSE_FORMAT.battle_turn).toMatch(/no consume el turno/i);
    expect(RESPONSE_FORMAT.adventure_turn).toContain('teaches');
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/no hay acción para aprender/i);
  });

  it('y nombra el terreno y los caminos, o el dato viaja y no se mira (#85)', () => {
    // La regla de la casa, escrita en `serialize.ts` a cuenta de `level`: un
    // dato nuevo que el contrato no nombra es un dato que el agente no mira.
    const prosa = RESPONSE_FORMAT.adventure_turn;
    expect(prosa).toContain('"knownMap"');
    expect(prosa).toContain('"terrain"');
    expect(prosa).toContain('"roads"');
    // El índice, que es cómo se lee el array plano.
    expect(prosa).toMatch(/y\*width\+x/);
    // El `null` es ignorancia y no hierba: sin esta línea, el 45 % del mapa del
    // día 6 se lee como un terreno raro en vez de como un hueco.
    expect(prosa).toMatch(/no has explorado/);
    expect(prosa).toMatch(/hierba/);
    // El agua no se pisa: es lo que convierte el terreno en una decisión.
    expect(prosa).toMatch(/"water"[^.]*NO se cruzan/);

    // Aquí había dos aserciones —`CADENAS "x,y"` y el ejemplo `"3,7"`— que
    // anclaban una advertencia que ya no hay que dar: `roads` viajaba como
    // claves de texto y era el único campo del payload que no iba como {x,y}.
    // Se normalizó el dato en vez de documentar la rareza, así que la viñeta
    // desapareció y con ella el riesgo que no tenía guardia. Lo que queda es
    // que la prosa diga la forma que SÍ tiene.
    expect(prosa).toMatch(/como puntos \{x,y\}/);
    expect(prosa, 'la clave de almacenamiento no vuelve a la red').not.toMatch(/CADENAS/);
  });

  it('y la descripción de knownMap es UNA, compartida con la tool `map`', () => {
    // `MAPA_DESCRIPCION` y esta prosa describían el MISMO objeto en dos
    // redacciones a mano que se citaban la una a la otra —«es lo mismo que
    // viaja en knownMap» / «es lo mismo que devuelve la tool map»— y ya habían
    // divergido en el commit que las unificó por el lado del dato: la de la
    // tool no tenía ni el agua infranqueable ni los costes, así que el agente
    // que llamaba a la tool recibía una descripción estrictamente peor.
    //
    // Esta mitad comprueba la puerta que un test alcanza. La otra —que la tool
    // publicada lo lleve— la comprueba `pnpm qa` contra un cliente MCP de
    // verdad, porque `mcp/server.ts` abre el transporte al importarlo y desde
    // aquí no se puede afirmar nada sobre él.
    expect(RESPONSE_FORMAT.adventure_turn).toContain(COMO_SE_LEE_EL_MAPA);

    // Y que el bloque no esté vacío ni sea un trozo suelto: si alguien lo
    // recorta a una línea, esto sigue pasando y no debería.
    expect(COMO_SE_LEE_EL_MAPA).toMatch(/"terrain"/);
    expect(COMO_SE_LEE_EL_MAPA).toMatch(/"roads"/);
    expect(COMO_SE_LEE_EL_MAPA).toMatch(/"objects"/);
    // Y las dos reglas de la 2a que el agente no puede deducir del mapa: que
    // perder la base es perder, y que lo hostil no se cruza (`caminoHasta`).
    expect(COMO_SE_LEE_EL_MAPA).toMatch(/si la pierdes quedas eliminado en el\s+acto/);
    expect(COMO_SE_LEE_EL_MAPA).toMatch(/Las\s+dos nacen con guarnición/);
    expect(COMO_SE_LEE_EL_MAPA).toMatch(/se alcanzan pero no se\s+cruzan/);
  });

  it('y los costes de la prosa salen de costeDeEntrada, no de la tabla', () => {
    // La primera redacción de este test leía `TERRAIN_COST`, o sea que **anclaba
    // la copia y no la regla**: la prosa derivaba las cifras de la tabla y
    // reescribía a mano la fórmula de al lado —el camino que sustituye al
    // terreno, la diagonal que multiplica y redondea—, y este test la daba por
    // buena. Es el mismo criterio que `game.test.ts` ya aplica al medir un paso:
    // «se mide llamando a `stepCost` y no leyendo la tabla».
    //
    // Ahora la prosa lleva las dos columnas ya resueltas y el test las pide a la
    // misma función que se las cobra al héroe. El día que el camino deje de ser
    // plano o el redondeo cambie, las dos se mueven juntas o esto se pone rojo.
    const prosa = RESPONSE_FORMAT.adventure_turn;
    for (const kind of TERRAIN_KINDS) {
      if (isWalkable(kind)) {
        const fila = `${kind} ${costeDeEntrada(kind, false, false)} (${costeDeEntrada(kind, false, true)} en diagonal)`;
        expect(prosa, `falta el coste de ${kind}`).toContain(fila);
      } else {
        // Una barrera no tiene coste que anunciar —no se pisa, y desde que el
        // tipo separa `Suelo` de `Barrera` ni siquiera tiene precio en la tabla—.
        expect(prosa, `${kind} no se pisa: no se le anuncia coste`).not.toMatch(
          new RegExp(`\\b${kind} \\d+ \\(`),
        );
      }
    }
    // El camino no depende del terreno de debajo, así que se pregunta por uno
    // cualquiera: si algún día dependiera, esta línea dejaría de ser cierta.
    expect(prosa).toContain(
      `camino cuesta ${costeDeEntrada('grass', true, false)} (${costeDeEntrada('grass', true, true)} en diagonal)`,
    );
    // Y la fórmula NO viaja: al agente se le dan números, no deberes. Una prosa
    // que le pida multiplicar y redondear es una segunda implementación de
    // `costeDeEntrada` escrita en un sitio donde nada la puede comprobar.
    expect(prosa, 'la prosa no debe reescribir la fórmula').not.toMatch(/multiplica|redondea/i);
  });

  it('las cinco barreras entran en un plan del agente y la prosa las nombra todas', () => {
    // El plan de prueba con cada cordillera de un tipo distinto: el esquema y
    // la validación de los dos productores tienen que dejar pasar las cinco, y
    // la red sale igual porque las cinco bloquean lo mismo.
    const plan = planDeNodos();
    const tipos = ['cliff', 'forest', 'wall', 'water'] as const;
    const conBarreras = {
      ...plan,
      walls: plan.walls.map((m, i) => ({ ...m, terrain: tipos[i % tipos.length]! })),
    };
    expect(mapPlanSchema.safeParse(conBarreras).success).toBe(true);
    expect(validateMapPlan(conBarreras)).toEqual([]);
    // Un suelo como muro no es una barrera, y se dice cuáles valen.
    const conHierba = {
      ...plan,
      walls: [...plan.walls, { terrain: 'grass', from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }],
    };
    expect(mapPlanSchema.safeParse(conHierba).success).toBe(false);
    // Las dos prosas, derivadas de la misma lista: la del plan y la del turno.
    for (const b of BARRERAS) {
      expect(RESPONSE_FORMAT.map_generate, `el plan no nombra ${b}`).toContain(`"${b}"`);
      expect(RESPONSE_FORMAT.adventure_turn, `el turno no nombra ${b}`).toContain(`"${b}"`);
      expect(isWalkable(b), `${b} se pisa`).toBe(false);
    }
    expect(
      (
        serializeMapRequest({ width: 24, height: 24, players: [0, 1] }) as {
          palette: { wallTerrains: string[] };
        }
      ).palette.wallTerrains,
    ).toEqual([...BARRERAS]);
  });

  it('el formato de respuesta avisa de que la crónica pasa por la niebla', () => {
    // El campo cambió de significado sin cambiar de forma, que es el caso más
    // fácil de dejar sin explicar: un agente que crea que `recentEvents` es
    // todo lo que pasa leerá un silencio como «el rival está quieto» y decidirá
    // sobre eso.
    expect(RESPONSE_FORMAT.adventure_turn).toContain('recentEvents');
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/observabas cuando ocurrió/i);
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/silencio NO significa/i);
  });

  it('lo que el esquema del mapa acota, la prosa lo dice (#97)', () => {
    // El esquema y la prosa viajan juntos en la misma petición, así que acotar
    // sin anunciarlo es fabricar un rechazo que el agente no puede prever: no se
    // corrige, reintenta. Lo mismo que se aprendió con `PARAMETRO_JUGADOR`.
    expect(RESPONSE_FORMAT.map_generate).toMatch(/minúsculas/);
    expect(RESPONSE_FORMAT.map_generate).toMatch(/town-0/);
    expect(RESPONSE_FORMAT.map_generate).toMatch(/no puede repetirse/);
    expect(RESPONSE_FORMAT.map_generate).toMatch(/heroStarts/);
    // Aquí decía `/numerados desde 0/`: era la convención en prosa de la que el
    // agente tenía que sacar QUÉ jugadores colocar. Desde #101 ese dato viaja en
    // el payload y la prosa manda leerlo; lo que se acota se sigue anunciando.
    expect(RESPONSE_FORMAT.map_generate).toMatch(/want\.players/);
  });

  it('y la prosa enumera TODO lo que se valida, no tres cuartas partes', () => {
    // La lección del bloqueante: la paleta manda cuatro listas al agente y solo
    // tres se validaban. La que faltaba era la única que el motor ejecuta, y
    // `RESPONSE_FORMAT` tampoco la nombraba entre las «reglas que se validan»,
    // así que un modelo que lea el contrato no tiene motivo para creer que la
    // lista sea cerrada ni que distinga mayúsculas. Ahora lo dice.
    const prosa = RESPONSE_FORMAT.map_generate;
    expect(prosa).toMatch(/creaturesForGuards/);
    expect(prosa).toMatch(/Distingue mayúsculas/);
    // Las posiciones de inicio ocupan casilla.
    expect(prosa).toMatch(/posiciones de inicio TAMBIÉN\s+ocupan/);
    // Los dueños tienen que jugar.
    expect(prosa).toMatch(/owner.*jugador CON posición\s+de inicio/s);
    // El tamaño pedido es el que hay que devolver.
    expect(prosa).toMatch(/Devuelve el "width" y el "height" que se te piden/);
    // Y que el orden no le regala la iniciativa a nadie.
    expect(prosa).toMatch(/ORDEN en que escribas "heroStarts" no decide nada/);
  });

  it('la prosa de map_generate explica la red: regiones, muros, nodos y la ciudad como nodo', () => {
    // El esquema y la prosa cambian en el mismo commit (fase 2a): un campo que
    // el esquema pide y la prosa no nombra es un campo que el agente no rellena.
    const prosa = RESPONSE_FORMAT.map_generate;
    for (const campo of ['patches', 'regions', 'walls', 'nodes', 'villages']) {
      expect(prosa, campo).toContain(`${campo}[]`);
    }
    expect(prosa).toMatch(/Una CIUDAD \("towns"\) ES un nodo/);
    expect(prosa).toMatch(
      /tramo RECTO de una barrera: "mountain", "water", "forest", "cliff", "wall"/,
    );
    expect(prosa).toMatch(/se te dice entre qué dos casillas\s+queda el paso abierto/);
    expect(prosa).toMatch(/ciudad neutral \("owner": null\) nace con guarnición/);
    // Y la base también, y CUÁL es la base: el agente que diseña el mapa decide
    // con el orden de "towns" qué ciudad suya nace guarnecida.
    expect(prosa).toMatch(/su PRIMERA ciudad en "towns"—\s+nace también\s+con guarnición/);
    // Y la paleta le da los muros, derivados de la misma lista que valida.
    const payload = serializeMapRequest({ width: 24, height: 24, players: [0, 1] }) as {
      palette: { wallTerrains: string[]; terrains: string[] };
    };
    expect(payload.palette.wallTerrains).toEqual([...BARRERAS]);
    expect(payload.palette.terrains).toContain('mountain');
  });

  it('el mapa conocido trae los nodos con su dueño y los pueblos, y no promete minas con bandera', () => {
    const state = newGame({ seed: 3 });
    revealEverything(state, 0);
    const objetos = (
      serializeAdventureTurn(state, 0) as {
        knownMap: { objects: { kind: string; owner?: unknown; name?: unknown }[] };
      }
    ).knownMap.objects;
    const nodos = objetos.filter((o) => o.kind === 'node');
    expect(nodos.length).toBeGreaterThan(0);
    for (const n of nodos) expect(n).toHaveProperty('owner');
    expect(
      objetos.filter((o) => o.kind === 'village').every((v) => typeof v.name === 'string'),
    ).toBe(true);
    for (const m of objetos.filter((o) => o.kind === 'mine')) expect(m).not.toHaveProperty('owner');
    expect(COMO_SE_LEE_EL_MAPA).not.toMatch(/mina cambia de dueño/);
    expect(COMO_SE_LEE_EL_MAPA).toMatch(
      /"mountain", "water", "forest", "cliff", "wall" NO se cruzan/,
    );
  });

  it('la petición de mapa describe la paleta disponible', () => {
    const payload = serializeMapRequest({ width: 24, height: 24, players: [0, 1] });
    expect(payload.palette.terrains).toContain('grass');
    expect(payload.palette.factions).toEqual(['knight', 'necromancer']);
  });

  it('las facciones y las criaturas de guardia de la paleta salen del catálogo, no de una copia (#108)', () => {
    const { palette } = serializeMapRequest({ width: 24, height: 24, players: [0, 1] });
    // Las facciones: la misma lista que acepta el esquema del plan.
    expect(palette.factions).toEqual([...FACTION_IDS]);
    const ciudad = mapPlanSchema.shape.towns.element.shape.faction;
    expect(ciudad.options).toEqual([...FACTION_IDS]);

    // Cada criatura de guardia existe, es base —ninguna otra mejora a ella— y
    // de morada ≤ 4; y cada facción pone las suyas. Es la regla que la lista
    // escrita a mano cumplía sin decirlo.
    const mejoras = new Set(allCreatures().flatMap((c) => c.upgradesTo ?? []));
    for (const id of palette.creaturesForGuards) {
      const c = creature(id);
      expect(mejoras.has(id), `${id} es una mejora`).toBe(false);
      expect(c.morada).toBeLessThanOrEqual(4);
    }
    for (const f of FACTION_IDS) {
      expect(palette.creaturesForGuards.some((id) => creature(id).faction === f)).toBe(true);
    }
    // Y lo que el agente recibe no cambia al derivarla: son las ocho de antes,
    // en el mismo orden.
    expect(palette.creaturesForGuards).toEqual([
      'peasant',
      'archer',
      'pikeman',
      'swordsman',
      'skeleton',
      'zombie',
      'mummy',
      'vampire',
    ]);
  });

  it('la petición de mapa sigue pidiendo ancho y alto, y aconseja las regiones y minas del procedimental (#195)', () => {
    // El agente diseña a mano: el tamaño lo fija el servidor (derivado de las
    // regiones) y el reparto por regiones le llega como consejo, sacado de las
    // mismas funciones que usa el generador.
    const lado = LADO_DEL_MAPA;
    const payload = serializeMapRequest({ width: lado, height: lado, players: [0, 1] }) as {
      want: { width: number; height: number };
      advice: string[];
    };
    expect(payload.want).toMatchObject({ width: lado, height: lado });
    expect(payload.advice).toContain(
      `En ${lado}×${lado} el mapa procedimental hace ${REGIONES_POR_BANDO} regiones por jugador, en espejo: ` +
        `la de casa con minas de gold, wood, ore, y cada una de las ${REGIONES_POR_BANDO - 1} de fuera con 2: una de recurso raro y una básica.`,
    );
  });

  it('la petición de mapa dice CUÁLES son los jugadores, no cuántos', () => {
    // Antes viajaba `players: 2` y de qué números eran esos dos se enteraba el
    // agente por una frase de `RESPONSE_FORMAT` («numerados desde 0»). El dato
    // que hay que leer no puede vivir en la prosa que lo explica.
    const payload = serializeMapRequest({ width: 24, height: 24, players: [0, 1] }) as {
      want: { players: unknown };
    };
    expect(payload.want.players).toEqual([0, 1]);

    // Y no son siempre el 0 y el 1: eso es justo lo que la convención daba por
    // supuesto. Lo que se manda es la lista que se pidió.
    const raro = serializeMapRequest({ width: 24, height: 24, players: [3, 7] }) as {
      want: { players: unknown };
    };
    expect(raro.want.players).toEqual([3, 7]);
  });

  it('y la prosa del mapa manda leer "want.players" en vez de contar desde 0', () => {
    const prosa = RESPONSE_FORMAT.map_generate;
    expect(prosa).toMatch(/EXACTAMENTE los jugadores de "want\.players"/);
    // La convención muere: si vuelve a aparecer, el dato ha vuelto a la prosa.
    expect(prosa).not.toMatch(/numerados desde 0/);
    expect(prosa).not.toMatch(/"players": 2 son el 0 y el 1/);
  });
});

describe('respuestas del agente', () => {
  it('acepta una respuesta de turno bien formada', () => {
    const r = responseSchemas.adventure_turn.safeParse({
      actions: [
        { type: 'build', town: 'town-1', building: 'knight_dwelling_2' },
        { type: 'move_hero', hero: 'hero-1', to: { x: 3, y: 4 } },
      ],
      reasoning: 'Construyo y salgo a por la mina.',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza acciones inventadas y dice qué falla', () => {
    const r = responseSchemas.adventure_turn.safeParse({
      actions: [{ type: 'teleport', hero: 'hero-1' }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.length).toBeGreaterThan(0);
  });

  it('rechaza reclutar una cantidad negativa', () => {
    const r = responseSchemas.adventure_turn.safeParse({
      actions: [{ type: 'recruit', town: 't', creature: 'peasant', count: -5 }],
    });
    expect(r.success).toBe(false);
  });

  it('rechaza un plan de mapa fuera de límites', () => {
    const r = responseSchemas.map_generate.safeParse({
      plan: {
        width: 500,
        height: 4,
        baseTerrain: 'grass',
        patches: [],
        regions: [],
        walls: [],
        nodes: [],
        towns: [],
        heroStarts: [],
        mines: [],
        villages: [],
        resources: [],
        monsters: [],
        chests: [],
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('el nivel en el contrato: derivado de las cifras (12-10-2026)', () => {
  it('`creature_stats` da la morada como `dwelling` y el `level` y el `powerIndex` derivados', () => {
    for (const c of allCreatures()) {
      const ficha = fichaDeCriatura(c);
      expect(ficha.dwelling, c.id).toBe(c.morada);
      expect(ficha.powerIndex, c.id).toBe(indiceDePoder(c));
      expect(ficha.level, c.id).toBe(Math.floor(ficha.powerIndex / 100));
      expect(ficha.level, c.id).toBe(nivelDeUnidad(c));
      expect('morada' in ficha, c.id).toBe(false);
      // Las cifras van tal cual: el agente no recibe otra criatura que la del motor.
      expect(ficha).toMatchObject({ attack: c.attack, damage: c.damage, hp: c.hp });
    }
    // El montaraz es de la morada 2 y sus cifras son de nivel 3: dos datos.
    expect(fichaDeCriatura(creature('ranger'))).toMatchObject({ dwelling: 2, level: 3 });
  });

  it('la prosa nombra rango y nivel con las claves que viajan', () => {
    const p = RESPONSE_FORMAT.adventure_turn;
    for (const clave of ['"rank"', '"level"', '"powerIndex"', '"dwelling"', '"nextRankAt"']) {
      expect(p, clave).toContain(clave);
    }
    expect(RESPONSE_FORMAT.battle_turn).toContain('"veteranRank"');
    expect(`${p}${RESPONSE_FORMAT.battle_turn}`).not.toMatch(/nextLevelAt|veteranLevel/);
  });
});

describe('la tropa se hace héroe: el contrato', () => {
  it('el kind nuevo tiene esquema y una prosa que nombra los tres campos', () => {
    const prosa = RESPONSE_FORMAT.hero_from_troop;
    for (const campo of ['"name"', '"story"', '"heroType"', 'heroTypes']) {
      expect(prosa, campo).toContain(campo);
    }
    // Lo que el agente tiene que saber antes de elegir: es inerte, nace sin
    // movimiento y —desde I1— con la guarnición si nace en el castillo, y una
    // respuesta mala no se reintenta enseguida.
    expect(prosa).toMatch(/todavía NO da ninguna habilidad/);
    expect(prosa).toMatch(/SIN MOVIMIENTO hasta mañana/);
    expect(prosa).toMatch(/se lleva la\s+guarnición que le quepa/);
    expect(prosa).not.toMatch(/SIN TROPA/);
    expect(prosa).toMatch(/no se te vuelve a preguntar por él hasta que\s+salga de la base/);
    // Y el turno de aventura anuncia la regla con el tope interpolado.
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/SE\s+HACE HÉROE/);
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/Con 4 héroes no se te pide nada/);
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/RECOGE LA GUARNICIÓN/);
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/"veteransWaiting"/);
    expect(RESPONSE_FORMAT.adventure_turn).toMatch(/"type"/);
  });

  it('el esquema acota el nombre y la historia, y deja el tipo para quien sabe la facción', () => {
    const s = responseSchemas.hero_from_troop;
    expect(s.safeParse({ name: 'Ana', story: 'Una línea.', heroType: 'lo_que_sea' }).success).toBe(
      true,
    );
    expect(s.safeParse({ name: 'Ana\nB', story: 'x', heroType: 'monje' }).success).toBe(false);
    expect(s.safeParse({ name: 'x'.repeat(41), story: 'x', heroType: 'monje' }).success).toBe(
      false,
    );
    expect(s.safeParse({ name: 'Ana', story: 'a\nb', heroType: 'monje' }).success).toBe(false);
    expect(s.safeParse({ name: 'Ana', story: 'x'.repeat(281), heroType: 'monje' }).success).toBe(
      false,
    );
    expect(s.safeParse({ name: 'Ana', story: '', heroType: 'monje' }).success).toBe(false);
    expect(s.safeParse({ name: 'Ana', story: 'x' }).success).toBe(false);
  });

  it('cada héroe del turno lleva su tipo, y solo el nacido de la tropa su historia', () => {
    const state = newGame({ seed: 12 });
    const turno = serializeAdventureTurn(state, 0) as { heroes: Record<string, unknown>[] };
    for (const h of turno.heroes) {
      expect(h.type).toBe('caballero');
      expect('story' in h).toBe(false);
    }
  });
});

describe('las voces de la base (town_voices)', () => {
  it('está en las tres tablas, y la prosa nombra los campos y los topes', () => {
    expect(REQUEST_KINDS).toContain('town_voices');
    expect(responseSchemas.town_voices).toBeDefined();
    const prosa = RESPONSE_FORMAT.town_voices;
    for (const campo of ['"voices"', '"town"', '"npc"', '"lines"', '160', 'PRESENTACIÓN']) {
      expect(prosa, campo).toContain(campo);
    }
  });

  it('el esquema acota la forma: de 1 a 3 líneas por persona y 48 voces como mucho', () => {
    const voz = (lines: string[]) => ({ town: 't', npc: 'encargado-hall', lines });
    const esquema = responseSchemas.town_voices;
    expect(esquema.safeParse({ voices: [voz(['Hola.'])] }).success).toBe(true);
    expect(esquema.safeParse({ voices: [voz([])] }).success).toBe(false);
    expect(esquema.safeParse({ voices: [voz(['a', 'b', 'c', 'd'])] }).success).toBe(false);
    expect(
      esquema.safeParse({ voices: Array.from({ length: 49 }, () => voz(['x'])) }).success,
    ).toBe(false);
    // Una línea con un salto NO tira la respuesta entera: la juzga `ponerVoces`
    // línea a línea (criterio 8), y por eso el esquema la deja pasar.
    expect(esquema.safeParse({ voices: [voz(['bien', 'con\nsalto'])] }).success).toBe(true);
  });

  it('la petición trae cada base pedida con su gente y lo que dice ahora, y la crónica corta', () => {
    const state = newGame({ seed: 41 });
    const town = state.towns.find((t) => t.owner === 0)!;
    const p = serializeTownVoices(state, 0, [town]);
    expect(p.kind).toBe('town_voices');
    expect(p.towns).toHaveLength(1);
    const ids = p.towns[0]!.npcs.map((n) => n.id);
    expect(ids).toContain('encargado-hall');
    for (const n of p.towns[0]!.npcs) {
      expect(n.current.length, n.id).toBeGreaterThan(0);
      expect(n.name.length, n.id).toBeGreaterThan(0);
    }
    expect(p.towns[0]!.npcs.find((n) => n.id === 'encargado-hall')!.building).toBe('Ayuntamiento');
    expect(p.recentEvents.length).toBeLessThanOrEqual(10);
  });
});
