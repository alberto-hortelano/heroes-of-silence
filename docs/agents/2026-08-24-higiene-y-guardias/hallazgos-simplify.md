# Hallazgos de `/simplify` — consolidados y decididos

Cuatro revisores en paralelo —reutilización, simplificación, altitud y eficiencia—
sobre los parches de lógica (`01`, `02`, `05`, `06`, `07`, `08`, `09`). El
reformateo mecánico de 2 632 líneas quedó fuera a propósito: habría ahogado la
señal.

Cada hallazgo lleva **la decisión ya tomada**. Los descartados también, con su
motivo: un hallazgo descartado con motivo es información; descartado en silencio,
no.

---

## 1 · El guardia de rutas absolutas — REESCRIBIR

**Lo señalan los cuatro**, cada uno por un lado, y juntos dicen que está mirando
el sitio equivocado. En orden de gravedad:

- **Un caso ilegítimo pasa por debajo.** `git ls-files` lista solo lo indexado. Un
  fichero nuevo sin `git add` —que es como nacen las presas, y como está el repo
  justo cuando corre el hook `Stop`— no lo ve. Dos ficheros más allá,
  `.claude/hooks/verde.sh:31` ya usa `git ls-files -c -o --exclude-standard`.
- **Un caso legítimo lo pone rojo, y es este mismo ciclo.** `requisitos.md:249` y
  `critica.md:74` contienen `/home/al/code/heroes` **explicando el bug**, y los dos
  se commitean. Verificado: hoy está verde solo porque el punto anterior los tapa.
  En cuanto se arregle lo uno, salta lo otro.
- **Cuesta caro**: el fichero de invariantes entero pasó de 8 ms a 31 con él dentro.
  (El reparto por guardia que traía el revisor —16 ms contra 11— **no es
  reproducible**: vitest no da esa granularidad con un `it` por invariante. Lo
  medible es el fichero, y así queda dicho para que nadie cite la otra cifra.)
  Lee los 9,3 MB de PNG versionados enteros para descartarlos después, y
  vuelve a leer de disco los 40 `.ts` que el módulo ya tiene en `CACHE` — que es
  literalmente lo que el comentario de `invariantes.test.ts:55-57` presume de haber
  arreglado para los otros seis.
- Reimplementa el bucle de `infractores()` con otro formato de mensaje.

**Decisión: se reescribe acotando por lo que la frontera dice de verdad.** No es
«la cadena aparece en algún byte versionado», es **«un fichero que una máquina
ejecuta o lee lleva dentro la ruta de una sola máquina»**. Así que barre solo las
clases de fichero que se consumen —`.json`, `.jsonc`, `.yml`, `.yaml`, `.ts`,
`.sh`— sobre `git ls-files -c -o --exclude-standard`.

Eso arregla las cuatro cosas de una vez: ve lo no indexado, no mira prosa —sin
excepciones por carpeta, que es la excepción que mañana tapa a la siguiente—, y
no lee un solo PNG. Reutiliza `infractores()` si encaja sin retorcerlo.

**Y hay que volver a verlo morder**, con las trece presas y con un fichero nuevo
sin indexar, que es el caso que hoy se le escapa.

## 2 · `Session.seed` duplica `GameState.seed` — BORRAR

`state.seed` ya existe (`core/state/game.ts:124`) y ya se puebla en `createGame`.
El docstring que justifica el campo dice que «`newGame` la consume y no la
devuelve», y **es falso**: sobre esa premisa se construyeron el campo, el tipo de
`renderTopbar` y el `session.seed` de `panels.ts`.

Es el mismo patrón que este lote retira en `Player.name`, en el mismo lote, y
contradice el contrato que `CLAUDE.md` estrenó hoy: *un hecho, un sitio*. Y se
desincronizaría en el futuro ya escrito: cuando `Session` hable por WebSocket,
`this.seed` sería la que pidió el cliente y `state.seed` la que abrió el servidor.

**Decisión: fuera el campo.** `panels.ts` lee `session.state.seed`.

## 3 · La semilla se valida en la capa que solo pinta — SUBIR A `core`

La regla «una semilla es un entero ≥ 0» vive en `main.ts`, y el motor no la
comparte: `createRng` hace `seed >>> 0`, así que `newGame({seed: -1})` pasa. Hay un
tercer sitio que no valida nada: `ws-server.ts:18` acepta `NaN`.

Y de ahí sale lo que más pesa: **lo nuevo no tiene ni una línea de test**. El test
que acompaña al cambio prueba `newGame`, que no ha cambiado; parsear `?seed=`,
rechazar lo que no lo es y re-sortear al reiniciar no se prueba, porque
`nuevaSesion` mezcla la decisión con los efectos de navegador.

**Decisión: `parseSeed(texto: string | null): number` en `src/core/rng.ts`** —puro,
sin DOM—, que lanza con el mensaje escrito para la persona. `main.ts` solo lee
`location.search` y pinta el motivo; el servidor usa la misma. **Con test**, que es
la mitad que falta del entregable.

