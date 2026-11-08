/**
 * Abre la partida que pide la URL (R7 de la reorganización, 07-11-2026: era el arranque de
 * `main.ts`): la semilla, la facción, el héroe, la complejidad del combate y el clima, o un
 * mundo (`?mundo=`), leídos enteros antes de decir nada; y si no se puede, dice por qué en la
 * barra y lo lanza (`sinArrancar`), y lo pinta entero la página que no arranca
 * (`comun/arranque.ts`). Se abre una vez, al cargarse la página: «Partida nueva» recarga.
 */
import { combateCon, type ReglasDelCombate } from '@core/combate.js';
import { problemaDeTipo } from '@core/hero/ascenso.js';
import type { MundoLeido } from '@core/mundo/formato.js';
import { parseSeed } from '@core/rng.js';
import { faccionesDeLaSemilla } from '@core/state/setup.js';
import { type FactionId, parseFaccion } from '@core/types.js';
import { unaVezEnLaURL } from '@core/validar.js';
import { mensajeDe } from '../../shared/errores.js';
import { leerElClimaDeLaURL } from '../comun/clima-de-la-url.js';
import { aLaBarra, semillaSorteada } from '../comun/semilla.js';
import { ponerTema } from '../comun/temas.js';
import { genteCargada } from '../render/figuras/gente.js';
import { Session } from '../sesion/partida.js';
import { combateALaURL, combateDeLaURL, type ParametroDelCombate } from './combate-en-la-url.js';
import { mundoPedido } from './mundo.js';
import type { ElementosDeLaPartida } from './pagina.js';

/**
 * Lo que pide de la página abrir la partida: dónde decir con qué partida se juega (`elSeed`) o
 * por qué no arranca (`elStatus`), y cómo se pide un fotograma, que es lo que hace la sesión con
 * lo que cambia sin un gesto (`alCambiarSinGesto`).
 */
type LoQueAbreLaPartida = Pick<ElementosDeLaPartida, 'elStatus' | 'elSeed'> & {
  readonly pedirFotograma: () => void;
};

/**
 * La semilla que pide la URL, o `null` si no pide ninguna. Lanza si pide una
 * que no lo es, o si la pide dos veces: la regla entera —incluido que `?seed=`
 * vacío es no pedir— la escribe el núcleo (`parseSeed`, `unaVezEnLaURL`), aquí
 * solo se lee la barra de direcciones.
 */
function semillaDeLaUrl(): number | null {
  return parseSeed(unaVezEnLaURL(new URLSearchParams(location.search).getAll('seed'), 'seed'));
}

/**
 * La facción que pide la URL (`?faccion=`, la que escribe el menú de inicio), o
 * `null` si no pide ninguna. Como la semilla: vacío es no pedir, lo que no sea
 * una facción lanza nombrando las cinco (`parseFaccion`) y repetido también.
 */
function faccionDeLaUrl(): FactionId | null {
  return parseFaccion(
    unaVezEnLaURL(new URLSearchParams(location.search).getAll('faccion'), 'faccion'),
  );
}

/**
 * El tipo de héroe que pide la URL (`?heroe=`, el que escribe el menú), o `null`
 * si no pide ninguno. Como la facción: vacío es no pedir, y uno que no es de
 * `faccion` —la que se jugará— lanza diciendo cuáles valen, con la regla del
 * núcleo (`problemaDeTipo`, la misma que aplica `newGame`).
 */
function heroeDeLaUrl(faccion: FactionId): string | null {
  const tipo = unaVezEnLaURL(new URLSearchParams(location.search).getAll('heroe'), 'heroe');
  if (tipo === null || tipo.trim() === '') return null;
  const problema = problemaDeTipo(faccion, tipo);
  if (problema !== null) throw new Error(problema);
  return tipo;
}

/** Lo que la URL puede pedir de una partida. */
type Pedido = 'seed' | 'faccion' | 'heroe' | 'clima' | ParametroDelCombate;

/**
 * Cómo salir de una URL que no abre partida: quitar lo que pidió. Sin la semilla
 * se juega otra al azar; sin nada, vuelve el menú de inicio.
 */
