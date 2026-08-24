# QA — higiene: linter, CI y QA de verdad

Validado sobre el árbol de trabajo sin commitear (75 entradas en `git status`,
`git diff` vacío). **Nada de lo que sigue está copiado de `implementacion.md`:
cada fila se volvió a ejecutar aquí.** Donde reproduje una cifra del informe lo
digo; donde no pude, también.

Al terminar, el árbol está exactamente como lo encontré: 75 entradas, `git diff`
vacío, `tools/gen/spend.json` en **3,74 $** con el mismo md5, `data/` intacto y
de `assets/` solo los doce `atlas.json` borrados. **Cero euros.**

## Medidas base, tres pasadas cada una

| Orden | Pasadas | Tope | Veredicto |
|---|---|---|---|
| `pnpm verify` | **6,49 · 6,36 · 6,42 s**, salida 0, 208 tests | < 10 s | ✅ |
| `pnpm qa` | **5,42 · 5,43 · 5,43 s**, salida 0 | < 15 s | ✅ |
| `npx tsx tools/qa/barrido-semillas.ts` | `sin terminar: 0/40 → []`, 2,22 s | 0/40 | ✅ |
| `pnpm build` | salida 0, 2,35 s | — | ✅ |
| `pnpm lint` | `Checked 63 files in 47ms. No fixes applied.`, salida 0 | — | ✅ |

## Criterios, uno a uno

### #43 — linter, formateador y CI

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Workflow en `.github/workflows/` sobre `push` y `pull_request` a `main` con typecheck, test y build | ✅ | YAML parseado: `on: {push:{branches:[main]}, pull_request:{branches:[main]}}`; job `verify` = checkout + pnpm/action-setup@v4 + setup-node@v4 + `pnpm install --frozen-lockfile` + **`pnpm verify`** (= `typecheck && lint && test`) + **`npx vite build`**; job `qa` = `pnpm qa`. Los cuatro comandos salen 0 aquí. **El workflow no lo ha corrido nunca un runner** → fila aparte en «No probado» |
| 2 | El workflow no gasta dinero | ✅ | `grep -rniE "FAL_KEY\|secrets\|pnpm gen\|animate\.ts\|gen/" .github/` → **una sola línea, y es el comentario que lo explica** (`ci.yml:10`). `permissions: {contents: read}`. Ningún `secrets.*`. Y `git diff HEAD -- tools/` no añade ni una llamada a fal |
| 3 | `pnpm lint` verde sobre el código de hoy + `noUnusedLocals`/`noUnusedParameters` encendidos + los seis muertos fuera | ✅ | `pnpm lint` → 63 ficheros, 0 arreglos, salida 0. `tsconfig.json:12-13` con las dos banderas. Los siete sitios comprobados uno a uno: `asset`, `currentPlayer`, `otherSide` (×2), `Hero`, `BUILDING_SIZE` → **0 apariciones**. Reglas apagadas con su motivo dentro de `biome.jsonc` |
| 4 | Comprobación de formato en CI + `pnpm format` + reformateo en commit aparte | ✅ | **Roto a mano**: metí `const    mal   =    {a:1,   b:2}` en `rng.ts` → `pnpm lint` **salida 1**, «Formatter would have printed…». `pnpm format` lo arregla y vuelve a 0. Y el commit 4 **reproducido por definición**: saqué el árbol del parche 03, le pasé `biome check --write` («Fixed 47 files») y comparé con el árbol del parche 04 → **`diferencias: 0`**. El parche 04 toca 47 ficheros y **todos son `.ts`** |
| 5 | `pnpm verify` < 10 s | ✅ | 6,49 · 6,36 · 6,42 s |
| 6 | `CLAUDE.md` dice cómo se lanza cada cosa y cuánto tarda | ✅ | Tabla nueva: verify 6,5 (mido 6,4) · qa 5,4 (mido 5,4) · barrido 2,2 (mido 2,2) · invariantes 22 ms (mido 25). **Las cuatro cifras son reproducibles**, que es justo lo que fallaba antes |

### #44 — que el QA del agente verifique de verdad

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 7 | Lee el bloque de veredictos y lo informa, con el motivo; y dice si asume el acoplamiento o lo ata | ✅ | Salida real: `[qa] 15 veredictos, 15 entraron, 0 descartadas`. Con la respuesta rota (ver 8): `[qa] 8 veredictos, 5 entraron, 3 descartadas`. El acoplamiento se **asume** y el parser se muda junto al escritor (`notas.ts`), decisión escrita en §4 de `implementacion.md`. **Verificado que muerde ahí**: cambié `'CÓMO FUE LO ANTERIOR:'` por `'ASÍ FUE LO ANTERIOR:'` → `pnpm test` rojo en 3 s, no `pnpm qa` en CI |
| 8 | Revienta si una respuesta ENTERA se rechaza o si no entra ni una acción | ✅ | **Roto a mano**: `battle_turn` devolviendo `{action:{type:'no-existe-esta-accion'}}` → `[qa] ha fallado: Error: hubo respuestas rechazadas ENTERAS`, **salida 1**. La mitad de «ni una sola acción» ya no es un contador propio: la cubren `veredictos.length === 0` y `cambioAplicado === null`, y esa segunda **sí la vi morder** (fila 9) |
| 9 | Comprueba con `game_state` que lo pedido se aplica | ✅ | En verde: `[qa] comprobado que se aplica: el castillo town-1 tiene ahora "town_hall", que es exactamente lo que se pidió`. **Roto a mano**: pedí `necromancer_upgrade_5` (que el servidor rechaza) → `Error: el turno se aceptó pero el castillo town-1 sigue sin "necromancer_upgrade_5": no se aplicó lo pedido`, **salida 1**. Está atado al edificio concreto, no a «algo cambió» |
| 10 | Ejercita las tools de consulta por su contenido | ✅ | `[qa] consultas ejercitadas: battle_state, building_list, creature_stats, game_state, spell_list` — **cinco**, y con contenido: `creature_stats` exige `name === 'Paladín'`, `spell_list` exige `haste`, `building_list` exige `castle`, `battle_state` exige `stacks` no vacío (`ronda 1, 3 stacks, bando defender`). Matiz declarado: si una pasada no tuviera batalla, `battle_state` sale en amarillo, no en rojo. Hoy hay batalla en las tres pasadas |
| 11 | El `default: return {}` deja de existir | ✅ | **Roto a mano**, que es la única forma: devolví el `default: return {};` a `politica.ts` → `test/qa-politica.test.ts` rojo, `AssertionError: map_generate: expected [Function] to throw an error`. Restaurado → 2 pasan |
| 12 | Salida 0 y < 15 s | ✅ | 5,42 · 5,43 · 5,43 s, salida 0 |

