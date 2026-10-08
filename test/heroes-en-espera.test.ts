/**
 * El ciclo de fin de turno (#17): «Siguiente héroe», dormir a un héroe y la
 * pregunta antes de pasar el turno con héroes que aún pueden andar. La pregunta
 * es de los paneles, no un `confirm()` del navegador, así que se mira en el
 * marcado de la barra de abajo.
 */
import { describe, expect, it } from 'vitest';
import { PuertaDeFinDeTurno } from '../src/client/fin-de-turno.js';
import { marcadoDe } from '../src/client/html.js';
import { Session } from '../src/client/session.js';
import { renderActions, renderSide } from '../src/client/views/panels.js';
import { alcanceDelHeroe, puedeAndarHoy } from '../src/core/state/game.js';

/** Una sesión con dos héroes propios: el inicial y uno contratado en la base. */
function conDosHeroes(): Session {
  const s = new Session(12);
  s.openTown(s.myTowns()[0]!.id);
  s.hireHero();
  s.closeTown();
  expect(s.myHeroes()).toHaveLength(2);
  return s;
}

/** Lo que cuesta el paso más barato que tiene hoy `heroe`. */
function pasoMasBarato(s: Session, heroeId: string): number {
  const heroe = s.myHeroes().find((h) => h.id === heroeId)!;
  const alcance = alcanceDelHeroe(s.state, heroe);
  return Math.min(...alcance.descubiertas.slice(1).map((i) => alcance.costes[i]!));
}

describe('puedeAndarHoy', () => {
  it('no es «le quedan puntos»: con menos de lo que cuesta el paso más barato, no anda', () => {
    const s = new Session(12);
    const heroe = s.myHeroes()[0]!;
    expect(puedeAndarHoy(s.state, heroe)).toBe(true);
    const barato = pasoMasBarato(s, heroe.id);
    expect(barato).toBeGreaterThan(1);

    heroe.movePoints = barato - 1;
    expect(puedeAndarHoy(s.state, heroe)).toBe(false);
    heroe.movePoints = barato;
    expect(puedeAndarHoy(s.state, heroe)).toBe(true);
    heroe.movePoints = 0;
    expect(puedeAndarHoy(s.state, heroe)).toBe(false);
  });
});

describe('la pregunta antes de pasar el turno', () => {
  it('con un héroe que aún anda no pasa: pregunta en la barra, con su nombre y sin «Fin de turno»', async () => {
    const s = new Session(12);
    const heroe = s.myHeroes()[0]!;
    const puerta = new PuertaDeFinDeTurno(() => 10_000);

    expect(await puerta.pasar(s, false)).toBe(false);
    expect(s.state.day).toBe(1);
    expect(s.avisoDeFinDeTurno?.map((h) => h.id)).toEqual([heroe.id]);
    const barra = marcadoDe(renderActions(s));
    expect(barra).toContain(`Aún puede andar hoy: ${heroe.name}. ¿Terminar el turno?`);
    expect(barra).toContain('data-action="end-turn-confirm"');
    expect(barra).toContain('data-action="end-turn-cancel"');
    expect(barra).not.toContain('data-action="end-turn"');

    // Confirmar pasa el turno y la pregunta no sobrevive al día nuevo.
    expect(await puerta.pasar(s, false, true)).toBe(true);
    expect(s.state.day).toBe(2);
    expect(s.avisoDeFinDeTurno).toBeNull();
    expect(marcadoDe(renderActions(s))).toContain('data-action="end-turn"');
  });

  it('«Seguir jugando» la retira, y cualquier cambio de lo que se ve también', async () => {
    const s = conDosHeroes();
    const [a, b] = s.myHeroes();
    const puerta = new PuertaDeFinDeTurno(() => 10_000);

    expect(await puerta.pasar(s, false)).toBe(false);
    expect(s.avisoDeFinDeTurno?.map((h) => h.name)).toEqual([a!.name, b!.name]);
    expect(marcadoDe(renderActions(s))).toContain(`Aún pueden andar hoy: ${a!.name}, ${b!.name}.`);
    s.retirarAvisoDeFinDeTurno();
    expect(s.avisoDeFinDeTurno).toBeNull();

    // Elegir a otro héroe no deja en pantalla una pregunta hecha antes.
    expect(await puerta.pasar(s, false)).toBe(false);
    s.selectedHeroId = b!.id;
    expect(s.avisoDeFinDeTurno).toBeNull();
    expect(s.state.day).toBe(1);
  });

  it('sin nadie que pueda andar —sin puntos o dormido— pasa sin preguntar', async () => {
    const s = conDosHeroes();
    const [a, b] = s.myHeroes();
    const puerta = new PuertaDeFinDeTurno(() => 10_000);
    a!.movePoints = 0;
    s.alternarSueño(b!.id);
    expect(s.quienesPuedenAndar()).toEqual([]);
    expect(await puerta.pasar(s, false)).toBe(true);
    expect(s.state.day).toBe(2);
    expect(s.avisoDeFinDeTurno).toBeNull();
  });

  it('el dormido no entra en la pregunta; los demás sí', async () => {
    const s = conDosHeroes();
    const [a, b] = s.myHeroes();
    s.alternarSueño(a!.id);
    const puerta = new PuertaDeFinDeTurno(() => 10_000);
    expect(await puerta.pasar(s, false)).toBe(false);
    expect(s.avisoDeFinDeTurno?.map((h) => h.id)).toEqual([b!.id]);
  });
});

