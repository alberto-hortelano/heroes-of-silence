/**
 * Las letras de título de los temas: una OFL por tema, bajada de
 * `github.com/google/fonts` (permiso del usuario, 13-10-2026; ningún otro sitio)
 * en un commit fijo y servida tal cual desde `assets/letras/<carpeta>/`, con su
 * `OFL.txt` y su `procedencia.json` al lado. `assets/letras/` y no
 * `assets/fuentes/`: en el taller, `<x>/fuentes/` es lo que solo él lee, y el
 * build lo deja fuera (`tools/build/publico.ts`).
 *
 * La tabla (`FUENTES`) es la única fuente: de ella sale también
 * `src/client/fuentes.css` (`cssDeLetras`), un `@font-face` por fichero, que
 * `test/fuentes.test.ts` compara con el disco.
 *
 * Van en **TrueType sin tocar**, no en woff2: Chromium y Firefox las cargan así,
 * pesan de 33 a 184 KB, y un codificador woff2 hecho a mano no compensaba el
 * riesgo (decisión del coordinador). Sin subconjunto ni cambio de nombre: la
 * licencia deja redistribuirlas sin modificar, y el nombre reservado no entra en
 * juego.
 *
 * Cada fichero lleva su sha256: si lo bajado no es lo que se revisó, lanza y no
 * escribe nada; el que ya está en disco con su sha256 no se vuelve a bajar.
 * Volver a correrlo da los mismos bytes.
 *
 *     npx tsx tools/fuentes/bajar.ts      baja lo que falte y reescribe `fuentes.css`
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FactionId } from '../../src/core/types.js';

/** El commit de `google/fonts` del que salen todas (`git ls-remote`, 13-10-2026). */
export const COMMIT = '66928797f271fed5ee428544e7229685e2d90127';
export const ORIGEN = `https://raw.githubusercontent.com/google/fonts/${COMMIT}/ofl`;

export interface Fichero {
  /** Nombre en el repositorio de origen. */
  readonly origen: string;
  /** Nombre en `assets/letras/<carpeta>/`: sin corchetes, que en una URL piden escaparse. */
  readonly local: string;
  readonly sha256: string;
}

/** Un TrueType de la familia, con el grosor que cubre (`font-weight`; una variable, un tramo). */
export interface Cara extends Fichero {
  readonly peso: string;
}

export interface Fuente {
  readonly familia: string;
  /** La carpeta de `ofl/` en el origen, y la de `assets/letras/`. */
  readonly carpeta: string;
  readonly tema: FactionId;
  /** Por qué esta letra para su lámina: va de comentario en la hoja generada. */
  readonly porque: string;
  readonly ficheros: readonly Cara[];
  readonly licencia: Fichero;
  /**
   * Sus cifras no se usan: su `@font-face` no las cubre (`unicode-range`) y salen
   * de la letra de respaldo del tema. En IM Fell y Almendra son de caja baja (el
   * «1» a 0,62 y 0,74 de la «H», medido en Chromium: «Día 1» se leía «Día ı»); en
   * Cinzel, el «1» es una I versal, y «Batalla · ronda 1» se leía «ronda I».
   */
  readonly sinCifras: boolean;
}

const ofl = (sha256: string): Fichero => ({ origen: 'OFL.txt', local: 'OFL.txt', sha256 });

