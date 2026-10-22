# Hallazgos de /simplify — complejidad del combate (consolidados, con la decisión tomada)

Cuatro revisores (reutilización, simplificación, eficiencia, altura) sobre `git diff HEAD` y los ficheros
nuevos. Deduplicados aquí; la decisión de cada uno es del coordinador. Aplica los de «Aplicar» en el orden
dado; los de «Descartados» no se tocan.

## Aplicar

### Comportamiento visible (primero)
1. **El parte nombra el efecto de un fusionado con su parte suelta.** `rueda.ts:347,356` pone
   `fuente: 'defensivo'` / `'romperGuardia'`; con la rueda de 3, la persona elige «Rápido» y el parte dice
   «Romper guardia sobre X»; con la de 5, «Defensivo» por «Defensivo-finta». Arreglo: el origen del efecto
   (`StackEffect.source`) es el `TipoDeGolpe` jugado y se nombra con `nombreEnLaRueda(tipo, forma de la
   batalla)`, en el núcleo, en `panels.ts:1068` y en el parte. Junto a eso, `efectoDeLaRueda` deja de
   devolver un solo efecto con un `if` que corta en la defensa: devuelve la lista de efectos sacada de
   `EfectoDelTipo` (la defensa y lo que quita al rival, los que haya), sin cadenas fijas. Test: con la
   rueda de 3, el parte de un «Rápido» que quita ataque dice «Rápido».

### Un hecho, un sitio
2. **La forma de una batalla se busca a mano (`RUEDAS[x.rueda]`) en ~17 sitios** (`battle.ts:1188, 2420,
   2647, 3427`, `ai/rueda.ts:73`, `serialize.ts:509, 798, 866, 953, 955`, `director.ts:565, 697, 705, 713`,
   `session.ts:2815`, `panels.ts:1341`, `capturas.ts`), y el cliente tiene su `formaDe(battle)`. Arreglo:
   una sola lectura en el núcleo, `formaDeLaBatalla(state)` en `formas-de-la-rueda.ts`; se quita
   `formaDe` del cliente. Amplía el guardia de `invariantes.test.ts` para que nadie fuera de
   `formas-de-la-rueda.ts` indexe `RUEDAS[` con una variable (verlo morder).
3. **Tres tablas de nombres de los golpes** (`NOMBRE_DE_GOLPE` en `cifras-de-la-rueda.ts:65`,
   `RUEDAS[*].nombres` y un `NOMBRE_DE_GOLPE` local en `tools/qa/capturas.ts:179`). Arreglo: un solo
   `NOMBRE_DE_GOLPE: Record<TipoDeGolpe, string>` con los diez, en `formas-de-la-rueda.ts` (que
   `cifras-de-la-rueda.ts` reexporta); cada forma guarda solo lo que renombra (la de 3: «Ofensivo»,
   «Defensivo», «Rápido»), y `nombreEnLaRueda` lee la común. El cliente nombra siempre con
   `nombreEnLaRueda`.
4. **«La rueda de 7 es la de referencia» se decide en cuatro sitios** (`data.ts:66` `GOLPES_DE_LA_MEDIDA`,
   `nivel.ts:171`, `disco.ts` `RUEDA_DE_LA_FICHA`, `capturas.ts:173`). Arreglo: exporta
   `RUEDA_DE_REFERENCIA` desde `formas-de-la-rueda.ts` y que los cuatro lo lean; `pesosDeLaRueda` deja de
   ser `Partial` (la validación ya exige los siete) y se va el `?? 0` de `nivel.ts:172`. El guardia admite
   `RUEDA_DE_REFERENCIA` solo en la ficha de una pieza.
5. **Los golpes del Rápido se cuentan por dos caminos** (`golpesDelTipo` con `GOLPES_DEL_RAPIDO` y
   `EfectoDelTipo.golpes` con `c.rapido.golpes`). Arreglo: queda `golpesDelTipo` (no depende del arma) y
   se quita `golpes` de `EfectoDelTipo`; las frases lo leen de `golpesDelTipo`.
