/**
 * La escena del ayuntamiento (22-10-2026, decisiones del usuario D2 y D3): el
 * héroe de salida se elige y se paga en la base, ante el ayuntamiento, como la
 * tropa ante su morada, y «Contratar héroe» abre la misma elección a media
 * partida. Aquí, la sesión y el panel leídos como texto (vitest va sin DOM, como
 * `paneles.test.ts`); el clic de verdad lo juega `pnpm capturas` («arranque»).
 */
import { describe, expect, it } from 'vitest';
import { EscenaBase } from '../src/client/escenas/castillo.js';
import { marcadoDe } from '../src/client/html.js';
import { componerBase } from '../src/client/render/base/escena.js';
import { dondePulsarElSitio } from '../src/client/render/base/recortes.js';
import { AYUDA_DE_LA_SALIDA, Session } from '../src/client/session.js';
import { renderActions, renderSide } from '../src/client/views/panels.js';
import { ECONOMIA, figuraDelHeroe, tipoDeHeroePorDefecto } from '../src/core/data.js';
import { oroBlocker } from '../src/core/town/town.js';
import { describirCoste } from '../src/core/types.js';
import { disposicionDe } from '../src/shared/base.js';

/** La persona con el héroe de salida por elegir, en su base, como abre `main.ts` sin `?heroe=`. */
const porElegir = (faccion: 'imperio' | 'elfos' = 'imperio') => {
  const s = new Session(11, faccion, null);
  s.abrirSuBase();
  return s;
};

