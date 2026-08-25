# Crítica — la IA de batalla decide mejor (#49, #50, #52)

**REENCUADRADA.** #52 es real, su cifra aguanta y el motor **sí** cede la iniciativa: se queda, y da
para el ciclo entero. Los otros dos **no tienen sujeto** —`charge` no pisa el tablero ni una vez en
802 batallas y sólo 2 de 1604 ejércitos son mixtos—, así que salen byte a byte idénticos. El racimo
se justifica en «comparten la medida que los valida», y esa medida **no puede validar a dos de los
tres**: el criterio 15 mide #52 y nada más, y pide 40 semillas para una pregunta que necesita 783.

**Cómo he medido**: worktree aparte, ya retirado; contadores en `chooseBattleAction` y `createBattle`
que no cambian ni una decisión. 200 semillas de `playAiGame` (802 batallas, **10 440 decisiones**) y
200 batallas sintéticas del barrido (2283).

## El problema real, en una frase

La IA no usa tres piezas del motor, pero **dos no tienen a quién usarse**: la partida se acaba el día
7 y la caballería nunca llega al tablero.

## La premisa, afirmación por afirmación

| Afirmación | Verificación |
|---|---|
| #52: «0 de 1043 decisiones en 80 batallas» | **CIERTO, y hoy también**: 0 de 10 440 en 802 batallas; 0 de 2283 en las sintéticas. Su ritmo (13,0 decisiones/batalla) es clavado al de hoy. Esta vez la cifra del issue no miente |
| #52: «la cola es prácticamente inalcanzable» | **Se queda corto**: la rama se alcanza **0 veces**, y `defend` tampoco sale nunca (0/10 440). Está muerta **toda** la cola de la heurística, no sólo `wait` |
| Requisitos: «se asume que el motor cede la iniciativa» | **CIERTO, comprobado ejecutando.** `battle.ts:370-374` hace `s.waited = true` + `state.queue.push(s.id)` y `advance` saca por `shift`: un campeón que espera pasa de 1º a 6º de la ronda. `beginRound` (`:264`) resetea `waited` y remonta `initiativeOrder`. **#52 NO sale del ciclo** |
| #50: «deja valor en la mesa» | **FALSO hoy**: 0 de 1256 decisiones de «acercarse y golpear» son de una unidad con `charge`. Censo de 802 batallas: `archer` 706, `peasant` 649, `zombie` 585, `skeleton` 542, `pikeman` 422, `veteran_pikeman` 46, `mummy` 41, `mutant_zombie` 28, `ranger` 21, `swordsman` 3. **Cero cavalry, champion, paladin, crusader, vampire, lich y bone_dragon** |
| #50: ¿por qué ninguna? | Las partidas duran **7 días de mediana** (min 3, p90 8, max 22, 0 sin terminar) y `knight_dwelling_5` —3000 oro y cristal tras la cadena 1-4— **no se construye en ninguna de las 200**; `dwelling_4` sale en 9. `charge` es nivel 5 |
| #50: «se toma la primera casilla que aparece» | **CIERTO y peor**: es la de **coste mínimo en 1698 de 1698 casos**. `reachable` llena su `Map` por BFS y `movableHexes` conserva el orden, así que la IA elige sistemáticamente la casilla que **menos** carga cobra. No es azar: es el mínimo garantizado |
| Criterio 2 («daño esperado, no distancia») | **CIERTO y más fuerte de lo que dice**: `computeDamage` no depende del hex salvo por `chargeHexes` (`damage.ts:104`), así que sin `charge` todas las casillas **empatan**. **1194 de 1194** decisiones con más de una casilla son de unidades sin carga: el criterio 3 (el desempate) decide hoy el **100 %** de los casos y el 1 no decide ninguno |
| #49: «un ejército mezclado recupera lo que la mezcla le costaba» | **Casi nunca hay ejército mezclado**: **2 de 1604** (0,12 %), y son la misma hueste en dos batallas seguidas (`zombie+skeleton+veteran_pikeman+ranger+peasant`). 0 de 400 en las sintéticas |
| #49: alcance real | Hay dos facciones y **las diez criaturas nigromantes son `undead`**: en un ejército mixto llevan `morale: 0` forzado (`battle.ts:104`), así que lo único que #49 puede devolver es **+1 a los stacks caballero** al morir el último nigromante. `armyMorale` sólo vale 1 o 0 aquí: la rama `-(factions.size - 2)` es inalcanzable |
| «`charge` ya existe y funciona» (#8, cerrado) | El guardia de rasgos vivos (`invariantes.test.ts:277`) es **textual**: comprueba que `'charge'` aparece en el motor. Demuestra que se **lee**, no que se **sienta** — y hoy no se siente nunca |
| Cuánto valdría #50 con caballería en el tablero | Con ejércitos de `cavalry`+`champion`+`paladin`: **+20,3 %** de daño esperado de media sobre 653 ataques, máx. +36 % (el tope es +50 %); coste medio del hex elegido 2,09 contra 4,49 del mejor. No es un 4 %: es grande. Pero es sobre cero ataques en 200 partidas |

## El día después

- **Para quien juega**: con #52 cambia (33,3 % de las decisiones son `move`). Con #49 y #50, **nada**.
- **Qué se vuelve más difícil**: un `wait` que se juega alarga las batallas; el tope es `MAX_ROUNDS
  = 100` y el peor caso medido hoy son **8 rondas**. Hay margen, pero esa cifra la imprime el barrido
  y hay que mirarla, no sólo el «sin terminar». Estancarse no puede: `waited` se pone una vez por
  ronda y `legalActions:803` deja de ofrecerlo.
- **Qué habría que borrar y nadie borrará**: el test de `wait` (`test/battle.test.ts:895-905`)
  alcanza la cola **colocando los stacks a mano** hasta que `movableHexes` devuelve `[]`. Si la
  condición cambia deja de probar lo que dice: hay que reescribirlo, no adaptarlo.
- **Contra `CLAUDE.md`**, nada. Y una falsa alarma que descarto: el registro del criterio 8 es
  `BattleLogEntry` (`battle/types.ts:84-87`), **no** el `GameEvent` de #59.

## Conflictos

- **Con el ciclo de rendimiento (#48, #55): duro y en una sola dirección.** Su criterio 1 es «byte a
  byte idéntico en 200 semillas» y **#52 evapora esa línea base**: rendimiento tiene que cerrarse
**antes**. Al revés no hay problema —izar `movableHexes` conserva el orden de `legalActions`, su
crítica lo demuestra idéntico a 200 semillas—. Pero hay que escribirlo: **#50 no debe apoyarse en
«el primer elemento de `legalActions`»**, tiene que leer el coste; hoy coinciden por el orden del
BFS, y eso es un accidente, no un contrato.
- **Con #60** (el arnés se acaba el día 3): mismo hecho por otro lado. **Eso es lo que gatea a #50 y
  no hay issue que lo diga.** Con #59, #54 y #42: ninguno.

## Coste contra valor

**#52** es el único con sujeto y vale por sí solo. **#50**: riesgo cero y valor cero hoy —corrección
latente, no mejora—; no hacerla nunca cuesta ese +20 % el día que llegue la caballería. **#49** se
dispara en el 0,12 % de los ejércitos y regala 1/24 de turno extra durante ≤8 rondas: **si algo sale
del racimo, es esto**. Lo caro es el criterio 15 como está escrito.

## El criterio 15, respondido

- **Montable, pero con superficie nueva de producción**: `autoResolve` importa `chooseBattleAction`
  directamente y `resolvePendingBattle` (`game.ts:949`, y se movía mientras escribía esto: el ciclo de
#59 toca ese fichero) llama `autoResolve(pending.battle, ctx.rng)`; `GameContext` es `{ rng }`
  (`game.ts:137`). A nivel de partida obliga a meter la táctica por bando en `GameContext` y bajarla
dos capas, y deja sin definir qué táctica lleva el monstruo neutral, cuyo bando no tiene dueño. **Y
no mediría nada**: #49 y #50 son byte a byte idénticos, así que devolvería 50,0 % **por
construcción**.
- **Semillas**: distinguir 55 % de 50 % (α=0,05, potencia 80 %) pide **783 partidas**. IC del 95 %:
**±15,5 pp con 40**, ±6,9 con 200, ±3,5 con 800. «Más de 40» se queda corto por un orden de
magnitud; en reloj no es absurdo (~85 ms/partida → 66 s), pero es la medida equivocada.
- **La que sí significa algo**: enfrentar las dos tácticas **a nivel de batalla**, donde vive el
  cambio, cada emparejamiento **dos veces con los bandos intercambiados** (el atacante gana los
  empates de velocidad, `battle.ts:232`). Medido: 2000 batallas = **3,4 s**; 4000 dan **±2,2 pp** en 7
  s, y no tocan `GameContext`.

## Qué le cambiaría a `requisitos.md`

1. **Criterio 10**: «Medido hoy: **0 de 10 440 decisiones en 802 batallas** de 200 partidas, y 0 de
   2283 en las sintéticas. La rama ni se alcanza, y `defend` tampoco sale nunca.»
2. **Pregunta abierta de la iniciativa, cerrada**: «**El motor sí cede la iniciativa**: `wait`
   empuja el stack al final de `state.queue` (`battle.ts:370-374`) y `advance` saca por `shift`;
   comprobado, un campeón que espera pasa de 1º a 6º. #52 se queda. Queda una decisión, no un bug:
   entre varios que esperan el orden es **FIFO de cuándo esperaron**, no por velocidad —no
   contrastado con fheroes2.»
3. **Criterios 1-4**: «#50 **no cambia ni una partida hoy**: 0 de 1256 decisiones son de una unidad
   con `charge`. Entra como corrección **latente**, con test unitario y con la exigencia explícita
   de **salir byte a byte idéntico en el barrido**. El criterio 3 no es un detalle: es lo único que
   decide en el 100 % de los casos de hoy, y un desempate por “más hexes” manda de rodeo a 1194
   decisiones y revienta la comparación.»
4. **Criterios 5-9: sacar #49 del racimo.** «2 ejércitos mixtos de 1604 (0,12 %), y su único efecto
   posible es +1 de moral a los stacks caballero al morir el último nigromante, porque las diez
   criaturas nigromantes son `undead` con `morale: 0` forzado. No justifica su parte del riesgo de
   este ciclo.»
5. **Criterio 15, sustituir entero**: «El enfrentamiento va **a nivel de batalla** y con bandos
   intercambiados. A nivel de partida haría falta la táctica por bando en `GameContext`, y
   devolvería 50,0 % por construcción porque #49 y #50 no cambian nada. 4000 batallas ≈ 7 s dan ±2,2
   pp; 40 partidas dan ±15,5 pp y no distinguen nada. Se dice claro: **mide #52**.»
6. **Fuera de alcance, con su razón**: «La duración de la partida y la economía de la IA quedan
   fuera, pero son **la causa** de que #50 no tenga sujeto y de que el arnés de #60 se acabe el día
   3. **Abrir issue**: la IA no pasa de la morada 3 y la partida se acaba el día 7, así que la mitad
   del bestiario no se juega nunca.»
