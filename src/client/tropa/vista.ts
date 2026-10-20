/**
 * Lo que se ve en la escena de la tropa: el héroe y cada individuo que lleva,
 * con la ficha del elegido y lo que se le puede poner o quitar.
 *
 * Solo **lee** el núcleo: las cifras salen de las mismas puertas que la batalla
 * y el agente (`heroUnit`, `troopUnit`), el nivel de `nivelDeUnidad` y cada «no se
 * puede» de su *blocker* (`ponerseBlocker`, `unequipBlocker`), escrito por el
 * núcleo y enseñado tal cual. Lo compone una vez la sesión (`vistaDeLaTropa`,
 * cacheada por su `version`) y lo pintan el lienzo y el panel.
 */
import { armaduraDe } from '@core/battle/armas.js';
import { equipoPuestoDe, unidadDelJuego } from '@core/catalogo.js';
import { figuraDelHeroe, nombreDeTipoDeHeroe, type Pieza } from '@core/data.js';
import {
  destinoDeEquipo,
  equipoDe,
  type Portador,
  pedidoDelPuesto,
  pieza,
} from '@core/hero/equipo.js';
import {
  RANGO_MAXIMO_DE_TROPA,
  rangoDeHeroe,
  rangoDeTropa,
  siguienteUmbral,
} from '@core/hero/experiencia.js';
import { type Hero, heroUnit } from '@core/hero/hero.js';
import { hojaDeLaTropa, troopUnit } from '@core/hero/troop.js';
import { indiceDePoder, nivelDeUnidad } from '@core/nivel.js';
import { type GameState, ponerseBlocker, unequipBlocker } from '@core/state/game.js';
import { HUECOS, type Hueco, type PlayerId, type UnitInfo } from '@core/types.js';

/** Una figura del semicírculo, en el orden del ejército: el héroe primero. */
export interface FiguraDeLaTropa {
  readonly quien: Portador;
  /** Su id para el compás de la figura y para `canvas[data-tropa]`: el del héroe, el de su hoja o su puesto. */
  readonly id: string;
  readonly nombre: string;
  /** La hoja con que se pinta (`figuraDelHeroe`, `hojaDeLaTropa`). */
  readonly cuerpo: string;
}

/** Lo que hay en un hueco del elegido. */
export interface HuecoDeLaFicha {
  readonly hueco: Hueco;
  /** Lo que lleva puesto ahí, suyo o de serie; `null` si nada. */
  readonly pieza: Pieza | null;
  /** Si lo de ese hueco es lo de serie de su unidad: no se quita. */
  readonly deSerie: boolean;
  /**
   * Quitárselo: `null` si no hay nada suyo que quitar (vacío o de serie); si no,
   * el motivo del núcleo para no poder (`unequipBlocker`), o `null` dentro si se puede.
   */
  readonly quitar: { readonly motivo: string | null } | null;
}

/** Una pieza de la mochila del héroe, con el motivo para no ponérsela al elegido o `null`. */
export interface PiezaDeLaMochila {
  readonly pieza: Pieza;
  readonly poner: string | null;
}

/** La ficha del elegido: quién es, cuánto ha vivido, con qué cifras pelea y lo que lleva. */
export interface FichaDeLaTropa {
  readonly nombre: string;
  readonly queEs: string;
  readonly nivel: number;
  readonly indice: number;
  readonly rango: number;
  readonly experiencia: number;
  /** La experiencia del rango siguiente, o `null` en el tope (la tropa, en el 5). */
  readonly siguiente: number | null;
  /** Con hoja de servicios: las batallas de las que salió vivo y sus bajas. */
  readonly servicio: { readonly batallas: number; readonly bajas: number } | null;
  /** Las cifras con que pelea, con lo de serie y lo suyo puesto. */
  readonly cifras: UnitInfo;
  readonly armadura: number;
  readonly huecos: readonly HuecoDeLaFicha[];
  readonly mochila: readonly PiezaDeLaMochila[];
}

export interface VistaDeLaTropa {
  readonly heroId: string;
  readonly heroe: string;
  /** Su color tiñe las figuras (`playerColor`). */
  readonly owner: PlayerId;
  readonly figuras: readonly FiguraDeLaTropa[];
  /** El índice en `figuras` del elegido. */
  readonly elegida: number;
  readonly ficha: FichaDeLaTropa;
}

/** El id de la figura de `quien`: el del héroe, el de su hoja si la tiene, o el de su puesto. */
function idDe(hero: Hero, quien: Portador): string {
  if ('heroe' in quien) return hero.id;
  return hero.army[quien.indice]?.veterania?.id ?? `${hero.id}-puesto-${quien.indice}`;
}

/** Los portadores de `hero` en el orden del ejército: él primero. */
function portadoresDe(hero: Pick<Hero, 'army'>): Portador[] {
  return [{ heroe: true }, ...hero.army.map((_, indice) => ({ indice }))];
}

