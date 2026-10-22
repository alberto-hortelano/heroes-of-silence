/**
 * La cola del taller, en disco: un fichero JSON por encargo, y su estado es la
 * carpeta en la que está —`pendiente/`, `en-curso/`, `hecho/`, `fallido/`—.
 *
 * Tomar un encargo es **renombrarlo** de `pendiente/` a `en-curso/`, y
 * `rename` es atómico dentro del mismo sistema de ficheros: si dos
 * trabajadores van a por el mismo, uno gana y al otro le llega `ENOENT`, y pasa
 * al siguiente. Sin cerrojos ni ficheros de bloqueo que se queden huérfanos. Todo
 * lo demás que mueve una ficha (cerrar, devolver, reintentar, retomar) la **aparta
 * primero** a un temporal suyo con otro `rename` (`mover`): de dos procesos que lo
 * intentan a la vez, uno gana y al otro le llega `NoEstaEn`, y nadie la escribe a
 * medias donde otro la lee.
 *
 * Al tomarlo, la ficha apunta el pid de quien lo lleva (`Ficha.pid`). Un encargo
 * que se queda en `en-curso/` con un pid que ya no vive es un trabajador que murió
 * a medias (`trabajadorDe`), y `devolverHuerfanos` lo devuelve a la cola con sus
 * fallos (QA del banco de NPC, H6, 22-10-2026: si no, la figura se quedaba a medias
 * para siempre diciendo «el taller la está pintando»). Sin pid —lo tomó un
 * trabajador con el código de antes— se da por vivo: no se le roba el encargo a
 * quien quizá lo está pintando; lo devuelve una persona con `pnpm taller devolver`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { link, mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
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
  /**
   * El pid del proceso que lo tomó (`tomar`, `retomar`), mientras está en `en-curso/`:
   * si ya no vive, el encargo es huérfano (`trabajadorDe`). Fuera de `en-curso/` no va.
   */
  readonly pid?: number;
}

/** Quien lleva un encargo en curso, según su ficha. */
export type TrabajadorDelEncargo =
  | { readonly vivo: true; readonly pid: number }
  /** La tomó un trabajador de antes, sin pid apuntado (o se está escribiendo): se da por viva. */
  | { readonly vivo: true; readonly pid: undefined }
  /** Su pid ya no vive: el encargo es huérfano. */
  | { readonly vivo: false; readonly pid: number };

/**
 * Si vive el proceso que lleva un encargo en curso: `kill(pid, 0)` no manda nada, solo
 * pregunta. `ESRCH` es que no existe; `EPERM`, que existe y es de otro usuario (vivo).
 * Un pid reutilizado por otro proceso se lee vivo: el error va hacia no robar.
 */
export function trabajadorDe(ficha: Ficha): TrabajadorDelEncargo {
  const { pid } = ficha;
  if (pid === undefined) return { vivo: true, pid: undefined };
  // 0 o negativo mandaría la pregunta a un grupo entero de procesos.
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`la ficha de «${ficha.encargo.id}» lleva un pid que no vale: ${String(pid)}`);
  }
  try {
    process.kill(pid, 0);
    return { vivo: true, pid };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return { vivo: false, pid };
    if ((err as NodeJS.ErrnoException).code === 'EPERM') return { vivo: true, pid };
    throw err;
  }
}

/** El encargo ya no está donde se buscaba: otro proceso lo movió (o el id no es ese). */
export class NoEstaEn extends Error {
  constructor(
    readonly id: string,
    readonly estado: Estado,
  ) {
    super(`el encargo «${id}» no está en ${estado}/`);
  }
}

/** El encargo ya está en la cola: encolarlo otra vez lo pintaría dos veces. */
export class YaEnLaCola extends Error {
  constructor(
    readonly id: string,
    readonly estado: Estado,
  ) {
    super(`el encargo «${id}» ya está en ${estado}/: dale otro id (p. ej. ${id}-2)`);
  }
}

/**
 * Un temporal de este proceso y esta llamada: con un nombre fijo por encargo, dos
 * `pnpm npcs trabajar` a la vez se pisaban el temporal y al segundo le llegaba
 * `ENOENT` (QA del banco de NPC, H7).
 */
let temporales = 0;
const temporalDe = (raiz: string, id: string): string =>
  join(raiz, `.${id}.${process.pid}-${++temporales}.json`);

