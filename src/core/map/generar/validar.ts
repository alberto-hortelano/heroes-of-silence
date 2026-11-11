/**
 * La puerta de los planes de mapa (`validateMapPlan`): que un plan dé una
 * partida jugable, venga del agente o del procedimental, que pasan los dos por
 * aquí. El tamaño, los muros (rectos y de barrera), los suelos y los niveles,
 * los objetos en su sitio, la red de nodos (`problemasDeRed`), el recinto de
 * cada ciudad y lo que no va en su entrada (`problemasDeRecintos`,
 * `parteDeLaEntrada`), dónde va cada ciudad y cada pueblo
 * (`puebloDelMuroBlocker`, la regla que lee también el poblamiento) y los
 * asaltantes; y los jugadores de un plan con su base (`basesDelPlan`). Para
 * mirar la red construye el mapa (`buildMap`, `construir.ts`).
 *
 * Por tandas, y cada una corta: lo que no necesita el mapa, lo que no necesita
 * la red (el pueblo del muro y la entrada de cada ciudad, `problemasDeLaEntrada`),
 * la red, y lo que la lee. Lo que se mira antes de la red es la causa de lo que
 * la red diría después, y el motivo nombra la causa (#340, 11-11-2026).
 *
 * Era la sección de la validación de `map/generate.ts` hasta la fase N de la
 * reorganización (07-11-2026).
 */
import { problemasDeAsaltante } from '../../hero/grupos.js';
import { primeraCiudadDe } from '../../town/town.js';
import type { PlayerId, Point } from '../../types.js';
import { problemasDeGrupo } from '../../unidad/catalogo.js';
import { chebyshev, inBounds, pointKey } from '../geometria.js';
import { BARRERAS_DEL_PUEBLO } from '../map.js';
import { problemasDeNiveles } from '../niveles.js';
import {
  enAlgunRecinto,
  HASTA_LOS_ACCESOS,
  parteDeLaEntrada,
  problemasDeLaEntrada,
  problemasDeRecintos,
} from '../recinto.js';
import { estructura, problemasDeRed, regionDeCasilla, tocaUnNodo } from '../regiones.js';
import {
  BARRERAS,
  esBarrera,
  esNivel,
  isWalkable,
  QUE_ES_UN_NIVEL,
  SUELOS_PISABLES,
  type TerrainKind,
} from '../terrain.js';
import { dondeEsta, regionesDelSitio, territorio } from '../territorio.js';
import type { GameMap } from '../tipos.js';
import { buildMap, idDeNodo, idDePueblo, terrenoPintado } from './construir.js';
import {
  LADO_MAXIMO_DEL_PLAN,
  LADO_MINIMO_DEL_PLAN,
  type MapPlan,
  type PlannedTown,
} from './plan.js';

/**
 * Los jugadores de un plan y la base de cada uno: los dueños de ciudad, por id,
 * con la primera ciudad suya (`primeraCiudadDe`). El héroe de cada jugador nace
 * dentro de ella, así que el plan no escribe ni jugadores ni inicios: los leen de
 * aquí la validación, la partida (`newGame`) y el servidor, que los compara con
 * los que pidió.
 *
 * Por id y no en el orden en que el plan escribe sus ciudades: de este orden
 * salen `state.players` y quién abre el día 1, y diseñar el mapa no puede ser
 * también repartirse el turno.
 */
export function basesDelPlan(plan: Pick<MapPlan, 'towns'>): ReadonlyMap<PlayerId, PlannedTown> {
  const dueños = [...new Set(plan.towns.flatMap((t) => (t.owner === null ? [] : [t.owner])))];
  const bases = new Map<PlayerId, PlannedTown>();
  for (const p of dueños.sort((a, b) => a - b)) {
    const base = primeraCiudadDe(plan.towns, p);
    if (base !== undefined) bases.set(p, base);
  }
  return bases;
}

/**
 * Comprueba que el plan da una partida jugable. Devuelve la lista de problemas;
 * vacía = plan válido. Se aplica igual al plan del agente que al procedural:
 * un mapa con un castillo inalcanzable rompe la partida venga de donde venga.
 */
