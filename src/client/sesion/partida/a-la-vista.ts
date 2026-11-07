/**
 * Lo que la persona ve del mapa (`ALaVista`): lo explorado y lo que mira ahora (la niebla
 * de dos tonos), los grupos de asaltantes y los héroes que ve, los objetos como los sabe y
 * los sitios que sabe ocupados, y la crónica que le consta; con «Ver mapa entero» (`todo`),
 * todo. Las reglas son del núcleo (`visibleNow`, `asaltantesALaVista`, `heroesALaVista`,
 * `objetosConocidos`, `cronicaPara`); aquí, lo que se guarda entre fotogramas para no
 * pedirlas en cada uno, y lo que cambia mientras el héroe anda su marcha, que la pieza lee
 * de la sesión. Era parte de `Session` (`sesion/partida.ts`) hasta R6 de la reorganización
 * (07-11-2026); la sesión delega en ella.
 */
import type { CasillasLeidas } from '@core/map/casillas.js';
import type { MapObject } from '@core/map/tipos.js';
import { type AsaltantesALaVista, asaltantesALaVista } from '@core/state/asaltantes.js';
import { cronicaPara, type GameEventDraft } from '@core/state/events.js';
import { heroesALaVista, objetosConocidos, visibleNow } from '@core/state/vision.js';
import type { Hero, Point } from '@core/types.js';
import { conLosDueñosSabidos, type SitioOcupado } from '../../render/mapa/sitios-sabidos.js';
import type { NieblaDeLaMarcha } from '../vistas/marcha.js';
import type { DueñoDeLasPiezas } from './comun.js';

/** Lo que se sabe de los objetos del mapa: cada uno como se sabe, y los sitios ocupados. */
export type LoConocido = ReturnType<typeof conLosDueñosSabidos>;

/** Lo que la pieza de lo que se ve lee de la sesión. */
interface DueñoDeLoQueSeVe
  extends Pick<DueñoDeLasPiezas, 'estado' | 'viewer' | 'version' | 'tocar' | 'jugador'> {
  /**
   * La marcha que el mapa enseña, o `null` (`Session.marchaEnCurso`): quién anda, en qué
   * casilla de su marcha va (la que pisa, o la de salida si aún no pisó ninguna) y lo que se
   * sabía de los objetos al salir, que es lo que se pinta mientras anda.
   */
  marcha(): {
    readonly heroe: string;
    readonly pisa: Point;
    readonly conocidoAlSalir: LoConocido;
  } | null;
  /**
   * La niebla de la marcha que se enseña (`sesion/vistas/marcha.ts`), o `null` sin marcha o
   * viéndolo todo.
   */
  nieblaDeLaMarcha(): NieblaDeLaMarcha | null;
}

export class ALaVista {
  private todoALaVista = false;
  private cacheVisibles: { clave: string; casillas: CasillasLeidas } | null = null;
  private cacheAsaltantes: {
    mirando: CasillasLeidas;
    grupos: AsaltantesALaVista;
  } | null = null;
  private cacheObjetos: {
    mirando: CasillasLeidas | null;
    version: number;
    conocido: LoConocido;
  } | null = null;
  private cacheObjetosEnLaMarcha: {
    mirando: CasillasLeidas | null;
    antes: LoConocido;
    conocido: LoConocido;
  } | null = null;

  constructor(private readonly dueño: DueñoDeLoQueSeVe) {}

  /** «Ver mapa entero» (`Session.revealAll`): cambiarlo es un cambio que se ve. */
  get todo(): boolean {
    return this.todoALaVista;
  }
  set todo(v: boolean) {
    this.todoALaVista = v;
    this.dueño.tocar();
  }

  /** Lo explorado por la persona, o `null` si se ha pedido verlo todo. */
  get explorado(): CasillasLeidas | null {
    if (this.todo) return null;
    // Mientras el héroe anda, la niebla va con él (`sesion/vistas/marcha.ts`).
    return this.dueño.nieblaDeLaMarcha()?.explorado ?? this.dueño.jugador().fog;
  }

  /**
   * Las casillas que la persona está mirando AHORA, para la niebla de dos tonos.
   *
   * `visibleNow` recorre héroes, castillos y nodos; se pide en cada fotograma, así que se
   * guarda mientras no cambie nada que la mueva: la crónica crece con cada
   * movimiento y captura, y el turno cambia al pasar de día.
   */
  visibles(): CasillasLeidas {
    const marcha = this.dueño.nieblaDeLaMarcha();
    if (marcha !== null) return marcha.visibles;
    const state = this.dueño.estado();
    const clave = `${state.log.length}|${state.day}|${state.current}`;
    if (this.cacheVisibles === null || this.cacheVisibles.clave !== clave) {
      this.cacheVisibles = {
        clave,
        casillas: visibleNow(this.dueño.estado(), this.dueño.viewer()),
      };
    }
    return this.cacheVisibles.casillas;
  }

  /**
   * Los grupos de asaltantes que la persona ve: los que pinta el lienzo, lee la
   * barra y avisan en la ruta. La regla es del núcleo (`asaltantesALaVista`:
   * si se mira su casilla). Con «Ver mapa entero», todos y sin caché.
   */
  asaltantes(): AsaltantesALaVista {
    if (this.todo) return asaltantesALaVista(this.dueño.estado(), null);
    // Se guarda mientras `visibles()` devuelva las mismas casillas: los grupos se
    // mueven al pasar de día y se van con un hecho de la crónica, que son justo
    // las dos cosas que lo renuevan.
    const mirando = this.visibles();
    if (this.cacheAsaltantes?.mirando !== mirando) {
      this.cacheAsaltantes = {
        mirando,
        grupos: asaltantesALaVista(this.dueño.estado(), mirando),
      };
    }
    return this.cacheAsaltantes.grupos;
  }

