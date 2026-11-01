# Hallazgos de /simplify (01-11-2026)

Cuatro revisores (reutilización R, simplificación S, eficiencia E, altitud A) sobre `git diff HEAD`.
Deduplicados y con la decisión tomada. Los aplica un ingeniero nuevo; nada de esto cambia lo que
se ve ni el sha de `pnpm banco`, salvo lo que se dice en H3.

## Se aplican

**H1. Una sola cuenta del golpe previsto** (R1, S6, S7, E2, A1). `unGolpe` no es la única: el
bucle de `porTipo` de `previsionDeLaRueda` repite a mano `horquillaDeDanio` → `golpesDe` →
`danioSinLaCarga`. Además, `unGolpe` rehace `opcionesDeDanio` en cada una de las hasta 35
llamadas.
- `unGolpe` recibe las opciones ya hechas (la base de `opcionesDeDanio(state, a, t, extra)` una
  vez, y el sector o el punto encima con `conElGolpe`), y la usan los tres: `previsionDeGolpe`,
  `porTipo` y `elGolpeQueViene`.
- `golpesDe` se calcula una vez por tipo.
- Fuera la memoria `contados`: con las opciones hechas no compensa.
- El trío `{ danio, golpes, siguientes }` lleva un tipo con nombre, que extienden
  `SectorDeLaRueda`, `porGolpe` y lo que devuelve `unGolpe`, y que lee `conSusGolpes`. Así no se
  declara cuatro veces.

**H2. El agente no paga el golpe que viene** (E1, A3). `serializeBattleResponse` llama a
`previsionDeLaRueda(…, 'respuesta')` y no lee `golpeQueViene`. Se calcula solo para quien lo pinta:
un parámetro, o una función exportada aparte que llame la sesión. La forma la elige el ingeniero,
y el contrato del agente no cambia.

**H3. El total del intercambio con la misma composición que la previsión del golpe** (A2).
`entero` (`danio + (golpes−1)·siguientes`) es una cuarta forma de sumar, aparte de
`previsionDeGolpe.tras`, que para cuando el objetivo cae, como la regla real. El total sale de
una sola función junto a `tras`. Si eso topa el total en la vida del objetivo, mejor: es lo que
se cobra. Se dice en `implementacion.md` si cambia alguna cifra de los tests.

**H4. La carga del cruce y su contraataque, de un solo recorrido; la carga, de un solo
constructor** (S1, R4, A6, R3, S2, A7).
- `cargaDelCruce` y `contraataqueDelCruce` comparten un recorrido privado del tramo del cruce
  (dónde para, el `throw`). Basta una función, por ejemplo `golpesDelCruce(log, i)`, de la que
  salgan las dos.
- La carga cobrada se monta en un solo sitio del núcleo, `cargaDeLaRueda(casillas, unit)` en
  `core/battle/carga.ts`, junto a su tipo `CargaDeLaRueda`, que se muda allí. La usan
  `previsionDeLaRueda` y la carga del cruce, que devuelve ya `CargaDeLaRueda | null`.
- El cliente no llama a `cargaMontada` para montarla.

**H5. Firmas que crecen solo para llevar datos** (S2, S3).
- `renderDesenlace` deriva del registro el contraataque y la carga, y recibe el cruce con su foto.
- `contrincante` recibe ya hecho el `Html` de sus modificadores (`modificadoresEnCurso`), y
  `LoDeLosDos` desaparece.

**H6. La foto del animador sin parámetro de relleno** (S9, A4, S5, S4, R5).
- `pasoDeAccion` vuelve a no recibir foto. La añade `traducir` en su `case 'cruce'`, que es quien
  la tiene, y se va `SIN_FOTO`.
- Se exportan `fotoDeEfectos`, que la usen los tests en vez de copiarla, y un tipo `CruceEnCurso`
  para el retorno de `cruceEnCurso()`, que usan `dialogo.ts` y `escenas/batalla.ts`.

**H7. La vista previa de la arena dice los efectos con la pastilla** (R7, A9). La fila
«Efectos» de `vistaPrevia` (`arena/paneles.ts`) usa `modificadoresEnCurso`, o se quita si la
cabecera ya lo dice justo encima. Lo decide el ingeniero mirándolo.

**H8. Menores.**
- `etiquetaDe`: tres ramas explícitas, no el `join('; tú, ')` (S11).
- `notaDe`, una vez por sector (E3).
- `modificadoresEnPantalla`: una llamada a `pastilla` (S12).
- `dichoCortoDeLaCarga` y `dichoDeLaCarga` comparten lo que suma (R8).
- `formaDeLaBatalla` fuera del `.map` de `listaDelCampo` (E5).
- `data-signo`, de la cifra y no del texto (A8, en parte).
- CSS: sin `:has()`. `listaDelCampo` pone una clase en la fila con efectos (E6, A10), y fuera las
  reglas sin efecto (S13), comprobándolo en el navegador y con `tools/qa/neutro.ts`.
- Tests: el cortador de «En el campo» y el montaje del desenlace, a `test/helpers.ts` (S14, R10).

## Se descartan a conciencia

- **Los efectos en el hecho `cruce` del registro** (A5, la D3 del plan). Daría la foto exacta
  incluso con dos cruces en una lectura (el espectador por tandas). El revisor tiene razón en que
  no movería el sha del banco. Pero cambia el registro, el cable al espectador (`adaptar.ts`) y lo
  que se quita al agente (`hechoAlAgente`): es una ampliación del contrato, no una limpieza.
  **Va a un issue**, con el caso del espectador como motivo.
- **El texto de la pastilla de un efecto como el de una pieza** («+2 Ataque» y «−» tipográfico)
  (A8). El usuario aprobó el texto de `cifraDeEfecto`, y cambiarlo mueve el parte y el ancla de
  `paneles`. **Va al issue** de «velocidad» frente a «casillas», que ya era backlog.
- **El color de la pastilla por el criterio del parte** (bueno para quien lee) (R6). La pastilla
  dice si el efecto es bonificador o penalización para la unidad que lo lleva, que es lo que pidió
  el usuario. El parte habla a quien lee. Son dos preguntas distintas.
- **`efectos.get(id) ?? []` en vez de lanzar** (S10). Es el contrato fail-loud del proyecto: una
  foto sin uno de los dos es un fallo y se dice.
- **Abaratar la foto de cada `observe`** (`[]` compartido, guardar solo rondas) (E4): son
  microsegundos por jugada.
- **El test de las 49 parejas** (S14): es el más caro, pero es la garantía de que lo enseñado es lo
  cobrado en cada punto. Se queda.
- **Dos tests de integración de «En el campo»** (partida y arena) (S14): son dos llamantes
  distintos. Se quedan los dos, con el cortador compartido (H8).