export function validateMapPlan(plan: MapPlan): string[] {
  const problemas: string[] = [];

  if (plan.width < LADO_MINIMO_DEL_PLAN || plan.height < LADO_MINIMO_DEL_PLAN)
    problemas.push(
      `el mapa es demasiado pequeño (mínimo ${LADO_MINIMO_DEL_PLAN}×${LADO_MINIMO_DEL_PLAN})`,
    );
  if (plan.width > LADO_MAXIMO_DEL_PLAN || plan.height > LADO_MAXIMO_DEL_PLAN)
    problemas.push(
      `el mapa es demasiado grande (máximo ${LADO_MAXIMO_DEL_PLAN}×${LADO_MAXIMO_DEL_PLAN})`,
    );

  // Los muros, antes que nada: `buildMap` los pinta y un tramo fuera del mapa o
  // torcido no se puede pintar. Torcido se rechaza en vez de enderezarse: un
  // muro en diagonal deja huecos de esquina (`PlannedWall`).
  for (const m of plan.walls) {
    const tramo = `el muro de (${m.from.x},${m.from.y}) a (${m.to.x},${m.to.y})`;
    if (!inBounds(plan, m.from) || !inBounds(plan, m.to))
      problemas.push(`${tramo} se sale del mapa`);
    if (m.from.x !== m.to.x && m.from.y !== m.to.y) {
      problemas.push(
        `${tramo} no es recto: un tramo de muro va en una fila o en una columna, y uno en diagonal deja huecos por las esquinas`,
      );
    }
    if (!esBarrera(m.terrain)) {
      problemas.push(`${tramo} es de "${m.terrain}": un muro es ${BARRERAS.join(', ')}`);
    }
  }

  // El suelo de una región se pisa: una barrera ahí no la «pinta», la borraría,
  // y eso es un muro, que va en `walls`.
  for (const r of plan.regions) {
    if (r.terrain === undefined) continue;
    // Contra la lista y no con `isWalkable`, que dice que sí a lo que no es
    // barrera: un `"ice"` inventado pasaba y `buildMap` pintaba un terreno que
    // nadie sabe leer (QA de «mapas densos», vuelta 2, N3).
    if (esBarrera(r.terrain)) {
      problemas.push(
        `la región "${r.id}" pide de suelo "${r.terrain}", que no se pisa: el suelo de una región es uno de ${SUELOS_PISABLES.join(', ')}, y las barreras van en "walls"`,
      );
    } else if (!(SUELOS_PISABLES as readonly string[]).includes(r.terrain)) {
      problemas.push(
        `la región "${r.id}" pide de suelo "${r.terrain}", que no es ningún terreno: el suelo de una región es uno de ${SUELOS_PISABLES.join(', ')}`,
      );
    }
  }

  // El nivel, contra la lista: el esquema del agente ya lo acota, pero esta es
  // la puerta de los dos productores y un número suelto no se pinta.
  for (const r of plan.regions) {
    if (r.nivel !== undefined && !esNivel(r.nivel))
      problemas.push(`la región "${r.id}" pide el nivel ${String(r.nivel)}: ${QUE_ES_UN_NIVEL}`);
  }

  const ocupadas = new Map<string, string>();
  const ocupar = (p: Point, quien: string): void => {
    const k = pointKey(p);
    if (!inBounds(plan, p)) {
      problemas.push(`${quien} está fuera del mapa en (${p.x},${p.y})`);
      return;
    }
    const previo = ocupadas.get(k);
    if (previo !== undefined) {
      problemas.push(`(${p.x},${p.y}) la ocupan dos cosas: ${previo} y ${quien}`);
      return;
    }
    ocupadas.set(k, quien);
  };

  for (const t of plan.towns) ocupar(t.at, `la ciudad "${t.id}"`);
  for (const n of plan.nodes) ocupar(n, 'un nodo');
  for (const v of plan.villages) ocupar(v.at, `el pueblo "${v.name}"`);
  for (const m of plan.monsters) ocupar(m.at, `monstruo ${m.creature}`);
  for (const c of plan.chests) ocupar(c.at, 'cofre');
  for (const r of plan.raiders ?? [])
    ocupar(r.at, `el grupo de asaltantes de (${r.at.x},${r.at.y})`);

  if (plan.towns.length < 2) problemas.push('hacen falta al menos dos ciudades');
  const jugadores = basesDelPlan(plan).size;
  if (jugadores < 2) {
    problemas.push(
      `hacen falta al menos dos jugadores con ciudad (hay ${jugadores}): cada jugador empieza en su base`,
    );
  }

  // Un id repetido no choca con nada al construir: `buildMap` crea dos `Town` y
  // dos objetos con el mismo id, y a partir de ahí todo lo que busca por id
  // encuentra el primero. Y los ids de ciudad comparten espacio con los que
  // `buildMap` pone a nodos y pueblos: `player.memory` va por id de objeto, así
  // que una ciudad llamada "node-0" taparía el recuerdo de ese nodo.
  const reservados = new Set([
    ...plan.nodes.map((_, i) => idDeNodo(i)),
    ...plan.villages.map((_, i) => idDePueblo(i)),
  ]);
  const vistos = new Set<string>();
  for (const t of plan.towns) {
    if (vistos.has(t.id))
      problemas.push(`hay dos ciudades con el id "${t.id}": tienen que ser únicos`);
    if (reservados.has(t.id)) {
      problemas.push(
        `la ciudad "${t.id}" lleva un id que el motor reserva para los nodos y los pueblos ("node-N", "village-N"): ponle otro`,
      );
    }
    vistos.add(t.id);
  }

  // La unidad de un monstruo es el ÚNICO texto del plan que el motor ejecuta
  // en vez de leer: `buildMap` la copia verbatim y el primer turno de la IA
  // llama a `unidadDelJuego(id)`, que lanza. La comprobación vive aquí y no en el
  // esquema porque esta es la puerta de los DOS productores de planes, y un
  // `z.enum` dejaría al generador de casa sin vigilar justo en este campo. Y
  // un monstruo son `count` individuos que no pasan de un bando: `createBattle`
  // lanzaría al pisarlo, con la partida ya en marcha.
  for (const m of plan.monsters) {
    problemas.push(...problemasDeGrupo([m], `el monstruo de (${m.at.x},${m.at.y})`));
  }
  // Un grupo de asaltantes, además, no pasa del techo de `data/asaltantes.json`:
  // más fuerte que eso es un muro, y el agente no puede diseñar uno.
  for (const r of plan.raiders ?? []) {
    problemas.push(
      ...problemasDeAsaltante(r.troops, `el grupo de asaltantes de (${r.at.x},${r.at.y})`),
    );
  }

  // Un nodo va en un muro y cruza su barrera, que `buildMap` guarda al abrir
  // la casilla (#145). Sin muro debajo no hay barrera que cruzar: antes se
  // aceptaba y el escenógrafo se la inventaba con lo de alrededor. Con un
  // tamaño fuera de rango ya hay problema y no se pinta un mapa que no vale.
  const enRango = (lado: number): boolean =>
    lado >= LADO_MINIMO_DEL_PLAN && lado <= LADO_MAXIMO_DEL_PLAN;
  const conTamaño = enRango(plan.width) && enRango(plan.height);
  const pintado = conTamaño ? terrenoPintado(plan) : [];
  for (const n of conTamaño ? plan.nodes : []) {
    if (!inBounds(plan, n)) continue;
    const t = pintado[n.y * plan.width + n.x] as TerrainKind;
    if (!esBarrera(t)) {
      problemas.push(
        `el nodo de (${n.x},${n.y}) no está sobre ningún muro (debajo hay ${t}): un nodo va en un muro, abre su casilla y cruza la barrera de ese muro`,
      );
    }
  }

  if (problemas.length > 0) return problemas;

  // Un camino fuera del mapa no se puede construir (`RedDeCaminos` lanza), y
  // el agente recibe todas las clases de problema de una vez (N4): con alguno
  // fuera, lo demás se mira en el mapa sin caminos, que tiene el mismo terreno.
  const caminosFuera = casillasDelPlan(plan).filter((p) => !inBounds(plan, p));
  const { roads: _roads, tramos: _tramos, ...sinCaminos } = plan;
  const { map } = buildMap(caminosFuera.length === 0 ? plan : sinCaminos);

  // Nada se queda sobre un muro y nada que no sea nodo se pone en un nodo.
  // Antes `buildMap` **saneaba en silencio** el terreno bajo un objeto —lo
  // convertía en tierra—, y con muros eso es abrir un agujero en la red sin que
  // nadie lo pida. Ahora se dice, y la única casilla que el muro cede es la de
  // un nodo, una ciudad o un pueblo, que es una regla declarada (`buildMap`); el
  // pueblo que la abre tiene que ser un nodo, y eso lo juzga
  // `problemasDeLosPueblos` con la red leída.
  const sobreRegion = (p: Point, quien: string): void => {
    const terreno = map.terrain[p.y * map.width + p.x] as TerrainKind;
    if (!isWalkable(terreno)) {
      problemas.push(
        `${quien} en (${p.x},${p.y}) cae sobre ${terreno}: tiene que estar dentro de una región`,
      );
    }
  };
  for (const m of plan.monsters) sobreRegion(m.at, `el monstruo ${m.creature}`);
  for (const c of plan.chests) sobreRegion(c.at, 'el cofre');
  for (const r of plan.raiders ?? []) sobreRegion(r.at, 'el grupo de asaltantes');
  // Un camino tampoco: `map.ts` no lo abre —la barrera sigue sin pisarse—, pero
  // el cliente lo pinta encima, y una carretera sobre un acantilado le dice a
  // quien mira, y al agente, que por ahí se pasa. Se aceptaba en silencio (QA de
  // «mapas densos», H4). Y uno fuera del mapa se tiraba sin decirlo.
  // Agrupados: un plan con 500 caminos fuera del mapa devolvía 500 frases, y el
  // agente las recibe todas en su rechazo (QA de «mapas densos», vuelta 2, N4).
  // Salvo en el recinto de una ciudad: su puerta se pisa aunque debajo haya
  // barrera, y lo que un camino haga ahí lo juzga `problemasDeRecintos`.
  const ciudades = plan.towns.map((t) => t.at);
  const caminosSobreBarrera: { p: Point; terreno: TerrainKind }[] = [];
  for (const p of casillasDelPlan(plan)) {
    if (!inBounds(plan, p) || enAlgunRecinto(ciudades, p)) continue;
    const terreno = map.terrain[p.y * map.width + p.x] as TerrainKind;
    if (!isWalkable(terreno)) caminosSobreBarrera.push({ p, terreno });
  }
  const [unoSobre] = caminosSobreBarrera;
  if (caminosSobreBarrera.length === 1 && unoSobre !== undefined) {
    problemas.push(
      `el camino de (${unoSobre.p.x},${unoSobre.p.y}) cae sobre ${unoSobre.terreno}: un camino solo va por casillas que se pisan`,
    );
  } else if (caminosSobreBarrera.length > 1) {
    problemas.push(
      `${caminosSobreBarrera.length} casillas de camino caen sobre una barrera —${enumerarCasillas(caminosSobreBarrera.map(({ p, terreno }) => `(${p.x},${p.y}) sobre ${terreno}`))}—: un camino solo va por casillas que se pisan`,
    );
  }
  const [unoFuera] = caminosFuera;
  if (caminosFuera.length === 1 && unoFuera !== undefined) {
    problemas.push(`el camino de (${unoFuera.x},${unoFuera.y}) se sale del mapa`);
  } else if (caminosFuera.length > 1) {
    problemas.push(
      `${caminosFuera.length} casillas de camino se salen del mapa: ${enumerarCasillas(caminosFuera.map((p) => `(${p.x},${p.y})`))}`,
    );
  }
  if (problemas.length > 0) return problemas;

  // La causa antes que el síntoma (#340, 11-11-2026): lo que cae donde no va
  // —un pueblo del muro mal puesto, lo que pisa el recinto o la entrada de una
  // ciudad— estropea la red, y la red cantaba lo que estropeaba: con un pueblo
  // en la entrada de Valdeluz, «la ciudad "town-0" es la base… y está dentro
  // de la región» o «el pueblo parte su región», y el agente movía la base.
  // Ninguna de las dos lee la red, así que se miran antes que ella; el pueblo
  // del muro primero, que dice de él lo mismo que dirían los accesos.
  problemas.push(...pueblosDelMuroMalPuestos(map, plan.towns));
  if (problemas.length > 0) return problemas;
  problemas.push(
    ...problemasDeLaEntrada(
      map,
      plan.towns,
      (plan.raiders ?? []).map((r) => ({ quien: 'el grupo de asaltantes', at: r.at })),
    ),
  );
  if (problemas.length > 0) return problemas;

  // La red, y con ella la conectividad. Aquí había un `findPath` de cada inicio
  // a cada ciudad, y con el mapa de nodos sobra: cada héroe nace en una
  // ciudad, cada ciudad toca dos regiones y todas se alcanzan unas desde
  // otras por nodos que no bloquean, así que no queda ciudad a la que no se
  // llegue. Un guardia que ya no puede morder no se deja de adorno.
  problemas.push(...problemasDeRed(map));
  if (problemas.length > 0) return problemas;

  // Dónde va cada ciudad, con la red ya leída: en el muro (un nodo) o dentro de
  // una región (ciudades y pueblos en su región, 05-11-2026). La de dentro es de
  // quien tenga su región, así que no nace con dueño; la base va en el muro,
  // porque se toma como un paso y perderla elimina.
  problemas.push(...problemasDeLasCiudades(plan, map));
  // Y cada pueblo: en el muro, entre dos regiones; dentro de una región, en lo
  // que se pisa (pueblos en un nodo, fase 3). Sobre qué barrera y lejos de toda
  // ciudad, `pueblosDelMuroMalPuestos`, arriba.
  problemas.push(...problemasDeLosPueblos(map));
  if (problemas.length > 0) return problemas;

  // El recinto de cada ciudad (`recinto.ts`), con la red ya leída: la orilla
  // de una ciudad-puente se lee de sus regiones. Lo que no la necesita (ni en el
  // borde, ni dos que se toquen, ni nada dentro ni en los accesos) ya se miró
  // arriba, y aquí da vacío: quedan las puertas, los caminos y las regiones. El
  // héroe nace en la casilla de su base, que es la del medio.
  problemas.push(
    ...problemasDeRecintos(
      map,
      estructura(map),
      plan.towns,
      (plan.raiders ?? []).map((r) => ({ quien: 'el grupo de asaltantes', at: r.at })),
    ),
  );
  if (problemas.length > 0) return problemas;

  // El relieve (#209): con la red ya leída, cada franja de barrera tiene que
  // admitir los niveles que separa. Solo si el plan declara alguno: uno sin
  // niveles —los de antes de #209— pone todo al llano, y ahí cualquier
  // acantilado sería un cañón; rechazarlo tiraría planes que jugaban, así que
  // se aceptan y su acantilado se pinta como una franja de roca sin cara. El
  // procedimental los declara todos y pasa siempre por aquí.
  if (plan.regions.some((r) => r.nivel !== undefined)) problemas.push(...problemasDeNiveles(map));
  if (problemas.length > 0) return problemas;

  // Los asaltantes, con la red ya leída: dónde puede vivir uno es una pregunta
  // de regiones. Las mismas reglas que cumplen los que brotan en partida
  // (`dondeBrotan`), para que el plan no pueda poner lo que la partida no.
  problemas.push(...problemasDeAsaltantes(plan, map));
  return problemas;
}

