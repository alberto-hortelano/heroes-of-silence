/**
 * El cierre de la batalla de la persona (`CierreDeLaBatalla`): «Resolver sola» (la IA
 * pelea por los dos bandos, sin rendirse por la persona) y «Continuar» (la batalla ya
 * acabada se asienta), y lo de después: volver al mapa —o al lugar donde se peleó— con lo
 * que pasó dicho en la barra (`fraseTrasLaBatalla`). Lo que se suelta al cerrarla (el
 * aviso, la defensa que esperaba el turno del rival, lo apuntado) y volver al lugar son de
 * otras piezas: los pide por su dueño. Era parte de `Session` (`sesion/partida.ts`) hasta
 * R6 de la reorganización (07-11-2026); la sesión delega en ella.
 */
import { jugarLaBatallaPendiente } from '@core/ai/turn.js';
import type { Baja } from '@core/battle/resumen.js';
import type { BattleState, Side } from '@core/battle/types.js';
import { lugarEn } from '@core/mundo/reglas.js';
import { settleBattle } from '@core/state/cierre.js';
import { nombreDelSitio, sitioSiExiste } from '@core/state/sitios.js';
import type { Dejados } from '@core/state/sobrantes.js';
import { unidadDelJuego } from '@core/unidad/catalogo.js';
import { comoFrase } from '../batalla/control.js';
import { ELIGE_EN_LA_RUEDA } from '../batalla/cruce.js';
import type { DueñoDeLasPiezas } from './comun.js';

/** Lo que el cierre guarda al cerrar una batalla para contarla después (`fraseTrasLaBatalla`). */
interface AntesDeCerrar {
  /** Dónde empiezan en la crónica los hechos del cierre. */
  readonly desde: number;
  /** El nombre de cada héroe antes de cerrarla, por su id. */
  readonly nombres: ReadonlyMap<string, string>;
}

/** Lo que la pieza del cierre lee de la sesión. */
interface DueñoDelCierre
  extends Pick<
    DueñoDeLasPiezas,
    | 'estado'
    | 'ctx'
    | 'viewer'
    | 'barra'
    | 'irA'
    | 'heroeSeleccionado'
    | 'seleccionarHeroe'
    | 'misHeroes'
    | 'desenlace'
  > {
  /** La batalla pendiente (`Session.battle`), o `null`. */
  batalla(): BattleState | null;
  /**
   * Si la pantalla de la defensa está abierta, y entonces la barra lo dice
   * (`DefensaEnPantalla.eligiendo`).
   */
  eligiendoLaDefensa(): boolean;
  /** Si hay un golpe plantado esperando la rueda (`CruceDeLaRueda.pendiente`). */
  golpePlantado(): boolean;
  /** El lugar y el héroe de la batalla pendiente, si es de un lugar (`EnElLugar.deLaBatalla`). */
  lugarDeLaBatalla(): { readonly heroe: string } | null;
  /** Suelta lo que esperaba el clic, sin tocar la barra (`LoApuntado.soltar`). */
  soltarLosApuntados(): void;
  /**
   * Suelta el aviso y deja seguir el turno del rival, si era una defensa
   * (`AtaqueALaPersona.trasLaBatalla`).
   */
  trasLaBatalla(): void;
  /**
   * Vuelve a la escena del lugar del héroe `heroId`, ya en su estado nuevo (`EnElLugar.volver`).
   */
  volverAlLugar(heroId: string): void;
  /**
   * Si a la persona le sobra algo al cerrar, abre el diálogo de lo que deja y dice
   * `true` (`SobrantesEnPantalla.abrir`): la batalla no se cierra hasta «Seguir».
   */
  abrirLoQueSobra(): boolean;
}

export class CierreDeLaBatalla {
  constructor(private readonly dueño: DueñoDelCierre) {}

