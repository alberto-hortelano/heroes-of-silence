/**
 * El montaje de la arena (`EstadoDelMontaje`): los puestos y el héroe de cada lado —lo que pelea
 * cada uno (`fuenteDeArena`, `montajeDeArena`), lo que dice su tarjeta, cuántos lleva, añadir y
 * crear una unidad— y quién usa un hechizo. Lo que solo lee un estado lo recibe a él; lo que cruza
 * varios, la página. Era parte de `arena/main.ts` hasta R8 de la reorganización (07-11-2026).
 */
import type { HeroeDeArena } from '@core/arena/heroe.js';
import { type FuenteDeArena, LADOS, type Lado } from '@core/arena/lados.js';
import { escaleraDeArenaBlocker, type MontajeDeArena } from '@core/arena/montaje.js';
import { unidadNueva } from '@core/arena/unidad-nueva.js';
import { catalogoDeMagia, hojaPorId, porQueNoSeMonta, unidadDe } from './catalogo.js';
import type { EstadoDelCatalogo, EstadoDelMontaje, PaginaDeLaArena } from './pagina.js';
import { type DatosDePuesto, type Puesto, resumenDeCifras } from './paneles/bandos.js';
import { avisoDeNuevaUnidad } from './paneles/lista.js';

/** Quién usa el hechizo `id`: los héroes de los bandos (su libro) y las unidades (su poder). */
export function quienUsaElHechizo(pagina: PaginaDeLaArena, id: string): readonly string[] {
  const { catalogo, montaje } = pagina;
  return [
    ...heroesDeLaPagina(montaje)
      .filter((h) => h.hechizos.includes(id))
      .map((h) => h.nombre),
    ...[...catalogo.unidadesDelCatalogo.values()]
      .filter((u) => (u.hechizos ?? []).includes(id))
      .map((u) => u.name),
  ];
}

/** De dónde sale un puesto al pelear: la unidad con sus cifras del catálogo, y su escalera. */
export function fuenteDeArena(catalogo: EstadoDelCatalogo, p: Puesto): FuenteDeArena {
  return { unidad: unidadDe(catalogo, p.unidad), escalera: p.escalera };
}

/** El montaje de ahora, como lo pelearía el núcleo: lo leen «Luchar» y el aviso de la muralla. */
export function montajeDeArena(pagina: PaginaDeLaArena): MontajeDeArena {
  const { catalogo, montaje, editorDeMuralla } = pagina;
  const lado = (l: Lado) => ({
    unidades: montaje.puestos[l].map((p) => fuenteDeArena(catalogo, p)),
    heroe: montaje.heroes[l],
  });
  return {
    izquierda: lado('izquierda'),
    derecha: lado('derecha'),
    muralla: editorDeMuralla.muralla,
    equipo: catalogo.equipo,
    combate: montaje.combate,
    hechizos: catalogoDeMagia(catalogo),
    // Una copia: lo que se edite después entra por el retoque.
    unidadesDeLaPagina: new Map(catalogo.unidadesDelCatalogo),
  };
}

/** Lo que la tarjeta de un puesto de `lado` enseña. */
export function describir(catalogo: EstadoDelCatalogo, p: Puesto, lado: Lado): DatosDePuesto {
  const u = unidadDe(catalogo, p.unidad);
  return {
    nombre: u.name,
    resumen: resumenDeCifras(u, catalogo.equipo),
    figura: u.cuerpo.hoja,
    noEscala: escaleraDeArenaBlocker(fuenteDeArena(catalogo, p), lado, catalogo.equipo),
  };
}

/**
 * Crea una unidad nueva con el cuerpo elegido (el id de su hoja), la mete en el
 * catálogo y la deja elegida; en la edición, además, abre su ficha.
 */
export function crearUnidad(pagina: PaginaDeLaArena, valor: string): string | null {
  const { catalogo, vista } = pagina;
  if (valor === '') {
    vista.aviso = 'Elige primero un cuerpo para la unidad nueva.';
    return null;
  }
  const h = hojaPorId(catalogo, valor);
  if (h.incompleta !== null) throw new Error(`${h.nombre} no se monta: ${h.incompleta}`);
  const u = unidadNueva(
    h,
    {
      validas: [...catalogo.unidadesDelCatalogo.keys()],
      hojas: [...catalogo.hojasPorId.keys()],
    },
    catalogo.equipo,
  );
  catalogo.unidadesDelCatalogo.set(u.id, u);
  catalogo.unidadesSinGuardar.add(u.id);
  vista.elegida = { kind: 'unidad', id: u.id };
  vista.aviso = avisoDeNuevaUnidad(
    u,
    vista.escena === 'edicion' ? 'edicion' : 'montaje',
    catalogo.equipo,
  );
  return u.id;
}

/** Los héroes puestos en los bandos, izquierda primero. */
export function heroesDeLaPagina(montaje: EstadoDelMontaje): HeroeDeArena[] {
  return [montaje.heroes.izquierda, montaje.heroes.derecha].filter((h) => h !== null);
}

export function puestoPorClave(
  montaje: EstadoDelMontaje,
  clave: number,
): { lado: Lado; i: number; p: Puesto } {
  for (const lado of ['izquierda', 'derecha'] as const) {
    const i = montaje.puestos[lado].findIndex((p) => p.clave === clave);
    const p = montaje.puestos[lado][i];
    if (p !== undefined) return { lado, i, p };
  }
  throw new Error(`no hay ningún puesto ${clave} en el montaje`);
}

/** Los que lleva ya un lado: sus puestos y su héroe, que cuenta como uno más. */
export function ocupados(montaje: EstadoDelMontaje, lado: Lado): number {
  return montaje.puestos[lado].length + (montaje.heroes[lado] === null ? 0 : 1);
}

export function añadir(pagina: PaginaDeLaArena, lado: Lado, id: string, escalera = false): void {
  const { catalogo, montaje, vista } = pagina;
  const adjetivo = LADOS[lado].adjetivo;
  if (ocupados(montaje, lado) >= montaje.combate.tope) {
    vista.aviso = `El bando ${adjetivo} ya lleva ${montaje.combate.tope}: no cabe ninguna más.`;
    return;
  }
  const u = unidadDe(catalogo, id);
  const motivo = porQueNoSeMonta(catalogo, u);
  if (motivo !== null) {
    vista.aviso = `${u.name} no se monta: ${motivo}.`;
    return;
  }
  // La unidad entra en el catálogo al montarla: es lo que se probó y lo que se guarda.
  if (!catalogo.unidadesDelCatalogo.has(u.id)) {
    catalogo.unidadesDelCatalogo.set(u.id, u);
    catalogo.unidadesSinGuardar.add(u.id);
  }
  vista.elegida = { kind: 'unidad', id: u.id };
  montaje.puestos[lado].push({ clave: montaje.siguienteClave++, unidad: id, escalera });
  vista.aviso = `${describir(catalogo, { clave: 0, unidad: id, escalera }, lado).nombre} entra en el bando ${adjetivo}.`;
}
