# QA — El equipo: botín, armería y héroes que nacen equipados

Validado contra `requisitos.md` (petición literal y decisiones del usuario del
02-10-2026, que mandan: el héroe nace con equipo base de calidad de armería; el
veterano que asciende recibe el base y sus piezas van a la mochila; medidas con
100 semillas). Trabajo sin commitear sobre `main` (`2b44289`).

Cómo se probó: `pnpm verify`, `pnpm banco`, `pnpm qa`, `pnpm capturas`,
`tools/qa/equipo.ts`, el barrido de 40; el navegador con **Playwright** contra
`pnpm dev` (arrancado con `set -m` en su línea, muerto por su grupo, `:3100` libre
después), con clics reales en el lienzo y en el panel y una `Session` espejo solo
para calcular píxeles. Las sondas de código vivieron en dos worktrees temporales
del scratchpad (el diff actual y `2b44289`), ya retirados: el árbol de trabajo
tiene las mismas 45 entradas de `git status` que al empezar.

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| C1 | Tres huecos (arma, armadura, accesorio) por individuo y por héroe | ✅ | Panel del héroe, semilla 12 día 1: «Arma: Espada de armería +2 ataque ×», «Armadura: Cota de malla», «Accesorio: Brazal de armería» (`n1-inicio.png`). Fila de tropa tras equipar: «Campesino · Nivel 1 · 0 / 20 exp · Lleva: Espada de armería ×, Cota de malla ×». |
| C1 | El equipo vive en el individuo, dura la campaña y se pierde si muere | ✅ | Semilla 12, campesino `veterano-1` con espada y cota → emboscada en el camino a la momia (12,4), «Resolver sola»: el campesino muere y las dos piezas desaparecen (mochila vacía, héroe sin ellas). Mismo arranque y **rendición** (190 de oro): vuelve a la base con «Lleva: Espada de armería ×, Cota de malla ×». Licenciar devuelve las piezas a la mochila (test `equipo.test.ts:324`, y en el navegador el «−1» se va primero al desnudo, como dice `elQueSeIria`). |
| C1 | Cifras en la puerta única (`cifrasDeCatalogo`/`heroUnit`) | ✅ | `cifrasDelIndividuo` → `conEquipo` en `troopUnit` y `resolveUnit`; `heroUnit` exige `equipo`. Tests `equipo.test.ts:114-156` (misma referencia sin piezas; `troopUnit` = tablero). |
| C2 | Catálogo en `data/`, inventado y declarado, con hueco, cifras y precio; calidad leíble | ✅ | `data/equipo.json`: 13 piezas, `_comment` «TODO INVENTADO y PROVISIONAL… Que nadie cite estas cifras como del original»; `calidad` por pieza (`comun`/`armeria`/`especial`), una de armería por hueco, validada al cargar. |
| C3 | Vencer asaltantes o tomar ciudad neutral guarnecida da una pieza | ✅ | Navegador: semilla 12, tomar `town-2` (8,6) → crónica «Botín de una ciudad neutral: Anillo de cobre» y «Mochila · 1». Repetido en la semilla 3 («Amuleto de hueso»). Emboscada repelida, semilla 12 → «Botín de unos asaltantes: Anillo de cobre». Rival guarnecida no da (test `equipo.test.ts:447`). Rendirse o perder no da. |
| C3 | Reproducible, por `createRng`, y sin desplazar tiradas | ✅ | Paso 1 del re-anclaje reproducido por mí (abajo): 0 líneas quitadas, 1 045 añadidas, las 1 045 `loot_found`. |
| C4 | `armory` en `buildings.json`, con coste y solar | ✅ | `armory` 2000 oro + 5 madera + 5 mineral, `sellsEquipment`, coste declarado inventado en `_comment` y `_fuente_de_los_costes`. Sexto solar de villa con su marcador «Armería» (`a3-comprado.png`). |
| C4 | Comprar con héroe dentro; equipar y desequipar | ✅ | Semilla 12: construir la armería, comprar Cota + 2 Espadas → oro 6000 → 5200 → 4400 → 3600, crónica «Comprado en la armería: …». Equipar a un novato (`creature`), a un individuo con hoja (`veteran`), al héroe; «×» devuelve a la mochila. Cero errores de consola en todas las pasadas. |
| C5 | Acciones en el contrato con su prosa | ✅ | `buy_item`, `equip`, `unequip` en `adventureActionSchema` y `RESPONSE_FORMAT`, con el catálogo interpolado. Rechazos del núcleo con frase (lista abajo). |
| C5 | La IA construye la armería y compra/equipa | ✅ con reserva | `tools/qa/equipo.ts` (100 semillas): armería en 8 partidas (día mediano 15), 2,46 compradas/partida, botín equipado. Ver hallazgos I2 e I3. |
| C5 | `pnpm qa` lo cruza | ✅ con reserva | exit 0, 3,0 s: «22 veredictos, 22 entraron, 0 descartadas · equipo: 1 compras en la crónica; skeleton veterano-7 de hero-veterano-1 lleva {"arma":"espada_de_armeria",…} (cruzado con game_state)». La armería la pone el `preparar` del arnés con 10 000 de oro: ver W1 e I1. |
| C6 | Panel de tropa y de héroe enseñan el equipo | ✅ con reserva | Sí, pieza a pieza. Pero «Ataque / Defensa 2 / 2» del héroe no suma su +3/+3 de serie (I4). |
| C6 | La pantalla de castillo enseña la armería | ✅ | Solar y sección «Armería» con precio y «Comprar»; en móvil (`movil-02-castillo.png`) el solar queda en la parte que se desplaza, como el mercado. |
| C6 | La crónica cuenta el botín | ✅ | «Botín de una ciudad neutral: …», «Botín de unos asaltantes: …», «Comprado en la armería: …». |
| C6 | El espectador | ✅ | `pnpm capturas` exit 0, 85,7 s, sin errores de consola; `espectador-00-heroe-nacido.png` enseña «Lleva: Espada de armería, Cota de malla, Brazal de armería» bajo cada héroe, también bajo el ascendido «QA veterano-1». |
| C7 | Se mide y se publica duración, ganador y piezas por partida | ✅ | `tools/qa/equipo.ts` reproducido: `8 / 15 / 30 · 0/100 · j0 43 · botín 5,01 (1,95) · compradas 2,46 · en tropa 3,08 · perdidas 4,66 · armería 8 (15) · morada 5 25`, igual a lo publicado en `CLAUDE.md`. |
| C7 | Re-anclado una vez, con la forma justificada | ✅ | `pnpm banco`: `7c24a8b4…e80b`, 66 088 líneas, 0/200, «ancla: igual». Forma comprobada por mí (abajo). |
| C7 | Barrido 0/40 y 0/100 (en vez de 0/1000, por decisión del usuario) | ✅ | Barrido: «sin terminar: 0/40», `8 / 15 / 23`. `equipo.ts`: 0/100. |
| Usuario | El héroe nace con el equipo base de calidad de armería, desde `heroeRecienHecho` | ✅ | Inicial (panel del día 1) y contratado («Capitán de Valdeluz», mismos tres huecos) en el navegador; el ascendido en el espectador y en `equipo.test.ts:194`. `EQUIPO_BASE` se deriva de la calidad. |
| Usuario | El veterano que asciende recibe el base y sus piezas van a la mochila | ✅ | `ascenderVeterano` → `aLaMochila(hero, ...idsPuestos(v.veterania.equipo))`; test `equipo.test.ts:194`. No lo vi en el navegador: solo pasa con narrador (ver No probado). |
| — | `pnpm verify` | ✅ | 34 ficheros, 971 pasan y 1 omitido, 12,2 s. |

