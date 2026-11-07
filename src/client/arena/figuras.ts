/**
 * Las figuras animadas de las fichas y las miniaturas de la arena: cómo posa cada ficha (su clip
 * y hacia dónde mira, `animDe`), recogerlas de lo que se ve al repintar, quién dice cuáles se ven
 * (`vigiaDeLasFiguras`) y pintarlas cada fotograma, solo si cambia lo que enseñan. Era parte de
 * `arena/main.ts` hasta R8 de la reorganización (07-11-2026).
 */
import { LADOS } from '@core/arena/lados.js';
import { FIGURA } from '../../shared/arte.js';
import { COLOR_BANDO } from '../render/batalla/bandos.js';
import type { CharacterClip } from '../render/figuras/character.js';
import type { Direccion } from '../render/figuras/direccion.js';
import {
  claveDelDibujo,
  colocarFigura,
  type Figura,
  hayFigurasAnimadas,
  pintarFigura,
  pintarSombraDeFigura,
} from '../render/figuras/figura.js';
import {
  arteDe,
  DIRECCION_DE_HOJA,
  hojaDe,
  INDICE_DE_HOJA,
  MIRADA_DE_PRESENTACION,
} from '../render/figuras/personajes.js';
import { COLOR_NEUTRO } from '../render/palette.js';
import { nombreDeFigura } from './catalogo.js';
import { claveDelElemento } from './fichas.js';
import type { AnimDeFicha, EstadoDeLaVista, PaginaDeLaArena } from './pagina.js';

/** Lo que se queda quieto el último fotograma antes de repetir un clip que no va en bucle. */
const PAUSA_DE_LA_FICHA_MS = 700;

const ANIM_DE_PARTIDA: AnimDeFicha = {
  clip: 'idle',
  inicio: 0,
  mira: INDICE_DE_HOJA[MIRADA_DE_PRESENTACION],
};

export function animDe(vista: EstadoDeLaVista, clave: string): AnimDeFicha {
  return vista.animDeFicha.get(clave) ?? ANIM_DE_PARTIDA;
}

/**
 * Los lienzos de las figuras de la vista que se ve, y de ellos solo se pintan
 * los que están en pantalla (`enPantalla`): con cuatro fichas y la lista, la
 * mitad quedan fuera al desplazar.
 */
export function recogerFiguras(pagina: PaginaDeLaArena, raiz: Element): void {
  const { catalogo, vista, vigiaDeFiguras } = pagina;
  soltarFiguras(pagina);
  for (const lienzo of raiz.querySelectorAll('canvas[data-figura]')) {
    const ctx = lienzo instanceof HTMLCanvasElement ? lienzo.getContext('2d') : null;
    if (ctx === null || !(lienzo instanceof HTMLCanvasElement)) continue;
    const id = lienzo.getAttribute('data-figura') as string;
    const lado = lienzo.getAttribute('data-lado');
    vista.figuras.push({
      lienzo,
      ctx,
      id,
      clave: lienzo.getAttribute('data-ficha-clip') === 'si' ? claveDelElemento(lienzo) : null,
      lado: lado === 'izquierda' || lado === 'derecha' ? lado : null,
      rotulo: nombreDeFigura(catalogo, id).slice(0, 3),
    });
    vigiaDeFiguras?.observe(lienzo);
  }
}

/** Ninguna figura que animar (se ha cerrado lo que las tenía). */
function soltarFiguras(pagina: PaginaDeLaArena): void {
  const { vista, vigiaDeFiguras } = pagina;
  vista.figuras = [];
  vigiaDeFiguras?.disconnect();
  vista.enPantalla.clear();
}

/**
 * Quién escribe qué lienzos de figura se ven (`vista.enPantalla`): un `IntersectionObserver`, que
 * avisa al entrar o salir uno de la pantalla (o de su región desplazable) y pide un fotograma; sin
 * la API, `null`, y se pintan todos. Se hace al cargar la página, en este sitio.
 */
export function vigiaDeLasFiguras(
  vista: EstadoDeLaVista,
  pedirFotograma: () => void,
): IntersectionObserver | null {
  return typeof IntersectionObserver === 'undefined'
    ? null
    : new IntersectionObserver((cambios) => {
        for (const c of cambios) {
          if (c.isIntersecting) vista.enPantalla.add(c.target);
          else vista.enPantalla.delete(c.target);
        }
        pedirFotograma();
      });
}

