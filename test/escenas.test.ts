/**
 * Los gestos de cada pantalla, sin navegador: lo que las escenas hacen con el
 * puntero y lo que dice la barra después.
 *
 * Las escenas no tocan el DOM —reciben píxeles y llaman a la sesión—, así que
 * se prueban con una `Session` de verdad y las mismas funciones puras con las
 * que pintan. Cada bloque nace de un hallazgo de QA del cliente nuevo y lo
 * reproduce antes de comprobar el arreglo.
 */
import { describe, expect, it } from 'vitest';
import { DURACION, type EstadoFigura } from '../src/client/anim.js';
import { EscenaAventura, focoDe } from '../src/client/escenas/aventura.js';
import { AVISO_DE_ESPERA, EscenaBatalla } from '../src/client/escenas/batalla.js';
import { PAUSA_TRAS_EL_RIVAL, PuertaDeFinDeTurno } from '../src/client/fin-de-turno.js';
import {
  cajaDeCorona,
  cajaDeFigura,
  cajaDeNombre,
  pintarCorona,
  pintarSobreLaCabeza,
} from '../src/client/render/batalla.js';
import { casillaAPixel, centrarEn, TILE_INICIAL } from '../src/client/render/camara-mapa.js';
import { pasosAPintar } from '../src/client/render/mapa.js';
import { MARCA_DE_COMANDANTE } from '../src/client/render/palette.js';
import { centroDeStack, centroHex, tableroPara } from '../src/client/render/proyeccion.js';
import { maquetarCoste } from '../src/client/render/town.js';
import { Session } from '../src/client/session.js';
import { marcaDeComandante } from '../src/client/views/panels.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import { isAlive, SIN_CARGAS, stackHexes } from '../src/core/battle/battle.js';
import type { BattleStack } from '../src/core/battle/types.js';
import type { Hex } from '../src/core/types.js';

/** La semilla 2 tiene una guardia de zombis en (12,3) al alcance del héroe: batalla al primer clic. */
/**
 * Una batalla en la que la persona ATACA a un monstruo. La semilla 2 y (12,3)
 * dejaron de darla con el mapa de 28 y los asaltantes: allí la marcha se paraba
 * en una emboscada, y la persona defendía —el marco del móvil empieza en el
 * otro lado—. La 35 en (8,9) es un monstruo al que se llega sin cruzar la
 * región de ningún grupo que embosque.
 */
function sesionEnBatalla(): Session {
  const s = new Session(35);
  s.clickTile({ x: 8, y: 9 });
  if (s.battle === null) throw new Error(`la semilla 35 ya no da batalla en (8,9): ${s.status}`);
  if (s.state.pendingBattle?.attacker.kind !== 'hero') {
    throw new Error('la semilla 35 en (8,9) ya no es la persona atacando: ¿una emboscada?');
  }
  return s;
}

describe('el mapa con el dedo', () => {
  it('la ruta del primer toque sobrevive al pointerleave que el navegador manda al levantar el dedo', () => {
    const s = new Session(2);
    const escena = new EscenaAventura(() => s);
    const [ancho, alto] = [390, 520];
    escena.encuadrar(ancho, alto);
    const camara = centrarEn({ tile: TILE_INICIAL, x: 0, y: 0 }, focoDe(s), {
      ancho,
      alto,
      mapaAncho: s.state.map.width,
      mapaAlto: s.state.map.height,
    });
    const p = casillaAPixel(camara, { x: 6, y: 6 });

    // Lo que manda Chromium tras un toque: pointerdown, pointerup, pointerleave.
    escena.bajar(p.x, p.y);
    escena.soltar(p.x, p.y, true);
    expect(escena.rutaVisible.length).toBeGreaterThan(0);
    expect(s.status).toContain('Toca otra vez para ir');
    escena.salir();
    expect(escena.rutaVisible.length).toBeGreaterThan(0);

    // El segundo toque la anda: el héroe ya no está donde estaba.
    const antes = { ...s.selectedHero!.at };
    escena.bajar(p.x, p.y);
    escena.soltar(p.x, p.y, true);
    expect(s.selectedHero!.at).not.toEqual(antes);
    expect(escena.rutaVisible).toHaveLength(0);
  });

  it('con ratón, salir del lienzo sí borra la ruta de pasar por encima', () => {
    const s = new Session(2);
    const escena = new EscenaAventura(() => s);
    escena.encuadrar(800, 600);
    const camara = centrarEn({ tile: TILE_INICIAL, x: 0, y: 0 }, focoDe(s), {
      ancho: 800,
      alto: 600,
      mapaAncho: s.state.map.width,
      mapaAlto: s.state.map.height,
    });
    const p = casillaAPixel(camara, { x: 6, y: 6 });
    escena.mover(p.x, p.y);
    expect(escena.rutaVisible.length).toBeGreaterThan(0);
    escena.salir();
    expect(escena.rutaVisible).toHaveLength(0);
  });

  it('pulsar la casilla del propio héroe dice algo verdadero, no «No hay camino»', () => {
    const s = new Session(2);
    const heroe = s.selectedHero!;
    s.clickTile(heroe.at);
    expect(s.status).not.toContain('No hay camino');
    expect(s.status).toBe(`${heroe.name} ya está en esa casilla: pulsa otra para moverlo.`);
    expect(s.selectedHero!.movePoints).toBe(heroe.movePoints);
  });
});