## La forma del re-anclaje: reproducida, y se sostiene

Volqué el banco en `2b44289` (`0c8fc759…`, que sigue cuadrando) y en tres estados
del diff, quitando la columna de índice y el recuento de hechos:

1. **Solo botín y mochila** (sin `EQUIPO_BASE`, sin armería en los datos y en la
   lista de la IA, y sin el bucle de equipo de la IA): `dc08ee99…`, **0 quitadas,
   1 045 añadidas, 1 045 `loot_found`, todas `from: "town"`**. Lo que dice el
   ingeniero.
2. **+ equipo base**: 185 de 200 semillas distintas de las del paso 1, **47 con
   otro ganador**, j0 91 → 92.
3. **Final**: 179 de 200 distintas del paso 2, y en **las 179 la primera línea
   distinta va detrás de un `loot_found`** de esa semilla, ninguna antes. j0 93.

Una sola re-ancla y la forma es la que se declara. Una precisión: en el banco
**todo el botín es de ciudad**; el de asaltantes no lo ejerce el banco (la IA no
les pelea) y queda cubierto por los tests y por la emboscada que jugué en el
navegador.

## «día 7 … 1 rechazadas» en `pnpm qa`: inocua para el juego, pero la nota es inexacta

La saqué con una sonda en el director:

