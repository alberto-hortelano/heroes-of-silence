/**
 * La guarnición en pantalla (`GuarnicionEnPantalla`): el reparto de la tropa entre un
 * héroe y el sitio suyo donde está, que se edita sin tocar la partida hasta «Confirmar»
 * (`repartir_tropa`), y la obra del puesto de un paso (`mejorar_el_puesto`). Lo pinta
 * `partida/guarnicion.ts` en `<dialog id="guarnicion">`. Era parte de `Session`
 * (`sesion/partida.ts`) hasta R6 de la reorganización (07-11-2026); la sesión delega en ella.
 */
import type { ObraDelPuesto } from '@core/map/tipos.js';
import { heroById } from '@core/state/consultas.js';
import { applyAdventureAction } from '@core/state/game.js';
import {
  delSitio,
  type ElReparto,
  elReparto,
  type LaObraDelPuesto,
  type LineaDelReparto,
  laObraDelPuesto,
  lineasDelEjercito,
  mejorarBlocker,
  sitioDelHeroe,
} from '@core/state/sitios.js';
import type { Hero } from '@core/types.js';
import { unidadDelJuego } from '@core/unidad/catalogo.js';
import { DICHO_DE_LA_OBRA } from '../../comun/dichos.js';
import { comoFrase } from '../batalla/control.js';
import type { DueñoDeLasPiezas } from './comun.js';

/**
 * La pantalla de repartir la tropa (`Session.vistaDeLaGuarnicion`): la del núcleo
 * (`elReparto`), con el héroe y el nombre del sitio, y en `motivo` también el turno.
 */
export interface VistaDeLaGuarnicion extends ElReparto {
  readonly hero: Hero;
  /** «del paso de montaña de (3,4)», «de Villarreal». */
  readonly delSitio: string;
  /**
   * La obra del puesto, si el sitio es un paso (`laObraDelPuesto`; la ciudad y el
   * pueblo no se mejoran), con el turno en su motivo.
   */
  readonly obra: LaObraDelPuesto | null;
}

/** Lo que la pieza de la guarnición lee de la sesión. */
type DueñoDeLaGuarnicion = Pick<
  DueñoDeLasPiezas,
  'estado' | 'ctx' | 'viewer' | 'tocar' | 'barra' | 'run' | 'bloqueoDeTurno' | 'oro'
>;

export class GuarnicionEnPantalla {
  /**
   * La guarnición abierta: de qué héroe y el reparto que se edita (`LineaDelReparto`:
   * lo que iría con él), o `null`. Nace como están (`lineasDelEjercito`) y nada pasa
   * al núcleo hasta «Confirmar»: Escape y «Cancelar» lo descartan.
   */
  private repartoEnPantalla: { readonly hero: string; lineas: LineaDelReparto[] } | null = null;

  constructor(private readonly dueño: DueñoDeLaGuarnicion) {}

  /** Si `hero` está en un paso o un pueblo suyo (la ciudad tiene su base). */
  enSuPasoOPueblo(hero: Hero): boolean {
    const sitio = sitioDelHeroe(this.dueño.estado(), hero);
    return sitio !== null && sitio.kind !== 'ciudad';
  }

  /** El héroe cuya guarnición está abierta (`<dialog id="guarnicion">`), o `null`. */
  get abierta(): string | null {
    return this.repartoEnPantalla?.hero ?? null;
  }

  /**
   * Abre la pantalla de repartir la tropa del sitio suyo donde está `heroId`: una
   * ciudad (desde su base), un paso o un pueblo (al parar en él, o pulsándolo con el
   * héroe dentro). Fuera de un sitio suyo no se abre, y la barra dice por qué.
   */
  abrir(heroId: string): void {
    const hero = heroById(this.dueño.estado(), heroId);
    if (hero.owner !== this.dueño.viewer() || sitioDelHeroe(this.dueño.estado(), hero) === null) {
      this.dueño.barra(
        `${hero.name} no está en ningún sitio tuyo: la tropa se deja y se recoge en una ciudad, un paso o un pueblo tuyos.`,
      );
      return;
    }
    this.repartoEnPantalla = { hero: heroId, lineas: lineasDelEjercito(hero.army) };
    this.dueño.tocar();
  }

  /** Escape o «Cancelar»: se cierra y lo editado se descarta. */
  cerrar(): void {
    if (this.repartoEnPantalla === null) return;
    this.repartoEnPantalla = null;
    this.dueño.tocar();
  }

  /**
   * Lo que enseña la pantalla de la guarnición: cómo quedarían el héroe y la
   * guarnición con lo editado, agrupados y con sus cupos, y el motivo del núcleo para
   * no confirmarlo (`elReparto`; antes, el turno). `null` si no hay ninguna abierta o
   * el héroe ya no está en su sitio.
   */
  vista(): VistaDeLaGuarnicion | null {
    const abierto = this.repartoEnPantalla;
    const hero =
      abierto === null ? undefined : this.dueño.estado().heroes.find((h) => h.id === abierto.hero);
    if (abierto === null || hero === undefined) return null;
    const sitio = sitioDelHeroe(this.dueño.estado(), hero);
    if (sitio === null) return null;
    const reparto = elReparto(this.dueño.estado(), this.dueño.viewer(), hero, abierto.lineas);
    return {
      ...reparto,
      hero,
      delSitio: delSitio(sitio),
      motivo: reparto.cambia ? (this.dueño.bloqueoDeTurno() ?? reparto.motivo) : null,
      obra: this.obraDelPuesto(hero),
    };
  }

