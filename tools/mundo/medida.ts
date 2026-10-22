/**
 * `pnpm mundo medir`: cuánta trama lleva un mundo, en cifras que se comparan (la
 * trama de los mundos, 22-10-2026): cuántos lugares y en cuántas regiones, cuán
 * hondas son las conversaciones de su gente, qué marcas cruzan de un lugar a otro,
 * cuántos lugares encadenan y qué desenlaces se excluyen.
 *
 * **Es una medida, no una regla**: la hondura y los desenlaces los pide la skill y
 * no el validador (un motor que tiene que llegar a una cifra la cumple con relleno,
 * `critica.md`). Lo que dice si es plano es leer la biblia y un diálogo entero.
 */
import { buildMap } from '../../src/core/map/generate.js';
import type {
  Condicion,
  Dialogo,
  Efecto,
  Lugar,
  MundoLeido,
  Opcion,
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
  /** La distancia más larga desde el `inicio` por `ir`, sin mirar condiciones (0: solo el inicio). */
  readonly hondura: number;
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
   * y pide «no A» (sus efectos y los de su batalla al ganar; su `si` y el de su
   * punto). Son los desenlaces de la trama, como los escribe la skill.
   */
  readonly exclusiones: readonly (readonly [string, string])[];
  /** Palabras de la biblia, o `null` si no la tiene. */
  readonly palabrasDeLaBiblia: number | null;
  readonly personas: readonly MedidaDePersona[];
}

/** Las marcas que lee una condición, también dentro de `no`. */
function marcasLeidas(c: Condicion): string[] {
  if ('marca' in c) return [c.marca];
  if ('no' in c) return marcasLeidas(c.no);
  return [];
}

/** Las marcas que pide que NO estén una lista de condiciones (`{"no": {"marca": …}}`). */
function marcasQueNo(si: readonly Condicion[]): Set<string> {
  return new Set(si.flatMap((c) => ('no' in c && 'marca' in c.no ? [c.no.marca] : [])));
}

function marcasPuestas(efectos: readonly Efecto[]): string[] {
  return efectos.flatMap((e) => ('marca' in e ? [e.marca] : []));
}

/** Cada opción de un lugar con su `si` entero (el suyo y el de su punto) y sus efectos (con los de su batalla al ganar). */
function opcionesDe(lugar: Lugar): { si: Condicion[]; efectos: Efecto[] }[] {
  const salida: { si: Condicion[]; efectos: Efecto[] }[] = [];
  for (const p of lugar.puntos) {
    const d = lugar.dialogos[p.dialogo];
    if (d === undefined) continue;
    for (const n of Object.values(d.nodos)) {
      for (const o of n.opciones as readonly Opcion[]) {
        const hace = o.hace ?? [];
        const batalla = hace.find((e): e is { batalla: string } => 'batalla' in e);
        const alGanar =
          batalla === undefined ? [] : (lugar.encuentros[batalla.batalla]?.alGanar ?? []);
        salida.push({ si: [...(p.si ?? []), ...(o.si ?? [])], efectos: [...hace, ...alGanar] });
      }
    }
  }
  return salida;
}

/** La distancia más larga desde el inicio de un diálogo por sus `ir` (en anchura: la más corta a cada nodo). */
function honduraDe(d: Dialogo): number {
  const distancia = new Map<string, number>([[d.inicio, 0]]);
  const cola = [d.inicio];
  for (let i = 0; i < cola.length; i++) {
    const id = cola[i] as string;
    for (const o of d.nodos[id]?.opciones ?? []) {
      if (o.ir === undefined || distancia.has(o.ir)) continue;
      distancia.set(o.ir, (distancia.get(id) ?? 0) + 1);
      cola.push(o.ir);
    }
  }
  return Math.max(...distancia.values());
}

/** Las cifras de la trama de un mundo leído; `biblia`, su texto o `null` si no la tiene. */
export function medirMundo(leido: MundoLeido, biblia: string | null): MedidaDelMundo {
  const { historia, plan } = leido;
  const { map } = buildMap(plan);
  const regiones = new Set(historia.lugares.map((l) => regionDeCasilla(map, l.at)));

  // Quién pone y quién lee cada marca, por lugar.
  const ponen = new Map<string, Set<string>>();
  const leen = new Map<string, Set<string>>();
  const apuntar = (m: Map<string, Set<string>>, marca: string, lugar: string): void => {
    const s = m.get(marca) ?? new Set<string>();
    s.add(lugar);
    m.set(marca, s);
  };
  for (const l of historia.lugares) {
    for (const o of opcionesDe(l)) {
      for (const m of marcasPuestas(o.efectos)) apuntar(ponen, m, l.id);
      for (const m of o.si.flatMap(marcasLeidas)) apuntar(leen, m, l.id);
    }
    for (const p of l.puntos)
      for (const m of (p.si ?? []).flatMap(marcasLeidas)) apuntar(leen, m, l.id);
    for (const e of Object.values(l.encuentros)) {
      for (const m of marcasPuestas([...e.alGanar, ...e.alPerder])) apuntar(ponen, m, l.id);
    }
  }

  // Las que cruzan y el grafo de lugares que unen, para la mayor cadena.
  const vecinos = new Map<string, Set<string>>(historia.lugares.map((l) => [l.id, new Set()]));
  const marcasQueCruzan: string[] = [];
  for (const marca of Object.keys(historia.marcas)) {
    let cruza = false;
    for (const a of ponen.get(marca) ?? []) {
      for (const b of leen.get(marca) ?? []) {
        if (a === b) continue;
        cruza = true;
        vecinos.get(a)?.add(b);
        vecinos.get(b)?.add(a);
      }
    }
    if (cruza) marcasQueCruzan.push(marca);
  }
  let encadenados = 0;
  const vistos = new Set<string>();
  for (const inicio of vecinos.keys()) {
    if (vistos.has(inicio)) continue;
    const pila = [inicio];
    vistos.add(inicio);
    let n = 0;
    while (pila.length > 0) {
      const x = pila.pop() as string;
      n++;
      for (const y of vecinos.get(x) ?? []) {
        if (!vistos.has(y)) {
          vistos.add(y);
          pila.push(y);
        }
      }
    }
    encadenados = Math.max(encadenados, n);
  }

  // Exclusiones: una opción que pone A pidiendo «no B» y otra que pone B pidiendo «no A».
  const ponePidiendoNo = new Set<string>();
  for (const l of historia.lugares) {
    for (const o of opcionesDe(l)) {
      const no = marcasQueNo(o.si);
      for (const a of marcasPuestas(o.efectos))
        for (const b of no) if (a !== b) ponePidiendoNo.add(`${a}\n${b}`);
    }
  }
  const exclusiones: [string, string][] = [];
  for (const par of ponePidiendoNo) {
    const [a, b] = par.split('\n') as [string, string];
    if (a < b && ponePidiendoNo.has(`${b}\n${a}`)) exclusiones.push([a, b]);
  }

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
          hondura: honduraDe(d),
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
    marcas: Object.keys(historia.marcas).length,
    marcasQueCruzan,
    encadenados,
    exclusiones,
    palabrasDeLaBiblia: biblia === null ? null : palabrasDe(biblia),
    personas,
  };
}
