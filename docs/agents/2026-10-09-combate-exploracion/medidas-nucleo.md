# El combate desde el núcleo: medidas y revisión

Rama `combate` en `eab467d`, 09-10-2026. Solo lectura: no se ha tocado código de
producción y el banco no se mueve.

## Cómo se ha medido

`medir-combate.mts` (en esta carpeta) juega las semillas 1-100 con el mismo bucle
que `partidaDeSemilla` (`newGame({ seed, maxDays: 300 })`, `createRng(seed)`,
`playAiTurn`) y un `takeover` que **solo mira**: guarda la vida y las casillas de
salida, llama a `resolvePendingBattle(state, ctx)` —lo mismo que hace el respaldo
en `turn.ts:262`, con la misma rng— y lee `battle.log`. No cambia una tirada.

```bash
npx tsx docs/agents/2026-10-09-combate-exploracion/medir-combate.mts 1 100   # ~20 s
```

Población: IA de reglas contra IA de reglas, mapa por defecto (34×34). **100
partidas, 832 días, 726 batallas, 0 sin terminar.** Ninguna llega a
`MAX_ROUNDS` ni al agotamiento.

## 1. Cifras (semillas 1-100, 09-10-2026)

### Duración y desenlace

| | |
|---|---|
| Rondas por batalla | media **3,15**, p50 3, p90 5, máx 13 |
| Histograma | 1: 11 · 2: 242 · 3: 262 · 4: 115 · 5: 63 · 6+: 33 |
| Tipos | héroe→ciudad 524 (72 %), héroe→héroe 176 (24 %), héroe→monstruo 26 (4 %), emboscadas 0 |
| Stacks en el tablero | media 10,7, máx 14 |
| **Gana el atacante** | **672 de 726 (92,6 %)**; héroe→ciudad 522/524, héroe→héroe 127/176 |
| Ganador **sin una baja** | **401 (55 %)** |
| Aplastante (0 bajas y < 10 % de PV perdidos) | 185 (25,5 %) |
| Reñida (el ganador pierde ≥ 50 % de sus PV) | **58 (8 %)** |
| PV perdidos por el ganador | p50 14 %, p90 44 % |
| Rendiciones | 20 (2,8 %), todas héroe→héroe |

**Cómo acaba héroe→héroe (176):** comandante muerto con su tropa en pie **132
(75 %)**, comandante y todo 24, rendición 20. Es decir, la batalla entre héroes se
decide casi siempre matando al héroe, como decía #115 (allí 70 %, otra
población).

### Qué hace cada unidad

| | |
|---|---|
| Golpes cuerpo a cuerpo (sin represalia) | 5 264 |
| Represalias | 2 616 |
| Disparos | 3 837 (más 19 salpicados) |
| **Disparos a más de 5 casillas (mitad de daño)** | **3 537 de 3 837 (92 %)** |
| Tiradores que acaban sin flechas | **0 de 1 637** |
| Golpes cuerpo a cuerpo de un tirador (sin penalización) | 471 |
| `wait` | 2 083 (todos de no tiradores); tras esperar: mueve 1 556, golpea 96 |
| **`defend`** | **22 en 726 batallas** |
| Cargas cobradas | 43 (25 de 3, 16 de 4, 2 de 5) en 123 caballerías |
| Moral buena / mala | 347 / 66 |
| **Suerte buena / mala** | **0 / 17** (toda la suerte de salida es 0; la mala es la momia) |
| Hechizos | **1 107, todos `magic_arrow`**; 624 (56 %) al héroe rival |
| Héroes en el tablero | 902, todos con Poder 1; libro de 1 hechizo 601, de 3 256, de 5 45 |

### El héroe en el tablero

En 902 apariciones el héroe **se mueve 1 861 veces, golpea 1 355** (con 2-4 de
daño), recibe 2 440 golpes cuerpo a cuerpo (con represalias), 1 126 disparos y
624 Flechas. **Muere en 161** (18 %); 156 de ellas en héroe→héroe, el 89 % de esas 176
batallas. Atacarle es lo que la IA hace bien (`threat` le da el valor del
bando entero, `tactics.ts:59`): 1 702 de 5 264 golpes cuerpo a cuerpo (32 %) y
1 126 de 3 837 disparos (29 %) van a él. **Protegerle no lo hace nunca.**

### Rasgos y unidades

