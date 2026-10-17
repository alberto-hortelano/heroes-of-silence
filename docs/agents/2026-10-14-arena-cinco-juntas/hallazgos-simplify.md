# Hallazgos de /simplify: las cinco tareas juntas (14-10-2026)

Cubre `git diff 1d89822f..HEAD`: las cinco tareas de la arena hechas en paralelo y juntadas por el coordinador.

| Issue | Tarea | Requisitos |
|---|---|---|
| #259 | salir del contacto | `docs/agents/2026-10-14-salir-del-contacto/` |
| #260 | carga para todos | `docs/agents/2026-10-14-carga-para-todos/` |
| #262 | armadura | `docs/agents/2026-10-14-armadura/` |
| #263 | anillo y efectos de la rueda | `docs/agents/2026-10-14-rueda-anillo-y-efectos/` |
| #258 y #261 | sectores y contrincantes de la rueda | `docs/agents/2026-10-14-rueda-sectores-y-contrincantes/` |

Hubo cuatro revisores: reutilización, simplificación, eficiencia y altitud. Los hallazgos están deduplicados y cada uno lleva la decisión del coordinador.

**Reglas para todo**:

- El juego no cambia: `pnpm banco` debe dar `066767b4…af995`.
- Los tests de cada tarea siguen mandando. Si uno cambia de cifras, se dice por qué.
- Ningún comportamiento de la arena cambia, **salvo D** (decisión del usuario) y **C** (un fallo).

## Decisiones del usuario tomadas en esta vuelta

- **Rápido cobra la carga solo en el primer golpe.** Hoy la cobran los dos, y ya pasaba antes de estas tareas.
- **Finta y contacto se quedan apilados**: el tramo de la Finta paga el contacto como cualquier paso. La nota de la Finta en la rueda **dice** que salir del contacto cuesta encima, cuando la regla del contacto está encendida.
- **Rápido contra armadura se queda así**: cada golpe resta la armadura. La nota de Rápido dice que pierde contra armadura. La previsión ya lo enseña.
- **La IA no se toca**: ni para la Finta ni para buscar la recta de la carga. No se abren issues por ahora.

## Se aplican

### A. Los modos de la arena, en una sola forma

Ahora son tres campos sueltos en `BattleState` (`modoDelGolpe`, `modoDelContacto`, `cargaAPie`). Además:

- `crearBatallaConReglas` lleva ocho parámetros posicionales;
- el contacto copia el golpe en unos 8 sitios: `contacto.ts:35-49` frente a `rueda.ts:340-352`, `renderContacto` frente a `renderGolpe`, y en `main.ts` la URL, la barra, el enlace y el clic;
- cada modo tiene su propio guardia en `invariantes.test.ts`.

Lo que se hace:

1. **Un solo campo**: `BattleState.arena: ModosDeArena`, con `{ golpe, contacto, cargaAPie }`, más `MODOS_DEL_JUEGO`, congelado como `REGLAS_DEL_JUEGO`. `conRueda`, `pagaElContacto` y la lectura de la carga a pie leen de ahí.
2. **La firma**: `crearBatallaConReglas(atacante, defensor, rng, reglas, opciones?: { muralla?, modos? })`. Se ajustan todas sus llamadas.
3. **Fuera `CARGA_A_PIE_EN_LA_ARENA`** y el parámetro de `batallaDeArena`. La arena pone `cargaAPie: true` en sus modos, y la prueba C4 pasa los suyos.
4. **Los interruptores de la URL y de la pantalla**: un descriptor por modo con el que se pueda conmutar (`{ parametro, modos, porDefecto, nombre, descripcion, rotulos }`).
   - En `core`, una lectura y una escritura genéricas de la URL.
   - Un solo `renderModo` en `paneles.ts`.
   - En `main.ts`, un bucle sobre `[GOLPE, CONTACTO]`.
   - La carga a pie no tiene interruptor y no entra en el bucle.
