/**
 * El clic en un botón de la partida (R7 de la reorganización, 07-11-2026: estaba en
 * `main.ts`): un oyente en `document` para todo `[data-action]`. Lo primero, el reparto
 * (`repartirClic`): el segundo clic de un doble clic no cuenta salvo en los que suman de uno en
 * uno, «Ver al enemigo» y «Continuar» van antes que la jugada que se cuenta, y la marcha que
 * se anda solo llega (`hastaQueLlegue`); luego, los botones de la batalla, a sus gestos
 * (`GestosDeBatalla`), y los demás, aquí, uno a uno. Nada se registra al importarse: lo
 * instala `main.ts`, en su sitio, entre el puntero y el teclado.
 */
import { esObraDelPuesto } from '@core/map/tipos.js';
import { aLaBarra } from '../comun/semilla.js';
import { combateALaURL } from './combate-en-la-url.js';
import {
  abrirLaTropa,
  cerrarDentro,
  hastaQueLlegue,
  jugadaEnCurso,
  pasarTurno,
  siguienteHeroe,
} from './gestos.js';
import type { PaginaDeLaPartida } from './pagina.js';
import { repartirClic } from './reparto-del-clic.js';

/** Instala el oyente del clic (la cabecera del fichero). */
export function instalarElClic(pagina: PaginaDeLaPartida): void {
  const { session, aventura, batalla, castillo, lugar, gestos, estado } = pagina;
  const { haciaEnemigo, lienzo, salirAlMenu, pedirFotograma } = pagina;
  document.addEventListener('click', (ev) => {
    const target = (ev.target as HTMLElement).closest('[data-action]');
    if (target === null) return;
    const action = target.getAttribute('data-action');
    // El segundo clic de un doble clic no cuenta en ningún botón, caiga donde caiga, salvo
    // los que suman de uno en uno (`repartirClic`; decisión del usuario, 07-11-2026).
    const reparto = repartirClic(action, session.scene, () => jugadaEnCurso(pagina), ev.detail);
    if (reparto === 'mirar') {
      const izquierda = haciaEnemigo.dataset.lado === 'izquierda' ? 0 : lienzo.scrollWidth;
      lienzo.scrollTo({ left: izquierda, behavior: 'smooth' });
      return;
    }
    if (reparto === 'al-acabar') {
      // Si espera, la vuelta al mapa ocurre dentro de un fotograma, y `render`
      // pide el siguiente al ver que la escena cambió.
      batalla.alAcabar(performance.now(), () => {
        session.finishBattle();
        aventura.olvidarRuta();
      });
      pedirFotograma();
      return;
    }
    if (reparto === 'nada' || hastaQueLlegue(pagina)) return;
    pedirFotograma();
    // Los botones de la batalla (`GestosDeBatalla`), los de la arena: su regla del doble clic
    // ya no ve un segundo clic aquí, porque `repartirClic` no deja pasar ninguno de ellos.
    if (gestos.clic(action, target, ev.detail)) return;

    switch (action) {
      case 'end-turn':
        pasarTurno(pagina);
        break;
      case 'end-turn-confirm':
        pasarTurno(pagina, true);
        break;
      case 'end-turn-cancel':
        session.retirarAvisoDeFinDeTurno();
        break;
      case 'next-hero':
        siguienteHeroe(pagina);
        break;
      case 'sleep-hero':
        session.alternarSueño(target.getAttribute('data-hero') as string);
        break;
      case 'toggle-fog':
        session.revealAll = !session.revealAll;
        break;
      case 'select-hero':
        session.selectedHeroId = target.getAttribute('data-hero');
        aventura.olvidarRuta();
        aventura.centrar();
        break;
      case 'open-town':
        session.openTown(target.getAttribute('data-town') as string);
        break;
      case 'close-town':
        castillo.cerrar();
        session.closeTown();
        castillo.salir();
        break;
      case 'abrir-tropa':
        abrirLaTropa(pagina);
        break;
      case 'cerrar-tropa':
      case 'cerrar-morada':
      case 'cerrar-ayuntamiento':
        cerrarDentro(pagina);
        break;
      case 'abrir-ayuntamiento':
        castillo.cerrar();
        session.abrirElAyuntamiento();
        break;
      case 'ayuntamiento-elegir': {
        const tipo = target.getAttribute('data-tipo');
        if (tipo === null) throw new Error('el botón del ayuntamiento no dice qué héroe elige');
        session.elegirEnElAyuntamiento(tipo);
        estado.fichaALaVista = true;
        break;
      }
      case 'salir-del-lugar':
        // El botón sale del todo, hable o no: sin la conversación, `cerrarDentro`
        // (con el cursor) saca al mapa, como Escape la segunda vez.
        session.lugar.dejarDeHablar();
        cerrarDentro(pagina);
        break;
      case 'lugar-ir':
        lugar.irA(target.getAttribute('data-punto') as string, performance.now());
        break;
      case 'lugar-al-principio':
        session.lugar.alPrincipio();
        break;
      case 'lugar-opcion': {
        // Apagada: su motivo ya se lee debajo; el clic no hace nada.
        if (target.getAttribute('aria-disabled') === 'true') break;
        session.elegirEnElLugar(Number(target.getAttribute('data-indice')));
        break;
      }
      case 'tropa-elegir': {
        const quien = target.getAttribute('data-quien');
        if (quien === null) throw new Error('el botón de la tropa no dice a quién elige');
        session.elegirEnLaTropa(quien === 'heroe' ? { heroe: true } : { indice: Number(quien) });
        break;
      }
      case 'tropa-poner':
        session.ponerALaElegida(
          target.getAttribute('data-item') as string,
          target.getAttribute('data-hueco') ?? undefined,
        );
        break;
      case 'tropa-quitar':
        // El hueco lo valida la sesión (`esHueco`), como en `unequip`.
        session.quitarALaElegida(target.getAttribute('data-slot') as string);
        break;
      case 'morada-elegir': {
        const unidad = target.getAttribute('data-unidad');
        if (unidad === null) throw new Error('el botón de la morada no dice qué unidad elige');
        session.elegirEnLaMorada(unidad);
        break;
      }
      case 'ir-a-sitio':
        castillo.irA(target.getAttribute('data-sitio') as string, performance.now());
        break;
      case 'build':
        session.build(target.getAttribute('data-building') as string);
        break;
      case 'recruit': {
        const criatura = target.getAttribute('data-creature') as string;
        if (target.getAttribute('data-todo') === 'si') session.recruitAll(criatura);
        else session.recruit(criatura, 1);
        break;
      }
      case 'cerrar-en-la-base':
      case 'cerrar-conversacion':
        castillo.cerrar();
        break;
      case 'hire-hero': {
        const tipo = target.getAttribute('data-tipo');
        if (tipo === null) throw new Error('el botón de contratar no dice qué héroe contrata');
        const eraElDeSalida = session.heroeDeSalidaPendiente;
        session.hireHero(tipo);
        // Elegido el de salida, la URL lo lleva: la recarga entra con él («ya elegido
        // y pagado»). Uno contratado después no la cambia.
        if (eraElDeSalida && !session.heroeDeSalidaPendiente) {
          aLaBarra((url) => url.searchParams.set('heroe', tipo));
        }
        break;
      }
      case 'abrir-guarnicion':
        session.abrirLaGuarnicion(target.getAttribute('data-hero') as string);
        break;
      case 'cerrar-guarnicion':
        session.cerrarLaGuarnicion();
        break;
      case 'mover-en-el-reparto': {
        // Apagado: su nota ya se lee debajo; el clic no hace nada (como en un lugar). Cada clic
        // solo edita el reparto, así que un doble clic mueve dos (H-V2-1 del QA): es de los
        // que cuentan cada clic (`CUENTAN_CADA_CLIC` de `reparto-del-clic.ts`), como «−» y «+».
        if (target.getAttribute('aria-disabled') === 'true') break;
        const hacia = target.getAttribute('data-hacia');
        if (hacia !== 'heroe' && hacia !== 'guarnicion') {
          throw new Error(`un botón de la guarnición sin lado al que pasar: «${hacia}»`);
        }
        session.moverEnElReparto(
          hacia,
          target.getAttribute('data-creature') as string,
          target.getAttribute('data-veterano') ?? undefined,
        );
        break;
      }
      case 'confirmar-reparto':
        if (target.getAttribute('aria-disabled') === 'true') break;
        session.confirmarElReparto();
        break;
      case 'mejorar-el-puesto': {
        // Apagado: su motivo ya se lee debajo.
        if (target.getAttribute('aria-disabled') === 'true') break;
        // La obra que decía el botón pulsado: si el diálogo ya ofrece otra (el clic
        // llega antes del repintado), el núcleo la rechaza sin cobrar.
        const obra = target.getAttribute('data-obra');
        if (!esObraDelPuesto(obra)) {
          throw new Error(`el botón del puesto no dice qué obra compra: «${obra}»`);
        }
        session.mejorarElPuesto(obra);
        break;
      }
      case 'defensa-mas':
      case 'defensa-menos':
        // Cuentan cada clic, como «Dejar ›» y «‹ Recoger»: solo editan hasta «Defender».
        if (target.getAttribute('aria-disabled') === 'true') break;
        session.cambiarLaDefensa(
          target.getAttribute('data-creature') as string,
          action === 'defensa-mas' ? 1 : -1,
        );
        break;
      case 'defensa-confirmar':
        if (target.getAttribute('aria-disabled') === 'true') break;
        session.confirmarLaDefensa();
        break;
      case 'defensa-de-la-ia':
        session.dejarLaDefensaDeLaIA();
        break;
      case 'aviso-defender':
        session.defenderElAtaque();
        break;
      case 'aviso-resolver-sola':
        session.resolverElAtaqueSola();
        break;
      case 'dismiss':
        session.dismiss(
          target.getAttribute('data-hero') as string,
          target.getAttribute('data-creature') as string,
          1,
        );
        break;
      case 'select-item':
        session.selectItem(target.getAttribute('data-item') as string);
        break;
      case 'equip': {
        const veteran = target.getAttribute('data-veteran');
        const creature = target.getAttribute('data-creature');
        session.equip(target.getAttribute('data-hero') as string, {
          ...(veteran === null ? {} : { veteran }),
          ...(creature === null ? {} : { creature }),
        });
        break;
      }
      case 'unequip': {
        // El hueco lo valida la sesión (`esHueco`), su puerta al núcleo: uno mal
        // escrito sale en la barra con su motivo.
        session.unequip(
          target.getAttribute('data-hero') as string,
          target.getAttribute('data-slot') as string,
          target.getAttribute('data-veteran') ?? undefined,
        );
        break;
      }
      case 'buy-item':
        session.buyItem(target.getAttribute('data-item') as string);
        break;
      case 'battle-surrender':
        // Rendirse y «Resolver sola» son solo de la partida; su segundo clic no cuenta, como
        // el de ningún botón (`repartirClic`, decisiones del usuario del 07-11-2026).
        session.playBattleAction({ type: 'surrender' });
        break;
      case 'auto-battle':
        session.autoResolveBattle();
        break;
      case 'solo-rueda-del-heroe':
        // La casilla de la batalla: vale desde el siguiente golpe, y la URL la
        // recuerda para la recarga.
        session.alternarSoloRuedaDelHeroe();
        aLaBarra((url) => combateALaURL(url, session.state.combate, session.soloRuedaDelHeroe));
        break;
      case 'zoom-in':
        aventura.zoom(1);
        break;
      case 'zoom-out':
        aventura.zoom(-1);
        break;
      case 'centrar':
        aventura.centrar();
        break;
      case 'menu':
        salirAlMenu.showModal();
        break;
      case 'seguir-jugando':
        salirAlMenu.close();
        break;
      case 'restart':
        // «Partida nueva» vuelve al menú de inicio: la página sin nada pedido.
        // Recargando y no montando otra sesión aquí: así se suelta la partida
        // entera, el Worker del suelo incluido.
        aLaBarra((url) => {
          url.search = '';
        });
        location.reload();
        break;
      default:
        return;
    }
  });
}