| Rasgo | Activaciones en 726 batallas |
|---|---|
| `charge` | 43 |
| `flying` | 329 movimientos |
| `no_retaliation` | 226 golpes |
| `curse_on_hit` | 343 maldiciones (2 rebotan en no-muertos) |
| `double_shot` | 50 disparos (solo 14 guardabosques) |
| `splash_shot` | 19 salpicados, 4 a los suyos |
| `undead` (inmunidad) | 2 |
| **`double_attack`, `life_drain`, `bane_undead`, `fear`** | **0** |

Unidades (en batalla / actúan / mueren): arquero 1 614/1 604/668, campesino
1 409/1 365/1 348, zombi 1 149/996/384, esqueleto 1 090/1 073/930, momia
413/411/89, espadachín 319/319/8, piquero 221/187/86, maestro espadachín 200,
vampiro 194, caballería 123, piquero veterano 51, momia real 42, zombi mutante
26, guardabosques 14, liche 9, campeón 7.
**Nunca salen: paladín, cruzado, señor vampiro, liche de poder, dragón óseo**
(los niveles 6 y las mejoras de 4-5). Por eso cuatro rasgos están a 0: no es el
motor, es que la partida no llega (8,3 días de media) a sus moradas.

Lo que dicen las cifras juntas: **el combate se decide antes de empezar**. La
estrategia solo ataca con `ventajaClara` (1,6×), así que gana el atacante el
93 %, y la mitad de las veces sin una baja. Dentro de la batalla casi todo es
avanzar y pegar: 3 rondas, una sola herramienta mágica, sin defensa, sin suerte,
sin escasez de flechas.

## 2. Revisión del código

### Divergencias con fheroes2 no declaradas

Contrastado con `battle/battle_troop.cpp` y `battle_arena.cpp` de fheroes2
`9754feff` (el mismo commit que ya citan `battle.ts:150-183`).

1. **Fórmula de ataque y defensa** (`damage.ts:2-18`, `damageMultiplier`). El
   docstring dice «Fórmula de daño de HoMM2»; no lo es. fheroes2
   (`CalculateDamageUnit`, L579-584): `dmg *= 1 + (r > 0 ? 0.1·min(r, 20) :
   0.05·max(r, −16))`, o sea +10 %/punto hasta ×3,0 y **−5 %/punto hasta ×0,2**.
   Aquí +10 % hasta **×4,0** (`MAX_ATTACK_BONUS = 3.0` se suma a 1) y **−2,5 %
   hasta ×0,3**, que es la de HoMM3. La defensa vale la mitad que en el
   original. Sin cita, sin «regla nuestra».
2. **Penalización por distancia del tirador** (`damage.ts:121`, `distance > 5 →
   ×0,5`). fheroes2 no tiene ninguna por distancia: solo la de la muralla del
   castillo (`IsShootingPenalty`). Con el despliegue en las columnas 0-2 y 8-10
   la distancia de salida es ≥ 6, así que **el 92 % de los disparos van a mitad
   de daño**. Es la regla de combate con más efecto de todas y no está en la
   tabla de reglas.
3. **El tirador cuerpo a cuerpo no se penaliza.** fheroes2 parte su daño por dos
   cuando está pegado (`isHandFighting`, L541-543). Aquí pega entero (471 golpes
   en la medida). Con (2) es el mundo al revés: disparar de lejos castiga y
   pelear pegado no.
4. **Bendición y Maldición son ±1 de suerte** (`data/spells.json`, `spells.ts:126`).
   En fheroes2 Bendición da daño máximo y Maldición mínimo (`GetDamage`, L598-602).
   Con `CHANCE_PER_POINT = 1/24`, una Bendición sube el daño esperado un ~4 %:
   por eso la IA no la lanza nunca (0 en 726 batallas) y no la lanzaría con
   ningún umbral razonable.
5. **Moral baja: 1/24 por punto** (`battle.ts:776`). fheroes2 tira 1d12 para la
   baja (`SetRandomMorale`, L305-313; y a la IA le perdona 1 de cada 4). La
   buena sí es 1/24.
6. **`defend` (+20 % de defensa, `damage.ts:18`) no existe en fheroes2**: allí
   `SKIP` cierra el turno sin bono (ya lo cita `battle.ts:921`). Es regla
   nuestra sin declarar en la tabla. Y tras un `SKIP` fheroes2 no da moral extra
   (`battle_arena.cpp:537`, `!Modes(TR_SKIP)`); aquí `defend` llama a `endTurn`,
   que sí puede darla (`battle.ts:821-838`).

