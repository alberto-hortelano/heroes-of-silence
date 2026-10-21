/**
 * Reclutar dentro de la morada (`docs/agents/2026-10-20-recluta-en-la-morada/`):
 * la morada se mira dentro de la base, con su cámara acercada al paso de la hoja y
 * centrada en el edificio, y la fila de reclutas delante, en el empedrado, entera,
 * sin pisarse y sin tapar a quien anduvo (C12, C13, vuelta 2); su edificio se
 * cambia por su versión abierta y solo él (`conLaAbierta`); llegar a la puerta de
 * una morada entra en su escena y salir vuelve a la base con quien anduvo quieto
 * en la puerta y la cámara de antes (C1, C7); pulsar una figura o su botón la
 * elige (C3); el panel lleva su ficha y su reclutamiento, que va por las acciones
 * de siempre con el motivo del núcleo escrito debajo (C4, C5).
 */
import { describe, expect, it } from 'vitest';
import { EscenaBase } from '../src/client/escenas/castillo.js';
import { cajasDeLaMorada, EscenaMorada } from '../src/client/escenas/morada.js';
import { marcadoDe } from '../src/client/html.js';
import { componerVistaDeLaMorada } from '../src/client/morada/vista.js';
import {
  type ArteDeLaBase,
  conLaAbierta,
  type RecorteDeLaBase,
} from '../src/client/render/base/arte.js';
import { cajaDeFiguraEn } from '../src/client/render/batalla.js';
import { pasoDeLaHoja } from '../src/client/render/de-pie.js';
import {
  DELANTE_DE_LA_PUERTA,
  dondeEsperaEnLaMorada,
  encuadrarLaMorada,
  filaDeLosReclutas,
  SEPARACION,
} from '../src/client/render/morada/fila.js';
import { pasoDeLaBase } from '../src/client/render/proyeccion.js';
import { AYUDA_DE_LA_BASE, AYUDA_DE_LA_MORADA, Session } from '../src/client/session.js';
import { renderActions, renderSide } from '../src/client/views/panels.js';
import { armaduraDe } from '../src/core/battle/armas.js';
import { esDeCura, nombreDelPoder, poder } from '../src/core/battle/poderes.js';
import { hojaDeUnidad, unidadDelJuego, unidadesDeMorada } from '../src/core/catalogo.js';
import { pieza } from '../src/core/hero/equipo.js';
import { indiceDePoder, nivelDeUnidad } from '../src/core/nivel.js';
import { construidoEn, sitioDeEdificio, sitiosDeLaBase } from '../src/core/town/sitios.js';
import {
  conMiles,
  FACTION_IDS,
  type FactionId,
  HUECOS,
  NOMBRE_DE_HUECO,
  NOMBRE_DE_RASGO,
  SPEED_TO_HEXES,
} from '../src/core/types.js';
import { disposicionDe, enLaFranja, planoDelCuadro } from '../src/shared/base.js';
import { fueraDeSuBase } from './helpers.js';

/**
 * Los lienzos de la escena desde que la base va a todo el alto (C16): el del
 * escritorio a 1440×900 a tres anchos (1080, 770 y 454 de 773 de alto), el que
 * medía la página antes (1086×778) y el del móvil (364×380, el marco de 380 con su
 * borde; medido con Playwright 364×370). Cada uno a tres densidades.
 */
const LIENZOS = [
  [1080, 773],
  [770, 773],
  [454, 773],
  [1086, 778],
  [364, 370],
  [364, 380],
  // El móvil al alto del mapa (QA I2) y una ventana de escritorio estrecha y baja (QA I1, 700×900).
  [364, 513],
  [664, 548],
] as const;
const DENSIDADES = [1, 1.5, 2] as const;

/** Lo menos que pueden apartarse los pies de dos vecinas: la caja de una más su aro no pisa la de al lado. */
const sinPisarse = (a: { x: number; ancho: number }, b: { x: number; ancho: number }) =>
  b.x - a.x >= (a.ancho + b.ancho) / 2 - 1e-9;