  /**
   * «Levantar la empalizada» o «Amurallar» del diálogo del puesto: manda al núcleo
   * la obra `obra`, la que decía el botón pulsado (`mejorar_el_puesto`, que juzga
   * `mejorarBlocker`: si ya no es la que toca, se rechaza sin cobrar), y deja el
   * diálogo abierto, con la obra nueva y el oro que queda; lo editado del reparto
   * sigue como estaba (la obra no toca la tropa). Con un rechazo, su motivo en la
   * barra.
   */
  mejorar(obra: ObraDelPuesto): void {
    const abierto = this.repartoEnPantalla;
    const hero =
      abierto === null ? undefined : this.dueño.estado().heroes.find((h) => h.id === abierto.hero);
    if (hero === undefined) return;
    const motivo =
      this.dueño.bloqueoDeTurno() ??
      mejorarBlocker(this.dueño.estado(), this.dueño.viewer(), hero.id, obra, this.dueño.oro());
    if (motivo !== null) {
      this.dueño.barra(comoFrase(motivo));
      this.dueño.tocar();
      return;
    }
    const hecho = this.dueño.run(() =>
      applyAdventureAction(
        this.dueño.estado(),
        { type: 'mejorar_el_puesto', hero: hero.id, obra },
        this.dueño.ctx(),
        this.dueño.viewer(),
      ),
    );
    const sitio = sitioDelHeroe(this.dueño.estado(), hero);
    if (hecho && sitio !== null) {
      this.dueño.barra(DICHO_DE_LA_OBRA[obra].hecho(delSitio(sitio)));
      this.dueño.tocar();
    }
  }

  /**
   * Pasa uno del grupo de `creature` —o el veterano `veterano`— al otro lado del
   * reparto que se edita: `hacia` el héroe o la guarnición. Solo cambia la pantalla;
   * lo que no cabría lo dice «Confirmar».
   */
  mover(hacia: 'heroe' | 'guarnicion', creature: string, veterano?: string): void {
    const abierto = this.repartoEnPantalla;
    const vista = this.vista();
    if (abierto === null || vista === null) return;
    // El grupo tiene que estar en el lado del que sale: así no se pide uno que no hay.
    const origen = hacia === 'heroe' ? vista.guarnicion : vista.heroe;
    const fila = origen.filas.find((g) =>
      veterano === undefined
        ? g.creature === creature && g.veterania === undefined
        : g.veterania?.id === veterano,
    );
    if (fila === undefined) {
      this.dueño.barra(
        `no queda ningún ${unidadDelJuego(creature).name} ${hacia === 'heroe' ? 'en la guarnición' : `con ${vista.hero.name}`}`,
      );
      this.dueño.tocar();
      return;
    }
    if (veterano !== undefined) {
      abierto.lineas =
        hacia === 'heroe'
          ? [...abierto.lineas, { veterano }]
          : abierto.lineas.filter((l) => !('veterano' in l && l.veterano === veterano));
    } else {
      const antes = abierto.lineas.find(
        (l): l is { creature: string; count: number } => 'creature' in l && l.creature === creature,
      );
      const count = (antes?.count ?? 0) + (hacia === 'heroe' ? 1 : -1);
      abierto.lineas = [...abierto.lineas.filter((l) => l !== antes), { creature, count }];
    }
    this.dueño.barra('');
    this.dueño.tocar();
  }

  /**
   * «Confirmar»: manda el reparto al núcleo (`repartir_tropa`, que juzga solo el
   * reparto final) y cierra la pantalla. Sin cambios, la cierra sin más; con un
   * rechazo, se queda abierta con su motivo en la barra.
   */
  confirmar(): void {
    const abierto = this.repartoEnPantalla;
    const vista = this.vista();
    if (abierto === null || vista === null) return;
    if (!vista.cambia) {
      this.cerrar();
      return;
    }
    if (vista.motivo !== null) {
      this.dueño.barra(comoFrase(vista.motivo));
      this.dueño.tocar();
      return;
    }
    const hecho = this.dueño.run(() =>
      applyAdventureAction(
        this.dueño.estado(),
        { type: 'repartir_tropa', hero: abierto.hero, enElHeroe: abierto.lineas },
        this.dueño.ctx(),
        this.dueño.viewer(),
      ),
    );
    if (hecho) this.cerrar();
  }

  /**
   * La obra del puesto donde está `hero` (`laObraDelPuesto`), con el turno en su
   * motivo: fuera de turno no se mejora, pero «ya está amurallado» es una nota y
   * sigue siéndolo. La lee la vista de la guarnición.
   */
  private obraDelPuesto(hero: Hero): LaObraDelPuesto | null {
    const obra = laObraDelPuesto(this.dueño.estado(), this.dueño.viewer(), hero, this.dueño.oro());
    if (obra === null || obra.nota !== null) return obra;
    return { ...obra, motivo: this.dueño.bloqueoDeTurno() ?? obra.motivo };
  }
}
