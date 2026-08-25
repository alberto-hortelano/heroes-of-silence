# REENCUADRADA

El síntoma de #66 se reproduce clavado. De sus cuatro sospechosos manda el **2
(economía)**, con la corrección que cambia el arreglo: **no falta oro, falta
materia prima**. Y hay un quinto que #66 no enumera.

**El problema real, en una frase:** la cadena de moradas cuesta 30 de madera y
25 de mineral, y el mapa reparte 18 y 18 en el tiempo que dura la partida —
mientras el oro sobra por un factor de 20.

Medido sobre el commit `5514875`, 200 semillas de `playAiGame` (el mismo camino
que `barrido-semillas.ts`), instrumentando **solo `state.log`**, en un worktree
aparte ya retirado. Cero € de fal.ai, cero líneas de producción tocadas.

## La premisa de #66, afirmación por afirmación

| Lo que dice #66 | Verificación |
|---|---|
| 7 días de mediana (mín. 3, p90 8, máx. 22) | **Cierto, clavado.** 200/200 terminan |
| `dwelling_5` en 0 de 200, `dwelling_4` en 9 | **Cierto**: 0 y 10 |
| Media docena de criaturas no pisa el tablero | **Cierto**, y el corte es exacto: nivel ≥ 4 |
| «empiezan demasiado cerca» | Medio: se ven el día 3, pero también en un mapa del doble |
| «la economía va lenta (3000 de oro…)» | **El oro no es el límite** |
| «la IA prioriza atacar sobre construir» | **Falso.** Construye **todos** los días; no puede pagar |
| «la victoria es demasiado fácil» | 200/200 por conquista total, pero no es lo que bloquea |

Lo que nadie tenía medido:

- **Cómo terminan:** 200/200 por **conquista total** (perdedor sin pueblos ni
  héroes); no hay otra vía porque no existe. **Una** captura de pueblo por
  partida, y el día de esa captura *es* el final: 6 frente a 7.
- **Cuándo se encuentran:** primera batalla héroe-héroe el **día 3** (mín. 2,
  máx. 5). La distancia **no varía con la semilla**: siempre (3,3) y (20,20),
  2485 puntos de movimiento entre el inicio de p0 y el castillo de p1, con
  1100/día → **el mapa mide 2,26 días de ancho**; caminando los dos, 1,1.
- **El 89,5 % acaba antes del día 8**, o sea que **nunca hay una segunda hornada
  semanal**. Los ejércitos son los del día 1.
- **Oro:** el ganador termina con **4560 en caja**; el caballero se pasa la
  partida entre 4000 y 4600 sin gastarlo.
- **Material:** al día 7 tiene 3 de madera, 7 de mineral, 5 de cristal. La cadena
  `dwelling_2..5` pide 30, 25 y 5. Captura sus cuatro minas el **día 3** (84 % de
  las partidas para p0, 20–40 % para p1) y rinden 2/día.
- **Los montones sueltos no cuentan:** p0 recoge una **mediana de 0** unidades de
  cada material en toda la partida (media 0,5). La única fuente son las minas.
- **Qué construye:** día 1 `dwelling_2`, día 2 `dwelling_3`, en 200/200. Del día 3
  en adelante ya no hay madera: `town_hall` (192/200), `upgrade_3`, `upgrade_2`,
  `city_hall`. No deja de construir ni un día.

## Los cuatro sospechosos, medidos

Contrafácticas de 200 semillas sobre el mismo mapa 24×24 (12 y 60 donde se dice):

| Escenario | Duración | dw4 | dw5 | dw6 | Criaturas nivel ≥5 |
|---|---|---|---|---|---|
| **hoy** | 7 | 10/200 (d7) | **0/200** | 0 | 1/7 |
| **oro infinito** | 7 | 10/200 (d6) | **0/200** | 0 | **0/7** |
| **material infinito** | 29 | 200/200 (d3) | 169/200 (d6) | 129 | **7/7** |
| **oro + material infinitos** | **8** | 200/200 | **200/200** | 194 | **7/7** |
| IA que no gasta material fuera de la cadena | 7 | 35/200 | 2/200 | 0 | 1/7 |
| mapa 48×48 (12 semillas) | 28 | 12/12 (d6) | 12/12 (**d21**) | 0 | — |
| 2 pueblos neutrales (60 semillas) | 10 | 7/60 | 5/60 | 0 | 4/7 |