export const FUENTES: readonly Fuente[] = [
  {
    familia: 'Cinzel',
    sinCifras: true,
    carpeta: 'cinzel',
    tema: 'templarios',
    porque: 'las versales romanas de «IN HOC SIGNO VINCES». Variable, de 400 a 900.',
    ficheros: [
      {
        peso: '400 900',
        origen: 'Cinzel[wght].ttf',
        local: 'Cinzel.ttf',
        sha256: 'f4d83d34d1f6c741193e4acf4b3dff9531e5a67b6aa65228d00a7db72a4e0f34',
      },
    ],
    licencia: ofl('f2b3029aba64c378bf0963b62945eee15e564fe4330b934c8f2eb058282b5e83'),
  },
  {
    familia: 'IM Fell English SC',
    sinCifras: true,
    carpeta: 'imfellenglishsc',
    tema: 'no-muertos',
    porque: 'versalitas de imprenta vieja.',
    ficheros: [
      {
        peso: '400',
        origen: 'IMFeENsc28P.ttf',
        local: 'IMFeENsc28P.ttf',
        sha256: '102324fb5434bb5da7963533426b0ad44c85bbc9e7755067535c9d11464a176b',
      },
    ],
    licencia: ofl('2a3ca501fc4d5efcad9798531e3e06962b1e20c60e464f6cbd6c17630112c773'),
  },
  {
    familia: 'Marcellus',
    sinCifras: false,
    carpeta: 'marcellus',
    tema: 'imperio',
    porque: 'romana abierta, con minúsculas, como «Aldo de Valdeluz» en su lámina.',
    ficheros: [
      {
        peso: '400',
        origen: 'Marcellus-Regular.ttf',
        local: 'Marcellus-Regular.ttf',
        sha256: '1cf0cd10b17d35e852729962cc1ffaffed94514895972458345e2df34abb2f81',
      },
    ],
    licencia: ofl('715ba72697e14daa9b29a333545f69bde7c497b9f77d0a2a4c4a5a752d961801'),
  },
  {
    familia: 'Almendra',
    sinCifras: true,
    carpeta: 'almendra',
    tema: 'elfos',
    porque: 'humanista caligráfica, con su negrita.',
    ficheros: [
      {
        peso: '400',
        origen: 'Almendra-Regular.ttf',
        local: 'Almendra-Regular.ttf',
        sha256: 'b127a6121209353b53da9ce73bf9d350f74190d8384c28ede179e4fb9440f946',
      },
      {
        peso: '700',
        origen: 'Almendra-Bold.ttf',
        local: 'Almendra-Bold.ttf',
        sha256: '5895ef04d0d56c60083ec302e72db99b952b044ab2b440ee12283649b5edc971',
      },
    ],
    licencia: ofl('b7eae5e3c3447f70caa14e0c43f5e0d953f54ee59df406f6362863bcee1a0a95'),
  },
  {
    familia: 'Germania One',
    sinCifras: false,
    carpeta: 'germaniaone',
    tema: 'orkos',
    porque: 'maciza, como el rótulo «HEROES SILENCE».',
    ficheros: [
      {
        peso: '400',
        origen: 'GermaniaOne-Regular.ttf',
        local: 'GermaniaOne-Regular.ttf',
        sha256: '3ee3d56584bab8c9e3f59cc3360aa8a36e219dcf0a9f3c8928e3da5a19277e3f',
      },
    ],
    licencia: ofl('b7574cd4c76770e5e3915d16bd93f09663bd77cb041a4ec09d824c52b540529a'),
  },
];

const RAIZ = resolve(import.meta.dirname, '../..');
export const CARPETA_DE_LETRAS = join(RAIZ, 'assets/letras');
/** La hoja de los `@font-face`, generada de `FUENTES`, relativa a la raíz. */
export const HOJA_DE_LETRAS = 'src/client/fuentes.css';

export const sha256 = (datos: Uint8Array): string =>
  createHash('sha256').update(datos).digest('hex');

/** La URL de un fichero en el origen, con los corchetes de `Cinzel[wght]` escapados. */
export const urlDe = (f: Fuente, fichero: Fichero): string =>
  `${ORIGEN}/${f.carpeta}/${encodeURIComponent(fichero.origen)}`;

async function bajar(url: string, esperado: string): Promise<Uint8Array> {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`${url} respondió ${respuesta.status}`);
  const datos = new Uint8Array(await respuesta.arrayBuffer());
  const suyo = sha256(datos);
  if (suyo !== esperado)
    throw new Error(`${url}: el sha256 es ${suyo} y se esperaba ${esperado}; no se escribe nada`);
  return datos;
}

/** ¿Está ya en disco con el sha256 que se revisó? Entonces no se baja otra vez. */
function yaEsta(ruta: string, esperado: string): boolean {
  return existsSync(ruta) && sha256(readFileSync(ruta)) === esperado;
}

