/**
 * Lo que la pantalla dice a la persona y no es una regla: texto sin cuenta ninguna
 * (del núcleo, solo tipos), que leen la sesión y las pantallas de las tres páginas,
 * también el espectador, todos hacia abajo. Hasta la fase C de la reorganización
 * (07-11-2026) vivía en la sesión —lo de la obra, en `sesion/dichos.ts` (antes,
 * `dicho-del-puesto.ts`); las ayudas, en `sesion/partida.ts`— y `COMO_SE_COLOCA`, en
 * la pelea en pantalla (`batalla/colocar.ts`): la sesión importaba de una capa de
 * arriba y el espectador cargaba `sesion/` para su crónica.
 *
 * - **La obra de un puesto** (puesto fronterizo, fase 3, 04-11-2026): lo que se ve
 *   en el mapa con cada una, y de cada obra su nombre, su botón, la barra al
 *   hacerla y su línea de la crónica. Tablas exhaustivas: una obra nueva sin su
 *   frase no compila, y no hay un ternario sobre `'empalizada'` en cada fichero que
 *   la nombra (simplify de la fase 3, S29). El material de su muralla no se escribe
 *   aquí: lo da el núcleo (`LaObraDelPuesto.materiales`, de `data/sitios.json`).
 * - **Cómo se coloca** en el despliegue y en la tropa (`COMO_SE_COLOCA`).
 * - **Las ayudas de la barra** de cada escena cuando el puntero no señala nada
 *   (`AYUDA_*`).
 */
import type { MejoraDelPuesto, ObraDelPuesto } from '@core/map/tipos.js';
/** Lo que se ve en el mapa en un puesto con cada obra (la petición del usuario). */
export const SE_VE_EN_EL_PUESTO: Readonly<Record<MejoraDelPuesto, string>> = {
  ninguna: 'una caseta',
  empalizada: 'una torreta de madera',
  muralla: 'una torre',
};

/** Cómo se dice una obra. */
interface DichoDeLaObra {
  /** Su nombre en una frase: «la empalizada». */
  readonly nombre: string;
  /** El botón que la hace, sin el precio. */
  readonly boton: string;
  /** La barra al hacerla, con el sitio tras «de» (`delSitio`). */
  readonly hecho: (delSitio: string) => string;
  /**
   * La crónica: la obra hecha en `elPuesto` («el puente de (3,4)»), en segunda
   * persona si es de quien lee y, si no, en tercera, sin sujeto.
   */
  readonly cronica: (mio: boolean, elPuesto: string) => string;
}

export const DICHO_DE_LA_OBRA: Readonly<Record<ObraDelPuesto, DichoDeLaObra>> = {
  empalizada: {
    nombre: 'la empalizada',
    boton: 'Levantar la empalizada',
    hecho: (del) => `Levantada la empalizada ${del}.`,
    cronica: (mio, el) => `${mio ? 'Levantas' : 'levanta'} la empalizada en ${el}`,
  },
  muralla: {
    nombre: 'la muralla',
    boton: 'Amurallar',
    hecho: (del) => `Amurallado el puesto ${del}.`,
    cronica: (mio, el) => `${mio ? 'Amurallas' : 'amuralla'} ${el}`,
  },
};

/**
 * Cómo se coloca, dicho una vez para la barra y los paneles del despliegue y de la
 * tropa: empieza en minúscula para ir tras dos puntos.
 */
export const COMO_SE_COLOCA =
  'pulsa a uno de los tuyos y luego una casilla verde de su zona (pulsar a otro lo elige; su casilla, los cambia). Las flechas mueven al elegido.';

/**
 * Lo que dice la barra en el mapa la primera vez: al salir de la base en que
 * empieza la partida (`abrirSuBase`).
 */
export const AYUDA_DEL_MAPA =
  'Haz clic en el mapa para mover a tu héroe; arrastra para mirar. Espacio pasa el turno.';

/*
 * Las ayudas de la barra nombran el botón de salir y, entre paréntesis, Escape: en
 * un móvil no hay teclado (QA M7 de la morada, 20-10-2026).
 */

/** Lo que dice la barra en la base cuando el ratón no señala nada. */
export const AYUDA_DE_LA_BASE =
  'Pulsa el suelo para andar, un edificio para entrar o a alguien para hablar. «Volver al mapa» (o Escape) sale.';

/**
 * Lo que dice la barra en la escena de la tropa cuando el ratón no señala a nadie:
 * la tropa es el despliegue (02-11-2026), y se coloca como en él (`COMO_SE_COLOCA`).
 */
export const AYUDA_DE_LA_TROPA = `Tu formación, donde sale cada uno en cada batalla: ${COMO_SE_COLOCA} Su ficha y su equipo, en el panel. «Volver al mapa» (o Escape) sale.`;

/** Lo que dice la barra en la escena de una morada cuando el ratón no señala a nadie. */
export const AYUDA_DE_LA_MORADA =
  'Pulsa una figura para ver su ficha y reclutar. «Volver a la base» (o Escape) sale.';

/** Lo que dice la barra en la escena del ayuntamiento cuando el ratón no señala a nadie. */
export const AYUDA_DEL_AYUNTAMIENTO =
  'Pulsa una figura para ver su ficha y su precio. «Volver a la base» (o Escape) sale.';

/** Lo que dice la barra al empezar, con el héroe de salida por elegir. */
export const AYUDA_DE_LA_SALIDA =
  'Elige a tu héroe: pulsa una figura para ver su ficha y contrátalo. Hasta entonces no se puede hacer nada más.';

/** Lo que dice la barra en la escena de un lugar cuando el ratón no señala nada. */
export const AYUDA_DEL_LUGAR =
  'Pulsa el suelo para andar, o a alguien o algo para hablar o mirar. «Volver al mapa» (o Escape) sale.';

/** Lo que dice la barra al abrirse el despliegue de la persona. */
export const AYUDA_DEL_DESPLIEGUE = `Despliega a los tuyos: ${COMO_SE_COLOCA} «Listo» empieza la batalla.`;
