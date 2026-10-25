/** Tipos compartidos por todo el núcleo. Sin DOM, sin node:*. */

// ---------------------------------------------------------------- oro

/**
 * Un precio en prosa: «15 000 oro» (con `conMiles`), o «gratis» si no cuesta
 * nada. **El único formateador de precios**: lo leen los motivos del núcleo
 * (`buildBlocker`, `recruitBlocker`), la prosa del agente y el cliente. Un
 * precio es un número de oro, el único recurso, y el monedero también
 * (`Player.oro`).
 */
export function describirCoste(oro: number): string {
  if (!Number.isSafeInteger(oro) || oro < 0) {
    throw new Error(`describirCoste: ${oro} no es un precio en oro (un entero ≥ 0)`);
  }
  return oro === 0 ? 'gratis' : `${conMiles(oro)} oro`;
}

/**
 * Una lista en prosa: «a», «a y b», «a, b y c» o, con `o`, «3, 5 o 7». **El único
 * enumerador** de los motivos y avisos del núcleo, que antes lo escribían cada
 * uno. Lanza con la lista vacía: «nada» lo dice quien llama, que sabe de qué.
 */
export function enumerar(lista: readonly string[], conjuncion: 'y' | 'o' = 'y'): string {
  const ultimo = lista.at(-1);
  if (ultimo === undefined) throw new Error('enumerar: la lista está vacía');
  return lista.length === 1 ? ultimo : `${lista.slice(0, -1).join(', ')} ${conjuncion} ${ultimo}`;
}

/**
 * Un entero con separador de miles, como se lee en castellano: «176 000», con un
 * espacio que no se parte (U+00A0), no con punto ni coma, que en una barra con
 * decimales a coma se confundirían. Los de cuatro cifras van juntos («2500»),
 * como pide la RAE. El único formateador de miles: lo leen los paneles del
 * cliente y del espectador; el contrato del agente sigue con números.
 */
export function conMiles(n: number): string {
  if (!Number.isSafeInteger(n)) {
    throw new Error(`conMiles: ${n} no es un entero que se pueda escribir con sus cifras`);
  }
  const cifras = Math.abs(n).toString();
  if (cifras.length <= 4) return n.toString();
  const agrupadas = cifras.replace(/\B(?=(\d{3})+$)/g, '\u00A0');
  return n < 0 ? `-${agrupadas}` : agrupadas;
}

/**
 * Una cifra con, como mucho, `decimales` decimales y coma, como se lee en
 * castellano: `10,8`, no `10.8`. El único formateador de decimales: lo leen la
 * previsión del núcleo (`damage.ts`), la de la barra y la ficha de la arena, que
 * antes lo escribían cada uno.
 */
export function conComa(n: number, decimales: number): string {
  // Sin `**`: `core` no usa potencias (CLAUDE.md, coma flotante portable).
  let f = 1;
  for (let i = 0; i < decimales; i++) f *= 10;
  return (Math.round(n * f) / f).toString().replace('.', ',');
}

// ---------------------------------------------------------------- velocidad

/**
 * Escalones de velocidad. Fijan dos cosas distintas:
 * el orden de iniciativa en batalla y los puntos de movimiento del héroe en
 * el mapa (que los marca la criatura MÁS LENTA del ejército).
 *
 * Salen de la agilidad efectiva (`cifrasDelCuerpo`, `core/cuerpo.ts`), que el peso
 * puede bajar hasta 1: por eso `crawling` (1 casilla), **regla nuestra**
 * (25-10-2026), que fheroes2 no tiene; en el mapa anda como `very_slow`.
 */
export const SPEED_TIERS = [
  'crawling',
  'very_slow',
  'slow',
  'average',
  'fast',
  'very_fast',
  'ultra_fast',
] as const;

export type SpeedTier = (typeof SPEED_TIERS)[number];

/** Hexes que recorre una unidad de esa velocidad en un turno de batalla. */
export const SPEED_TO_HEXES: Readonly<Record<SpeedTier, number>> = {
  crawling: 1,
  very_slow: 2,
  slow: 3,
  average: 4,
  fast: 5,
  very_fast: 6,
  ultra_fast: 7,
};