function salidaDe(pedidos: readonly Pedido[]): string | null {
  if (pedidos.length === 0) return null;
  return `quita ${pedidos.map((p) => `"?${p}=…"`).join(' y ')} de la barra de direcciones`;
}

/**
 * Abre la partida y deja dicho, en la URL y en la barra, con qué semilla, con qué
 * facción, con qué héroe y con qué complejidad juega: se escriben siempre, también
 * si los sacó la semilla (la partida rápida, 7 / 7), para que la URL la
 * reproduzca entera. «Solo la rueda del héroe», solo si se marcó. Sin `heroe`
 * (`null`), el héroe de salida está por elegir en la base (22-10-2026) y `?heroe=`
 * no se escribe hasta que se elige (el clic de `hire-hero`): una recarga a media
 * elección vuelve a preguntar.
 */
function abrePartida(
  pagina: LoQueAbreLaPartida,
  seed: number,
  faccion: FactionId | null,
  heroe: string | null,
  combate: ReglasDelCombate,
  soloHeroe: boolean,
): Session {
  const abierta = new Session(
    seed,
    faccion ?? undefined,
    heroe,
    combate,
    soloHeroe,
    undefined,
    genteCargada(),
  );
  aLaBarra((url) => {
    url.searchParams.set('seed', String(seed));
    url.searchParams.set('faccion', abierta.jugador.faction);
    if (heroe !== null) url.searchParams.set('heroe', heroe);
    combateALaURL(url, abierta.state.combate, abierta.soloRuedaDelHeroe);
  });
  return prepararLaPartida(pagina, abierta, `semilla ${abierta.state.seed}`);
}

/** Lo que toda partida abierta deja hecho: su rótulo en la barra y su tema. */
function prepararLaPartida(pagina: LoQueAbreLaPartida, abierta: Session, rotulo: string): Session {
  const { elSeed, pedirFotograma } = pagina;
  // Una defensa (#116) se abre a media jugada del rival, sin gesto que pinte.
  abierta.alCambiarSinGesto = pedirFotograma;
  // El héroe anda su marcha por el mapa, y lo que abre la llegada espera a que llegue.
  abierta.enseñarLaMarcha = true;
  elSeed.textContent = rotulo;
  // La interfaz, con el tema de la facción de quien juega (`temas.ts`).
  ponerTema(abierta.jugador.faction);
  return abierta;
}

/**
 * Abre la partida de un mundo (`?mundo=`, ya cargado y validado por
 * `partida/mundo.ts`): su semilla, su facción y su héroe son los suyos. La URL ya
 * es la que la repite: `?mundo=` solo, que `mundoDeLaUrl` no deja ir con nada de
 * eso, más la complejidad del combate, que es de quien juega y no del mundo.
 */
function abrePartidaDelMundo(
  pagina: LoQueAbreLaPartida,
  mundo: MundoLeido,
  combate: ReglasDelCombate,
  soloHeroe: boolean,
): Session {
  const abierta = new Session(
    mundo.mundo.semilla,
    undefined,
    undefined,
    combate,
    soloHeroe,
    mundo,
    genteCargada(),
  );
  aLaBarra((url) => combateALaURL(url, abierta.state.combate, abierta.soloRuedaDelHeroe));
  return prepararLaPartida(
    pagina,
    abierta,
    `mundo «${mundo.historia.titulo}» · semilla ${abierta.state.seed}`,
  );
}

/** Por qué no arranca la partida y, si es por la URL, cómo salir: quitar lo que pidió. */
interface Fallo {
  readonly motivo: unknown;
  readonly salida: string | null;
}

/**
 * Sin sesión no arranca el bucle y la página se queda en blanco: los motivos se
 * escriben para la persona, cada uno con su salida, y se relanza igual: un fallo
 * no se tapa con una barra bonita. Con dos (`?seed=abc&faccion=xyz`) se dicen
 * los dos: diciendo solo el primero, arreglarlo destapaba el segundo en otra
 * recarga (H4 de QA del tema por ejército, en su rama).
 */