describe('el héroe de salida, ante el ayuntamiento', () => {
  it('la partida abre ante el ayuntamiento, con una figura por tipo (4 en el imperio)', () => {
    const s = porElegir();
    expect(s.scene).toBe('ayuntamiento');
    expect(s.status).toBe(AYUDA_DE_LA_SALIDA);
    expect(s.myHeroes()).toEqual([]);
    const vista = s.vistaDelAyuntamiento()!;
    expect(vista.sitio).toBe('hall');
    expect(vista.tropa).toEqual(s.jugador.heroeDeSalida!.army);
    expect(vista.figuras.map((f) => f.id)).toEqual([
      'duelista',
      'mago',
      'capitan_mercenario',
      'ingeniero',
    ]);
    expect(vista.figuras[1]!.cuerpo).toBe(figuraDelHeroe({ faction: 'imperio', tipo: 'mago' }));
    expect(vista.ficha.tipo).toBe(tipoDeHeroePorDefecto('imperio'));
    expect(porElegir('elfos').vistaDelAyuntamiento()!.figuras).toHaveLength(3);
  });

  it('mientras, la morada no deja reclutar y la base no deja construir, con el motivo del núcleo', async () => {
    const s = porElegir();
    const motivo = s.bloqueoDeTurno()!;
    expect(motivo).toContain('elige a tu héroe de salida ante el ayuntamiento');
    const unidad = Object.keys(s.activeTown!.available)[0]!;
    expect(s.motivoParaNoReclutar(unidad)).toBe(motivo);
    s.cerrarElAyuntamiento();
    expect(s.scene).toBe('town');
    // Lo de construir se lee en «Ampliar», que abre la base al llegar al
    // ayuntamiento: cada «Construir», apagado, con el motivo; el fin de turno, en el mapa.
    const ampliar = marcadoDe(renderSide(s, false, { tipo: 'ampliar' }));
    const construir = [...ampliar.matchAll(/<button data-action="build"[^>]*>/g)].map((m) => m[0]);
    expect(construir.length).toBeGreaterThan(0);
    for (const boton of construir) expect(boton).toMatch(/\sdisabled/);
    expect(ampliar).toContain(motivo);
    // La base no promete reclutar de guarnición: dice que antes hay que elegir (QA H3).
    const base = marcadoDe(renderSide(s, false, null));
    expect(base).not.toContain('lo que reclutes se queda de guarnición');
    expect(base).toContain('Antes de reclutar o construir, elige a tu héroe de salida');
    s.closeTown();
    // El fin de turno sale apagado, con el motivo (QA H3), y el panel del mapa dice
    // que se elige el de salida, no que se contrata uno.
    const finDeTurno = /<button data-action="end-turn"[^>]*>/.exec(marcadoDe(renderActions(s)))![0];
    expect(finDeTurno).toMatch(/\sdisabled/);
    expect(finDeTurno).toContain(`title="${motivo}"`);
    const mapa = marcadoDe(renderSide(s));
    expect(mapa).not.toContain('Contrata uno en tu castillo');
    expect(mapa).toContain('elige el de salida ante el ayuntamiento de tu base');
    // Pasar el turno (Espacio) deja el motivo en la barra.
    await s.endTurn();
    expect(s.status).toBe(motivo);
    expect(s.state.current).toBe(s.viewer);
    expect(s.state.day).toBe(1);
  });

  it('la compuerta de la sesión apaga las acciones, pero la base se sigue abriendo desde el mapa', () => {
    const s = porElegir();
    const motivo = s.bloqueoDeTurno()!;
    s.cerrarElAyuntamiento();
    const oro = s.oro;
    s.build('tavern');
    expect(s.status).toBe(motivo);
    expect(s.oro).toBe(oro);
    s.closeTown();
    // Desde el mapa (la casilla o «Castillos», `open-town`), la base abre ante el
    // ayuntamiento, como al empezar (QA H4).
    const base = s.state.towns.find((t) => t.id === s.jugador.base)!;
    s.clickTile(base.at);
    expect(s.scene).toBe('ayuntamiento');
    expect(s.status).toBe(AYUDA_DE_LA_SALIDA);
    s.cerrarElAyuntamiento();
    s.closeTown();
    s.openTown(base.id);
    expect(s.scene).toBe('ayuntamiento');
    // Elegido, la base abre como siempre.
    s.hireHero(tipoDeHeroePorDefecto('imperio'));
    s.closeTown();
    s.openTown(base.id);
    expect(s.scene).toBe('town');
  });

  it('con el de salida por elegir, llegar al ayuntamiento abre la elección y no «Ampliar» (QA H4)', () => {
    const s = porElegir();
    s.cerrarElAyuntamiento();
    const escena = new EscenaBase(() => s);
    escena.encuadrar(1086, 778);
    // Andando hasta su puerta, desde la entrada.
    const d = disposicionDe('imperio');
    const q = dondePulsarElSitio(escena.camara()!, d.sitios.hall);
    escena.pulsar(q.x, q.y, 0);
    expect(s.scene).toBe('town');
    escena.actualizar(60_000);
    expect(s.scene).toBe('ayuntamiento');
    expect(escena.abierto).toBeNull();
    // Desde la lista de edificios.
    s.cerrarElAyuntamiento();
    escena.irA('hall', 0);
    expect(s.scene).toBe('ayuntamiento');
    expect(escena.abierto).toBeNull();
    // Elegido, el ayuntamiento vuelve a abrir «Ampliar».
    s.hireHero(tipoDeHeroePorDefecto('imperio'));
    expect(s.scene).toBe('town');
    escena.irA('hall', 0);
    expect(s.scene).toBe('town');
    expect(escena.abierto).toEqual({ tipo: 'ampliar' });
  });

  it('ante el ayuntamiento no se pinta quien anduvo: delante, solo los candidatos', () => {
    const s = new Session(11, 'imperio');
    s.abrirSuBase();
    const d = disposicionDe('imperio');
    const vista = s.vistaDeLaBase()!;
    const quien = { en: d.entrada, mira: 'N', clip: 'idle', tiempo: 0 } as const;
    const figuras = (o: { gente: boolean; caminante?: boolean }) =>
      componerBase(d, vista, quien, 0, o).flatMap((e) => (e.tipo === 'figura' ? [e.id] : []));
    // La morada: quien anduvo, quieto en su puerta; el ayuntamiento, nadie.
    expect(figuras({ gente: false })).toEqual([vista.caminante.id]);
    expect(figuras({ gente: false, caminante: false })).toEqual([]);
  });

  it('elegir otro cambia la ficha; contratarlo lo asienta de ese tipo, cobra y vuelve a la base', () => {
    const s = porElegir();
    const oro = s.oro;
    s.elegirEnElAyuntamiento('mago');
    expect(s.vistaDelAyuntamiento()!.ficha.tipo).toBe('mago');
    expect(() => s.elegirEnElAyuntamiento('lich')).toThrow(
      '"lich" no es un héroe que se pueda contratar',
    );
    s.hireHero('mago');
    expect(s.scene).toBe('town');
    expect(s.heroeEnLaBase()!.tipo).toBe('mago');
    expect(s.selectedHeroId).toBe(s.heroeEnLaBase()!.id);
    expect(s.oro).toBe(oro - ECONOMIA.precioDelHeroe);
    expect(s.heroeDeSalidaPendiente).toBe(false);
    expect(s.bloqueoDeTurno()).toBeNull();
  });

  it('sin oro, el botón sale apagado con la frase de `oroBlocker` debajo', () => {
    const s = porElegir();
    s.jugador.oro = 100;
    s.elegirEnElAyuntamiento('mago');
    const panel = marcadoDe(renderSide(s));
    const boton = /<button data-action="hire-hero"[^>]*>/.exec(panel)![0];
    expect(boton).toContain('data-tipo="mago"');
    expect(boton).toMatch(/\sdisabled/);
    expect(panel).toContain(oroBlocker(ECONOMIA.precioDelHeroe, 100)!);
    s.hireHero('mago');
    expect(s.heroeDeSalidaPendiente).toBe(true);
    expect(s.status).toContain(oroBlocker(ECONOMIA.precioDelHeroe, 100)!);
  });

  it('la ficha dice el nombre, el tipo, la descripción, el precio y el retrato', () => {
    const s = porElegir();
    const { ficha, heroe } = s.vistaDelAyuntamiento()!;
    const panel = marcadoDe(renderSide(s));
    expect(panel).toContain(heroe);
    expect(panel).toContain(ficha.nombreDelTipo);
    expect(panel).toContain(describirCoste(ECONOMIA.precioDelHeroe));
    expect(panel).toContain(`src="/unidades/${ficha.hoja}/identidad.webp"`);
    expect(marcadoDe(renderActions(s))).toContain('data-action="cerrar-ayuntamiento"');
  });
});