### #53 — semilla fijable y visible

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 13 | `?seed=N` fija la semilla; sin el parámetro, aleatoria | ✅ | Navegador: `?seed=777` → héroe «Aldo de Valdeluz», ejército 29 (Campesino 20 / Arquero 9). Sin parámetro → sortea **y reescribe la URL**: `http://localhost:3101/` acabó en `?seed=2336` |
| 14 | Se ve **siempre**, donde no lo pisan los mensajes del juego | ✅ | `<span id="seed">` en la barra superior, comprobado en **seis estados**: mapa recién abierto · mapa tras mover al héroe (`#status` quedó **vacío**) · castillo · castillo con un rechazo escrito (`#status` = «no se puede construir Gremio de magia I: ya se ha construido hoy en este pueblo») · batalla · **partida perdida** (`Partida perdida  semilla 778`). Y por construcción: el bucle de dibujo escribe `#day`, `#resources`, `#turn`, `#side`, `#actions` y `#status`, nunca `#topbar` entero, así que `#seed` no puede desaparecer |
| 15 | Reiniciar enseña la semilla nueva | ✅ | Tras perder, «Partida nueva» → URL `?seed=46475` y barra `semilla 46475`, día 1, ejército nuevo |
| 16 | Dos cargas con la misma `?seed=` dan la misma partida | ✅ | Dos cargas de `?seed=777`: mismo mapa, misma casilla del héroe, mismo ejército 29/20/9, mismo castillo. `?seed=778`: mapa distinto, ejército 31/22/9. Test en `game.test.ts` con sus dos mitades. **Y lo llevé más lejos** (ver «La semilla desde el punto de vista de quien la usa») |

### #45 — ninguna ruta de esta máquina en un fichero versionado

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 17a | Existe un guardia y **muerde** | ✅ | Reproducido dos veces por mí. Con un `.json` **sin indexar** (`?? prueba-a.json`): `× ningún fichero que una máquina lee… → expected [ Array(1) ] to deeply equal []` con `prueba-a.json:1 → { "out": "/home/al/code/heroes/dist/x.js" }`. Y la ruta se deriva en ejecución: el fichero del guardia no se encuentra a sí mismo |
| 17b | Las dos presas caídas | ✅ | `.mcp.json:6` → `["tsx", "src/server/mcp/server.ts"]`. Los doce `atlas.json` borrados (`git status -- assets/` = 12 `D`, ninguna otra cosa). `git grep "/home/al"` sobre el índice devuelve **una sola línea**, y es un comentario (ver 17c) |
| 17c | «Ningún fichero **versionado** contiene una ruta absoluta de una máquina concreta» | ❌ **en su lectura literal** | Tras commitear, cuatro ficheros versionados la llevarán dentro: `docs/.../requisitos.md`, `critica.md`, `hallazgos-simplify.md` y **`commits/06-rutas-absolutas.patch`**. Y un `.ts` versionado lleva otra: `test/invariantes.test.ts:256` cita `/home/al/code (copia)/heroes`. El acotado «solo lo que una máquina consume» está sancionado por el coordinador y es defendible para los `.md`, pero **no cubre el `.patch`** —que el propio §10 manda pasar por `git apply`— ni las clases del hallazgo 1 |
| 18 | La decisión del re-recorte, escrita donde se escribe el atlas | ✅ | `tools/gen/animate.ts:273-292`: veinte líneas con los tres motivos y la decisión del usuario. Y resumido en `CLAUDE.md` §Animaciones |

### #58 — nada declarado y muerto

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 19 | `Player.name` fuera de `Player`, `GameConfig` y `setup.ts` | ✅ | `interface Player` leída entera: `id`, `faction`, `controller`, `resources`, `fog`, `memory`, `defeated`. `GameConfig.players` = `{id, faction, controller}`. `createGame` no lo copia. `setup.ts` no lo escribe. Fuera también del `SpectatorSnapshotMsg`. Lo que queda con `.name` son héroes, pueblos, criaturas y hechizos |
| 20 | `pnpm verify` verde, sin tipos huérfanos | ✅ | 208 tests, salida 0, `tsc --noEmit` limpio con `noUnusedLocals` encendido |

### Transversales

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 21 | `pnpm verify` verde y los guardias nuevos **vistos morder** | ✅ | Verde (tres pasadas). **Rotos por mí, uno a uno**: rutas absolutas (fichero sin indexar) · `noUnusedLocals` (`const _noUsada` → `tsc` TS6133 salida 2, y **Biome calla**, salida 0: el dueño único es real) · la cabecera de veredictos, en sus **dos** formas (cambiar el valor de la constante y hardcodear la prosa en el escritor) · el aplanado de saltos de línea (`unaLinea` devolviendo el texto tal cual → el segundo problema desaparece) · el `default` de la política · respuesta entera rechazada en `pnpm qa` · cambio no aplicado en `pnpm qa`. **Siete rojos vistos, todos restaurados** |
| 22 | `pnpm qa` sigue saliendo 0 | ✅ | Tres pasadas, salida 0 |
| 23 | Barrido en 0/40 | ✅ | `sin terminar: 0/40 → []` · `batallas IA vs IA: peor caso 8 rondas, 0/40 en el tope de 100` |

### Y una que no es mía

| Decisión 1 | `/mcp` lista `heroes` tras reiniciar Claude Code | ⚠️ **PENDIENTE** | No puedo reiniciar Claude Code. Lo que **sí** reproduje, lanzando el servidor MCP tal cual lo describe `.mcp.json`: desde `/home/al/code/heroes` **arranca** con las siete tools (`battle_state, building_list, creature_stats, game_state, heroes_listen, heroes_respond, spell_list`, rc=0); desde `/home/al/code/heroes/src` **no arranca** (`Cannot find module '/home/al/code/heroes/src/src/server/mcp/server.ts'`, rc=1); desde `/tmp` tampoco. O sea: la ruta relativa resuelve contra el **cwd**, así que la comprobación del usuario decide. Si `/mcp` no lo lista, la salida 1 de §7 (`${CLAUDE_PROJECT_DIR:-.}/…`) es la buena, porque es la única que no depende del cwd |

