# QA — fase 1b: el héroe en el tablero, la rendición, la vuelta a la base y el tope de 7

Árbol sin commitear sobre `2cf34ac`, con la «Aplicación de /simplify» incluida.
No he tocado código, `assets/art/` ni `CLAUDE.md`. Los scripts de sonda están en
el scratchpad de la sesión (`adv1.mts`, `adv2.mts`, `medir.mts`, `persona.mts`,
`agente.mts`, `mirar*.mjs`). He matado solo mis procesos, por su grupo. Al
terminar, 3100, 9880 y 9881 quedaron libres.

## Comprobaciones de base

| Orden | Resultado real |
|---|---|
| `pnpm verify` | exit 0 · 27 ficheros · **576/576** · 9,28 s |
| `pnpm banco` | sha `c36d3cc5596565ad445b990ad051fd216b1a4bb70ffac4ab089c0dcbba8f6449`, 40 158 líneas, **ancla: igual**, 0/200 sin terminar, 2 571 ms, autoResolve 127 ms |
| `npx tsx tools/qa/barrido-semillas.ts` | **0/40** sin terminar; peor batalla en 9 rondas, 0/40 en el tope |
| `pnpm qa` | exit 0 · 2,97 s · 26 veredictos, 26 entraron · «AVISO: ninguna batalla ofreció rendirse en esta partida» · 22 decisiones de batalla |
| `pnpm capturas <scratchpad>` | exit 0 · 34,5 s · «sin errores en consola» · el séptimo se rechaza · rendición por 190 · «héroe derrotado: de vuelta en (3,3), sin tropa y sin movimiento» |

## Criterios