Ya declaradas y sin cambios: #200 (Prisa a media ronda, `AllTroopsAreTheSame`),
la carga, el turno en tramos, esperar, `fear`.

### Reglas a medias y fallos menores

- **Un disparo con mala suerte no se anota** (`battle.ts:1371`): `shoot` solo
  escribe `luck` si `result.lucky`; `strike` escribe las dos (L1318-1319). El
  daño sí se parte; el parte de guerra y el agente no se enteran. Hoy lo dispara
  solo la maldición de la momia sobre un tirador.
- **Dos reglas de agotamiento que no coinciden**: `finishByExhaustion`
  (`battle.ts:753`) gana quien tiene más **individuos** y el empate es del
  **defensor**; `autoResolve` (`tactics.ts:794-801`) gana quien tiene más **PV**
  y el empate es del **atacante**. Un hecho, dos sitios. 0 casos en la medida
  (latente).
- **La salpicadura del liche** (`battle.ts:1411`) reparte el daño ya calculado
  contra el objetivo, sin la defensa de cada salpicado, y puede matar al héroe
  propio (4 golpes a los suyos en la medida). La IA lo evita al elegir a quién
  (`tactics.ts:674`) pero no si todos los objetivos salpican.
- **`healFromDrain`** (`battle.ts:1351`) no resucita (el original sí): irrelevante
  con individuos de `count: 1`, y el señor vampiro no sale nunca.