describe('contratar a media partida abre la misma elección (D3)', () => {
  it('con el héroe fuera, «Contratar héroe» abre los candidatos y contrata el tipo elegido', () => {
    const s = new Session(11, 'imperio');
    s.abrirSuBase();
    expect(s.scene).toBe('town');
    const inicial = s.heroeEnLaBase()!;
    inicial.at = { x: inicial.at.x, y: inicial.at.y + 2 };
    s.jugador.oro = 100_000;
    // El botón del panel lee el precio de los datos, no un número tecleado.
    const panel = marcadoDe(renderSide(s));
    expect(panel).toContain(
      `data-action="abrir-ayuntamiento" class="primary" style="margin-top:.7rem">Contratar héroe (${describirCoste(ECONOMIA.precioDelHeroe)})`,
    );
    s.abrirElAyuntamiento();
    const vista = s.vistaDelAyuntamiento()!;
    expect(vista.tropa).toBeNull();
    expect(vista.heroe).toBe(`Capitán de ${s.activeTown!.name}`);
    s.elegirEnElAyuntamiento('ingeniero');
    s.hireHero('ingeniero');
    expect(s.scene).toBe('town');
    const contratado = s.heroeEnLaBase()!;
    expect(contratado.id).toMatch(/^hero-0-c/);
    expect(contratado.tipo).toBe('ingeniero');
    expect(s.oro).toBe(100_000 - ECONOMIA.precioDelHeroe);
  });
});