6. **«Lo neutral nace en el tope» está escrito de cuatro maneras** (`alTope` en las guarniciones,
   `gruposAlTope` dos veces y un bucle a mano `o.count = tope` en `game.ts:683` que **muta el
   `config.map` que recibe `createGame`**). Arreglo: una función en `combate.ts` que recorta todo lo
   neutral de una configuración y devuelve una copia, sin tocar la entrada; la llaman `createGame` y el
   nacimiento de asaltantes (`asaltantes.ts:654`). El banco con 7/7 tiene que dar el mismo sha.
7. **La complejidad en la URL vive en tres módulos**: escribe `combateALaURL` (`inicio/combate.ts`) y, otra
   vez, `abrePartida` y `soloHeroeALaBarra` (`main.ts:146-178`); lee `main.ts`; la pareja
   `{ tope ?? …, rueda ?? … }` se compone a mano en `main.ts:244`, `entorno.ts:143` y
   `views/combate.ts:88,93` (allí los `??` sobran). Arreglo: en el núcleo, `combateCon(tope | null,
   rueda | null)`; en el cliente, un par `combateDeLaURL` / `combateALaURL` (que incluye `solo-heroe`) en
   un módulo pequeño junto a `semilla.ts`, que no importe nada pesado; lo usan `main.ts` (también en el
   `case 'solo-rueda-del-heroe'`) y el menú de inicio. Se borra `inicio/combate.ts` (choca menos con la
   otra sesión). `combateDelEntorno` devuelve `COMBATE_COMPLETO` en vez de `undefined` (se va el
   `| undefined` del director).
8. **`parseTope` y `parseRueda` son copia una de otra y `combateBlocker` repite sus frases**
   (`combate.ts:43-75`). Arreglo: un parser común `deLaLista(texto, valen, queEs)` y una sola frase por
   campo, que leen los dos parsers y el blocker.
9. **Dos copias del enumerador** (`enLista` en `combate.ts:78` y `TOPES_EN_PROSA` en `agent.ts:73`, que
   además lee `LIDERAZGO.topesPorBando` en vez de `TOPES_DE_TROPA`). Arreglo: `enumerar` de
   `core/types.ts:24` gana la conjunción (`'y'` / `'o'`) y la usan los dos.
10. **Cómo se cruzan los tipos se cuenta en tres sitios** (`CRUCES_EN_PROSA` en `agent.ts:61` con «la de 7» y
    «las de 3 y 5» fijos, «"feint" (o "defensive_feint")» fijo en `agent.ts:649`, y `comoSeCruzan` en el
    cliente), y **la prosa de las ruedas** (`RUEDAS_EN_PROSA`, `agent.ts:52-59`) rehace `ruedaAlAgente`.
    Arreglo: un `DICHO_DEL_CRUCE: Record<cruce, …>` junto a `FormaDeLaRueda`; la prosa del agente y la guía
    de la persona se derivan de `RUEDAS`, `PARTES` y `ruedaAlAgente` (qué ruedas cruzan cómo, quién lleva
    Finta), sin números ni ids escritos a mano.
11. **La validación de «no es un golpe de la rueda de N» está escrita en cinco sitios.** Arreglo: todo pasa
    por `tipoDeGolpeBlocker(x, forma)` con `forma` **obligatoria** (se van las ramas sin forma);
    `golpeDelHit` (`vocabulario.ts:127-133`) lo usa y monta la lista de hits solo en la rama del error;
    `serialize.ts:866, 955` usan `hitsDeLaRueda`; `esDeLaRueda` en vez de `golpesDeLaRueda(f).includes`;
    `session.ts:2816` se queda en `const m = tipoDeGolpeBlocker(tipo, forma); if (m) throw …`.
    `puntoDelCruce` valida con el `indexOf` que ya calcula, sin el array `[golpe, respuesta]`.