```
recruit 2× zombie en qa-town-1: no se puede reclutar: solo hay 0 disponibles
PLAN [build necromancer_upgrade_2, buy_item espada_de_armeria, equip …, dismiss skeleton 2,
      recruit zombie 2, move_hero …]
```

La política del arnés lee los zombis disponibles en la foto del turno, construye
primero la mejora de la morada 2 —que convierte a los zombis disponibles— y luego
pide reclutar zombis que ya no hay. El núcleo lo rechaza con su frase, como manda
el contrato. Pasa el día 7, **después** de que el arnés cierre su cuenta (22 de
22), y por eso no pone nada rojo.

Lo que no se sostiene es la nota de `implementacion.md`: «Es anterior a este
simplify… sale la misma línea». Es anterior al *simplify*, pero **no a este
ciclo**. En `2b44289` el mismo `pnpm qa` acaba con «día 7 · jugador 1 · agente · 2
acciones», sin rechazos (24 veredictos, 17 decisiones de batalla). Lo trae este
ciclo, porque `ponArmeriaEnLaBase` le da al jugador 10 000 de oro y con ese oro la
política llega a pagar la mejora. Es una carrera de la política de QA consigo
misma, no un fallo del juego. Ver I1.

## El agente con piezas que no existen o de otro hueco

Los probé por `applyAdventureAction` y por el esquema del contrato. Todos se
rechazan con una frase que se entiende:

- `equip item:"excalibur"` → «no existe ninguna pieza "excalibur"»
- una pieza que no está en la mochila → «Aldo de Valdeluz no lleva Espada de armería en la mochila»
- `creature:"dragon"` → «no existe ninguna criatura "dragon"»
- `veteran:"veterano-99"` → «no lleva a nadie con el id …»
- `veteran` y `creature` a la vez → «di a quién se la pones con "veteran" o con "creature", no con los dos»
- el héroe del rival → «Serena la Pálida no es tuyo»
- `buy_item` de una pieza común o especial → «la armería no vende Garrote: es común y solo cae como botín»
- comprar sin armería, sin héroe dentro, en una ciudad ajena o sin oro: cada caso con su motivo.
- **Otro hueco**: `equip` no recibe hueco, porque la pieza va al suyo y lo que lo ocupaba vuelve a la mochila, así que no hay forma de equivocarse de hueco. En `unequip` el hueco es `z.enum`, y `slot:"casco"` lo rechaza el esquema (`actions.1.slot: Invalid enum value…`). Ver M3.

## Hallazgos

### Importantes

**I1. El arnés de `pnpm qa` rechaza una acción el día 7, y la nota del ingeniero lo da por preexistente.**

- Cómo reproducirlo: `pnpm qa`; la última línea del servidor es «día 7 · jugador 1 · agente · 5 acciones · 1 rechazadas».
- Qué pasa: es el `recruit` de zombis que se describe arriba. En `2b44289` no sale.
- Por qué es inocuo para el juego: el núcleo hace lo que el contrato promete.
- Por qué se reporta: un rechazo que el arnés no cuenta, porque cae fuera de su ventana, es justo el tipo de ruido que acaba tapando uno de verdad. Y la nota de `implementacion.md` atribuye el rechazo a un estado anterior que no es el que lo produce.
- Arreglo sugerido, para el ingeniero: que la política no recluta una criatura cuya morada acaba de mejorar en el mismo plan, o que no construya mejoras. Además, corregir la frase de `implementacion.md`.

**I2. La IA compra un equipo entero cada día para una tropa que muere al día siguiente.**

- Cómo reproducirlo: `pnpm banco --dump`, semilla 136. El héroe del jugador 0 compra **18 piezas al día** del 20 al 42 (268 compras en total).
- Qué pasa: cada día equipa a seis individuos nuevos, ataca, pierde (`hero_defeated` → `hero_returned`) y vuelve a empezar.
- El reparto entre semillas: 1 187 compras del banco caen en solo 14 semillas, y 6 de ellas suman 983. Con 100 semillas, la media de compras salta de 2,46 a 9,41 entre la primera tanda y la segunda.
- Lo que no rompe: no viola ningún requisito, y la reserva de 2 500 de oro impide que se arruine.
- Por qué se reporta: es dinero tirado y explica la cola de la tabla publicada. El que la publique debería saber que la media sale de unas pocas partidas atascadas en ese bucle.

