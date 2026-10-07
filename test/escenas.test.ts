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
import { EscenaAventura, focoDe, llegadaDeLaRuta } from '../src/client/escenas/aventura.js';
import { AVISO_DE_ESPERA, EscenaBatalla } from '../src/client/escenas/batalla.js';
import { PAUSA_TRAS_EL_RIVAL, PuertaDeFinDeTurno } from '../src/client/fin-de-turno.js';
import { msPorCasilla } from '../src/client/marcha.js';
import {
  bandosSinDueño,
  COLOR_BANDO,
  cajaDeCorona,
  cajaDeFigura,
  cajaDeNombre,
  colorDelBando,
  pintarCorona,
  pintarSobreLaCabeza,
} from '../src/client/render/batalla.js';
import { casillaAPixel, centrarEn, TILE_INICIAL } from '../src/client/render/camara-mapa.js';
import type { Volumen } from '../src/client/render/escenario/pintar.js';
import { fundirPorProfundidad, PIES, pasosAPintar } from '../src/client/render/mapa.js';
import { COLOR_SIN_DUEÑO, MARCA_DE_COMANDANTE, playerColor } from '../src/client/render/palette.js';
import {
  ALTO_DE_FIGURA,
  centroDeStack,
  centroHex,
  tableroPara,
} from '../src/client/render/proyeccion.js';
import { maquetarCoste } from '../src/client/render/town.js';
import { repartirClic } from '../src/client/reparto-del-clic.js';
import { Session } from '../src/client/session.js';
import { marcaDeComandante } from '../src/client/views/panels.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import { isAlive, SIN_CARGAS, stackHexes } from '../src/core/battle/battle.js';
import type { BattleStack, Side } from '../src/core/battle/types.js';
import type { Hex } from '../src/core/types.js';
import {
  destinoDeHoy,
  rutaConEmboscada,
  sesionContraMonstruo,
  sesionesContraMonstruo,
} from './batalla-de-cliente.js';
import { anteLaBase } from './helpers.js';

/**
 * Una batalla en la que la persona ATACA a un monstruo: la busca
 * `sesionContraMonstruo`, porque las semillas escritas a mano —la 2 en (12,3),
 * la 35 en (8,9)— las rompía cada cambio del generador.
 */
function sesionEnBatalla(): Session {
  return sesionContraMonstruo();
}

/** La escena de batalla de esa sesión, encuadrada y con su primera lectura hecha, que no anima. */
function escenaDeBatalla(sesion: () => Session): EscenaBatalla {
  const escena = new EscenaBatalla(sesion);
  escena.encuadrar(1086, 778);
  escena.sincronizar(0);
  return escena;
}

/**
 * Mueve la unidad activa un tramo y devuelve lo que tarda en contarse, en ms:
 * a partir de ahí la cola tiene algo dentro.
 */