describe('la morada dentro de la base: la cámara y la fila (C12, C13)', () => {
  for (const f of FACTION_IDS) {
    const d = disposicionDe(f);
    // Las moradas que se levantan: un sitio sin nada que construir es plaza (el 5 de los no muertos).
    const sitios = sitiosDeLaBase(f).filter((s) => s.morada !== undefined && s.cadena.length > 0);
    for (const [ancho, alto] of LIENZOS) {
      it(`${f}, ${ancho}×${alto}: la base acercada a la hoja y centrada en la morada, y la fila entera, sin pisarse ni tapar a quien anduvo`, () => {
        for (const densidad of DENSIDADES) {
          const lienzo = { ancho, alto, densidad };
          const base = pasoDeLaBase(alto);
          for (const { id: sitio } of sitios) {
            for (let n = 1; n <= 4; n++) {
              const donde = `${sitio}, ${n} a ×${densidad}`;
              const e = encuadrarLaMorada(lienzo, d, sitio, n);
              // El paso: el de la hoja si cabe la sala de la casa abierta (en un lienzo
              // bajo sin retina no: se acerca menos), y nunca más lejos que la base.
              expect(e.camara.paso, donde).toBeLessThanOrEqual(
                Math.max(base, pasoDeLaHoja(densidad)) + 1e-9,
              );
              expect(e.camara.paso, donde).toBeGreaterThanOrEqual(base - 1e-9);
              if (densidad >= 2 || alto > 600) {
                expect(e.camara.paso, donde).toBeCloseTo(Math.max(base, pasoDeLaHoja(densidad)), 9);
              }
              // La cámara, centrada en la región del edificio o en el tope de la base.
              const vista = ancho / e.camara.paso;
              const s = d.sitios[sitio];
              const foco = planoDelCuadro(d, s.tramo, [
                (s.region.x0 + s.region.x1) / 2,
                s.region.pie,
              ]).x;
              expect(e.camaraX, donde).toBeGreaterThanOrEqual(0);
              expect(e.camaraX, donde).toBeLessThanOrEqual(d.ancho - vista + 1e-9);
              const centrada = Math.abs(e.camaraX + vista / 2 - foco) < 1e-9;
              const enElTope = e.camaraX === 0 || Math.abs(e.camaraX - (d.ancho - vista)) < 1e-9;
              expect(centrada || enElTope, donde).toBe(true);
              // El origen, en el píxel de dispositivo más cercano (`camaraDeLaBase`).
              expect(
                Math.abs(e.camara.origenX + e.camaraX * e.camara.paso),
                donde,
              ).toBeLessThanOrEqual(0.5 / densidad + 1e-9);
              const enDispositivo = e.camara.origenX * densidad;
              expect(Math.abs(enDispositivo - Math.round(enDispositivo)), donde).toBeLessThan(1e-6);
              // Las figuras: enteras con su aro, en fila, en la franja y sin pisarse.
              expect(e.en, donde).toHaveLength(n);
              const cajas = e.en.map((p) => cajaDeFiguraEn(e.camara, p));
              // Quien anduvo espera delante de la fila, entero en el lienzo.
              const espera = dondeEsperaEnLaMorada(d, sitio);
              const suya = cajaDeFiguraEn(e.camara, espera);
              expect(enLaFranja(d, espera), `${donde}: espera en la franja`).toBe(true);
              expect(espera.y, `${donde}: espera delante de la fila`).toBeGreaterThan(
                filaDeLosReclutas(d, sitio),
              );
              expect(suya.suelo + 0.12 * suya.alto, donde).toBeLessThanOrEqual(alto);
              for (const [i, c] of cajas.entries()) {
                expect(enLaFranja(d, e.en[i]!), `${donde}: en la franja`).toBe(true);
                // Justo delante de la casa abierta: a `DELANTE_DE_LA_PUERTA` de su puerta.
                expect(e.en[i]!.y).toBe(filaDeLosReclutas(d, sitio));
                expect(e.en[i]!.y - s.puerta.y, donde).toBeLessThanOrEqual(
                  DELANTE_DE_LA_PUERTA + 1e-9,
                );
                expect(c.x - c.ancho / 2, donde).toBeGreaterThanOrEqual(0);
                expect(c.x + c.ancho / 2, donde).toBeLessThanOrEqual(ancho);
                expect(c.suelo - c.alto, donde).toBeGreaterThanOrEqual(0);
                expect(c.suelo + 0.12 * c.alto, donde).toBeLessThanOrEqual(alto);
                // La cabeza de quien espera no tapa los pies ni el aro de ningún recluta.
                expect(
                  suya.suelo - suya.alto,
                  `${donde}: quien espera, sobre la fila`,
                ).toBeGreaterThanOrEqual(c.suelo + 0.12 * c.alto);
              }
              // La sala de la casa abierta, a la vista: del pie de su puerta hasta dos
              // figuras por encima (la puerta mide 1,15), dentro del lienzo (QA I1).
              // Una cifra del test, no `ALTO_DE_LA_SALA`: así lo vigila.
              const pieDeLaPuerta = cajaDeFiguraEn(e.camara, s.puerta);
              expect(
                pieDeLaPuerta.suelo - 2 * pieDeLaPuerta.alto,
                `${donde}: la sala a la vista`,
              ).toBeGreaterThanOrEqual(-1e-6);
              for (let i = 1; i < n; i++) {
                expect(sinPisarse(cajas[i - 1]!, cajas[i]!), donde).toBe(true);
                const sep = e.en[i]!.x - e.en[i - 1]!.x;
                expect(sep).toBeGreaterThanOrEqual(SEPARACION.minima - 1e-9);
                expect(sep).toBeLessThanOrEqual(SEPARACION.maxima + 1e-9);
              }
            }
          }
        }
      });
    }
  }

  it('en un lienzo donde no caben a la hoja, se aleja lo justo y siguen enteras', () => {
    const d = disposicionDe('orkos');
    const lienzo = { ancho: 200, alto: 380, densidad: 1 };
    const e = encuadrarLaMorada(lienzo, d, 'lvl1', 4);
    expect(e.camara.paso).toBeLessThan(pasoDeLaHoja(1));
    for (const p of e.en) {
      const c = cajaDeFiguraEn(e.camara, p);
      expect(c.x - c.ancho / 2).toBeGreaterThanOrEqual(0);
      expect(c.x + c.ancho / 2).toBeLessThanOrEqual(lienzo.ancho);
    }
  });

  it('la fila va centrada en la puerta mientras quepa', () => {
    const d = disposicionDe('templarios');
    const e = encuadrarLaMorada({ ancho: 1080, alto: 773, densidad: 1 }, d, 'lvl1', 2);
    expect((e.en[0]!.x + e.en[1]!.x) / 2).toBeCloseTo(d.sitios.lvl1.puerta.x, 9);
    expect(e.en[1]!.x - e.en[0]!.x).toBeCloseTo(SEPARACION.maxima);
  });

  it('a nadie no se le encuadra: una morada sin unidades es un bug', () => {
    expect(() =>
      encuadrarLaMorada(
        { ancho: 1080, alto: 773, densidad: 1 },
        disposicionDe('templarios'),
        'lvl1',
        0,
      ),
    ).toThrow('no se puede encuadrar una morada con 0 unidades');
  });
});