/**
 * Puntos de movimiento diarios del héroe en tierra, por la criatura más lenta
 * de su ejército. Verificado en `heroes.cpp::GetMaxMovePoints()` de fheroes2.
 * Es la cita, no lo que anda el héroe: `maxMovePoints` la lleva a la escala
 * del mapa (`marchaALaEscala`, `core/escala.ts`, #226).
 */
export const SPEED_TO_MOVE_POINTS: Readonly<Record<SpeedTier, number>> = {
  // Regla nuestra: fheroes2 no baja de `very_slow`.
  crawling: 1000,
  very_slow: 1000,
  slow: 1100,
  average: 1200,
  fast: 1300,
  very_fast: 1400,
  ultra_fast: 1500,
};

// ---------------------------------------------------------------- criaturas

/**
 * Las facciones del juego, una vez (#108): las cinco de las hojas de la arena
 * (19-10-2026, «las cinco sustituyen»: caballeros y nigromantes se retiraron con
 * `data/creatures.json`). El tipo sale de la lista y no al revés, para que los
 * esquemas del contrato (`z.enum(FACTION_IDS)`), la paleta del mapa, el catálogo
 * de unidades y el taller (`tools/taller/unidades.ts`) la lean en vez de copiarla.
 */
export const FACTION_IDS = ['templarios', 'no-muertos', 'imperio', 'elfos', 'orkos'] as const;
export type FactionId = (typeof FACTION_IDS)[number];

/** Cómo se llama cada facción en pantalla: el juego, la arena y el taller. */
export const NOMBRE_DE_FACCION: Readonly<Record<FactionId, string>> = {
  templarios: 'Templarios',
  'no-muertos': 'No muertos',
  imperio: 'Imperio',
  elfos: 'Elfos',
  orkos: 'Orkos',
};

/** Si un texto es el id de una facción. */
export function esFaccion(x: string): x is FactionId {
  return (FACTION_IDS as readonly string[]).includes(x);
}

/**
 * La facción que pide la URL (`?faccion=`), con la regla de `parseSeed`: no pedir
 * ninguna no es un error y da `null` (la sortea la semilla); una que no existe se
 * rechaza nombrando las que valen, en vez de jugar otra en silencio.
 */
export function parseFaccion(texto: string | null | undefined): FactionId | null {
  if (texto === null || texto === undefined || texto.trim() === '') return null;
  if (!esFaccion(texto)) {
    const valen = FACTION_IDS.map((id) => `${id} (${NOMBRE_DE_FACCION[id]})`).join(', ');
    throw new Error(`"${texto}" no es una facción: las que hay son ${valen}`);
  }
  return texto;
}

/**
 * Rasgos especiales de criatura.
 *
 * Es una constante recorrible, y no solo una unión de literales, porque hay un
 * test que la recorre: `test/invariantes.test.ts` exige que cada rasgo
 * declarado aparezca leído en algún sitio de `src/core`. Durante mucho tiempo
 * cuatro de estos once estuvieron escritos aquí y en `data/creatures.json` sin
 * que el motor los mirara: el jugador —y el agente, que los recibe en cada
 * turno de batalla— pagaban por una ficha que mentía.
 */
export const CREATURE_TRAITS = [
  'undead',
  'flying',
  'no_retaliation',
  'double_attack',
  'double_shot',
  'life_drain',
  'splash_shot',
  'charge',
  'curse_on_hit',
  'bane_undead',
  'fear',
  'escalar',
] as const;

export type CreatureTrait = (typeof CREATURE_TRAITS)[number];

/**
 * Qué hace cada rasgo del motor, dicho en corto: la casilla de la ficha de la
 * arena, el parte y la ficha de la morada. Vive junto a los rasgos y no en
 * `core/arena.ts` porque la partida también los nombra, y la arena no la importa
 * nadie más (`invariantes.test.ts`).
 */
export const NOMBRE_DE_RASGO: Readonly<Record<CreatureTrait, string>> = {
  undead: 'no-muerto',
  flying: 'vuela',
  no_retaliation: 'sin contraataque',
  double_attack: 'ataque doble',
  double_shot: 'disparo doble',
  life_drain: 'drena vida',
  splash_shot: 'disparo con salpicadura',
  charge: 'carga',
  curse_on_hit: 'maldice al golpear',
  bane_undead: 'azote de no-muertos',
  fear: 'terror',
  escalar: 'escala murallas',
};