describe('la ruta avisa de la emboscada (H2)', () => {
  // Semilla 1, día 1: el grupo de 6 piqueros de la región de casa está a la
  // vista desde Valdeluz, y una ruta a (2,10) pisa su región en (1,9). Antes, la
  // barra decía «llegas hoy (3 pasos)» y al pulsar había batalla.
  it('el tramo desde la emboscada va marcado, la barra lo dice delante y la batalla sale donde avisa', () => {
    const s = new Session(1);
    const escena = new EscenaAventura(() => s);
    escena.encuadrar(800, 600);
    const camara = centrarEn({ tile: TILE_INICIAL, x: 0, y: 0 }, focoDe(s), {
      ancho: 800,
      alto: 600,
      mapaAncho: s.state.map.width,
      mapaAlto: s.state.map.height,
    });
    const destino = { x: 2, y: 10 };
    const p = casillaAPixel(camara, destino);
    escena.mover(p.x, p.y);
    const ruta = escena.rutaVisible;
    const donde = ruta.findIndex((paso) => paso.emboscada !== undefined);
    expect(donde).toBeGreaterThanOrEqual(0);
    expect(ruta.slice(0, donde).every((paso) => paso.peligro === false)).toBe(true);
    expect(ruta.slice(donde).every((paso) => paso.peligro === true)).toBe(true);
    expect(s.status).toMatch(
      /^Cuidado: el camino cruza la región de 6 asaltantes, que te emboscarían/,
    );
    // El aviso es VERDAD: pulsar da la batalla con ese grupo atacando.
    const quien = ruta[donde]!.emboscada!.id;
    s.clickTile(destino);
    expect(s.state.pendingBattle?.attacker).toEqual({ kind: 'raider', raiderId: quien });
  });

  it('una ruta sin emboscada no avisa', () => {
    const s = new Session(1);
    const heroe = s.selectedHero!;
    const ruta = s.previewPath({ x: heroe.at.x + 1, y: heroe.at.y });
    expect(ruta.length).toBeGreaterThan(0);
    expect(ruta.some((paso) => paso.peligro || paso.emboscada !== undefined)).toBe(false);
  });
});