describe('la versión abierta sustituye solo a su edificio (C12, C14)', () => {
  /** Un recorte sin imagen: en Node no hay `Image`, y la sustitución no la mira. */
  const recorte = (tramo: number): RecorteDeLaBase => ({
    imagen: {} as HTMLImageElement,
    tramo,
    en: [10, 20],
    ancho: 100,
    alto: 200,
  });
  const fuera = recorte(3);
  const otro = recorte(5);
  const arte: ArteDeLaBase = {
    tramos: [],
    suelo: null,
    cielo: 'rgb(0, 0, 0)',
    edificios: new Map([
      ['templarios_pueblo', fuera],
      ['village_hall', otro],
    ]),
  };

  it('sin versión abierta, o sin arte, el mismo objeto', () => {
    expect(conLaAbierta(arte, 'templarios_pueblo', null)).toBe(arte);
    expect(conLaAbierta(null, 'templarios_pueblo', recorte(3))).toBeNull();
  });

  it('con ella, cambia ese edificio y nada más, y dos llamadas dan el mismo objeto', () => {
    const abierta = recorte(3);
    const con = conLaAbierta(arte, 'templarios_pueblo', abierta)!;
    expect(con).not.toBe(arte);
    expect(con.edificios.get('templarios_pueblo')).toBe(abierta);
    expect(con.edificios.get('village_hall')).toBe(otro);
    expect(con.tramos).toBe(arte.tramos);
    // El fondo cacheado de la base va por la identidad del arte: un objeto nuevo
    // en cada fotograma lo repintaría entero.
    expect(conLaAbierta(arte, 'templarios_pueblo', abierta)).toBe(con);
    // El de antes no cambia: al salir, la base pinta su exterior.
    expect(arte.edificios.get('templarios_pueblo')).toBe(fuera);
  });
});

/** Una sesión con su base abierta (el héroe fuera: recluta la guarnición) y la escena encuadrada. */
function enLaBase(faccion: FactionId = 'templarios', seed = 12) {
  const s = new Session(seed, faccion);
  fueraDeSuBase(s.state, 0);
  s.openTown(s.myTowns()[0]!.id);
  const escena = new EscenaBase(() => s);
  escena.encuadrar(1086, 778);
  const morada = new EscenaMorada(
    () => s,
    () => {},
  );
  morada.encuadrar(1086, 778, 1);
  return { s, escena, morada, d: disposicionDe(faccion) };
}