**I3. La armería de la IA es casi decorativa.**

- Qué pasa: va la última de la lista de construcción y sale en 8 de 100 partidas, con el día 15 como mediana.
- Por qué se eligió así: está medido y razonado para no hundir la morada 5.
- La consecuencia: «La IA de reglas construye la armería» se cumple en la letra, y en la práctica la IA equipa sobre todo botín. Es una decisión de equilibrio que conviene que el usuario vea antes de cerrar el ciclo.

**I4. El panel del héroe enseña «Ataque / Defensa 2 / 2» con +3/+3 puesto.**

- Cómo reproducirlo: `?seed=12`, día 1, mirar el panel del héroe.
- Qué pasa: quien juega ve las piezas, pero no lo que suman. El héroe pelea con las cifras equipadas y la ficha enseña las desnudas.
- Está declarado en «Qué NO queda cubierto», pero desde el asiento de quien juega desdice lo que la pantalla acaba de enseñarle.

### Menores

**M1. La pieza elegida no es de ningún héroe.**

- Cómo reproducirlo: `?seed=12`.
  1. Pulsar «×» en el arma de Aldo y elegir la espada en su mochila.
  2. Salir del castillo, abrirlo desde el panel, contratar a un héroe y volver al mapa.
  3. Seleccionar al contratado.
- Qué pasa: el panel del contratado ofrece «Ponérsela a Capitán de Valdeluz» y un «Equipar» en cada fila de su tropa, con la mochila vacía. Al pulsar, la barra dice «no se puede equipar: Capitán de Valdeluz no lleva Espada de armería en la mochila» (`d-otro-heroe.png`).
- Lo que esperaba quien juega: que la elección se soltara al cambiar de héroe, o que los botones no salieran.
- Daño: no corrompe nada; la espada sigue en la mochila de Aldo.

**M2. `aLaMochila` no es «la única escritura que añade».**

- Lo afirman su docstring (`game.ts:1302`) y `CLAUDE.md` («cuatro puertas únicas»).
- Pero `repartirBotin` (`game.ts:2793`) escribe aparte:

  ```ts
  hero.mochila = [...hero.mochila, pieza.id];
  ```

- Ninguna de las dos frases se cumple, y es el tipo de cita que hace bajar la guardia.

**M3. Un hueco mal escrito en `unequip` tumba el turno entero del agente.**

- Qué pasa: `slot` es `z.enum`, así que `"casco"` hace inválida **toda** la respuesta. Las demás acciones de ese turno también se pierden, en vez de descartarse una a una como las de `equip` o `buy_item`.
- Es una decisión del plan y coherente con el `type`. Hoy es el único campo de una acción de aventura que se acota en el esquema, así que conviene saberlo.

**M4. Una frase de rechazo engaña cuando la criatura no está en la tropa.**

- Cómo reproducirlo: `equip creature:"bone_dragon"` con un héroe que no lleva ninguno.
- Qué dice: «no lleva ningún Dragón óseo sin id: a uno que ya lo tiene —el que va en su propia fila— se le nombra con "veteran"».
- Por qué engaña: sugiere que hay uno con id, y no hay ninguno.
- Relacionado: «Serena la Pálida no es tuyo» y «Cripta Gris no es tuyo» no concuerdan en género.

**M5. Detalles de pantalla.**

- En la fila de un equipado los «×» son botones de tamaño completo metidos en la línea «Lleva:», y la coma queda pegada al botón («[×] , Cota de malla»).
- En la armería, el «Comprar» del Brazal baja de línea y los otros dos no.
- Se lee, pero se ve apretado.

**M6. Efecto de las piezas de velocidad en el mapa, sin decidir.**

- Qué pasa: las piezas de velocidad también suben el movimiento del héroe en el mapa, porque cuentan para la criatura más lenta. Con botas en los cinco de la tropa inicial de la semilla 12, el movimiento pasa de 1100 a 1210.
- Es coherente con «la velocidad sube escalones», pero nadie lo ha decidido ni lo dice.

## Workarounds usados

- **W1 (del ingeniero), `ponArmeriaEnLaBase` en el `preparar` de `pnpm qa`.**
  - Qué hace: levanta la armería y da 10 000 de oro.
  - Por qué hace falta: la IA no la levanta en la duración de la partida del arnés.
  - Veredicto: no afecta a quien juega, que puede construirla el día 1 (la construí yo con 8 000 de oro iniciales). Pero tiene un efecto secundario visible, el rechazo de I1.