describe('«Fin de turno»', () => {
  it('dos pulsaciones seguidas pasan UN día; pasada la pausa del cambio de día, la siguiente sí', async () => {
    // Lo que veía QA: el rival se resuelve en milisegundos y la segunda
    // pulsación llega con el turno ya devuelto. Sin la puerta, son dos días.
    const sinPuerta = new Session(12);
    await sinPuerta.endTurn();
    await sinPuerta.endTurn();
    expect(sinPuerta.state.day).toBe(3);

    let ahora = 1000;
    const puerta = new PuertaDeFinDeTurno(() => ahora);
    const s = new Session(12);
    expect(await puerta.pasar(s, false)).toBe(true);
    ahora += 5;
    expect(await puerta.pasar(s, false)).toBe(false);
    expect(s.state.day).toBe(2);

    ahora += PAUSA_TRAS_EL_RIVAL;
    expect(await puerta.pasar(s, false)).toBe(true);
    expect(s.state.day).toBe(3);
  });

  it('las dos pulsaciones a la vez, sin esperar a la primera, también pasan un día', async () => {
    const puerta = new PuertaDeFinDeTurno(() => 0);
    const s = new Session(12);
    const [a, b] = await Promise.all([puerta.pasar(s, false), puerta.pasar(s, false)]);
    expect([a, b]).toEqual([true, false]);
    expect(s.state.day).toBe(2);
  });

  it('con algo moviéndose, o fuera del mapa, se ignora', async () => {
    const puerta = new PuertaDeFinDeTurno(() => 10_000);
    const s = new Session(12);
    expect(await puerta.pasar(s, true)).toBe(false);
    s.openTown(s.myTowns()[0]!.id);
    expect(await puerta.pasar(s, false)).toBe(false);
    expect(s.state.day).toBe(1);
  });
});

describe('la batalla en el lienzo', () => {
  it('el aviso de espera se borra solo cuando acaba la jugada', () => {
    const s = sesionEnBatalla();
    const escena = new EscenaBatalla(() => s);
    escena.encuadrar(1086, 778);
    escena.sincronizar(0); // la primera lectura no anima
    s.status = '¡Batalla!';
    const antes = s.battle!.log.length;
    const paso = s.battleLegalActions().find((a) => a.type === 'move');
    if (paso === undefined) throw new Error('la unidad activa no tiene a dónde moverse');
    s.playBattleAction(paso);
    const previo = s.status;
    const nuevos = s.battle!.log.slice(antes);
    expect(escena.rechazarSiOcupada(10)).toBe(true);
    expect(s.status).toBe(AVISO_DE_ESPERA);
    // Un segundo gesto durante la misma jugada no pierde lo que decía antes.
    expect(escena.rechazarSiOcupada(20)).toBe(true);

    let dura = 0;
    for (const e of nuevos)
      if (e.kind in DURACION) dura += DURACION[e.kind as keyof typeof DURACION];
    escena.sincronizar(10 + dura + 1000);
    expect(escena.ocupada).toBe(false);
    expect(s.status).toBe(previo);
  });

  it('pulsar el centro de un hex alcanzable que tapa una figura enemiga mueve, no ataca', () => {
    // El caso de QA: semilla 2, ronda 3, el hex (5,4) queda bajo el cuerpo de
    // `defender-13`. Se busca jugando, igual que lo midió QA, y el test exige
    // encontrarlo: si no, no probaría nada. Va en el lienzo del móvil, donde el
    // suelo sigue a 25°: en escritorio la cámara se levanta, las filas se
    // separan y ya no hay ninguno tapado (0 de 1011, medido).
    const s = sesionEnBatalla();
    const [ancho, alto] = [860, 380];
    const t = tableroPara(ancho, alto);
    let caso: { hex: Hex; tapa: string } | null = null;
    for (let n = 0; n < 80 && caso === null; n++) {
      const b = s.battle;
      if (b === null || b.finished !== null) break;
      for (const a of s.battleLegalActions()) {
        if (a.type !== 'move') continue;
        const c = centroHex(t, a.to);
        const tapa = b.stacks.find((e) => {
          if (!isAlive(e) || e.side === s.miBando) return false;
          const k = cajaDeFigura(t, e, centroDeStack(stackHexes(e)));
          return (
            Math.abs(c.x - k.x) <= k.ancho / 2 && c.y <= k.suelo + 4 && c.y >= k.suelo - k.alto
          );
        });
        if (tapa !== undefined) {
          caso = { hex: a.to, tapa: tapa.id };
          break;
        }
      }
      if (caso === null) s.playBattleAction(chooseBattleAction(b));
    }
    if (caso === null) throw new Error('en 80 jugadas no hay ningún hex alcanzable tapado');

    const escena = new EscenaBatalla(() => s);
    escena.encuadrar(ancho, alto);
    const { hex: destino, tapa: tapador } = caso;
    const c = centroHex(t, destino);
    const activo = s.battle!.turno?.stack;
    // Antes del arreglo, lo que había bajo ese punto era la figura enemiga.
    expect(escena.objetivoEn(c.x, c.y)).toBeUndefined();
    const vidaAntes = s.battle!.stacks.find((x) => x.id === tapador)!.count;
    escena.pulsar(c.x, c.y);
    const movido = s.battle!.stacks.find((x) => x.id === activo)!;
    expect(stackHexes(movido)).toContainEqual(destino);
    expect(s.battle!.stacks.find((x) => x.id === tapador)!.count).toBe(vidaAntes);
  });

  it('fuera del centro, la caja de la figura sigue siendo de la figura', () => {
    const s = sesionEnBatalla();
    const escena = new EscenaBatalla(() => s);
    const t = tableroPara(1086, 778);
    escena.encuadrar(1086, 778);
    const enemigo = s.battle!.stacks.find((x) => isAlive(x) && x.side !== s.miBando)!;
    const k = cajaDeFigura(t, enemigo, centroDeStack(stackHexes(enemigo)));
    // La cabeza: encima de cualquier centro de hex.
    expect(escena.objetivoEn(k.x, k.suelo - k.alto * 0.85)?.id).toBe(enemigo.id);
  });

  it('en el móvil cuenta los enemigos que quedan fuera del marco, por su lado', () => {
    const s = sesionEnBatalla();
    const escena = new EscenaBatalla(() => s);
    escena.encuadrar(860, 380);
    const enemigos = s
      .battle!.stacks.filter((x) => isAlive(x) && x.side !== s.miBando)
      .reduce((n, x) => n + x.count, 0);
    // El marco del móvil en la izquierda, donde empieza la persona que ataca.
    expect(escena.enemigosFuera(0, 364)).toEqual({ izquierda: 0, derecha: enemigos });
    // Con el marco a la derecha no queda ninguno fuera.
    expect(escena.enemigosFuera(496, 860)).toEqual({ izquierda: 0, derecha: 0 });
    // Y si el marco no ve nada, los cuenta a la izquierda.
    expect(escena.enemigosFuera(2000, 2400).izquierda).toBe(enemigos);
  });
});