/** Baja las que falten, las comprueba y solo entonces escribe; rehace la hoja. */
export async function bajarFuentes(): Promise<string[]> {
  const listas: { ruta: string; datos: Uint8Array | string }[] = [];
  for (const f of FUENTES) {
    const carpeta = join(CARPETA_DE_LETRAS, f.carpeta);
    for (const fichero of [...f.ficheros, f.licencia]) {
      const ruta = join(carpeta, fichero.local);
      if (yaEsta(ruta, fichero.sha256)) continue;
      listas.push({ ruta, datos: await bajar(urlDe(f, fichero), fichero.sha256) });
    }
    const procedencia = {
      familia: f.familia,
      tema: f.tema,
      licencia: 'SIL Open Font License 1.1 (OFL.txt)',
      repositorio: 'https://github.com/google/fonts',
      commit: COMMIT,
      ficheros: [...f.ficheros, f.licencia].map((x) => ({
        local: x.local,
        origen: `ofl/${f.carpeta}/${x.origen}`,
        url: urlDe(f, x),
        sha256: x.sha256,
      })),
      modificado: 'no: los bytes del repositorio de origen, sin subconjunto ni cambio de nombre',
    };
    listas.push({
      ruta: join(carpeta, 'procedencia.json'),
      datos: `${JSON.stringify(procedencia, null, 2)}\n`,
    });
  }
  listas.push({ ruta: join(RAIZ, HOJA_DE_LETRAS), datos: cssDeLetras() });
  for (const { ruta, datos } of listas) {
    mkdirSync(resolve(ruta, '..'), { recursive: true });
    writeFileSync(ruta, datos);
  }
  return listas.map((l) => l.ruta);
}

/** Lo que cubre una letra que no sirve para cifras: todo menos U+0030-0039. */
const SIN_CIFRAS = 'U+0-2F, U+3A-10FFFF';

/**
 * `src/client/fuentes.css`: un `@font-face` por fichero de `FUENTES`, servido
 * desde `assets/letras/`, con `swap` y, si la letra no sirve para cifras, sin
 * ellas (`unicode-range`).
 */
export function cssDeLetras(): string {
  const cabecera = `/*
 * GENERADO por \`npx tsx tools/fuentes/bajar.ts\` (la tabla \`FUENTES\`): no se
 * edita a mano. Lo compara con la tabla \`test/fuentes.test.ts\`.
 *
 * Las letras de título de los temas: una OFL por tema (13-10-2026), bajada de
 * \`github.com/google/fonts\` y servida tal cual desde \`assets/letras/<familia>/\`,
 * con su \`OFL.txt\` y su procedencia al lado. Nada de CDN: la página no pide nada
 * fuera de su origen.
 *
 * Un \`@font-face\` no baja nada hasta que alguna regla pinta texto con su
 * familia, y solo la nombra la \`--letra-titulo\` de su tema: el neutro y los otros
 * cuatro no la piden. \`swap\` pinta en el acto con la cadena de respaldo del tema
 * y cambia a la buena al llegar; el lienzo la espera aparte (\`ponerTema\`).
 *
 * TrueType y no woff2: el navegador las lee igual y un codificador propio no
 * compensaba. Una letra cuyas cifras no sirven (de caja baja, o un «1» que es una
 * I versal) no las cubre: salen de la letra de respaldo del tema.
 */`;
  const familia = (f: Fuente): string => (/\s/.test(f.familia) ? `'${f.familia}'` : f.familia);
  const caras = FUENTES.map((f) =>
    [
      `/* ${f.tema}: ${f.porque}${f.sinCifras ? ' No cubre las cifras.' : ''} */`,
      ...f.ficheros.map((c) =>
        [
          '@font-face {',
          `  font-family: ${familia(f)};`,
          `  src: url('/letras/${f.carpeta}/${c.local}') format('truetype');`,
          `  font-weight: ${c.peso};`,
          '  font-display: swap;',
          ...(f.sinCifras ? [`  unicode-range: ${SIN_CIFRAS};`] : []),
          '}',
        ].join('\n'),
      ),
    ].join('\n'),
  );
  return `${[cabecera, ...caras].join('\n\n')}\n`;
}

const esScript = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (esScript) {
  for (const ruta of await bajarFuentes()) console.log(`escrito ${ruta}`);
}
