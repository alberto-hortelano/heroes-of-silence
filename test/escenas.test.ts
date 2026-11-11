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
import { DURACION } from '../src/client/batalla/anim.js';
import { EscenaBatalla } from '../src/client/batalla/escena.js';
import { GestosDeBatalla, type PaginaDeLaBatalla } from '../src/client/batalla/gestos.js';
import { barraDeLaBatalla } from '../src/client/batalla/panel.js';
import { marcadoDe } from '../src/client/comun/html.js';
import { EscenaBase } from '../src/client/partida/base/escena.js';
import { renderConversacion } from '../src/client/partida/base/panel.js';
import { PAUSA_TRAS_EL_RIVAL, PuertaDeFinDeTurno } from '../src/client/partida/fin-de-turno.js';
import { renderDefensa, renderGuarnicion } from '../src/client/partida/guarnicion.js';
import { EscenaAventura, focoDe, llegadaDeLaRuta } from '../src/client/partida/mapa/escena.js';
import { renderActions, renderSide } from '../src/client/partida/paneles.js';
import { repartirClic } from '../src/client/partida/reparto-del-clic.js';
import { camaraDeLaBase, camaraQuieta } from '../src/client/render/base/camara.js';
import { componerBase } from '../src/client/render/base/escena.js';
import { dondeEsperaEnLaMorada } from '../src/client/render/base/fila.js';
import { rachasSinArte } from '../src/client/render/base/pintar.js';
import { dondePulsarElSitio } from '../src/client/render/base/recortes.js';
import { bandosSinDueño, COLOR_BANDO, colorDelBando } from '../src/client/render/batalla/bandos.js';
import { bordeDeLasCasillas } from '../src/client/render/batalla/disparos.js';
import {
  cajaDeCorona,
  cajaDeFigura,
  cajaDeNombre,
  pintarCorona,
  pintarSobreLaCabeza,
} from '../src/client/render/batalla/figura.js';
import type { EstadoFigura } from '../src/client/render/batalla/tablero.js';
import { PIES } from '../src/client/render/escenario/figuras-del-mapa.js';
import type { Volumen } from '../src/client/render/escenario/pintar.js';
import { cajaDeFiguraEn } from '../src/client/render/figuras/caja.js';
import { CUERPO_DE_VECINO } from '../src/client/render/figuras/cuerpo-de-gente.js';
import { msPorCasilla } from '../src/client/render/figuras/marcha.js';
import { casillaAPixel, centrarEn, TILE_INICIAL } from '../src/client/render/mapa/camara.js';
import {
  asientoDeLaInicial,
  type CuerpoDeFigura,
  SITIOS_DE_LA_INICIAL,
} from '../src/client/render/mapa/rotulos.js';
import { pasosAPintar } from '../src/client/render/mapa/ruta.js';
import { fundirPorProfundidad } from '../src/client/render/mapa/volumenes.js';
import { COLOR_SIN_DUEÑO, MARCA_DE_COMANDANTE, playerColor } from '../src/client/render/palette.js';
import {
  centroDeStack,
  centroHex,
  enPantalla,
  type Tablero,
  tableroPara,
} from '../src/client/render/proyeccion.js';
import { Session } from '../src/client/sesion/partida.js';
import { SesionDeArena } from '../src/client/sesion/sesion-de-arena.js';
import { marcaDeComandante } from '../src/client/views/campo.js';
import { AVISO_DE_ESPERA } from '../src/client/views/cifras.js';
import { heroePorDefecto } from '../src/core/arena/heroe.js';
import { apuntarBlocker, lanzarBlocker } from '../src/core/battle/a-distancia.js';
import { areAdjacent, hexDistance, isInside, neighbours } from '../src/core/battle/board.js';
import { isAlive, SIN_CARGAS, stackById, stackHexes } from '../src/core/battle/consultas.js';
import { alcanceDeLaGranada } from '../src/core/battle/granada.js';
import { SIN_MURALLA } from '../src/core/battle/muralla.js';
import type { BattleStack, Side } from '../src/core/battle/types.js';
import { COMBATE_COMPLETO } from '../src/core/combate.js';
import { EQUIPO_DEL_JUEGO } from '../src/core/equipo/atado.js';
import type { Pieza } from '../src/core/equipo/pieza.js';
import { Casillas } from '../src/core/map/casillas.js';
import { DESPEJADO } from '../src/core/state/clima.js';
import { baseOf, heroesOf } from '../src/core/state/consultas.js';
import { faccionesDeLaSemilla } from '../src/core/state/setup.js';
import { dueñoDeLaCiudad } from '../src/core/state/sitios.js';
import { building } from '../src/core/town/buildings.js';
import type { Hex } from '../src/core/types.js';
import type { Unidad } from '../src/core/unidad/formato.js';
import { ALTO_DE_FIGURA, type Plano } from '../src/shared/arte.js';
import { bordeDeAtras, type Disposicion, disposicionDe, enLaFranja } from '../src/shared/base.js';
import { primeraSemillaCon } from '../tools/comun/semillas.js';
import {
  destinoDeHoy,
  empezarTalCual,
  enElCampo,
  escenaDeBatalla,
  sesionContraMonstruo,
  sesionDeArena,
  unoDeLaRueda,
} from './batalla-de-cliente.js';
import { agresiva, MANOS_DE_PRUEBA } from './batalla-de-prueba.js';
import { PESADA, TROPA_BARATA } from './comun.js';
import { hojasDeLaArena } from './hojas-de-la-arena.js';
import { anteLaBase, ejercito, fueraDeSuBase, guarnecer, pegadoA } from './partida-de-prueba.js';
import { catalogoCon, unidadDeArena } from './pelea-de-arena.js';

/**
 * Una batalla en la que la persona ATACA a un monstruo: la busca
 * `sesionContraMonstruo`, porque las semillas escritas a mano —la 2 en (12,3),
 * la 35 en (8,9)— las rompía cada cambio del generador.
 */
function sesionEnBatalla(): Session {
  return sesionContraMonstruo();
}

/**
 * Mueve la unidad activa un tramo y devuelve lo que tarda en contarse, en ms:
 * a partir de ahí la cola tiene algo dentro.
 */
