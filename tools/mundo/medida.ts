/**
 * `pnpm mundo medir`: cuánta trama lleva un mundo, en cifras que se comparan (la
 * trama de los mundos, 22-10-2026): cuántos lugares y en cuántas regiones, cuán
 * hondas son las conversaciones de su gente, qué marcas cruzan de un lugar a otro,
 * cuántos lugares encadenan y qué desenlaces se excluyen.
 *
 * **Es una medida, no una regla**: los niveles y los desenlaces los pide la skill y
 * no el validador (un motor que tiene que llegar a una cifra la cumple con relleno,
 * `critica.md`). Lo que dice si es plano es leer la biblia y un diálogo entero.
 */
import { buildMap } from '../../src/core/map/generate.js';
import {
  batallaDe,
  type Condicion,
  type Dialogo,
  type Efecto,
  efectosDe,
  type Lugar,
  type MundoLeido,
} from '../../src/core/mundo/formato.js';
import { regionDeCasilla } from '../../src/core/state/asaltantes.js';
import { palabrasDe } from './disco.js';

/** Las conversaciones de una persona de un lugar. */
export interface MedidaDePersona {
  readonly lugar: string;
  readonly punto: string;
  readonly nombre: string;
  /** Nodos de su diálogo. */
  readonly nodos: number;
  /**
   * A cuántos niveles del `inicio` queda el nodo más lejano, por el camino más corto
   * por `ir` y sin mirar condiciones: el inicio es el nivel 1 (inicio → pregunta →
   * respuesta, 3). Es como lo cuenta la
   * skill («tres niveles de hondo»); antes eran aristas y el mismo árbol daba 2 (H5 del
   * QA de la trama).
   */
  readonly niveles: number;
  /** Opciones que hacen algo (`hace`). */
  readonly conHace: number;
}

export interface MedidaDelMundo {
  readonly lugares: number;
  /** En cuántas regiones distintas están. */
  readonly regiones: number;
  readonly marcas: number;
  /** Las marcas que pone un lugar y lee otro (en el `si` de una opción o de un punto, también dentro de `no`). */
  readonly marcasQueCruzan: readonly string[];
  /** Lugares de la mayor cadena unida por marcas que cruzan (uno suelto cuenta 1). */
  readonly encadenados: number;
  /**
   * Pares de marcas que se excluyen: una opción pone A y pide «no B», y otra pone B
   * y pide «no A» (sus efectos y los de su batalla; su `si` y el de su punto). Son
   * los desenlaces de la trama, como los escribe la skill.
   */
  readonly exclusiones: readonly (readonly [string, string])[];
  /** Palabras de la biblia, o `null` si no la tiene. */
  readonly palabrasDeLaBiblia: number | null;
  readonly personas: readonly MedidaDePersona[];
}

/** Las marcas que lee una condición, cada una con si se pide que no esté (`no`, que se anula de dos en dos). */
function marcasDe(c: Condicion, negada = false): { marca: string; negada: boolean }[] {
  if ('marca' in c) return [{ marca: c.marca, negada }];
  if ('no' in c) return marcasDe(c.no, !negada);
  return [];
}

/**
 * Cada opción de un lugar con su `si` entero (el suyo y el de su punto) y lo que pone
 * en el mundo: sus efectos y, si abre una batalla, los de ganarla y perderla. Un
 * encuentro que no abre ninguna opción no se pelea: lo suyo no se pone.
 */
function opcionesConEfectos(lugar: Lugar): { si: Condicion[]; efectos: Efecto[] }[] {
  return lugar.puntos.flatMap((p) =>
    Object.values(lugar.dialogos[p.dialogo]?.nodos ?? {}).flatMap((n) =>
      n.opciones.map((o) => {
        const batalla = batallaDe(o);
        const encuentro = batalla === null ? undefined : lugar.encuentros[batalla];
        return {
          si: [...(p.si ?? []), ...(o.si ?? [])],
          efectos: [
            ...(o.hace ?? []),
            ...(encuentro?.alGanar ?? []),
            ...(encuentro?.alPerder ?? []),
          ],
        };
      }),
    ),
  );
}

/**
 * Los niveles de un diálogo: los del camino más corto al nodo más lejano desde el
 * inicio por sus `ir` (en anchura), contando el inicio como el 1. No usa `recorrido`
 * (`reglas.ts`): da el orden, no la distancia.
 */
function nivelesDe(d: Dialogo): number {
  const nivel = new Map<string, number>([[d.inicio, 1]]);
  const cola = [d.inicio];
  for (let i = 0; i < cola.length; i++) {
    const id = cola[i] as string;
    for (const o of d.nodos[id]?.opciones ?? []) {
      if (o.ir === undefined || nivel.has(o.ir)) continue;
      nivel.set(o.ir, (nivel.get(id) ?? 1) + 1);
      cola.push(o.ir);
    }
  }
  return Math.max(...nivel.values());
}

