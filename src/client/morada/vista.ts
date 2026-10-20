/**
 * Lo que se ve en la escena de la morada: una figura por unidad que produce, y la
 * ficha de la elegida con lo que hace falta para reclutarla.
 *
 * Solo **lee** el núcleo: las cifras son las de la unidad del catálogo como la
 * juega la partida (`unidadDelJuego`, con su equipo de serie puesto), el nivel de
 * `nivelDeUnidad` y el índice de `indiceDePoder`; lo que se puede reclutar y por
 * qué no, la cuenta y la frase del núcleo (`recruitCapacity`, `reclutarBlocker`),
 * que la sesión pasa hechas (`ReclutamientoDe`) para no repetirlas aquí; si en
 * el sitio hay una morada, `moradaEn`, del núcleo. Lo compone una vez la sesión
 * (`vistaDeLaMorada`, cacheada por su `version`) y lo pintan el lienzo y el panel.
 */
import { armaduraDe } from '@core/battle/armas.js';
import { nombreDelPoder, poder } from '@core/battle/poderes.js';
import { hojaDeUnidad, unidadDelJuego, unidadesDeMorada } from '@core/catalogo.js';
import type { Pieza } from '@core/data.js';
import { pieza } from '@core/hero/equipo.js';
import { indiceDePoder, nivelDeUnidad } from '@core/nivel.js';
import type { RecruitCapacity } from '@core/state/game.js';
import { building } from '@core/town/buildings.js';
import { moradaEn, type SitioId } from '@core/town/sitios.js';
import { recruitCost, type Town } from '@core/town/town.js';
import {
  describirCoste,
  type FactionId,
  HUECOS,
  type Hueco,
  NOMBRE_DE_RASGO,
  type PlayerId,
  type UnitInfo,
} from '@core/types.js';

/** Una figura de la fila: una unidad de la morada. */
export interface FiguraDeLaMorada {
  /** El id de la unidad: para su compás y para `canvas[data-morada]`. */
  readonly id: string;
  readonly nombre: string;
  /** La hoja con que se pinta (`hojaDeUnidad`). */
  readonly cuerpo: string;
}

/** La ficha de la elegida: con qué cifras pelea un recluta y lo que cuesta. */
export interface FichaDeLaMorada {
  readonly id: string;
  readonly nombre: string;
  readonly nivel: number;
  readonly indice: number;
  /** Las cifras con que pelea, con lo de serie puesto. */
  readonly cifras: UnitInfo;
  readonly armadura: number;
  /** Sus rasgos del motor y sus poderes, dichos para la persona. */
  readonly rasgos: readonly string[];
  /** Lo de serie, hueco a hueco: lo que lleva todo recluta. */
  readonly deSerie: readonly { readonly hueco: Hueco; readonly pieza: Pieza }[];
  /** Las que ofrece la morada esta semana y las que suelta cada semana. */
  readonly disponibles: number;
  readonly crecimiento: number;
  /** El precio de uno, ya dicho («120 oro»). */
  readonly precio: string;
  /** Cuánto se puede reclutar ahora (`recruitPlan`), o `null` sin dueño. */
  readonly plan: RecruitCapacity | null;
  /** Por qué no se puede reclutar ni uno, la frase del núcleo, o `null`. */
  readonly motivo: string | null;
}

export interface VistaDeLaMorada {
  readonly faccion: FactionId;
  /** Su color tiñe las figuras (`playerColor`). */
  readonly owner: PlayerId | null;
  readonly sitio: SitioId;
  /** El id del edificio de la morada: el de su arte (su recorte y su versión abierta, `abiertaDe`). */
  readonly edificio: string;
  readonly nombre: string;
  readonly figuras: readonly FiguraDeLaMorada[];
  /** El índice en `figuras` de la elegida. */
  readonly elegida: number;
  readonly ficha: FichaDeLaMorada;
}

/** Cuánto se puede reclutar de una unidad y, si nada, por qué: lo de la sesión (`recruitPlan`, `motivoParaNoReclutar`). */
export type ReclutamientoDe = (id: string) => {
  readonly plan: RecruitCapacity | null;
  readonly motivo: string | null;
};

/**
 * La vista de la morada de `sitio` en `town` con la unidad `elegida` (con
 * `null`, la primera que produce). Es la única que comprueba que ahí haya una
 * morada (`moradaEn`) y que la elegida sea suya, y lanza diciéndolo: la sesión
 * la compone antes de entrar y de elegir, así que no entra ni elige mal.
 */
export function componerVistaDeLaMorada(
  town: Town,
  sitio: SitioId,
  elegida: string | null,
  reclutamiento: ReclutamientoDe,
): VistaDeLaMorada {
  const { edificio, motivo } = moradaEn(town, sitio);
  if (edificio === null) throw new Error(`no se puede entrar en la morada: ${motivo}`);
  const unidades = unidadesDeMorada(edificio);
  const i = elegida === null ? 0 : unidades.findIndex((u) => u.id === elegida);
  const u = unidades[i];
  if (u === undefined) {
    throw new Error(
      elegida === null
        ? `no se puede entrar en la morada: ${building(edificio).name} no produce ninguna unidad`
        : `${unidadDelJuego(elegida).name} no se recluta en ${building(edificio).name}: ahí se reclutan ${unidades.map((x) => x.name).join(', ')}`,
    );
  }
  const { plan, motivo: porQueNo } = reclutamiento(u.id);
  return {
    faccion: town.faction,
    owner: town.owner,
    sitio,
    edificio,
    nombre: building(edificio).name,
    figuras: unidades.map((x) => ({ id: x.id, nombre: x.name, cuerpo: hojaDeUnidad(x.id) })),
    elegida: i,
    ficha: fichaDe(town, u.id, plan, porQueNo),
  };
}

function fichaDe(
  town: Town,
  id: string,
  plan: RecruitCapacity | null,
  motivo: string | null,
): FichaDeLaMorada {
  const u = unidadDelJuego(id);
  const equipo = u.equipo ?? {};
  const deSerie = HUECOS.flatMap((hueco) => {
    const p = equipo[hueco];
    return p === undefined ? [] : [{ hueco, pieza: pieza(p) }];
  });
  return {
    id,
    nombre: u.name,
    nivel: nivelDeUnidad(u),
    indice: indiceDePoder(u),
    cifras: u,
    armadura: armaduraDe(u),
    rasgos: [
      ...(u.traits ?? []).map((t) => NOMBRE_DE_RASGO[t]),
      ...(u.poderes ?? []).map((p) => nombreDelPoder(poder(p))),
    ],
    deSerie,
    disponibles: town.available[id] ?? 0,
    crecimiento: u.growth,
    precio: describirCoste(recruitCost(id, 1)),
    plan,
    motivo,
  };
}
