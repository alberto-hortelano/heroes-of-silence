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
import { EscenaBatalla } from '../src/client/escenas/batalla.js';
import { EscenaBase } from '../src/client/escenas/castillo.js';
import { PAUSA_TRAS_EL_RIVAL, PuertaDeFinDeTurno } from '../src/client/fin-de-turno.js';
import { marcadoDe } from '../src/client/html.js';
import { msPorCasilla } from '../src/client/marcha.js';
import { camaraDeLaBase, camaraQuieta } from '../src/client/render/base/camara.js';
import { componerBase } from '../src/client/render/base/escena.js';
import { rachasSinArte } from '../src/client/render/base/pintar.js';
import { dondePulsarElSitio } from '../src/client/render/base/recortes.js';
import {
  bandosSinDueño,
  COLOR_BANDO,
  cajaDeCorona,
  cajaDeFigura,
  cajaDeFiguraEn,
  cajaDeNombre,
  colorDelBando,
  pintarCorona,
  pintarSobreLaCabeza,
} from '../src/client/render/batalla.js';
import { casillaAPixel, centrarEn, TILE_INICIAL } from '../src/client/render/camara-mapa.js';
import type { Volumen } from '../src/client/render/escenario/pintar.js';
import {
  asientoDeLaInicial,
  type CuerpoDeFigura,
  fundirPorProfundidad,
  PIES,
  pasosAPintar,
  SITIOS_DE_LA_INICIAL,
} from '../src/client/render/mapa.js';
import { COLOR_SIN_DUEÑO, MARCA_DE_COMANDANTE, playerColor } from '../src/client/render/palette.js';
import { CUERPO_DE_VECINO } from '../src/client/render/personajes.js';
import {
  ALTO_DE_FIGURA,
  centroDeStack,
  centroHex,
  enPantalla,
  type Tablero,
  tableroPara,
} from '../src/client/render/proyeccion.js';
import { repartirClic } from '../src/client/reparto-del-clic.js';
import { AYUDA_DE_LA_BASE, Session } from '../src/client/session.js';
import { renderConversacion } from '../src/client/views/base.js';
import {
  AVISO_DE_ESPERA,
  marcaDeComandante,
  renderActions,
  renderSide,
} from '../src/client/views/panels.js';
import { chooseBattleAction } from '../src/core/ai/tactics.js';
import { isAlive, SIN_CARGAS, stackHexes } from '../src/core/battle/battle.js';
import type { BattleStack, Side } from '../src/core/battle/types.js';
import { Casillas } from '../src/core/map/casillas.js';
import type { Hex } from '../src/core/types.js';
import {
  bordeDeAtras,
  type Disposicion,
  disposicionDe,
  enLaFranja,
  type Plano,
} from '../src/shared/base.js';
import {
  destinoDeHoy,
  rutaConEmboscada,
  sesionContraMonstruo,
  sesionesContraMonstruo,
} from './batalla-de-cliente.js';
import { agresiva, anteLaBase, primeraSemillaCon } from './helpers.js';

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
    // Una casilla sin explorar junto al héroe con la ruta entrando en la
    // niebla. La barra decía «Tierras desconocidas · … sigue por tierras
    // desconocidas». Era la semilla 3, (2,0), de la comprobación en vivo; se
    // busca, que #169 cambió los mapas y esa ya estaba explorada.
    const { semilla, caso: destino } = primeraSemillaCon(
      'una casilla en la niebla junto al héroe con ruta',
      (sem) => {
        const otra = new Session(sem);
        const h = otra.selectedHero!.at;
        for (let dy = -7; dy <= 7; dy++)
          for (let dx = -7; dx <= 7; dx++) {
            const p = { x: h.x + dx, y: h.y + dy };
            if (p.x < 0 || p.y < 0 || p.x >= otra.state.map.width || p.y >= otra.state.map.height)
              continue;
            if (otra.explorado!.has(p)) continue;
            if (otra.previewPath(p).length > 0) return p;
          }
        return undefined;
      },
    );
    const s = new Session(semilla);
    expect(s.explorado!.has(destino)).toBe(false);
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
    // Confirmadas (`true`): la pregunta de los héroes que aún andan es otra
    // cosa, y tiene sus propios tests abajo.
    const sinPuerta = new Session(12);
    await sinPuerta.endTurn();
    await sinPuerta.endTurn();
    expect(sinPuerta.state.day).toBe(3);

    let ahora = 1000;
    const puerta = new PuertaDeFinDeTurno(() => ahora);
    const s = new Session(12);
    expect(await puerta.pasar(s, false, true)).toBe(true);
    ahora += 5;
    expect(await puerta.pasar(s, false, true)).toBe(false);
    expect(s.state.day).toBe(2);

    ahora += PAUSA_TRAS_EL_RIVAL;
    expect(await puerta.pasar(s, false, true)).toBe(true);
    expect(s.state.day).toBe(3);
  });

  it('las dos pulsaciones a la vez, sin esperar a la primera, también pasan un día', async () => {
    const puerta = new PuertaDeFinDeTurno(() => 0);
    const s = new Session(12);
    const [a, b] = await Promise.all([puerta.pasar(s, false, true), puerta.pasar(s, false, true)]);
    expect([a, b]).toEqual([true, false]);
    expect(s.state.day).toBe(2);
  });

  it('con algo moviéndose, o fuera del mapa, se ignora', async () => {
    const puerta = new PuertaDeFinDeTurno(() => 10_000);
    const s = new Session(12);
    expect(await puerta.pasar(s, true)).toBe(false);
    s.openTown(s.myTowns()[0]!.id);
    expect(await puerta.pasar(s, false, true)).toBe(false);
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

  it('con la jugada contándose, los botones del panel salen apagados y no piden un segundo clic (#165)', () => {
    const s = sesionEnBatalla();
    const escena = escenaDeBatalla(() => s);
    const dura = jugarUnTramo(s);
    escena.sincronizar(10);
    expect(escena.ocupada).toBe(true);
    // Tras un tramo la unidad sigue siendo tuya: el panel ofrecería sus botones.
    expect(s.turnoPropio).not.toBeNull();

    // Lo que hace `main.ts`: el panel con la cola de este fotograma.
    const apagados = /<fieldset class="contando" disabled title="([^"]*)">([\s\S]*?)<\/fieldset>/;
    const marcado = marcadoDe(renderSide(s, escena.ocupada));
    const [, titulo, dentro = ''] = marcado.match(apagados) ?? [];
    expect(titulo).toBe(AVISO_DE_ESPERA);
    // Todos los botones del lado están dentro: ninguno queda encendido fuera.
    expect(dentro.match(/<button/g)?.length).toBe(marcado.match(/<button/g)?.length);
    for (const accion of ['battle-end-turn', 'battle-defend', 'battle-wait', 'battle-surrender']) {
      expect(dentro).toContain(`data-action="${accion}"`);
    }
    expect(marcadoDe(renderActions(s, escena.ocupada))).toMatch(
      /<fieldset class="contando" disabled[^>]*><button data-action="auto-battle">/,
    );

    // Contada la jugada, los mismos paneles sin apagar.
    escena.sincronizar(10 + dura + 1000);
    expect(escena.ocupada).toBe(false);
    expect(marcadoDe(renderSide(s, escena.ocupada))).not.toContain('fieldset');
    expect(marcadoDe(renderActions(s, escena.ocupada))).not.toContain('fieldset');
  });

  it('«Continuar» no se apaga con la jugada contándose: espera él solo (#165, #158 d)', () => {
    const s = sesionEnBatalla();
    const escena = escenaDeBatalla(() => s);
    for (let i = 0; i < 500 && s.battle!.finished === null; i++) {
      s.playBattleAction(agresiva(s.battle!));
    }
    expect(s.battle!.finished).not.toBeNull();
    escena.sincronizar(10);
    // La última muerte aún se cuenta y «Continuar» ya está, encendido.
    expect(escena.ocupada).toBe(true);
    const acciones = marcadoDe(renderActions(s, escena.ocupada));
    expect(acciones).toContain('data-action="finish-battle"');
    expect(acciones).not.toContain('fieldset');
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
      escalables: new Set<string>(),
      puertasPorElegir: new Set<string>(),
      objetivosHechizo: new Set<string>(),
      hoverHex: null,
      hoverStack: null,
      puntero: null,
      figura: () => {
        throw new Error('no se usa');
      },
      activo: null,
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

describe('la ruta no se pinta sobre la niebla (M5 de la 2a)', () => {
  const paso = (x: number, hoy: boolean) => ({ at: { x, y: 0 }, hoy });
  /** Lo explorado de una ruta por la fila 0: en ella, el índice es la x. */
  const fila = (...xs: number[]) => Casillas.deIndices({ width: 8, height: 1 }, xs);

  it('lo no explorado no se pinta, y el último paso visible no se hace pasar por destino', () => {
    const ruta = [paso(1, true), paso(2, true), paso(3, false), paso(4, false)];
    const explorado = fila(1, 2);
    expect(pasosAPintar(ruta, explorado)).toEqual([
      { ...paso(1, true), marca: 'paso' },
      // La parada de hoy sigue siéndolo, y nada lleva la marca de destino.
      { ...paso(2, true), marca: 'parada' },
    ]);
    // El destino explorado sí se pinta, aunque lo de en medio no.
    const conDestino = pasosAPintar(ruta, fila(1, 4));
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
    expect(ruta.some((r) => !explorado.has(r.at))).toBe(true);
    const pintados = pasosAPintar(ruta, explorado);
    expect(pintados.length).toBeGreaterThan(0);
    expect(pintados.every((p) => explorado.has(p.at))).toBe(true);
  });

  it('la barra cuenta los pasos que se ven, no los de la niebla (#123)', () => {
    // Cinco pasos, tres de hoy, y los dos últimos en la niebla: contados sobre
    // la ruta entera, la barra decía «hoy llegas a 3 de 5 pasos» y el 5
    // delataba el rodeo que el trazo ya no pinta.
    const ruta = [paso(1, true), paso(2, true), paso(3, true), paso(4, false), paso(5, false)];
    const explorado = fila(1, 2, 3);
    const frase = llegadaDeLaRuta(ruta, explorado);
    // El destino está en la niebla: la barra ya empieza por «Tierras
    // desconocidas», así que la frase no lo repite (H3 de QA).
    expect(frase).toBe('hoy andas 3 de los 3 pasos que se ven');
    expect(frase).not.toContain('llegas hoy');
    expect(frase).not.toContain('5');
    // Con parte de hoy a la vista y el resto en la niebla, lo mismo con su cuenta.
    const corta = [paso(1, true), paso(2, false), paso(3, false), paso(4, false)];
    expect(llegadaDeLaRuta(corta, fila(1, 2))).toBe('hoy andas 1 de los 2 pasos que se ven');
    // Con el destino a la vista y la niebla en medio, la frase elegida entera.
    expect(llegadaDeLaRuta(ruta, fila(1, 2, 3, 5))).toBe(
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

describe('la inicial de un héroe no tapa a otra figura (#166 H11)', () => {
  // Un héroe pisa en (5,5; 5,8). La inicial, de radio 0,13 casillas.
  const pie = { x: 5.5, y: 5.8 };
  const radio = 0.13;
  const heroe = (x: number, y: number): CuerpoDeFigura => ({
    x,
    pie: y,
    semiancho: 0.3,
    alto: 0.92,
  });
  /** Si el disco de la inicial en `en` cae sobre el cuerpo `o`. */
  const tapa = (en: { x: number; y: number }, o: CuerpoDeFigura) => {
    const dx = Math.max(o.x - o.semiancho - en.x, 0, en.x - (o.x + o.semiancho));
    const dy = Math.max(o.pie - o.alto - en.y, 0, en.y - o.pie);
    return Math.hypot(dx, dy) < radio;
  };

  it('solo, sobre la cabeza', () => {
    expect(asientoDeLaInicial(pie, [], radio)).toEqual({ x: 5.5, y: 4.8 });
  });

  it('con otro detrás en la misma columna —una casilla o el paso corto de un puente—, a un lado de la cabeza y sin tocarlo', () => {
    // Sobre la cabeza caía en las piernas del de detrás: la «A» sobre la «C» de
    // s57 node-16. En un puente N-S que sube, las pisadas están más juntas.
    for (const paso of [1, 0.75]) {
      const detras = heroe(pie.x, pie.y - paso);
      expect(tapa({ x: pie.x, y: pie.y - 1 }, detras), `paso ${paso}: el guardia muerde`).toBe(
        true,
      );
      const en = asientoDeLaInicial(pie, [detras], radio);
      expect(en, `paso ${paso}`).toEqual({ x: 5.95, y: pie.y - 0.72 });
      expect(tapa(en, detras), `paso ${paso}`).toBe(false);
    }
  });

  it('con el lado derecho ocupado, el izquierdo; sin sitio libre, sobre la cabeza', () => {
    const detras = heroe(pie.x, pie.y - 1);
    const derecha = heroe(pie.x + 0.75, pie.y - 0.2);
    expect(asientoDeLaInicial(pie, [detras, derecha], radio)).toEqual({ x: 5.05, y: pie.y - 0.72 });
    const izquierda = heroe(pie.x - 0.75, pie.y - 0.2);
    expect(asientoDeLaInicial(pie, [detras, derecha, izquierda], radio)).toEqual({
      x: pie.x + (SITIOS_DE_LA_INICIAL[0]?.[0] ?? Number.NaN),
      y: pie.y - 1,
    });
  });

  it('un grupo de asaltantes detrás también cuenta, y uno al lado que no llega arriba, no', () => {
    const grupo: CuerpoDeFigura = { x: 5.5, pie: 5.82 - 1, semiancho: 0.34, alto: 0.85 };
    expect(asientoDeLaInicial(pie, [grupo], radio).y).toBeCloseTo(pie.y - 0.72);
    // A dos casillas al este: lejos de todos los sitios.
    expect(asientoDeLaInicial(pie, [heroe(7.5, 5.8)], radio)).toEqual({ x: 5.5, y: 4.8 });
  });
});

describe('la base caminable (escenas/castillo.ts)', () => {
  /** Una sesión con su base abierta y la escena encuadrada en el lienzo del escritorio. */
  function enLaBase(seed = 12): { s: Session; escena: EscenaBase; d: Disposicion } {
    const s = new Session(seed);
    s.openTown(s.myTowns()[0]!.id);
    const escena = new EscenaBase(() => s);
    escena.encuadrar(1086, 778);
    return { s, escena, d: disposicionDe(s.activeTown!.faction) };
  }

  /** Pulsa donde diga `donde` en la vista de ahora (sin dibujar, la quieta sobre quien camina). */
  function pulsar(
    escena: EscenaBase,
    donde: (t: Tablero) => { x: number; y: number },
    ahora: number,
  ): void {
    const q = donde(escena.camara()!);
    escena.pulsar(q.x, q.y, ahora);
  }
  const laPuerta = (d: Disposicion, sitio: 'hall' | 'lvl1') => (t: Tablero) =>
    dondePulsarElSitio(t, d.sitios[sitio]);
  const elPunto = (p: Plano) => (t: Tablero) => enPantalla(t, p);

  it('sin héroe dentro camina el alcaide; con él, el héroe', () => {
    const { s } = enLaBase();
    expect(s.vistaDeLaBase()!.caminante.id).toBe(`alcaide-${s.activeTown!.id}`);
    const heroe = s.myHeroes()[0]!;
    s.moveHeroTo(heroe.id, s.activeTown!.at);
    expect(s.vistaDeLaBase()!.caminante).toMatchObject({ id: heroe.id, nombre: heroe.name });
  });

  it('un clic en el ayuntamiento lleva a su puerta y, al llegar, abre «Ampliar» (en menos de 1,5 s)', () => {
    const { s, escena, d } = enLaBase();
    expect(escena.marca).toBe('quieto');
    expect(escena.posicion).toEqual(d.entrada);
    pulsar(escena, laPuerta(d, 'hall'), 0);
    expect(escena.marca).toBe('andando');
    expect(escena.abierto).toBeNull();
    escena.actualizar(1500);
    expect(escena.abierto).toEqual({ tipo: 'ampliar' });
    expect(escena.posicion).toEqual(d.sitios.hall.puerta);
    // Y el panel lista lo construible con su coste o su motivo.
    const panel = marcadoDe(renderSide(s, false, escena.abierto));
    expect(panel).toContain('Ampliar');
    expect(panel).toContain('data-action="build" data-building="town_hall"');
    expect(panel).toContain('data-building="castle"');
    // Lo que no se puede lleva el motivo del núcleo (`buildBlocker`).
    expect(panel).toContain('falta construir &quot;Morada de nivel 2&quot;');
    // Construir lo hace aparecer en su sitio: el castillo, en el del fuerte.
    expect(s.vistaDeLaBase()!.edificios.map((e) => e.sitio)).not.toContain('fort');
    s.build('castle');
    expect(s.vistaDeLaBase()!.edificios).toContainEqual(
      expect.objectContaining({ sitio: 'fort', edificio: 'castle' }),
    );
    expect(marcadoDe(renderSide(s, false, escena.abierto))).toContain('ya se ha construido hoy');
  });

  it('una morada abre su reclutamiento al llegar a su puerta: «+1» y «Todo» con lo que calcula el núcleo', () => {
    const { s, escena, d } = enLaBase();
    pulsar(escena, laPuerta(d, 'lvl1'), 0);
    escena.actualizar(10_000);
    expect(escena.abierto).toEqual({ tipo: 'sitio', sitio: 'lvl1' });
    expect(escena.posicion).toEqual(d.sitios.lvl1.puerta);
    const recluta = s.vistaDeLaBase()!.faccion === 'knight' ? 'peasant' : 'skeleton';
    const plan = s.recruitPlan(recluta)!;
    // El primer día la guarnición está llena (20 de 20): no cabe ni uno, y los
    // dos botones salen apagados con la frase del núcleo (QA, H9).
    expect(plan.maximo).toBe(0);
    const motivo = s.motivoParaNoReclutar(recluta)!;
    expect(motivo).toMatch(/no cabe|liderazgo/);
    const lleno = marcadoDe(renderSide(s, false, escena.abierto));
    expect(lleno).toContain(
      `data-action="recruit" data-creature="${recluta}" data-todo="no" disabled title="${motivo}">+1</button>`,
    );
    expect(lleno).toContain(
      `data-todo="si" class="primary" disabled title="${motivo}">Todo (0)</button>`,
    );
    // Con sitio, encendidos y con lo que calcula el núcleo.
    s.activeTown!.garrison = [];
    const conSitio = s.recruitPlan(recluta)!;
    expect(conSitio.maximo).toBeGreaterThan(0);
    expect(s.motivoParaNoReclutar(recluta)).toBeNull();
    const panel = marcadoDe(renderSide(s, false, escena.abierto));
    expect(panel).toContain(
      `data-action="recruit" data-creature="${recluta}" data-todo="no"  title="Reclutar uno">+1</button>`,
    );
    expect(panel).toContain(`data-todo="si" class="primary"  title=`);
    expect(panel).toContain(`>Todo (${conSitio.maximo})</button>`);
  });

  it('«Construir» sale apagado, con el motivo de `buildBlocker` en el título, cuando no se puede', () => {
    const { s, escena, d } = enLaBase();
    pulsar(escena, laPuerta(d, 'hall'), 0);
    escena.actualizar(10_000);
    const boton = (panel: string, id: string) =>
      panel.match(new RegExp(`<button data-action="build" data-building="${id}"[^>]*>`))?.[0];
    const antes = marcadoDe(renderSide(s, false, escena.abierto));
    expect(boton(antes, 'castle')).not.toContain('disabled');
    expect(boton(antes, 'knight_dwelling_3')).toContain('disabled title="falta construir');
    s.build('castle');
    const despues = marcadoDe(renderSide(s, false, escena.abierto));
    expect(boton(despues, 'town_hall')).toContain('disabled title="ya se ha construido hoy');
  });

  it('el mercado no enseña referencias internas a quien juega', () => {
    const { s, escena } = enLaBase();
    s.build('marketplace');
    escena.irA('market', 0);
    const panel = marcadoDe(renderSide(s, false, escena.abierto));
    expect(panel).toContain('El mercado aún no hace nada');
    expect(panel).not.toMatch(/#\d/);
  });

  it('la lista de edificios lleva a la puerta del pulsado: cámara y caminante allí, y su panel abierto', () => {
    const { s, escena, d } = enLaBase();
    s.build('castle');
    const panel = marcadoDe(renderSide(s, false, escena.abierto));
    // De izquierda a derecha en la plaza, solo lo construido.
    const enLaLista = [...panel.matchAll(/data-action="ir-a-sitio" data-sitio="(\w+)"/g)].map(
      (m) => m[1],
    );
    const construidos = s.vistaDeLaBase()!.edificios.map((e) => e.sitio);
    expect([...enLaLista].sort()).toEqual([...construidos].sort());
    const xs = enLaLista.map((x) => d.sitios[x as 'hall'].puerta.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    // La morada, lejos de la entrada: no se ve desde ella.
    const lienzo = { ancho: 1086, alto: 778 };
    escena.irA('lvl1', 0);
    expect(escena.abierto).toEqual({ tipo: 'sitio', sitio: 'lvl1' });
    expect(escena.posicion).toEqual(d.sitios.lvl1.puerta);
    expect(escena.camara()).toEqual(
      camaraDeLaBase(lienzo, camaraQuieta(d, lienzo, d.sitios.lvl1.puerta.x)),
    );
    expect(camaraQuieta(d, lienzo, d.sitios.lvl1.puerta.x)).not.toBe(
      camaraQuieta(d, lienzo, d.entrada.x),
    );
    expect(escena.marca).toBe('sitio:lvl1');
    // El ayuntamiento y el castillo abren «Ampliar».
    escena.irA('fort', 0);
    expect(escena.abierto).toEqual({ tipo: 'ampliar' });
    expect(escena.posicion).toEqual(d.sitios.fort.puerta);
    // Se sigue paseando: un clic en el suelo cierra lo abierto y echa a andar.
    pulsar(escena, elPunto({ x: d.sitios.fort.puerta.x + 1, y: 2 }), 100);
    expect(escena.abierto).toBeNull();
    expect(escena.marca).toBe('andando');
    // Lo que no está construido no está en la lista, y pedirlo lanza diciéndolo.
    expect(() => escena.irA('lvl6', 0)).toThrow(/no hay nada construido/);
  });

  it('al volver a abrir la base, quien camina está en la entrada y no hay nada abierto (QA, H2)', () => {
    const { s, escena, d } = enLaBase();
    pulsar(escena, laPuerta(d, 'lvl1'), 0);
    escena.actualizar(10_000);
    expect(escena.abierto).toEqual({ tipo: 'sitio', sitio: 'lvl1' });
    const town = s.activeTown!.id;
    s.closeTown();
    s.openTown(town);
    expect(escena.abierto).toBeNull();
    expect(escena.posicion).toEqual(d.entrada);
    expect(escena.marca).toBe('quieto');
  });

  it('la barra dice lo de la base, no lo del mapa (QA, H4)', () => {
    const { s, escena, d } = enLaBase();
    expect(s.status).toBe(AYUDA_DE_LA_BASE);
    // El ratón encima de un edificio lo nombra; pulsado, vuelve la ayuda.
    const q = laPuerta(d, 'hall')(escena.camara()!);
    expect(escena.mover(q.x, q.y)).toBe(true);
    expect(s.status).toMatch(/^Ayuntamiento: pulsa/);
    escena.pulsar(q.x, q.y, 0);
    expect(s.status).toBe(AYUDA_DE_LA_BASE);
    s.closeTown();
    expect(s.status).toBe('');
  });

  it('sin arte, el marcador va de una vez por cada racha de tramos seguidos sin placa (QA, H10)', () => {
    const { d } = enLaBase();
    const sinNada = Array.from({ length: d.tramos }, () => null);
    expect(rachasSinArte(d, sinNada)).toEqual([{ x0: 0, x1: d.ancho }]);
    const placa = {} as HTMLImageElement;
    const conLaTercera = sinNada.map((_, i) => (i === 2 ? placa : null));
    const rachas = rachasSinArte(d, conLaTercera);
    expect(rachas).toHaveLength(2);
    expect(rachas[0]!.x0).toBe(0);
    expect(rachas[1]!.x1).toBe(d.ancho);
    expect(rachas[0]!.x1).toBeLessThan(rachas[1]!.x0);
  });

  it('un vecino abre la conversación con su nombre y su línea, y el suelo la cierra', () => {
    const { s, escena, d } = enLaBase();
    const [id, v] = Object.entries(d.vecinos)[0]!;
    pulsar(
      escena,
      (t) => {
        const c = cajaDeFiguraEn(t, v.en);
        return { x: c.x, y: c.suelo - c.alto / 2 };
      },
      0,
    );
    escena.actualizar(10_000);
    expect(escena.abierto).toEqual({ tipo: 'pnj', id: `vecino-${id}` });
    const persona = s.vistaDeLaBase()!.gente.find((p) => p.id === `vecino-${id}`)!;
    const dialogo = marcadoDe(renderConversacion(s, `vecino-${id}`));
    expect(dialogo).toContain(persona.nombre);
    expect(dialogo).toContain(`«${persona.linea}»`);
    // Un clic en el suelo cierra lo abierto y echa a andar.
    pulsar(escena, elPunto(d.entrada), 10_000);
    expect(escena.abierto).toBeNull();
    escena.actualizar(20_000);
    expect(escena.marca).toBe('quieto');
  });

  it('un clic sobre la plaza, en un sitio vacío, deja a la figura en el borde de atrás frente a él', () => {
    const { s, escena, d } = enLaBase();
    expect(s.vistaDeLaBase()!.edificios.map((e) => e.sitio)).not.toContain('lvl2');
    const sitio = d.sitios.lvl2;
    pulsar(escena, elPunto({ x: sitio.umbral.en.x, y: sitio.umbral.en.y - 0.5 }), 0);
    escena.actualizar(10_000);
    expect(escena.abierto).toBeNull();
    expect(escena.posicion.y).toBeCloseTo(bordeDeAtras(d, escena.posicion.x), 9);
    expect(escena.posicion.x).toBeCloseTo(sitio.umbral.en.x);
  });

  it('un clic fuera de la franja, por delante, lleva al punto más cercano dentro', () => {
    const { escena, d } = enLaBase();
    pulsar(escena, elPunto({ x: d.entrada.x + 1, y: 9 }), 0);
    escena.actualizar(10_000);
    expect(enLaFranja(d, escena.posicion)).toBe(true);
    expect(escena.posicion.x).toBeCloseTo(d.entrada.x + 1);
  });

  it('profundidad: toda figura va delante de todo edificio, y el edificio más hondo primero', () => {
    const { s, d } = enLaBase();
    s.build('castle');
    const vista = s.vistaDeLaBase()!;
    // Con todos los sitios levantados, también los de los extremos.
    const todos = {
      ...vista,
      edificios: [
        ...vista.edificios,
        { sitio: 'lvl6' as const, edificio: 'knight_dwelling_6', nombre: 'Capilla' },
        { sitio: 'lvl5' as const, edificio: 'knight_dwelling_5', nombre: 'Establos' },
      ],
    };
    for (const en of [
      d.sitios.hall.puerta,
      d.sitios.lvl6.puerta,
      d.sitios.lvl5.puerta,
      d.entrada,
    ]) {
      const lista = componerBase(d, todos, { en, mira: 'S', clip: 'idle', tiempo: 0 }, 0);
      const ultimoEdificio = lista.map((e) => e.tipo).lastIndexOf('edificio');
      const primeraFigura = lista.findIndex((e) => e.tipo === 'figura');
      expect(ultimoEdificio).toBeLessThan(primeraFigura);
      const pies = lista.flatMap((e) => (e.tipo === 'edificio' ? [e.pie] : []));
      expect(pies).toEqual([...pies].sort((a, b) => a - b));
      // El pie del edificio, en la franja o detrás: nunca delante de quien está en su puerta.
      for (const e of lista) if (e.tipo === 'edificio') expect(e.pie).toBeLessThan(en.y + 1);
    }
  });

  it('la gente de la base se pinta sin armas; quien camina, con su cuerpo', () => {
    const { s, d } = enLaBase();
    const vista = s.vistaDeLaBase()!;
    const lista = componerBase(d, vista, { en: d.entrada, mira: 'N', clip: 'idle', tiempo: 0 }, 0);
    const figuras = lista.flatMap((e) => (e.tipo === 'figura' ? [e] : []));
    expect(figuras.filter((f) => f.pnj).length).toBeGreaterThan(0);
    for (const f of figuras) {
      expect(f.cuerpo, f.id).toBe(f.pnj ? CUERPO_DE_VECINO : vista.caminante.cuerpo);
    }
  });

  it('un sitio sin construir no pinta nada: solo los edificios levantados entran en la escena', () => {
    const { s, d } = enLaBase();
    const vista = s.vistaDeLaBase()!;
    const lista = componerBase(d, vista, { en: d.entrada, mira: 'N', clip: 'idle', tiempo: 0 }, 0);
    expect(
      lista.filter((e) => e.tipo === 'edificio').map((e) => (e as { sitio: string }).sitio),
    ).toEqual(expect.arrayContaining(['hall', 'lvl1']));
    expect(lista.filter((e) => e.tipo === 'edificio')).toHaveLength(2);
  });
});