---

## El juego se sigue jugando

`pnpm dev` + Chrome, partida entera con `?seed=778`: mover al héroe y capturar
una mina (Movimiento 1100 → 720, «Mina capturada») · entrar en el castillo y
construir el Ayuntamiento (8000 → 5500 oro, ingresos 500 → 1000/día) · un
rechazo escrito para la persona al intentar construir otra vez el mismo día ·
batalla contra un Zombi ×10 (mover, disparar «13 de daño, 0 bajas», resolver
sola) · turno del rival · derrota el día 3 («Derrota: el enemigo se ha quedado
con todo.») · reiniciar. **Consola limpia**: 46 mensajes, todos `[vite]` o
`[assets] 139 imágenes generadas cargadas`, más las dos excepciones
**intencionadas** de `?seed=abc`.

**Sin arte.** Escondí `assets/generated` un minuto y recargué `?seed=777`: el
mapa se pinta con marcadores de color, el castillo con cajas rotuladas
(«Ayuntamiento», «Morada de nivel 1») y parcelas punteadas, y **el estado es el
mismo** (ejército 29, Campesino 20 / Arquero 9). Ni un error en consola.
Restaurado y comprobado: 75 entradas, `git diff` vacío.

**Sin agente.** Toda la partida de arriba la jugó la IA de reglas: el rival
construyó, reclutó y ganó. Y `pnpm verify` sale **0 con `pnpm server`
levantado**, mientras `pnpm qa` sale **1 con `EADDRINUSE :::9881`** — que es
exactamente el argumento con el que se sacó `qa` de `verify`, ahora medido.

**`index.json` sin gastar un euro.** Repliqué el filtro nuevo
(`BASE_CREATURES.filter(c => POSES.some(...))`) contra el disco: doce criaturas,
seis PNG cada una, y el fichero generado es **byte a byte** el `index.json`
versionado. No hace falta correr `animate.ts` para saber que el índice no cambia.

## La semilla desde el punto de vista de quien la va a usar

La pregunta era si un fallo encontrado jugando se puede entregar para que otro
lo reproduzca. **Sí, y lo probé más allá del arranque**: dos `Session(777)` con
la **misma secuencia de acciones** —abrir el castillo, construir `town_hall`,
cerrar, mover el héroe tres casillas, pasar turno, dejar jugar al rival, pasar
turno— dan un estado **idéntico** (día, recursos de los dos jugadores, héroes
con posición/ejército/movimiento/maná, edificios, `finished`); con `778`, distinto.
Es decir: la semilla no solo fija el mapa, fija la partida entera **siempre que
se repitan los mismos pasos en el mismo orden**. No hay registro de acciones, así
que la receta sigue siendo «esta URL + estos pasos», pero la URL ya la escribe el
juego solo (`history.replaceState`), que era lo que faltaba.

Entradas raras probadas en el navegador: `?seed=0x10` → se acepta como 16 y la
URL se **normaliza** a `?seed=16` (bien: lo que se comparte es canónico) ·
`?seed=` vacío → sortea, no revienta · `?seed=abc` → rechazo escrito (hallazgo 6)
· `?debug=1&seed=777#castillo` → `?seed=777`, se pierden lo demás y el fragmento
(hallazgo 9).

---

## Hallazgos

Todos **menores**. Ninguno bloquea, ninguno rompe el juego, y ninguno lo he
arreglado yo.

### 1 · menor — El guardia de rutas no mira `.js`, `.mjs`, `.cjs`, `.patch` ni los ejecutables sin extensión

`CLASES_QUE_SE_CONSUMEN` es `['.json', '.jsonc', '.yml', '.yaml', '.ts', '.sh']`.
Su propia regla —«un fichero que una máquina **ejecuta o lee**»— cubre de sobra
un `.js` de configuración, que es la clase más ejecutada que hay en un repo de
Node, y un `.patch`, que el §10 de `implementacion.md` manda pasar por
`git apply`. §9 declara los huecos de `.md`, `.css`, `.html` y binarios; **estos
no están declarados**.

**Reproducción, desde el arranque:**
```bash
cd /home/al/code/heroes
R=$PWD
printf '{ "out": "%s/dist/x.js" }\n'          "$R" > prueba-a.json    # clase cubierta
printf 'export default { root: "%s/src" };\n' "$R" > prueba-b.mjs
printf 'module.exports = { root: "%s/src" };\n' "$R" > prueba-b2.cjs
printf 'const x = "%s/src";\n'                "$R" > prueba-b3.js
printf 'const x = "%s/src";\n'                "$R" > prueba-c.tsx
printf '#!/bin/sh\nexec node %s/tools/x.js\n' "$R" > prueba-e-hook && chmod +x prueba-e-hook
printf 'RUTA=%s/x\n'                          "$R" > prueba-f.envrc
printf 'ruta = "%s/x"\n'                      "$R" > prueba-f.toml
npx vitest run test/invariantes.test.ts
```
Salida: **una sola presa**, `prueba-a.json`. Los otros siete pasan, y
`git ls-files -c -o --exclude-standard` los lista a los ocho.

Lo que esperaba quien lee el criterio 17: que un fichero que una máquina ejecuta
con la ruta de esta máquina dentro ponga el guardia rojo, sea cual sea su
extensión.

Y no es teórico para el `.patch`: `docs/agents/2026-08-24-higiene-y-guardias/commits/06-rutas-absolutas.patch`
se commitea y contiene `/home/al/code/heroes`.

### 2 · menor — Dentro de una clase que sí mira, un JSON con las barras escapadas se cuela

JSON permite escribir `\/` por `/`. El guardia busca la ruta literal, así que no
la encuentra, y `JSON.parse` devuelve exactamente la misma ruta.

```bash
printf '{ "out": "\\/home\\/al\\/code\\/heroes\\/dist\\/x.js" }\n' > prueba-d.json
npx vitest run test/invariantes.test.ts        # verde
node -e 'console.log(JSON.parse(require("fs").readFileSync("prueba-d.json","utf8")).out)'
# → /home/al/code/heroes/dist/x.js
```