/**
 * Lo que el motor de batalla necesita saber de una unidad para jugarla: las
 * cifras de combate, sin nada de economía.
 *
 * Existe porque ya no todo lo que pisa el tablero sale del catálogo: un
 * personaje (`rpg/stats.ts`) tiene sus propias cifras, calculadas de sus
 * atributos. Una criatura ES una `UnitInfo` —la extiende—, así que para el
 * catálogo no hay traducción: el stack de batalla guarda la misma referencia.
 *
 * `faction: null` es «sin facción»: no suma a la diversidad del ejército.
 */
export interface UnitInfo {
  readonly name: string;
  readonly faction: FactionId | null;
  readonly attack: number;
  /**
   * La fuerza del cuerpo (25-10-2026, «aparecen las características fuerza y
   * agilidad»): el daño mínimo, con la del arma encima, y lo que aguanta el peso
   * sin restar agilidad (`core/cuerpo.ts`).
   */
  readonly fuerza: number;
  /** La agilidad del cuerpo, sin lo que le reste el peso: de ella salen la defensa, el daño máximo y las casillas. */
  readonly agilidad: number;
  /**
   * La defensa que no es agilidad ni escudo: la Defensa del héroe con lo que le da
   * su rango, y la del personaje; 0 la tropa. Se suma a la defensa (`cifrasDelCuerpo`).
   */
  readonly defensaPropia: number;
  /**
   * **Derivadas**: `defense`, `damage` y `speed` salen de las de arriba y del
   * equipo, y las escribe solo `cifrasDelCuerpo` (`core/cuerpo.ts`; lo vigila
   * `test/invariantes.test.ts`). El motor, la IA y el contrato las leen tal cual.
   */
  readonly defense: number;
  /** [mínimo, máximo] de daño por efectivo: [fuerza, fuerza × agilidad efectiva], con la del arma. */
  readonly damage: readonly [number, number];
  readonly hp: number;
  readonly speed: SpeedTier;
  /**
   * Lo que pesa todo lo que lleva puesto (`Pieza.peso`), si pesa algo: lo escribe
   * solo `conEquipo`. Por encima de la fuerza resta agilidad (`restaDelPeso`).
   */
  readonly peso?: number;
  /**
   * **No hay `nivel` en las cifras**: se deriva de ellas, con el equipo puesto
   * (`nivelDeUnidad`). Tampoco las cifras sin equipo: lo que suma el equipo se
   * deriva de lo que lleva (`equipo`, con `modificadoresDePieza`), y el cuerpo
   * desnudo, de su origen (19-10-2026: fuera `sinEquipo`).
   */
  /**
   * Lo que lleva puesto (lo escribe `conEquipo`, la única suma de las piezas). No
   * viaja al espectador.
   */
  readonly equipo?: Equipo;
  /**
   * Con qué arma se da cada golpe, cuando no todos son con las cifras de arriba:
   * con algo en un hueco de arma por uso (`esArmaPorUso`) o un arma de cuerpo a
   * cuerpo, que dice su rueda. Lo escribe solo `conEquipo` y lo leen solo
   * `battle/armas.ts` (`cifrasDelGolpe`, la única lectura de las cifras de un golpe)
   * y su lista para la ficha (`armasDe`); lo vigila `test/invariantes.test.ts`.
   * Arriba quedan las cifras del cuerpo a cuerpo. Sin el campo, todo golpe va con
   * las de arriba. No viaja al espectador.
   */
  readonly armas?: ArmasDeLaUnidad;
  /**
   * Los puntos de armadura que lleva puesta (#262): se restan del daño de cada
   * golpe que recibe, con mínimo 0. Lo escribe solo `conEquipo` (la suma de
   * `Pieza.armadura`), y solo si es > 0. Fuera de `hero/equipo.ts`
   * lo lee solo `battle/armas.ts` (`armaduraDe`, `trasLaArmadura`); lo vigila
   * `test/invariantes.test.ts`. No es el hueco `armadura`: se llama de otro modo
   * para que se encuentre buscándolo. No viaja al espectador.
   */
  readonly puntosDeArmadura?: number;
  readonly traits?: readonly CreatureTrait[];
  /**
   * Los poderes que usa en su turno (`battle/poderes.ts`): Curar, Bendecir. Los pone
   * solo `unidadDeCombate`, por sus habilidades; los usan la persona, la IA y el
   * agente, con la jugada `power` (`contract/vocabulario.ts`).
   */
  readonly poderes?: readonly PoderId[];
}

