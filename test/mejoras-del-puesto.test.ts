/**
 * Las mejoras del puesto (puesto fronterizo, fase 3, 04-11-2026;
 * `docs/agents/2026-11-04-puesto-fronterizo/requisitos.md`, «Criterios de aceptación»): un paso
 * tomado es un puesto, y su obra —caseta, empalizada, muralla— se paga en oro con
 * el héroe del dueño dentro, se recuerda por la niebla, viaja al agente y al
 * espectador y pone su muralla en la batalla del paso.
 *
 * Escrito desde los criterios (requisitos C6, C7, C10, C12, C13 y C14), no desde el
 * código: cada rechazo con su frase.
 */
import { describe, expect, it } from 'vitest';
import { marcadoDe } from '../src/client/comun/html.js';
import { adaptarEscena } from '../src/client/espectador/adaptar.js';
import { renderGuarnicion } from '../src/client/partida/guarnicion.js';
import { Session } from '../src/client/sesion/partida.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import { serializeAdventureTurn } from '../src/core/contract/aventura.js';
import { adventureActionSchema } from '../src/core/contract/esquemas.js';
import { RESPONSE_FORMAT } from '../src/core/contract/formato.js';
import { serializeKnownMap } from '../src/core/contract/mapa-conocido.js';
import {
  type MapObject,
  MEJORAS_DEL_PUESTO,
  type MejoraDelPuesto,
  OBRAS_DE_UN_PUESTO,
  type ObraDelPuesto,
} from '../src/core/map/tipos.js';
import { baseOf, heroesOf } from '../src/core/state/consultas.js';
import { applyAdventureAction } from '../src/core/state/game.js';
import { newGame } from '../src/core/state/setup.js';
import {
  leerSitios,
  MURALLAS_DEL_MAPA,
  mejorarBlocker as mejorarBlockerConOro,
  OBRAS_DEL_PUESTO,
  ponerLaGuarnicion,
  sitioPorId,
} from '../src/core/state/sitios.js';
import type { GameState } from '../src/core/state/tipos.js';
import { objetosConocidos, revealEverything, visibleNow } from '../src/core/state/vision.js';
import { construirVista } from '../src/server/vista-espectador.js';
import type { SpectatorView } from '../src/shared/cable-del-espectador.js';
import { ctx, TROPA_BARATA } from './comun.js';
import {
  ejercito,
  forzarBatalla,
  jugarDelAgente,
  motivoDe,
  pegadoA,
  unPaso,
} from './partida-de-prueba.js';

type Nodo = Extract<MapObject, { kind: 'node' }>;

const DOS_BARATAS = () => ejercito({ creature: TROPA_BARATA, count: 2 });

/**
 * En la partida `state`, el primer paso del mapa, de `jugador`, con su héroe de
 * salida dentro y `oro` en su monedero, y el turno suyo.
 */
function enSuPaso(
  state: GameState,
  jugador: 0 | 1,
  oro: number,
): { readonly paso: Nodo; readonly heroe: string } {
  const paso = unPaso(state);
  paso.owner = jugador;
  const heroe = heroesOf(state, jugador)[0]!;
  heroe.at = { ...paso.at };
  state.players[jugador]!.oro = oro;
  state.current = jugador;
  return { paso, heroe: heroe.id };
}

/** La partida de `seed` con el héroe del jugador 0 en un paso suyo y `oro` en el monedero. */
function partidaEnSuPaso(seed: number, oro: number) {
  const state = newGame({ seed });
  return { state, ...enSuPaso(state, 0, oro) };
}

/** Manda `mejorar_el_puesto` del héroe `heroe`, pidiendo `obra`, como el jugador de turno. */
function mejorar(state: GameState, heroe: string, obra: ObraDelPuesto): void {
  applyAdventureAction(
    state,
    { type: 'mejorar_el_puesto', hero: heroe, obra },
    ctx(1),
    state.current,
  );
}