### 3 · menor — El comentario del guardia promete una robustez que el fichero no tiene

`test/invariantes.test.ts:255-258` justifica el escapado de la expresión regular
con «un checkout puede vivir en `/home/al/code (copia)/heroes`». En ese checkout
**el guardia no llega a correr**: `RAIZ = new URL('..', import.meta.url).pathname`
devuelve la ruta **percent-encoded**, y `ficheros('src/core')` —que corre al
cargar el módulo— muere antes.

**Reproducción:** copié el repo a `…/code (copia)/heroes` (con `node_modules`
enlazado) y corrí el fichero de invariantes:
```
FAIL test/invariantes.test.ts
Error: ENOENT: no such file or directory, scandir '…/code%20(copia)/heroes/src/core'
 ❯ ficheros test/invariantes.test.ts:78:25
Tests  no tests
```
Los **nueve** invariantes se caen, no solo el noveno. Es ruidoso, no silencioso,
así que el daño es acotado — pero el escapado de paréntesis que el comentario
justifica **no puede llegar a usarse nunca**, y el comentario afirma lo
contrario. `RAIZ` viene de antes de este ciclo; lo que este ciclo añade es la
afirmación.

### 4 · menor — El límite declarado del guardia ya tiene un ejemplo vivo, y lo introdujo este ciclo

`git grep "/home/al"` sobre el índice devuelve **una** línea:
`test/invariantes.test.ts:256`, un `.ts` versionado con
`/home/al/code (copia)/heroes` dentro. Es inerte (va en un comentario) y el
guardia no puede verla porque no es su propia ruta —límite declarado en §9—,
pero enseña que el límite no es teórico y que el criterio 17 literal ya no se
cumple ni en las clases que el guardia sí mira.

### 5 · menor — `HEROES_SEED` vacía mata el servidor, y el navegador con `?seed=` vacío no

§11.3 dice que la regla sube a `core` para que los dos llamantes la compartan.
No comparten el caso vacío:

```bash
HEROES_SEED= npx tsx src/server/ws-server.ts
# Error: no se ha pedido ninguna semilla: se escribe como un entero, por ejemplo 777   (salida 1)
```
mientras que `?seed=` en el navegador sortea y abre partida (`main.ts:49`
comprueba `trim() === ''` **antes** de llamar a `parseSeed`). Además el mensaje
no nombra `HEROES_SEED`, así que quien lo vea en una terminal no sabe qué
variable le está hablando. `HEROES_SEED=abc` sí se comporta como debe (salida 1
diciendo por qué), y eso **cierra un agujero real**: antes abría la partida
`NaN >>> 0` en silencio.

Lo que esperaba quien lo hace: o el vacío significa lo mismo en los dos sitios,
o el mensaje explica cuál de los dos es.

### 6 · menor (experiencia) — `?seed=abc` deja una pantalla negra sin salida

**Reproducción:** `pnpm dev`, abrir `http://localhost:3100/?seed=abc`.

Se ve: una pantalla negra con «Día 1» arriba a la izquierda y, abajo, en 12 px y
gris, `"abc" no es una semilla: tiene que ser un número entero ≥ 0, como 777`.
`#actions` está **vacío**: no hay «Partida nueva», no hay nada que pulsar. La
única salida es editar la barra de direcciones.

El mensaje es correcto y está en castellano, y el fail-loud es el contrato del
repo — pero `implementacion.md` §6 presenta esto como el arreglo de «la página
en blanco», y la página **sigue en blanco**: lo que se ganó es el motivo, no la
salida. Un botón «Partida nueva» (el manejador ya existe) lo cerraría.

### 7 · menor, preexistente pero tocado — La huella del hook `Stop` se cae con un nombre de fichero con espacio

`.claude/hooks/verde.sh:34` usa `xargs -r cat 2>/dev/null`. Un fichero con un
espacio en el nombre no se lee, **en silencio**, así que su contenido no entra
en la huella: el nombre entra una vez, y a partir de ahí **los cambios dentro de
ese fichero no despiertan al guardia**.

```bash
printf 'const x = 1;\n' > "fichero con espacio.ts"
listado=$(git ls-files -c -o --exclude-standard -- . ':!assets' ':!docs')
printf '%s' "$listado" | xargs -r cat 2>&1 >/dev/null | head -3
# cat: fichero: No such file or directory
# cat: con: No such file or directory
# cat: espacio.ts: No such file or directory
```

El patrón viene de `HEAD` (no es una regresión), pero este ciclo reescribió esa
misma línea para «arreglarla de raíz» (§11.12) y dejó el `xargs` sin `-0` —
mientras que el invariante nuevo, dos ficheros más allá, sí usa `-z`.

### 8 · menor — El hook vigila menos de lo que el guardia puede poner rojo

La huella excluye `assets` y `docs`; el guardia nuevo **sí** barre `.json`,
`.yml` y `.ts` dentro de `assets/` y `docs/`. Un `.json` con la ruta absoluta
dentro de `assets/generated/` deja `pnpm verify` en rojo **sin que el hook se
despierte**, porque la huella no ha cambiado. Es la misma clase de desincronía
que §11.12 dice haber cerrado, con los papeles al revés. (Los doce `atlas.json`
recién borrados vivían justamente ahí.)

### 9 · menor — Abrir partida borra el resto de la URL

`history.replaceState(null, '', \`?seed=${seed}\`)` sustituye la query **entera**
y el fragmento. Probado: `?debug=1&seed=777#castillo` → `?seed=777`. Hoy es
inerte porque nada más usa la query ni el hash; el día que se añada un segundo
parámetro, desaparecerá al abrir partida.

### Observaciones fuera del alcance de este ciclo

No son hallazgos suyos; las dejo dichas porque salieron jugando:

- La crónica del jugador enseña las acciones del **rival** («Construido: Morada
  de nivel 2», «Reclutados 6 × Zombi» en una partida de caballeros). Es #59/#18.
- Tras la derrota, el panel lateral dice «No tienes héroes en el mapa. Contrata
  uno en tu castillo» — sin castillo y con la partida acabada.