function sinArrancar(pagina: LoQueAbreLaPartida, fallos: readonly Fallo[]): never {
  const { elStatus } = pagina;
  const texto = fallos
    .map(({ motivo, salida }) => {
      const m = mensajeDe(motivo);
      return salida === null ? m : `${m} — ${salida}`;
    })
    .join('. ');
  elStatus.textContent = texto;
  // Sin partida no hay lienzo que se mueva: la barra suelta sus dos líneas y se
  // lee entera también en el móvil.
  elStatus.dataset.sinArrancar = 'si';
  // Con la salida en el mensaje: lo que se lanza lo pinta entero la página que
  // no arranca (`arranque.ts`), encima de la barra.
  throw new Error(texto, {
    cause: fallos.length === 1 ? fallos[0]?.motivo : fallos.map((f) => f.motivo),
  });
}

/**
 * La partida que pide la URL, abierta; si no se puede, lanza diciendo por qué
 * (`sinArrancar`). La abre `main.ts` una vez, al cargarse la página.
 */
export function abrirLaPartida(pagina: LoQueAbreLaPartida): Session {
  // Lo que pide la URL, leído entero antes de decir nada: cada parámetro que no
  // vale, con su salida, y todos a la vez.
  const fallos: Fallo[] = [];
  const leer = <T>(nombre: Pedido, leerlo: () => T | null): T | null => {
    try {
      return leerlo();
    } catch (motivo) {
      fallos.push({ motivo, salida: salidaDe([nombre]) });
      return null;
    }
  };
  // Un mundo trae su semilla, su facción y su héroe (`mundoDeLaUrl` no los deja
  // ir con él); de la URL, solo la complejidad del combate y el clima.
  const mundo = mundoPedido();
  const semilla = mundo === null ? leer('seed', semillaDeLaUrl) : null;
  const faccion = mundo === null ? leer('faccion', faccionDeLaUrl) : null;
  const { tope, rueda, soloHeroe } = combateDeLaURL(location.search, (parametro, motivo) =>
    fallos.push({ motivo, salida: salidaDe([parametro]) }),
  );
  const clima = leer('clima', () => leerElClimaDeLaURL(new URLSearchParams(location.search)));
  const delCombate = [
    ...(tope === null ? [] : (['tropa'] as const)),
    ...(rueda === null ? [] : (['rueda'] as const)),
  ];
  let abierta: Session;
  if (mundo !== null) {
    if (fallos.length > 0) sinArrancar(pagina, fallos);
    try {
      abierta = abrePartidaDelMundo(pagina, mundo, combateCon(tope, rueda), soloHeroe);
    } catch (motivo) {
      sinArrancar(pagina, [{ motivo, salida: salidaDe(delCombate) }]);
    }
  } else {
    const seed = semilla ?? semillaSorteada();
    // El héroe se juzga contra la facción que se jugará: la pedida o la que saque
    // la semilla, que la dice la misma función que usa `newGame`. Así el motivo
    // nombra solo `?heroe=` como salida. Con la semilla o la facción rotas no se
    // juzga: sería contra otra.
    const heroe =
      fallos.length > 0
        ? null
        : leer('heroe', () => heroeDeLaUrl(faccionesDeLaSemilla(seed, faccion ?? undefined)[0]));
    if (fallos.length > 0) sinArrancar(pagina, fallos);
    try {
      abierta = abrePartida(pagina, seed, faccion, heroe, combateCon(tope, rueda), soloHeroe);
    } catch (motivo) {
      // Lo que no abre partida es lo que pidió la URL, y la salida es quitar eso.
      // Sin nada pedido no hay salida que dar.
      const pedidos = [
        ...(semilla === null ? [] : (['seed'] as const)),
        ...(faccion === null ? [] : (['faccion'] as const)),
        ...(heroe === null ? [] : (['heroe'] as const)),
        ...delCombate,
      ];
      sinArrancar(pagina, [{ motivo, salida: salidaDe(pedidos) }]);
    }
  }
  // Una región de `?clima=` que este mapa no tiene lanza aquí, diciendo cuáles
  // hay, y la salida es quitar solo `?clima=`: la semilla está bien, y quitarla
  // cambiaría la partida (H6 del QA del clima, 22-10-2026).
  leer('clima', () => {
    abierta.fijarElClima(clima);
    return null;
  });
  if (fallos.length > 0) sinArrancar(pagina, fallos);
  return abierta;
}
