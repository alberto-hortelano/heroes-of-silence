/**
 * A qué ritmo anda una figura: lo que tarda en recorrer una casilla para que sus
 * pies no patinen (decisión del usuario, 03-10-2026: «el desplazamiento,
 * demasiado rápido»). Antes un tramo entero duraba 520 ms, fuera de una casilla o
 * de seis, y la figura se deslizaba mientras las piernas daban medio paso.
 *
 * La cuenta es la de cualquier caminante: en un ciclo de su clip la figura avanza
 * su ZANCADA, así que una casilla dura lo que dura el ciclo dividido por las
 * zancadas que caben en ella. El ciclo sale del atlas de la figura (`frames` a
 * `fps`) y la zancada, de medir el Y Bot; la escala, de lo alta que se pinta.
 * Y al verlo andar se pidió algo más de prisa: eso es `PRISA_DE_LA_MARCHA`.
 *
 * Del mismo reloj sale cuándo suelta la cuerda quien dispara (`msDeSuelta`).
 */
import { type CharacterClip, msDelClip } from './render/character.js';
import { arteDe, hojaDe, MIRADA_DE_PRESENTACION } from './render/personajes.js';

/**
 * Lo que avanza el Y Bot en un ciclo de su marcha y de su carga, en alturas de
 * adulto (`FIGURA.alturaAdulto`, 160 px de celda, que es contra lo que se escala
 * toda figura).
 *
 * Medido el 03-10-2026 sobre las hojas de perfil (`d2` y `d6`) de
 * `_poses/espada-escudo-8d`: el pie apoyado retrocede una mediana de 8,6 px de
 * celda por fotograma del render andando y 23,2 corriendo, y el ciclo son 13 y 8
 * fotogramas del render (`poses.json`, `sourceMetadata`): **112 y 186 px** por
 * ciclo. Dos medidas más lo confirman a ojo —la separación de los pies en el
 * doble apoyo da ~120 y ~200, y correlar la franja del suelo entre fotogramas,
 * 130 y 224—. Las siete columnas de la hoja muestrean ese ciclo entero, así que
 * la cifra no depende de a qué `fps` se pinte. `test/marcha.test.ts` la vuelve a
 * medir en los PNG con el primer método, y se pone rojo si las poses cambian y
 * esta cifra no.
 *
 * Con la marcha a 8 fps, una casilla de un adulto de un hex serían ~1,3 s andando
 * y ~0,8 s cargando: lo que tarda alguien de esa altura en cruzar algo de su
 * tamaño sin que los pies resbalen. Lo que se pinta va más deprisa
 * (`PRISA_DE_LA_MARCHA`).
 *
 * El jinete usa la misma: el caballo no tiene las piernas de color y no se
 * puede medir así, y su paso no es el de un hombre (queda dicho en el informe).
 */
export const ZANCADA = { walk: 112 / 160, charge: 186 / 160 } as const;

export type ClipDeMarcha = keyof typeof ZANCADA;

/**
 * Cuánto más deprisa avanza la figura de lo que dicen sus pies: la duración de
 * cada casilla se divide por esta cifra, y es **la única** que hay que tocar para
 * afinar el desplazamiento.
 *
 * Con 1 los pies no patinan (~1,3 s por casilla andando), y al verlo el usuario
 * lo pidió «un poco más rápido» (03-10-2026), aceptando que patinen algo: con
 * 1,45 una casilla de un adulto son ~0,9 s andando y ~0,55 s cargando, un 31 %
 * menos. El `fps` de los clips no cambia: las piernas siguen a su compás.
 */
export const PRISA_DE_LA_MARCHA = 1.45;

/**
 * Lo que tarda `body` en avanzar una unidad de distancia (una casilla del
 * tablero o del mapa) con el clip `clip`, si se pinta `alto` unidades de alto.
 * Lanza con un clip que no anda: un ataque no avanza.
 */
export function msPorCasilla(body: string, clip: CharacterClip, alto: number): number {
  if (clip !== 'walk' && clip !== 'charge') {
    throw new Error(`el clip «${clip}» no anda: solo la marcha y la carga tienen zancada`);
  }
  if (!(alto > 0)) throw new Error(`una figura de ${alto} de alto no puede andar`);
  // El reloj es el mismo en las ocho direcciones: se lee de la de presentación.
  const info = hojaDe(arteDe(body), MIRADA_DE_PRESENTACION).clips[clip];
  return msDelClip(info) / (ZANCADA[clip] * alto * PRISA_DE_LA_MARCHA);
}

/**
 * Cuándo suelta `body` la cuerda en su disparo, en ms desde que empieza: cuando
 * su atlas pinta la columna `suelta` de `shoot`, a su reloj. `null` si no la
 * tiene —no pinta el disparo y su `shoot` es su ataque: el bastón del liche, el
 * arte pintado antes de la hoja C—, y entonces el proyectil sale al empezar.
 */
export function msDeSuelta(body: string): number | null {
  const info = hojaDe(arteDe(body), MIRADA_DE_PRESENTACION).clips.shoot;
  return info.suelta === undefined ? null : (info.suelta * 1000) / info.fps;
}