/** El instante dentro de un clip que no va en bucle, repetido con una pausa al final. */
function repeticion(
  ahora: number,
  inicio: number,
  c: { readonly frames: number; readonly fps: number },
): number {
  const dura = (c.frames / c.fps) * 1000;
  return (ahora - inicio) % (dura + PAUSA_DE_LA_FICHA_MS);
}

/**
 * Las figuras animadas de lo que se ve: las miniaturas y las fichas del montaje,
 * la edición o el equipo (`recogerFiguras`; las de la rueda las anima ella,
 * `DialogoDeLaRueda.animar`). Devuelve si hay que seguir: sin ninguna —al arrancar, con
 * los bandos vacíos y sin ficha— no hay nada que repintar, y el bucle se para
 * hasta el siguiente gesto o la siguiente imagen.
 */
export function animarFiguras(pagina: PaginaDeLaArena, ahora: number): boolean {
  const { vista, vigiaDeFiguras } = pagina;
  for (const [i, { lienzo, ctx, id, clave: deFicha, lado, rotulo }] of vista.figuras.entries()) {
    if (vigiaDeFiguras !== null && !vista.enPantalla.has(lienzo)) continue;
    const arte = arteDe(id);
    // En la miniatura cada figura llena su marco: aquí se mira una, no se
    // comparan. `pintarFigura` escala contra un adulto, así que se le pide el
    // alto que deja a ESTA figura en el 80 % del marco. Se pinta como en el
    // tablero —teñida del color de su bando, o el marcador si no ha llegado—.
    const anim = deFicha === null ? null : animDe(vista, deFicha);
    const clip: CharacterClip = anim === null ? 'idle' : anim.clip;
    // Los dos bandos se miran; la ficha, hacia donde la haya girado quien mira.
    const mira: Direccion =
      anim !== null
        ? (DIRECCION_DE_HOJA[anim.mira] as Direccion)
        : lado === 'derecha'
          ? 'SO'
          : MIRADA_DE_PRESENTACION;
    // El cadáver tendido es más ancho que alto y cae por debajo de los pies
    // —hacia la cámara, y en las hojas pintadas su fila va subida en la celda—:
    // con la muerte la figura se achica y el suelo sube hasta que quepa la celda
    // entera, o la ficha lo cortaba por abajo y por los lados.
    const llena = clip === 'death' ? 0.4 : 0.8;
    const alto = (lienzo.height * llena * FIGURA.alturaAdulto) / arte.alturaPropia;
    const atlas = hojaDe(arte, mira);
    const bajoLosPies =
      clip === 'death'
        ? ((atlas.cell - atlas.clips.death.anchor[1]) * alto) / FIGURA.alturaAdulto
        : 8;
    const figura: Figura = {
      // El compás va por miniatura y no por hoja: la misma unidad puede estar
      // en el catálogo y en los dos bandos, y no tiene por qué respirar igual.
      id: `miniatura-${i}-${id}`,
      body: id,
      clip,
      // Un clip que no va en bucle (ataque, disparo, daño, muerte) se repite en
      // la ficha: con el reloj de siempre se quedaba en su último fotograma.
      tiempo:
        anim !== null && !atlas.clips[clip].loop
          ? repeticion(ahora, anim.inicio, atlas.clips[clip])
          : ahora,
      x: lienzo.width / 2,
      suelo: lienzo.height - bajoLosPies,
      alto,
      mira,
      color: lado === null ? COLOR_NEUTRO : COLOR_BANDO[LADOS[lado].bando],
      rotulo,
    };
    const colocada = colocarFigura(figura);
    const clave = claveDelDibujo(colocada);
    if (vista.pintado.get(lienzo) === clave) continue;
    vista.pintado.set(lienzo, clave);
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    pintarSombraDeFigura(ctx, colocada);
    pintarFigura(ctx, colocada);
  }
  // Con alguna figura con arte en pantalla, respira: el bucle sigue. Sin arte,
  // la imagen que llegue avisa y repinta.
  const aLaVista = vigiaDeFiguras === null ? vista.figuras.length : vista.enPantalla.size;
  return aLaVista > 0 && hayFigurasAnimadas();
}