| Criterio | Veredicto | Evidencia |
|---|---|---|
| **4 · el héroe es una unidad del tablero** con perfil propio | ✅ | `battle_turn` real por MCP: `attacker-heroe`, `"creature":"hero"`, `hp 50`, `"commander": true` en los dos bandos. Captura `desktop-08` y `sin-arte-02`: «Aldo de Valdeluz» en «En el campo» y en el tablero. |
| 4 · si cae, su bando pierde aunque le quede tropa | ✅ | `adv1.mts` S3: tropa defensora viva 3, comandante a 1 PV → `finished {"winner":"attacker"}`. Banco del ingeniero: 768 de 1234 caídas con la tropa en pie. |
| 4 · su magia funciona mientras vive | ✅ | Agente real: `cast magic_arrow` aceptado (req-3, req-5); en S3 la flecha mata al comandante y cierra la batalla. |
| 4 · cae por hechizo | ✅ | S3: `cast` sobre `defender-heroe` → batalla terminada → `battle_ended, hero_defeated, hero_returned(surr=false)` y el héroe en su base (20,20), con 0 de tropa y 0 de movimiento. |
| 4 (usuario) · **el héroe no bonifica a la tropa** | ✅ | Agente real: esqueletos con `attack 4 / defense 3` (los del catálogo) junto a un héroe 2/2. Lo vigila el test «golpe con héroe de ataque 0 y de 40». |
| 4 (usuario) · **el héroe entra sano** | ✅ | Agente real: Serena sale de la 1.ª batalla con 30 PV (le dio la flecha) y en la 2.ª, el día 2, el parte muestra que entró con 50: la flecha del rival `damage 20` es la que la deja en 30 antes de su primer turno. Test `topHp === heroUnit.hp`. |
| **5 · `surrender`, elegida por el jugador** | ✅ | `capturas`: botón «Rendirse (190 oro)» → «Derrota · Te has rendido por 190 de oro…» y −190 de oro en el espejo (`desktop-07-rendicion`). |
| 5 · elegida por **el agente**, por el contrato | ✅ | Agente real por MCP (puente `heroes`, `pnpm partida` con `HEROES_SEED=2`): `surrender` en `legalActions` → «✓ req-4: attacker-0: rendición, aplicada.» Oro 8000 → 7475 (reclutar) → 7250 (rendirse: ⌈(2·75+2·150)/2⌉ = 225). Serena vuelve a (19,19) con 4 individuos, `movePoints 0`, `hero_returned surrendered:true` y `garrison_taken` hasta 6. |
| 5 · elegida por **la IA de reglas** | ✅ | Banco: 457 rendiciones. `persona.mts`: la IA se rinde con el bando débil (semillas 2, 5 y 9). |
| 5 (usuario) · **conserva la tropa y paga el 50 %** del oro de la tropa que se salva | ✅ | S2: 4 arqueros, coste 300 = 4·150/2; oro 300 → 0; vuelve con 4. Agente: 225, como arriba. |
| 5 · rendirse **sin oro** | ✅ | S1: oro 0 → no está en `legalActions`; `surrenderBlocker` da «cuesta 300 de oro y tienes 0»; `applyAction` lanza «no se puede rendir: cuesta 300 de oro y tienes 0». En el navegador el botón apagado **no se ha visto**: ver «No probado». |
| 5 · rendirse **defendiendo la base** | ✅ | `adv2` D1: «defiendes tu base: no hay a dónde huir», no se ofrece, y el atacante sí puede. Agente real: un `surrender` mandado igual se descarta con ese motivo, y el veredicto le dice qué jugó la IA en su lugar. |
| **6 · el héroe derrotado vuelve a la base**, sin tropa y sin movimiento | ✅ | S3 y `capturas` semilla 6: `desktop-14` muestra «Tropa · 0 individuos», «Movimiento 0 / 1650», en el castillo. Orden de la crónica: `hero_defeated` → `hero_returned`. |
| 6 · la tropa muerta se pierde | ✅ | S3: cae con 3 individuos vivos y vuelve con 0. Lo vigila el test «cae con tropa en pie». |
| 6 · base **ocupada** | ✅ (solo test) | Tests «vecina libre» y «ocho vecinas tomadas». En partida no ocurre nunca: la IA no contrata un segundo héroe (lo declara el ingeniero). |
| 6 · base **perdida** | ✅ | Test «sin base, se borra». Agente real: tras perder la base, «acabas con 0 castillos y 0 héroes». |
| 6 (usuario) · **derrotado en su base, la base se conquista** | ✅ | D1: `battle_ended, town_captured, hero_defeated, player_defeated, game_over`; el héroe ya no existe y `game_over` es el último hecho. Agente real (2.ª partida): la base cae el día 2 y llega `game_over`. |
| 6 · derrotado defendiendo **otro** castillo suyo (regla A4) | ✅ | D2, rendido en un castillo que no es su base: el castillo pasa al 0, el héroe vuelve a (20,20) con 3, paga 113 y el atacante cobra +500 de experiencia. |
| **Regla ≤ 7 · reclutar al héroe** | ✅ | `adv2` T: «no cabe: el ejército ya lleva 6 de 6 individuos». `desktop-05b` lo muestra en la barra. |
| ≤ 7 · guarnición | ✅ | T: 7 entran; el 8.º da «no cabe: la guarnición ya lleva 7 de 7 individuos». Agente real: el `recruit` del 8.º se descarta con esa frase (veredicto de req-2). |
| ≤ 7 · `takeGarrison` | ✅ | T: el héroe entra con 7 en la guarnición → ejército 6, guarnición 1. Agente: 4 + 2 = 6 y quedan 5. |
| ≤ 7 · monstruos (generador y `validateMapPlan`) | ✅ | T: plan con `count: 8` → «el monstruo de (12,19) trae 8 × pikeman y un bando lleva como mucho 7». El banco mide un máximo de 7. |
| ≤ 7 · plan del agente | ✅ | Agente real: un plan con monstruos de 7 entra. `mapPlanSchema` acepta 8 (zod: `true`), y lo rechaza `validateMapPlan`, que es la puerta única: es el diseño declarado. |
| **9 · barrido 0 partidas sin terminar** | ✅ | 0/40. |
| 9 · navegador: partida con reclutamiento, batalla con el héroe y derrota que lo devuelve | ✅ | `capturas` (Playwright), mirado: `desktop-05b`, `desktop-07`, `desktop-08`, `desktop-14`, `sin-arte-02`. 0 errores de consola. |
| **10 · banco re-anclado mirando la forma**, `verify` y `qa` en verde | ✅ | Ancla `c36d3cc5…` igual. Forma publicada en `implementacion-1b.md` (0 imposibles, `hero_returned` presente). `verify` y `qa` en verde. |
| 10 · el contrato refleja `surrender` (esquema, prosa) | ⚠️ parcial | Esquema y `RESPONSE_FORMAT` sí. **El precio no viaja**: ver H-2. |
| El espectador ve una rendición | ⚠️ parcial | Ver H-3: la crónica dice «vuelve a su base tras rendirse», pero la línea del parte (con el precio) no se llega a ver nunca. |