/** Mejora el puesto donde está `heroe` hasta la obra `obra`, de una en una. */
function mejorarHasta(state: GameState, heroe: string, obra: MejoraDelPuesto): void {
  for (const o of OBRAS_DE_UN_PUESTO.slice(0, MEJORAS_DEL_PUESTO.indexOf(obra))) {
    mejorar(state, heroe, o);
  }
}

/** `mejorarBlocker` del jugador `jugador`, pidiendo `obra`, con el oro de su monedero. */
function mejorarBlocker(
  state: GameState,
  jugador: 0 | 1,
  heroe: string,
  obra: ObraDelPuesto = 'empalizada',
): string | null {
  return mejorarBlockerConOro(state, jugador, heroe, obra, state.players[jugador]!.oro);
}

describe('los datos de las obras', () => {
  it('la empalizada cuesta 1 500 y se pelea tras la de madera; la muralla, 4 000 y tras la de piedra', () => {
    expect(OBRAS_DEL_PUESTO.empalizada.precio).toBe(1500);
    expect(OBRAS_DEL_PUESTO.muralla.precio).toBe(4000);
    // La forma no se copia: es la misma muralla de los pueblos y de las ciudades.
    expect(OBRAS_DEL_PUESTO.empalizada.muralla).toBe(MURALLAS_DEL_MAPA.pueblo);
    expect(OBRAS_DEL_PUESTO.muralla.muralla).toBe(MURALLAS_DEL_MAPA.ciudad);
  });

  it('una obra que no vale lanza nombrando el fichero, la obra y el motivo', () => {
    const { ciudad: gruesa, pueblo: linea } = MURALLAS_DEL_MAPA;
    const usos = {
      ciudad: { muralla: 'gruesa' },
      pueblo: { muralla: 'linea' },
      empalizada: { muralla: 'linea', precio: 1500 },
      muralla: { muralla: 'gruesa', precio: 4000 },
    };
    const con = (cambio: Record<string, unknown>) => () =>
      leerSitios({ murallas: { gruesa, linea }, usos: { ...usos, ...cambio } });
    expect(con({})().obras.muralla.precio).toBe(4000);
    expect(con({ empalizada: { precio: 0, muralla: 'linea' } })).toThrow(
      'data/sitios.json: el uso «empalizada»: «precio» tiene que ser 1 o más, y es 0',
    );
    expect(con({ empalizada: { precio: 1.5, muralla: 'linea' } })).toThrow(
      '«precio» tiene que ser un número entero, y es 1.5',
    );
    expect(con({ empalizada: { muralla: 'linea' } })).toThrow(
      'el uso «empalizada»: falta «precio»',
    );
    // La ciudad y el pueblo no tienen precio: no se compran.
    expect(con({ ciudad: { muralla: 'gruesa', precio: 1 } })).toThrow(
      'el uso «ciudad»: «precio» no es un campo; valen muralla',
    );
    // Lo que dice el nombre: una empalizada no puede pelearse tras la piedra.
    expect(con({ empalizada: { precio: 1500, muralla: 'gruesa' } })).toThrow(
      'el uso «empalizada»: la empalizada se pelea tras una muralla de madera, y «gruesa» es de piedra',
    );
    expect(con({ muralla: { precio: 4000, muralla: 'linea' } })).toThrow(
      'la muralla se pelea tras una muralla de piedra, y «linea» es de madera',
    );
  });

  it('todo paso nace sin obra', () => {
    for (const seed of [1, 5, 37]) {
      const nodos = newGame({ seed }).map.objects.filter((o) => o.kind === 'node');
      expect(nodos.length).toBeGreaterThan(0);
      for (const n of nodos) expect(n.mejora, n.id).toBe('ninguna');
    }
  });
});