/**
 * Lo que impide que cada ciudad del plan vaya donde va, con la red ya leída: una
 * ciudad **dentro de una región** (toca una sola) es de quien tenga la región, así
 * que no nace con dueño; y **la base** de cada jugador va en el muro, entre dos
 * regiones o más, porque se toma como un paso y perderla elimina (decisiones del
 * usuario, 05-11-2026).
 */
function problemasDeLasCiudades(plan: MapPlan, map: GameMap): string[] {
  const red = estructura(map);
  const bases = new Set([...basesDelPlan(plan).values()].map((b) => b.id));
  const problemas: string[] = [];
  for (const t of plan.towns) {
    const region = red.sitiosDeRegion.get(t.id);
    if (region === undefined) continue;
    const nombre = map.regions[region]?.id;
    if (bases.has(t.id)) {
      problemas.push(
        `la ciudad "${t.id}" es la base del jugador ${t.owner} y está dentro de la región "${nombre}": la base va en el muro, entre dos regiones o más, y se toma como un paso`,
      );
    } else if (t.owner !== null) {
      problemas.push(
        `la ciudad "${t.id}" está dentro de la región "${nombre}" y lleva dueño (${t.owner}): una ciudad dentro de una región es de quien tenga la región; quítale el dueño o ponla en el muro`,
      );
    }
  }
  return problemas;
}