describe('entrar y salir de la morada (C1, C7)', () => {
  it('desde la lista de edificios se entra en la morada y «Volver a la base» deja a quien anduvo quieto en su puerta, con la cámara de antes', () => {
    const { s, escena, morada, d } = enLaBase();
    escena.irA('lvl1', 0);
    const antes = escena.camara();
    expect(s.scene).toBe('morada');
    // La morada encuadra con su propia cámara, acercada; la de la base no se toca.
    const e = morada.encuadre(s.vistaDeLaMorada()!);
    expect(e.camara.paso).toBeGreaterThan(antes!.paso);
    expect(escena.camara()).toEqual(antes);
    expect(s.status).toBe(AYUDA_DE_LA_MORADA);
    expect(escena.abierto).toBeNull();
    expect(marcadoDe(renderActions(s))).toContain('data-action="cerrar-morada"');
    s.cerrarLaMorada();
    expect(s.scene).toBe('town');
    expect(s.status).toBe(AYUDA_DE_LA_BASE);
    expect(s.vistaDeLaMorada()).toBeNull();
    expect(escena.posicion).toEqual(dondeEsperaEnLaMorada(d, 'lvl1'));
    expect(escena.camara()).toEqual(antes);
    expect(escena.marca).toBe('quieto');
    expect(escena.abierto).toBeNull();
  });

  it('fuera de la base, en un sitio sin construir o en un edificio que no es morada no se entra, y se dice por qué', () => {
    const fuera = new Session(12, 'templarios');
    expect(() => fuera.abrirLaMorada('lvl1')).toThrow(
      'no se puede entrar en la morada: no hay ninguna base abierta',
    );
    const { s } = enLaBase();
    expect(construidoEn(s.activeTown!, 'lvl6')).toBeNull();
    expect(() => s.abrirLaMorada('lvl6')).toThrow(/no hay nada construido ahí/);
    expect(() => s.abrirLaMorada('hall')).toThrow(/no es una morada, ahí no se recluta/);
    expect(s.scene).toBe('town');
    expect(() => s.cerrarLaMorada()).toThrow(
      'no se puede salir de la morada: no se está en ninguna',
    );
  });

  it('cerrar la base desde la morada no deja la morada abierta para la próxima vez', () => {
    const { s, escena } = enLaBase();
    escena.irA('lvl1', 0);
    const town = s.activeTown!.id;
    s.closeTown();
    expect(s.vistaDeLaMorada()).toBeNull();
    s.openTown(town);
    expect(s.scene).toBe('town');
    expect(s.vistaDeLaMorada()).toBeNull();
  });
});

describe('elegir en la morada (C2, C3)', () => {
  it('una figura por unidad que produce, con su hoja; la orka de cuatro, cuatro', () => {
    const { s, escena } = enLaBase('orkos');
    escena.irA('lvl1', 0);
    const vista = s.vistaDeLaMorada()!;
    const unidades = unidadesDeMorada(vista.edificio);
    expect(unidades).toHaveLength(4);
    expect(vista.figuras.map((f) => f.id)).toEqual(unidades.map((u) => u.id));
    expect(vista.figuras.map((f) => f.cuerpo)).toEqual(unidades.map((u) => hojaDeUnidad(u.id)));
    // La vista no se rehace si nada cambia.
    expect(s.vistaDeLaMorada()).toBe(vista);
  });

  it('al entrar, la primera; pulsar la figura de la segunda la elige, como su botón; una ajena lanza', () => {
    const { s, escena, morada } = enLaBase('orkos');
    escena.irA('lvl1', 0);
    const vista = s.vistaDeLaMorada()!;
    expect(vista.elegida).toBe(0);
    expect(vista.ficha.id).toBe(vista.figuras[0]!.id);
    expect(morada.marca).toBe(`${vista.edificio}:${vista.figuras[0]!.id}`);
    // Pulsar en el medio del cuerpo de la segunda, con el encuadre con que pinta.
    const e = morada.encuadre(vista);
    const c = cajasDeLaMorada(e.camara)(e.en[1]!);
    expect(morada.mover(c.x, c.suelo - c.alto / 2)).toBe(true);
    expect(s.status).toMatch(/pulsa para ver su ficha y reclutar/);
    morada.pulsar(c.x, c.suelo - c.alto / 2);
    const segunda = s.vistaDeLaMorada()!;
    expect(segunda.elegida).toBe(1);
    expect(segunda.ficha.nombre).toBe(vista.figuras[1]!.nombre);
    expect(morada.marca).toBe(`${vista.edificio}:${vista.figuras[1]!.id}`);
    // En el suelo, nada.
    morada.pulsar(1, 1);
    expect(s.vistaDeLaMorada()!.elegida).toBe(1);
    expect(morada.mover(1, 1)).toBe(false);
    expect(s.status).toBe(AYUDA_DE_LA_MORADA);
    // El botón del panel elige igual.
    const panel = marcadoDe(renderSide(s));
    for (const f of vista.figuras) {
      expect(panel).toContain(`data-action="morada-elegir" data-unidad="${f.id}"`);
    }
    s.elegirEnLaMorada(vista.figuras[3]!.id);
    expect(s.vistaDeLaMorada()!.elegida).toBe(3);
    const ajena = unidadesDeMorada('templarios_pueblo')[0]!;
    expect(() => s.elegirEnLaMorada(ajena.id)).toThrow(`${ajena.name} no se recluta en`);
  });
});