5. **Un solo guardia** «solo la arena enciende un modo», hecho con las puertas del de las reglas, con `conAlias` y con el filtro de imports.
   - Sustituye a los dos `it` del contacto y de la carga a pie, que no cubrían los alias.
   - Se le ve morder.
   - El permiso de la medida se pone una sola vez (ver J).

### B. La fase del turno, en un solo sitio

`fintaBlocker` está pegado a mano en 9 blockers, más `applyAction` y `legalActionsAndCosts`. `casillasDeCarga` repite la condición en línea. `golpeEnCurso` y `seHaMovido` son otras dos fases con su código propio.

Además hay un **fallo latente**: la firma del turno con que `applyAction` rechaza un `Movibles` viejo no incluye la Finta. Un `move` con el recorrido de antes de la Finta se acepta y anda 3 casillas. Hoy ningún llamante lo hace.

Lo que se hace:

- `faseDelTurno(state)` devuelve `libre`, `movido`, `plantado` o `trasLaFinta`.
- Un único `faseBlocker(state, tipo)` lo leen `applyAction`, la lista legal y el principio común de los `*Blocker`. `fintaBlocker` deja de exportarse o desaparece.
- `firmaDelTurno(turno)` incluye la Finta, y la leen `Movibles` y la clave de la sesión (`session.ts:~326`). Un test lo demuestra con el caso de arriba.
- **Las frases nombran la Finta** cuando es ella la que se comió las casillas: «tras la Finta le queda 1…». Lo dicen `contactoBlocker` y `movimientoBlocker`.

### C. La carga es el `Paso` que se anda (fallo con el contacto)

Hoy, con el contacto encendido, plantarse para cargar paga la recta (7) aunque el camino barato cueste 6. Con Escape (`soltarElGolpe`) queda con 0 casillas en vez de 1, y sin la carga. Además `carreraHasta` se calcula dos veces (en `cargaDesde` y en `moveTo`), y la IA desempata con el coste barato.

Lo que se hace:

- `cargaDesde` y `golpePreparado` devuelven el `Paso` de la carrera. `moveTo` lo consume.
- `golpeEnCurso` guarda la carrera y el coste barato. **Al soltar el golpe, lo gastado vuelve al coste barato**: Escape deja a la unidad donde llegó, con su turno y como si hubiera andado por el camino barato.
- Una sola cuenta de la carrera por tramo: los costes del paso se construyen una vez y se pasan (`carreraHasta` y `costesDelPaso`).
- **`mejorCarga` (la IA) desempata con el coste que pagará.** Es la única línea que se toca de la IA: lee el `Paso` nuevo, no cambia cómo decide.

### D. Rápido cobra la carga solo en el primer golpe

Es decisión del usuario. Se aplica en `melee` y en la previsión (`horquillaDeDanio`, `previsionDeLaRueda`, `expectedDamage`), y con `double_attack`, igual. Lleva un test con cifras: Rápido cargando, golpe 1 con carga y golpe 2 sin ella.

**El juego**: lo comprobó el coordinador. Ninguna criatura del catálogo tiene a la vez `charge` y `double_attack` (`cavalry` y `champion` solo cargan), así que el banco no debería moverse. **Si cambia, para y dilo.**

### E. El contacto se cuenta en un solo sitio

- `costeDeSalir` está muerto fuera de los tests.
- `enemigosEnContacto` cuenta sin el prefiltro.
- `costesDelPaso` vuelve a contar con su propio bucle.
- Los tests prueban la gemela que el motor no usa.

Lo que se hace:

- Una sola `enContactoEn(state, s, hex): number`, con el prefiltro de distancia dentro. La leen `costesDelPaso`, `contactoBlocker` y los tests.
- Fuera `costeDeSalir` y los tres nombres casi iguales (`costeDeSalir`, `CosteDeSalir`, `costeDeSalirCon`): queda uno.
- **`movimientoBlocker` no fabrica un estado** (`{ ...state, modoDelContacto: 'libre' }`, `battle.ts:~917`): recibe un parámetro de la búsqueda o llama a `reachable`.
- **`fraseDelContacto`** usa el plural de `quedanCasillas`, que se mueve a un módulo que pueda importar `contacto.ts`. Hoy dice «le queda 1» sin «casilla».
- Si es trivial: `costesDelPaso` crea `{ ...s, hex }` solo cuando algún enemigo pasa el prefiltro.