describe('mejorarBlocker y el cobro', () => {
  it('de la caseta a la empalizada y de la empalizada a la muralla, cobrando cada una', () => {
    const { state, paso, heroe } = partidaEnSuPaso(5, 6000);
    expect(mejorarBlocker(state, 0, heroe)).toBeNull();
    mejorar(state, heroe, 'empalizada');
    expect(paso.mejora).toBe('empalizada');
    expect(state.players[0]!.oro).toBe(4500);
    expect(state.log.at(-1)).toMatchObject({
      kind: 'outpost_upgraded',
      hero: heroe,
      site: paso.id,
      to: 'empalizada',
      cost: 1500,
      actor: 0,
      at: paso.at,
    });
    expect(state.log.at(-1)).toHaveProperty('seen');
    // Inmediata y sin tope por día: la siguiente, el mismo turno.
    mejorar(state, heroe, 'muralla');
    expect(paso.mejora).toBe('muralla');
    expect(state.players[0]!.oro).toBe(500);
    expect(state.log.at(-1)).toMatchObject({ kind: 'outpost_upgraded', to: 'muralla', cost: 4000 });
    // Y no hay más (lo dice como nota en la pantalla: `laObraDelPuesto`).
    expect(mejorarBlocker(state, 0, heroe, 'muralla')).toMatch(
      /^el puesto de.* ya está amurallado: no hay más obra que hacer$/,
    );
    expect(() => mejorar(state, heroe, 'muralla')).toThrow(
      /no se puede mejorar el puesto: el puesto de.* ya está amurallado/,
    );
    expect(state.players[0]!.oro).toBe(500);
  });

  it('sin oro no se mejora, lo dice con la frase del oro y no cobra nada', () => {
    const { state, paso, heroe } = partidaEnSuPaso(5, 1000);
    expect(mejorarBlocker(state, 0, heroe)).toBe(
      'no alcanza el oro: cuesta 1500 oro y tienes 1000 oro',
    );
    expect(() => mejorar(state, heroe, 'empalizada')).toThrow('no alcanza el oro');
    expect(paso.mejora).toBe('ninguna');
    expect(state.players[0]!.oro).toBe(1000);
    expect(state.log.some((e) => e.kind === 'outpost_upgraded')).toBe(false);
  });

  it('solo en un paso suyo, con su héroe y en su turno', () => {
    const { state, paso, heroe } = partidaEnSuPaso(5, 99999);
    // El paso de otro.
    paso.owner = 1;
    expect(mejorarBlocker(state, 0, heroe)).toMatch(/^el .* de \(\d+,\d+\) no es tuyo$/);
    // El de nadie, tampoco.
    paso.owner = null;
    expect(mejorarBlocker(state, 0, heroe)).toMatch(/no es tuyo$/);
    paso.owner = 0;
    // Un héroe que no es suyo.
    const ajeno = heroesOf(state, 1)[0]!.id;
    expect(mejorarBlocker(state, 0, ajeno)).toMatch(/no es de tu bando$/);
    expect(mejorarBlocker(state, 0, 'nadie')).toBe('no existe ningún héroe "nadie"');
    // Fuera de un sitio: el motivo habla de lo que se pidió, no de la tropa.
    const h = heroesOf(state, 0)[0]!;
    h.at = pegadoA(state, paso.at);
    expect(mejorarBlocker(state, 0, heroe)).toMatch(
      /no está en ninguna ciudad, paso ni pueblo: solo se mejora un paso tuyo, un puesto$/,
    );
    // En su base, que es una ciudad: no se mejora.
    h.at = { ...baseOf(state, 0)!.at };
    expect(mejorarBlocker(state, 0, heroe)).toMatch(
      /^solo se mejora un paso tomado, un puesto: .* es una ciudad$/,
    );
    // Y en el turno del otro, la acción lo dice antes que nada.
    h.at = { ...paso.at };
    state.current = 0;
    expect(() =>
      applyAdventureAction(
        state,
        { type: 'mejorar_el_puesto', hero: heroe, obra: 'empalizada' },
        ctx(1),
        1,
      ),
    ).toThrow();
    expect(paso.mejora).toBe('ninguna');
  });

  it('la obra se pide por su nombre: la que no toca se rechaza diciendo cuál toca, y no cobra (H-F3-1)', () => {
    const { state, paso, heroe } = partidaEnSuPaso(5, 99999);
    // Sin obra, la muralla no se salta la empalizada.
    expect(mejorarBlocker(state, 0, heroe, 'muralla')).toMatch(
      /^el puesto de.* \(\d+,\d+\) aún no tiene ninguna obra: la siguiente obra es la empalizada$/,
    );
    mejorar(state, heroe, 'empalizada');
    expect(state.players[0]!.oro).toBe(99999 - 1500);
    // El segundo clic de un doble clic en «Levantar la empalizada»: ya la tiene.
    expect(mejorarBlocker(state, 0, heroe, 'empalizada')).toMatch(
      /^el puesto de.* ya tiene la empalizada: la siguiente obra es la muralla$/,
    );
    const hechos = state.log.length;
    expect(() => mejorar(state, heroe, 'empalizada')).toThrow(
      /^no se puede mejorar el puesto: el puesto de.* ya tiene la empalizada/,
    );
    expect(paso.mejora).toBe('empalizada');
    expect(state.players[0]!.oro).toBe(99999 - 1500);
    expect(state.log.length).toBe(hechos);
    // Amurallado, pida lo que pida, la nota de siempre.
    mejorar(state, heroe, 'muralla');
    expect(mejorarBlocker(state, 0, heroe, 'empalizada')).toMatch(/ya está amurallado/);
    // Lo que no es una obra (el clic lo lee de un atributo) se dice.
    expect(mejorarBlocker(state, 0, heroe, 'torre' as ObraDelPuesto)).toBe(
      '«torre» no es una obra de un puesto; valen empalizada, muralla',
    );
  });

  it('la nota de amurallado concuerda con todo nombre de paso (H-F3-2)', () => {
    const { state, paso, heroe } = partidaEnSuPaso(5, 99999);
    mejorarHasta(state, heroe, 'muralla');
    const { x, y } = paso.at;
    const notas = (['mountain', 'forest', 'cliff', 'water', 'wall'] as const).map((barrera) => {
      // Solo el nombre: `nombreDelSitio` lee la barrera del nodo y nada más.
      (paso as { barrera: Nodo['barrera'] }).barrera = barrera;
      return mejorarBlocker(state, 0, heroe, 'muralla');
    });
    const fin = 'ya está amurallado: no hay más obra que hacer';
    expect(notas).toEqual([
      `el puesto del paso de montaña de (${x},${y}) ${fin}`,
      `el puesto del paso del bosque de (${x},${y}) ${fin}`,
      `el puesto del paso del acantilado de (${x},${y}) ${fin}`,
      `el puesto del puente de (${x},${y}) ${fin}`,
      `el puesto de la puerta de la muralla de (${x},${y}) ${fin}`,
    ]);
  });

  it('la obra se queda con el paso cuando cambia de dueño', () => {
    const { state, paso, heroe } = partidaEnSuPaso(5, 99999);
    mejorarHasta(state, heroe, 'muralla');
    // El rival lo pisa sin guarnición desde una casilla pegada: se lo queda, amurallado.
    heroesOf(state, 0)[0]!.at = { ...baseOf(state, 0)!.at };
    state.current = 1;
    const rival = heroesOf(state, 1)[0]!;
    rival.at = pegadoA(state, paso.at);
    rival.movePoints = 5000;
    applyAdventureAction(state, { type: 'move_hero', hero: rival.id, to: paso.at }, ctx(1), 1);
    expect(rival.at).toEqual(paso.at);
    expect(paso.owner).toBe(1);
    expect(paso.mejora).toBe('muralla');
  });
});