  /** Resuelve el resto de la batalla con la IA en ambos bandos. */
  resolverSola(): void {
    if (this.dueño.estado().pendingBattle === null) return;
    if (this.dueño.eligiendoLaDefensa()) return;
    // Con un golpe plantado ante la rueda, la IA no sabría qué hacer con él.
    if (this.dueño.golpePlantado()) {
      this.dueño.barra(comoFrase(ELIGE_EN_LA_RUEDA));
      return;
    }
    // Delegar la batalla no es delegar el oro: la IA no se rinde por la persona. Ni
    // lo que deja si no cabe todo (08-11-2026): eso se pregunta al cerrar, como tras
    // «Continuar».
    jugarLaBatallaPendiente(this.dueño.estado(), this.dueño.ctx());
    this.continuar();
  }

  /**
   * Cierra la batalla terminada y vuelve al mapa (o al lugar donde se peleó). Si a la
   * persona le sobra algo, antes elige qué deja (`abrirLoQueSobra`), y la cierra su
   * «Seguir» (`cerrar`).
   */
  continuar(): void {
    const battle = this.dueño.batalla();
    if (battle === null || battle.finished === null) return;
    if (this.dueño.abrirLoQueSobra()) return;
    this.cerrar({});
  }

  /** Cierra la batalla terminada con lo que deja la persona (`settleBattle`) y vuelve. */
  cerrar(dejados: Dejados): void {
    const delLugar = this.dueño.lugarDeLaBatalla();
    const antes = this.antesDeCerrar();
    settleBattle(this.dueño.estado(), this.dueño.ctx(), dejados);
    this.trasCerrar(delLugar, antes);
  }

  /**
   * Lo que hace falta para contar la batalla después de cerrarla
   * (`fraseTrasLaBatalla`): dónde empiezan sus hechos en la crónica y el nombre de
   * cada héroe, que el vencido sin base ya no está en el mapa para decirlo.
   */
  private antesDeCerrar(): AntesDeCerrar {
    return {
      desde: this.dueño.estado().log.length,
      nombres: new Map(this.dueño.estado().heroes.map((h) => [h.id, h.name])),
    };
  }

