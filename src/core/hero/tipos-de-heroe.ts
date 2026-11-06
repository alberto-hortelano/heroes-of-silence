/**
 * Los tipos de héroe de cada facción (`data/tipos-de-heroe.json`), la hoja con que
 * se pinta cada uno (`data/figuras-de-heroe.json`), los que se infiltran
 * (`data/infiltradores.json`) y el rasgo de cada facción (`data/facciones.json`),
 * comprobados unos contra otros al cargar.
 *
 * Su lector vivía en `data.ts`, con las demás tablas; desde la fase N de la
 * reorganización (07-11-2026) cada `data/*.json` lo lee el módulo de su dominio, que
 * lo valida al cargar.
 */
import faccionesJson from '../../../data/facciones.json' with { type: 'json' };
import figurasDeHeroeJson from '../../../data/figuras-de-heroe.json' with { type: 'json' };
import infiltradoresJson from '../../../data/infiltradores.json' with { type: 'json' };
import tiposDeHeroeJson from '../../../data/tipos-de-heroe.json' with { type: 'json' };
import { FACTION_IDS, type FactionId } from '../types.js';
import { esIdDeUnidad, repetidoEn } from '../validar.js';

/**
 * Un tipo de héroe de `data/tipos-de-heroe.json`, sacado del cuaderno con una
 * expresión regular (`tools/datos/tipos-de-heroe.ts`). Se guarda en el héroe
 * (`Hero.tipo`), se ve y se serializa; sus habilidades no hacen nada hasta que
 * exista su motor, y lo único que da es si se infiltra (`tipoSeInfiltra`, de un
 * fichero aparte, porque este es generado).
 */
export interface TipoDeHeroe {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
}

/**
 * Valida el catálogo de tipos contra las facciones del motor y lo devuelve
 * tipado. **Lanza con todos los problemas a la vez.** Exportada con el JSON de
 * argumento por lo mismo que `validarExperiencia`: un guardia que solo se prueba
 * con el fichero bueno es un guardia que no se ha visto morder.
 *
 * Cada facción necesita al menos uno porque el primero es el tipo por defecto
 * del héroe inicial y del contratado: sin él, `newGame` no tendría qué ponerle.
 */
