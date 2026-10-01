/**
 * El arte de los efectos de batalla de `NuevaJugabilidad.md`, en el estilo
 * pintado oscuro. Tres familias:
 *
 *  - **Iconos de estado**: una sola lámina de 4×4 (que casen entre sí), que el
 *    taller parte en un fichero por icono.
 *  - **Efectos animados**: 6 fotogramas en 3×2, que el taller empaqueta en una
 *    tira de 6×256.
 *  - **Sprites quietos**: el cadáver, los obstáculos y los proyectiles.
 *
 * La referencia de estilo es la muestra del mapa elegida por el usuario, que es
 * la que fija el pintado oscuro fuera de las figuras.
 */
import type { Encargo } from './encargo.js';
import { MUESTRA_ELEGIDA } from './mapa.js';

/** En el orden de la lámina (lectura, 4×4). Cada uno dice la habilidad que lo usa. */
export const ICONOS = [
  { id: 'veneno', describe: 'una gota verde de veneno con una calavera pequeña' },
  { id: 'aturdido', describe: 'tres estrellas doradas girando en espiral' },
  { id: 'recarga', describe: 'un reloj de arena de latón' },
  { id: 'guardia', describe: 'un escudo de acero con borde dorado' },
  { id: 'proteger', describe: 'un escudo con una flecha curva que rodea a un aliado' },
  { id: 'desafio', describe: 'un guantelete de acero arrojado, el gesto de reto' },
  { id: 'cobarde', describe: 'un signo de exclamación amarillo sobre una gota de sudor' },
  { id: 'miedo', describe: 'un cráneo pálido con las cuencas brillando en verde' },
  { id: 'bendecido', describe: 'un halo dorado con rayos de luz' },
  { id: 'regeneracion', describe: 'una hoja verde con una cruz de luz' },
  { id: 'sigilo', describe: 'un ojo tachado por una capucha de sombra' },
  { id: 'estupido', describe: 'un signo de interrogación torcido con una nube de confusión' },
  { id: 'contraataque', describe: 'dos espadas cruzadas con una flecha de vuelta' },
  { id: 'antiinfanteria', describe: 'tres puntas de lanza en abanico, hacia arriba' },
  { id: 'fe', describe: 'una cruz roja templaria sobre un sol pálido' },
  { id: 'furia', describe: 'un cráneo de orko rugiendo con colmillos y fuego rojo' },
] as const;

export const EFECTOS_ANIMADOS = [
  {
    id: 'explosion',
    describe:
      'la explosión de un barril de pólvora: destello, bola de fuego anaranjada que crece, humo negro y astillas, y se disipa',
  },
  {
    id: 'curacion',
    describe:
      'una curación: columna de luz dorada suave que sube desde el suelo con chispas, y se apaga',
  },
  {
    id: 'resurreccion',
    describe:
      'una resurrección nigromántica: niebla morada que brota del suelo, runas verdes y manos espectrales que se alzan, y se disipa',
  },
  {
    id: 'golpe',
    describe:
      'el impacto de un golpe de arma: destello blanco, chispas y un arco de corte, muy rápido',
  },
  {
    id: 'veneno',
    describe: 'una nube de veneno verde con burbujas que se forma, flota y se desvanece',
  },
  {
    id: 'fuego',
    describe:
      'una bola de fuego que cae y estalla en el suelo en un círculo de llamas y brasas, y se apaga',
  },
  {
    id: 'drenaje',
    describe:
      'un drenaje oscuro: hilos de energía morada y negra que salen de un punto y se retuercen hacia arriba',
  },
  {
    id: 'raices',
    describe:
      'raíces y zarzas que brotan del suelo, se enroscan hacia arriba y quedan quietas atrapando algo invisible',
  },
] as const;

export const SPRITES_QUIETOS = [
  {
    id: 'cadaver',
    describe:
      'un cadáver en el campo de batalla: un caído cubierto por su capa, con un escudo roto y una espada en el suelo; sin sangre',
  },
  {
    id: 'empalizada',
    describe:
      'un obstáculo de empalizada: cinco troncos afilados clavados en el suelo, atados con cuerda',
  },
  {
    id: 'trampa',
    describe: 'una trampa de cepo de hierro abierta, medio oculta entre hierba y hojas',
  },
  {
    id: 'flecha',
    describe: 'una flecha en vuelo, horizontal, apuntando a la derecha, con plumas grises',
  },
  {
    id: 'virote',
    describe: 'un virote de ballesta en vuelo, corto y grueso, horizontal, apuntando a la derecha',
  },
  {
    id: 'bala-de-canon',
    describe: 'una bala de cañón de hierro en vuelo con una estela de humo hacia la izquierda',
  },
] as const;

const CAMARA =
  'Cámara ortográfica elevada 25 grados sobre la horizontal, como la imagen de estilo; nunca cenital. La luz viene de arriba a la izquierda.';
const ESTILO =
  'Estilo de la imagen de estilo: ilustración pintada de fantasía medieval oscura, colores sobrios con los brillos justos para leerse.';
const REF = [{ ruta: MUESTRA_ELEGIDA, papel: 'estilo' as const }];

export function encargoDeIconos(): Encargo {
  return {
    id: 'efectos-iconos',
    tipo: 'iconos',
    descripcion: [
      'Iconos de estado de un juego de estrategia por turnos, para ponerlos encima de las fichas de batalla. Se tienen que leer a 32 píxeles: silueta clara, pocos detalles, un color dominante cada uno.',
      `${ESTILO} Todos con el mismo tratamiento: dibujo pintado sin marco ni medallón detrás.`,
      'Dieciséis iconos sueltos en una rejilla de 4 por 4, en este orden de lectura, separados con mucha holgura:',
      ICONOS.map((ic, i) => `${i + 1}. ${ic.describe}.`).join('\n'),
    ].join('\n'),
    referencias: REF,
    salida: 'assets/efectos/iconos/iconos',
    fondo: 'transparente',
    nombres: ICONOS.map((ic) => ic.id),
  };
}

export function encargoDeEfecto(id: string): Encargo {
  const e = EFECTOS_ANIMADOS.find((x) => x.id === id);
  if (e === undefined) throw new Error(`no hay efecto «${id}»`);
  return {
    id: `efecto-${id}`,
    tipo: 'efecto',
    descripcion: [
      `Un efecto visual de batalla de un juego de estrategia por turnos: ${e.describe}.`,
      `${ESTILO} ${CAMARA} El efecto ocurre sobre una casilla del suelo, sin dibujar el suelo.`,
    ].join('\n'),
    referencias: REF,
    salida: `assets/efectos/animados/${id}`,
    fondo: 'transparente',
  };
}

export function encargoDeSprite(id: string): Encargo {
  const s = SPRITES_QUIETOS.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no hay sprite «${id}»`);
  return {
    id: `efecto-${id}`,
    tipo: 'imagen',
    descripcion: [
      `Un elemento del campo de batalla de un juego de estrategia por turnos: ${s.describe}.`,
      `Un único objeto, centrado y entero. ${ESTILO} ${CAMARA}`,
    ].join('\n'),
    referencias: REF,
    salida: `assets/efectos/${id}`,
    fondo: 'transparente',
  };
}

export function encargosDeEfectos(): Encargo[] {
  return [
    encargoDeIconos(),
    ...EFECTOS_ANIMADOS.map((e) => encargoDeEfecto(e.id)),
    ...SPRITES_QUIETOS.map((s) => encargoDeSprite(s.id)),
  ];
}