/**
 * Para qué se usa un arma, **con el nombre de su hueco** (simplify de F2): `arma`,
 * pegar cuerpo a cuerpo (y devolver el golpe, y cargar), con las de `arma` y
 * `segunda`; `distancia`, disparar. Con cuál se da cada golpe lo decide
 * `usoDelGolpe` (`battle/damage.ts`). La lanza dejó de tener hueco propio
 * (25-10-2026, «la lanza de carga fuera, será una lanza»): es un arma de cuerpo a
 * cuerpo más, y montado le da su regla a la carga (`cifrasDeCarga`).
 */
export type UsoDeArma = 'arma' | 'distancia';

/**
 * Con qué armas se da un golpe y con qué cifras: las piezas por su id y su nombre
 * (ninguna si va con el cuerpo; dos, con dos armas de cuerpo a cuerpo, 25-10-2026),
 * y el ataque y el daño del cuerpo con todo su equipo salvo las armas de los otros
 * golpes (`conEquipo`). El nombre va aquí y no en un catálogo que lleve la batalla:
 * así la previsión y la ficha dicen con qué arma pega sin preguntar a nadie
 * (simplify de F2: la batalla no lleva catálogo).
 */
export interface GolpeConArma {
  readonly piezas: readonly { readonly id: string; readonly nombre: string }[];
  /** Si una de sus armas es una lanza (`Pieza.lanza`): montado, la carga cobra la del jinete. */
  readonly conLanza?: true;
  readonly attack: number;
  readonly damage: readonly [number, number];
  /**
   * Los niveles de la rueda del arma de ese golpe (`Pieza.rueda`); sin el campo, el
   * golpe no va con un arma que golpee en la rueda. Lo escribe `conEquipo`
   * con el resto de `armas`, y así la rueda no necesita el catálogo: la lee
   * `ruedaDelGolpe`.
   */
  readonly rueda?: NivelesDeLaRueda;
}

/**
 * Los seis tipos del anillo de la rueda del golpe (`battle/rueda.ts`), en el
 * sentido de las agujas del reloj desde arriba: los que tienen nivel en un arma
 * (`NivelesDeLaRueda`). Normal, el centro, no está: siempre es ×1.
 */
export const TIPOS_DEL_ANILLO = [
  'ofensivo',
  'fuerte',
  'finta',
  'defensivo',
  'rapido',
  'romperGuardia',
] as const;
export type TipoDelAnillo = (typeof TIPOS_DEL_ANILLO)[number];

/**
 * Los tres tipos **fusionados** de las ruedas de 3 y de 5 (complejidad del combate,
 * 22-10-2026, decisión del usuario): cada uno es dos del anillo a la vez, con el
 * efecto de cada una de sus partes **a la mitad** (`efectoDelTipo`,
 * `battle/cifras-de-la-rueda.ts`). Sus partes, en `PARTES`
 * (`battle/formas-de-la-rueda.ts`). No tienen nivel en un arma: sus cifras salen
 * de las de sus partes.
 */
export const TIPOS_FUSIONADOS = ['ofensivoFuerte', 'defensivoFinta', 'rapidoRomper'] as const;

/**
 * Todos los tipos de golpe que existen: los seis del anillo, Normal (el centro) y
 * los tres fusionados. **No es una rueda**: cada batalla juega con los de la suya
 * (`FormaDeLaRueda.golpes`, `battle/formas-de-la-rueda.ts`), y esta lista solo sirve para
 * validar un texto. Vive aquí y no en `rueda.ts` porque los nombra la pieza
 * (`Pieza.rueda`), y `data.ts` no puede importar `rueda.ts` (que lee `data.ts`).
 */
