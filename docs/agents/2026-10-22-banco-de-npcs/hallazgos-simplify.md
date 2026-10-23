# Hallazgos de /simplify — banco de NPC (22-10-2026)

Diff revisado: `7822ecfd..9f575a75` (código, sin assets ni docs/agents). Cuatro revisores: reutilización,
simplificación, eficiencia y altitud. Deduplicado y decidido por el coordinador. **Todo lo aceptado se aplica;
nada cambia el comportamiento** (mismas figuras elegidas, mismos atlas, `pnpm banco` igual).

**Restricción**: hay un trabajador del taller (`pnpm npcs trabajar`, grupo 738121, log
`.cache/taller/npcs-semilla.log`) pintando la semilla con el código de antes cargado en memoria. No se para, no
se toca `assets/npcs/` ni `tools/taller/cola/`. El formato de `atlas.json` y de los encargos en cola **no
cambia**: lo que ese trabajador escriba tiene que seguir valiendo con el código nuevo (y una figura a medias es
un estado legal). Tras el cambio, `pnpm npcs estado` tiene que leer la cola y el arte igual que antes.

## A. Altitud: «qué hojas y clips lleva una figura» en un solo sitio (aceptado, es lo principal)

La pregunta ya tenía respuesta única, `hojasDeFigura(dispara)` (`src/shared/arte.ts:246`). El diff añadió una
segunda respuesta para la gente en cada capa. Se amplía el mecanismo en vez de ramificar:

1. `src/shared/arte.ts`: `hojasDeFigura` (o una `hojasDeLasAcciones(acciones)` a su lado) responde también para
   las acciones de un NPC (`reposo-y-marcha` → `['a']`; `todas` → `['a','b']`). Una sola tabla acción → hojas →
   clips. Desaparecen `letrasDeNpc` (`tools/taller/npcs.ts:53`), `CLIPS_DE_GENTE` (`personajes.ts:359`) y
   `FILAS_DE_SOLO_REPOSO` (`derivar.ts`) como copias.
2. `tools/taller/derivar.ts`: `derivarAtlas` recibe las hojas esperadas y valida `filas === suma de sus clips`;
   fuera la bandera `soloReposo` y su rama. La tropa conserva el tipo con `attack` garantizado (tipar `clips`
   según la lista, o al menos no volver opcional `attack` para las unidades).
3. `tools/taller/juntar.ts` + `trabajador.ts` (orden `derivar`): una sola `derivacionDeLaCarpeta(dirN, raiz)`
   (en `tools/taller/npcs.ts` o junto a `derivacionDeUnidad`) que diga unidad o NPC, sus letras y su derivación;
   `juntar` y `derivar` la llaman sin ramas ni cuentas de `dirname` propias (hoy discrepan en la raíz).
4. `src/client/render/personajes.ts`: un solo validador de dirección, `comoDireccion8d(valor, nombre,
   imagenDeFila, clips)` con la lista de clips como parámetro (el cadáver solo si la lista lleva `death`), y un
   solo `figuraDe` y un solo mapa `CUERPOS` (fuera `GENTE`, `comoDireccionDeGente` y los campos muertos
   `imagenes`/`nombre` de `ArteDeGente`). `ArteDeFigura` dice qué clips lleva (generaliza `dispara`).
   **La regla «la gente no llega a una batalla» se conserva**: `arteDe` (el de la batalla) lanza con una figura
   sin los clips de pelea, diciéndolo; el guardia de `invariantes.test.ts` se adapta para que siga mordiendo
   (rómpelo a mano y míralo rojo). Fuera la lista blanca por prefijo `esCuerpoDeGente` en `arteParaPintar` si
   el clip se pregunta al arte (`arte.clips.has(clip)`), y los triples guardias (`infoDelClip`, `'cadaver' in
   atlas`): uno basta.
5. `tools/npcs/banco.ts` `estadoDeFigura`: reutiliza `arteEnOchoDirecciones` (`tools/taller/unidades.ts:1213`)
   y `direccionesDe` (`tools/arena/borrador.ts:74`) parametrizadas por carpeta; la existencia (`existsSync`) se
   separa de leer los JSON (que solo necesita lo que se sirve).

## B. Un hecho, un sitio (aceptado)

6. Ids de persona: `idDeEncargado(sitio)`, `idDeVecino(clave)` junto a `ID_DEL_ALCAIDE` (`core/town/voces.ts`),
   o `vecinosDeLaBase` derivada de `personasDeLaFaccion`; nadie más escribe `encargado-${s}`/`vecino-${k}`.
7. Peticiones de figuras: una sola `problemasDePeticiones(peticiones, banco, ruta)` en `core/npcs.ts` (forma,
   id libre, tope `FIGURAS_NUEVAS_POR_MUNDO`), que leen `juzgarFigurasPedidas` (`core/mundo/validar.ts`) y
   `aceptarPeticiones`/`aceptarElMundo` (`tools/npcs/banco.ts`). `escribirBanco` sigue pasando por `leerBanco`
   como puerta final; fuera las copias de las frases.
