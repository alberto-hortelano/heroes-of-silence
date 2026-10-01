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
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
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
   * Toma el primer pendiente por orden de id —o ese `id` concreto—, o `null` si
   * no queda ninguno (o si otro trabajador se lo llevó antes).
   */
  async tomar(id?: string): Promise<Encargo | null> {
    for (const candidato of id === undefined ? await this.ids('pendiente') : [id]) {
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

  /** Devuelve a la cola un encargo de `en-curso/`, `fallido/` o `hecho/`, sin su resultado. */
  async devolver(id: string, desde: 'en-curso' | 'fallido' | 'hecho'): Promise<void> {
    const ficha = await this.leer(desde, id);
    const origen = join(this.dir(desde), `${id}.json`);
    await writeFile(origen, `${JSON.stringify({ encargo: ficha.encargo }, null, 2)}\n`);
    await rename(origen, join(this.dir('pendiente'), `${id}.json`));
  }

  async estado(): Promise<Record<Estado, string[]>> {
    const fuera = {} as Record<Estado, string[]>;
    for (const e of ESTADOS) fuera[e] = await this.ids(e);
    return fuera;
  }
}