- **Mío, la `Session` espejo en Node.** Solo la usé para traducir casillas y solares a píxeles. Todos los clics fueron reales, en el lienzo o en botones del panel.
- **Mío, un mapa de partida de equipo en Node.** Puse cinco botas en la mochila por código para M6, e inyecté acciones ilegales con `applyAdventureAction` para la lista del agente. Es una sonda de reglas, no del flujo de quien juega, y no sostiene ningún ✅ de pantalla.

## No probado

- **El veterano que asciende, en el navegador.** El ascenso solo pasa con narrador. Lo cubren `equipo.test.ts:194` y `pnpm qa`, que en su pasada asciende a un veterano sin piezas propias, así que la mochila heredada no viaja por el circuito.
- **`pnpm mirar` a mano.** Me fié de `pnpm capturas`, que juega el espectador en Chromium y fotografía «Lleva:».
- **Una sola tanda.** No repetí la tanda de semillas 101-200 ni la elección del puesto de la armería con 1 000 semillas: lo reproducido es la tabla de 100.

## Veredicto

**Apto con reservas.** Los siete criterios y las decisiones del usuario se cumplen
en el flujo real: botín visible y equipable, compra en la armería, equipar a un
novato y a un veterano, licenciar, rendirse y morir con equipo, el agente
rechazado con frase y el espectador. La forma del re-anclaje está reproducida y es
la que se declara.

Las reservas:

- La nota sobre el rechazo del día 7 de `pnpm qa`, que es de este ciclo y no anterior (I1).
- La IA, que compra en bucle para tropas que mueren (I2) y casi no levanta la armería (I3).
- La ficha del héroe, que no suma su equipo (I4).
- Que nada de esto cambie una regla pedida.

## Segunda pasada

Re-verificación de I1, I2, I4 y M1–M5 tras los arreglos de `hallazgos-qa.md`, más una
pasada adversarial sobre esos arreglos. Mismo árbol sin commitear (50 entradas de
`git status`, iguales antes y después de esta pasada). Las sondas vivieron en el
scratchpad, fuera del repo, y están borradas. Navegador: Playwright contra
`pnpm dev` (`set -m` en su línea, `pnpm` y `vite` en el grupo 148990, cwd
`/home/al/code/heroes`), muerto por su grupo; después, `:3100` libre y grupo vacío.

### Comprobaciones de base

| Orden | Resultado |
|---|---|
| `pnpm verify` | 977 pasan, 1 omitido; 12,4 s |
| `pnpm banco` | `bd4d4a13…38fa`, 64 763 líneas, 0/200, `8 / 17 / 43`, «ancla: igual» |
| `pnpm qa` | exit 0, 3,05 s, «22 veredictos, 22 entraron, 0 descartadas»; **0** líneas «rechazad» en toda la salida; día 7: «jugador 1 · agente · 4 acciones» sin rechazos |
| `tools/qa/equipo.ts 100` | `8 / 15 / 30 · 0/100 · j0 43 · compradas 0,69 · 0 / 0 / 24 · 4 partidas` |
| `tools/qa/equipo.ts 100 28 101` | `8 / 19 / 43 · 0/100 · j0 49 · compradas 1,52 · 0 / 3 / 66 · 10 partidas` |

Las dos tandas cuadran al carácter con la tabla de `implementacion.md`.

