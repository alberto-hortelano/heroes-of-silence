/**
 * **Las fugas de los hechos que lee el agente**: la lista cerrada de claves y los
 * enumerados del núcleo que no pueden salir de `contract/hechos.ts`. Lo que el
 * compilador no sabe —qué es español— lo sabe este módulo.
 *
 * Aparte de su test (`hechos-del-agente.test.ts`, las muestras) porque lo lee
 * también `cronica.test.ts`, que ya juega una partida entera de la IA y le pasa su
 * crónica: jugarla dos veces para mirar lo mismo era pagar la partida dos veces.
 */
import {
  CUANDO_AL_AGENTE,
  EFECTO_AL_AGENTE,
  HIT_DE_GOLPE,
  JUGADA_DE_MURALLA,
  SLOT_DE_HUECO,
  UPGRADE_DE_MEJORA,
  VENCE_AL_AGENTE,
} from '../src/core/contract/vocabulario.js';

/**
 * **La lista cerrada**: toda clave que puede llevar un hecho que lee el agente, de
 * batalla o de crónica, a cualquier profundidad (las de las coordenadas incluidas:
 * `col`, `row`, `x`, `y`, `a`, `b`). En orden alfabético. Añadir una es decir que
 * está en las palabras del contrato: en inglés, y la misma que usen las vistas
 * para ese hecho (`hero`, `owner`, `garrison`, `upgrade`…).
 */
export const CLAVES_DE_LOS_HECHOS: readonly string[] = [
  'a',
  'actor',
  'amount',
  'at',
  'attacker',
  'b',
  'blocked',
  'building',
  'by',
  'casts',
  'changes',
  'charge',
  'col',
  'cost',
  'count',
  'creature',
  'damage',
  'day',
  'defender',
  'deferred',
  'effect',
  'encounter',
  'expires',
  'fighting',
  'foe',
  'foot',
  'from',
  'garrison',
  'gate',
  'gold',
  'healed',
  'hero',
  'heroId',
  'hit',
  'item',
  'killed',
  'kind',
  'left',
  'lost',
  'mark',
  'name',
  'node',
  'objectId',
  'option',
  'owner',
  'owners',
  'path',
  'place',
  'point',
  'power',
  'quarter',
  'raider',
  'raiderId',
  'rank',
  'reason',
  'remaining',
  'response',
  'retaliation',
  'round',
  'rounds',
  'row',
  'side',
  'site',
  'source',
  'spell',
  'spells',
  'spent',
  'splash',
  'stack',
  'stacks',
  'state',
  'stateName',
  'staying',
  'summary',
  'surrendered',
  'taken',
  'target',
  'to',
  'town',
  'troops',
  'turnOf',
  'upgrade',
  'veteran',
  'wall',
  'week',
  'when',
  'winner',
  'x',
  'y',
];

/** Los campos cuyo valor es un enumerado del contrato: donde un valor del núcleo sería una fuga. */
const CAMPOS_ENUMERADOS: ReadonlySet<string> = new Set([
  'kind',
  'effect',
  'when',
  'expires',
  'hit',
  'response',
  'upgrade',
  'from',
]);

/**
 * Los valores del lado español: las claves de las tablas de `vocabulario.ts` que no
 * se dicen igual en el contrato (`speed` y `normal` sí), y los `kind` que el núcleo
 * escribe en español.
 */
const VALORES_DEL_NUCLEO: ReadonlySet<string> = new Set([
  ...[
    HIT_DE_GOLPE,
    CUANDO_AL_AGENTE,
    EFECTO_AL_AGENTE,
    VENCE_AL_AGENTE,
    UPGRADE_DE_MEJORA,
    SLOT_DE_HUECO,
    JUGADA_DE_MURALLA,
  ].flatMap((tabla) =>
    Object.entries(tabla)
      .filter(([nucleo, agente]) => nucleo !== agente)
      .map(([nucleo]) => nucleo),
  ),
  'cruce',
  'retoque',
  'lugar',
  'heroe',
  'guarnicion',
]);

/**
 * Los golpes de la rueda en la palabra del núcleo: lo único español que puede ir en
 * un `source` (QA, H1, 10-11-2026). Aparte de `CAMPOS_ENUMERADOS` porque un `source`
 * es también un id del catálogo, que escribe quien edita los hechizos y va en
 * español (`escudo_arcano`, y el día que haya uno, `armadura`): contra todos los
 * `VALORES_DEL_NUCLEO` un hechizo así sería una fuga falsa.
 */
const GOLPES_DEL_NUCLEO: ReadonlySet<string> = new Set(
  Object.entries(HIT_DE_GOLPE)
    .filter(([nucleo, agente]) => nucleo !== agente)
    .map(([nucleo]) => nucleo),
);

/** Si `valor` en el campo `clave` es una palabra del núcleo donde va una del contrato. */
function esDelNucleo(clave: string, valor: string): boolean {
  if (clave === 'source') return GOLPES_DEL_NUCLEO.has(valor);
  return CAMPOS_ENUMERADOS.has(clave) && VALORES_DEL_NUCLEO.has(valor);
}

/**
 * Lo que un hecho ya traducido lleva de más: claves fuera de la lista y enumerados
 * del núcleo. `claves` es la lista cerrada con que se mira: la de los hechos, o
 * `null` para mirar solo los valores (una vista, que tiene sus propias claves).
 */
export function fugasDe(
  hecho: unknown,
  claves: readonly string[] | null = CLAVES_DE_LOS_HECHOS,
): string[] {
  const fugas: string[] = [];
  const mirar = (valor: unknown, donde: string): void => {
    if (Array.isArray(valor)) {
      for (const [i, v] of valor.entries()) mirar(v, `${donde}[${i}]`);
      return;
    }
    if (valor === null || typeof valor !== 'object') return;
    for (const [clave, v] of Object.entries(valor)) {
      const aqui = donde === '' ? clave : `${donde}.${clave}`;
      if (claves !== null && !claves.includes(clave)) {
        fugas.push(`la clave «${aqui}» no está en CLAVES_DE_LOS_HECHOS`);
      }
      if (typeof v === 'string' && esDelNucleo(clave, v)) {
        fugas.push(`«${aqui}» vale «${v}», que es la palabra del núcleo`);
      }
      mirar(v, aqui);
    }
  };
  mirar(hecho, '');
  return fugas;
}

/** Las fugas de una tanda de hechos ya traducidos, cada una con el `kind` del hecho del núcleo. */
export function fugasDeTodos<E extends { kind: string }>(
  hechos: readonly E[],
  traducir: (e: E) => unknown,
): string[] {
  return hechos.flatMap((e) => fugasDe(traducir(e)).map((f) => `[${e.kind}] ${f}`));
}