/**
 * Lo que impide que un pueblo **del muro** (`buildMap` abre su casilla y guarda
 * su `barrera`) vaya donde va, sin leer la red: sobre montaña, bosque o
 * acantilado (`BARRERAS_DEL_PUEBLO`), porque sobre agua el paso es un puente y
 * sobre la muralla, su puerta, y la escena no tiene dónde ponerlo; y donde dice
 * `puebloDelMuroBlocker`. Se mira antes que la red (#340): un pueblo mal puesto
 * la estropea, y lo que diría la red sería el síntoma.
 */
function pueblosDelMuroMalPuestos(
  map: GameMap,
  ciudades: readonly { readonly name: string; readonly at: Point }[],
): string[] {
  const problemas: string[] = [];
  for (const o of map.objects) {
    if (o.kind !== 'village' || o.barrera === null) continue;
    const quien = `el pueblo "${o.name}" de (${o.at.x},${o.at.y})`;
    const dondeNo = puebloDelMuroBlocker(o.at, map.width, map.height, ciudades);
    if (!BARRERAS_DEL_PUEBLO.includes(o.barrera)) {
      problemas.push(
        `${quien} está sobre ${o.barrera}: en el muro, un pueblo va sobre ${BARRERAS_DEL_PUEBLO.join(', ')}; sobre el agua el paso es un puente y sobre la muralla, su puerta`,
      );
    } else if (dondeNo !== null) {
      problemas.push(`${quien} ${dondeNo}`);
    }
  }
  return problemas;
}