### F. La armadura

- **`expectedDamage`** pasa por `trasLaArmadura(x, defensor).danio`, no por su propio `Math.max` (`damage.ts:~571`).
- **Un solo nombre** de punta a punta para lo que paró la armadura. Hoy es `parado` en `Herida`, `TrasLaArmadura`, `SpellResult` y `anim.ts`, y `armadura` en el evento, con dos traducciones (`conLoParado` y `anim.ts`). Se escoge uno. Si cambia el evento, que el banco no se mueva: el campo solo se escribe cuando para algo.
- **La conversión de armadura a PV**, en un sitio: `pvDeLaArmadura(n)` y `armaduraDePV(pv)` junto a `PV_POR_PUNTO_DE_ARMADURA` (`hero/equipo.ts`). Hoy está en cuatro: `arena.ts:1056`, `:1608` y `:1651`, y `equipo.ts:479`.
- **`previsionDeLaRueda().armadura`** es un campo muerto: se quita. La rueda ya enseña el daño con la armadura restada, y la vista previa, la fila «Armadura».
- **`delEquipo`**: el `case 'armadura'` que añadió el coordinador al juntar no se llama, porque la fila la escribe `filasDelStack`. O la fila usa `delEquipo`, o el parámetro excluye `'armadura'`. Elige la forma limpia.

### G. La carga

- **Una sola regla de quién carga y cuánto**: `cargaDelStack`/`cifrasDeCarga`.
  - `pasoParaCargar` (`tactics.ts:~620`) la usa en vez de `hasTrait(charge)` + `CARGA.jinete`, solo para el jinete, como hoy.
  - `views/panels.ts:~1243` no rehace las cifras desde un booleano.
- **Del booleano a las cifras**: `cargaAPie` cruza seis capas como booleano. `opcionesDeDanio` resuelve una vez `carga: CifrasDeCarga | null`, `DamageResult` y `DeUnGolpe` las llevan, y el evento `attack` lleva lo que el parte necesita (`porciento`) en vez de `cargaAPie`. El banco no puede moverse: en el juego el campo nuevo no se escribe, o sale igual.
- **`CifrasDeCarga`**: fuera lo derivable (`porCasilla`, `aPie`) y los formateadores sobrantes. Quedan dos frases, una función cada una.
- **`CARGA_MINIMA`** se importa por un solo camino (`carga.ts`); se quita el reexport de `battle.ts`.
- **CLAUDE.md**: las filas «Carga» y «Quién carga y cuánto» se juntan en una.
- **Una sola clave para los tantos por ciento** de `data/carga.json` y `data/rueda.json`: `porcentaje`, con un lector común en `validar.ts`.

### H. Eficiencia (sin cambiar resultados)

- **`cargaDesde`**: primero lo barato y O(1) (`hexDistance ≥ CARGA_MINIMA` y el objetivo en `siguienteEnRecta`), después `cerradasPara`, `alAndar` y `rectaLibre`. Son predicados puros: el resultado es idéntico.
- **`casillasDeCarga`**:
  - por casilla, el único enemigo cargable es el que ocupa `siguienteEnRecta(s.hex, at)`;
  - reutiliza el `movableFrom` (`costs`) de `legalActionsAndCosts` en vez de repetirlo.
  - Medido por el revisor: de 110 a 11 ms en 100 peleas, con las mismas cargas.
- **`docs/agents/2026-10-14-carga-para-todos/implementacion.md`**: corregir la frase «la IA de la arena pasó de 144 a 253 ms». Lo medido es que la IA y `autoResolve` no cambian; lo que subía era `casillasDeCarga` dentro del script de medida.