8. Etiquetas: un `etiquetaBlocker(clave, v)` exportado de `core/npcs.ts` sobre `deLaListaBlocker`
   (`core/validar.ts:146`) con el prefijo de qué es; lo leen `problemasDeEtiquetas` y `cargarGente`
   (`voces.ts:94-105`). Fuera el `deLaLista` local de `npcs.ts:181` (choca de nombre con el de `validar.ts`).
9. Id de figura: `idDeNpcBlocker` en `core/npcs.ts` (como `idDeMundoBlocker`), que leen `problemasDeFigura` y
   `validar.ts:512`; el encargo (`tools/taller/encargo.ts:144`) valida con `esIdDeNpc` (`refine`), no con otra
   regex.
10. Rutas: `RUTA_DEL_BANCO` en `core/npcs.ts` (como `RUTA_DEL_CATALOGO_DE_UNIDADES`), usada en sus mensajes y por
    `tools/` y `vite.config.ts`; una sola constante para `assets/npcs` (fuera `DIR_NPCS` o `DIR_DEL_ARTE`); la
    cola del taller, la `COLA` de `trabajador.ts`, no otra ruta escrita en `colaDelTaller`.
11. Leer y escribir JSON en tools: sacar `jsonDe` y `escribirAtomico` (y la regla de conservar el `_comment`) de
    `tools/arena/borrador.ts` a un módulo compartido de `tools/` y usarlos en `tools/npcs/banco.ts`.
12. `vite.config.ts`: el plugin `npcs()` y las hojas de `arena()` comparten un helper (lista memorizada, vigilar,
    olvidar, middleware JSON, `emitFile`); los avisos de «a medias» van a `server.config.logger.warn` en los dos.

## C. Eficiencia (aceptado)

13. `src/client/entrada.ts`: `cargarLaGente()` arranca como promesa al principio y se espera solo donde hace falta
    (antes de `leerMundo` y de `main`), en paralelo con el `import('./main.js')` y los fetch del mundo.
14. `climaDelLugar` (`session.ts:~1719`) no reconstruye la vista del lugar cada fotograma: lee solo
    `ante().lugar.at`, o se memoriza `vista()` por `version`/`apertura`; `this.gente()` una vez fuera del `map`.
15. `figurasDeLaGente` en la sesión: calculada una vez por facción (no depende de `version`).
16. `figurasParecidas`: los llamadores usan `[0]`; una `laMasParecida` de una pasada, sin ordenar ni arrays por
    figura (mismo orden de preferencia y mismo desempate: la elección no cambia; los tests lo prueban).
17. `tools/taller/npcs.ts:164-171`: `cola.estado()` una vez antes del bucle.
18. `vite.config.ts`: la caché de `/__npcs` se olvida solo con `atlas.json`/`atlas.webp` o `data/npcs.json`.
19. `tools/npcs/cli.ts`: el estado de cada figura una vez (un Map), y `carpetasSinFigura` sin releer el banco.

## D. Limpiezas menores (aceptado)

20. `BancoPintado` como único parámetro de `figurasParecidas`/`figuraQueSePinta`/`figurasDeLaGente` (o un tipo
    `{ figuras, pintadas }`); `BANCO_VACIO` dentro de `SIN_BANCO`.
21. Quitar `export` de lo que nadie usa fuera de `core/npcs.ts` (`CLAVES_DE_ETIQUETA`, `problemasDelBanco`,
    `LARGO_DE_DESCRIPCION`, `TALLA`, `BANCO_VACIO`, `Buscada` → `Pick<…>`, `Edad`/`Clase`), salvo los tests.
22. Borrar el guardia redundante `_faccionesConFrase` (`npcs.ts:103-105`): ya lo hace el `satisfies`.
23. `tools/npcs/cli.ts`: `figuraDelBanco` en vez de `.some/.find`; el prefijo de la cola con un helper sobre
    `PREFIJO_DE_NPC`; `bandera`, la de `tools/mundo/cli.ts` si se puede compartir sin más.
24. `encargoDeIdentidad`/`encargoDeGiro` (`tools/taller/npcs.ts:74-103`): una base común.
25. Condicionales: `gente.ts:59` → `if (!h?.direcciones) continue`; en `derivar.ts`, lo que quede tras el punto 2.
26. `personajes.ts`: fuera la reexportación de `cuerpo-de-gente.ts` (los tests importan de allí).
27. Tests: una figura de prueba y su raíz temporal compartidas en `test/helpers.ts` (`npcs.test.ts:246`,
    `taller-npcs.test.ts:54`).

## Descartado a conciencia

- **El 7.º parámetro posicional de `Session`** (`main.ts:133-141`): pasarlo a un objeto de opciones cambia una
  firma anterior a este diff y todos sus llamadores. Fuera de alcance; backlog.
- **`pnpm npcs trabajar` como doble capa sobre `pnpm taller trabajar --npcs`** (`lanzarElTaller`): es la orden que
  ve la persona y la que lanza el motor, la misma; el coste es un proceso de más. Se queda.
- **Identificar los encargos de NPC por el prefijo de id `npc-`** (`cola.ts`, `trabajar(soloNpc)`): frágil pero
  local, amplía mecanismos que ya existían. Se queda.
- **`cuerpoDe(gente, persona…)` común a `session.ts` y `lugar/sesion.ts`**: son dos llamadas; no compensa.
