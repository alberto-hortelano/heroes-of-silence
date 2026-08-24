# Requisitos — higiene: linter, CI y QA de verdad

## Petición literal

El usuario eligió el racimo entre cuatro opciones ofrecidas. Su elección, tal cual:

> **Higiene: linter, CI y QA de verdad (#43 #44 #53 #45 #58)**
>
> No hay linter ni formateador ni CI; `pnpm verify` no incluye el QA del agente; la
> semilla del navegador no se puede fijar, lo que bloquea cualquier QA jugado. Menos
> vistoso, pero es lo que evita que los guardias de los tres últimos ciclos se
> erosionen sin que nadie se entere.

Y antes, sobre cómo trabajar:

> «El ciclo de roles deberia ser por defecto, solo saltarse algun rol si claramente
> no hace falta o saltarselo entero si es algo muy sencillo»

Los cinco issues van enteros; sus cuerpos están en GitHub (`gh issue view 43 44 53 45 58`).

## Contexto que no está en los issues

Lo he verificado yo antes de escribir esto, o lo han verificado dos exploraciones
de código. Cada dato lleva de dónde sale.

**El repo.** 61 ficheros `.ts`, 14 886 líneas. `pnpm verify` = `typecheck && test`,
**199 tests, ~6 s medidos** (typecheck 1,9 + test 4,1). `CLAUDE.md:308` dice 3 s y está
obsoleto: corregirlo entra en el criterio 6. El margen hasta el tope del criterio 5 es
de menos de 4 s, no de 7. Repo público (`alberto-hortelano/heroes-of-silence`), rama
`main`, GitHub Actions habilitado y gratis. No existe `.github/`. `package.json` no
tiene campo `packageManager`; aquí corre pnpm 10.28.1 y Node v24.11.1.

**El bucle rápido es un guardia, no una costumbre.** El hook `Stop`
(`.claude/hooks/verde.sh`) ejecuta `pnpm verify` antes de dejar dar una tarea por
terminada. Cualquier cosa que lo vuelva lento o frágil convierte al guardia en un
peaje, y un guardia que estorba se desactiva.

**Estilo actual, medido.** 201 líneas pasan de 100 caracteres y 24 de 120. Las más
largas están en `tools/gen/prompts.ts` (244) y en literales de plantilla HTML de
`src/client/views/panels.ts` (225), que un formateador **no puede** partir. El
estilo de hecho es: 2 espacios, comillas simples, punto y coma, coma final.

**Presupuesto fal.ai de este ciclo: 0 €.** Van gastados 3,74 $
(`tools/gen/spend.json`, que es un libro de cuentas y no se edita a mano).

### #44 — lo que el arnés hace y lo que no

`tools/qa/verify-agent.ts` (240 líneas) levanta el servidor y el puente MCP, juega
hasta 6 turnos y sale 0 al llegar el fin de partida. **Comprueba**: que las cuatro
tools obligatorias están publicadas (`heroes_listen`, `heroes_respond`, `game_state`,
`creature_stats`, L106-111); que `creature_stats` de `paladin` contiene «Paladín»
(L114-120); que cada escucha trae `kind:` y un bloque `ESTADO:` que parsea; que
`heroes_respond` no devuelve `isError`; y que el fin de partida nombra ganador.

**No comprueba**, verificado:

1. **El bloque de veredictos.** El servidor le pega `CÓMO FUE LO ANTERIOR:` con
   marcas `✓`/`⚠` (la cabecera en `src/server/notas.ts:286`, los signos en
   `src/server/mcp/veredictos.ts:42`) y el arnés **nunca lo mira**: solo
   busca `kind:` y `ESTADO:`. Cuatro de cuatro acciones descartadas sale igual de
   verde. Ya estaba anotado en `docs/agents/2026-08-24-el-agente-defiende-y-responde/qa.md:39`.
2. **Que las acciones se apliquen.** No llama a `game_state` ni a `battle_state`
   nunca; no compara estado antes y después.
3. **Las tools de consulta.** `game_state` solo se comprueba que aparezca en
   `listTools()`; `battle_state`, `spell_list` y `building_list` no se tocan en
   absoluto (`src/server/mcp/server.ts:285-325`, siete tools publicadas).
4. **El agujero del `default`.** `decidir()` devuelve `{}` para cualquier kind que no
   sea `adventure_turn` o `battle_turn` (L232-233). Un `{}` no valida contra ningún
   esquema, así que zod lo rechazaría en el servidor — y el arnés lo contaría como
   turno bueno, porque `heroes_respond` no da `isError` en ese caso.

Dato para el crítico: de los cuatro `REQUEST_KINDS`
(`src/core/contract/agent.ts:114-119`) el arnés solo ejercita dos, y uno por
accidente — `battle_turn` depende de que su política tonta se tropiece con una
batalla (0 decisiones en un ciclo, 12 en otro). **`map_generate` y `hero_banter` no
los emite nadie en `src/`**, y eso es exactamente #27 y #28, que están abiertos.

**`pnpm qa` tarda 5,4 s**, no un minuto: medido tres veces (5,46 · 5,44 · 5,44). Desde
que el agente defiende, pierde y la partida termina el día 3, así que `TURNOS = 6` no
se alcanza nunca y la cobertura real son **2 turnos de aventura y 13 decisiones de
batalla**. `CLAUDE.md:311` («~1 min») está obsoleto y el criterio 6 lo corrige. Esto es
peor de lo que dice el issue, no mejor.

Puertos fijos: `AGENT_PORT = 9881` y `SPECTATOR_PORT = 9880`
(`src/server/protocol.ts:8,10`), los dos se abren siempre.

### #45 — el atlas

`assets/generated/anim/<criatura>/atlas.json` lo escribe solo
`tools/gen/animate.ts:272-288`, y su `meta.image` es una ruta absoluta con el `$HOME`
y el usuario de esta máquina. Confirmado en los doce.

Dos hechos que el issue no dice y cambian el problema:

- **No lo lee nadie.** Cero lectores en ejecución y cero en tests. El cliente carga
  `anim/index.json` y los PNG por pose (`src/client/render/assets.ts:73-105`); nunca
  abre `atlas.json`. Su único uso es un `existsSync` para construir el índice
  (`animate.ts:294`). O sea que **es el mismo patrón que #58**: algo declarado que ya
  no lee nadie.
- **Poner la ruta relativa no arregla el problema real.** La caché está en
  `.gitignore`, así que en otra máquina el fichero no está, diga la ruta lo que diga.
  Rehacer el recorte desde lo versionado es imposible: los PNG por pose ya pasaron
  por `trim()` y `resize(256,256)` (`animate.ts:261-265`), que destruye el fondo gris
  y la resolución original. Versionar los doce atlas crudos costaría **17,2 MB**, con
  `.git` hoy en 13 MB.

### #53 — la semilla

`src/client/main.ts:45` y `:354` construyen `new Session(Date.now() % 100000)`. El
issue propone pintarla «en la barra de estado», pero `#status` se reescribe **cada
fotograma** desde `session.status` (`main.ts:156`), que es la línea de mensajes del
juego: ahí duraría hasta el primer movimiento del ratón. La barra superior
(`src/client/index.html:11-15`, con `#day`, `#resources`, `#turn`) sí es estable.

### #58 — `Player.name`

Quedan dos escrituras y ningún lector que la enseñe: `createGame` la copia
(`src/core/state/game.ts:204`) y `ws-server.ts:67` la manda a la vista de espectador
— que **no la mira nadie**, que es #30 y #32. Ningún panel ni renderizador la pinta.

## Criterios de aceptación

### #43 — linter, formateador y CI

1. Existe un workflow en `.github/workflows/` que corre en `push` y en `pull_request`
   sobre `main` y ejecuta, como mínimo, `typecheck`, `test` y `build`.
2. **El workflow no gasta dinero**: no invoca `pnpm gen`, ni `tools/gen/animate.ts`,
   ni nada que lea `FAL_KEY`, y no declara ningún secreto.
3. Existe `pnpm lint` y **sale verde sobre el código de hoy**, sin arreglos
   pendientes. Una regla que obligara a tocar medio repo se apaga y se anota por qué.
   **Y se encienden `noUnusedLocals` y `noUnusedParameters` en `tsconfig.json`**: hoy
   sacan **seis** declaraciones muertas que `pnpm verify` no ve —`render/battle.ts:9`,
   `session.ts:23`, `battle/battle.ts:38`, `serialize.ts:13`, `game.test.ts:10`,
   `gen/cli.ts:20`—, cuestan dos líneas y cero dependencias, y es independiente de qué
   herramienta se elija. No sustituye al linter y **no** habría cazado #58.
4. Existe una comprobación de formato en CI, y `pnpm format` para arreglarlo. Si el
   formateador reordena ficheros existentes, ese reformateo va en **un commit aparte**
   que no mezcla lógica, para que el diff se pueda leer.
5. **El bucle rápido sigue siendo rápido**: `pnpm verify` por debajo de 10 s. Hoy
   son **6,1**, así que el margen para el linter es de menos de 4 s.
6. `CLAUDE.md` dice cómo se lanza cada cosa y cuánto tarda, en su tabla de control de
   calidad.

### #44 — que el QA del agente verifique de verdad

7. El arnés **lee el bloque de veredictos** y lo informa: cuántas acciones entraron y
   cuántas se descartaron, con el motivo. Hoy no lo mira. Hoy salen **14 veredictos, 14
   `✓`, 0 `⚠`**, así que el contador nace diciendo «0 descartadas»: su valor es detectar
   una regresión, no descubrir nada. Coste que hay que asumir o evitar **diciendo cuál
   de las dos**: leer el bloque acopla el arnés a una prosa que `notas.ts` puede
   reescribir, y una reescritura pondría el QA en rojo sin que se rompa nada.
8. Falla ruidosamente si **una respuesta entera** fue rechazada, o si en toda la
   partida no entró **ni una sola** acción: eso es el circuito roto, no una decisión
   mala de una política tonta.
9. Comprueba que lo que pide **se aplica**: con `game_state` antes y después, al menos
   un cambio concreto (el edificio aparece en `buildings`, o el héroe cambió de
   casilla).
10. Ejercita las tools de consulta que hoy no toca —`game_state`, `battle_state`
    durante una batalla, `spell_list`, `building_list`— y comprueba algo de su
    **contenido**, no solo que no den error.
11. El `default: return {}` deja de existir: un kind que el arnés no sabe atender
    **falla**, en vez de mandar un objeto vacío que zod rechaza y contarlo como bueno.
    Aviso: esa rama es **inalcanzable** hoy —nadie emite un tercer kind—, así que no se
    puede ver morder por el circuito, solo con un kind inventado a mano. No vale darla
    por vista con una pasada verde.
12. Sigue saliendo 0 en el camino feliz y **sigue tardando menos de 15 s**. El
    «alrededor de un minuto» del enunciado original era falso y haría que QA reportara
    una regresión que no existe.

### #53 — semilla fijable y visible

13. `?seed=N` en la URL fija la semilla de la partida. Sin el parámetro, aleatoria
    como hoy.
14. La semilla se ve **siempre**, en un sitio que no se sobreescriba con los mensajes
    del juego.
15. Reiniciar la partida enseña la semilla nueva.
16. Dos cargas con la misma `?seed=` dan la misma partida: mismo mapa y mismos héroes.

### #45 — ninguna ruta de esta máquina en un fichero versionado

17. Ningún **fichero que una máquina ejecuta o lee** contiene una ruta absoluta de
    esta máquina. **Con un guardia que lo compruebe**, y visto morder. El guardia
    tiene **dos presas hoy**: los doce `atlas.json` —donde es inofensivo— y
    **`.mcp.json:6`**, que además **sí se lee**: es lo que enchufa el MCP `heroes`,
    así que en otra máquina el agente no arranca. Ese es el daño que #45 le
    atribuía al atlas.

    **La frontera es esa y no «cualquier byte versionado»**, y se corrige aquí
    porque el criterio se redactó antes de saber dónde estaba: los documentos de
    este mismo ciclo —`requisitos.md`, `critica.md`, `qa.md`— citan la ruta absoluta
    para EXPLICAR el fallo, y un `.md` lo lee una persona, que sabe que esa ruta es
    de otra máquina. Lo que hace daño es el fichero del que depende una máquina.

    De ahí la forma del guardia: **lista negra**, no blanca. Se mira todo el repo y
    se excluye lo que lee una persona (`.md`, `.txt`), la cara del cliente
    (`.css`, `.html`, donde una ruta es una URL del navegador) y los binarios; una
    lista blanca de extensiones falla **en silencio** ante la clase que nadie
    previó —se le colaban `.js`, `.mjs`, `.cjs`, `.tsx`, `.toml`, `.envrc` y los
    ejecutables sin extensión—, y una negra falla al revés: da un falso positivo,
    que se ve. El guardia declara además su límite: ve **su** ruta, la del checkout
    donde corre, no la de otra máquina, porque es la única que puede derivar.
18. Lo que se decida sobre el re-recorte —versionar el crudo, aceptar que hay que
    repagar, o quitar el metadato— queda escrito donde se escribe el atlas, y en
    `CLAUDE.md` si cambia el trato con `tools/gen/`.

### #58 — nada declarado y muerto

19. `Player.name` o desaparece de `Player`, `GameConfig` y `setup.ts`, o gana un
    lector de verdad que lo enseñe.
20. `pnpm verify` verde después, sin tipos huérfanos ni campos que nadie rellena.

### Transversales

21. `pnpm verify` verde al terminar. Los guardias nuevos, **vistos morder**: se rompen
    a mano, se miran rojos y se arreglan, como manda `CLAUDE.md`.
22. `pnpm qa` sigue saliendo 0.
23. `npx tsx tools/qa/barrido-semillas.ts` sigue en **0/40**. Desde 87b68a2 la línea
    base es cero: una sola semilla que no termine es una regresión.

## Fuera de alcance

Se dice para que nadie lo amplíe por su cuenta:

- **La pantalla**: #18 (la crónica no cuenta nada), #54, #12, #17. Si #58 se resuelve
  «dándole un uso» a `Player.name`, eso es diseño de #18 y **no se hace aquí**.
- **El agente y el espectador**: #27 (`map_generate`), #28 (`hero_banter`), #30, #32,
  #33 (la consulta `map` no tiene tool MCP), #34. El criterio 10 cubre las tools que
  **ya existen**; crear una nueva es #33.
- **#59**, la fuga de la crónica al agente, abierto hoy.
- **Arte**: no se genera nada. Cero llamadas a fal.ai, cero euros. No se tocan
  `data/`, `assets/` ni `tools/gen/spend.json`.
- **Rendimiento**: #48 y #55 no entran.

## Preguntas abiertas, con su suposición por defecto

1. **¿Qué herramienta de linter y formateador?** Por defecto **una sola que haga las
   dos cosas** (tipo Biome): una dependencia, un fichero de configuración y
   milisegundos, que es lo que pide un repo cuyo control de calidad es
   «deliberadamente ligero». ESLint + Prettier es lo estándar pero son dos
   herramientas y un orden de magnitud más lentas. **Lo decide el arquitecto**, con el
   criterio 5 como límite duro.
2. **¿`pnpm verify` debe incluir `pnpm qa`? RESUELTA POR EL CRÍTICO: no.** Y mi motivo
   era falso —`qa` tarda 5,4 s, no un minuto—. El correcto es más fuerte: `qa` abre los
   puertos fijos 9880/9881 y **sale 1 con `EADDRINUSE` si `pnpm server` está
   levantado**, que es la forma documentada de jugar con el agente. El hook `Stop` se
   pondría rojo por tener el juego abierto: un guardia que se pone rojo por algo que no
   es el código se desactiva. Además 6,1 + 5,4 = 11,5 s rompe el tope del criterio 5.
   Su sitio es CI.
3. **¿Se versionan los 16,4 MiB de atlas crudos? RESUELTA: no.** Y ahora por un motivo
   que no depende del gusto: **#37** («nueve criaturas mejoradas sin atlas») está
   abierto, así que versionar hoy compromete otros ~12 MB después — ~29 MB de atlas
   contra 13 MB de historia.
4. **#58: ¿borrar o dar uso?** Por defecto **borrar**, porque darle uso es diseño de
   #18 y lo haría a medias.
5. **¿CI ejecuta `pnpm qa`? Sí.** El job aparte es buena higiene, pero **no hace falta
   por los puertos**: cada job de GitHub Actions corre en su propia máquina.

---

## Decisiones del usuario tras la crítica

Este bloque **manda sobre lo de arriba**: se escribió después de leer `critica.md`.

1. **`.mcp.json` entra en el alcance.** El guardia del criterio 17 tiene que morder
   ahí: la línea 6 lleva `/home/al/code/heroes/src/server/mcp/server.ts`, versionada y
   **leída**, y en otra máquina el agente no arranca. Se cambia a ruta relativa y **se
   comprueba que el MCP `heroes` sigue arrancando** antes de darlo por hecho: si se
   rompe, el usuario se queda sin servidor hasta que haga `/mcp`.

2. **La herramienta es Biome**, lint y formato en uno. Motivos, en orden: una sola
   dependencia y un fichero de configuración; milisegundos, que es lo único que cabe en
   el margen de menos de 4 s del criterio 5; y encaja con un control de calidad
   «deliberadamente ligero». Se acepta a sabiendas que sus reglas de tipos son menos
   profundas que las de typescript-eslint — que es justo donde `tsconfig.json` ya cubre.

3. Sigue en pie que el reformateo del código existente va en **un commit aparte** que no
   mezcla lógica (criterio 4).

## Lo que decide el arquitecto, y tiene que justificar

- **El acoplamiento del criterio 7.** Leer el bloque de veredictos acopla el arnés a una
  prosa que `notas.ts` puede reescribir, y una reescritura pondría el QA en rojo sin que
  se rompa nada. O se asume el acoplamiento, o se ata a algo más estable — pero hay que
  **decir cuál de las dos y por qué**, no dejarlo implícito.
- **Qué se hace exactamente con `atlas.json`**: quitar solo `meta.image`, sustituirlo por
  algo independiente de la máquina, o borrar el fichero entero. Ojo: `animate.ts:294`
  construye `index.json` con un `existsSync` de ese fichero, así que borrarlo sin más
  rompe el índice.
- **Dónde se pinta la semilla** (criterio 14), sabiendo que `#status` se reescribe cada
  fotograma.

## Decisión del usuario sobre el plan

4. **Los doce `atlas.json` se borran**, y `index.json` se deriva de los PNG de pose.
   El usuario da el arte por bueno: si algún día quiere otro recorte, regenerará con
   prompts mejores en vez de re-recortar aquello. Los ficheros quedan en el historial
   de git. Es la opción 3 del §3(B) del plan.