describe('la batalla del paso, tras la muralla de su obra', () => {
  /** La batalla de un héroe del 0 contra la guarnición del paso del 1 con la obra `obra`. */
  function contraElPaso(obra: MejoraDelPuesto) {
    const state = newGame({ seed: 5 });
    // La obra la hace el dueño, pagando, por la puerta de siempre.
    const { paso, heroe } = enSuPaso(state, 1, 99999);
    mejorarHasta(state, heroe, obra);
    heroesOf(state, 1)[0]!.at = { ...baseOf(state, 1)!.at };
    state.current = 0;
    ponerLaGuarnicion(state, sitioPorId(state, paso.id), 1, DOS_BARATAS());
    forzarBatalla(state, ctx(5), heroesOf(state, 0)[0]!, paso.at);
    expect(state.pendingBattle!.foe).toEqual({ kind: 'garrison', site: paso.id });
    return state.pendingBattle!.battle;
  }

  it('la caseta, sin muralla ni escaleras', () => {
    const b = contraElPaso('ninguna');
    expect(b.muralla).toBe(SIN_MURALLA);
    expect(b.stacks.some((s) => s.escalera)).toBe(false);
  });

  it('la empalizada, la de madera; la muralla, la de piedra; y el atacante, con escalera', () => {
    for (const [obra, forma] of [
      ['empalizada', MURALLAS_DEL_MAPA.pueblo],
      ['muralla', MURALLAS_DEL_MAPA.ciudad],
    ] as const) {
      const b = contraElPaso(obra);
      expect(b.muralla, obra).toBe(forma);
      const atacantes = b.stacks.filter((s) => s.side === 'attacker');
      expect(atacantes.length).toBeGreaterThan(0);
      for (const s of atacantes) expect(s.escalera, `${obra} ${s.id}`).toBe(true);
      for (const s of b.stacks.filter((x) => x.side === 'defender')) expect(s.escalera).toBe(false);
    }
  });

  it('el héroe atacado en su paso amurallado defiende tras la piedra', () => {
    const { state, paso, heroe } = partidaEnSuPaso(5, 99999);
    mejorarHasta(state, heroe, 'muralla');
    state.current = 1;
    forzarBatalla(state, ctx(5), heroesOf(state, 1)[0]!, paso.at);
    expect(state.pendingBattle!.foe).toMatchObject({ kind: 'hero', heroId: heroe });
    expect(state.pendingBattle!.battle.muralla).toBe(MURALLAS_DEL_MAPA.ciudad);
  });
});