describe('el comandante se distingue en el tablero (H-4)', () => {
  /** Un contexto que solo apunta lo que se escribe: el resto de llamadas no hacen nada. */
  function contextoQueApunta(): { ctx: CanvasRenderingContext2D; textos: string[] } {
    const textos: string[] = [];
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (obj, k) => {
        if (k === 'fillText') return (t: string) => textos.push(t);
        if (k in obj) return obj[k];
        return () => undefined;
      },
      set: (obj, k, v) => {
        obj[k] = v;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, textos };
  }

  it('el héroe lleva su corona encima, la tropa no; y la misma corona en «En el campo»', () => {
    const s = sesionEnBatalla();
    const batalla = s.battle!;
    const t = tableroPara(1086, 778);
    const vista = {
      battle: batalla,
      tablero: t,
      ancho: 1086,
      alto: 778,
      movibles: [],
      cargas: SIN_CARGAS,
      angulo: null,
      atacables: new Set<string>(),
      objetivosHechizo: new Set<string>(),
      hoverHex: null,
      hoverStack: null,
      figura: () => {
        throw new Error('no se usa');
      },
      efectos: [],
    };
    const coronas = (x: BattleStack): number => {
      const { ctx, textos } = contextoQueApunta();
      const f = { en: centroDeStack(stackHexes(x)), alfa: 1 } as EstadoFigura;
      // La barra no la lleva, y la corona solo la pinta quien la pinta.
      pintarSobreLaCabeza(ctx, vista, x, f);
      expect(textos).not.toContain(MARCA_DE_COMANDANTE);
      if (x.origen.kind === 'heroe') pintarCorona(ctx, vista, x, f);
      return textos.filter((t) => t === MARCA_DE_COMANDANTE).length;
    };
    const heroe = batalla.stacks.find((x) => x.origen.kind === 'heroe')!;
    expect(heroe).toBeDefined();
    expect(coronas(heroe)).toBe(1);
    for (const x of batalla.stacks.filter((y) => y.origen.kind !== 'heroe')) {
      expect(coronas(x), x.id).toBe(0);
    }
    // Y la fila del panel: la misma marca delante de su nombre, y de nadie más.
    expect(marcaDeComandante(heroe)).toBe(`${MARCA_DE_COMANDANTE} `);
    expect(batalla.stacks.filter((x) => marcaDeComandante(x) !== '')).toEqual([heroe]);

    // H-8 de la QA de la fase 1b: la chapa del nombre —la que sale en la unidad
    // activa y en la señalada— le caía encima. Las dos cajas no se tocan, y la
    // corona ya no es la de 14 px de antes.
    const f = { en: centroDeStack(stackHexes(heroe)), alfa: 1 } as EstadoFigura;
    const corona = cajaDeCorona(vista, heroe, f);
    // Un nombre largo de verdad: lo que mide «Aldo de Valdeluz» y algo más.
    const nombre = cajaDeNombre(vista, heroe, f, 160);
    const seTocan =
      corona.x < nombre.x + nombre.ancho &&
      nombre.x < corona.x + corona.ancho &&
      corona.y < nombre.y + nombre.alto &&
      nombre.y < corona.y + corona.alto;
    expect(seTocan, JSON.stringify({ corona, nombre })).toBe(false);
    expect(corona.alto).toBeGreaterThanOrEqual(22);
  });
});