function jugarUnTramo(s: Session): number {
  const antes = s.battle!.log.length;
  const paso = s.battleLegalActions().find((a) => a.type === 'move');
  if (paso === undefined) throw new Error('la unidad activa no tiene a dónde moverse');
  s.playBattleAction(paso);
  let dura = 0;
  for (const e of s.battle!.log.slice(antes)) {
    if (e.kind in DURACION) dura += DURACION[e.kind as keyof typeof DURACION];
    // Un tramo dura sus casillas al paso de quien anda; la marcha de una
    // figura de un hex es la más lenta que hay.
    if (e.kind === 'move') {
      const quien = s.battle!.stacks.find((x) => x.id === e.stack)!;
      dura += e.path.length * msPorCasilla(quien.body, 'walk', ALTO_DE_FIGURA.normal);
    }
  }
  return dura;
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
    const p = casillaAPixel(camara, destinoDeHoy(s));

    // Lo que manda Chromium tras un toque: pointerdown, pointerup, pointerleave.
    escena.bajar(p.x, p.y);
    if (escena.soltar()) escena.pulsar(p.x, p.y, true);
    expect(escena.rutaVisible.length).toBeGreaterThan(0);
    expect(s.status).toContain('Toca otra vez para ir');
    escena.salir();
    expect(escena.rutaVisible.length).toBeGreaterThan(0);

    // El segundo toque la anda: el héroe ya no está donde estaba.
    const antes = { ...s.selectedHero!.at };
    escena.bajar(p.x, p.y);
    if (escena.soltar()) escena.pulsar(p.x, p.y, true);
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
    const p = casillaAPixel(camara, destinoDeHoy(s));
    escena.mover(p.x, p.y);
    expect(escena.rutaVisible.length).toBeGreaterThan(0);
    escena.salir();
    expect(escena.rutaVisible).toHaveLength(0);
  });

  it('olvidar la ruta borra su frase, y solo la suya: al pasar el turno la barra vuelve vacía (#123)', async () => {
    const s = new Session(2);
    const escena = new EscenaAventura(() => s);
    escena.encuadrar(800, 600);
    const camara = centrarEn({ tile: TILE_INICIAL, x: 0, y: 0 }, focoDe(s), {
      ancho: 800,
      alto: 600,
      mapaAncho: s.state.map.width,
      mapaAlto: s.state.map.height,
    });
    const p = casillaAPixel(camara, destinoDeHoy(s));
    escena.mover(p.x, p.y);
    expect(s.status).toContain('llegas hoy');
    // Lo que hace `pasarTurno` en `main.ts`: olvidar la ruta y pasar. La frase
    // seguía ahí al volver el turno, sin mover el puntero, con el día cambiado.
    escena.olvidarRuta();
    const dia = s.state.day;
    await s.endTurn();
    expect(s.state.day).toBe(dia + 1);
    expect(s.desenlace).toBeNull();
    expect(s.status).toBe('');

    // Lo que escribió después la sesión no es de la escena, y se queda.
    escena.mover(p.x, p.y);
    expect(s.status).not.toBe('');
    s.clickTile(s.selectedHero!.at);
    const suya = s.status;
    escena.olvidarRuta();
    expect(s.status).toBe(suya);
  });

  it('con la partida terminada, pasar el puntero no tapa el desenlace de la barra (#158 c)', () => {
    const s = new Session(2);
    const escena = new EscenaAventura(() => s);
    escena.encuadrar(800, 600);
    const camara = centrarEn({ tile: TILE_INICIAL, x: 0, y: 0 }, focoDe(s), {
      ancho: 800,
      alto: 600,
      mapaAncho: s.state.map.width,
      mapaAlto: s.state.map.height,
    });
    const p = casillaAPixel(camara, destinoDeHoy(s));
    // Quien juega pisa la base vacía del rival por el clic de siempre: la barra
    // la escribe la sesión al acabarse el mapa, no el test.
    const { base, atacante } = anteLaBase(s.state, 0, 1);
    s.moveHeroTo(atacante.id, base.at);
    expect(s.desenlace).toBe('ganada');
    const fin = s.status;
    expect(fin).toBe('¡Victoria! Has tomado la base rival.');
    escena.mover(p.x, p.y);
    expect(s.status).toBe(fin);
    expect(escena.rutaVisible).toHaveLength(0);
    // Y otra casilla, por si la primera coincidía con una clave guardada.
    escena.mover(p.x + 40, p.y + 40);
    expect(s.status).toBe(fin);
  });

  it('señalar una casilla en la niebla no dice dos veces «tierras desconocidas» (QA de #123)', () => {
    // La casilla de la comprobación en vivo: semilla 3, (2,0), con la ruta
    // entrando en la niebla. La barra decía «Tierras desconocidas · … sigue por
    // tierras desconocidas».
    const s = new Session(3);
    const destino = { x: 2, y: 0 };
    expect(s.explorado!.has('2,0')).toBe(false);
    expect(s.previewPath(destino).length).toBeGreaterThan(0);
    const escena = new EscenaAventura(() => s);
    escena.encuadrar(800, 600);
    const camara = centrarEn({ tile: TILE_INICIAL, x: 0, y: 0 }, focoDe(s), {
      ancho: 800,
      alto: 600,
      mapaAncho: s.state.map.width,
      mapaAlto: s.state.map.height,
    });
    const p = casillaAPixel(camara, destino);
    escena.mover(p.x, p.y);
    expect(s.status).toMatch(
      /^Tierras desconocidas · hoy andas \d+ de los \d+ pasos? que se ven\.$/,
    );
    expect(s.status.toLowerCase().split('tierras desconocidas')).toHaveLength(2);
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
  // Una ruta que pisa, a la vista, la región de un grupo que embosca: la
  // primera semilla que la da. Antes, la barra decía «llegas hoy (3 pasos)» y
  // al pulsar había batalla.
  it('el tramo desde la emboscada va marcado, la barra lo dice delante y la batalla sale donde avisa', () => {
    const { s, destino } = rutaConEmboscada();
    const escena = new EscenaAventura(() => s);
    escena.encuadrar(800, 600);
    const camara = centrarEn({ tile: TILE_INICIAL, x: 0, y: 0 }, focoDe(s), {
      ancho: 800,
      alto: 600,
      mapaAncho: s.state.map.width,
      mapaAlto: s.state.map.height,
    });
    const p = casillaAPixel(camara, destino);
    escena.mover(p.x, p.y);
    const ruta = escena.rutaVisible;
    const donde = ruta.findIndex((paso) => paso.emboscada !== undefined);
    expect(donde).toBeGreaterThanOrEqual(0);
    expect(ruta.slice(0, donde).every((paso) => paso.peligro === false)).toBe(true);
    expect(ruta.slice(donde).every((paso) => paso.peligro === true)).toBe(true);
    expect(s.status).toMatch(
      /^Cuidado: el camino cruza la región de \d+ asaltantes, que te emboscarían/,
    );
    // El aviso es VERDAD: pulsar da la batalla con ese grupo atacando.
    const quien = ruta[donde]!.emboscada!.id;
    s.clickTile(destino);
    expect(s.state.pendingBattle?.attacker).toEqual({ kind: 'raider', raiderId: quien });
  });

  it('una ruta sin emboscada no avisa', () => {
    const s = new Session(1);
    const ruta = s.previewPath(destinoDeHoy(s, false));
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
    const escena = escenaDeBatalla(() => s);
    s.status = '¡Batalla!';
    const dura = jugarUnTramo(s);
    const previo = s.status;
    expect(escena.rechazarSiOcupada(10)).toBe(true);
    expect(s.status).toBe(AVISO_DE_ESPERA);
    // Un segundo gesto durante la misma jugada no pierde lo que decía antes.
    expect(escena.rechazarSiOcupada(20)).toBe(true);

    escena.sincronizar(10 + dura + 1000);
    expect(escena.ocupada).toBe(false);
    expect(s.status).toBe(previo);
  });

  it('un gesto que espera a la jugada se hace al acabarla, una vez y sin aviso de espera (#158 d)', () => {
    const s = sesionEnBatalla();
    const escena = escenaDeBatalla(() => s);
    s.status = '¡Batalla!';
    const dura = jugarUnTramo(s);
    const previo = s.status;

    // Lo que hace «Continuar» con la última muerte aún contándose.
    let veces = 0;
    escena.alAcabar(10, () => veces++);
    expect(escena.ocupada).toBe(true);
    expect(veces).toBe(0);
    expect(s.status).not.toBe(AVISO_DE_ESPERA);
    expect(s.status).toBe(previo);
    escena.sincronizar(20);
    expect(veces).toBe(0);

    escena.sincronizar(10 + dura + 1000);
    expect(escena.ocupada).toBe(false);
    expect(veces).toBe(1);
    escena.sincronizar(10 + dura + 2000);
    expect(veces).toBe(1);

    // Con la cola vacía, se hace en el acto.
    escena.alAcabar(10 + dura + 3000, () => veces++);
    expect(veces).toBe(2);
  });

  it('«Continuar» se atiende antes de preguntar si la jugada sigue, y no pone el aviso (#158 d)', () => {
    // Lo que hace `main.ts` con un clic en un botón. Preguntar por la jugada en
    // curso ya escribe el aviso de espera, así que «Continuar» no puede pasar
    // por ahí: la pregunta no se tiene que hacer siquiera.
    let preguntas = 0;
    const enCurso = () => {
      preguntas++;
      return true;
    };
    expect(repartirClic('finish-battle', 'battle', enCurso)).toBe('al-acabar');
    expect(repartirClic('ver-enemigo', 'battle', enCurso)).toBe('mirar');
    expect(preguntas).toBe(0);
    // Los demás botones sí esperan a la jugada.
    expect(repartirClic('auto-battle', 'battle', enCurso)).toBe('nada');
    expect(preguntas).toBe(1);
    expect(repartirClic('auto-battle', 'battle', () => false)).toBe('gesto');
    expect(repartirClic(null, 'battle', () => false)).toBe('nada');
    // Fuera de la batalla, «Continuar» es un gesto más.
    expect(repartirClic('finish-battle', 'adventure', () => false)).toBe('gesto');
  });

  it('un gesto que espera a la jugada se olvida si la batalla ya no es la misma (#158 d)', () => {
    const s = sesionEnBatalla();
    let actual: Session = s;
    const escena = escenaDeBatalla(() => actual);
    jugarUnTramo(s);
    let veces = 0;
    escena.alAcabar(10, () => veces++);
    expect(veces).toBe(0);
    // Otra sesión, otra batalla: el «Continuar» de la anterior no se hace aquí.
    actual = sesionEnBatalla();
    escena.sincronizar(1_000_000);
    actual = s;
    escena.sincronizar(2_000_000);
    expect(veces).toBe(0);
  });

  it('pulsar el centro de un hex alcanzable que tapa una figura enemiga mueve, no ataca', () => {
    // El caso de QA: semilla 2, ronda 3, el hex (5,4) queda bajo el cuerpo de
    // `defender-13`. Se busca jugando, igual que lo midió QA, y el test exige
    // encontrarlo: si no, no probaría nada. Va en el lienzo del móvil, donde el
    // suelo sigue a 25°: en escritorio la cámara se levanta, las filas se
    // separan y ya no hay ninguno tapado (0 de 1011, medido).
    // Se busca en las batallas por orden, no solo en la primera: si la primera
    // no lo da (con el mapa de «mapas densos», vuelta 1 de QA, no lo daba),
    // otra sí, y lo que se prueba es el clic, no la batalla.
    const [ancho, alto] = [860, 380];
    const t = tableroPara(ancho, alto);
    let s: Session | null = null;
    let caso: { hex: Hex; tapa: string } | null = null;
    let batallas = 0;
    for (const hallada of sesionesContraMonstruo()) {
      if (caso !== null || batallas >= 10) break;
      batallas++;
      s = hallada.s;
      for (let n = 0; n < 80 && caso === null; n++) {
        const b = s.battle;
        if (b === null || b.finished !== null) break;
        for (const a of s.battleLegalActions()) {
          if (a.type !== 'move') continue;
          const c = centroHex(t, a.to);
          const tapa = b.stacks.find((e) => {
            if (!isAlive(e) || e.side === s!.miBando) return false;
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
    }
    if (caso === null || s === null) {
      throw new Error(`en ${batallas} batallas de 80 jugadas no hay ningún hex alcanzable tapado`);
    }

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

  it('el bando sin dueño se tiñe del gris de lo que no es de nadie, como en el mapa (I1)', () => {
    const s = sesionEnBatalla();
    // Contra un monstruo: el atacante es la persona y el defensor no es de nadie.
    expect(s.dueños).toEqual({ attacker: s.viewer, defender: null });
    const vista = { sinDueño: bandosSinDueño(s.dueños!) };
    expect(colorDelBando(vista, 'defender')).toBe(COLOR_SIN_DUEÑO);
    expect(colorDelBando(vista, 'attacker')).toBe(COLOR_BANDO.attacker);
    // Es el mismo gris que la bandera de un castillo neutral, no un literal aparte.
    expect(COLOR_SIN_DUEÑO).toBe(playerColor(null));
    // La emboscada al revés: el atacante es el que no tiene dueño.
    expect([...bandosSinDueño({ attacker: null, defender: 1 })]).toEqual(['attacker']);
    // Entre dos jugadores, ninguno; y en la arena (sin dueños) se queda el del bando.
    expect(bandosSinDueño({ attacker: 0, defender: 1 }).size).toBe(0);
    expect(colorDelBando({ sinDueño: new Set() }, 'defender')).toBe(COLOR_BANDO.defender);
  });

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
      sinDueño: new Set<Side>(),
    };
    const coronas = (x: BattleStack): number => {
      const { ctx, textos } = contextoQueApunta();
      const f = { en: centroDeStack(stackHexes(x)), alfaDelAro: 1 } as EstadoFigura;
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
    const f = { en: centroDeStack(stackHexes(heroe)), alfaDelAro: 1 } as EstadoFigura;
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

  it('la barra cuenta los pasos que se ven, no los de la niebla (#123)', () => {
    // Cinco pasos, tres de hoy, y los dos últimos en la niebla: contados sobre
    // la ruta entera, la barra decía «hoy llegas a 3 de 5 pasos» y el 5
    // delataba el rodeo que el trazo ya no pinta.
    const ruta = [paso(1, true), paso(2, true), paso(3, true), paso(4, false), paso(5, false)];
    const explorado = new Set(['1,0', '2,0', '3,0']);
    const frase = llegadaDeLaRuta(ruta, explorado);
    // El destino está en la niebla: la barra ya empieza por «Tierras
    // desconocidas», así que la frase no lo repite (H3 de QA).
    expect(frase).toBe('hoy andas 3 de los 3 pasos que se ven');
    expect(frase).not.toContain('llegas hoy');
    expect(frase).not.toContain('5');
    // Con parte de hoy a la vista y el resto en la niebla, lo mismo con su cuenta.
    const corta = [paso(1, true), paso(2, false), paso(3, false), paso(4, false)];
    expect(llegadaDeLaRuta(corta, new Set(['1,0', '2,0']))).toBe(
      'hoy andas 1 de los 2 pasos que se ven',
    );
    // Con el destino a la vista y la niebla en medio, la frase elegida entera.
    expect(llegadaDeLaRuta(ruta, new Set(['1,0', '2,0', '3,0', '5,0']))).toBe(
      'hoy andas 3 de los 4 pasos que se ven; sigue por tierras desconocidas',
    );
    // Viéndolo todo, o con la ruta entera explorada, las frases de siempre.
    expect(llegadaDeLaRuta(ruta, null)).toBe(
      'hoy llegas a 3 de 5 pasos: dorado hoy, gris otro día',
    );
    expect(llegadaDeLaRuta(ruta.slice(0, 3), explorado)).toBe('llegas hoy (3 pasos)');
    expect(llegadaDeLaRuta([paso(1, false)], null)).toBe(
      'hoy no te queda movimiento para dar ni un paso',
    );
  });
});

describe('una figura puede quedar detrás de un árbol', () => {
  /** Un pino con la base en `y`, como los pone el escenógrafo. */
  const pino = (x: number, y: number): Volumen => ({
    clave: y,
    s: {
      src: 'modulos/pinos/1.webp',
      nw: 100,
      nh: 160,
      ax: 50,
      ay: 155,
      x,
      y,
      alto: 1.1,
      clase: 'masa',
      color: '#1f3a22',
      capa: 0,
      sombra: true,
    },
  });
  const orden = (volumenes: Volumen[], cosas: { clave: number; nombre: string }[]) => {
    const fuera: string[] = [];
    fundirPorProfundidad(
      volumenes,
      cosas,
      (v) => fuera.push(`pino ${v.clave}`),
      (c) => fuera.push(c.nombre),
    );
    return fuera;
  };

  it('un héroe con los pies en y + 0,8 tras un pino con la base en y + 0,9 se pinta antes: el pino lo tapa', () => {
    const y = 5;
    expect(orden([pino(3.5, y + 0.9)], [{ clave: y + PIES.heroe, nombre: 'héroe' }])).toEqual([
      'héroe',
      'pino 5.9',
    ]);
  });

  it('delante del pino —el pino en la fila de arriba— se pinta después', () => {
    const y = 5;
    expect(orden([pino(3.5, y - 1 + 0.9)], [{ clave: y + PIES.heroe, nombre: 'héroe' }])).toEqual([
      'pino 4.9',
      'héroe',
    ]);
  });

  it('a igual clave va antes el volumen, y no se pierde ni se repite nada', () => {
    const volumenes = [pino(1, 2), pino(2, 3), pino(3, 3)];
    const cosas = [
      { clave: 1, nombre: 'a' },
      { clave: 3, nombre: 'b' },
      { clave: 9, nombre: 'c' },
    ];
    expect(orden(volumenes, cosas)).toEqual(['a', 'pino 2', 'pino 3', 'pino 3', 'b', 'c']);
  });
});