describe('la ficha y el reclutamiento (C4, C5)', () => {
  it('la ficha de la elegida, con las cifras de las puertas del núcleo, sus rasgos y lo de serie', () => {
    const { s, escena } = enLaBase('orkos');
    escena.irA('lvl1', 0);
    for (const f of s.vistaDeLaMorada()!.figuras) {
      s.elegirEnLaMorada(f.id);
      const u = unidadDelJuego(f.id);
      const panel = marcadoDe(renderSide(s));
      expect(panel).toContain(`<h3>${u.name}</h3>`);
      expect(panel).toContain(`Índice ${indiceDePoder(u)} · nivel ${nivelDeUnidad(u)}`);
      const fila = (r: string, v: string) => `<span class="label">${r}</span><span>${v}</span>`;
      expect(panel).toContain(fila('Vida', `${conMiles(u.hp)} PV`));
      expect(panel).toContain(fila('Ataque', String(u.attack)));
      expect(panel).toContain(fila('Defensa', String(u.defense)));
      expect(panel).toContain(fila('Daño', `${conMiles(u.damage[0])}–${conMiles(u.damage[1])}`));
      expect(panel).toContain(fila('Armadura', String(armaduraDe(u))));
      expect(panel).toContain(fila('Velocidad', `${SPEED_TO_HEXES[u.speed]} casillas`));
      const rasgos = [
        ...(u.traits ?? []).map((t) => NOMBRE_DE_RASGO[t]),
        ...(u.poderes ?? []).map((p) => nombreDelPoder(poder(p))),
      ];
      if (rasgos.length > 0) expect(panel).toContain(fila('Rasgos', rasgos.join(', ')));
      else expect(panel).not.toContain('>Rasgos<');
      for (const h of HUECOS) {
        const id = u.equipo?.[h];
        if (id !== undefined) expect(panel).toContain(`${NOMBRE_DE_HUECO[h]}: ${pieza(id).nombre}`);
      }
      expect(panel).toContain(
        fila('Disponibles', `${s.activeTown!.available[f.id] ?? 0} · +${u.growth}/semana`),
      );
    }
  });

  it('un poder de cura se dice con lo que cura, como en la arena (S9)', () => {
    // El monje de los templarios lleva Curar: sin su cifra, la ficha decía «Curar».
    const { s } = enLaBase();
    const town = s.activeTown!;
    const sitio = sitioDeEdificio('templarios', 'templarios_monasterio').id;
    town.buildings.push('templarios_monasterio');
    const vista = componerVistaDeLaMorada(town, sitio, 'templario-monje', () => ({
      plan: null,
      motivo: null,
    }));
    const curar = poder(
      unidadDelJuego('templario-monje').poderes!.find((p) => esDeCura(poder(p)))!,
    );
    expect(vista.ficha.rasgos).toContain(`${curar.nombre} (${curar.lanzador.cantidad} PV)`);
  });

  it('con la guarnición llena, «+1» y «Todo (0)» apagados y la frase del núcleo escrita debajo; con sitio, se recluta sin salir', () => {
    const { s, escena } = enLaBase();
    escena.irA('lvl1', 0);
    const recluta = s.vistaDeLaMorada()!.ficha.id;
    // El primer día la guarnición está llena: no cabe ni uno.
    expect(s.recruitPlan(recluta)!.maximo).toBe(0);
    const motivo = s.motivoParaNoReclutar(recluta)!;
    expect(motivo).toMatch(/no cabe|liderazgo/);
    const lleno = marcadoDe(renderSide(s));
    expect(lleno).toContain(
      `<button data-action="recruit" data-creature="${recluta}" data-todo="no" disabled>+1</button>`,
    );
    expect(lleno).toContain(
      `data-creature="${recluta}" data-todo="si" class="primary" disabled>Todo (0)</button>`,
    );
    expect(lleno).toContain(`<span class="motivo-apagado">${motivo}</span>`);
    // Sin `title`: en el móvil no hay ratón que lo enseñe.
    expect(lleno).not.toMatch(/data-action="recruit"[^>]*title=/);
    // Con sitio (la guarnición vaciada a mano, que no es una jugada: se vuelve a
    // entrar para que la vista no sea la de antes): encendidos, «Todo» recluta lo
    // que calcula el núcleo y la vista lo enseña sin salir.
    s.cerrarLaMorada();
    s.activeTown!.garrison = [];
    escena.irA('lvl1', 0);
    const antes = s.activeTown!.available[recluta]!;
    const plan = s.recruitPlan(recluta)!;
    expect(plan.maximo).toBeGreaterThan(0);
    const conSitio = marcadoDe(renderSide(s));
    expect(conSitio).toContain(`data-todo="si" class="primary" >Todo (${plan.maximo})</button>`);
    expect(conSitio).not.toContain('class="motivo-apagado"');
    s.recruitAll(recluta);
    expect(s.scene).toBe('morada');
    expect(s.activeTown!.available[recluta]).toBe(antes - plan.maximo);
    const despues = s.vistaDeLaMorada()!.ficha;
    expect(despues.disponibles).toBe(antes - plan.maximo);
    expect(marcadoDe(renderSide(s))).toContain(
      `<span>${antes - plan.maximo} · +${unidadDelJuego(recluta).growth}/semana</span>`,
    );
  });
});