describe('las fichas de coste del castillo', () => {
  it('la chapa envuelve la última cifra aunque sea de cuatro dígitos', () => {
    // «5000» en negrita de 10 px mide unos 25 px: con 34 por ficha se salía.
    const anchos = [25, 6, 6];
    const m = maquetarCoste(anchos, 160);
    const ultima = m.fichas[2]!;
    expect(ultima.x + 14 + 6).toBeLessThanOrEqual(m.ancho - 5);
    const primera = m.fichas[0]!;
    expect(primera.x + 14 + 25).toBeLessThan(m.fichas[1]!.x);
  });

  it('lo que no cabe en una fila baja a la siguiente, y la chapa no pasa del máximo', () => {
    const anchos = [25, 25, 25, 25, 25, 25, 25];
    const m = maquetarCoste(anchos, 160);
    expect(m.ancho).toBeLessThanOrEqual(160);
    expect(Math.max(...m.fichas.map((f) => f.fila))).toBeGreaterThan(0);
    for (const [i, f] of m.fichas.entries()) {
      expect(f.x + 14 + (anchos[i] as number)).toBeLessThanOrEqual(m.ancho - 5);
    }
  });
});

describe('la ruta no se pinta sobre la niebla (M5 de la 2a)', () => {
  const paso = (x: number, hoy: boolean) => ({ at: { x, y: 0 }, hoy });

  it('lo no explorado no se pinta, y el último paso visible no se hace pasar por destino', () => {
    const ruta = [paso(1, true), paso(2, true), paso(3, false), paso(4, false)];
    const explorado = new Set(['1,0', '2,0']);
    expect(pasosAPintar(ruta, explorado)).toEqual([
      { ...paso(1, true), marca: 'paso' },
      // La parada de hoy sigue siéndolo, y nada lleva la marca de destino.
      { ...paso(2, true), marca: 'parada' },
    ]);
    // El destino explorado sí se pinta, aunque lo de en medio no.
    const conDestino = pasosAPintar(ruta, new Set(['1,0', '4,0']));
    expect(conDestino.map((p) => [p.at.x, p.marca])).toEqual([
      [1, 'paso'],
      [4, 'destino'],
    ]);
    // Viéndolo todo, entera.
    expect(pasosAPintar(ruta, null)).toHaveLength(4);
  });

  it('en una partida de verdad, una ruta hacia lo desconocido solo pinta lo explorado', () => {
    const s = new Session(3);
    const lejos = s.state.towns.find((t) => t.owner !== null && t.owner !== s.viewer)!.at;
    const ruta = s.previewPath(lejos);
    const explorado = s.explorado!;
    // La premisa, para que el test no pase por vacío: la ruta entra en la niebla.
    expect(ruta.some((r) => !explorado.has(`${r.at.x},${r.at.y}`))).toBe(true);
    const pintados = pasosAPintar(ruta, explorado);
    expect(pintados.length).toBeGreaterThan(0);
    expect(pintados.every((p) => explorado.has(`${p.at.x},${p.at.y}`))).toBe(true);
  });
});
