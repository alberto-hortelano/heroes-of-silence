/**
 * Los interruptores de reglas de la batalla: para cada regla dudosa, la versión
 * **nuestra** (la del juego hoy) o la de **fheroes2** (`9754feff`), para
 * compararlas peleando en la arena (decisión del usuario, 09-10-2026).
 *
 * Viven en `BattleState.reglas`, puestas UNA vez al montar la batalla y leídas
 * por el motor donde actúa cada una (el daño, la moral, defender, los efectos),
 * con la cita de la fuente allí. **El juego no las enciende nunca**: `createBattle`
 * pone `REGLAS_DEL_JUEGO`, y solo la arena llega a `crearBatallaConReglas`
 * (lo vigila `test/invariantes.test.ts`). Con todas en «nuestra» la arena pelea
 * exactamente como el juego, y lo comprueba `test/arena.test.ts`.
 *
 * Adoptar una regla de fheroes2 en el juego NO es encender aquí un interruptor:
 * es otra tarea, que cambia la rama «nuestra» y re-ancla el banco.
 */
import type { StackEffect } from './effects.js';

/**
 * Las reglas que se pueden cambiar, en el orden en que se enseñan y en que van
 * en la URL. Una lista de valores, para recorrerla en la página y en los tests.
 */
export const NOMBRES_DE_REGLA = [
  'tirador',
  'ataqueDefensa',
  'moralBaja',
  'defender',
  'bendicion',
  'heroe',
] as const;
export type NombreDeRegla = (typeof NOMBRES_DE_REGLA)[number];

export type VersionDeRegla = 'nuestra' | 'fheroes2';

export type ReglasDeBatalla = Readonly<Record<NombreDeRegla, VersionDeRegla>>;

/** Las del juego: todas «nuestra». Congeladas, para que nadie las encienda a mano. */
export const REGLAS_DEL_JUEGO: ReglasDeBatalla = Object.freeze({
  tirador: 'nuestra',
  ataqueDefensa: 'nuestra',
  moralBaja: 'nuestra',
  defender: 'nuestra',
  bendicion: 'nuestra',
  heroe: 'nuestra',
});

/**
 * Qué dice cada versión, para la persona: lo leen el montaje de la arena y la
 * previsión de daño. Las cifras van escritas porque son las que aplica el motor;
 * si cambian allí, el test de `reglas-de-batalla.test.ts` que las ejerce se pone
 * rojo antes de que esta frase mienta en pantalla.
 */
export const DESCRIPCION_DE_REGLA: Readonly<
  Record<
    NombreDeRegla,
    { readonly nombre: string; readonly nuestra: string; readonly fheroes2: string }
  >
> = {
  tirador: {
    nombre: 'Tirador',
    nuestra: 'a más de 5 casillas pega la mitad; cuerpo a cuerpo, entero',
    fheroes2: 'sin castigo por distancia; con flechas y cuerpo a cuerpo, la mitad',
  },
  ataqueDefensa: {
    nombre: 'Ataque contra defensa',
    nuestra: '+10 % por punto de ataque hasta ×4; −2,5 % por punto de defensa hasta ×0,3',
    fheroes2: '+10 % por punto de ataque hasta ×3; −5 % por punto de defensa hasta ×0,2',
  },
  moralBaja: {
    nombre: 'Moral baja',
    nuestra: '1/24 por punto de perder el turno',
    fheroes2: '1/12 por punto de perder el turno',
  },
  defender: {
    nombre: 'Defender',
    nuestra: '+20 % de defensa, y la moral alta puede dar otro turno',
    fheroes2: 'sin bono de defensa y sin turno extra por moral',
  },
  bendicion: {
    nombre: 'Bendición y Maldición',
    nuestra: '±1 de suerte',
    fheroes2: 'daño máximo y daño mínimo (también la Maldición de la momia)',
  },
  heroe: {
    nombre: 'Ataque y defensa del héroe',
    nuestra: 'solo en los golpes del propio héroe',
    fheroes2: 'se suman a toda su tropa',
  },
};

/**
 * Las reglas que pide la URL (`?reglas=tirador,bendicion`): se listan las que van
 * en fheroes2. Ausente o vacío, las del juego. Un nombre que no es una regla se
 * rechaza diciendo cuáles valen, como `parseSeed`: una URL copiada con una errata
 * reproduciría otra pelea sin decirlo.
 */
export function reglasDeLaURL(texto: string | null): ReglasDeBatalla {
  if (texto === null || texto.trim() === '') return REGLAS_DEL_JUEGO;
  const reglas: Record<NombreDeRegla, VersionDeRegla> = { ...REGLAS_DEL_JUEGO };
  for (const trozo of texto.split(',')) {
    const nombre = trozo.trim();
    const regla = NOMBRES_DE_REGLA.find((n) => n === nombre);
    if (regla === undefined) {
      throw new Error(
        `«${nombre}» no es una regla de la arena; valen ${NOMBRES_DE_REGLA.join(', ')}`,
      );
    }
    if (reglas[regla] === 'fheroes2') throw new Error(`la regla «${regla}» está dos veces`);
    reglas[regla] = 'fheroes2';
  }
  return Object.freeze(reglas);
}

/** La inversa de `reglasDeLaURL`: las que van en fheroes2, en su orden, o `''`. */
export function reglasALaURL(reglas: ReglasDeBatalla): string {
  return reglasEncendidas(reglas).join(',');
}

/** Las que no son las del juego, para decirlas en la previsión. */
export function reglasEncendidas(reglas: ReglasDeBatalla): readonly NombreDeRegla[] {
  return NOMBRES_DE_REGLA.filter((n) => reglas[n] === 'fheroes2');
}

/**
 * Las mismas reglas con una cambiada, congeladas como las demás: es lo que hace el
 * interruptor de la arena. La versión se comprueba, que llega de un atributo del
 * marcado y una errata no puede convertirse en «nuestra» sin decirlo.
 */
export function conRegla(
  reglas: ReglasDeBatalla,
  nombre: string,
  version: string,
): ReglasDeBatalla {
  const regla = NOMBRES_DE_REGLA.find((n) => n === nombre);
  if (regla === undefined) {
    throw new Error(
      `«${nombre}» no es una regla de la arena; valen ${NOMBRES_DE_REGLA.join(', ')}`,
    );
  }
  if (version !== 'nuestra' && version !== 'fheroes2') {
    throw new Error(`«${version}» no es una versión de regla; valen nuestra y fheroes2`);
  }
  return Object.freeze({ ...reglas, [regla]: version });
}

/**
 * El efecto que de verdad cuelga, con las reglas de la batalla: con el
 * interruptor (e) en fheroes2, la suerte de la Bendición y la Maldición —del
 * hechizo o de la momia— no mueve la suerte: fija la tirada al máximo o al mínimo
 * (`tirada`, con su signo). La duración y el origen no cambian. Con la nuestra, el
 * mismo efecto. La única redacción de la regla (e): la leen `efectoDe`
 * (`spells.ts`) y los efectos al golpear (`battle.ts`).
 */
export function efectoConReglas(
  efecto: StackEffect,
  reglas: Pick<ReglasDeBatalla, 'bendicion'>,
): StackEffect {
  if (efecto.kind !== 'luck' || reglas.bendicion === 'nuestra') return efecto;
  return { ...efecto, kind: 'tirada', amount: efecto.amount > 0 ? 1 : -1 };
}