export const TODOS_LOS_GOLPES = [...TIPOS_DEL_ANILLO, 'normal', ...TIPOS_FUSIONADOS] as const;
export type TipoDeGolpe = (typeof TODOS_LOS_GOLPES)[number];

/** Si `x` es un tipo de golpe de alguna rueda (`TODOS_LOS_GOLPES`). */
export function esTipoDeGolpe(x: unknown): x is TipoDeGolpe {
  return typeof x === 'string' && (TODOS_LOS_GOLPES as readonly string[]).includes(x);
}

/** Si `x` es un tipo del anillo (`TIPOS_DEL_ANILLO`): uno con nivel en un arma. */
export function esTipoDelAnillo(x: unknown): x is TipoDelAnillo {
  return typeof x === 'string' && (TIPOS_DEL_ANILLO as readonly string[]).includes(x);
}

/**
 * El nivel de un arma de cuerpo a cuerpo de la arena en cada tipo del anillo, de 0
 * (lo peor) a 6 (lo mejor), **absoluto** (decisión del usuario, 18-10-2026: «que
 * los valores de las barras sean absolutos y no relativos a la base del arma»):
 * el mismo nivel da lo mismo en toda arma. Las cifras de cada nivel, en
 * `data/rueda.json`; cómo se leen, `cifrasDeLosNiveles`. Normal no tiene nivel.
 */
export type NivelesDeLaRueda = Readonly<Record<TipoDelAnillo, number>>;

/**
 * Lo que una pieza con base sube (o baja) los niveles de la rueda de la suya
 * (`ExtrasDePieza.rueda`): niveles con signo, sin los tipos que no cambian.
 */
export type ExtrasDeLaRueda = Readonly<Partial<Record<TipoDelAnillo, number>>>;

/**
 * Las armas de una unidad de la arena (`UnitInfo.armas`), un golpe por uso: el de
 * cuerpo a cuerpo siempre —sus cifras son las de arriba—, y el de distancia si
 * lleva su arma.
 */
export type ArmasDeLaUnidad = { readonly arma: GolpeConArma } & Readonly<
  Partial<Record<HuecoDeArmaPorUso, GolpeConArma>>
>;

/**
 * El id de un poder de unidad de `data/poderes.json` (`curar`, `bendecir`). Vive
 * aquí y no en `battle/poderes.ts` porque lo nombran `UnitInfo` y la jugada
 * `poder`, y este fichero no importa de nadie.
 */
export type PoderId = string;

// ---------------------------------------------------------------- ejército

/**
 * Un individuo del ejército: una criatura del catálogo, o un personaje.
 *
 * **No tiene `count`, y es a propósito.** El ejército de un héroe es una lista
 * de individuos, uno por hex en el tablero; si el campo existiera, alguien
 * escribiría un 2 y el liderazgo —que se cuenta por individuo— mentiría. Diez
 * piqueros son diez entradas. Quien quiera verlos agrupados para pintarlos los
 * pide a `troopSummary`, que es el único sitio que agrupa.
 */
export interface Troop {
  readonly creature: string;
  /**
   * Id de un personaje de `GameState.characters`: el individuo ES ese
   * personaje. Va con `creature: CHARACTER_BODY`, que no está en el catálogo a
   * propósito: un lector de `Army` que no sepa de personajes lanza en vez de
   * leer cifras prestadas en silencio. La puerta que sí sabe es `troopUnit`.
   */
  readonly member?: string;
  /**
   * Lo que este individuo lleva vivido, o nada si es un novato. **Vive en el
   * individuo y viaja con él** —batalla, guarnición, recoger tropa, rendirse—
   * sin que nadie tenga que acordarse de copiarlo: es el mismo objeto el que
   * se mueve. Cuando muere, se pierde con él. Un libro aparte
   * (`state.veteranos[id]`) habría sido el segundo sitio del mismo hecho.
   */
  readonly veterania?: Veterania;
}

/**
 * La hoja de servicios de un individuo con experiencia (`hero/experiencia.ts`).
 * El rango **no se guarda**: se deriva de `experiencia` con `rangoDeTropa`, así
 * que no hay un segundo dato que subir al subir de rango.
 */