## Hallazgos

### Importantes

**H-1. En el navegador, la IA se rinde POR la persona y le cobra el oro sin preguntar.**
- Qué pasa: las batallas en las que el rival ataca a la persona las resuelve `playAiTurn` sin `takeover` (`session.ts:420`). `autoResolve` → `chooseBattleAction` incluye ahora `convieneRendirse` también para el bando de la persona.
- Reproducción (`persona.mts`, el mismo `Session` que usa el navegador): `new Session(2)`; el héroe del jugador 0 fuera de casa con 2 arqueros y 4 campesinos, pegado al héroe 1 con dragón óseo, 2 liches y 3 vampiros; `endTurn()`. Resultado: `battle_started, battle_ended, hero_returned(surr=true, actor=0)`. El héroe acaba en (3,3) con 3 individuos. Lo mismo con las semillas 5 y 9.
- `ses.status` queda vacío. La crónica dice «Un héroe tuyo vuelve a la base tras rendirse» sin precio, y el oro baja sin una línea que diga cuánto ni que no lo decidió la persona.
- Frecuencia, medida en las 200 partidas IA contra IA (el asiento 0 es el de la persona): **81 rendiciones defendiendo, en 51 de 200 partidas**, sobre 573 defensas.
- Qué esperaba quien juega: decidir si se rinde («La puede elegir el jugador») o, como mínimo, que se le diga que se rindió por él y cuánto le costó.
- Que la persona no juegue sus defensas es anterior a 1b. Lo nuevo es que esa decisión ajena ahora gasta su oro y le hace retirarse.

**H-2. El agente no ve el precio de la rendición antes de rendirse, ni después.**
- El plan decía «`surrender` cuesta el oro que diga la lista». En el `battle_turn` real, `legalActions` trae `{"type":"surrender"}` sin coste, y el turno de batalla no lleva el oro del jugador: `JSON.stringify(payload).includes('gold') === false`. El veredicto es «✓ req-4: attacker-0: rendición, aplicada.», sin cifra.
- La prosa solo dice «proporcional a la tropa que salvas». El agente decide a ciegas una acción que le cuesta recursos, cuando la persona sí ve «Rendirse (190 oro)».
- Reproducción: `pnpm partida` + MCP `heroes_listen` en cualquier batalla que ofrezca rendirse (por ejemplo, el plan del monstruo de 7 espadachines pegado al inicio de `agente.mts`).

### Menores

**H-3. El espectador nunca enseña la línea de la rendición del parte («Se rinde el atacante por N de oro»), ni el «Fin: gana…».**
- El director emite el fotograma de la batalla terminada y, en el mismo tic, el del mapa ya liquidado (`director.ts`: `applyAction` → `frame()` → `settleBattle` → `frame()`).
- Con Playwright sondeando el texto cada 80 ms durante una rendición del agente (`agente.mts` + `mirar2.mjs`), solo aparecieron «Un héroe del jugador 1 vuelve a su base tras rendirse» y «Ha caído un héroe del jugador 1». En la primera partida (sondeo de 1,5 s) pasó igual. Sin errores de consola ni `pageerror`.
- El espectador se entera de que hubo rendición por la crónica, pero no del precio. Probablemente es anterior para cualquier final de batalla; lo nuevo de 1b es que la línea del precio solo vive ahí.