La fila que decide es la cuarta: **con material, la cadena entera se levanta y la
partida sigue durando 8 días.** El tiempo no es el problema; la segunda fila dice
que el oro tampoco. Los otros tres sospechosos, con la medida que los descarta:

- **1 (distancia): no es la causa, es una forma cara de comprar días.** En 48×48
  el contacto sigue siendo el día 4–5: **no se encuentran antes, se rematan
  antes**. Lo que da un mapa grande son 21 días de renta de mina — el mismo
  número que la partida en paz. Cuesta cuadruplicar `pnpm qa` para lo que el
  material resuelve el día 6.
- **3 (prioridad de la IA): real y pequeño.** Gasta 10 unidades de madera+mineral
  fuera de la cadena (`upgrade_2`, `upgrade_3`). Prohibírselo mueve dw4 de 10 a
  35 de 200 y dw5 de 0 a 2. Un 12 %.
- **4 (victoria): no es la causa.** Con material, la cadena se termina sin
  tocarla. Dos pueblos neutrales suben dw5 a 5/60: ayudan por la misma vía que la
  distancia, comprando días.

## El quinto sospechoso, que #66 no enumera

**No hay minas de gemas, mercurio ni azufre.** `generateMapPlan` solo coloca
`gold`, `wood`, `ore` y `crystal` (`src/core/map/generate.ts`, `recursosMina`).
Piden gemas `knight_dwelling_6` (10), `knight_upgrade_6` (20),
`necromancer_dwelling_5` (5), `_6` (15) y `_upgrade_5` (10); mercurio y azufre,
`mage_guild_2`. Única fuente: los montones, 9,6 unidades de gemas por mapa entre
los dos bandos, y la IA recoge 0. **Paladín, cruzado, dragón óseo y `mage_guild_2`
son inalcanzables dure lo que dure la partida**: 80 días sin que nadie ataque
dejan 2 gemas en caja, `mage_guild_2` en 2/30 y `upgrade_6` en 0/30.

De la misma familia, una **asimetría de facciones**: la cadena del nigromante
hasta la morada 5 pide **55 de mineral** (5+10+20+20) y 5 gemas; la del
caballero, 30 de madera + 25 de mineral. Los dos tienen una mina de cada, y 55
unidades a 2/día es el día 23 en el mejor caso.

## La prueba de capacidad (criterio 2)

En paz total —nadie ataca a nadie—, 24×24, 30 semillas, tope 80 días:

| | morada 4 | morada 5 | morada 6 |
|---|---|---|---|
| caballero | día 5 | **día 21** (29/30) | 1/30, día 44 |
| nigromante | día 29 (22/30) | día 41 (**6/30**) | 0/30 |

**El juego necesita 21 días para llegar a la morada 5 aunque no le moleste nadie.
Dura 7.** Al día 80, sin haber luchado: **161.874 de oro** sin gastar y 2 gemas.

## Contraste con fheroes2

Contra el código de `ihhub/fheroes2`, que es la reimplementación 1:1:

- **La renta es fiel, cifra a cifra.** `ProfitConditions::FromMine` (`profit.cpp`):
  oro 1000, madera 2, mineral 2, mercurio 1, azufre 1, cristal 1, gemas 1 — es
  exactamente `MINE_YIELD` (`src/core/state/game.ts:82`).
- **El coste no lo es, y aquí es más caro.** `buildinginfo.cpp`: la morada 5 del
  caballero son 3000 de oro **y 20 de madera, nada más**; aquí, 10 madera + 10
  mineral + **5 cristal**. En el original **los niveles 1–4 no piden un solo
  recurso raro en ninguna facción**; aquí el cristal muerde en el 5.
- **La cadena tampoco es lineal allí:** la morada 5 del nigromante depende del
  gremio de magia 1, no de la 4. Mínimo hasta el nivel 6: 5 días.

**Hueco declarado, no inventado:** cuántos días dura una partida típica de HoMM2
en un mapa pequeño **no se ha podido verificar** (los hilos de heroescommunity
que lo tratan están caídos; speedrun.com mide tiempo real). Y las minas por mapa
pequeño **no existen como dato**: HoMM2 no tiene generador aleatorio. El criterio
se queda en el relajado de `requisitos.md`: «lo bastante para que la cadena se
termine».

## Conflictos