export interface Veterania {
  /**
   * Identidad estable, de `GameState.siguienteVeterano`: la necesita la tropa
   * que se hace héroe (el ciclo B), que tiene que poder decir CUÁL.
   */
  readonly id: string;
  readonly experiencia: number;
  /** Batallas de las que ha salido vivo desde que tiene experiencia. */
  readonly batallas: number;
  /** Enemigos que ha matado: individuos, no stacks. */
  readonly bajas: number;
  /** Los nombres de los héroes rivales que ha derribado él. */
  readonly heroes: readonly string[];
  /**
   * Lo que lleva puesto, si lleva algo (`hero/equipo.ts`). Vive en la hoja y no
   * al lado de ella porque la hoja ya es «lo que distingue a ESTE individuo de
   * los demás de su tipo»: lo vivido y, desde el ciclo del equipo, lo que lleva.
   * Un novato sin hoja es fungible —cuál de tres piqueros recibe la espada no
   * importa— y deja de serlo al equiparlo, así que equipar a un novato le abre la
   * hoja (experiencia 0, id del mismo contador). Con eso la pieza viaja con él
   * por el mismo camino que la experiencia —batalla, guarnición, rendirse— sin
   * que nadie se acuerde de copiarla, y muere con él.
   */
  readonly equipo?: Equipo;
}

// ---------------------------------------------------------------- equipo

/**
 * Los cinco huecos de equipo de un individuo o de un héroe: el arma de cuerpo a
 * cuerpo (`arma`), la segunda (`segunda`, 25-10-2026: «se permiten dos armas»; de
 * una mano, con la primera de una mano y sin escudo), la que dispara (`distancia`),
 * la armadura y el escudo (13-10-2026, «cada arma para lo suyo»; el escudo es un
 * hueco propio desde el 12-10-2026, opcional; la lanza dejó su hueco el 25-10-2026:
 * es un arma más). **Una sola clase de piezas** desde el 18-10-2026: el juego, la
 * arena, el botín, la armería y el agente tienen los mismos cinco. Van sin tilde y
 * en minúscula; al agente viajan en inglés, traducidos en un solo sitio
 * (`contract/vocabulario.ts`). Con cuál se da cada golpe lo elige `usoDelGolpe`
 * (`battle/damage.ts`).
 */
export const HUECOS = ['arma', 'segunda', 'distancia', 'armadura', 'escudo'] as const;

export type Hueco = (typeof HUECOS)[number];

/**
 * El hueco que dice una pieza (`Pieza.hueco`): todos menos `segunda`, que no es un
 * tipo de pieza sino un sitio más para una de `arma` (`huecosDeLaPieza`).
 */
export type HuecoDePieza = Exclude<Hueco, 'segunda'>;

/** Los huecos que una pieza escribe como el suyo (`Pieza.hueco`): `HUECOS` sin `segunda`. */
export const HUECOS_DE_PIEZA: readonly HuecoDePieza[] = HUECOS.filter(
  (h): h is HuecoDePieza => h !== 'segunda',
);

/** Si `x` es el hueco de una pieza (`HUECOS_DE_PIEZA`). */
export function esHuecoDePieza(x: string): x is HuecoDePieza {
  return (HUECOS_DE_PIEZA as readonly string[]).includes(x);
}

/**
 * En qué huecos se puede poner una pieza de `hueco`: el suyo y, un arma de cuerpo a
 * cuerpo, también la segunda (que sea de una mano lo dice `manosBlocker`). **La
 * única pregunta** de «¿va aquí?»: la leen `huecoBlocker` (el motivo, para
 * `equipoBlocker`, las manos y el `equip` del juego y del agente) y lo que ofrece
 * la ficha.
 */
export function huecosDeLaPieza(hueco: HuecoDePieza): readonly Hueco[] {
  return hueco === 'arma' ? ['arma', 'segunda'] : [hueco];
}

/**
 * El nombre de cada hueco, para pintarlo y para decirlo en un motivo: lo leen el
 * panel del héroe, la ficha de la arena y la regla de una base (`baseBlocker`,
 * `data.ts`). En el núcleo y no en el cliente porque son dos pantallas y un mismo
 * hueco.
 */