**H-4. En el tablero no se distingue al comandante de su tropa.**
- Con arte, el héroe usa la figura de Liora con el mismo aro que todos (`desktop-08`). Sin arte, es un círculo naranja «Ald» igual que «Cam» y «Arq» (`sin-arte-02`).
- Es la pieza que, si cae, pierde la batalla, y el 70 % de las batallas se deciden así. Quien juega solo lo encuentra pasando el ratón o leyendo «En el campo».
- El comentario de `personajes.ts:154` dice «lo distingue el aro o el bando», y en batalla eso no lo distingue.

**H-5. Rendirse con solo el héroe vivo (o solo personajes) cuesta 0 y se ofrece.**
- Es coherente con la regla del usuario («50 % del oro de la tropa que se salva») y el ingeniero lo declara para los personajes.
- Pero la consecuencia es que un héroe que se ha quedado solo siempre puede «rendirse» gratis en vez de caer: se ahorra el `hero_defeated` y, a cambio, el rival sigue cobrando sus +500. Hoy no cambia nada material: vuelve igual sin tropa.
- Lo apunto para el usuario, no como fallo.

**H-6 (fuera de alcance, anterior a 1b).** La primera `heroes_listen` de una partida nueva trajo «CÓMO FUE LO ANTERIOR: ✓ req-3: defender-0: movimiento a (7,4)», que es el veredicto de **otra** partida, retenido en el puente MCP de la sesión. Un agente lo leería como suyo.

## Workarounds usados

- **Estado sintético en los scripts de núcleo** (`adv1`, `adv2`, `persona`): pongo ejércitos a mano y muevo héroes. Solo sirve para alcanzar a la primera ramas que en el juego llegan tarde o por azar. Todas pasan por las mismas funciones que usa el juego (`applyAction`, `settleBattle`, `Session.endTurn`), así que no afecta a quien juega.
- **En S2 se ajustó `retreat.purse` a mano**, porque el monedero se congela al montar la batalla. Es legítimo: el oro no puede cambiar con una batalla pendiente (S2b: «hay una batalla pendiente de resolver»).
- **El mapa del agente lo diseñé yo** (un monstruo de 7 pegado al inicio) para forzar una batalla con rendición posible. Es exactamente lo que el contrato le permite a un agente, así que no es un atajo.

## No probado

- **El botón «Rendirse» apagado, con su motivo en el `title`, dentro del navegador.** Con 8 000 de oro iniciales y la defensa de la base jugada por la IA, la persona no llega a ese estado sin muchas construcciones. Lo cubren el núcleo (S1) y el código de `renderRendicion`, pero ninguna captura ni ancla de paneles lo pinta (las cinco del ancla son el botón activo).
- La persona defendiendo su base en el navegador: no juega sus defensas (ver H-1).
- La rama de búsqueda de `casillaDeVuelta` en partida real: no se da (solo tests).
- `tools/qa/enfrentamiento.ts`: no lo he corrido. Monta los bandos sin héroe y no mide nada de 1b, como ya publica el ingeniero.

## Veredicto

**Apto con reservas.**

Los criterios 4, 5 y 6, las cuatro decisiones del usuario y el tope de 7 se cumplen en el núcleo, en el navegador y con un agente real por MCP. El banco está en `c36d3cc5…`, el barrido en 0/40 y `verify`, `qa` y `capturas` en verde.

Las reservas son **H-1**, la IA que se rinde y cobra a la persona sin decírselo, y **H-2**, el agente que se rinde sin saber el precio. Ninguna rompe un criterio literal, pero las dos son decisiones de oro que alguien toma a ciegas. Conviene cerrarlas o abrirles issue antes del commit.

---

## Segunda pasada (re-verificación de H-1 a H-4)