const comoJson = (ficha: Ficha): string => `${JSON.stringify(ficha, null, 2)}\n`;

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

  /**
   * Encola un encargo validado. Lanza `YaEnLaCola` si ese id ya está en la cola, en
   * cualquier estado. Se publica con `link`, que no pisa: si otro proceso lo acaba de
   * encolar en `pendiente/` (mirar y escribir no son un solo paso), también lanza
   * `YaEnLaCola`, y no se pisa su ficha. Queda un hueco: que otro lo encole y un
   * trabajador lo tome entre que este mira y publica; entonces se pintaría dos veces.
   */
  async encolar(bruto: unknown): Promise<Encargo> {
    const encargo = encargoSchema.parse(bruto);
    await this.preparar();
    for (const e of ESTADOS) {
      if ((await this.ids(e)).includes(encargo.id)) throw new YaEnLaCola(encargo.id, e);
    }
    const temporal = temporalDe(this.raiz, encargo.id);
    await writeFile(temporal, comoJson({ encargo }));
    try {
      await link(temporal, join(this.dir('pendiente'), `${encargo.id}.json`));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST')
        throw new YaEnLaCola(encargo.id, 'pendiente');
      throw err;
    } finally {
      await unlink(temporal);
    }
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

  /** La ficha de un encargo; `NoEstaEn` si no está en ese estado. */
  async leer(e: Estado, id: string): Promise<Ficha> {
    try {
      return JSON.parse(await readFile(join(this.dir(e), `${id}.json`), 'utf8')) as Ficha;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NoEstaEn(id, e);
      throw err;
    }
  }

  /**
   * Mueve la ficha de `id` de `desde/` a `hacia/` reescrita por `cambiar`. Primero la
   * aparta a un temporal suyo con un `rename` —atómico: de dos que lo intentan, uno
   * gana y al otro le llega `NoEstaEn`—, luego la escribe y la pone en su sitio. Si
   * `cambiar` devuelve `null`, la deja donde estaba. Devuelve la ficha de antes.
   */
  private async mover(
    id: string,
    desde: Estado,
    hacia: Estado,
    cambiar: (ficha: Ficha) => Ficha | null,
  ): Promise<{ readonly antes: Ficha; readonly movida: boolean }> {
    const temporal = temporalDe(this.raiz, id);
    try {
      await rename(join(this.dir(desde), `${id}.json`), temporal);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NoEstaEn(id, desde);
      throw err;
    }
    let antes: Ficha;
    let nueva: Ficha | null;
    try {
      antes = JSON.parse(await readFile(temporal, 'utf8')) as Ficha;
      nueva = cambiar(antes);
      if (nueva !== null) await writeFile(temporal, comoJson(nueva));
    } catch (err) {
      // Apartada y sin poder reescribirla: vuelve tal cual, que fuera de su carpeta
      // ningún estado la vería y se perdería de la cola.
      await rename(temporal, join(this.dir(desde), `${id}.json`));
      throw err;
    }
    await rename(temporal, join(this.dir(nueva === null ? desde : hacia), `${id}.json`));
    return { antes, movida: nueva !== null };
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

  /**
   * Quien lleva ahora un encargo de `en-curso/` (`trabajadorDe`), o `undefined` si ya no
   * está ahí. Una ficha que no se lee entera se está escribiendo —el trabajador de antes
   * la reescribía en su sitio al cerrarla— y se da por viva.
   */
  trabajadorAhora(id: string): TrabajadorDelEncargo | undefined {
    let ficha: Ficha | undefined;
    try {
      ficha = this.leerAhora('en-curso', id);
    } catch (err) {
      if (err instanceof SyntaxError) return { vivo: true, pid: undefined };
      throw err;
    }
    return ficha === undefined ? undefined : trabajadorDe(ficha);
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
   * un encargo ajeno que alguien dejó en la cola. La ficha apunta el pid de este
   * proceso (`Ficha.pid`): mientras no lo lleva, se da por viva.
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
      // El pid se escribe aparte y se pone encima con un `rename`, que no deja una
      // ficha a medio escribir a quien la lea; el encargo no deja de verse en curso.
      const ficha = await this.leer('en-curso', candidato);
      const temporal = temporalDe(this.raiz, candidato);
      await writeFile(temporal, comoJson({ ...ficha, pid: process.pid }));
      await rename(temporal, join(this.dir('en-curso'), `${candidato}.json`));
      return encargoSchema.parse(ficha.encargo);
    }
    return null;
  }

  /** Cierra un encargo en curso, apuntando el resultado, y lo mueve a su carpeta final. */
  async cerrar(id: string, estado: 'hecho' | 'fallido', resultado: Resultado): Promise<void> {
    await this.mover(id, 'en-curso', estado, ({ pid: _, ...ficha }) => ({ ...ficha, resultado }));
  }

  /**
   * Devuelve a la cola un encargo de `en-curso/`, `fallido/` o `hecho/`, sin su
   * resultado. Desde `en-curso/` (el trabajador que se quedó sin cuota) conserva sus
   * fallos: no ha fallado otra vez, solo no se pudo pedir. Desde `fallido/` o `hecho/`
   * es una persona que lo vuelve a pedir, y la cuenta empieza de cero.
   */
  async devolver(id: string, desde: 'en-curso' | 'fallido' | 'hecho'): Promise<void> {
    await this.mover(id, desde, 'pendiente', (ficha) => ({
      encargo: ficha.encargo,
      ...(desde === 'en-curso' && ficha.fallos !== undefined ? { fallos: ficha.fallos } : {}),
    }));
  }

  /**
   * Devuelve a la cola, con sus fallos, los encargos en curso (de los que pasan
   * `filtro`) cuyo trabajador ya no vive (`trabajadorDe`), y dice cuáles. Se vuelve a
   * mirar el pid con la ficha ya apartada: si otro la devolvió y un trabajador vivo la
   * tomó entretanto, se deja donde está. Lo que otro proceso devolvió antes se salta.
   */
  async devolverHuerfanos(filtro: (id: string) => boolean = () => true): Promise<string[]> {
    const devueltos: string[] = [];
    for (const id of (await this.ids('en-curso')).filter(filtro)) {
      if (this.trabajadorAhora(id)?.vivo !== false) continue;
      try {
        const { movida } = await this.mover(id, 'en-curso', 'pendiente', (ficha) =>
          trabajadorDe(ficha).vivo
            ? null
            : {
                encargo: ficha.encargo,
                ...(ficha.fallos === undefined ? {} : { fallos: ficha.fallos }),
              },
        );
        if (movida) devueltos.push(id);
      } catch (err) {
        if (err instanceof NoEstaEn) continue; // otro rescate lo devolvió antes
        throw err;
      }
    }
    return devueltos;
  }

  /**
   * Vuelve a encolar un encargo de `fallido/` **llevando la cuenta**: su resultado pasa
   * a sus `fallos` (`Ficha.fallos`). Lo usa el reintento automático de las figuras del
   * banco de NPC (`tools/npcs/en-el-taller.ts`), que mira esa cuenta contra su tope.
   */
  async reintentar(id: string): Promise<void> {
    await this.mover(id, 'fallido', 'pendiente', (ficha) => ({
      encargo: ficha.encargo,
      fallos: [
        ...(ficha.fallos ?? []),
        ...(ficha.resultado === undefined ? [] : [ficha.resultado]),
      ],
    }));
  }

  /**
   * Toma un encargo cerrado (`hecho/` o `fallido/`) **sin pasar por `pendiente/`**: lo
   * renombra a `en-curso/` de un golpe y devuelve su ficha. Lo usa `pnpm taller
   * reprocesar`, que rehace el post-proceso sobre el crudo sin pedir otra imagen: por
   * `pendiente/`, un trabajador vivo podía llevárselo en medio y volver a pedírselo a
   * Codex. **Conserva sus fallos** (QA del banco de NPC, H8): reprocesar no pide otra
   * imagen, y con la cuenta a cero un agotado que vuelve a fallar se reintentaba solo
   * dos veces más con Codex. Apunta el pid de quien lo retoma, como `tomar`. Lanza
   * `NoEstaEn` si ya no está ahí.
   */
  async retomar(id: string, desde: 'fallido' | 'hecho'): Promise<Ficha> {
    const { antes } = await this.mover(id, desde, 'en-curso', (ficha) => ({
      encargo: ficha.encargo,
      ...(ficha.fallos === undefined ? {} : { fallos: ficha.fallos }),
      pid: process.pid,
    }));
    return antes;
  }

  /**
   * Retira un pendiente que ya no vale (sus referencias cambiaron). Se renombra
   * antes de borrarlo, para que un trabajador no lo tome a medio retirar.
   */
  async retirar(id: string): Promise<boolean> {
    const temporal = temporalDe(this.raiz, `retirado-${id}`);
    try {
      await rename(join(this.dir('pendiente'), `${id}.json`), temporal);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false; // ya lo tomó alguien
      throw err;
    }
    await rm(temporal);
    return true;
  }

  /**
   * Olvida el registro de un encargo cerrado, para encolarlo de nuevo con el mismo id.
   * Si otro proceso lo olvidó o lo movió entre mirar y borrar, no estaba: `false`.
   */
  async olvidar(id: string): Promise<boolean> {
    for (const e of ['hecho', 'fallido'] as const) {
      if ((await this.ids(e)).includes(id)) {
        try {
          await rm(join(this.dir(e), `${id}.json`));
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
          throw err;
        }
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