describe('dormir a un héroe', () => {
  it('lo dice el panel, se alterna con el mismo botón y sigue dormido al día siguiente', async () => {
    const s = new Session(12);
    const heroe = s.myHeroes()[0]!;
    expect(marcadoDe(renderSide(s))).toMatch(/data-action="sleep-hero"[^>]*>Dormir<\/button>/s);

    s.alternarSueño(heroe.id);
    expect(s.estaDormido(heroe.id)).toBe(true);
    const panel = marcadoDe(renderSide(s));
    expect(panel).toMatch(/data-action="sleep-hero"[^>]*>Despertar<\/button>/s);
    expect(panel).toContain(`<span>${heroe.name} <span class="duerme">· duerme</span></span>`);

    await s.endTurn();
    expect(s.state.day).toBe(2);
    expect(s.estaDormido(heroe.id)).toBe(true);

    s.alternarSueño(heroe.id);
    expect(s.estaDormido(heroe.id)).toBe(false);
  });

  it('mandarlo a andar lo despierta', () => {
    const s = new Session(12);
    const heroe = s.myHeroes()[0]!;
    s.alternarSueño(heroe.id);
    const alcance = alcanceDelHeroe(s.state, heroe);
    const i = alcance.descubiertas.find((j, n) => n > 0 && alcance.costes[j]! <= heroe.movePoints)!;
    const destino = { x: i % alcance.ancho, y: Math.floor(i / alcance.ancho) };
    s.moveHeroTo(heroe.id, destino);
    expect(heroe.at).toEqual(destino);
    expect(s.estaDormido(heroe.id)).toBe(false);
  });

  it('a un héroe que no es tuyo no se le duerme: lo dice la barra', () => {
    const s = new Session(12);
    const suyo = s.state.heroes.find((h) => h.owner !== s.viewer)!;
    s.alternarSueño(suyo.id);
    expect(s.estaDormido(suyo.id)).toBe(false);
    expect(s.status).toBe('Solo puedes dormir o despertar a tus héroes.');
  });
});

describe('«Siguiente héroe»', () => {
  it('va al siguiente que aún anda, da la vuelta y salta al dormido y al que no puede', () => {
    const s = conDosHeroes();
    const [a, b] = s.myHeroes();
    s.selectedHeroId = a!.id;

    expect(s.siguienteHeroe()).toBe(true);
    expect(s.selectedHeroId).toBe(b!.id);
    expect(s.siguienteHeroe()).toBe(true);
    expect(s.selectedHeroId).toBe(a!.id);

    s.alternarSueño(b!.id);
    expect(s.siguienteHeroe()).toBe(true);
    expect(s.selectedHeroId).toBe(a!.id);

    s.alternarSueño(b!.id);
    b!.movePoints = 0;
    expect(s.siguienteHeroe()).toBe(true);
    expect(s.selectedHeroId).toBe(a!.id);
  });

  it('sin nadie que pueda andar no cambia la selección y lo dice', () => {
    const s = conDosHeroes();
    const [a, b] = s.myHeroes();
    s.selectedHeroId = b!.id;
    a!.movePoints = 0;
    s.alternarSueño(b!.id);
    expect(s.siguienteHeroe()).toBe(false);
    expect(s.selectedHeroId).toBe(b!.id);
    expect(s.status).toBe('Ningún héroe despierto puede andar hoy: pasa el turno.');
  });

  it('el botón está en la barra de abajo del mapa', () => {
    const s = new Session(12);
    expect(marcadoDe(renderActions(s))).toMatch(/data-action="next-hero"[^>]*>Siguiente héroe</);
  });
});

describe('la lista de héroes', () => {
  it('se ve con un solo héroe y marca al elegido (antes solo salía con dos)', () => {
    const s = new Session(12);
    const heroe = s.myHeroes()[0]!;
    expect(s.myHeroes()).toHaveLength(1);
    expect(marcadoDe(renderSide(s))).toMatch(
      new RegExp(
        `<h3>Héroes</h3><div class="stack-list"><button data-action="select-hero" data-hero="${heroe.id}" class="stack primary">`,
      ),
    );
  });
});
