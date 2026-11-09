/**
 * Punto de entrada de la partida: busca los elementos de la página, abre la partida que pide la
 * URL y monta lo demás, en orden.
 *
 * La sesión decide, `render/` pinta, los paneles salen de `partida/` y `views/`, y cada escena
 * traduce el puntero de su pantalla. Aquí solo se conecta todo: lo que hace cada parte de la
 * página vive en `partida/` desde R7 de la reorganización (07-11-2026) —abrir la partida
 * (`abrir.ts`), el fotograma (`dibujo.ts`), los diálogos (`dialogos.ts`), lo que comparten los
 * gestos (`gestos.ts`), el puntero (`puntero.ts`), el clic (`clic.ts`) y el teclado
 * (`teclado.ts`)—, y la página que comparten, en `pagina.ts`. Ninguna registra un oyente ni hace
 * nada al importarse: aquí se construye cada cosa y se instala cada parte en el orden de
 * siempre, porque es comportamiento: dos oyentes del mismo evento en el mismo nodo corren en el
 * orden en que se registraron.
 */

import { mensajeDe } from '../shared/errores.js';
import { EscenaBatalla } from './batalla/escena.js';
import { GestosDeBatalla } from './batalla/gestos.js';
import { DialogoDeLaRueda } from './batalla/rueda/dialogo.js';
import { bucleDeDibujo } from './comun/bucle.js';
import { abrirLaPartida } from './partida/abrir.js';
import { EscenaBase } from './partida/base/escena.js';
import { instalarElClic } from './partida/clic.js';
import { instalarLosDialogos } from './partida/dialogos.js';
import { calentarElMapa, dibujarFotograma, otroFotograma } from './partida/dibujo.js';
import { PuertaDeFinDeTurno } from './partida/fin-de-turno.js';
import { jugadaEnCurso } from './partida/gestos.js';
import { EscenaLugar } from './partida/lugar/escena.js';
import { EscenaAventura } from './partida/mapa/escena.js';
import {
  type EstadoDeLaPagina,
  elementosDeLaPartida,
  escenasDeDentro,
  type PaginaDeLaPartida,
} from './partida/pagina.js';
import { instalarElPuntero } from './partida/puntero.js';
import { instalarElTeclado } from './partida/teclado.js';
import { cargarArte } from './render/assets.js';
import { apuntarElSueloEn } from './render/escenario/superficie.js';
import { ajustarLienzo } from './render/lienzo.js';
import type { Session } from './sesion/partida.js';

/**
 * `true` en `pnpm dev` y `false` en `vite build` (`define` de `vite.config.ts`):
 * con `false`, el `import()` de las herramientas de desarrollo queda en una rama
 * muerta y Rollup no lo emite. Si algo se cuela, `sinDesarrollo` rompe el build.
 */
declare const HERRAMIENTAS_DE_DESARROLLO: boolean;

const elementos = elementosDeLaPartida();
const { app, canvas, elStatus, elSeed, elRueda, elGuarnicion, elDefensa, elAviso, elSobrantes } =
  elementos;

/**
 * El bucle de dibujo (`comun/bucle.ts`), con la red de la partida: un fallo al pintar se
 * escribe en la barra, y el siguiente fotograma se vuelve a pedir si hace falta, también
 * tras un fallo (`otroFotograma`). Va aquí arriba porque lo recogen desde el principio la
 * sesión (`alCambiarSinGesto`) y la rueda; lo que pinta, en `partida/dibujo.ts`.
 */
const pedirFotograma = bucleDeDibujo({
  pintar: (ahora) => {
    dibujarFotograma(pagina, ahora);
    return otroFotograma(pagina);
  },
  alFallar: (motivo) => {
    console.error('[cliente] fallo al pintar', motivo);
    elStatus.textContent = `No se ha podido pintar la pantalla: ${mensajeDe(motivo)}`;
    return otroFotograma(pagina);
  },
});