/**
 * Lo que impide que cada pueblo vaya donde va, con la red ya leída (pueblos en un
 * nodo, fase 3, 05-11-2026). Uno **sobre el muro** tiene que ser un nodo —tocar
 * dos regiones o más—; sobre qué barrera y dónde no, lo dice antes
 * `pueblosDelMuroMalPuestos`. Uno **entre dos regiones sin muro debajo** (en un
 * hueco) tampoco vale: un nodo cruza una barrera, y sin ella no se sabe cuál,
 * igual que un paso sin muro.
 */
function problemasDeLosPueblos(map: GameMap): string[] {
  const red = estructura(map);
  const problemas: string[] = [];
  const nombreDe = (r: number): string => `"${map.regions[r]?.id}"`;
  for (const o of map.objects) {
    if (o.kind !== 'village') continue;
    const quien = `el pueblo "${o.name}" de (${o.at.x},${o.at.y})`;
    const donde = dondeEsta(red, o.id);
    const regiones = donde?.en === 'muro' ? regionesDelSitio(red, o.id) : [];
    const dentro = donde?.en === 'region' ? donde.region : undefined;
    if (o.barrera !== null && dentro !== undefined) {
      problemas.push(
        `${quien} está sobre el muro (${o.barrera}) y solo toca la región ${nombreDe(dentro)}: en el muro, un pueblo va entre dos regiones o más; para tenerlo dentro de la región, ponlo en una casilla que se pisa`,
      );
    } else if (o.barrera === null && regiones.length >= 2) {
      problemas.push(
        `${quien} toca las regiones ${regiones.map(nombreDe).join(' y ')} sin muro debajo: un pueblo entre dos regiones va sobre el muro (${BARRERAS_DEL_PUEBLO.join(', ')}), que abre su casilla y cruza su barrera, como un nodo`,
      );
    }
  }
  return problemas;
}

