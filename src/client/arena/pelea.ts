/**
 * La pelea de la arena (`EstadoDeLaPelea`): empezarla con el montaje de ahora (`luchar`, con su
 * semilla en la barra), volver al montaje y la puerta de los gestos mientras el tablero cuenta una
 * jugada (`jugadaEnCurso`). Era parte de `arena/main.ts` hasta R8 de la reorganización
 * (07-11-2026).
 */
import type { Lado } from '@core/arena/lados.js';
import { mensajeDe } from '../../shared/errores.js';
import { semillaSorteada } from '../comun/semilla.js';
import { type LadoDeSesion, SesionDeArena } from '../sesion/sesion-de-arena.js';
import { catalogoDeMagia } from './catalogo.js';
import { aLaBarraDeLaArena } from './enlace.js';
import { fuenteDeArena } from './montaje.js';
import type { PaginaDeLaArena } from './pagina.js';
import { irA, repintarMontaje } from './vista.js';

export function luchar(pagina: PaginaDeLaArena): void {
  const { catalogo, montaje, vista, pelea, editorDeMuralla, batalla, principal, elSeed } = pagina;
  const lado = (l: Lado): LadoDeSesion => ({
    unidades: montaje.puestos[l].map((p) => fuenteDeArena(catalogo, p)),
    heroe: montaje.heroes[l],
    ia: montaje.iaDelBando[l],
  });
  // Una pelea nueva sortea su semilla, salvo que la URL fije una; y la URL la
  // lleva siempre, como en la partida: un resultado raro se repite copiando la
  // barra de direcciones (M6 de QA).
  const semilla = montaje.semillaPedida ?? semillaSorteada();
  let nueva: SesionDeArena;
  try {
    nueva = new SesionDeArena(
      {
        izquierda: lado('izquierda'),
        derecha: lado('derecha'),
        muralla: editorDeMuralla.muralla,
        equipo: catalogo.equipo,
        combate: montaje.combate,
        hechizos: catalogoDeMagia(catalogo),
      },
      semilla,
      montaje.climaDeLaArena,
    );
  } catch (err) {
    vista.aviso = `No se puede luchar: ${mensajeDe(err)}.`;
    return;
  }
  aLaBarraDeLaArena((url) => url.searchParams.set('seed', String(semilla)));
  pelea.sesion = nueva;
  elSeed.textContent = `semilla ${semilla}`;
  irA(pagina, 'battle');
  principal.remedir();
  pelea.paneles = null;
  // El animador mira el tablero de salida ANTES de que la IA juegue: así cuenta
  // lo que juega, también con todas las unidades en IA (H1 de QA).
  batalla.sincronizar(performance.now());
  nueva.empezar();
}

export function volverAlMontaje(pagina: PaginaDeLaArena): void {
  const { vista, pelea, rueda, editor } = pagina;
  if (editor.open) editor.close();
  rueda.cerrar();
  pelea.sesion = null;
  irA(pagina, 'montaje');
  vista.aviso = 'De vuelta al montaje: todo sigue como estaba.';
  repintarMontaje(pagina);
}

/** La puerta de los gestos mientras se cuenta la jugada, como en la partida. */
export function jugadaEnCurso(pagina: PaginaDeLaArena): boolean {
  const { pelea, pedirFotograma, batalla } = pagina;
  if (pelea.sesion === null) return true;
  if (!batalla.rechazarSiOcupada(performance.now())) return false;
  pedirFotograma();
  return true;
}