export function validarTiposDeHeroe(
  json: unknown,
  facciones: readonly FactionId[],
  fichero = 'data/tipos-de-heroe.json',
): Readonly<Record<FactionId, readonly TipoDeHeroe[]>> {
  const problemas: string[] = [];
  const tipos = ((json ?? {}) as { tipos?: Record<string, unknown> }).tipos ?? {};
  const out = {} as Record<FactionId, readonly TipoDeHeroe[]>;
  for (const faccion of facciones) {
    const lista = tipos[faccion];
    if (!Array.isArray(lista) || lista.length === 0) {
      problemas.push(`la facción ${faccion} no tiene ningún tipo de héroe`);
      continue;
    }
    const validos: TipoDeHeroe[] = [];
    for (const [i, t] of (lista as Record<string, unknown>[]).entries()) {
      const campos = ['id', 'nombre', 'descripcion'] as const;
      const malos = campos.filter((c) => typeof t?.[c] !== 'string' || t[c] === '');
      if (malos.length > 0) {
        problemas.push(`${faccion}[${i}] no trae ${malos.join(', ')} como texto`);
        continue;
      }
      validos.push({
        id: t.id as string,
        nombre: t.nombre as string,
        descripcion: t.descripcion as string,
      });
    }
    const repetidos = validos.map((t) => t.id).filter((id, i, todos) => todos.indexOf(id) !== i);
    if (repetidos.length > 0) problemas.push(`${faccion} repite los ids ${repetidos.join(', ')}`);
    out[faccion] = validos;
  }
  for (const faccion of Object.keys(tipos)) {
    if (!(facciones as readonly string[]).includes(faccion)) {
      problemas.push(`"${faccion}" no es ninguna facción del motor`);
    }
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return out;
}

const TIPOS_DE_HEROE = validarTiposDeHeroe(tiposDeHeroeJson, FACTION_IDS);

/** Los tipos de héroe de una facción, en el orden del cuaderno. */
export function tiposDeHeroe(faction: FactionId): readonly TipoDeHeroe[] {
  return TIPOS_DE_HEROE[faction];
}

/**
 * El id del tipo del héroe que nadie eligió —el inicial de la IA y el de la
 * partida rápida, y el contratado—: **el primero de su facción en el cuaderno**
 * (Caballero, Nigromante). El id y no el
 * tipo entero, porque es lo que guarda `Hero.tipo` y lo único que leen quienes
 * lo piden. Lo elige así el plan
 * de este ciclo, y como el de por defecto no se infiltra (`validarInfiltradores`
 * lo rechaza) no cambia ninguna partida.
 */
export function tipoDeHeroePorDefecto(faction: FactionId): string {
  return (TIPOS_DE_HEROE[faction][0] as TipoDeHeroe).id;
}

/** El tipo `id` de la facción, o `null` si esa facción no lo tiene. */
export function tipoDeHeroe(faction: FactionId, id: string): TipoDeHeroe | null {
  return TIPOS_DE_HEROE[faction].find((t) => t.id === id) ?? null;
}

/**
 * El nombre del tipo `id` para pintarlo («Monje (Abad)»). **Lanza** si la
 * facción no lo tiene: un héroe con un tipo que no existe es un héroe mal
 * construido, y pintar el id crudo lo escondería. Lo leen el panel del cliente
 * y la vista del espectador, que no deben redactarlo cada uno a su manera.
 */
export function nombreDeTipoDeHeroe(faction: FactionId, id: string): string {
  const tipo = tipoDeHeroe(faction, id);
  if (tipo === null) {
    throw new Error(`el tipo de héroe "${id}" no existe en ${faction} (data/tipos-de-heroe.json)`);
  }
  return tipo.nombre;
}

/**
 * La hoja de `assets/unidades/` de cada tipo de héroe (`data/figuras-de-heroe.json`),
 * comprobada contra el catálogo de tipos. **Lanza con todos los problemas a la
 * vez**: un tipo sin hoja (el héroe se pintaría con el Y Bot, que es lo que se vino
 * a quitar: «la imagen es el y_bot», 19-10-2026), una hoja que no tiene la forma de
 * un id de carpeta, o una fila que no es ningún tipo (la de un tipo que el cuaderno
 * retiró). Que la hoja exista en disco con sus ocho direcciones no se mira aquí
 * —el núcleo no lee el disco—: lo mira `test/figuras-de-heroe.test.ts`.
 *
 * Exportada con el JSON de argumento por lo mismo que `validarTiposDeHeroe`: para
 * verla morder con un fichero malo.
 */
export function validarFigurasDeHeroe(
  json: unknown,
  tipos: Readonly<Record<FactionId, readonly TipoDeHeroe[]>>,
  fichero = 'data/figuras-de-heroe.json',
): Readonly<Record<FactionId, Readonly<Record<string, string>>>> {
  const problemas: string[] = [];
  const figuras = ((json ?? {}) as { figuras?: Record<string, unknown> }).figuras ?? {};
  const out = {} as Record<FactionId, Readonly<Record<string, string>>>;
  for (const [faccion, lista] of Object.entries(tipos) as [FactionId, readonly TipoDeHeroe[]][]) {
    const escritas = (figuras[faccion] ?? {}) as Record<string, unknown>;
    const deLaFaccion: Record<string, string> = {};
    for (const t of lista) {
      const hoja = escritas[t.id];
      if (typeof hoja !== 'string' || !esIdDeUnidad(hoja)) {
        problemas.push(
          hoja === undefined
            ? `el tipo ${t.id} (${t.nombre}) de ${faccion} no tiene hoja`
            : `la hoja del tipo ${t.id} de ${faccion} no es el id de una carpeta de assets/unidades/: ${JSON.stringify(hoja)}`,
        );
        continue;
      }
      deLaFaccion[t.id] = hoja;
    }
    for (const id of Object.keys(escritas)) {
      if (!lista.some((t) => t.id === id)) {
        problemas.push(
          `"${id}" no es ningún tipo de héroe de ${faccion} (data/tipos-de-heroe.json)`,
        );
      }
    }
    out[faccion] = deLaFaccion;
  }
  for (const faccion of Object.keys(figuras)) {
    if (!(faccion in tipos)) problemas.push(`"${faccion}" no es ninguna facción del motor`);
  }
  if (problemas.length > 0) throw new Error(`${fichero}: ${problemas.join('; ')}`);
  return out;
}

const FIGURAS_DE_HEROE = validarFigurasDeHeroe(figurasDeHeroeJson, TIPOS_DE_HEROE);

/**
 * La hoja con que se pinta un héroe: la de su tipo. **Derivada y no guardada**:
 * el héroe solo lleva su tipo (`Hero.tipo`), y de aquí la leen el mapa, la base
 * caminable, el retrato de la elección y la batalla (`HeroeDelBando.figura`), y el
 * espectador con la facción y el tipo que le llegan por el cable. Lanza con un tipo
 * que no es de su facción, como `nombreDeTipoDeHeroe`.
 */
export function figuraDelHeroe(h: { readonly faction: FactionId; readonly tipo: string }): string {
  const hoja = FIGURAS_DE_HEROE[h.faction][h.tipo];
  if (hoja === undefined) {
    throw new Error(
      `el tipo de héroe "${h.tipo}" no existe en ${h.faction} (data/tipos-de-heroe.json)`,
    );
  }
  return hoja;
}

/**
 * Los tipos de héroe que se infiltran, por facción (`data/infiltradores.json`, a
 * mano: `tipos-de-heroe.json` es generado y perdería un campo puesto en él),
 * comprobados contra el catálogo de tipos. **Lanza con todos los problemas a la
 * vez**: un tipo que no es de su facción, uno repetido, una facción sin ninguno
 * (con alguna, la infiltración se juega con cualquiera), una que no existe y **el
 * tipo por defecto** (`tipoDeHeroePorDefecto`): es el héroe de la IA, del agente
 * y de la partida rápida, y si se infiltrara la IA cruzaría barreras sin
 * quererlo y `pnpm banco` cambiaría.
 *
 * Exportada con el JSON de argumento por lo mismo que `validarFigurasDeHeroe`:
 * para verla morder con un fichero malo.
 */
export function validarInfiltradores(
  json: unknown,
  tipos: Readonly<Record<FactionId, readonly TipoDeHeroe[]>>,
): Readonly<Record<FactionId, readonly string[]>> {
  const problemas: string[] = [];
  const escritos =
    ((json ?? {}) as { infiltradores?: Record<string, unknown> }).infiltradores ?? {};
  const out = {} as Record<FactionId, readonly string[]>;
  for (const [faccion, lista] of Object.entries(tipos) as [FactionId, readonly TipoDeHeroe[]][]) {
    const suyos = escritos[faccion];
    if (!Array.isArray(suyos) || suyos.length === 0) {
      problemas.push(`la facción ${faccion} no tiene ningún tipo que se infiltre`);
      continue;
    }
    for (const id of suyos as unknown[]) {
      if (typeof id !== 'string' || !lista.some((t) => t.id === id)) {
        problemas.push(
          `${JSON.stringify(id)} no es ningún tipo de héroe de ${faccion} (data/tipos-de-heroe.json)`,
        );
      }
    }
    const repetido = repetidoEn(suyos as unknown[]);
    if (repetido !== undefined) problemas.push(`${faccion} repite el tipo ${String(repetido)}`);
    const porDefecto = tipoDeHeroePorDefecto(faccion);
    if (suyos.includes(porDefecto)) {
      problemas.push(
        `${porDefecto} es el tipo por defecto de ${faccion} y no puede infiltrarse: la IA, el agente y la partida rápida juegan con él`,
      );
    }
    out[faccion] = suyos as string[];
  }
  for (const faccion of Object.keys(escritos)) {
    if (!(faccion in tipos)) problemas.push(`"${faccion}" no es ninguna facción del motor`);
  }
  if (problemas.length > 0) throw new Error(`data/infiltradores.json: ${problemas.join('; ')}`);
  return out;
}

const INFILTRADORES = validarInfiltradores(infiltradoresJson, TIPOS_DE_HEROE);

/**
 * Si el tipo `tipo` de la facción se infiltra (`data/infiltradores.json`). Es la
 * mitad del héroe de la regla; la de la tropa y el grupo entero la junta
 * `infiltracionBlocker` (`hero/infiltracion.ts`). Un tipo que no existe, `false`:
 * quien lo construyó ya lanzó al pedir su figura o su nombre.
 */
export function tipoSeInfiltra(faction: FactionId, tipo: string): boolean {
  return INFILTRADORES[faction].includes(tipo);
}

// ---------------------------------------------------------------- facciones

/**
 * El rasgo de una línea de cada facción (`data/facciones.json`, sacado del
 * cuaderno por `tools/datos/facciones.ts`), comprobado al cargar: falta una,
 * sobra una o lleva un salto de línea y se lanza nombrando el fichero, en vez de
 * pintar la elección del menú con un hueco.
 */
export function leerRasgosDeFaccion(
  json: unknown,
  fichero = 'data/facciones.json',
): Readonly<Record<FactionId, string>> {
  const rasgos = ((json ?? {}) as { rasgos?: Record<string, unknown> }).rasgos ?? {};
  const problemas: string[] = [];
  for (const f of FACTION_IDS) {
    const r = rasgos[f];
    if (typeof r !== 'string' || r.trim() === '') problemas.push(`${f} no tiene rasgo`);
    else if (/[\r\n]/.test(r))
      problemas.push(`el rasgo de ${f} lleva un salto de línea: es de una línea`);
  }
  for (const f of Object.keys(rasgos)) {
    if (!(FACTION_IDS as readonly string[]).includes(f))
      problemas.push(`"${f}" no es una facción del juego`);
  }
  if (problemas.length > 0) {
    throw new Error(
      `${fichero}: ${problemas.join('; ')} (se regenera con tools/datos/facciones.ts)`,
    );
  }
  return rasgos as Record<FactionId, string>;
}

const RASGOS_DE_FACCION = leerRasgosDeFaccion(faccionesJson);

/** El rasgo de una línea de la facción: lo que dice de ella la elección del menú. */
export function rasgoDeFaccion(f: FactionId): string {
  return RASGOS_DE_FACCION[f];
}