describe('la niebla, el agente y el espectador', () => {
  it('quien no mira el paso recuerda la obra que vio, y quien lo mira ve la de ahora', () => {
    const { state, paso, heroe } = partidaEnSuPaso(5, 99999);
    // El jugador 1 lo vio un día, sin obra (lo que escriben `descubrir` y
    // `mirarDesde`: la casilla explorada y su recuerdo), y hoy no lo mira.
    expect(visibleNow(state, 1).has(paso.at)).toBe(false);
    state.players[1]!.fog.marcarCuadrado(paso.at, 0);
    state.players[1]!.memory.set(paso.id, { day: state.day, object: { ...paso } });
    // El 0 lo tiene delante (su héroe está en él): lo sabe todo.
    revealEverything(state, 0);
    mejorar(state, heroe, 'empalizada');
    const sabido = (p: 0 | 1) =>
      objetosConocidos(state, p, visibleNow(state, p)).find((r) => r.object.id === paso.id)!
        .object as Nodo;
    expect(sabido(1).mejora).toBe('ninguna');
    expect(sabido(0).mejora).toBe('empalizada');
    // El contrato del agente dice lo mismo, en su vocabulario.
    const nodo = (p: 0 | 1) =>
      serializeKnownMap(state, p).objects.find((o) => o.id === paso.id) as { upgrade: string };
    expect(nodo(1).upgrade).toBe('none');
    expect(nodo(0).upgrade).toBe('palisade');
    mejorar(state, heroe, 'muralla');
    expect(nodo(0).upgrade).toBe('wall');
    // Cuando el 1 lo vuelve a mirar, ve la de ahora.
    heroesOf(state, 1)[0]!.at = { ...paso.at };
    expect(sabido(1).mejora).toBe('muralla');
    expect(nodo(1).upgrade).toBe('wall');
  });

  it('el espectador recibe el nodo con su obra, y uno sin ella lanza diciéndolo', () => {
    const { state, paso, heroe } = partidaEnSuPaso(5, 99999);
    mejorar(state, heroe, 'empalizada');
    const vista: SpectatorView = JSON.parse(JSON.stringify(construirVista(state, [])));
    const escena = adaptarEscena(vista);
    expect(escena.map.objects).toEqual(state.map.objects);
    expect(escena.map.objects.find((o) => o.id === paso.id)).toMatchObject({
      mejora: 'empalizada',
    });
    const sinObra = vista.map.objects.map((o) => {
      if (o.kind !== 'node') return o;
      const { mejora: _, ...resto } = o;
      return resto;
    }) as unknown as SpectatorView['map']['objects'];
    expect(() => adaptarEscena({ ...vista, map: { ...vista.map, objects: sinObra } })).toThrow(
      /el nodo .* llega sin la obra de su puesto \(«mejora»\)/,
    );
  });
});