Separar también `semillaDeLaUrl()` de `abrePartida(seed)`: `nuevaSesion(false)` no
dice por sí solo «reiniciar sortea».

## 4 · El codec de veredictos está partido en dos ficheros — JUNTARLO

La profundidad elegida es correcta —el arnés solo ve texto, parsear es su único
canal— pero la justificación no se cumple: «pegado al escritor», y el escritor de
la línea **no está ahí**. `notas.ts` escribe la cabecera; la línea la compone
`ColaDeVeredictos.anota`, en otro fichero, unidos solo por cuatro constantes. Las
dos caras no se escriben juntas, que es la mitad del contrato.

Síntoma que ya está en el código: `notas.ts:101` hace `linea.slice(MARCA_OK.length)`
**sobre líneas que pueden empezar por `MARCA_FALLO`**. Hoy cuela porque las dos
marcas miden una unidad UTF-16; el día que alguien ponga `⚠️` o `[ok]`, el parser
se come un carácter de más en silencio.

**Decisión: `lineaDeVeredicto(v): string` junto a `leeVeredictos`**, y
`ColaDeVeredictos` la usa. El codec en un sitio, `anota` se queda con su papel de
anillo. Y la marca se resuelve una vez, no se asume su longitud.

## 5 · El escritor no promete lo que el parser supone — ARREGLAR EN EL ESCRITOR

`leeVeredictos` da el bloque por terminado en la primera línea que no encaja, y eso
supone que `nota` y cada `problema` son de una sola línea. Hoy es cierto **por
costumbre, no por contrato**: el día que un `err.message` traiga un `\n` —un
`ZodError.message` crudo es JSON multilínea—, `pnpm qa` **cuenta de menos sin
ponerse rojo**. Y eso choca con la política del propio fichero, que para un
veredicto sin `:` sí lanza porque «un contador que cuenta mal es peor que no
contar».

**Decisión: que lo garantice quien escribe.** Un `replace(/\n/g, ' ')` en `anota`,
y el `break` del parser deja de ser una suposición.

## 6 · Dos guardias del arnés que no pueden ponerse rojos — UNO FUERA, UNO SE QUEDA

**`entraron.length === 0` (`verify-agent.ts:248`): fuera.** Va después de comprobar
que hay veredictos y que ninguno se descartó, y `entraron` y `descartadas` parten
el mismo conjunto: si las dos pasan, `entraron > 0` por aritmética. Nunca dispara.

Y hay algo más fino: **cuenta veredictos, no acciones**, así que ni siquiera
implementaba el criterio 8 —un turno aceptado con `actions: []` daría veredicto
`✓` sin que entrara ninguna acción—. Lo que sí implementa el criterio 8 es el
guardia del cambio aplicado, que exige que el edificio pedido **aparezca**. Se
borra el muerto y se dice en el informe que el criterio lo cubre el otro.

**`faltan` (`:260`): se queda.** El revisor tiene razón en que hoy no puede
dispararse, porque las tres consultas son incondicionales. Pero eso es lo que hace
un guardia de regresión: dispara el día que alguien quite una de las tres
llamadas. No es código muerto, es una red — y la diferencia con el anterior es que
aquel no puede dispararse **ni siquiera editando el código de alrededor**.

## 7 · Los literales que el propio commit acaba de extraer — UNIFICAR

Tres sitios siguen escribiendo a mano lo que este commit centralizó en `notas.ts`:

- **`mcp/server.ts:150-152`**, la descripción que lee el agente, escribe
  `CÓMO FUE LO ANTERIOR`, `✓` y `⚠` a mano. Es el peor de los tres: renombrar la
  cabecera actualizaría escritor, parser y tests, y dejaría **al agente** buscando
  un bloque que ya no se llama así. Ese fichero ya interpola `PREFIJO_FIN`, así que
  la costumbre existe y aquí se rompe.
- **`verify-agent.ts:236,244`** rehacen a mano el `'    - '` que es
  `SANGRIA_PROBLEMA`, en dos renderizados casi iguales de «veredicto + problemas».
- **`verify-agent.ts:366,416-426`** siguen parseando `kind:`, `ESTADO:` y
  `CÓMO RESPONDER:` como literales, mientras el bloque de veredictos se mudaba. De
  los tres marcadores de la escucha, se ató uno.

**Decisión: los tres.** Interpolar las constantes en la descripción; una función
`detalle(v)` que use `SANGRIA_PROBLEMA` desde los dos sitios; y exportar las
cabeceras de `ESTADO:`/`CÓMO RESPONDER:`/`kind:` y usarlas. **No** se construye
`leePeticion` con su test de ida y vuelta: las constantes ya impiden la
divergencia, que es lo que se quería, y el resto es alcance nuevo.

## 8 · `creature_stats` fuera del helper — DENTRO

Es la única consulta que no pasa por `consulta()`, así que **no entra en el
recuento**: el arnés ejercita cinco y su propio informe dice cuatro. Verificado en
la salida de `pnpm qa`.

**Decisión: pasarla por `consulta()`** si devuelve JSON como el resto; si no, al
menos `consultadas.add`. El informe tiene que contar lo que hace.