export const NOMBRE_DE_HUECO: Readonly<Record<Hueco, string>> = {
  arma: 'Arma',
  segunda: 'Segunda arma',
  distancia: 'Arma a distancia',
  armadura: 'Armadura',
  escudo: 'Escudo',
};

/**
 * Por qué la pieza `p` no va en `hueco` (`huecosDeLaPieza`), o `null`: «Escudo va
 * en Escudo, no en Segunda arma». La frase, una vez: la leen `manosBlocker`,
 * `equipoBlocker` y `equipoDelPortadorBlocker` (ponerse en el juego).
 */
export function huecoBlocker(
  p: { readonly nombre: string; readonly hueco: HuecoDePieza },
  hueco: Hueco,
): string | null {
  return huecosDeLaPieza(p.hueco).includes(hueco)
    ? null
    : `${p.nombre} va en ${NOMBRE_DE_HUECO[p.hueco]}, no en ${NOMBRE_DE_HUECO[hueco]}`;
}

/**
 * Si el texto `x` nombra un hueco: la pregunta de las puertas por las que un
 * hueco llega como texto (la sesión, `equipoBlocker`, la página de la arena).
 */
export function esHueco(x: string): x is Hueco {
  return (HUECOS as readonly string[]).includes(x);
}

/**
 * Los huecos de un arma por uso: los de un golpe que no es el de cuerpo a cuerpo
 * (hoy, solo `distancia`). Son huecos y usos a la vez (`UsoDeArma`).
 */
export type HuecoDeArmaPorUso = Exclude<UsoDeArma, 'arma'> & Hueco;

/**
 * Si `h` es el hueco de un arma por uso, la de un golpe que no es el de cuerpo a
 * cuerpo (`distancia`). **La única pregunta**: su ataque y su fuerza no suman
 * arriba, que son los de su golpe (`conEquipo`).
 */
export function esArmaPorUso(h: Hueco): h is HuecoDeArmaPorUso {
  return h === 'distancia';
}

/** Los huecos de un arma de cuerpo a cuerpo: el golpe toma lo mejor de las dos (`conEquipo`). */
export const HUECOS_DE_CUERPO_A_CUERPO = ['arma', 'segunda'] as const satisfies readonly Hueco[];

/**
 * Las cifras de una pieza, por su nombre en `Pieza`, en el orden en que se dicen.
 * **Ninguna da PV** (18-10-2026: la armadura protege restando de cada golpe,
 * `trasLaArmadura`): `pv` no es una cifra de pieza. **Ninguna resta movimiento**
 * (25-10-2026): todo pesa (`peso`), y el peso que pasa de la fuerza resta agilidad
 * (`restaDelPeso`, `core/cuerpo.ts`). Un arma suma `fuerza` al daño en vez de una
 * horquilla.
 */
export const CIFRAS_DE_PIEZA = ['ataque', 'fuerza', 'defensa', 'armadura', 'peso'] as const;
export type CifraDePieza = (typeof CIFRAS_DE_PIEZA)[number];

/**
 * Las cifras con rótulo en la ficha: las de una pieza, las del cuerpo que no da
 * ninguna pieza (la vida y la agilidad) y las que se derivan (el daño y las casillas).
 */
export type CifraDeLaFicha = CifraDePieza | 'pv' | 'agilidad' | 'danio' | 'casillas';

/**
 * El nombre de cada cifra, el mismo en la tabla de la ficha de la arena (sus
 * rótulos), en lo que suma una pieza («+2 Ataque» en la pieza y «Ataque» en la
 * fila a la que suma; 13-10-2026, el usuario: «estandariza la forma de mostrar
 * los modificadores del equipo, que no sea un texto libre») y en lo que un hueco
 * no admite (`problemasDePieza`).
 */
export const NOMBRE_DE_CIFRA: Readonly<Record<CifraDeLaFicha, string>> = {
  ataque: 'Ataque',
  fuerza: 'Fuerza',
  agilidad: 'Agilidad',
  defensa: 'Defensa',
  armadura: 'Armadura',
  peso: 'Peso',
  danio: 'Daño',
  pv: 'PV',
  casillas: 'Casillas',
};