  /**
   * Los héroes que la persona ve: los suyos y los rivales que está mirando
   * AHORA. La regla es del núcleo (`heroesALaVista`, la del `enemyHeroes` del
   * agente); la leen el lienzo, el minimapa y la barra. Antes pintaban
   * `state.heroes` recortado por `fog`, y el rival se veía andar por cualquier
   * casilla pisada alguna vez (#64). Son unos pocos: no se guarda.
   */
  heroes(): readonly Hero[] {
    const heroes = heroesALaVista(
      this.dueño.estado(),
      this.dueño.viewer(),
      this.todo ? null : this.visibles(),
    );
    // Mientras anda, el héroe está en la casilla de su marcha que pisa (el minimapa,
    // la barra), no en la de llegada.
    const m = this.dueño.marcha();
    if (m === null) return heroes;
    return heroes.map((h) => (h.id === m.heroe ? { ...h, at: m.pisa } : h));
  }

  /**
   * Los objetos del mapa como los sabe la persona: vivos donde mira ahora y,
   * en lo demás explorado, como los vio por última vez (`objetosConocidos`, la
   * misma regla que el `knownMap` del agente). La bandera de un castillo o un
   * nodo lejano es la de su último dueño visto, no la de hoy (#64).
   *
   * Se guarda mientras `visibles()` devuelva las mismas casillas y no se mueva
   * `version`: el recuerdo crece al explorar, que es andar, y lo vivo cambia con
   * una acción; las dos cosas renuevan una de las dos llaves. El lienzo lo pide a
   * cada fotograma, y el minimapa rehace su fondo cuando cambia este array.
   */
  objetos(): readonly MapObject[] {
    return this.conocido().objetos;
  }

  /**
   * Las ciudades y los pueblos que la persona sabe ocupados (`ocupanteDe`, como
   * los vio): dónde y de quién es el ocupante (`null`, una guarnición neutral). Lo
   * pinta el lienzo con la marca de la ocupación, del color del ocupante (tarea 2).
   */
  ocupados(): readonly SitioOcupado[] {
    return this.conocido().ocupados;
  }

  /**
   * Lo que se sabe de los objetos, una vez por llave: los objetos, cada ciudad y
   * cada pueblo con el dueño que se sabe (`RememberedObject.sitio`), y los sitios
   * ocupados (`conLosDueñosSabidos`). Es una copia: el estado no se toca. La lee
   * también la marcha, que guarda una al salir.
   */
  conocido(): LoConocido {
    const m = this.dueño.marcha();
    if (m !== null) return this.conocidoEnLaMarcha(m.conocidoAlSalir);
    const mirando = this.todo ? null : this.visibles();
    const c = this.cacheObjetos;
    if (c !== null && c.mirando === mirando && c.version === this.dueño.version())
      return c.conocido;
    const conocido = conLosDueñosSabidos(
      objetosConocidos(this.dueño.estado(), this.dueño.viewer(), mirando),
    );
    this.cacheObjetos = { mirando, version: this.dueño.version(), conocido };
    return conocido;
  }

  /**
   * La crónica que le consta a la persona: lo suyo, el reloj y lo que estaba
   * mirando cuando pasó (`cronicaPara`, la misma regla que la del agente). Iba
   * entera a propósito mientras el lienzo pintaba con `fog`, para que no se
   * viera al rival en el mapa sin una línea que lo contara; con el lienzo en
   * `visibleNow` (#64) iría al revés, contando lo que el mapa calla. Con «Ver
   * mapa entero», entera.
   */
  cronica(cuantos: number): readonly GameEventDraft[] {
    return this.todo
      ? this.dueño.estado().log.slice(-cuantos)
      : cronicaPara(this.dueño.estado(), this.dueño.viewer(), cuantos);
  }

  /**
   * Lo que se sabe de los objetos mientras el héroe anda: como se sabían al salir
   * (`antes`), y lo que no se sabía —lo de una región que descubre por el camino—,
   * como lo sabe el núcleo. Así el cofre que coge, el paso que toma o el castillo
   * que conquista cambian al llegar, como el panel.
   */
  private conocidoEnLaMarcha(antes: LoConocido): LoConocido {
    const mirando = this.todo ? null : this.visibles();
    const c = this.cacheObjetosEnLaMarcha;
    if (c !== null && c.mirando === mirando && c.antes === antes) return c.conocido;
    const deAntes = new Map(antes.objetos.map((o) => [o.id, o] as const));
    const ahora = conLosDueñosSabidos(
      objetosConocidos(this.dueño.estado(), this.dueño.viewer(), mirando),
    );
    // Lo que no se sabía, solo si ya se ha descubierto por donde va: el recuerdo
    // del núcleo ya trae lo de toda la marcha.
    const explorado = this.explorado;
    const conocido = {
      objetos: ahora.objetos.flatMap((o) => {
        const antesDeAndar = deAntes.get(o.id);
        if (antesDeAndar !== undefined) return [antesDeAndar];
        return explorado === null || explorado.has(o.at) ? [o] : [];
      }),
      ocupados: antes.ocupados,
    };
    this.cacheObjetosEnLaMarcha = { mirando, antes, conocido };
    return conocido;
  }
}