/** Si `a` y `b` nombran al mismo portador. */
export function mismoPortador(a: Portador, b: Portador): boolean {
  return 'heroe' in a ? 'heroe' in b : 'indice' in b && a.indice === b.indice;
}

/**
 * La vista de la tropa de `hero` con `elegido` elegido. `bloqueo` es por qué no se
 * puede jugar ahora (el turno, `bloqueoDeTurno` de la sesión), o `null`: con él,
 * todo poner y quitar sale apagado con ese motivo.
 */
export function componerVistaDeLaTropa(
  state: GameState,
  viewer: PlayerId,
  hero: Hero,
  elegido: Portador,
  bloqueo: string | null,
): VistaDeLaTropa {
  const figuras = portadoresDe(hero).map((quien): FiguraDeLaTropa => {
    if ('heroe' in quien) {
      return { quien, id: hero.id, nombre: hero.name, cuerpo: figuraDelHeroe(hero) };
    }
    const t = hero.army[quien.indice]!;
    return {
      quien,
      id: idDe(hero, quien),
      nombre: troopUnit(t, state.characters).name,
      cuerpo: hojaDeLaTropa(t),
    };
  });
  const elegida = figuras.findIndex((f) => mismoPortador(f.quien, elegido));
  if (elegida < 0) {
    throw new Error(`la tropa de ${hero.name} no tiene a nadie en el puesto que se ha elegido`);
  }
  return {
    heroId: hero.id,
    heroe: hero.name,
    owner: hero.owner,
    figuras,
    elegida,
    ficha: fichaDe(state, viewer, hero, elegido, bloqueo),
  };
}

function fichaDe(
  state: GameState,
  viewer: PlayerId,
  hero: Hero,
  quien: Portador,
  bloqueo: string | null,
): FichaDeLaTropa {
  // Se le nombra por su puesto, como lo hace la sesión al ponérsela
  // (`pedidoDelPuesto`): el motivo de no poder nombrarlo, el del núcleo.
  const pedido = pedidoDelPuesto(quien);
  const destino = destinoDeEquipo(hero, pedido);
  const sinNombre = 'motivo' in destino ? destino.motivo : null;
  const propio = equipoDe(hero, quien);
  const puesto = equipoPuestoDe(hero, quien);
  const huecos = HUECOS.map((hueco): HuecoDeLaFicha => {
    const id = puesto[hueco];
    const suyo = propio[hueco] !== undefined;
    // Lo suyo solo lo lleva quien tiene hoja (o el héroe): un novato nunca entra aquí.
    const quitar =
      !suyo || sinNombre !== null
        ? null
        : {
            motivo:
              bloqueo ??
              unequipBlocker(state, viewer, {
                type: 'unequip',
                hero: hero.id,
                slot: hueco,
                ...pedido,
              }),
          };
    return {
      hueco,
      pieza: id === undefined ? null : pieza(id),
      deSerie: id !== undefined && !suyo,
      quitar,
    };
  });
  const mochila = hero.mochila.map(
    (id): PiezaDeLaMochila => ({
      pieza: pieza(id),
      poner: bloqueo ?? sinNombre ?? ponerseBlocker(hero, quien, id),
    }),
  );
  const comun = { huecos, mochila };
  if ('heroe' in quien) {
    const cifras = heroUnit(hero);
    const rango = rangoDeHeroe(hero);
    return {
      ...comun,
      nombre: hero.name,
      queEs: `Héroe · ${nombreDeTipoDeHeroe(hero.faction, hero.tipo)}`,
      nivel: nivelDeUnidad(cifras),
      indice: indiceDePoder(cifras),
      rango,
      experiencia: hero.experience,
      siguiente: siguienteUmbral(hero.experience),
      servicio: null,
      cifras,
      armadura: armaduraDe(cifras),
    };
  }
  const t = hero.army[quien.indice]!;
  const cifras = troopUnit(t, state.characters);
  const rango = rangoDeTropa(t.veterania);
  const experiencia = t.veterania?.experiencia ?? 0;
  // «Veterano» desde el rango 2, como el panel del mapa (`lineaDeVeterania`).
  const queEs =
    t.member !== undefined
      ? 'Personaje'
      : `${rango >= 2 ? 'Veterano' : 'Novato'} · ${unidadDelJuego(t.creature).name}`;
  return {
    ...comun,
    nombre: cifras.name,
    queEs,
    nivel: nivelDeUnidad(cifras),
    indice: indiceDePoder(cifras),
    rango,
    experiencia,
    siguiente: siguienteUmbral(experiencia, RANGO_MAXIMO_DE_TROPA),
    servicio:
      t.veterania === undefined
        ? null
        : { batallas: t.veterania.batallas, bajas: t.veterania.bajas },
    cifras,
    armadura: armaduraDe(cifras),
  };
}