- **#49 y #50 siguen sin sujeto** hasta que esto se arregle, como dice #66.
- **#60** (el arnés de QA cubre 2 turnos) es el mismo hecho por otra puerta.
- **#3 y la nota de Sabiduría en `CLAUDE.md`**: `mage_guild_2` tampoco existe en
  la práctica — 2 de 30 partidas, y solo en paz.
- **El barrido de semillas es el guardia que hay que vigilar.** Su línea base es
  0 sin terminar y **cualquier mejora de economía la roza**: minas ×3 da 0/200,
  pero moradas a mitad de precio dan **1/200**. Dos ejércitos que crecen a la par
  nunca alcanzan el margen de 1,05 de `chooseHeroDestination`.

## Coste contra valor, y el arreglo más barato

**No hacer nada** cuesta: la mitad del bestiario —arte generado incluido— sigue
sin jugarse, #49/#50/#60 no se pueden cerrar, y el banco de pruebas del agente
sigue midiendo **dos decisiones de mapa por partida**. Es el techo de lo que este
repo puede demostrar hoy.

**El más barato que mueve la aguja: bajar el material de las moradas en
`data/buildings.json`.** Cero líneas de código, un JSON que se edita sin
recompilar. Medido a la mitad de material: **dw4 10→159/200 (día 4), dw5
0→41/200 (día 5)**, y aparecen caballería, campeón, vampiro y liche. Rompe los
tests que fijen coste de edificio, y deja el barrido en 1/200 sin terminar. Es
además la palanca que **acerca** al original: el coste de aquí se inventó, la
renta se copió.

La alternativa, **`MINE_YIELD` ×3** (una constante), rinde algo más —dw5 55/200,
5 de 7 criaturas caras, y mantiene 0/200 sin terminar— pero **rompe la única
cifra verificada contra fheroes2**. Si se elige, que sea sabiéndolo.

**Y hace falta la segunda mitad o el nivel 6 no llega nunca: minas de gemas,
azufre y mercurio en `recursosMina`** (tres entradas). Sola no hace nada
—dw4 7/200, porque el cuello es la madera—, pero con las moradas más baratas es
lo que hace aparecer al **dragón óseo** (1/200, día 26).

**Lo que NO haría, con su medida:** subir el tope de días (0/200 se quedan sin
terminar hoy); tocar el margen de 1,05 (`CLAUDE.md` avisa: con 1,4 vuelven
3/200); agrandar el mapa como arreglo principal (21 días de partida por lo que el
material da en 6, y ×4 en `pnpm qa`); tocar `chooseBuilding` como arreglo
principal (25 partidas de 200); abrir **#23** por esto (5 de 60).

**¿Bug o diseño?** Las dos cosas, y conviene separarlas. Que gemas, mercurio y
azufre no tengan mina mientras cinco edificios los piden es un **bug
inequívoco**: contenido declarado e inalcanzable a cualquier duración. Que la
partida dure 7 días es **diseño** —es lo que produce un mapa de 2,26 días de
ancho con dos castillos y una sola victoria—, pero esa decisión **no hay que
tomarla**: con material, ocho días bastan para levantar la cadena entera
(194/200 llegan a la morada 6). Alargar la partida es opcional; cuadrar el coste
con la renta, no.

## Qué le cambiaría a `requisitos.md`

Sustituyendo la lista de cuatro sospechosos, pegado tal cual:

> La causa está medida: **la cadena de moradas cuesta más materia prima de la que
> el mapa reparte en toda la partida**. No es el oro (con oro infinito,
> `dwelling_5` sigue en 0 de 200), no es el tiempo (con material, la cadena
> entera se levanta y la partida sigue durando 8 días), no es que la IA prefiera
> atacar (construye todos los días) y no es la condición de victoria. La
> distancia alarga la partida, pero comprando días de renta de mina: es el mismo
> problema pagado más caro.
>
> Y hay un quinto hecho que no estaba en la lista: **el generador no coloca minas
> de gemas, mercurio ni azufre**, así que la morada 6 de las dos facciones,
> `knight_upgrade_6`, `necromancer_upgrade_5` y `mage_guild_2` son inalcanzables
> dure lo que dure la partida.
>
> El siguiente ciclo es de números, no de reglas: `data/buildings.json` y tres
> entradas en `recursosMina`. Y **el barrido de semillas entra en los criterios
> de aceptación**: su línea base de 0 sin terminar se rompe con 1/200 en varias
> de las variantes medidas.