### I. La rueda: nombres y restos

- **Cuándo vence un efecto**: un solo nombre de tipo, hoy `HastaElTurno['al']` y su alias `VenceLaRueda`. Una sola función de la duración, `duracion(vence, 'su' | 'tu')`, en lugar de `DURACION_DE_LA_RUEDA` y `DE_TU_TURNO`. El campo del evento `hastaSuTurno` pasa a llamarse `vence`.
- **`GolpeEnLaRueda.papel`** se deriva de `retaliation`; solo `previsionDeLaRueda` lo pasa explícito.
- **`efectoEnCurso`** (`views/panels.ts`): una sola llamada a `duracionDeEfecto`, no dos ramas.
- **Exports**: `PUNTOS` se exporta y el cliente lo usa en vez de `[0,1,2,3,4] as const`. `HaciaFuera` deja de exportarse.
- **La clase `en-${t}`** de `sitios` repite `data-sector`: fuera, y el CSS y el test van por `data-sector`.
- **Las notas** de Finta y Rápido llevan lo que deciden arriba los puntos 2 y 3 de las decisiones del usuario: con el contacto encendido, que salir del contacto cuesta encima; y que Rápido pierde contra armadura.

### J. Tests, capturas y medidas

- **Helpers de test**: `sesionDeArena(…, { golpe })` y `hastaLaRueda` en `test/helpers.ts`. Los usan `rueda.test.ts` y `rueda-contrincantes.test.ts`, en vez de sus copias.
- **`tools/qa/capturas.ts`**: un `ejecutarPauta(page, espejo, jugada)` compartido. `espejoDeContrincantes` y `hastaLaRuedaDeTres` pasan a ser la versión con `n` de las de «Yo contra Yo».
- **Las tres medidas IA contra IA**, en un solo `tools/qa/arena-ia.ts`, sobre `autoResolve` y `causaDelFinal`, con variantes (contacto, carga a pie y armadura) y el permiso de invariantes una sola vez. Son `tools/qa/contacto.ts`, `docs/agents/2026-10-14-carga-para-todos/medir-cargas.ts` y `docs/agents/2026-10-14-armadura/medida-armadura.mts`. Al cambiar el bucle, las cifras de «no terminan» pueden cambiar. Mídelo una vez (100 semillas) y apúntalo en `docs/historia.md` en lugar de las anteriores.

### K. Cliente

- **`figuraEnLienzo(figura, lado, tamaño)`** en `paneles.ts`, para las cuatro copias del `<canvas class="figura" …>`, incluida la de `rueda.ts`.
- **`.vista-previa`** comparte la base del bocadillo anclado de `.nota` (una clase `.bocadillo` en `style.css`).
  - **Cuidado**: `.nota` la usa también el juego. Comprueba con `pnpm capturas` que no cambia nada que se vea.
  - Si no sale limpio, se deja como está y se dice.

## Se descartan, con motivo

- **Un iterador común de la recta** para `carreraConCostes` y `rectaLibre`: ganancia pequeña y un riesgo sobre el banco (el tiro y la carga del juego pasan por `rectaLibre`).
- **`movimientoBlocker` con 3-4 recorridos**: solo corre al hacer clic (unos 30 µs).
- **Reutilizar arrays de módulo en `alcanceConCostes`**: impacto bajo, y la función dejaría de ser reentrante.
- **La IA en el tramo de la Finta y la IA que busca la recta**: es decisión del usuario; no se toca la IA, salvo la línea de C.

## Cómo se cierra

- `pnpm verify` una vez por tanda.
- Al final: `pnpm banco` (mismo hash), `pnpm verify:lento` y `pnpm capturas`, una vez cada uno.
- Cada guardia nuevo o cambiado se ve morder.
- `implementacion-simplify.md`, en esta carpeta, con lo hecho, lo que no y por qué.
- Un commit al final. El mensaje en español y con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