- En la pantalla de batalla el tablero ocupa el cuadrante superior izquierdo de
  un lienzo mucho mayor; con la ventana ancha, cerca de la mitad de la pantalla
  queda negra. Es #48/#55, no de aquí.

---

## Workarounds usados, y por qué no afectan a quien juega

| Workaround | Por qué no es un hallazgo |
|---|---|
| Jugué en `http://localhost:3101`, no en 3100 | El 3100 lo tenía cogido un proceso anterior a esta sesión (pid 2626346, arrancado a las 19:02). Vite eligió 3101 solo. El código servido es el árbol de trabajo |
| La captura de pantalla de Chrome falló por *timeout* de CDP en ~la mitad de los intentos | **No es el juego**: medí el bucle de dibujo desde la página — 60 fotogramas, mediana 16,6 ms, p90 17,3, máximo 17,7 → **60 fps sin un solo tirón**. Es el coste de capturar un lienzo de 2212×1228. Reintentar siempre funcionó |
| `javascript_tool` devolvió a veces el documento anterior justo después de navegar | Artefacto de la herramienta: la captura de pantalla, tomada a la vez, mostraba la página nueva. Crucé cada lectura dudosa con una captura |
| Escondí `assets/generated` un minuto para probar el camino sin arte | Es el único modo de ver ese camino de verdad. Restaurado y verificado: 75 entradas, `git diff` vacío, 12 `D` en `assets/` y ni una más |
| Edité `politica.ts` y `notas.ts` para ver morder a los guardias, y planté nueve ficheros de sonda | Restaurados desde copia y comprobado `git diff --stat` = 0 en los dos; las sondas, borradas. El árbol final es idéntico al inicial |
| Copié el repo a un directorio con espacio para el hallazgo 3 | Copia fuera del repo, borrada al terminar |

---

## No probado

