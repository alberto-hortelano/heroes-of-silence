/**
 * La petición de diseñar el mapa (`serializeMapRequest`): lo que se pide, con qué
 * tamaño y cómo se reparten las regiones y los niveles.
 *
 * Era parte de `serialize.ts`, que se partió en la fase N de la reorganización
 * (07-11-2026) en `vistas.ts`, `mapa-conocido.ts`, `aventura.ts`, `batalla.ts` y
 * `peticion-de-mapa.ts`.
 */

import { ASALTANTES } from '../hero/grupos.js';
import { LIDERAZGO } from '../hero/liderazgo.js';
import { NIVEL_POR_SUELO } from '../map/generar/datos.js';
import { regionesDelMapa } from '../map/generar/plan.js';
import { LADO_DEL_RECINTO, SEPARACION_DE_CIUDADES } from '../map/recinto.js';
import { BARRERAS, BARRERAS_DE_DESNIVEL, SUELOS_PISABLES, TERRAIN_KINDS } from '../map/terrain.js';
import { REGLA_DEL_PUEBLO } from '../state/renta.js';
import { FACTION_IDS, type PlayerId } from '../types.js';
import { unidadesDeFaccion } from '../unidad/catalogo.js';
import { nivelDeUnidad } from '../unidad/nivel.js';

export interface MapRequestOptions {
  readonly width: number;
  readonly height: number;
  /**
   * **Los ids, no cuántos** (#101). Con un número, el agente sabía que había dos
   * jugadores y tenía que sacar de una convención en prosa —«numerados desde
   * 0»— que eran el 0 y el 1. El llamante tiene la lista en la mano
   * (`MapRequestOptions.players`) y la tiraba con un `.length`.
   */
  readonly players: readonly PlayerId[];
  readonly theme?: string;
}

/**
 * Cómo haría el procedimental un mapa de ese lado (#195): cuántas regiones y
 * qué lleva cada una. Es un consejo y no una regla: el plan del agente se sigue
 * validando por su red (`validateMapPlan`), no por cuántas regiones o pueblos
 * trae. Sale de las mismas funciones que usa el generador.
 */
function comoRepartePorRegiones(width: number, height: number): string {
  const regiones = regionesDelMapa(width, height);
  return (
    `En ${width}×${height} el mapa procedimental hace ${regiones} regiones por jugador, en espejo: ` +
    `la de casa con la base, y cada una de las ${regiones - 1} de fuera con un pueblo, que ${REGLA_DEL_PUEBLO}.`
  );
}

/**
 * El reparto de alturas del procedimental (#209), en una frase: la de casa al
 * llano y las demás por su suelo, con los pesos de `data/relieve.json`. Un
 * consejo, como el de los pueblos: el plan se valida por sus barreras
 * (`problemasDeNiveles`), no por qué nivel elige. Sale de la tabla que sortea el
 * generador, así que no se queda atrás si se retoca.
 */
function comoRepartenLosNiveles(): string {
  const citar = (bs: readonly string[]): string => bs.map((b) => `"${b}"`).join(', ');
  const porSuelo = SUELOS_PISABLES.map((suelo) => {
    const fila = NIVEL_POR_SUELO[suelo];
    const total = fila.reduce((t, p) => t + p.peso, 0);
    const partes = fila.map((p) =>
      fila.length === 1 ? `${p.nivel}` : `${p.nivel} el ${Math.round((p.peso * 100) / total)} %`,
    );
    return `${suelo} al ${partes.join(' y al ')}`;
  });
  return (
    'Alturas: el mapa procedimental pone la región de casa de cada jugador al nivel 1 y cada pareja en espejo de las demás a un mismo nivel, ' +
    `sorteado por su suelo: ${porSuelo.join('; ')}. Entre dos niveles pone ${citar(BARRERAS_DE_DESNIVEL)}; nunca ${citar(BARRERAS.filter((b) => !BARRERAS_DE_DESNIVEL.includes(b)))}.`
  );
}

/**
 * Hasta qué nivel se sugieren unidades para guardar el mapa
 * (`palette.creaturesForGuards`): una sugerencia, no una regla —`validateMapPlan`
 * acepta cualquier unidad del catálogo—. Era la morada 4 de caballeros y
 * nigromantes; con las cinco facciones, el nivel 3 deja fuera a los jinetes.
 */
const NIVEL_MAXIMO_DE_GUARDIA = 3;

export function serializeMapRequest(opts: MapRequestOptions) {
  return {
    kind: 'map_generate',
    want: {
      width: opts.width,
      height: opts.height,
      players: opts.players,
      theme: opts.theme ?? 'un valle en disputa entre dos ejércitos',
    },
    palette: {
      // Derivada, no copiada: era la tercera declaración de la misma lista de
      // ocho y se habría quedado atrás en silencio el día que entrara un terreno.
      terrains: [...TERRAIN_KINDS],
      // Con qué se levanta un muro. Derivado igual que los terrenos: es la lista
      // que valida `validateMapPlan`, no una copia.
      wallTerrains: [...BARRERAS],
      factions: [...FACTION_IDS],
      // Lo que un plan puede poner en `raiders`: el techo y los grupos con los
      // que brotan en partida, que valen todos. Sale de los datos y no se
      // copia, igual que el resto de la paleta.
      raiders: {
        maxIndividuals: LIDERAZGO.maxPorBando,
        maxLeadership: ASALTANTES.liderazgoMax,
        maxStrength: ASALTANTES.fuerzaMax,
        examples: ASALTANTES.composiciones,
      },
      // Derivada del catálogo y no escrita a mano (#108): las unidades de nivel
      // ≤ `NIVEL_MAXIMO_DE_GUARDIA` de cada facción.
      // La prosa le dice al agente que use estas tal cual, así que una copia que
      // se quedara atrás le haría escribir un id que `validateMapPlan` rechaza.
      creaturesForGuards: FACTION_IDS.flatMap((f) =>
        unidadesDeFaccion(f)
          .filter((u) => nivelDeUnidad(u) <= NIVEL_MAXIMO_DE_GUARDIA)
          .map((u) => u.id),
      ),
    },
    advice: [
      'Reparte los pueblos para que los dos jugadores tengan renta que ganar cerca de casa.',
      comoRepartePorRegiones(opts.width, opts.height),
      comoRepartenLosNiveles(),
      'Los monstruos custodian lo bueno: cuanto mejor el premio, más dura la guardia.',
      'Deja el centro del mapa disputado y los bordes seguros.',
      'Pon las ciudades en los cruces de tres regiones o más, y que cada base tenga dos caminos distintos hasta las ciudades que le quedan cerca: así aislarlas es posible pero no trivial.',
      'Un camino entra en un pueblo por la casilla de debajo, que es su puerta, y no lo atraviesa: si sigue hacia otro sitio, pasa por la fila de delante y deja un ramal de una casilla hasta la puerta.',
      `A una ciudad, en cambio, se entra por las puertas de su recinto de ${LADO_DEL_RECINTO}×${LADO_DEL_RECINTO}: lleva el camino de cada región que la toque de un acceso a dos casillas (al norte, al sur o en diagonal) a la puerta de esa cara y de ahí a la ciudad; deja ${SEPARACION_DE_CIUDADES} casillas entre dos ciudades y nada dentro de un recinto. El héroe de cada jugador empieza en su base y sale por sus puertas.`,
    ],
  };
}
