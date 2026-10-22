/**
 * La cola del taller, en disco: un fichero JSON por encargo, y su estado es la
 * carpeta en la que está —`pendiente/`, `en-curso/`, `hecho/`, `fallido/`—.
 *
 * Tomar un encargo es **renombrarlo** de `pendiente/` a `en-curso/`, y
 * `rename` es atómico dentro del mismo sistema de ficheros: si dos
 * trabajadores van a por el mismo, uno gana y al otro le llega `ENOENT`, y pasa
 * al siguiente. Sin cerrojos ni ficheros de bloqueo que se queden huérfanos.
 *
 * Un encargo que se queda en `en-curso/` es un trabajador que murió a medias;
 * `estado()` lo enseña y `devolver()` lo devuelve a la cola. No se recoge solo:
 * podría estar en curso de verdad en otro proceso.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Encargo, encargoSchema } from './encargo.js';

export const ESTADOS = ['pendiente', 'en-curso', 'hecho', 'fallido'] as const;
export type Estado = (typeof ESTADOS)[number];

/** Lo que el taller apunta en el encargo al cerrarlo. */
export interface Resultado {
  readonly cuando: string;
  readonly hilo?: string;
  readonly salida?: string;
  readonly motivo?: string;
  /** El crudo de Codex (con `~`), si el fallo fue después de generar. */
  readonly crudo?: string;
}

export interface Ficha {
  readonly encargo: Encargo;
  readonly resultado?: Resultado;
  /**
   * Los intentos que fallaron antes de este, del más viejo al más nuevo: un
   * encargo que se reintenta (`reintentar`) los lleva consigo, así que cuántas
   * veces ha fallado se lee del disco y no de la memoria de un trabajador.
   */
  readonly fallos?: readonly Resultado[];
}

/** La cola del taller de una raíz: la del repo (`COLA`, `trabajador.ts`) o una temporal en los tests. */
export function colaDelTaller(raiz: string): Cola {
  return new Cola(join(raiz, 'tools/taller/cola'));
}

export class Cola {
  constructor(readonly raiz: string) {}

  private dir(e: Estado): string {
    return join(this.raiz, e);
  }

  async preparar(): Promise<void> {
    for (const e of ESTADOS) await mkdir(this.dir(e), { recursive: true });
  }

  /** Encola un encargo validado. Lanza si ese id ya está en la cola, en cualquier estado. */
  async encolar(bruto: unknown): Promise<Encargo> {
    const encargo = encargoSchema.parse(bruto);
    await this.preparar();
    for (const e of ESTADOS) {
      if ((await this.ids(e)).includes(encargo.id)) {
        throw new Error(
          `el encargo «${encargo.id}» ya está en ${e}/: dale otro id (p. ej. ${encargo.id}-2)`,
        );
      }
    }
    const temporal = join(this.raiz, `.${encargo.id}.json`);
    await writeFile(temporal, `${JSON.stringify({ encargo }, null, 2)}\n`);
    await rename(temporal, join(this.dir('pendiente'), `${encargo.id}.json`));
    return encargo;
  }