### Criterios re-verificados

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| I1 | La política no pide reclutas que su mejora ya convirtió; nota corregida | ✅ | `pnpm qa`: 0 rechazos, el día 7 acaba en «4 acciones». La nota de `implementacion.md:206` dice ahora que lo trae este ciclo. |
| I2 | Tope de compras por héroe y día | ✅ | Sonda sobre 200 semillas, contando `item_bought` por (héroe, día): **máximo 3**. Reparto: 73 días con 3 compras y 1 con 2. |
| I2 | Primero el héroe y los veteranos ≥ 2; a un novato, solo si sobra mucho oro | ✅ en la letra, ver A1 | Sonda de destinatarios: 1-100 da 69 compras (0 al héroe, 8 a veteranos ≥ 2, 61 a novatos); 101-200 da 152 (0, 5, 147). Sonda de oportunidad: en 16 turnos con un veterano ≥ 2 en una base con armería, al que una pieza mejora y con oro para pagarla dejando 2 500, la IA compró en **15**. La que falta es la semilla 69, día 15 (zombi n2; el zombi ya no está en la tropa al acabar el turno). |
| I2 | Medido con 100 semillas y publicada la distribución | ✅ | Tablas reproducidas (arriba). La forma del re-anclaje no la repetí: me fío de la del ingeniero, que coincide con su sha y con el banco de hoy. |
| I4 | La ficha enseña ataque y defensa con el equipo | ✅ a nivel 5 / ❌ desde el nivel 6 (A2) | Navegador, `?seed=12`: «2 (+3) / 2 (+3)». Sin arma: «2 (+1) / 2 (+3)». Sin armadura: «2 (+1) / 2 (+1)». Desnudo: «2 / 2». Solo brazal: «2 (+1) / 2 (+1)». El contratado: «1 (+3) / 1 (+3)». |
| M1 | La pieza elegida se suelta al cambiar de héroe | ✅ | Navegador: con el brazal elegido, 1 «Ponérsela» y 4 botones `equip`. Tras contratar a Capitán de Valdeluz y elegirlo: 0 y 0. De vuelta a Aldo: sin ◆ y 0 botones. Tras volver a elegirla y ponérsela: sin ◆ y 0 botones. |
| M2 | `repartirBotin` usa `aLaMochila` | ✅ | `grep "mochila *="` en `src/`: solo `game.ts:1276` (`sacarDeLaMochila`, que quita) y `game.ts:1318` (`aLaMochila`). |
| M3 | Un hueco inválido descarta esa acción y no el turno | ✅ | `slot: z.string()` (`agent.ts:64`); `unequipBlocker` comprueba `esHueco` con `includes`, no con `in`. Sonda: `"Arma"` y `""` dan «no hay ningún hueco "…": son arma, armadura, accesorio». El test del cable aplica 3 acciones y descarta 2. El único otro lector de `action.slot` antes del bloqueo es la nota del servidor (`notas.ts:663`), que solo lo imprime. |
| M4 | Sin criatura en la tropa, el rechazo no sugiere un id; «no es de tu bando» | ✅ con un resto (A3) | Sonda: «Aldo de Valdeluz no lleva ningún Dragón óseo en su tropa». Los tres «X no es de tu bando» están en `game.ts:1228/1349/1375`. |
| M5 | Los «×» separados de «Lleva:» | ✅ | Captura de la fila: «Lleva: Espada de armería, Cota de malla» en texto y, debajo, «× Espada de armería» y «× Cota de malla» como botones pequeños. Sin comas pegadas. |
| — | Consola | ✅ | 0 errores en las dos pasadas del navegador. |

### Hallazgos de la pasada adversarial

**A2 (importante). La ficha del héroe sigue sin ser la cifra con la que pelea en cuanto sube de nivel.**

- Cómo se ve:
  - Semilla 12, día 6: Aldo, nivel 6. La ficha dice «2 (+2) / 2 (+2)» y `heroUnit` le da 5 / 5.
  - Semilla 3, día 4: Serena, nivel 6. La ficha dice «2 (+3) / 2 (+3)» y pelea con 6 / 6.
  - Semilla 7, día 8: lo mismo con Aldo.
- La causa: `ataqueYDefensa` (`panels.ts:222`) suma `hero.attack + sumaDeEquipo`. El cuerpo de batalla añade además `ataquePorNivel × (nivel − 5)` (`hero.ts:157`, `data/heroe.json`: 1 por nivel).
- Que la parte del nivel ya faltaba antes de este ciclo: la ficha nunca la enseñó.
- Por qué se reporta igual: `hallazgos-qa.md` pedía que la cifra saliera «de la misma puerta de cifras», y el panel no lee `heroUnit`: rehace la suma por su cuenta. El resultado es el mismo que el de I4 visto desde el asiento de quien juega: los héroes llegan al nivel 6 entre los días 4 y 8, y desde ahí la ficha vuelve a enseñar menos de lo que pega.
- Lo que no entra en la ficha: los PV y la velocidad de las piezas (Coraza +4 PV, Talismán +5 PV, Estoque y Botas +1 velocidad). Se ven pieza a pieza en «Equipo», pero no hay fila que los sume. Es menor y queda fuera de lo que pidió I4.