function jugarUnTramo(s: Session): number {
  const antes = s.battle!.log.length;
  // Un tirador empieza en «A distancia», que no anda: el tramo es de «Cuerpo a cuerpo».
  if (s.arma.modo === 'distancia') s.arma.elegir('cuerpo');
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
      dura += e.path.length * msPorCasilla(quien.body, 'walk', ALTO_DE_FIGURA);
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
    // s3: en la 2, desde el recinto de las ciudades (vuelta 3), el héroe del
    // rival llega a la base de la persona el día 2 y el turno espera su defensa.
    const s = new Session(3);
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
    // Con los ríos (#144) el primer caso cruza la región de unos asaltantes y
    // la barra lo avisa delante: lo de la niebla va al final, una vez.
    expect(s.status).toMatch(
      /(^|· )Tierras desconocidas · hoy andas \d+ de los \d+ pasos? que se ven\.$/,
    );
    expect(s.status.toLowerCase().split('tierras desconocidas')).toHaveLength(2);
  });

  it('pulsar la casilla del propio héroe dice algo verdadero, no «No hay camino»', () => {
    const s = new Session(2);
    // Fuera de su base, donde nace (19-10-2026): pulsarlo ahí es entrar en ella.
    const heroe = fueraDeSuBase(s.state, 0);
    s.clickTile(heroe.at);
    expect(s.status).not.toContain('No hay camino');
    expect(s.status).toBe(`${heroe.name} ya está en esa casilla: pulsa otra para moverlo.`);
    expect(s.selectedHero!.movePoints).toBe(heroe.movePoints);
  });
});