/** Cuántos nodos tiene la mayor componente de un grafo (union-find; 0 sin nodos). */
function componenteMayor(
  nodos: readonly string[],
  aristas: readonly (readonly [string, string])[],
): number {
  const padre = new Map(nodos.map((n) => [n, n]));
  const raiz = (x: string): string => {
    const p = padre.get(x) ?? x;
    return p === x ? x : raiz(p);
  };
  for (const [a, b] of aristas) padre.set(raiz(a), raiz(b));
  const tamaños = new Map<string, number>();
  for (const n of nodos) tamaños.set(raiz(n), (tamaños.get(raiz(n)) ?? 0) + 1);
  return Math.max(0, ...tamaños.values());
}

/** Añade `valor` al conjunto de `clave`. */
function apuntar(m: Map<string, Set<string>>, clave: string, valor: string): void {
  const s = m.get(clave) ?? new Set<string>();
  s.add(valor);
  m.set(clave, s);
}

/** Las cifras de la trama de un mundo leído; `biblia`, su texto o `null` si no la tiene. */
export function medirMundo(leido: MundoLeido, biblia: string | null): MedidaDelMundo {
  const { historia, plan } = leido;
  const { map } = buildMap(plan);
  const regiones = new Set(historia.lugares.map((l) => regionDeCasilla(map, l.at)));

  // Por marca, qué lugares la ponen y cuáles la leen; por marca puesta, las que la
  // misma opción pide que no estén (los desenlaces que se excluyen).
  const ponen = new Map<string, Set<string>>();
  const leen = new Map<string, Set<string>>();
  const poneSinLas = new Map<string, Set<string>>();
  for (const l of historia.lugares) {
    for (const p of l.puntos)
      for (const { marca } of (p.si ?? []).flatMap((c) => marcasDe(c))) apuntar(leen, marca, l.id);
    for (const o of opcionesConEfectos(l)) {
      const leidas = o.si.flatMap((c) => marcasDe(c));
      for (const { marca } of leidas) apuntar(leen, marca, l.id);
      for (const { marca: a } of efectosDe(o.efectos, 'marca')) {
        apuntar(ponen, a, l.id);
        for (const b of leidas) if (b.negada && b.marca !== a) apuntar(poneSinLas, a, b.marca);
      }
    }
  }

  // Las que cruzan: puestas en un lugar y leídas en otro; cada cruce une dos lugares.
  const cruces = (marca: string): (readonly [string, string])[] =>
    [...(ponen.get(marca) ?? [])].flatMap((a) =>
      [...(leen.get(marca) ?? [])].filter((b) => b !== a).map((b) => [a, b] as const),
    );
  const marcas = Object.keys(historia.marcas);
  const marcasQueCruzan = marcas.filter((m) => cruces(m).length > 0);
  const encadenados = componenteMayor(
    historia.lugares.map((l) => l.id),
    marcas.flatMap(cruces),
  );

  const exclusiones = [...poneSinLas].flatMap(([a, sinLas]) =>
    [...sinLas].filter((b) => a < b && poneSinLas.get(b)?.has(a)).map((b) => [a, b] as const),
  );

  const personas: MedidaDePersona[] = historia.lugares.flatMap((l) =>
    l.puntos.flatMap((p) => {
      const d = l.dialogos[p.dialogo];
      if (p.persona === undefined || d === undefined) return [];
      const nodos = Object.values(d.nodos);
      return [
        {
          lugar: l.id,
          punto: p.id,
          nombre: p.persona.nombre,
          nodos: nodos.length,
          niveles: nivelesDe(d),
          conHace: nodos.reduce(
            (n, x) => n + x.opciones.filter((o) => o.hace !== undefined).length,
            0,
          ),
        },
      ];
    }),
  );

  return {
    lugares: historia.lugares.length,
    regiones: regiones.size,
    marcas: marcas.length,
    marcasQueCruzan,
    encadenados,
    exclusiones,
    palabrasDeLaBiblia: biblia === null ? null : palabrasDe(biblia),
    personas,
  };
}

/** Una lista dicha: sus elementos con comas, o «—» si no tiene ninguno. */
function lista(xs: readonly string[]): string {
  return xs.length === 0 ? '—' : xs.join(', ');
}

/** La medida de un mundo para `pnpm mundo medir`: una línea del mundo y una por persona. */
export function describirMedida(id: string, m: MedidaDelMundo): string[] {
  return [
    [
      `${id}: lugares: ${m.lugares}`,
      `regiones: ${m.regiones}`,
      `marcas: ${m.marcas}`,
      `marcas que cruzan: ${lista(m.marcasQueCruzan)}`,
      `lugares encadenados: ${m.encadenados}`,
      `desenlaces que se excluyen: ${lista(m.exclusiones.map(([a, b]) => `${a} / ${b}`))}`,
      `palabras de la biblia: ${m.palabrasDeLaBiblia ?? 'no tiene biblia'}`,
    ].join(' · '),
    ...m.personas.map(
      (p) =>
        `  ${p.lugar} · ${p.nombre}: nodos: ${p.nodos} · niveles: ${p.niveles} · opciones que hacen algo: ${p.conHace}`,
    ),
  ];
}