describe('licenciar dentro de la morada (QA I1)', () => {
  it('con el héroe dentro, su tropa sale con su «−1»; licenciar hace sitio y se recluta sin salir', () => {
    // El héroe empieza dentro de su base y con la tropa llena: sin licenciar aquí
    // no cabría ningún recluta.
    const s = new Session(12, 'templarios');
    s.openTown(s.myTowns()[0]!.id);
    const heroe = s.heroeEnLaBase()!;
    expect(heroe).not.toBeNull();
    const escena = new EscenaBase(() => s);
    escena.encuadrar(1086, 778);
    escena.irA('lvl1', 0);
    expect(s.scene).toBe('morada');
    const recluta = s.vistaDeLaMorada()!.ficha.id;
    const panel = marcadoDe(renderSide(s));
    expect(panel).toContain('<h3>Tropa del héroe');
    const boton = panel.match(/data-action="dismiss" data-hero="([^"]+)" data-creature="([^"]+)"/);
    expect(boton).not.toBeNull();
    expect(boton![1]).toBe(heroe.id);
    // Licenciar uno deja más sitio en el ejército, sin salir de la morada.
    const antes = s.recruitPlan(recluta)!;
    s.dismiss(heroe.id, boton![2]!, 1);
    expect(s.scene).toBe('morada');
    const despues = s.recruitPlan(recluta)!;
    expect(despues.ocupado).toBeLessThan(antes.ocupado);
    expect(despues.caben).toBeGreaterThan(antes.caben);
    // Y se licencia hasta que cabe uno (lo que libera un «−1» puede no bastar).
    while (s.recruitPlan(recluta)!.maximo === 0) {
      const b = marcadoDe(renderSide(s)).match(
        /data-action="dismiss" data-hero="[^"]+" data-creature="([^"]+)"/,
      );
      expect(b).not.toBeNull();
      s.dismiss(heroe.id, b![1]!, 1);
    }
    expect(s.motivoParaNoReclutar(recluta)).toBeNull();
    s.recruit(recluta, 1);
    expect(s.scene).toBe('morada');
    expect(heroe.army.some((t) => t.creature === recluta)).toBe(true);
  });

  it('sin héroe dentro no hay tropa que licenciar: lo reclutado va a la guarnición', () => {
    const { s, escena } = enLaBase();
    escena.irA('lvl1', 0);
    expect(marcadoDe(renderSide(s))).not.toContain('data-action="dismiss"');
  });
});