describe('el diálogo del puesto (la sesión)', () => {
  it('enseña la obra con su precio, mejora dos veces cobrando y apaga el botón con su motivo', () => {
    const s = new Session(5);
    const { paso, heroe } = enSuPaso(s.state, 0, 5000);
    s.abrirLaGuarnicion(heroe);
    const texto = () => marcadoDe(renderGuarnicion(s.vistaDeLaGuarnicion()!));
    expect(s.vistaDeLaGuarnicion()!.obra).toMatchObject({
      ahora: 'ninguna',
      siguiente: { obra: 'empalizada', precio: 1500 },
      materiales: { ninguna: null, empalizada: 'madera', muralla: 'piedra' },
      motivo: null,
      nota: null,
    });
    expect(texto()).toContain('El puesto · una caseta');
    expect(texto()).toContain('Levantar la empalizada · 1500 oro');
    expect(texto()).toContain('se pelea sin muralla');

    expect(texto()).toMatch(/data-action="mejorar-el-puesto" data-obra="empalizada">Levantar/);
    s.mejorarElPuesto('empalizada');
    expect(paso.mejora).toBe('empalizada');
    expect(s.state.players[0]!.oro).toBe(3500);
    expect(s.guarnicionAbierta).toBe(heroe);
    expect(s.status).toMatch(/^Levantada la empalizada del /);
    expect(texto()).toContain('El puesto · una torreta de madera');
    expect(texto()).toContain('tras una muralla de madera');
    // Sin oro para la muralla: el botón apagado, con la frase del oro debajo.
    expect(s.vistaDeLaGuarnicion()!.obra!.motivo).toBe(
      'no alcanza el oro: cuesta 4000 oro y tienes 3500 oro',
    );
    expect(texto()).toMatch(
      /data-action="mejorar-el-puesto" data-obra="muralla" aria-disabled="true"[^>]*>Amurallar · 4000 oro/,
    );
    s.mejorarElPuesto('muralla');
    expect(paso.mejora).toBe('empalizada');
    expect(s.state.players[0]!.oro).toBe(3500);

    s.state.players[0]!.oro = 4000;
    // Fuera de su turno, el botón sale apagado con el motivo del turno, y no mejora.
    s.state.current = 1;
    expect(s.vistaDeLaGuarnicion()!.obra!.motivo).not.toBeNull();
    expect(s.vistaDeLaGuarnicion()!.obra!.motivo).not.toMatch(/oro/);
    s.mejorarElPuesto('muralla');
    expect(paso.mejora).toBe('empalizada');
    s.state.current = 0;
    s.mejorarElPuesto('muralla');
    expect(paso.mejora).toBe('muralla');
    expect(s.state.players[0]!.oro).toBe(0);
    expect(texto()).toContain('El puesto · una torre');
    // Amurallado: apagado, y lo que dice es una nota del núcleo, no un rechazo.
    expect(s.vistaDeLaGuarnicion()!.obra).toMatchObject({ motivo: null, siguiente: null });
    expect(s.vistaDeLaGuarnicion()!.obra!.nota).toMatch(/ya está amurallado/);
    expect(texto()).toMatch(/aria-disabled="true"[^>]*>Mejorar/);
    expect(texto()).toMatch(/class="veterania motivo nota">[^<]*ya está amurallado/);
    expect(texto()).not.toMatch(/class="veterania motivo">/);
    // Fuera de su turno, la nota sigue siendo nota: no hay nada que arreglar.
    s.state.current = 1;
    expect(s.vistaDeLaGuarnicion()!.obra).toMatchObject({ motivo: null });
    expect(s.vistaDeLaGuarnicion()!.obra!.nota).toMatch(/ya está amurallado/);
  });

  it('dos clics seguidos en «Levantar la empalizada» compran solo la empalizada (H-F3-1)', () => {
    const s = new Session(5);
    const { paso, heroe } = enSuPaso(s.state, 0, 25500);
    s.abrirLaGuarnicion(heroe);
    const texto = () => marcadoDe(renderGuarnicion(s.vistaDeLaGuarnicion()!));
    // Lo que manda el clic es la obra del botón pulsado (`data-obra`, `main.ts`); el
    // segundo llega con el diálogo ya repintado ofreciendo la muralla.
    s.mejorarElPuesto('empalizada');
    expect(texto()).toMatch(/data-obra="muralla">Amurallar · 4000 oro/);
    s.mejorarElPuesto('empalizada');
    expect(paso.mejora).toBe('empalizada');
    expect(s.state.players[0]!.oro).toBe(24000);
    expect(s.state.log.filter((e) => e.kind === 'outpost_upgraded')).toHaveLength(1);
    expect(s.status).toMatch(
      /^El puesto de.* ya tiene la empalizada: la siguiente obra es la muralla\.$/,
    );
  });

  it('la ciudad no lleva obra', () => {
    const s = new Session(5);
    const heroe = heroesOf(s.state, 0)[0]!;
    heroe.at = { ...baseOf(s.state, 0)!.at };
    s.abrirLaGuarnicion(heroe.id);
    expect(s.vistaDeLaGuarnicion()!.obra).toBeNull();
    expect(marcadoDe(renderGuarnicion(s.vistaDeLaGuarnicion()!))).not.toContain(
      'mejorar-el-puesto',
    );
  });
});