**A1 (menor, informativo). El camino «héroe y veteranos primero» casi no se recorre; la IA compra sobre todo para novatos, con dinero de sobra.**

- Las cifras: 208 de 221 compras en 200 semillas van a novatos, por la rama `ORO_DE_SOBRA_PARA_NOVATOS`. Ninguna va al héroe.
- Por qué el héroe nunca recibe: nace con las tres piezas de armería, y la armería solo vende esas tres, así que la rama del héroe en `paraQuienSeCompra` es inalcanzable para la IA.
- Cuánto dura lo comprado: de los 221 destinatarios, 42 siguen vivos al acabar la partida (19 %).
- Lo que sí está bien: cumple la regla decidida (al novato solo con 10 000 de sobra), con el tope de 3 al día, y cuando hay un veterano que mejorar, compra (15 de 16). No ha dejado de comprar algo útil.
- Lo que conviene saber al publicar: «se compra solo para quien sobrevive» se cumple en la intención de la regla, pero en el resultado el 94 % de lo comprado va a la rama de oro sobrante, y 4 de cada 5 piezas se pierden.

**A3 (menor). Queda una falta de concordancia de género de la misma especie que M4.**

- El problema: «no lleva ningún ${especie}» y «ese ${especie}» no concuerdan con los nombres femeninos.
- Lo que sale en la sonda:
  - «Aldo de Valdeluz no lleva ningún Caballería en su tropa»
  - «… ningún Momia en su tropa»
- Dónde está: `equipo.ts:250` y, por el mismo patrón, `unequipBlocker` («ese Momia no lleva nada en el hueco arma», `game.ts:1414`).
- A quién afecta: Momia, Momia real y Caballería son femeninos.

**A4 (menor, sin decisión). La otra mitad de M5 sigue igual.**

- Qué pasa: en la armería, el «Comprar» del Brazal de armería baja de línea y su fila mide 50 px de alto, frente a 34 px de las otras dos. Medido con Playwright a 1400×900; captura de la sección.
- Por qué no es una regresión: `hallazgos-qa.md` solo decidió la parte de «Lleva:».

### Workarounds de esta pasada

- **Sondas de núcleo en el scratchpad.** Dos de ellas envuelven `state.log.push` para atribuir cada compra a quien la recibe; otra compara `heroUnit` con la ficha. Solo leen: no deciden nada ni cambian una tirada, y no sostienen ningún ✅ de pantalla.
- **Construí la armería en el navegador con un clic real en su solar**, con la posición calculada con `townLayout`. Es el mismo gesto que haría quien juega.

### No probado

- **M3 desde el cliente.** La interfaz no deja escribir un hueco: solo manda los tres que pinta. Se queda cubierto por la sonda y por el test del cable.
- **La armería en móvil (390×844).** Mi clic calculado no abrió la sección, y no lo perseguí porque A4 no estaba en el alcance decidido.
- **La forma del re-anclaje de I2.** No volví a volcar el banco antes y después.

### Veredicto de la segunda pasada

**Apto con reservas.**

Los ocho arreglos decididos están en su sitio y se ven en el flujo real:

- `pnpm qa` sin rechazos.
- Tope de 3 compras respetado en 200 semillas, y la IA sigue comprando cuando hay un veterano que mejorar.
- Ficha «2 (+3)» a nivel 5.
- La pieza elegida se suelta al cambiar de héroe.
- La mochila se escribe en un solo sitio.
- El hueco inválido descarta solo su acción.
- Las frases de M4 corregidas.
- Los «×» separados.

La reserva principal es **A2**: la ficha rehace la suma en vez de leer la puerta de cifras, y a partir del nivel 6 vuelve a enseñar menos de lo que el héroe pega. A1, A3 y A4 son menores.

## Cierre del coordinador

- **A2:** arreglado. La ficha del héroe lee `heroUnit` con y sin equipo, así que
  incluye lo que da el nivel. Tiene test de nivel 6 en `test/paneles.test.ts`.
  El ancla de paneles cambia en **una sola línea**: «2 (+3) / 2 (+3)» pasa a «4 (+3)
  / 4 (+3)» en la escena de un héroe de nivel alto. Se comprobó regenerándola con y
  sin el arreglo.
- **A3:** arreglado. Ahora las frases dicen «ninguna unidad de X» y «esa unidad de
  X».
- **A1:** queda como está, y se le dice al usuario.
- **A4:** el botón de compra del Brazal baja de línea. Se queda para una pasada
  visual.