12. **`golpesDeLaRueda` memoriza en un `Map` con un camino de reserva que nunca se usa**
    (`formas-de-la-rueda.ts:122-133`). Arreglo: un campo `golpes` en cada forma, construido al declarar
    `RUEDAS`; se van el `Map` y `sinRecordar` (y `FormaDeLaRueda.tipos`, si solo repite la clave).
13. **La caché de `efectoDelTipo` (`WeakMap` → `Map`, `cifras-de-la-rueda.ts:405-452`)** guarda una pasada
    de dos partes con sumas enteras. Arreglo: cálculo directo, sin caché (las cifras por arma ya están
    memorizadas en `cifrasDeLosNiveles`).
14. **Exportaciones muertas**: los reexports de `aMedias`, `esFusionado` y `esTiposDeLaRueda` en `rueda.ts`,
    y `TipoFusionado` (`types.ts:305`). Fuera.
15. **La casilla «Solo la rueda del héroe» tiene dos marcados** (`views/combate.ts:68` sin explicación,
    `panels.ts:247` con un `title=`). Arreglo: una función que la pinta con su explicación por `nota()`
    (`panels.ts`), con el `data-*` como parámetro; sin `title=`. `EleccionDelCombate.soloHeroe:
    boolean | null` pasa a un parámetro opcional aparte.
16. **El valor por defecto de la arena se pone dos veces** (`core/arena.ts:947`, `session.ts:2399`) porque
    `MontajeDeArena.combate` es opcional. Arreglo: obligatorio (el enlace ya lo exige); la arena pregunta
    el tope al núcleo (`cambiarElCombate`, `caben()` → `combate.tope` y el blocker del núcleo), sin repetir
    la comprobación en el cliente.
17. **`tipoDeLaTecla` (`client/rueda/rueda.ts:169`) es cuadrático.** Arreglo: `golpes[Number(tecla) - 1] ??
    null` para un solo dígito.
18. **El encendido del sector en `rueda.css:345-356` va tipo a tipo** (20 selectores). Arreglo si sale
    limpio: un encendido genérico (un `data-encendido` que pone la rueda, o el `<path>` en el grupo de su
    botón). Si no sale en poco, déjalo y dilo en `implementacion.md`.

## Descartados (con motivo)
- **`entorno.ts` importa `../core/combate.js`** (altura 1, «rompe H5»): falso en parte. `vite.config.ts`
  ya importaba `src/core/data.js` en HEAD (línea 6), así que `data.ts` ya se validaba al cargar la
  configuración. Y `CLAUDE.md` pide que las variables de entorno pasen todas por el mismo parser
  (`entorno.ts`). Se queda. Que `vite.config.ts` cargue el núcleo es anterior a esta tarea.
- **La Finta a medias con un booleano `mitad`** (altura 8): es una forma distinta (la mitad de lo que deja
  andar, decisión del usuario), no la mitad de una cifra; un divisor no la haría más clara.
- **`ruedaAlAgente` construido en cada petición**, **`pasosQueQuedan` con toda Finta** y **`notaDe` dos veces
  por sector**: asignaciones despreciables (el último, anterior al diff).
- **`previsionDeLaRueda().porTipo` como `Partial`**: es correcto, solo trae los tipos de la rueda de la
  batalla.

## Al terminar
`pnpm banco` con el mismo sha (`b9dbd8a1…`), `pnpm verify` en verde, el barrido con 3/3 y 5/5 sin
partidas sin terminar, `pnpm qa` y una mirada en el navegador a la rueda de 3 con un efecto en el parte.
`verify:lento` y `capturas` ya corrieron: repítelos solo si el cambio toca el escenógrafo o lo que
capturan (la rueda y la arena sí lo tocan: corre `pnpm capturas` una vez). Añade a `implementacion.md`
una sección «Vuelta de /simplify».