/** Qué admite una pieza en su hueco (`camposDelHueco`). */
export interface CamposDelHueco {
  readonly conManos: boolean;
  readonly conRueda: boolean;
  readonly cifras: readonly CifraDePieza[];
}

/**
 * Qué admite una pieza en cada hueco (decisión del usuario, 18-10-2026:
 * «diferencia por tipo»): las manos y la rueda, solo el arma de cuerpo a cuerpo (la
 * regla del escudo mira esa; desde el 25-10-2026 la lanza es una de ellas,
 * `Pieza.lanza`); y sus cifras: las armas, ataque, fuerza y peso; la armadura,
 * armadura y peso; el escudo, defensa y peso (25-10-2026: la armadura ya no da
 * defensa, y nada resta movimiento). **La regla, en un sitio**: la leen la regla de
 * una pieza (`problemasDePieza`), el cambio de hueco de una pieza (`enElHueco`) y
 * su editor. Los disparos se fueron con la munición (13-10-2026): dispara quien
 * lleva algo en `distancia`.
 */
export function camposDelHueco(h: HuecoDePieza): CamposDelHueco {
  return CAMPOS_DEL_HUECO[h];
}

const DE_ARMA: readonly CifraDePieza[] = ['ataque', 'fuerza', 'peso'];
const CAMPOS_DEL_HUECO: Readonly<Record<HuecoDePieza, CamposDelHueco>> = {
  arma: { conManos: true, conRueda: true, cifras: DE_ARMA },
  distancia: { conManos: false, conRueda: false, cifras: DE_ARMA },
  armadura: { conManos: false, conRueda: false, cifras: ['armadura', 'peso'] },
  escudo: { conManos: false, conRueda: false, cifras: ['defensa', 'peso'] },
};

/**
 * Por qué `x` no es un hueco, dicho con los que valen en `lista`: los de dentro
 * (`HUECOS`) o los del contrato del agente (`SLOTS`, en inglés). Una sola frase
 * para las tres puertas: `equipoBlocker`, `huecoDelSlot` y la sesión.
 */
export function huecoDesconocido(x: string, lista: readonly string[]): string {
  return `no hay ningún hueco "${x}": son ${lista.join(', ')}`;
}

/**
 * Lo que lleva puesto alguien: el id de una pieza de `data/equipo.json` por
 * hueco, o nada en ese hueco. Inmutable: equipar escribe un objeto nuevo, y por
 * eso las cifras de un veterano se pueden recordar por su hoja.
 */
export type Equipo = Readonly<Partial<Record<Hueco, string>>>;

/**
 * La entrada del motor de batalla: un tipo y cuántos. El motor sigue sabiendo
 * jugar stacks de N —sus tests lo ejercen—, pero desde la tropa de individuos
 * la partida solo le manda `count: 1` (`troopsAsStacks`). Un personaje va
 * siempre con `count: 1`: `createBattle` lanza si no.
 */
export interface Stack extends Troop {
  readonly count: number;
}

/**
 * El ejército de un héroe o la guarnición de un castillo: una lista DENSA de
 * individuos, sin huecos y sin tope de slots. El tope es el liderazgo
 * (`hero/troop.ts`), y el orden importa: es el de despliegue y el que desempata
 * la iniciativa.
 */
export type Army = readonly Troop[];

// ---------------------------------------------------------------- jugadores

export type PlayerId = number;

/**
 * Quién toma las decisiones de este jugador: la persona (`human`, la sesión del
 * cliente), el agente por MCP (`agent`, el director) o la IA de reglas (`ai`). Lo
 * que no es la IA juega sus batallas por quien conduce la partida
 * (`ConduccionDelTurno.batallas`) y, si las acaba resolviendo la IA, ella pelea
 * por él sin rendirse (`sinLaIA`).
 */
export type Controller = 'human' | 'agent' | 'ai';

// ---------------------------------------------------------------- geometría

/** Casilla del mapa de aventura (cuadrícula). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Hex de la rejilla de batalla, en coordenadas offset odd-r. */
export interface Hex {
  readonly col: number;
  readonly row: number;
}