## 9 · CI define «el bucle rápido» por segunda vez — Y TYPECHEQUEA DOS VECES

El job enumera `typecheck`, `lint`, `test` sueltos, cuando `package.json` ya define
`verify` como esos tres y el hook lo invoca así. Añadir una comprobación a `verify`
no llegaría a CI. Y además: `pnpm build` es `tsc -b --noEmit && vite build`, y ese
`tsc` **no es incremental** — son 1,9 s repetidos, el 22 % del trabajo real del job.

**Decisión: `- run: pnpm verify` y `- run: npx vite build`.** Una sola definición y
se va el `tsc` duplicado. Se pierde la anotación por paso en Actions; se acepta, y
se dice en el comentario del workflow.

## 10 · CI sin `concurrency` — AÑADIR

Dos pushes seguidos a la misma rama ejecutan los dos hasta el final. Tres líneas.

## 11 · Biome y `tsc` se pisan, y se contradicen — UN SOLO DUEÑO

`noUnusedLocals`/`noUnusedParameters` y las reglas `noUnusedVariables`/
`noUnusedImports` del preset `recommended` de Biome comprueban lo mismo dentro del
mismo `pnpm verify`. No solo se solapan: **discrepan**. Verificado: `const _noUsada`
pasa Biome y lo rechaza `tsc`, así que la salida que el propio mensaje de Biome
recomienda —prefijar con guion bajo— deja el repo rojo.

**Decisión: apagar esas dos reglas en Biome**, con el motivo dentro de
`biome.jsonc`. `tsc` es el que muerde, y dos voces dando consejos incompatibles
sobre la misma línea es peor que una.

## 12 · La huella del hook ya está desincronizada — ARREGLAR DE RAÍZ

La lista de rutas de `verde.sh:31` es la tercera redacción de «qué cubre
`pnpm verify`», junto a `tsconfig.include` y `biome.files.includes`. A las tres les
falta lo mismo: **`vite.config.ts` no está en la huella**, así que tocarlo puede
poner `pnpm typecheck` o `pnpm lint` en rojo **con el guardia dormido**.

**Decisión: dejar de mantener la lista.** `git ls-files -c -o --exclude-standard`
excluyendo `assets` y `docs`. Que el hook corra de más cuesta 6 s; que no corra
cuando debía es el fallo que documenta `CLAUDE.md`.

## 13 · Menores aceptados

- **`otherSide` se quedó sin un solo llamante** cuando el parche 01 le quitó el
  último import: el commit que barre locales muertos dejó un **export** muerto, que
  `noUnusedLocals` no ve. Fuera.
- **El docstring de `describePlayer`** narra en dos párrafos un campo que ya no
  existe. Una frase basta; el resto está en el historial.
- **`primeraSesion()`** son trece líneas de envoltorio para una sola llamada.
- **`loPedido`** se enhebra por dos firmas para llegar a un sitio; se calcula dentro.
- **La semilla se escribe en el DOM en cada fotograma** —sesenta por segundo
  mientras dura una animación— siendo un valor que no cambia en toda la sesión. Es
  el criterio que la propia función aplica cuatro líneas más arriba. Se escribe una
  vez al abrir partida.
- **`qa-politica.test.ts`** repite tres aserciones idénticas; un bucle.

## 14 · Descartados, y por qué

- **Fusionar el job `qa` dentro de `verify`** (ahorra arrancar un runner para una
  orden de 5,5 s). Se descarta: dos jobs dan **señal roja independiente**, y saber
  si lo que se rompió es el circuito del agente o el bucle rápido vale más que un
  runner en un repo público, donde Actions es gratis.
- **Sustituir el guardia por `git grep -I -F`** (6,0 ms contra 6,3 de la versión
  acotada en Node). Se descarta: la diferencia es ruido, y el guardia pasaría a
  depender de la detección de binarios de `git` y de distinguir su código de salida
  1 —«no hay coincidencias»— de una avería de verdad. Node se lee sin notas al pie.
- **Que `antes` reutilice el `payload` de la escucha** en vez de pedir `game_state`
  (~7 ms). Se descarta: comparar antes y después **por el mismo canal** es lo que
  hace válida la comparación; mezclar la petición con la consulta compara dos
  cosas distintas y el guardia deja de significar lo que dice.
- **El sondeo de arranque de 250 ms** (~178 ms desperdiciados, el 3,2 % de
  `pnpm qa`). Se descarta **de este ciclo**, no del proyecto: es preexistente, no lo
  toca ningún criterio y el lote ya es grande. Va al backlog.
- **Los cuatro pasos de `setup` duplicados entre los dos jobs**: es el precio de que
  corran en paralelo, y el propio workflow lo justifica.
- **El tipo local de `leeVeredictos`** que reescribe los cuatro campos de
  `Veredicto` para hacer `problemas` mutable: una línea, sin consecuencias.
- **Un tercer test de determinismo por semilla**: mide algo distinto de los otros
  dos y su mitad nueva —«otra semilla da otra partida»— no estaba en ninguno.