Árbol sin commitear con la «Corrección de hallazgos de QA» de `implementacion-1b.md`. No he tocado código, `assets/art/` ni `CLAUDE.md`. Las sondas están en el scratchpad de la sesión: `telon.mts` (espectador con Playwright y un agente por WebSocket) y `barrido-persona.mts` (el `Session` del navegador). La instrumentación del telón y del animador se hizo **interceptando la petición del módulo en el navegador** (`page.route`), sin escribir en el repo. Todo lo que arranqué (vite, `ws-server` y Chromium) lo maté por su grupo. Al final, `ss -ltnp` deja libres 3100, 9880 y 9881, y no queda ningún `vite` ni `ws-server` vivo.

### Comprobaciones de base

| Orden | Resultado real |
|---|---|
| `pnpm verify` | exit 0 · 27 ficheros · **587/587** · 9,5 s |
| `pnpm banco` | sha `957a24864372e30d7d33e395a8afa63ee1f701055e437c9386147acaedfbb7b8`, 40 158 líneas, **ancla: igual**, 0/200 sin terminar, 2 595 ms |
| **Forma del re-anclaje** | Volcado propio (`--dump`): 457 líneas con `"surrendered":true`, y las 457 llevan `"surrendered":true,"gold":N`. Quitando ese `,"gold":N` con `sed`, el sha256 sale **`c36d3cc5596565ad445b990ad051fd216b1a4bb70ffac4ab089c0dcbba8f6449`, exacto**. El resto de líneas con `"gold"` (71) son hechos que ya existían, como cofres o recursos, y no cambian. **Confirmado: el re-anclaje solo añade `gold` a las rendiciones.** |
| `npx tsx tools/qa/barrido-semillas.ts` | 0/40 sin terminar · peor batalla en 9 rondas |
| `pnpm qa` | exit 0 · 2,95 s · 26 veredictos, 26 entraron · **«AVISO: ninguna batalla ofreció rendirse en esta partida»**: la comprobación nueva de `gold` en la `surrender` **no se ejerce** en el arnés. Sí se ejerce `yourGold` en las 22 decisiones. |
| `pnpm capturas` | exit 0 · 34,6 s · «sin errores en consola» · «espectador: el final de la batalla se ve antes del mapa». Pero ver H-7: la captura `espectador-03-final` no enseña el tablero final. |

### Agente real por MCP (puente `heroes` contra `pnpm partida`, `HEROES_SEED=2`)

Diseñé un plan con 7 vampiros pegados al inicio del jugador 1 y jugué como agente.

| Paso | Evidencia literal |
|---|---|
| Precio **antes** | `"yourGold": 8000` y `{"type":"surrender","gold":225}` en `legalActions` (2 esqueletos × 75 + 2 zombis × 150, al 50 %). |
| Precio **equivocado** (200) | `⚠ req-3: … se descartó (no se puede rendir por 200 de oro: ahora cuesta 225); la juega la IA de reglas en tu lugar: hechizo magic_arrow …`. La sustituta **no** es rendirse. |
| **El precio cambia** (muere un esqueleto) | `legalActions` pasa a `{"type":"surrender","gold":188}`. |
| Precio **viejo** (225) | `⚠ req-10: … (no se puede rendir por 225 de oro: ahora cuesta 188)`. La sustituta vuelve a ser un hechizo, no una rendición. |
| Rendición **sin `gold`** | `✓ req-11: attacker-1: rendición, aplicada. Has pagado 188 de oro, la batalla está perdida y tu héroe vuelve a la base con la tropa viva`. |
| **Después** | Día 2: oro 8312 = 8000 − 188 + 500 de renta. Serena en (20,20) con 1 esqueleto y 2 zombis. `recentEvents`: `hero_returned … "surrendered": true, "gold": 188`. |
| Sin base, pide rendirse igual | No se ofrece. `⚠ req-14: … (no se puede rendir: no tienes base a la que volver)`, y la sustituta es un hechizo. |

### Re-verificación