  async ids(e: Estado): Promise<string[]> {
    try {
      return (await readdir(this.dir(e)))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .sort();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  async leer(e: Estado, id: string): Promise<Ficha> {
    return JSON.parse(await readFile(join(this.dir(e), `${id}.json`), 'utf8')) as Ficha;
  }

  /**
   * Los ids de un estado **ahora**, sin esperar: lo que lee `/__npcs`, que mira el
   * arte en disco igual (`tools/npcs/banco.ts`). Una foto: el trabajador puede mover
   * un encargo justo después.
   */
  idsAhora(e: Estado): string[] {
    try {
      return readdirSync(this.dir(e))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .sort();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  /** La ficha de un encargo ahora, sin esperar; `undefined` si ya no está ahí (se movió). */
  leerAhora(e: Estado, id: string): Ficha | undefined {
    try {
      return JSON.parse(readFileSync(join(this.dir(e), `${id}.json`), 'utf8')) as Ficha;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw err;
    }
  }

  /**
   * Toma el primer pendiente por orden de id —o ese `id` concreto—, o `null` si
   * no queda ninguno (o si otro trabajador se lo llevó antes). Con `filtro`, solo
   * de los que lo pasan: `pnpm npcs trabajar` toma solo los de NPC y no se lleva
   * un encargo ajeno que alguien dejó en la cola.
   */
  async tomar(id?: string, filtro: (id: string) => boolean = () => true): Promise<Encargo | null> {
    const candidatos = id === undefined ? (await this.ids('pendiente')).filter(filtro) : [id];
    for (const candidato of candidatos) {
      try {
        await rename(
          join(this.dir('pendiente'), `${candidato}.json`),
          join(this.dir('en-curso'), `${candidato}.json`),
        );
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue; // otro trabajador lo cogió
        throw err;
      }
      return encargoSchema.parse((await this.leer('en-curso', candidato)).encargo);
    }
    return null;
  }

  /** Cierra un encargo en curso, apuntando el resultado, y lo mueve a su carpeta final. */
  async cerrar(id: string, estado: 'hecho' | 'fallido', resultado: Resultado): Promise<void> {
    const ficha = await this.leer('en-curso', id);
    const origen = join(this.dir('en-curso'), `${id}.json`);
    await writeFile(origen, `${JSON.stringify({ ...ficha, resultado }, null, 2)}\n`);
    await rename(origen, join(this.dir(estado), `${id}.json`));
  }

  /**
   * Devuelve a la cola un encargo de `en-curso/`, `fallido/` o `hecho/`, sin su
   * resultado. Desde `en-curso/` (el trabajador que se quedó sin cuota) conserva sus
   * fallos: no ha fallado otra vez, solo no se pudo pedir. Desde `fallido/` o `hecho/`
   * es una persona que lo vuelve a pedir, y la cuenta empieza de cero.
   */
  async devolver(id: string, desde: 'en-curso' | 'fallido' | 'hecho'): Promise<void> {
    const ficha = await this.leer(desde, id);
    const origen = join(this.dir(desde), `${id}.json`);
    const fallos =
      desde === 'en-curso' && ficha.fallos !== undefined ? { fallos: ficha.fallos } : {};
    await writeFile(origen, `${JSON.stringify({ encargo: ficha.encargo, ...fallos }, null, 2)}\n`);
    await rename(origen, join(this.dir('pendiente'), `${id}.json`));
  }

  /**
   * Vuelve a encolar un encargo de `fallido/` **llevando la cuenta**: su resultado pasa
   * a sus `fallos` (`Ficha.fallos`). Lo usa el reintento automático de las figuras del
   * banco de NPC (`tools/npcs/en-el-taller.ts`), que mira esa cuenta contra su tope.
   */
  async reintentar(id: string): Promise<void> {
    const ficha = await this.leer('fallido', id);
    const origen = join(this.dir('fallido'), `${id}.json`);
    const fallos = [
      ...(ficha.fallos ?? []),
      ...(ficha.resultado === undefined ? [] : [ficha.resultado]),
    ];
    await writeFile(origen, `${JSON.stringify({ encargo: ficha.encargo, fallos }, null, 2)}\n`);
    await rename(origen, join(this.dir('pendiente'), `${id}.json`));
  }

  /**
   * Toma un encargo cerrado (`hecho/` o `fallido/`) **sin pasar por `pendiente/`**: lo
   * renombra a `en-curso/` de un golpe y devuelve su ficha. Lo usa `pnpm taller
   * reprocesar`, que rehace el post-proceso sobre el crudo sin pedir otra imagen: por
   * `pendiente/`, un trabajador vivo podía llevárselo en medio y volver a pedírselo a
   * Codex. Lanza si ya no está ahí.
   */
  async retomar(id: string, desde: 'fallido' | 'hecho'): Promise<Ficha> {
    const ficha = await this.leer(desde, id);
    const destino = join(this.dir('en-curso'), `${id}.json`);
    await rename(join(this.dir(desde), `${id}.json`), destino);
    await writeFile(destino, `${JSON.stringify({ encargo: ficha.encargo }, null, 2)}\n`);
    return ficha;
  }

  /**
   * Retira un pendiente que ya no vale (sus referencias cambiaron). Se renombra
   * antes de borrarlo, para que un trabajador no lo tome a medio retirar.
   */
  async retirar(id: string): Promise<boolean> {
    const temporal = join(this.raiz, `.retirado-${id}.json`);
    try {
      await rename(join(this.dir('pendiente'), `${id}.json`), temporal);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false; // ya lo tomó alguien
      throw err;
    }
    await rm(temporal);
    return true;
  }

  /** Olvida el registro de un encargo cerrado, para encolarlo de nuevo con el mismo id. */
  async olvidar(id: string): Promise<boolean> {
    for (const e of ['hecho', 'fallido'] as const) {
      if ((await this.ids(e)).includes(id)) {
        await rm(join(this.dir(e), `${id}.json`));
        return true;
      }
    }
    return false;
  }

  async estado(): Promise<Record<Estado, string[]>> {
    const fuera = {} as Record<Estado, string[]>;
    for (const e of ESTADOS) fuera[e] = await this.ids(e);
    return fuera;
  }
}