describe('la jugada del agente: «upgrade_outpost» (10-11-2026)', () => {
  // El contrato del agente, al día (`docs/agents/2026-11-10-contrato-del-agente-al-dia/`),
  // criterio 1: por su puerta entera —el zod, `accionDelAgente` y el núcleo—, y con
  // una sola palabra para la obra en la jugada, en el nodo de `knownMap` y en el hecho.

  const mejora = (hero: string, upgrade: string) => ({ type: 'upgrade_outpost', hero, upgrade });

  it('levanta la empalizada y la muralla, y el hecho, el nodo y la jugada dicen la misma palabra', () => {
    const { state, paso, heroe } = partidaEnSuPaso(5, 6000);
    expect(RESPONSE_FORMAT.adventure_turn).toContain('"type": "upgrade_outpost"');
    for (const [upgrade, obra, oro] of [
      ['palisade', 'empalizada', 4500],
      ['wall', 'muralla', 500],
    ] as const) {
      jugarDelAgente(state, mejora(heroe, upgrade));
      expect(paso.mejora).toBe(obra);
      expect(state.players[0]!.oro).toBe(oro);
      const turno = serializeAdventureTurn(state, 0) as {
        recentEvents: Record<string, unknown>[];
        knownMap: { objects: Record<string, unknown>[] };
      };
      // El hecho, como lo lee el agente: `upgrade`, no `to`, y con la palabra de la jugada.
      expect(turno.recentEvents.at(-1)).toEqual({
        kind: 'outpost_upgraded',
        actor: 0,
        at: paso.at,
        hero: heroe,
        site: paso.id,
        upgrade,
        cost: OBRAS_DEL_PUESTO[obra].precio,
      });
      expect(turno.knownMap.objects.find((o) => o.id === paso.id)).toMatchObject({
        kind: 'node',
        upgrade,
      });
    }
    // El núcleo sigue escribiéndolo como siempre: lo lee el espectador, crudo.
    expect(state.log.at(-1)).toMatchObject({ kind: 'outpost_upgraded', to: 'muralla' });
  });

  it('cada rechazo, con su motivo y sin cobrar', () => {
    const intenta = (state: GameState, heroe: string, upgrade: string): string => {
      const oro = state.players[0]!.oro;
      const motivo = motivoDe(() => jugarDelAgente(state, mejora(heroe, upgrade)));
      expect(state.players[0]!.oro).toBe(oro);
      return motivo;
    };
    // Sin oro.
    const pobre = partidaEnSuPaso(5, 1000);
    expect(intenta(pobre.state, pobre.heroe, 'palisade')).toBe(
      'no se puede mejorar el puesto: no alcanza el oro: cuesta 1500 oro y tienes 1000 oro',
    );
    expect(pobre.paso.mejora).toBe('ninguna');

    const { state, paso, heroe } = partidaEnSuPaso(5, 99999);
    // Saltándose una obra, y una palabra que no es una obra: `none` no se hace.
    expect(intenta(state, heroe, 'wall')).toMatch(
      /^no se puede mejorar el puesto: el puesto de.* aún no tiene ninguna obra: la siguiente obra es la empalizada$/,
    );
    expect(intenta(state, heroe, 'none')).toBe(
      '"none" no es una obra de un puesto; valen palisade, wall',
    );
    expect(intenta(state, heroe, 'empalizada')).toBe(
      '"empalizada" no es una obra de un puesto; valen palisade, wall',
    );
    expect(intenta(state, heroe, 'foso')).toBe(
      '"foso" no es una obra de un puesto; valen palisade, wall',
    );
    expect(paso.mejora).toBe('ninguna');
    // Repitiéndola.
    jugarDelAgente(state, mejora(heroe, 'palisade'));
    expect(intenta(state, heroe, 'palisade')).toMatch(
      /^no se puede mejorar el puesto: el puesto de.* ya tiene la empalizada: la siguiente obra es la muralla$/,
    );
    expect(paso.mejora).toBe('empalizada');
    // En sitio ajeno.
    paso.owner = 1;
    expect(intenta(state, heroe, 'wall')).toMatch(/de \(\d+,\d+\) no es tuyo$/);
    paso.owner = 0;
    // Sin héroe en el paso.
    heroesOf(state, 0)[0]!.at = pegadoA(state, paso.at);
    expect(intenta(state, heroe, 'wall')).toMatch(
      /no está en ninguna ciudad, paso ni pueblo: solo se mejora un paso tuyo, un puesto$/,
    );
    expect(intenta(state, 'nadie', 'wall')).toContain('no existe ningún héroe "nadie"');
    expect(paso.mejora).toBe('empalizada');
    // Y una obra de más de 32 letras no pasa el esquema: la respuesta está mal formada.
    expect(adventureActionSchema.safeParse(mejora(heroe, 'x'.repeat(33))).success).toBe(false);
  });
});