| Hallazgo | Veredicto | Evidencia |
|---|---|---|
| **H-1 · la IA no se rinde por la persona** | ✅ | Código: los cinco sitios donde la IA resuelve una batalla ajena pasan el veto (`session.ts:425` y `:757`; `director.ts:169`, `:184`, `:186`, `:242`, `:341` y `:367`). Los dos `chooseBattleAction(battle)` sin veto (`director.ts:299`, `session.ts:746`) juegan solo stacks del **otro** bando, el de la IA, así que no pueden rendir a nadie que no sea ella. Sonda `barrido-persona.mts`, el `Session` del navegador: 80 semillas con el héroe de la persona débil (2 arqueros y 4 campesinos), fuera de su base y a 3 casillas de un rival con dragón óseo, 2 liches y 3 vampiros. Resultado: **160 derrotas y 0 rendiciones `actor:0`**. Es la reproducción de la primera pasada, que con las semillas 2, 5 y 9 daba rendición. |
| H-1 · el agente | ✅ | Por MCP: dos acciones descartadas en batallas con la rendición ofrecida, y en las dos la sustituta fue `cast`. El test `agent-link` «la sustituta nunca es rendirse» pasa. |
| H-1 · **¿puede rendirse el agente él mismo?** | ✅ | Sí: req-11, arriba. |
| **H-2 · el precio en `legalActions`** | ✅ | 225, luego 188 al morir tropa. Una cifra distinta o vieja se rechaza diciendo el precio actual. Sin cifra, se cobra la actual. |
| H-2 · `yourGold` | ✅ | Está en cada `battle_turn` real (MCP y las 23 de `telon.mts`), y es el oro real del jugador (8000 y luego 8312). La consulta `battle_state` propia lo saca de `playerById(...).resources.gold`. |
| H-2 · veredicto y crónica con el precio | ✅ | «Has pagado 188 de oro» y `hero_returned.gold: 188`. En el cliente, `desktop-09` muestra «Te has rendido por 190 de oro» y «Te rindes por 190 de oro» en el parte. |
| **H-3 · el espectador ve el final** | ⚠️ cumple la letra, con un hallazgo nuevo (H-7) | `telon.mts`, semilla 2, 5 pasadas: el panel enseña «Fin: gana el atacante» en las 5, y la partida llega a «Gana el jugador 0» en las tres esperas largas. Recargando la página a mitad de batalla (6.º `battle_turn`), no hay errores de consola y llega igual al final. Pero el tablero no está en el final mientras el panel dice «Fin», y con un agente rápido el espectador se queda ~22 s detrás de la partida (H-7). |
| **H-4 · la corona** | ✅ con un detalle menor (H-8) | `desktop-08` y `desktop-13` con arte, y `sin-arte-02` sin arte: la ♛ sale sobre el héroe y no sobre la tropa. También sale en «En el campo» (`▶ ♛ Aldo de Valdeluz`) y en el panel del espectador. En `espectador-02/03`, sobre Aldo. |

### Hallazgos nuevos

**H-7 (importante). Con un agente rápido, el espectador enseña «Fin» con el tablero aún al principio, y se queda ~22 s detrás de la partida.**
- **Reproducción.** `pnpm partida` con `HEROES_SEED=2` y un agente que responde al instante con la política de `pnpm qa` (`politica.decidir`), mirando `/espectador/`.
  - Los fotogramas de la batalla llegan en unos 40 ms. El telón aplica de golpe todo lo no terminado, así que el animador recibe la batalla entera en el fotograma final. Lo medido con la instrumentación: `leidos 34`, cola de 14 pasos que avanza a uno cada ~520 ms, y `ocupado true` durante más de 5 s.
  - Mientras tanto, el panel ya dice «Fin: gana el atacante · Ronda 3» y lista solo a los supervivientes, y el tablero repite la batalla desde el principio. En `t71/fin1-0.png` se ven los 4 esqueletos en pie con la barra de vida vacía bajo «Fin: gana el atacante».