| Qué | Por qué |
|---|---|
| **`/mcp` lista `heroes` tras reiniciar Claude Code** | No puedo reiniciarlo. Es lo único que el usuario tiene que comprobar. Lo que sí queda medido está en la fila «Decisión 1» |
| **El workflow de CI ejecutado en un runner** | Nadie lo ha corrido. El YAML parsea, los jobs y pasos son los que dicen, los comandos salen 0 en local y el lockfile tiene `@biomejs/biome@2.5.10` con el `specifier` de `package.json` (que es lo que valida `--frozen-lockfile`) — pero `actions/checkout@v4`, `pnpm/action-setup@v4` y una instalación limpia no los ha visto correr nadie |
| **`tools/gen/animate.ts` ejecutado** | Cuesta dinero y el presupuesto es 0 €. En su lugar repliqué la derivación del índice contra el disco: byte a byte igual |
| **Reproducibilidad píxel a píxel** | El hash del lienzo es estable dentro de una carga pero cambia entre cargas por algo que no perseguí, así que comparé **estado** (mapa, casilla, ejército, castillo, día, recursos) y capturas, más el test de `newGame` y la repetición de partida en Node. Es más fuerte que píxeles para lo que el criterio pide, pero no es píxeles |
| **`map_generate` y `hero_banter` en el circuito** | Fuera de alcance (#27, #28): no los emite nadie. La rama del criterio 11 se vio morder por test, que era la única forma |

---

## Veredicto

**APTO CON RESERVAS.**

Los 23 criterios: **21 ✅**, **1 ❌** (17c, la lectura literal de «ningún fichero
versionado») y **1 pendiente del usuario** (que `/mcp` liste `heroes`). Los tres
presupuestos duros se cumplen con holgura y **medidos aquí**: `verify` 6,4 s de
10, `qa` 5,4 s de 15 y salida 0, barrido 0/40. Cero euros: `spend.json` intacto,
`data/` intacto, de `assets/` solo los doce `atlas.json`.

Lo que sostiene el «apto»: los guardias no se dan por buenos con una pasada
verde —rompí **siete** y los vi rojos yo mismo—, el commit del reformateo es
**demostrablemente** la salida del formateador y nada más, los nueve parches
reconstruyen el árbol sin una sola diferencia en 242 ficheros, y el juego se
juega entero —mapa, castillo, batalla, turno del rival, derrota y reinicio— sin
arte, sin agente y sin un error en consola.

Lo que sostiene las reservas: el criterio 17 se cumple en su versión acotada y
no en la que está escrita, y **el acotado tiene huecos que su propia
justificación no cubre** — un `.js` de configuración y un `.patch` son ficheros
que una máquina ejecuta o lee, y el `.patch` que este mismo ciclo va a commitear
lleva la ruta dentro. Los ocho hallazgos restantes son menores y ninguno toca al
jugador salvo el 6, que deja una pantalla sin salida ante una URL mal escrita.

**Recomendación:** commitear, y abrir issue para el hallazgo 1 (las clases del
guardia) porque es el único que degrada un guardia recién nacido. El resto puede
esperar a que alguien pase por ahí.

---

# Segunda vuelta — 24 de agosto de 2026, 21:00-21:15

Los nueve hallazgos de arriba están aplicados. Esta vuelta **no repite los 23
criterios**: re-verifica los tocados (5, 12, 13-16, 17 y 21), hace una pasada
adversarial **nueva** contra la forma nueva del guardia, y comprueba que lo que
ya estaba bueno sigue estándolo. Nada está copiado de `implementacion.md`.

**Sobre los tiempos.** La máquina estaba cargada por trabajo ajeno al repo
(`load average` entre 12 y 16 al empezar, 2 al terminar), así que ninguna cifra
se compara contra la de la primera vuelta: **todas las comparaciones son mías,
tomadas a la vez y bajo la misma carga**. Al terminar, el árbol está como lo
encontré: 77 entradas, el mismo `git diff --stat` (9 ficheros, 208+/79−),
`spend.json` con el mismo md5 (**3,74 $, cero euros**), y de `assets/` solo los
doce `atlas.json` borrados.

## ¿Ha costado algo el cambio? Medido, no supuesto

| Medida | Hoy | Referencia tomada a la vez | Veredicto |
|---|---|---|---|
| `pnpm verify` con carga 13-16 | **9,87 · 10,00 · 9,96 s** | — | roza el tope |
| `pnpm verify` con carga ~2 | **6,36 · 6,32 · 6,37 s** | — | ✅ |
| typecheck+test, árbol de hoy | **5,73 · 5,85 · 5,82 s** | **HEAD, antes del ciclo entero: 5,80 · 5,72 · 5,80 s** (intercalados, misma carga) | **indistinguibles** |
| `pnpm lint` | 0,23 s | — | ✅ |
| El guardia por dentro: filtrar + leer | **6,9-10,8 ms** (79 ficheros de 248) | **lista blanca de la 1ª vuelta: 2,3-5,9 ms** (77 ficheros) | **+5 ms** |
| Huella del hook `Stop` | **0,03 s** (247 ficheros, 10,3 MB) | **huella de la 1ª vuelta: 0,00 s** | +30 ms |

La lectura: el ciclo **entero** —208 tests contra 199, el guardia nuevo y el
linter— no se distingue de `HEAD` cuando se miden los dos a la vez; los 10 s de
la primera fila son la carga de la máquina, no el cambio. Y lo que esta segunda
vuelta añade al guardia son **5 ms** dentro de una orden de seis segundos.

## Criterios re-verificados

| # | Criterio | Veredicto | Evidencia de esta vuelta |
|---|---|---|---|
| 5 | `pnpm verify` < 10 s | ✅ **con una nota** | 6,32-6,37 s con carga ~2. Con carga 13-16 sube a 9,87-10,00 s y la segunda pasada **da exactamente 10,00**. No es el cambio: `HEAD` mide lo mismo que hoy cuando se miden intercalados |
| 12 | `pnpm qa` salida 0 y < 15 s | ✅ | **5,53 · 5,80 · 5,96 s**, rc=0 las tres, con carga 13-14. Última salida: `15 veredictos, 15 entraron, 0 descartadas` · `consultas ejercitadas: battle_state, building_list, creature_stats, game_state, spell_list` · `comprobado que se aplica: el castillo town-1 tiene ahora "town_hall"` |
| 13 | `?seed=N` fija; sin parámetro, aleatoria | ✅ | `?seed=777` → «Aldo de Valdeluz», Ejército (29) Campesino 20 / Arquero 9 — **los mismos números que la primera vuelta**, o sea que reescribir `parseSeed` no movió el núcleo. Sin parámetro → sorteó 2302 y reescribió la URL |
| 14 | La semilla se ve siempre | ✅ | `semilla 778` leída en las cuatro pantallas de una partida seguida: mapa, castillo, batalla y **partida perdida** (`Partida perdida  semilla 778`) |
| 15 | Reiniciar enseña la semilla nueva | ✅ | Tras la derrota, «Partida nueva» → URL `?seed=31492` y barra `semilla 31492`, día 1, ejército nuevo (35) |
| 16 | Dos cargas iguales, misma partida | ✅ | `?seed=31492` cargada dos veces: Ejército (35), Campesino 29, Arquero 6, mismo héroe. Y `?seed=778` reprodujo hasta **la derrota el día 3**, igual que en la primera vuelta |
| 17 | Ningún fichero que una máquina lee lleva la ruta, con guardia visto morder | ✅ | `git grep "/home/al"` sobre lo indexado: **vacío** (la primera vuelta devolvía el comentario de `invariantes.test.ts:256`, ahora genérico). De la carpeta del ciclo solo se commitean **cinco `.md`**; `commits/` lo aparta `.gitignore:28` (comprobado con `git check-ignore -v`). El guardia, visto morder abajo |
| 21 | Guardias nuevos vistos morder | ✅ | **Doce presas de doce** en la pasada adversarial; el guardia **rojo en un checkout copiado** con su propia ruta y **verde con la de otra máquina**, que es el límite que declara; y la huella del hook comparada **contra el código de la primera vuelta**, en paralelo, en los dos casos que fallaban |

## Los nueve hallazgos, uno a uno

| # | Qué se decidió | Comprobado |
|---|---|---|
| 1 | Invertir la lista | ✅ Las ocho clases que se colaban —`.json`, `.mjs`, `.cjs`, `.js`, `.tsx`, `.toml`, `.envrc` y un ejecutable sin extensión— **caen las ocho**. Ninguna de las 77 que miraba la lista blanca se ha perdido: los conjuntos se compararon fichero a fichero (`blanca ⊄ negra` = ∅) |
| 2 | No commitear los parches | ✅ `git check-ignore` los aparta; siguen en disco con **13 apariciones** de la ruta dentro de `06-rutas-absolutas.patch`, invisibles para el guardia. Ver observación B |
| 3 | `fileURLToPath` | ✅ Copié el repo a `…/ruta con (paréntesis)/` con `node_modules` enlazado: **los nueve invariantes pasan** (antes morían los nueve con ENOENT). Y ahí el escapado de la expresión regular **por fin se ejecuta**: plantada la ruta de esa copia, sale roja nombrándola con sus paréntesis |
| 4 | Ejemplo genérico | ✅ `git grep "/home/al"` sobre el índice: vacío |
| 5 | Buscar también la forma escapada de JSON | ✅ `{"out": "\/home\/al\/…"}` cae |
| 6 | Vacío es «no se ha pedido» | ✅ Medido **por el mapa que ve un espectador**, no por el código: sin variable → `6f1db2e55c9c`; `HEROES_SEED=` → **el mismo**; `HEROES_SEED=20260823` → el mismo; `777` → distinto; `abc` → el servidor **sigue muriendo** con el motivo escrito. Y `HEROES_SEED=0` → `bfde87fbba58`, **distinto del por defecto**: el `??` conserva el cero, que es la trampa que la firma nueva podía introducir. En el navegador, la otra mitad: `?seed=` sortea (33420) y `?seed=0` juega la **semilla 0**, no una sorteada |
| 7 | Decir cómo salir | ✅ `?seed=abc` → «`"abc" no es una semilla: tiene que ser un número entero ≥ 0, como 777 — quita "?seed=…" de la barra de direcciones para jugar una partida al azar`». Legible (ampliada la franja). La pantalla sigue negra y sin botón, que es lo que se decidió |
| 8 | `-z` / `xargs -0` | ✅ Comparado en paralelo contra el código de la primera vuelta: cambiando **solo el contenido** de `fichero con espacio.ts`, la huella nueva cambia y **la vieja no** |
| 9 | Que la huella cubra lo que el guardia mira | ✅ Igual: tocando `assets/sonda.json`, la huella nueva cambia y la vieja no. Y **de punta a punta**: con un fichero nuevo bajo `assets/`, el hook `Stop` ejecutó `pnpm verify` (10,01 s, rc=0) en vez de salir en 0,03 s |
| 10 | Conservar el resto de la URL | ✅ `?debug=1&seed=777#castillo` → tras abrir partida siguen `debug=1`, `seed=777` y `#castillo` |

## Pasada adversarial NUEVA: por dónde falla la lista negra

Veinte sondas plantadas a la vez, con la ruta de este checkout dentro. **Caen
doce**; lo que no cae, y si está declarado:

| Sonda | ¿Cae? | ¿Declarado? |
|---|---|---|
| `.json` · `.mjs` · `.cjs` · `.js` · `.tsx` · `.toml` · `.envrc` · ejecutable sin extensión · `.json` con `\/` · `.yml` | **sí, las diez** | — |
| `.MD` (extensión en mayúsculas) | **sí** — falso positivo sobre prosa | no |
| `.claude/settings.local.json.sonda` | sí | — |
| `.html` con la ruta en el `<script src>` | **no** | sí, pero **con un motivo falso** (hallazgo A) |
| `.css` con la ruta en un `url()` | **no** | igual |
| `.md` | no | sí |
| `.json` en UTF-16 · `.toml` con un byte cero en el primer kilobyte y la ruta después | **no, y en silencio** | **no** (hallazgo B) |
| Solo la carpeta de arriba (`/home/al/code`) | no | no, pero es coherente con el límite declarado |
| `dist/…` · `docs/agents/*/commits/*.patch` | no | sí: `.gitignore` |
| Enlace a directorio · enlace roto | no, **y no revientan** | sí — es el EISDIR que el código dice haber cerrado. Confirmado además que `git ls-files -o` **sí lista** un `node_modules` enlazado |

---

## Hallazgos de esta vuelta

Ninguno bloquea. Ninguno toca a quien juega. Ninguno lo he arreglado yo.

### A · menor — Las dos exclusiones «de la cara del cliente» se justifican con algo que Vite desmiente

`test/invariantes.test.ts` excluye `.css` y `.html` porque «lo que llevan dentro
son URL que resuelve el navegador, no rutas del disco». **Vite las resuelve como
rutas del disco**, y el resultado es exactamente el daño que el criterio 17
describe: aquí compila, en otra máquina no.

**Reproducción, desde el arranque:**
```bash
cd /home/al/code/heroes
sed -i 's|src="./main.ts"|src="'"$PWD"'/src/client/main.ts"|' src/client/index.html
npx vite build            # rc=0 — compila, y el guardia no dice nada
sed -i "s|$PWD/src/client/main.ts|/home/otra-maquina/heroes/src/client/main.ts|" src/client/index.html
npx vite build            # rc=1 · [vite:build-html] Failed to resolve …
```
Con `.css` es aún más claro: `background: url("$PWD/assets/generated/anim/archer/idle.png")`
compila con rc=0 y Vite **copia el PNG a `dist/`** (`idle-Cqz85v-m.png`, 59 kB),
o sea que resolvió la ruta absoluta contra el disco.

Lo que esperaba quien lee el criterio 17: que un fichero que una máquina lee con
la ruta de esta máquina dentro ponga el guardia rojo. `index.html` es la entrada
de Vite; no lo lee solo una persona.

**Coste de cerrarlo: dos líneas** —quitar `'.css'` y `'.html'` de la lista— y
**cero falsos positivos hoy**: comprobado que ninguno de los dos ficheros del
repo contiene la ruta. Es lo único que yo arreglaría antes de commitear.

### B · menor — Un byte cero en el primer kilobyte hace que el guardia salte el fichero EN SILENCIO

`esTextoDeMaquina` declara su falso positivo («un binario raro sin ceros al
principio se leería como texto») pero no el fallo del otro lado, que es el que
importa: **un fichero de texto con un cero temprano se descarta sin decir nada**,
que es justo la clase de fallo por la que se invirtió la lista.

```bash
printf '{ "out": "%s/dist/x.js" }\n' "$PWD" | iconv -f UTF-8 -t UTF-16LE > sonda.json
npx vitest run test/invariantes.test.ts     # verde
```
La segunda forma es peor porque no necesita una codificación rara: basta un cero
en la cabecera y la ruta más abajo (`sonda-p.toml` de la tabla).

Añado un matiz de precisión: el comentario dice «la misma heurística que usa
git», y no lo es — git mira los **primeros 8000 bytes**, aquí son 1024. La
diferencia cae del lado seguro (leer como texto algo que git llama binario), pero
la frase promete una equivalencia que no hay.

### C · menor — Un fichero ilegible pone el guardia rojo por algo que no es el código

```bash
printf 'x\n' > sonda.json && chmod 000 sonda.json
npx vitest run test/invariantes.test.ts
# × ningún fichero que una máquina lee… → EACCES: permission denied, open '…/sonda.json'
# Tests  1 failed | 8 passed (9)
```
Es mucho mejor que el ENOENT de la primera vuelta —muere **un** guardia, no los
nueve, y el mensaje nombra el fichero—, pero un fichero de root montado dentro
del repo pondría `pnpm verify` en rojo sin que nadie haya tocado el código, que
es el argumento con el que se sacó `pnpm qa` de `verify`.

### D · menor — La lista negra distingue mayúsculas

`README.MD` se mira y `README.md` no: `extname` devuelve `.MD`, que no está en la
lista. Sale por el lado bueno (falso positivo visible) y se cierra con un
`toLowerCase()`.

---

## Observaciones, que no son hallazgos

- **A · El parche sigue llevando la ruta; lo que cambió es que no viaja.**
  `06-rutas-absolutas.patch` conserva **13** apariciones de `/home/al/code/heroes`
  y ahora es invisible para el guardia porque `.gitignore` lo aparta. La decisión
  es defendible —ese fichero no llega a otra máquina— pero conviene decirla como
  es: la excepción por carpeta que el guardia se niega a tener **existe, una capa
  más abajo**. Si mañana alguien guarda un parche fuera de `commits/`, el guardia
  sí lo cazará, que es el comportamiento bueno.
- **B · El consejo de salida se dispara por la URL, no por el error.** La
  condición es «`?seed` está en la URL», no «`parseSeed` ha lanzado». Si el
  arranque fallara por otra cosa con `?seed=777` puesto, se le diría a la persona
  que quite la semilla, que no arreglaría nada. Es estrecho y el comentario del
  código dice justo lo contrario de lo que hace la condición.
- **C · Los nueve parches siguen reconstruyendo el árbol.** Lo comprobé porque
  esta vuelta tocó `core`, el cliente y el fichero de invariantes: extraje `HEAD`
  a un directorio limpio, apliqué los nueve en orden (**los nueve aplican
  limpios**) y comparé con el árbol de trabajo: **250 ficheros, ninguna
  diferencia** salvo lo que ignora git (`.env`, `tools/gen/.cache`, `spend.json`,
  `tsconfig.tsbuildinfo`, `.claude/settings.local.json`). Los parches están
  regenerados con los arreglos de esta vuelta dentro (`parseSeed(texto: string |
  null | undefined): number | null` está en el 07; la lista negra, en el 06).
- **D · La crónica sigue contando lo del rival** («Construido: Morada de nivel 2»,
  «Reclutados 6 × Zombi» en una partida de caballeros). Es #59/#18, ya dicho en la
  primera vuelta.

## El juego se sigue jugando

Partida entera con `?seed=778` en `pnpm dev` + Chrome, que es donde han caído
`parseSeed`, el cliente y el fichero de invariantes:

entrar al castillo · construir la Casa consistorial (8000 → 5500 oro, ingresos
500 → **1000/día**) · pulsar otra vez y recibir el rechazo escrito para la
persona («no se puede construir Palacio municipal: ya se ha construido hoy en
este pueblo») · reclutar los 12 campesinos disponibles (5500 → 5260, ejército 22
→ 34) · volver a pulsar con **0 disponibles** y que no pase nada, con los dos
botones apagados · atacar un Zombi ×10 · **lanzar Flecha mágica** (maná 20 → 17,
«20 de daño», el zombi baja a 9 y **el stack que lanzó sigue activo**, que es el
contrato) · resolver sola (ejército 43 → 36, experiencia 60, **maná 11/20 de
vuelta en el mapa**) · pasar turno y ver jugar a la IA de reglas · derrota el día
3 · «Partida nueva».

**Consola limpia:** tres mensajes en toda la partida, `[vite] connecting`,
`[vite] connected` y `[assets] 139 imágenes generadas cargadas`. Ni un error.

Y lo que no se ve pero se rompería igual: `pnpm qa` rc=0 tres veces,
`barrido-semillas` en `sin terminar: 0/40 → []` (3,89 s), `pnpm lint` 63 ficheros
sin arreglos, `pnpm build` rc=0.

## Workarounds usados

| Workaround | Veredicto |
|---|---|
| Copié el repo a `…/ruta con (paréntesis)/` con `node_modules` enlazado | Única forma de ver el arreglo del hallazgo 3. Fuera del repo, borrada al terminar |
| Extraje `HEAD` a dos directorios temporales (para los parches y para la medida base) | Lectura pura, fuera del repo, borrados |
| Planté 20 sondas dentro del repo y toqué `index.html` y `style.css` para el hallazgo A | Restaurados desde copia y comprobado: `git status` en las mismas **77** entradas y el mismo `git diff --stat` que al empezar |
| Arranqué el servidor seis veces con distintos `HEROES_SEED` | Es la única forma de medir qué semilla usa de verdad. Puertos comprobados libres antes y después |
| `javascript_tool` devolvió a veces el DOM anterior justo después de un clic | Artefacto de la herramienta, ya visto en la primera vuelta: **crucé cada lectura con una captura**, y donde discrepaban mandó la captura |
| El hook `Stop` dejó guardada la huella de un árbol con una sonda dentro | Se corrige solo: la próxima vez que corra, ejecutará `pnpm verify` una vez de más (6 s) y guardará la buena |

## No probado

| Qué | Por qué |
|---|---|
| **Que `/mcp` liste `heroes` con la ruta relativa** | Sigue pendiente y **no lo doy ni por bueno ni por malo**: no puedo reiniciar Claude Code. Lo medido en la primera vuelta sigue valiendo: `npx tsx src/server/mcp/server.ts` arranca desde la raíz del repo y no desde otro cwd |
| **El workflow de CI en un runner** | Nadie lo ha corrido todavía |
| **`tools/gen/animate.ts` ejecutado** | Cuesta dinero; el presupuesto es 0 € |
| **Los criterios 1-4, 6-11, 18-20, 22-23 en profundidad** | Este encargo era estrecho a propósito. De ellos volví a correr las órdenes (`lint`, `build`, `qa`, `barrido`) y todas salen 0, pero **no repetí sus roturas a mano** |

## Veredicto de la segunda vuelta

**APTO.**

Los nueve hallazgos están cerrados y **los nueve los he visto cerrados yo**, no
leídos: los ocho ficheros que se colaban caen, la huella del hook despierta en los
dos casos donde no despertaba —comparada en paralelo contra el código viejo—, el
guardia corre por fin en un checkout con paréntesis, y la semilla vacía significa
lo mismo en el navegador y en el servidor, medido por el mapa que sale y no por el
código que lo escribe. El rojo de la primera vuelta (17c) deja de existir: con la
frontera reescrita y la lista invertida, no queda ningún fichero de máquina con la
ruta dentro y el guardia muerde en las nueve clases que se le escapaban.

No se ha roto nada: la partida con `?seed=778` llega a la misma derrota del día 3
que en la primera vuelta, `?seed=777` da el mismo héroe y el mismo ejército, y el
ciclo entero no se distingue de `HEAD` cuando se cronometran a la vez.

Las reservas que quedan son cuatro hallazgos menores sobre el guardia, ninguno de
los cuales afecta a quien juega. El único que recomiendo tocar antes de commitear
es el **A**: quitar `.css` y `.html` de la lista cuesta dos líneas, no da un solo
falso positivo hoy y cierra la única puerta por la que hoy entraría una ruta
absoluta en un fichero que Vite lee. **B**, **C** y **D** pueden esperar a que
alguien pase por ahí.

Y sigue en pie lo único que no puedo tocar: **que el usuario compruebe `/mcp`**.