  /**
   * Cómo acabó la batalla que se acaba de cerrar, en una frase para la barra, o ''
   * si no era de la persona (06-11-2026: «Resolver sola» volvía al mapa con la
   * barra vacía y el grupo, sin más, ya no estaba). Con lo que acaba de escribir el
   * núcleo: quién ganó y qué perdió cada bando (`battle_ended`, con su
   * `resumenDeBatalla`), y lo que pasó fuera del tablero: un héroe que cae, se
   * rinde o vuelve a su base (`hero_defeated`, `hero_returned`) y un sitio que se
   * pierde o se toma. La misma tras una batalla jugada («Continuar») y tras una
   * resuelta sola: la jugada enseñaba su final en el panel y volvía al mapa
   * también callada.
   */
  private fraseTrasLaBatalla({ desde, nombres }: AntesDeCerrar): string {
    const viewer = this.dueño.viewer();
    const hechos = this.dueño.estado().log.slice(desde);
    const fin = hechos.find((e) => e.kind === 'battle_ended');
    if (fin === undefined) return '';
    const suyo: Side | null =
      fin.owners.attacker === viewer
        ? 'attacker'
        : fin.owners.defender === viewer
          ? 'defender'
          : null;
    if (suyo === null) return '';
    const otro: Side = suyo === 'attacker' ? 'defender' : 'attacker';
    const bajas = (l: readonly Baja[]): string =>
      l.map((b) => `${b.count} × ${unidadDelJuego(b.creature).name}`).join(', ');
    // Lo que mataron de lo tuyo. «No pierdes a nadie» no se dice si cae un héroe
    // tuyo: la tropa que no murió en el tablero se va con él (`volverABase`).
    const cayoUnoTuyo = hechos.some((e) => e.kind === 'hero_defeated' && e.actor === viewer);
    const tuyas =
      fin.lost[suyo].length > 0
        ? [`pierdes ${bajas(fin.lost[suyo])}`]
        : cayoUnoTuyo
          ? []
          : ['no pierdes a nadie'];
    const partes = [
      ...tuyas,
      fin.lost[otro].length === 0
        ? 'el enemigo no pierde a nadie'
        : `el enemigo pierde ${bajas(fin.lost[otro])}`,
    ];
    const nombre = (id: string): string => nombres.get(id) ?? 'un héroe';
    const sitio = (id: string): string => {
      const s = sitioSiExiste(this.dueño.estado(), id);
      return s === null ? 'un sitio' : nombreDelSitio(s);
    };
    const caidos = new Set<string>();
    for (const e of hechos) {
      switch (e.kind) {
        case 'hero_defeated':
          // `actor` es el dueño del que cae. El tuyo se cuenta con su vuelta, si vuelve.
          if (e.actor !== viewer) partes.push(`cae ${nombre(e.hero)}`);
          else caidos.add(e.hero);
          break;
        case 'hero_returned': {
          if (e.actor !== viewer) break;
          const base = sitio(e.town);
          if (e.surrendered) {
            partes.push(`${nombre(e.hero)} se rinde por ${e.gold} de oro y vuelve a ${base}`);
          } else {
            caidos.delete(e.hero);
            partes.push(`${nombre(e.hero)} cae y vuelve a ${base} sin tropa`);
          }
          break;
        }
        case 'town_captured':
        case 'node_captured': {
          const id = e.kind === 'town_captured' ? e.town : e.node;
          if (e.from === viewer) partes.push(`pierdes ${sitio(id)}`);
          else if (e.actor === viewer) partes.push(`tomas ${sitio(id)}`);
          break;
        }
        case 'left_behind':
          if (e.actor === viewer) {
            partes.push(`dejas ${e.count} × ${unidadDelJuego(e.creature).name}, que no caben`);
          }
          break;
        case 'town_owner_changed':
          if (e.from === viewer) partes.push(`pierdes ${sitio(e.town)}`);
          else if (e.to === viewer) partes.push(`tomas ${sitio(e.town)}`);
          break;
        default:
          break;
      }
    }
    // El que cae sin base a la que volver sale del mapa.
    for (const id of caidos) partes.push(`${nombre(id)} cae`);
    return `Batalla ${fin.winner === suyo ? 'ganada' : 'perdida'}: ${partes.join('; ')}.`;
  }

  /** Lo de después de cerrar la batalla (era `Session.afterBattle`). */
  private trasCerrar(delLugar: { readonly heroe: string } | null, antes: AntesDeCerrar): void {
    // Cerrada sin pasar por «Defender» (resuelta sola directamente), su aviso sobra; y si
    // era una defensa (#116), el turno del rival sigue desde aquí.
    this.dueño.trasLaBatalla();
    this.dueño.irA('adventure');
    this.dueño.soltarLosApuntados();
    if (this.dueño.heroeSeleccionado() === null) {
      this.dueño.seleccionarHeroe(this.dueño.misHeroes()[0]?.id ?? null);
    }
    // «¡Batalla!» se quedaba en la barra ya de vuelta en el mapa: dice cómo acabó
    // (`fraseTrasLaBatalla`). Si la batalla cerró la partida, la barra dice cómo
    // sin que se escriba aquí (`Session.status`); antes era un «¡Victoria!» a secas, sin la causa.
    this.dueño.barra(this.fraseTrasLaBatalla(antes));
    // La de un lugar vuelve a su escena, ya en su estado nuevo (P-d del usuario),
    // si el héroe sigue en él: vencido, vuelve a su base y se queda en el mapa.
    const hero =
      delLugar === null
        ? undefined
        : this.dueño.estado().heroes.find((h) => h.id === delLugar.heroe);
    const l = hero === undefined ? null : lugarEn(this.dueño.estado(), hero.at);
    if (hero !== undefined && l !== null && this.dueño.desenlace() === null) {
      this.dueño.volverAlLugar(hero.id);
    }
  }
}