- **Lo que tarda.** Tras el `game_over` del servidor, el espectador sigue en «Día 3 · … · Fin» durante 16-17 s, pasa a la batalla del día 4 y no enseña «Gana el jugador 0» hasta los **+22 s**. Medido en dos pasadas: 22 s y 22 s. Con un agente que tarda 600 ms por decisión, sigue en la batalla final a los +8 s del `game_over`.
- **No es un cuelgue.** En las pasadas de 6 y 15 s parecía que no salía nunca, pero esperando 40 s siempre llega.
- **Lo que esperaba quien mira.** Que el «Fin» del panel aparezca cuando el tablero llega al final, y no un resumen que se adelanta al tablero.
- **El paso de `capturas` no lo ve, por dos motivos:**
  - Comprueba que se vea el texto `.desenlace`, no el estado del tablero, y la captura se hace en cuanto aparece el texto. `capturas/espectador-03-final.png` muestra esqueletos muertos en pie. Esto **contradice** la frase de `implementacion-1b.md` «con el tablero en su último estado».
  - Al ver el final llama a `ok()` y deja de responder, así que nunca comprueba que el espectador **siga** hasta el mapa ni hasta el fin de la partida.
- **Riesgo leído en el código, sin reproducir.** Al soltar la cola de golpe, `aplicar` solo recibe el último fotograma. Si ese fotograma es ya de **otra** batalla, `numeroDeBatalla` no sube, porque `vista.battle` seguía siendo la batalla anterior terminada. El animador solo se reinicia si el registro nuevo es más corto que lo leído. Con dos batallas seguidas en la misma ráfaga, la segunda podría animarse con las posiciones y las `caidas` de la primera.

**H-8 (menor). La corona es pequeña y queda debajo de la etiqueta del nombre cuando el héroe está activo o con el ratón encima** (`desktop-13`, `sin-arte-02`). Sin la etiqueta se ve bien. El propio informe del ingeniero ya avisa del riesgo de que falte el glifo `♛` en un sistema sin fuente que lo tenga.

**Observación.** `pnpm qa` sigue sin ninguna batalla que ofrezca rendirse, así que el `gold` de la `surrender` no lo ejerce el circuito automático: solo los tests de `agent-link` y esta pasada a mano.

### Workarounds usados

- `barrido-persona.mts` coloca el héroe de la persona y le asigna los ejércitos a mano. Es para alcanzar la defensa en campo abierto el primer día, y pasa por `Session.endTurn`, la misma puerta del navegador. No afecta a quien juega.
- El mapa del agente lo diseñé yo, que es lo que el contrato permite a cualquier agente.
- Para H-7 instrumenté `telon.ts` y `anim.ts` reescribiendo su respuesta en el navegador con `page.route`, solo para leer el estado. Las medidas de lag y las capturas son de pasadas **sin** instrumentar.

### No probado

- Una rendición **delante del espectador en el navegador**, con la línea «Se rinde … por N». Mis pasadas de `telon.mts` no tuvieron ninguna batalla con rendición ofrecida, igual que `pnpm qa`, y la partida MCP la jugué sin el espectador abierto. Lo cubre el test de escena, no un navegador.
- El botón «Rendirse» apagado en el navegador, como ya decía la primera pasada.
- El fallo de `numeroDeBatalla` descrito en H-7: es lectura de código, no lo he reproducido.

### Veredicto de la segunda pasada

**Apto con reservas.**

H-1, H-2 y H-4 están cerrados con evidencia real: el agente por MCP ve el precio antes, se le rechaza un precio viejo diciéndole el nuevo, paga lo que dice el veredicto, y la IA no se rinde ni por la persona (0 de 160) ni por el agente. El banco solo se movió por el `gold` de las rendiciones, comprobado al byte. `verify`, `banco`, el barrido, `qa` y `capturas` salen en verde.

H-3 cumple lo que pidió el coordinador: el final se ve y aguanta 2,5 s con el animador quieto. Pero abre **H-7**: con un agente rápido, el panel anuncia el final mientras el tablero aún lo está contando desde el principio, y el espectador acumula ~22 s de retraso. Además, el paso de `capturas` que debía vigilarlo da verde sobre una captura que enseña precisamente eso. Conviene corregir H-7, o como mínimo el paso de `capturas` y la frase del informe, antes del commit. No bloquea el commit: es el visor y no altera ninguna partida.