describe('la ruta avisa de la emboscada (H2)', () => {
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

/**
 * Una muestra de los botones de la partida (`data-action`) para el reparto del clic:
 * los que ya no contaban el segundo clic de un doble clic (`DE_UN_SOLO_CLIC`, hasta el
 * 07-11-2026), los que lo contaban —el que sigue a «Resolver sola» en el mapa, «+1» de la
 * morada, «Comprar» de la armería, el zoom…— y los de la batalla que comparte con la arena.
 */
const BOTONES_DE_MUESTRA = [
  'lugar-ir',
  'lugar-al-principio',
  'lugar-opcion',
  'tropa-poner',
  'tropa-quitar',
  'ir-a-sitio',
  'hire-hero',
  'mejorar-el-puesto',
  'battle-surrender',
  'auto-battle',
  'end-turn',
  'end-turn-confirm',
  'recruit',
  'buy-item',
  'build',
  'dismiss',
  'select-item',
  'equip',
  'unequip',
  'next-hero',
  'sleep-hero',
  'toggle-fog',
  'zoom-in',
  'zoom-out',
  'confirmar-reparto',
  'defensa-confirmar',
  'aviso-defender',
  'aviso-resolver-sola',
  'battle-end-turn',
  'battle-spell',
  'battle-poder',
  'battle-arma',
  'battle-muralla',
  'despliegue-elegir',
  'desplegado',
] as const;

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

  it('«Ver al enemigo» se atiende antes de preguntar si la jugada sigue, y no pone el aviso; «Continuar», ya no (#158 d, #341)', () => {
    // Lo que hace \`clic.ts\` con un clic en un botón. Preguntar por la jugada en curso ya
    // escribe el aviso de espera, así que mirar al enemigo no puede pasar por ahí.
    let preguntas = 0;
    const enCurso = () => {
      preguntas++;
      return true;
    };
    expect(repartirClic('ver-enemigo', enCurso)).toBe('mirar');
    expect(preguntas).toBe(0);
    // Los demás botones sí esperan a la jugada. «Continuar» también desde #341: solo sale
    // con el tablero quieto (\`finalALaVista\`), así que nunca la encuentra en curso, y si
    // la encontrara sería un clic de antes del fotograma que lo quita.
    expect(repartirClic('auto-battle', enCurso)).toBe('nada');
    expect(repartirClic('finish-battle', enCurso)).toBe('nada');
    expect(preguntas).toBe(2);
    expect(repartirClic('auto-battle', () => false)).toBe('gesto');
    expect(repartirClic('finish-battle', () => false)).toBe('gesto');
    expect(repartirClic(null, () => false)).toBe('nada');
  });

  it('el segundo clic de un doble clic no cuenta en ningún botón de la partida, caiga donde caiga, y se mira antes que nada (decisión del usuario, 07-11-2026)', () => {
    // «Ningún botón cuenta»: el repintado llega entre los dos clics de una persona y el
    // segundo caía en lo que había pintado el primero —en «Fin de turno» tras «Resolver
    // sola», que pasaba el día; en otro «+1»; en otro «Comprar»—. Hasta ese día era una
    // lista de los botones que no lo contaban (`DE_UN_SOLO_CLIC`), y se quedaba corta.
    let preguntas = 0;
    const libre = () => {
      preguntas++;
      return false;
    };
    for (const accion of BOTONES_DE_MUESTRA) {
      expect(repartirClic(accion, libre, 2), accion).toBe('nada');
    }
    // También «Ver al enemigo», que se atiende antes que la jugada en curso, y «Continuar».
    expect(repartirClic('ver-enemigo', libre, 2)).toBe('nada');
    expect(repartirClic('finish-battle', libre, 2)).toBe('nada');
    // Y sin preguntar por la jugada, que ya pondría el aviso de espera en la barra: un
    // segundo clic que no cuenta no hace nada.
    expect(preguntas).toBe(0);
  });

  it('el segundo clic cuenta solo en los que suman de uno en uno y se confirman al final; con un clic, todo como antes', () => {
    // «Dejar ›» y «‹ Recoger» de la guarnición y «−» y «+» de la defensa: solo editan lo
    // que se ve hasta «Confirmar» o «Defender», y un doble clic mueve dos (H-V2-1 del QA).
    for (const accion of ['mover-en-el-reparto', 'defensa-menos', 'defensa-mas']) {
      expect(
        repartirClic(accion, () => false, 2),
        accion,
      ).toBe('gesto');
      expect(
        repartirClic(accion, () => false, 3),
        accion,
      ).toBe('gesto');
      // La jugada en curso los frena, como a todos.
      expect(
        repartirClic(accion, () => true, 2),
        accion,
      ).toBe('nada');
    }
    // Con un clic (y con el de un teclado, `detail` 0), cada botón lo suyo.
    for (const clics of [1, 0]) {
      for (const accion of BOTONES_DE_MUESTRA) {
        expect(
          repartirClic(accion, () => false, clics),
          accion,
        ).toBe('gesto');
      }
      expect(repartirClic('ver-enemigo', () => true, clics)).toBe('mirar');
      expect(repartirClic('finish-battle', () => false, clics)).toBe('gesto');
      expect(repartirClic(null, () => false, clics)).toBe('nada');
    }
  });

  it('los que cuentan cada clic son «Dejar ›» y «‹ Recoger» de la guarnición y «−» y «+» de la defensa, y ningún otro de sus pantallas', async () => {
    // La lista de `reparto-del-clic.ts` dice acciones; lo que la persona pulsa son botones.
    // Si uno de estos cambiara su `data-action`, su doble clic dejaría de mover dos sin
    // que nada lo dijera.
    const botones = (m: string) =>
      [...m.matchAll(/<button data-action="([^"]+)"[^>]*>([^<]*)<\/button>/g)].map(
        ([, accion, texto]) => ({ accion: accion as string, texto: (texto as string).trim() }),
      );
    const cuentan = (m: string): string[] => [
      ...new Set(
        botones(m)
          .filter((b) => repartirClic(b.accion, () => false, 2) === 'gesto')
          .map((b) => b.texto),
      ),
    ];
    const noCuentan = (m: string): string[] =>
      botones(m)
        .filter((b) => repartirClic(b.accion, () => false, 2) === 'nada')
        .map((b) => b.texto);
    // La guarnición de la base, con el héroe de salida dentro (y la guarnición con que nace
    // la base) y uno ya dejado: Cancelar y Confirmar a la vista.
    const s = new Session(7);
    const heroe = s.myHeroes()[0]!;
    s.abrirLaGuarnicion(heroe.id);
    s.moverEnElReparto('guarnicion', heroe.army[0]!.creature);
    const guarnicion = marcadoDe(renderGuarnicion(s.vistaDeLaGuarnicion()!));
    expect(cuentan(guarnicion).sort()).toEqual(['Dejar ›', '‹ Recoger']);
    expect(noCuentan(guarnicion).sort()).toEqual(['Cancelar', 'Confirmar']);
    // La defensa: atacado en su base con guarnición (la receta de `guarniciones.test.ts`).
    const d = new Session(37);
    const base = baseOf(d.state, 0)!;
    const mio = heroesOf(d.state, 0)[0]!;
    mio.at = { ...base.at };
    mio.army = ejercito({ creature: TROPA_BARATA, count: 1 });
    guarnecer(d.state, base, ejercito({ creature: TROPA_BARATA, count: 3 }));
    const rival = heroesOf(d.state, 1)[0]!;
    rival.at = pegadoA(d.state, base.at);
    rival.army = ejercito({ creature: PESADA, count: 6 });
    rival.movePoints = 100_000;
    let defensa = '';
    d.alCambiarSinGesto = () => {
      if (d.avisoDelAtaque !== null) d.defenderElAtaque();
      const v = d.defensa;
      if (v !== null && defensa === '') {
        defensa = marcadoDe(renderDefensa(v));
        d.dejarLaDefensaDeLaIA();
      }
      if (d.battle !== null && d.defensa === null && d.ruedaPendiente === null) {
        d.autoResolveBattle();
      }
    };
    for (let n = 0; n < 4 && defensa === '' && d.state.finished === null; n++) await d.endTurn();
    expect(cuentan(defensa).sort()).toEqual(['+', '−']);
    expect(noCuentan(defensa).sort()).toEqual(['Como propone la IA', 'Defender']);
  });

  it('con la jugada contándose, el lateral es el de antes, entero y apagado, y no pide un segundo clic (#165, #257)', () => {
    const s = sesionEnBatalla();
    const escena = escenaDeBatalla(() => s);
    expect(escena.ocupada).toBe(false);
    // Lo que hace `main.ts` con el tablero quieto, antes de la jugada.
    const quieto = marcadoDe(renderSide(s, escena.ocupada));
    expect(quieto).not.toContain('fieldset');
    const dura = jugarUnTramo(s);
    escena.sincronizar(10);
    expect(escena.ocupada).toBe(true);
    // Tras un tramo la unidad sigue siendo tuya: el panel de ahora ofrecería sus botones.
    expect(s.turnoPropio).not.toBeNull();

    // Contando, el de antes byte a byte dentro de un solo `fieldset` apagado: ni «En el
    // campo», ni el parte, ni la ronda, ni lo que le queda a la activa tras el tramo.
    const contando = marcadoDe(renderSide(s, escena.ocupada));
    expect(contando).toBe(
      `<fieldset class="contando" disabled title="${AVISO_DE_ESPERA}">${quieto}</fieldset>`,
    );
    // Los botones del lado están dentro: ninguno queda encendido fuera.
    for (const accion of ['battle-end-turn', 'battle-surrender']) {
      expect(contando).toContain(`data-action="${accion}"`);
    }
    expect(marcadoDe(renderActions(s, escena.ocupada))).toMatch(
      /<fieldset class="contando" disabled[^>]*><button data-action="auto-battle">/,
    );

    // Contada la jugada, los paneles de ahora y sin apagar.
    escena.sincronizar(10 + dura + 1000);
    expect(escena.ocupada).toBe(false);
    const despues = marcadoDe(renderSide(s, escena.ocupada));
    expect(despues).not.toContain('fieldset');
    expect(despues).not.toBe(quieto);
    expect(marcadoDe(renderActions(s, escena.ocupada))).not.toContain('fieldset');
  });

  it('sin nada pintado quieto de esa batalla, el lateral contando calla; otra batalla no hereda lo de la anterior (#257)', () => {
    const s = sesionEnBatalla();
    renderSide(s, false);
    jugarUnTramo(s);
    // Otra sesión, otra batalla, que nunca se pintó quieta.
    const otra = sesionEnBatalla();
    const callado = marcadoDe(renderSide(otra, true));
    expect(callado).toContain('Contando la jugada…');
    expect(callado).not.toContain('<button');
    expect(callado).not.toContain('En el campo');
    // La primera sigue con lo suyo.
    expect(marcadoDe(renderSide(s, true))).toMatch(/^<fieldset class="contando"/);
  });

  it('el final no se adelanta: mientras se cuenta el golpe que decide, ni «Victoria» ni «Derrota» ni «La batalla ha terminado.» (#257)', () => {
    const s = sesionEnBatalla();
    const escena = escenaDeBatalla(() => s);
    // Lo que pinta `main.ts` antes de cada jugada de la persona: el tablero quieto.
    let quieto = '';
    for (let i = 0; i < 500 && s.battle!.finished === null; i++) {
      quieto = marcadoDe(renderSide(s, false));
      // La rueda del golpe, si espera a la persona (F5): Normal.
      if (s.ruedaPendiente !== null) s.elegirEnLaRueda('normal');
      else s.playBattleAction(agresiva(s.battle!));
    }
    expect(s.battle!.finished).not.toBeNull();
    escena.sincronizar(10);
    expect(escena.ocupada).toBe(true);
    const contando = marcadoDe(renderSide(s, escena.ocupada));
    expect(contando).not.toMatch(/Victoria|Derrota/);
    expect(contando).toBe(
      `<fieldset class="contando" disabled title="${AVISO_DE_ESPERA}">${quieto}</fieldset>`,
    );
    expect(barraDeLaBatalla(s.status, s.batallaALaVista, escena.ocupada)).not.toContain(
      'terminado',
    );

    // Contado el último golpe, el final.
    escena.sincronizar(100_000_000);
    expect(escena.ocupada).toBe(false);
    expect(marcadoDe(renderSide(s, escena.ocupada))).toMatch(/<h2>(Victoria|Derrota)<\/h2>/);
    expect(barraDeLaBatalla(s.status, s.batallaALaVista, escena.ocupada)).toBe(s.status);
  });

  it('la barra de la batalla no dice el final mientras se cuenta, pero sí el aviso de espera (#257, H4 de QA)', () => {
    const s = sesionEnBatalla();
    const viva = s.batallaALaVista!;
    const acabada = { ...viva, finished: { winner: 'attacker' as const } };
    const fin = 'La batalla ha terminado.';
    expect(barraDeLaBatalla(fin, acabada, true)).toBe('');
    expect(barraDeLaBatalla(AVISO_DE_ESPERA, acabada, true)).toBe(AVISO_DE_ESPERA);
    expect(barraDeLaBatalla(fin, acabada, false)).toBe(fin);
    // Sin acabar, la barra tal cual también contando: lo que dice es de la jugada propia.
    expect(barraDeLaBatalla('Escudero anda.', viva, true)).toBe('Escudero anda.');
    expect(barraDeLaBatalla('En el mapa.', null, true)).toBe('En el mapa.');
  });

  it('«Continuar» no sale mientras se cuenta el golpe que decide: la barra sigue con lo de antes, apagado, y sale con «Victoria» o «Derrota» (#341)', () => {
    // Hasta #341 salía en cuanto el estado traía el final, con el último golpe aún
    // contándose, y su clic esperaba a la cola (#158 d): era lo único de la partida que
    // adelantaba el final desde #257.
    const s = sesionEnBatalla();
    const escena = escenaDeBatalla(() => s);
    // La barra que pinta `main.ts` antes de cada jugada de la persona: el tablero quieto.
    let antes = '';
    for (let i = 0; i < 500 && s.battle!.finished === null; i++) {
      antes = marcadoDe(renderActions(s, false));
      // La rueda del golpe, si espera a la persona (F5): Normal.
      if (s.ruedaPendiente !== null) s.elegirEnLaRueda('normal');
      else s.playBattleAction(agresiva(s.battle!));
    }
    expect(s.battle!.finished).not.toBeNull();
    escena.sincronizar(10);
    expect(escena.ocupada).toBe(true);
    const contando = marcadoDe(renderActions(s, escena.ocupada));
    expect(contando).not.toContain('finish-battle');
    expect(contando).not.toContain('Continuar');
    // Lo de antes de la jugada, con los botones apagados en su sitio (#165): «Resolver
    // sola» dentro del `fieldset` del aviso de espera y la casilla de la rueda, fuera.
    expect(
      contando.endsWith(
        `<fieldset class="contando" disabled title="${AVISO_DE_ESPERA}"><button data-action="auto-battle">Resolver sola</button></fieldset>`,
      ),
    ).toBe(true);
    const sinApagar = (m: string) => m.replace(/<fieldset[^>]*>|<\/fieldset>/g, '');
    expect(sinApagar(contando)).toBe(sinApagar(antes));

    // Contado el último golpe, «Continuar» y el final del lateral, en el mismo fotograma.
    escena.sincronizar(100_000_000);
    expect(escena.ocupada).toBe(false);
    expect(marcadoDe(renderActions(s, escena.ocupada))).toBe(
      '<button data-action="finish-battle" class="primary">Continuar</button>',
    );
    expect(marcadoDe(renderSide(s, escena.ocupada))).toMatch(/<h2>(Victoria|Derrota)<\/h2>/);
  });

  it('fuera del centro, la caja de la figura sigue siendo de la figura', () => {
    const s = sesionEnBatalla();
    const escena = new EscenaBatalla(() => s);
    const t = tableroPara(1086, 778);
    escena.encuadrar(1086, 778);
    const enemigo = s.battle!.stacks.find((x) => isAlive(x) && x.side !== s.miBando)!;
    const k = cajaDeFigura(t, centroDeStack(stackHexes(enemigo)));
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

  it('el aviso del móvil no descuenta a un enemigo antes de verlo caer, ni se vacía con el final por contar (#257)', () => {
    const s = sesionEnBatalla();
    const escena = escenaDeBatalla(() => s);
    const enPie = (): number =>
      s
        .batallaALaVista!.stacks.filter((x) => x.side !== s.miBando)
        .reduce((n, x) => n + x.count, 0);
    // Un marco que no ve nada: los cuenta a todos, a la izquierda.
    const fuera = (): number => escena.enemigosFuera(2000, 2400).izquierda;
    const alEmpezar = enPie();
    expect(fuera()).toBe(alEmpezar);
    const jugar = (): void => {
      if (s.ruedaPendiente !== null) s.elegirEnLaRueda('normal');
      else s.playBattleAction(agresiva(s.battle!));
    };
    // Hasta que el estado ya traiga una baja enemiga sin haber acabado.
    for (let i = 0; i < 500 && enPie() === alEmpezar && s.battle!.finished === null; i++) jugar();
    expect(s.battle!.finished).toBeNull();
    expect(enPie()).toBeLessThan(alEmpezar);
    escena.sincronizar(10);
    expect(escena.ocupada).toBe(true);
    // El tablero aún no ha contado nada: se ven todos.
    expect(fuera()).toBe(alEmpezar);
    let t = 100_000_000;
    escena.sincronizar(t);
    expect(escena.ocupada).toBe(false);
    expect(fuera()).toBe(enPie());

    // Hasta el final: con el final por contar, los que se ven; contado, ninguno.
    const antesDelFinal = enPie();
    for (let i = 0; i < 500 && s.battle!.finished === null; i++) {
      // Cada jugada contada antes de la siguiente, salvo la última.
      t += 100_000_000;
      escena.sincronizar(t);
      jugar();
    }
    expect(s.battle!.finished).not.toBeNull();
    escena.sincronizar(t + 10);
    expect(escena.ocupada).toBe(true);
    expect(fuera()).toBeGreaterThan(0);
    expect(fuera()).toBeLessThanOrEqual(antesDelFinal);
    escena.sincronizar(t + 100_000_000);
    expect(escena.ocupada).toBe(false);
    expect(fuera()).toBe(0);
  });
});

/**
 * Un botón del panel para los gestos, sin DOM (`vitest` corre en `node`): lo que leen de
 * él, sus atributos y `closest`, que en el botón de la muralla da él mismo.
 */
function botonDePrueba(atributos: Readonly<Record<string, string>>): Element {
  const boton = {
    getAttribute: (nombre: string): string | null => atributos[nombre] ?? null,
    closest: () => boton,
  };
  return boton as unknown as Element;
}

/** Los gestos de una página sobre `sesion`, con el tablero quieto y la jugada contada. */
function gestosDe(
  sesion: PaginaDeLaBatalla['sesion'],
  jugadaEnCurso: () => boolean = () => false,
): GestosDeBatalla {
  return new GestosDeBatalla({
    sesion,
    escena: { mover: () => {}, pulsar: () => {}, salir: () => {} },
    jugadaEnCurso,
    pedirFotograma: () => {},
  });
}

/**
 * Juega «Terminar turno» con un clic (`gestos.clic`) hasta que tras él le toque a otra
 * unidad de la persona sin que la IA juegue entre medias —dos suyas seguidas—, y
 * devuelve la que tiene el turno; contesta la rueda si la IA la golpea.
 */
function hastaDosSuyasSeguidas(s: Session | SesionDeArena, gestos: GestosDeBatalla): string {
  const terminar = botonDePrueba({ 'data-action': 'battle-end-turn' });
  for (let i = 0; i < 80; i++) {
    const b = s.battle;
    if (b === null || b.finished !== null) break;
    if (s.ruedaPendiente !== null) {
      s.elegirEnLaRueda(unoDeLaRueda(b));
      continue;
    }
    const antes = s.turnoPropio;
    if (antes === null || b.turno === null)
      throw new Error('ni le toca a la persona ni espera la rueda');
    const n = b.turno.n;
    expect(gestos.clic('battle-end-turn', terminar, 1)).toBe(true);
    const ahora = s.turnoPropio;
    if (ahora !== null && b.turno?.n === n + 1 && ahora.stack.id !== antes.stack.id) {
      return ahora.stack.id;
    }
  }
  throw new Error('en ochenta turnos no le tocan dos unidades seguidas a la persona');
}

describe('los gestos de la batalla, los mismos en la partida y la arena (R3 de la reorganización)', () => {
  it('el segundo clic de un doble clic en «Terminar turno» no cierra el turno de la unidad tuya siguiente, en la partida', () => {
    // La regla M12 de la arena, también en la partida: allí solo la tenía «Listo», y un
    // doble clic en «Terminar turno» cerraba también el de la unidad suya que seguía.
    const s = sesionEnBatalla();
    const gestos = gestosDe(() => s);
    const siguiente = hastaDosSuyasSeguidas(s, gestos);
    const n = s.battle!.turno!.n;
    const largo = s.battle!.log.length;
    const terminar = botonDePrueba({ 'data-action': 'battle-end-turn' });
    // El segundo clic (`detail` 2): se atiende y no juega nada.
    expect(gestos.clic('battle-end-turn', terminar, 2)).toBe(true);
    expect(s.turnoPropio?.stack.id).toBe(siguiente);
    expect(s.battle!.turno!.n).toBe(n);
    expect(s.battle!.log.length).toBe(largo);
    // Un clic suelto, sí.
    expect(gestos.clic('battle-end-turn', terminar, 1)).toBe(true);
    expect(s.battle!.turno!.n).not.toBe(n);
  });

  it('y en la arena, como antes', () => {
    const pique = unidadDeArena('templario-escudo');
    const s = sesionDeArena(
      [
        { unidad: pique, ia: false },
        { unidad: pique, ia: false },
        { unidad: pique, ia: false },
      ],
      [{ unidad: pique, ia: true }],
      3,
    );
    empezarTalCual(s);
    const gestos = gestosDe(() => s);
    const siguiente = hastaDosSuyasSeguidas(s, gestos);
    const n = s.battle.turno!.n;
    expect(gestos.clic('battle-end-turn', botonDePrueba({}), 2)).toBe(true);
    expect(s.turnoPropio?.stack.id).toBe(siguiente);
    expect(s.battle.turno!.n).toBe(n);
  });

  it('poder, arma, muralla, el hechizo y «Listo» tampoco juegan el segundo clic; elegir a quién se coloca, sí', () => {
    const hecho: string[] = [];
    const apunta = (que: string) => () => {
      hecho.push(que);
    };
    const sesion = {
      playBattleAction: apunta('terminar'),
      hechizos: { selectSpell: apunta('hechizo') },
      poderes: { usar: apunta('poder') },
      arma: { elegir: apunta('arma') },
      muralla: { elegir: apunta('muralla') },
      despliegue: { elegir: apunta('colocar'), listo: apunta('listo') },
    } as unknown as SesionDeArena;
    const boton = botonDePrueba({
      'data-spell': 'magic_arrow',
      'data-poder': 'curar',
      'data-arma': 'distancia',
      'data-jugada': 'subir',
      'data-stack': 'attacker-0',
    });
    const gestos = gestosDe(() => sesion);
    for (const accion of [
      'battle-end-turn',
      'battle-spell',
      'battle-poder',
      'battle-arma',
      'battle-muralla',
      'desplegado',
    ]) {
      expect(gestos.clic(accion, boton, 2), accion).toBe(true);
    }
    expect(hecho).toEqual([]);
    expect(gestos.clic('despliegue-elegir', boton, 2)).toBe(true);
    expect(hecho).toEqual(['colocar']);
    // Con un clic, cada uno lo suyo.
    hecho.length = 0;
    for (const accion of [
      'battle-end-turn',
      'battle-spell',
      'battle-poder',
      'battle-arma',
      'battle-muralla',
      'desplegado',
    ]) {
      gestos.clic(accion, boton, 1);
    }
    expect(hecho).toEqual(['terminar', 'hechizo', 'poder', 'arma', 'muralla', 'listo']);
    // Lo que no es de la batalla sigue a la página; y mientras se cuenta, nada se juega.
    expect(gestos.clic('end-turn', boton, 1)).toBe(false);
    expect(gestos.clic(null, boton, 1)).toBe(false);
    hecho.length = 0;
    expect(
      gestosDe(
        () => sesion,
        () => true,
      ).clic('battle-end-turn', boton, 1),
    ).toBe(true);
    expect(hecho).toEqual([]);
    // Un botón sin lo que dice es un fallo del marcado, y se dice.
    expect(() => gestos.clic('battle-poder', botonDePrueba({}), 1)).toThrow(
      'el botón del poder no dice cuál es',
    );
  });

  it('un doble clic en un hechizo que hay que apuntar lo elige y lo deja elegido (decisión del usuario, 07-11-2026)', () => {
    // «Que no cuente»: `selectSpell` alterna, y el segundo clic de un doble clic soltaba lo
    // que había elegido el primero. En la arena, con el héroe de la persona y la Flecha
    // mágica, que se apunta a un enemigo.
    const s = new SesionDeArena(
      {
        combate: COMBATE_COMPLETO,
        izquierda: {
          unidades: [{ unidad: unidadDeArena('templario-escudo') }],
          heroe: { ...heroePorDefecto('izquierda'), hechizos: ['magic_arrow'] },
          ia: false,
        },
        derecha: { unidades: [{ unidad: unidadDeArena('orko-dos-armas') }], heroe: null, ia: true },
        equipo: EQUIPO_DEL_JUEGO,
      },
      7,
    );
    empezarTalCual(s);
    expect(s.spellOptions().find((o) => o.id === 'magic_arrow')?.castable).toBe(true);
    const gestos = gestosDe(() => s);
    const boton = botonDePrueba({ 'data-spell': 'magic_arrow' });
    expect(gestos.clic('battle-spell', boton, 1)).toBe(true);
    expect(s.hechizos.selectedSpell).toBe('magic_arrow');
    expect(gestos.clic('battle-spell', boton, 2)).toBe(true);
    expect(s.hechizos.selectedSpell).toBe('magic_arrow');
    // Otro clic suelto, sí: pulsar el elegido lo suelta.
    expect(gestos.clic('battle-spell', boton, 1)).toBe(true);
    expect(s.hechizos.selectedSpell).toBeNull();
    // En la partida, el segundo clic ni llega a los gestos (`repartirClic`).
    expect(repartirClic('battle-spell', () => false, 2)).toBe('nada');
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
      enLaRueda: null,
      efectos: [],
      sinDueño: new Set<Side>(),
      clima: { sitio: DESPEJADO, ahora: 0 },
      tanteo: null,
      apuntados: new Map(),
      granadas: new Map(),
      granadaTanteada: null,
    };
    const coronas = (x: BattleStack): number => {
      const { ctx, textos } = contextoQueApunta();
      const f = { en: centroDeStack(stackHexes(x)), alfaDelAro: 1 } as EstadoFigura;
      // La barra no la lleva, y la corona solo la pinta quien la pinta.
      pintarSobreLaCabeza(ctx, vista, x, f);
      expect(textos).not.toContain(MARCA_DE_COMANDANTE);
      if (x.origen.kind === 'heroe') pintarCorona(ctx, vista, f);
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
    const corona = cajaDeCorona(vista, f);
    // Un nombre largo de verdad: lo que mide «Aldo de Valdeluz» y algo más.
    const nombre = cajaDeNombre(vista, f, 160);
    const seTocan =
      corona.x < nombre.x + nombre.ancho &&
      nombre.x < corona.x + corona.ancho &&
      corona.y < nombre.y + nombre.alto &&
      nombre.y < corona.y + corona.alto;
    expect(seTocan, JSON.stringify({ corona, nombre })).toBe(false);
    expect(corona.alto).toBeGreaterThanOrEqual(22);
  });
});

describe('«En el campo» de la partida lleva lo que tiene colgado cada unidad (31-10-2026)', () => {
  it('la fila con efectos, sus pastillas y una nota; sin efectos, como siempre', () => {
    const s = sesionEnBatalla();
    const campo = (): string => enElCampo(marcadoDe(renderSide(s)));
    expect(campo()).not.toContain('modificadores en-curso');
    const batalla = s.battle!;
    const x = batalla.stacks.find((y) => y.count > 0 && y.side === 'defender');
    if (x === undefined) throw new Error('nadie en el bando defensor');
    x.effects.push({
      kind: 'defense',
      amount: 1,
      source: 'defensivo',
      roundsLeft: 2,
      hasta: { turno: 1, al: 'empezar' },
    });
    const m = campo();
    expect(m.match(/modificadores en-curso/g)).toHaveLength(1);
    expect(m).toContain('data-efecto="defense" data-signo="+">defensa +1</span>');
    expect(m).toContain('aria-label="Defensivo: defensa +1 hasta que empiece su próximo turno"');
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
    const lejos = s.state.towns.find(
      (t) => dueñoDeLaCiudad(s.state, t) !== null && dueñoDeLaCiudad(s.state, t) !== s.viewer,
    )!.at;
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

  it('si hoy se para ante una barrera, lo dice con la frase de la ruta, y solo si se ve (H2 de la infiltración)', () => {
    const porque = '(3,0) es montaña y cuesta el día entero de marcha: se entra mañana';
    const ruta = [
      paso(1, true),
      paso(2, true),
      { ...paso(3, false), barrera: porque },
      paso(4, false),
    ];
    expect(llegadaDeLaRuta(ruta, null)).toBe(
      `hoy llegas a 2 de 4 pasos: dorado hoy, gris otro día; ${porque}`,
    );
    // Sin un paso hoy no se dice «no te queda movimiento»: le queda, solo que no el día entero.
    expect(llegadaDeLaRuta(ruta.slice(2), null)).toBe(`hoy no das ni un paso: ${porque}`);
    // Con lo que se ve, también; con la barrera en la niebla, no se delata.
    expect(llegadaDeLaRuta(ruta, fila(1, 2, 3))).toBe(
      `hoy andas 2 de los 3 pasos que se ven; ${porque}`,
    );
    expect(llegadaDeLaRuta(ruta, fila(1, 2))).toBe('hoy andas 2 de los 2 pasos que se ven');
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
    // El héroe nace dentro (19-10-2026): fuera, para que camine el alcaide y la
    // guarnición sea la que recluta, que es lo que miden estas pruebas.
    fueraDeSuBase(s.state, 0);
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

  /**
   * Una partida cuya base de quien juega es del imperio: es la facción con una
   * morada que pide otra además del pueblo (la Fundición pide el Taller), así que
   * su «Ampliar» del primer día ya enseña un «falta construir».
   */
  const IMPERIO = primeraSemillaCon('la base de quien juega en el imperio', (n) =>
    faccionesDeLaSemilla(n)[0] === 'imperio' ? true : undefined,
  ).semilla;
  const FUNDICION = 'imperio_fundicion';

  it('sin héroe dentro camina el alcaide; con él, el héroe', () => {
    const { s } = enLaBase();
    expect(s.vistaDeLaBase()!.caminante.id).toBe(`alcaide-${s.activeTown!.id}`);
    const heroe = s.myHeroes()[0]!;
    s.moveHeroTo(heroe.id, s.activeTown!.at);
    expect(s.vistaDeLaBase()!.caminante).toMatchObject({ id: heroe.id, nombre: heroe.name });
  });

  it('un clic en el ayuntamiento lleva a su puerta y, al llegar, abre «Ampliar» (en menos de 1,5 s)', () => {
    const { s, escena, d } = enLaBase(IMPERIO);
    expect(s.activeTown!.faction).toBe('imperio');
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
    const falta = building(FUNDICION).requires?.find((r) => !s.activeTown!.buildings.includes(r));
    const taller = building(falta ?? '').name;
    expect(panel).toContain(`falta construir &quot;${taller}&quot;`);
    // Construir lo hace aparecer en su sitio: el castillo, en el del fuerte.
    expect(s.vistaDeLaBase()!.edificios.map((e) => e.sitio)).not.toContain('fort');
    s.build('castle');
    expect(s.vistaDeLaBase()!.edificios).toContainEqual(
      expect.objectContaining({ sitio: 'fort', edificio: 'castle' }),
    );
    expect(marcadoDe(renderSide(s, false, escena.abierto))).toContain('ya se ha construido hoy');
  });

  it('una morada, al llegar a su puerta, entra en su escena; al volver, quien anduvo está quieto en ella', () => {
    const { s, escena, d } = enLaBase();
    pulsar(escena, laPuerta(d, 'lvl1'), 0);
    expect(s.scene).toBe('town');
    escena.actualizar(10_000);
    // La morada es otra escena (`Session.abrirLaMorada`): en la base no queda nada abierto.
    expect(s.scene).toBe('morada');
    expect(escena.abierto).toBeNull();
    // No en la puerta: delante, más lejos de la casa que la fila de los reclutas.
    expect(escena.posicion).toEqual(dondeEsperaEnLaMorada(d, 'lvl1'));
    // El panel de la base ya no recluta: lo hace la escena (`partida/morada/escena.ts`).
    expect(marcadoDe(renderSide(s, false, null))).toContain('data-action="morada-elegir"');
    s.cerrarLaMorada();
    expect(s.scene).toBe('town');
    expect(escena.posicion).toEqual(dondeEsperaEnLaMorada(d, 'lvl1'));
    expect(escena.marca).toBe('quieto');
    expect(marcadoDe(renderSide(s, false, escena.abierto))).not.toContain('data-action="recruit"');
  });

  it('«Construir» sale apagado, con el motivo de `buildBlocker` en el título, cuando no se puede', () => {
    const { s, escena, d } = enLaBase(IMPERIO);
    pulsar(escena, laPuerta(d, 'hall'), 0);
    escena.actualizar(10_000);
    const boton = (panel: string, id: string) =>
      panel.match(new RegExp(`<button data-action="build" data-building="${id}"[^>]*>`))?.[0];
    const antes = marcadoDe(renderSide(s, false, escena.abierto));
    expect(boton(antes, 'castle')).not.toContain('disabled');
    expect(boton(antes, FUNDICION)).toContain('disabled title="falta construir');
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
    expect(s.scene).toBe('morada');
    expect(escena.abierto).toBeNull();
    expect(escena.posicion).toEqual(dondeEsperaEnLaMorada(d, 'lvl1'));
    expect(escena.camara()).toEqual(
      camaraDeLaBase(lienzo, camaraQuieta(d, lienzo, d.sitios.lvl1.puerta.x)),
    );
    expect(camaraQuieta(d, lienzo, d.sitios.lvl1.puerta.x)).not.toBe(
      camaraQuieta(d, lienzo, d.entrada.x),
    );
    expect(escena.marca).toBe('quieto');
    // El ayuntamiento y el castillo abren «Ampliar» (desde la base: se sale antes de la morada).
    s.cerrarLaMorada();
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
    pulsar(escena, laPuerta(d, 'hall'), 0);
    escena.actualizar(10_000);
    expect(escena.abierto).toEqual({ tipo: 'ampliar' });
    const town = s.activeTown!.id;
    s.closeTown();
    s.openTown(town);
    expect(escena.abierto).toBeNull();
    expect(escena.posicion).toEqual(d.entrada);
    expect(escena.marca).toBe('quieto');
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

describe('«A distancia» con el puntero: lo que no se puede, dicho como al pulsar', () => {
  /** Piezas de la prueba, que no suman nada: una granada y un arco. */
  const GRANADA: Pieza = {
    id: 'granada_de_prueba',
    nombre: 'Granada de prueba',
    hueco: 'distancia',
    seConsigue: [],
    ataque: 0,
    fuerza: 0,
    defensa: 0,
    peso: 0,
    tiro: 'granada',
    cargas: 2,
    precio: 0,
  };
  const ARCO: Pieza = {
    id: 'arco_de_prueba',
    nombre: 'Arco de prueba',
    hueco: 'distancia',
    seConsigue: [],
    ataque: 0,
    fuerza: 0,
    defensa: 0,
    peso: 0,
    precio: 0,
  };

  /** Una unidad de la prueba con las manos de prueba y, si se dice, `distancia`. */
  function deLaPrueba(id: string, name: string, distancia?: string): Unidad {
    return {
      id,
      name,
      faction: 'templarios',
      leadership: 1,
      attack: 1,
      fuerza: 2,
      agilidad: 3,
      hp: 50,
      cuerpo: { hoja: hojasDeLaArena()[0]!.id },
      equipo: { arma: MANOS_DE_PRUEBA.id, ...(distancia === undefined ? {} : { distancia }) },
      traits: [],
      habilidades: [],
    };
  }

  /**
   * Una pelea de la arena con `quien` de la persona en (1,4) y un blanco de la IA en
   * (10,4), lejos: a ninguno le pesa el contacto. La escena, en un lienzo de 1280×720,
   * y la casilla en píxeles de su tablero.
   */
  function enLaArena(quien: Unidad) {
    const lado = (u: Unidad, ia: boolean) => ({ unidades: [{ unidad: u }], heroe: null, ia });
    const s = new SesionDeArena(
      {
        izquierda: lado(quien, false),
        derecha: lado(deLaPrueba('blanco-de-prueba', 'Blanco de prueba'), true),
        equipo: catalogoCon(MANOS_DE_PRUEBA, GRANADA, ARCO),
        combate: COMBATE_COMPLETO,
        muralla: SIN_MURALLA,
      },
      7,
    );
    s.empezar();
    s.despliegue.listoTalCual();
    const yo = s.turnoPropio?.stack;
    if (yo === undefined) throw new Error('esperaba el turno de la izquierda');
    yo.hex = { col: 1, row: 4 };
    stackById(s.battle, 'defender-0').hex = { col: 10, row: 4 };
    const escena = new EscenaBatalla(() => s);
    escena.encuadrar(1280, 720);
    escena.sincronizar(0);
    const t = tableroPara(1280, 720);
    const en = (h: Hex) => centroHex(t, h);
    return { s, escena, en, yo };
  }

  /** Lo que dice la barra al pasar el puntero por `h` y lo que dice al pulsarla. */
  function señalarYPulsar(
    { s, escena, en }: ReturnType<typeof enLaArena>,
    h: Hex,
  ): { señalada: string; pulsada: string } {
    const p = en(h);
    s.status = '';
    escena.mover(p.x, p.y);
    const señalada = s.status;
    s.status = '';
    escena.pulsar(p.x, p.y);
    return { señalada, pulsada: s.status };
  }

  it('la granada fuera de alcance da su motivo sobre un enemigo y sobre una casilla vacía (H1 del QA de las granadas)', () => {
    const pelea = enLaArena(deLaPrueba('lanzador-de-prueba', 'Lanzador de prueba', GRANADA.id));
    const { s, yo } = pelea;
    expect(s.arma.modo).toBe('distancia');
    const alcance = alcanceDeLaGranada(yo.unit);
    // Sobre el blanco y sobre una casilla vacía, los dos más allá de su alcance: lo
    // que dice el puntero es lo que dice el clic, el motivo del núcleo. Antes, sobre
    // el enemigo, el del cuerpo a cuerpo, y sobre la vacía, nada.
    for (const h of [
      { col: 10, row: 4 },
      { col: 8, row: 6 },
    ]) {
      expect(hexDistance(yo.hex, h)).toBeGreaterThan(alcance);
      const motivo = lanzarBlocker(s.battle, h);
      expect(motivo).toContain(`está a ${hexDistance(yo.hex, h)}`);
      const { señalada, pulsada } = señalarYPulsar(pelea, h);
      expect(señalada).toBe(pulsada);
      expect(señalada).toContain(motivo!);
    }
    // Nada de eso se ha jugado.
    expect(s.battle.stacks.every((x) => x.granada === null)).toBe(true);
    // Y a su alcance, lo de siempre: a dónde lanzaría.
    const cerca = { col: yo.hex.col + alcance, row: yo.hex.row };
    expect(lanzarBlocker(s.battle, cerca)).toBeNull();
    const p = pelea.en(cerca);
    pelea.escena.mover(p.x, p.y);
    expect(s.status.startsWith(`Lanzarías a (${cerca.col},${cerca.row}).`)).toBe(true);
  });

  it('el arco sigue igual sobre un enemigo, y sobre su propia casilla dice por qué', () => {
    const pelea = enLaArena(deLaPrueba('arquero-de-prueba', 'Arquero de prueba', ARCO.id));
    const { s, yo } = pelea;
    expect(s.arma.modo).toBe('distancia');
    const blanco = { col: 10, row: 4 };
    const p = pelea.en(blanco);
    pelea.escena.mover(p.x, p.y);
    expect(
      s.status.startsWith(
        `Apuntarías a (10,4). Hoy daría a ${stackById(s.battle, 'defender-0').unit.name}.`,
      ),
    ).toBe(true);
    // Sobre su casilla, el motivo del núcleo, el mismo que el del clic.
    const motivo = apuntarBlocker(s.battle, yo.hex);
    expect(motivo).not.toBeNull();
    const { señalada, pulsada } = señalarYPulsar(pelea, yo.hex);
    expect(señalada).toBe(pulsada);
    expect(señalada).toContain(motivo!);
    expect(s.battle.stacks.every((x) => x.apuntado === null)).toBe(true);
  });
});

describe('el borde de la explosión de una granada (H2 del QA de las granadas)', () => {
  it('es el contorno de fuera: 6 lados de una casilla, 10 de dos vecinas, 18 de la flor de siete', () => {
    const t = tableroPara(1280, 720);
    const centro = { col: 5, row: 4 };
    expect(bordeDeLasCasillas(t, [centro])).toHaveLength(6);
    expect(bordeDeLasCasillas(t, [centro, { col: 6, row: 4 }])).toHaveLength(10);
    expect(bordeDeLasCasillas(t, [centro, ...neighbours(centro)])).toHaveLength(18);
    // En la esquina del tablero, la flor sale recortada: seis lados por casilla menos
    // los dos de cada par de vecinas del grupo (`areAdjacent`, la del núcleo).
    const esquina = { col: 0, row: 0 };
    const flor = [esquina, ...neighbours(esquina).filter(isInside)];
    const pares = flor.flatMap((a, i) => flor.slice(i + 1).filter((b) => areAdjacent(a, b)));
    expect(bordeDeLasCasillas(t, flor)).toHaveLength(6 * flor.length - 2 * pares.length);
  });
});