/**
 * Por qué un pueblo **del muro** no puede ir en `at`, o `null`: **la regla de
 * dónde va**, una vez, para el plan del agente (`pueblosDelMuroMalPuestos`) y para el
 * generador (`pueblosEnElMuro`), que antes tenía la suya y el plan ninguna
 * (vuelta 1 de QA de la tarea 2, H4):
 *
 * - ni en el borde del mapa: la pieza del pueblo va en el paso y se sale del marco
 *   (s4 (14,0), desviación 3 de la fase 3);
 * - ni en el recinto de una ciudad ni en un acceso de sus puertas
 *   (`parteDeLaEntrada`, la misma que lee `problemasDeRecintos` para el resto de
 *   lo que se siembra): el acceso es por donde su región entra
 *   en la ciudad, y un nodo ahí pasaría de nodo a nodo sin pisar región
 *   (desviación 6). El generador ya lo cumplía sin mirarlo —sus nodos van a más
 *   de dos casillas de toda ciudad—, así que preguntárselo no cambia ningún mapa.
 */
export function puebloDelMuroBlocker(
  at: Point,
  W: number,
  H: number,
  ciudades: readonly { readonly name?: string; readonly at: Point }[],
): string | null {
  if (at.x < 1 || at.y < 1 || at.x > W - 2 || at.y > H - 2)
    return 'está en el borde del mapa: un pueblo del muro lleva su pieza en el paso, que se saldría del marco; ponlo a una casilla del borde o más';
  const c = ciudades.find((c) => parteDeLaEntrada(c.at, at) !== null);
  if (c === undefined) return null;
  const cual = c.name === undefined ? '' : ` "${c.name}"`;
  return `está a ${chebyshev(c.at, at)} casillas de la ciudad${cual} de (${c.at.x},${c.at.y}), en su recinto o en un acceso de sus puertas: por ahí entra su región en la ciudad, y un nodo no puede ir ahí; ponlo a ${HASTA_LOS_ACCESOS + 1} casillas o más de toda ciudad, contando la diagonal como una`;
}

