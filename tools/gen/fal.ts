/**
 * Cliente de fal.ai con caché en disco y contador de gasto.
 *
 * Portado del `labs/common/fal.py` de ne-fan, con su misma semántica, que está
 * probada en dinero real:
 *   - `fal.run/<endpoint>` es SÍNCRONO: el POST bloquea hasta que termina (hay
 *     modelos que tardan cinco minutos), así que el timeout es largo.
 *   - La clave de caché es el hash del payload: repetir una llamada idéntica
 *     sale gratis y no vuelve a cobrar.
 *   - El cuerpo del error de fal trae la causa real ("Exhausted balance"); sin
 *     propagarlo solo se ve un 403 opaco.
 *   - Las referencias viajan como data URI en base64: no hay que subir nada.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const FAL_BASE = 'https://fal.run';
/** fal admite como mucho cinco imágenes de referencia por llamada. */
export const MAX_REFERENCE_IMAGES = 5;

export interface FalOptions {
  /** Carpeta de la caché en disco. */
  readonly cacheDir: string;
  /** Fichero donde se acumula el gasto. */
  readonly spendFile: string;
  /** Tope de gasto de la tanda, en dólares. Se aborta antes de pasarse. */
  readonly budgetUsd?: number;
  /** No llama a nadie: solo dice qué haría y cuánto costaría. */
  readonly dryRun?: boolean;
}

export interface SpendState {
  totalUsd: number;
  calls: { what: string; usd: number; at: string }[];
}

/** Lee FAL_KEY del `.env` sin depender de ninguna librería. */
export function loadFalKey(envPath = '.env'): string {
  const desdeEntorno = process.env['FAL_KEY'];
  if (desdeEntorno !== undefined && desdeEntorno !== '') return desdeEntorno;

  if (!existsSync(envPath)) {
    throw new Error(`no encuentro la clave: ni FAL_KEY en el entorno ni un fichero ${envPath}`);
  }
  for (const linea of readFileSync(envPath, 'utf8').split('\n')) {
    const limpia = linea.trim();
    if (limpia === '' || limpia.startsWith('#')) continue;
    const igual = limpia.indexOf('=');
    if (igual < 0) continue;
    if (limpia.slice(0, igual).trim() !== 'FAL_KEY') continue;
    return limpia
      .slice(igual + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  throw new Error(`el fichero ${envPath} no define FAL_KEY`);
}

export class FalClient {
  private readonly key: string;
  private spend: SpendState;

  constructor(private readonly options: FalOptions) {
    this.key = options.dryRun === true ? 'dry-run' : loadFalKey();
    this.spend = this.readSpend();
    mkdirSync(options.cacheDir, { recursive: true });
  }

  get totalSpent(): number {
    return this.spend.totalUsd;
  }

  private readSpend(): SpendState {
    if (!existsSync(this.options.spendFile)) return { totalUsd: 0, calls: [] };
    return JSON.parse(readFileSync(this.options.spendFile, 'utf8')) as SpendState;
  }

  private writeSpend(): void {
    mkdirSync(dirname(this.options.spendFile), { recursive: true });
    writeFileSync(this.options.spendFile, `${JSON.stringify(this.spend, null, 1)}\n`);
  }

  private addSpend(usd: number, what: string): void {
    this.spend.totalUsd = Math.round((this.spend.totalUsd + usd) * 10000) / 10000;
    this.spend.calls.push({ what, usd, at: new Date().toISOString() });
    this.writeSpend();
    console.log(
      `  \x1b[33m[gasto]\x1b[0m +$${usd.toFixed(3)} (${what}) — acumulado $${this.spend.totalUsd.toFixed(2)}`,
    );
  }

  private cachePath(key: string, ext: string): string {
    return join(this.options.cacheDir, `${key}.${ext}`);
  }

  /** Clave de caché: endpoint + payload + una etiqueta de versión opcional. */
  static key(endpoint: string, payload: unknown, extra = ''): string {
    return createHash('sha256')
      .update(JSON.stringify({ e: endpoint, p: payload, k: extra }))
      .digest('hex')
      .slice(0, 24);
  }

  /**
   * Llama a un endpoint que devuelve imágenes y guarda el PNG en la caché.
   * Devuelve la ruta del fichero y si hubo que pagar por él.
   */
  async image(
    endpoint: string,
    payload: Record<string, unknown>,
    costUsd: number,
    what: string,
    extraKey = '',
  ): Promise<{ path: string; cached: boolean }> {
    const key = FalClient.key(endpoint, payload, extraKey);
    const destino = this.cachePath(key, 'png');

    if (existsSync(destino)) {
      console.log(`  \x1b[32m[caché]\x1b[0m ${what} → ${destino}`);
      return { path: destino, cached: true };
    }

    if (this.options.dryRun === true) {
      console.log(`  \x1b[36m[simulado]\x1b[0m ${what} — costaría $${costUsd.toFixed(3)}`);
      return { path: destino, cached: false };
    }

    const tope = this.options.budgetUsd;
    if (tope !== undefined && this.spend.totalUsd + costUsd > tope) {
      throw new Error(
        `el tope de la tanda ($${tope.toFixed(2)}) se agotaría con "${what}": ` +
          `llevas gastados $${this.spend.totalUsd.toFixed(2)}`,
      );
    }

    const url = `${FAL_BASE}/${endpoint}`;
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Key ${this.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // Hay modelos que tardan minutos y fal bloquea hasta terminar.
      signal: AbortSignal.timeout(600_000),
    });

    if (!respuesta.ok) {
      const cuerpo = await respuesta.text();
      throw new Error(`fal.ai HTTP ${respuesta.status} en ${endpoint}: ${cuerpo.slice(0, 300)}`);
    }

    const data = (await respuesta.json()) as {
      images?: { url?: string }[];
      image?: { url?: string };
    };
    const imagenUrl = data.images?.[0]?.url ?? data.image?.url;
    if (imagenUrl === undefined) {
      throw new Error(`la respuesta de ${endpoint} no trae ninguna imagen: ${JSON.stringify(data).slice(0, 300)}`);
    }

    const bytes = imagenUrl.startsWith('data:')
      ? Buffer.from(imagenUrl.split(',', 2)[1] as string, 'base64')
      : Buffer.from(await (await fetch(imagenUrl)).arrayBuffer());

    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, bytes);
    this.addSpend(costUsd, what);
    return { path: destino, cached: false };
  }
}

/** Convierte un fichero local en data URI, que es como fal acepta referencias. */
export function toDataUri(path: string): string {
  const bytes = readFileSync(path);
  const ext = path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg')
    ? 'jpeg'
    : 'png';
  return `data:image/${ext};base64,${bytes.toString('base64')}`;
}