const session = abrirLaPartida({ elStatus, elSeed, pedirFotograma });
const sesion = (): Session => session;
const aventura = new EscenaAventura(sesion);
const batalla = new EscenaBatalla(sesion);
const castillo = new EscenaBase(sesion);
/**
 * La escena de un lugar de un mundo (`partida/lugar/escena.ts`): se entra desde el mapa, como en
 * la tropa.
 */
const lugar = new EscenaLugar(sesion);
const dentro = escenasDeDentro(sesion, castillo, lugar);
/**
 * La rueda del golpe de la partida, la misma de la arena (F5, 19-10-2026). De los
 * dos que se cruzan, su figura, su chapa y su nombre, y quién es «tú»
 * (`Session.quienMira`); la ficha y la vista previa son de la arena (#261).
 */
const rueda = new DialogoDeLaRueda(elRueda, {
  sesion: () => (session.scene === 'battle' ? session : null),
  escena: batalla,
  cara: () => null,
  pedirFotograma,
  alPulsarMientrasCuenta: () => {
    jugadaEnCurso(pagina);
  },
});
const finDeTurno = new PuertaDeFinDeTurno(() => performance.now());

/** Lo que la página cambia mientras vive (`EstadoDeLaPagina`, `partida/pagina.ts`). */
const estado: EstadoDeLaPagina = {
  desarrollo: null,
  paneles: null,
  arteLlegado: 0,
  escenaPintada: '',
  escenaDeAntes: '',
  lateralDeAntes: 0,
  lateralPendiente: null,
  fichaALaVista: false,
  activaSeguida: null,
};

const principal = ajustarLienzo(canvas, pedirFotograma);
const ctx = principal.ctx;

cargarArte(() => {
  estado.arteLlegado++;
  pedirFotograma();
});
apuntarElSueloEn(app);

// Antes que los gestos de la batalla, como siempre: con lo que leen, que la página aún no
// está entera.
instalarLosDialogos({ elGuarnicion, elAviso, elDefensa, elSobrantes, session, pedirFotograma });

/**
 * Los gestos de la batalla, los de la arena (`batalla/gestos.ts`): los botones del
 * panel, las teclas y el puntero sobre el tablero, con la misma puerta (`jugadaEnCurso`).
 */
const gestos = new GestosDeBatalla({
  sesion,
  escena: batalla,
  jugadaEnCurso: () => jugadaEnCurso(pagina),
  pedirFotograma,
});

/** La página entera (`partida/pagina.ts`): lo que leen las piezas de `partida/`. */
const pagina: PaginaDeLaPartida = {
  ...elementos,
  session,
  pedirFotograma,
  aventura,
  batalla,
  castillo,
  lugar,
  dentro,
  rueda,
  gestos,
  finDeTurno,
  principal,
  ctx,
  estado,
};

// Sus oyentes, en el orden de siempre: el puntero (el marco del tablero, el lienzo y el
// minimapa), el clic y el teclado.
instalarElPuntero(pagina);
instalarElClic(pagina);
instalarElTeclado(pagina);

// La partida empieza en la base, con el héroe dentro: salir de ella lleva al
// mapa, y la barra dice entonces cómo se anda (`AYUDA_DEL_MAPA`).
session.abrirSuBase();
pedirFotograma();
calentarElMapa(session);

if (HERRAMIENTAS_DE_DESARROLLO) {
  void import('./desarrollo/herramientas.js')
    .then((m) => {
      estado.desarrollo = m.montar({
        sesion,
        aventura,
        canvas,
        herramientas: document.getElementById('herramientas') as HTMLElement,
        pedirFotograma,
        pintarYa: () => dibujarFotograma(pagina, performance.now()),
      });
      pedirFotograma();
    })
    .catch((err: unknown) => {
      console.error('[cliente] no se han podido montar las herramientas de desarrollo', err);
      elStatus.textContent = `No se han podido montar las herramientas de desarrollo: ${mensajeDe(err)}`;
    });
}