/** Las primeras casillas de una lista larga y cuántas quedan: la frase no crece con el plan. */
const CASILLAS_QUE_SE_NOMBRAN = 5;
function enumerarCasillas(casillas: readonly string[]): string {
  const nombradas = casillas.slice(0, CASILLAS_QUE_SE_NOMBRAN).join(', ');
  const resto = casillas.length - CASILLAS_QUE_SE_NOMBRAN;
  return resto > 0 ? `${nombradas} y ${resto} más` : nombradas;
}

/**
 * Lo que impide que los asaltantes de un plan vivan donde se les pone: dentro
 * de una región, sin tocar un nodo —taparía un paso—, en una región sin dueño
 * —se dispersaría antes de empezar—.
 *
 * Nada más cerca de las bases: el héroe nace dentro de la suya, que no es de
 * ninguna región, así que no hay emboscada antes del primer turno, y un grupo en
 * una región que toca una base es tan legal en el plan del agente como en el
 * procedimental («No, también en casa»). La región de casa no se puede pedir
 * aquí: no es un hecho del mapa, sino de cómo lo construye el procedimental.
 */
function problemasDeAsaltantes(plan: MapPlan, map: GameMap): string[] {
  const raiders = plan.raiders ?? [];
  if (raiders.length === 0) return [];
  const problemas: string[] = [];
  const t = territorio({ map, players: [] });
  for (const r of raiders) {
    const quien = `el grupo de asaltantes de (${r.at.x},${r.at.y})`;
    const region = regionDeCasilla(map, r.at);
    if (region < 0) {
      problemas.push(`${quien} no está dentro de ninguna región`);
      continue;
    }
    const nombre = map.regions[region]?.id;
    if (tocaUnNodo(map, r.at)) {
      problemas.push(
        `${quien} está pegado a un nodo o a una ciudad: taparía el paso; ponlo al menos a dos casillas de cualquier nodo`,
      );
    }
    if (t.dueñoDeRegion[region] !== null) {
      problemas.push(
        `${quien} está en la región "${nombre}", que ya tiene dueño: un asaltante solo vive en una región sin dueño`,
      );
    }
  }
  return problemas;
}

/**
 * Las casillas de camino de un plan, las escriba quien las escriba: las de
 * `roads` (el agente) o los extremos de `tramos` (el procedimental). Es lo que
 * valida `validateMapPlan`, con el mismo texto para los dos.
 */
function casillasDelPlan(plan: MapPlan): readonly Point[] {
  return plan.tramos !== undefined ? plan.tramos.flat() : (plan.roads ?? []);
}