- **Los temporales duran 1 ronda** (`spells.ts:91` con Poder 1, #201): caducan en
  el `beginRound` siguiente. Las 13 `effect_end` de la medida son todas de
  maldiciones de momia.
- **Las flechas no se acaban nunca**: 12 por arquero en batallas de 3 rondas.
  `shots` es un dato muerto en la práctica.

### Código muerto o generalidad sin uso

- **#7, `hasWalls`** (`town/town.ts:108`): sigue sin un solo llamante. Construir
  `castle` no cambia ninguna batalla. Además, 72 % de las batallas son contra
  ciudades: el asedio es donde más combate hay y no existe.
- **#119, `count`**: 37 líneas de `battle/` y `tactics.ts` lo leen y en partida
  vale siempre 1 (`troopsAsStacks`). `amenazaPropia`, `expectedDamage`,
  `applyDamage`, `healFromDrain`, `finishByExhaustion` lo arrastran.
- **#15**: `luck` y `leadership` se leen (`hero.ts:205-210`) pero nadie los
  aprende; la suerte de salida es 0 en las 6 881 unidades medidas. `wisdom` sí se
  lee ya (`maxSpellLevel`, `hero.ts:214`): el issue está desfasado en eso.
- **#3**: `lightning_bolt` y `cure` (nivel 3) siguen inalcanzables; con la
  Flecha como único daño mágico, la magia es un único botón.

### La IA de batalla (`ai/tactics.ts`)

Cascada de `decideAccion` (L635-757): rendirse → hechizo → disparar → pegar a quien
alcanza → acercarse/cargar (o esperar) → `defend`. Lo que no hace:

1. **No guarda al comandante** (#115). El héroe es un stack más: avanza hacia
   `aQuienIr` y pega con 2-4 de daño (1 355 golpes). Su muerte decide el 89 % de
   los héroe→héroe. No hay una sola regla que diga «el héroe se queda detrás»,
   ni que tape sus casillas vecinas, ni que no le acerque a un tirador enemigo.
2. **No protege a sus tiradores ni bloquea a los del rival**. `bestTarget`
   (L70) solo mira `threat / PV`; el 1,6 del tirador (L41) es todo lo que pesa.
   20 % de los golpes cuerpo a cuerpo van a tiradores, pero por valor, no por
   plan; nadie se planta delante de un arquero propio.
3. **`defend` casi muerto** (22 en 726). Se midió en #80 y no entró
   (49,43 %); con la regla de distancia actual, un arquero que no alcanza nada
   útil a mitad de daño quizá debería esperar o defender, y no se ha medido.
4. **El tirador no mira la distancia**: `bestTarget` no sabe que a > 5 pega la
   mitad; elegir al cercano o esperar a que se acerque no entra en la cuenta.
5. **Esperar sirve para acercarse, no para pegar**: de 2 083 esperas, 1 556
   acaban en un `move` y 96 en un golpe. Esperar compra que el rival se acerque,
   que es lo que se buscaba, pero no se ha medido si después el golpe llega.
6. **Hechizos**: una sola Flecha por ronda al de más `threat` (casi siempre el
   héroe). Correcto con lo que hay; lo pobre es el libro (#201, #3, #26).
7. **Tres escalas de fuerza** (#115, #129): `threat` (táctica), `pesoDelBando`
   (rendición, `tactics.ts:555`), `unitPower`/`ventajaClara` (estrategia,
   `ai/fuerza.ts`), y `unitPower` sin ataque ni defensa.

## 3. Contexto de los issues

| # | Estado medido hoy |
|---|---|
| #7 | `hasWalls` muerto; 72 % de las batallas son a ciudades, sin asedio. |
| #116 | La persona no juega sus defensas en el navegador; no medido aquí (es de cliente). |
| #200 | Siguen como dice. Se suman las 6 divergencias de arriba, más gordas. |
| #201 | Confirmado: 902 héroes, todos Poder 1; 0 temporales lanzados; 1 107 Flechas. |
| #103 | Todas las batallas de la medida son de `autoResolve`: ninguna daría fotograma al espectador. |
| #119 | `count` sigue en todo el motor; siempre 1 en partida. |
| #129 | `unitPower` sin ataque/defensa: con la defensa a mitad de valor (divergencia 1) el error es menor de lo que sería con la del original. |
| #115 | Comandante: 75 % de héroe→héroe acaba con el héroe muerto y su tropa en pie. Segundo héroe y escalas, sin cambios. |
| #67 | El guardia de rasgos es textual, y **4 de 11 rasgos no se sienten ni una vez** en 100 partidas porque sus criaturas no salen. |
| #15 | `luck`/`leadership` sin forma de aprenderse; `wisdom` ya se lee. |
| #26 | 7 hechizos; en la práctica 1. |
| #3 | Sin gremio 3-5: Rayo y Curación inalcanzables. |

## 4. Mejoras candidatas, por prioridad

| # | Mejora | Coste | ¿Banco? |
|---|---|---|---|
| 1 | **La IA guarda al comandante**: el héroe no avanza ni golpea salvo que remate o esté pegado; se queda detrás y, si hace falta, `defend`. Medir con `enfrentamiento.ts --magia` (que trae héroe) y el barrido. Es lo que más decide hoy (89 % de los finales héroe→héroe). | medio | sí |
| 2 | **Decidir la regla del tirador**: copiar fheroes2 (sin penalización por distancia, mitad pegado) o declarar la actual como nuestra. Hoy el 92 % de los disparos van a la mitad sin que nadie lo haya decidido. Cambiar cifras del motor mueve todo; luego re-medir la IA. | pequeño (regla) + medio (medir) | sí |
| 3 | **Fórmula de ataque/defensa y moral baja**: copiar la de fheroes2 (−5 %/punto hasta ×0,2; tope ×3,0; moral baja 1/12) o declararlas; quitar «de HoMM2» del docstring si no se copian. Un cambio de cifras con la cita extraída. | pequeño | sí |
| 4 | **Bendición/Maldición como daño máximo/mínimo** (como fheroes2) y temporales que duren algo (#201: Poder por nivel, o mínimo 2 rondas). Sin eso la mitad del libro es decorado. | medio | sí |
| 5 | **Fallos pequeños del motor**: anotar la mala suerte del disparo (`battle.ts:1371`) y una sola regla de agotamiento (`finishByExhaustion` y `autoResolve`). El primero no mueve el volcado salvo por el log de batalla (no está en la crónica); el segundo es latente. | pequeño | no (verificar con `pnpm banco`) |
| 6 | **Guardia de rasgos que muerda (#67)** con una escena por rasgo; y una medida de partida larga (o arena) que haga salir paladín, cruzado, señor vampiro, liche de poder y dragón, que hoy nunca pisan el tablero. | medio | no |
| 7 | **La IA cubre a sus tiradores / ataca a los del rival por plan** (una casilla de bloqueo delante del arquero propio; preferir enemigos tiradores cuando se llega). Medir con la vara de siempre. | medio | sí |
| 8 | **Asedio mínimo (#7)**: que `castle` dé algo en la batalla (muralla = penalización al disparo de fheroes2, torre que dispara). El 72 % de las batallas son a ciudades. | grande | sí |

Orden sugerido: 2 y 3 primero (son decisiones de regla, baratas, y cambian el
suelo sobre el que se mide la IA), luego 1 medido sobre el suelo nuevo, y 5 en
cualquier momento.
