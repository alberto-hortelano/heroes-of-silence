# QA — el agente defiende, y se entera de cómo le fue

Validado contra `requisitos.md`, **con sus dos secciones finales mandando**
(«Correcciones tras la crítica» y «Visto bueno al plan»). Los criterios de la
primera mitad que esas secciones corrigieron o retiraron **no** se usan como
referencia; se dice cuáles y por qué en cada fila.

Todo lo de abajo está ejecutado en este árbol de trabajo, sin commitear y sin
tocar una línea de producción: el `git status` de salida es idéntico al de
entrada (27 entradas, `19 files changed, 1219 insertions(+), 233 deletions(-)`).

---

## Criterios

### #29 — el agente defiende

| Criterio | | Evidencia |
|---|---|---|
| **29.1** La batalla en la que le atacan se le ofrece **acción a acción**, con `battle_turn` y bando `defender` | ✅ | Circuito real (servidor ⇄ WS ⇄ puente MCP ⇄ stdio). `pnpm qa`: `3 turnos de mapa y 12 decisiones de batalla`, las 11-12 dentro de `[servidor] día 4 · jugador 0 · reglas` — el turno del RIVAL. Sonda propia con volcado: 13 `battle_turn` seguidos, todos `yourSide=defender` |
| **29.2** Lo que ve como «mío» y «enemigo» está bien orientado defendiendo | ✅ | En cada petición defendiendo: `activo=defender-0 (side=defender)`, `heroSpells=["magic_arrow"]` (los del héroe del agente). Núcleo: `battleOwners = {"attacker":0,"defender":1}`, `serializeBattleTurn(…,'defender')` → `stacks defender = ['30×skeleton']` (su guarnición) / `attacker = ['24×peasant','6×archer']` |
| **29.3** Sin agente, o si falla o tarda, la partida **no se detiene** | ✅ | Maté el puente a mitad de batalla: `[director] El agente falló en la batalla (…); la termina la IA.` y la partida siguió hasta el día 6. Tests `sin agente conectado, juega la IA de reglas` y `si el agente se calla defendiendo, la termina la heurística y el turno pasa` |
| **29.4** `playAiTurn` no queda roto ni obligado a conocer al director; `core` sigue puro | ✅ | `npx tsx tools/qa/barrido-semillas.ts` → `sin terminar: 2/40 → [9, 18]` · `peor caso 8 rondas`, clavado en la medida previa. Guardia de frontera nuevo, comprobado en rojo (abajo). `pnpm dev` juega sin agente |
| **29.5** Test de agente defensor que responde + otro que se calla | ✅ | `test/agent-link.test.ts`: `el rival le ataca un héroe`, `también defiende un castillo suyo…`, `si el agente se calla defendiendo…` — leídos, montan el escenario de verdad (rival plantado con puntos de movimiento exactos) y no relajan asertos |
| **Racimo** El segundo `'attacker'` cableado (`ws-server.ts:35`) | ✅ | `responderConsulta(state,'battle_state',{player:1})` → `yourSide = defender`; `{player:0}` → `attacker`; `{player:9}` → vista del atacante **con nota** `el jugador 9 no está en esta batalla…` |
| **Visto bueno 1** El **pueblo atacado entra**, sin murallas | ✅ | `foe = {"kind":"town","townId":"town-1"}` → `battleOwners.defender = 1`; vista `defender` con `hero = null` y la guarnición como suya. Tablero raso (sin murallas), que es lo pedido |
| **Pregunta abierta 4** El agente con los **dos bandos**: se le pregunta por cada uno | ✅ | `sidesOwnedBy(state,pending,[0,1]) = ['attacker','defender']`; `director.playBattle` pregunta con `s.side` del stack activo. `consultas.ts` da la vista del atacante **y lo dice**: `el jugador 0 lleva los dos bandos de esta batalla…` |

### #31 — el agente sabe cómo le fue (criterios de «Correcciones tras la crítica»)

| Criterio | | Evidencia |
|---|---|---|
| **31.1** Tras un turno de aventura, `result` con `ok: true` y nota con cuántas entraron y cuáles se descartaron con motivo | ⚠️ | Cumple en el caso normal, **falla si el agente mete `end_turn` a media lista**: ver hallazgo **B**. Caso normal (circuito real): `✓ req-1: Turno del día 1: 3 de 4 acciones aplicadas, 1 descartada (…)` + `- build castle en town-1: no se puede construir Castillo: ya se ha construido hoy en este pueblo` |
| **31.2** Tras una acción de batalla rechazada, se le dice qué se jugó y **qué le costó** — el turno de la unidad **o** el maná —, sin afirmar cuál sin medirlo | ✅ | Las dos ramas salieron en la misma partida real: `⚠ req-6: … movimiento a (6,2). Eso ha consumido el turno de defender-0 en esta ronda.` y `⚠ req-5: … hechizo magic_arrow sobre attacker-0. Eso NO ha consumido el turno de defender-0 —se te volverá a pedir acción para ella—, pero le ha costado 3 de maná a Serena la Pálida.` **Contrastado contra el estado real**: el `hero.mana` de la petición siguiente iba 20 → 17 → 17 → 14 → 14 → 11, exactamente los 3 que decía cada nota. Y la promesa «se te volverá a pedir acción para ella» se cumplió 3 de 3 (`req-5→req-6`, `req-8→req-9`, `req-11→req-12`, mismo `defender-0`). Con `manaGastado = 0` la nota **no** cobra maná: `…—se te volverá a pedir acción para ella—.` |
| **31.3** El puente entrega el veredicto **también cuando fue bien**, y lee `note` en las dos ramas | ✅ | Bloque `CÓMO FUE LO ANTERIOR:` en cada `heroes_listen`, con `✓` y con `⚠`, y la `note` en las dos |
| **31.4** `ultimoVeredicto` deja de perder mensajes con dos seguidos | ✅ | `ColaDeVeredictos`: dos anotados → `recoge()` devuelve los dos en orden; la segunda llamada devuelve `""` |
| **31.5** `report()` es llamable: el director ve el `requestId` | ✅ | `ask()` devuelve `AgentAnswer<T> = { requestId, data }`; los tres `report(respuesta.requestId, …)` del director. Sin eso no compila |
| **31.6** Nota escrita para un modelo, concreta, y **sin muro de texto** cuando salió bien | ✅ | Turno limpio: **45 caracteres, una línea** — `Turno del día 12 aplicado entero: 5 acciones.` Acuse de acción aceptada: **27** — `a1: disparo a d2, aplicada.` (real: `✓ req-3: defender-0: defensa, aplicada.`) |
| **31.6 del texto viejo** («`pnpm qa` lo ejerce de verdad») | — | **Retirado por la crítica**, es #44. No se valida. Como dato: `verify-agent.ts` sigue sin mirar el bloque de veredictos; lo ejercí yo con una sonda equivalente |
| **Visto bueno 3** Informe **siempre**, también cuando la acción de batalla coló | ✅ | `✓ req-3: defender-0: defensa, aplicada.`, uno por acción, en el circuito real |
| **Visto bueno 3** Tope de la cola **redimensionado con un número justificado** | ✅ | `MAX_VEREDICTOS = 40`, justificado en el código (batalla de 5×5 a 8 rondas, y 8 es el peor caso medido por el barrido: lo reproduje). Con 45 anotados quedan las 40 últimas (`req-6` … `req-45`). Ver observación **H** sobre el descarte silencioso |

### Cierres transversales

| Criterio | | Evidencia |
|---|---|---|
| **Decisión 3** Guardia `core ⇏ src/server` en `invariantes.test.ts`, **que muerde** | ✅ | Metí el import documentado en `src/core/ai/turn.ts` → `× core no conoce al servidor… + "src/core/ai/turn.ts:1 → import type { Director } from '../../server/director.js';"`. Quitado, 8 en verde. Agujero menor de la expresión regular: hallazgo **F** |
| **Visto bueno 2** El turno ajeno se cierra **por el lado del núcleo**, fail-loud y con motivo | ✅ | `applyAdventureAction(state, …, ctx, 1)` con `state.current = 0` rechaza **las cinco** acciones (`build`, `hire_hero`, `recruit`, `end_turn`, `move_hero`) con `todavía no es tu turno: ahora juega Jugador 1`. `quien` es **obligatorio**: no queda vía de entrada sin guardar (los 5 puntos del cliente pasan `this.viewer`, los 5 de `playAiTurn` pasan `player.id`, los 2 del director pasan `playerId`) |
| **Visto bueno 2** …**y por el lado del cliente** (bandera de reentrada) | ✅ | Quité la guarda de `run()` → `× construir en turno ajeno se rechaza… expected '' to be 'Espera: el turno del rival aún se está resolviendo.'` — y con la guarda fuera el núcleo **no** lo tapa, porque en esa ventana `state.current` ya ha vuelto. Los dos lados hacen falta, no es redundancia |
| **Decisión 1** El contagio de `async` no rompe nada | ✅ | `pnpm verify` verde: **178 tests, 9 ficheros**, `typecheck` incluido. Barrido sin mover una semilla |
| **Hallazgo del coordinador** El agente no se queda colgado al acabar la partida | ✅ | `pnpm qa` verde **dos pasadas seguidas**, idénticas (`3 turnos de mapa y 12 decisiones de batalla`, EXIT=0), puertos 9880/9881 libres y cero procesos vivos después de cada una |
| **`pnpm dev`, el flujo real** | ✅ | Fin de turno: *Día 1 → Día 2*, oro 8000 → 8500, la crónica trae el turno del rival y el control vuelve. Castillo: Gremio de magia I construido (torre + `ENSEÑA: Prisa, Flecha mágica, Lentitud`), campesino reclutado (12 disp → 11, guarnición 1, oro 8000 → 5980). Batalla del mapa: escena correcta, `Defender`, `Resolver sola`, vuelta al mapa con `Batalla resuelta` y +2 de experiencia. **Consola limpia**: solo `[vite] connected` y `[assets] 139 imágenes generadas cargadas`. Ni un error, ni un `unhandledrejection` |

---

## Las tres afirmaciones que se me pidió comprobar

**1 · «`quien` pasó a ser obligatorio y el turno ajeno se cierra por los dos
lados».** ✅ **Cierto y completo.** La firma lo exige, los 12 llamantes lo pasan,
las cinco acciones se rechazan, y comprobé que la guarda del cliente muerde. No
encontré ninguna vía de entrada sin guardar: los otros puntos del cliente que
tocan el núcleo (`playBattleAction`, `autoResolveBattle`, `finishBattle`) solo
existen dentro de una batalla, que en el flujo local solo nace en el turno de la
persona. `openTown` no tiene guarda y no la necesita: solo cambia de pantalla, y
`build`/`recruit`/`hireHero` sí la tienen.

**2 · «El `result` de un plazo agotado no llega si lo que falló fue el socket».**
✅ **Cierto para ese camino**, ⚠️ **pero la limitación es más ancha de lo
declarado en una dirección que importa**: hay un caso en el que el `result` **sí
llega y miente**, y se lo lleva un agente al que no le pasó nada. Es el hallazgo
**A**. Enumerado el resto: el plazo agotado con socket vivo sí entrega (test
`si el agente se calla… y se le DICE que llegó tarde`, verde), la respuesta
inválida también, y los tres `report` del director también salvo que el agente
se haya ido entre medias — que es la misma limitación declarada.

**3 · «Cada arreglo de la Parte 1 comprobado en rojo».** Elegí **A** y **E**.
- **A** (`gameOver` reenviado desde `attach`): ✅ **reproduce exactamente**.
  Quité el reenvío → `× quien conecta DESPUÉS del final también se entera →
  expected [] to have a length of 1 but got +0`.
- **E** (plazo de consulta): ⚠️ **la receta escrita no reproduce.** El informe
  dice «con el plazo de consulta a una hora → ×». Puse
  `PLAZO_CONSULTA_MS = 3_600_000` y `test/buzon.test.ts` sigue en **14 verdes**,
  porque el test inyecta su propio plazo (`new Buzon(60)`). El guardia **sí
  muerde** cuando se rompe el mecanismo: vaciando el cuerpo del `setTimeout` sale
  `× una consulta que no responde NUNCA se rinde sola → 'la espera se ha quedado
  colgada'`. O sea: el arreglo está probado, la frase del informe no describe lo
  que se hizo. De propina comprobé en rojo el guardia de frontera (receta exacta,
  reproduce) y la guarda de turno del cliente (reproduce).

---

## Hallazgos

### A · **importante** — al reconectar el puente, la petición del agente NUEVO muere con el `close` del viejo

`AgentLink.attach()` cierra el socket anterior; el `close` de ese socket viejo
llega **después**, y llama a `failAll()` **sin comprobar que siga siendo el
socket activo**. La guarda existe para una de las dos líneas y no para la otra:

```ts
socket.on('close', () => {
  if (this.socket === socket) this.socket = null;   // ← guardado
  this.failAll(new Error('el agente se ha desconectado'));  // ← sin guardar
});
```

Consecuencias: el agente recién conectado **pierde su primer turno**, y el
veredicto que recibe **es falso** — le dice que se desconectó cuando está
perfectamente conectado, y le pide que no conteste.

**Reproducción desde el arranque**, dos formas:

1. Aislada y determinista (`AgentLink` + dos sockets):
   agente A recibe `req-1` y no contesta → conecta B → B recibe `req-2` y tarda
   400 ms en contestar → `req-2 → FALLA req-2: el agente se ha desconectado`, y a
   B le llega
   `⚠ req-2: No llegó tu respuesta a "adventure_turn": el agente se ha desconectado…`
2. En el circuito real: `pnpm server` + puente MCP, matar el puente a mitad de
   una batalla y conectar otro. Salida literal del servidor:
   ```
   [servidor] el puente del agente se ha conectado
   [director] El agente falló en la batalla (otro agente ha tomado el relevo); la termina la IA.
   [agente] conectado: heroes-mcp
   [director] El agente no pudo jugar el turno (el agente se ha desconectado); toma el relevo la IA de reglas.
   [servidor] día 4 · jugador 1 · reglas · 0 acciones · 1 rechazadas
   [agente] respuesta a una petición que ya no existe: req-4
   ```

**Qué esperaba quien juega:** que reconectar el puente cueste, como mucho, la
decisión que estaba a medias — no la siguiente; y que el motivo que le den sea
verdad.

### B · **importante** — las acciones que van después de un `end_turn` se pierden en silencio, y la nota dice «aplicado entero»

`director.ts` hace `break` al ver `end_turn` en la lista, y las que quedan detrás
no se aplican, no entran en `problems` y no se cuentan en `pedidas`
(`pedidas = aplicadas + problems.length`). El agente recibe `ok: true` y una nota
que afirma lo contrario de lo que pasó.

**Reproducción:** un agente responde a `adventure_turn` con
`[move_hero, end_turn, build, recruit]`. Medido:

```
informe: {"player":0,"by":"agent","actions":1,"problems":[]}
veredicto: { "ok": true, "note": "Turno del día 1 aplicado entero: 1 acción." }
```

Dos acciones desaparecidas y cero palabras sobre ellas. Choca de frente con
`RESPONSE_FORMAT.adventure_turn` («Al cerrar el turno se te dice cuántas
acciones entraron y, si se descartó alguna, cuál y por qué»), con el criterio
#31.1 y con el motivo del usuario para pedir informe siempre («un silencio es
ambiguo»). Y `end_turn` **está en la lista de acciones válidas** del contrato,
así que no es un uso retorcido.

Lo mismo pasa con el `break` de `state.finished !== null`, aunque ahí importa
menos porque la partida se acabó.

### C · **menor** — un relevo entre dos `heroes_listen` se le cuenta al agente como «se ha perdido la conexión»

`Buzon.esperaInterna` despierta a la escucha anterior con
`{ clase: 'corte', motivo: 'otra llamada a heroes_listen ha tomado el relevo de esta' }`,
y `textoDeEscucha` lo redacta con `textoDeCorte`. Lo que lee el agente:

```
SE HA PERDIDO LA CONEXIÓN CON LA PARTIDA · otra llamada a heroes_listen ha tomado el relevo de esta.

No consta si la partida había terminado o si el servidor se ha caído: se cortó
antes de decirlo, y las consultas viajan por ese mismo canal, así que preguntarlo
ahora tampoco serviría. …
```

Nada de eso es cierto en ese caso: el canal está vivo, las consultas responden y
la partida sigue. Además `verify-agent.ts` trata `PREFIJO_CORTE` como **rojo
duro** (`el canal con la partida se ha muerto`), así que un relevo se
diagnosticaría como circuito roto. Es la única prosa del racimo que afirma algo
que no ha medido, que es justo lo que el ciclo vino a arreglar en las demás.

Lo que sí está bien en ese camino, y lo comprobé: los veredictos **no** se los
lleva la escucha relevada, y la buena los recibe enteros (hallazgo D del
`/simplify`, funcionando).

### D · **menor** — tras un corte, `heroes_listen` manda responder a una petición que ya no existe

`Buzon.corta()` limpia consultas y pendientes pero **no** `recogida`. Medido:

```
recogida tras espera: req-1
recogida DESPUÉS de corta(): req-1
→ heroes_listen contestaría: isError «Tienes la petición req-1 recogida y sin
   contestar. Responde con heroes_respond antes de volver a escuchar.»
```

O sea: el texto del corte le dice «vuelve a llamar a heroes_listen y el puente se
reconecta solo», y si lo hace se encuentra con que le exigen contestar a una
petición muerta. No es un cuelgue —`heroes_respond` falla con una frase legible y
suelta la petición—, pero son dos vueltas y un consejo que se contradice con el
anterior.

### E · **menor** — `turnBlocker` nombra al jugador con una numeración distinta de la que ve el agente

`turnBlocker` devuelve `ahora juega ${playerById(state, state.current).name}`, y
`name` es 1-based: con `state.current === 0` la frase dice **«ahora juega Jugador
1»**. Todo lo demás que lee el agente usa el id (`jugador 0 (knight)`,
`jugador 1 (necromancer)` en `notaFinDePartida`, `owner` en el estado
serializado). Para la persona en el navegador la frase es correcta
(`Jugador 2` = el rival); para el agente sería confusa. Hoy **no es alcanzable
por el agente** —el director siempre pasa el jugador de turno— así que es
prevención, pero la frase ya viaja por el canal del agente vía `problems`.

### F · **menor** — el guardia de frontera no ve un `import` de efecto lateral

```
import '../../server/director.js';   // en src/core/ai/turn.ts → los 8 guardias en VERDE
```

La expresión regular es `/(from|import\()\s*['"]…/` y un `import 'ruta';` sin
`from` se cuela. Con la receta documentada (`import type … from …`) sí muerde,
así que el agujero es estrecho — y es **el mismo** que ya tenía el guardia de
`node:` (`/from ['"]node:/`), o sea que no lo trae este ciclo. Lo digo porque el
usuario pidió explícitamente comprobar que ese guardia muerde.

### G · **menor, no reproducido** — la nota del `cast` sustituto promete algo que puede no cumplirse

`notaAccionSustituida` dice siempre, para un `cast`, «se te volverá a pedir
acción para ella». Si ese hechizo **termina la batalla** —`spellValue`
(`tactics.ts:77`) valora explícitamente el golpe que mata, `min(daño, hp)`— el
bucle de `playBattle` sale por `battle.finished !== null` y al agente no se le
pregunta nada más. Lo observé cumplido 3 de 3 veces en el circuito real; el caso
contrario no lo conseguí forzar, así que lo dejo como razonado sobre el código y
no como medido.

### H · observación, no hallazgo — el descarte de la cola de veredictos es silencioso

El plan pedía `…y N avisos más, descartados` y el hallazgo N del `/simplify` lo
quitó por inalcanzable. Lo comprobé: con 45 anotados quedan los 40 últimos y no
se dice nada. El argumento («el protocolo no deja llegar ni a tres») es correcto
hoy, pero el día que el servidor mande algo que el agente no ha pedido —el
`game_over` ya es uno— la red muerde sin avisar. Es exactamente el punto 4 del
backlog del plan, y ahí sigue.

---

## Lo que está bien, y merece decirse

- **#29 funciona de punta a punta por MCP real, no solo en tests.** 12 decisiones
  de batalla defendiendo, con el bando y los stacks bien orientados, contra 0
  antes del racimo.
- **La prosa del maná dice la verdad y la mide.** Es lo que más me costaba
  creer y es lo que mejor aguantó: los 3 de maná de cada nota cuadran con el
  `hero.mana` que trae la petición siguiente, y con `manaGastado = 0` no se cobra
  nada. Las dos ramas nunca aparecen juntas.
- **El cuelgue del final está cerrado por los tres sitios que hacían falta**: el
  que espera se entera, el que vuelve a escuchar después recibe lo mismo en 1 ms,
  y el puente que **conecta por primera vez tras el final** también (11 ms).
  Responder tras el final devuelve una frase útil en vez de reventar.
- **Los caminos tontos del puente están todos cerrados**: responder sin escuchar,
  responder dos veces, dos escuchas a la vez. Ninguno cuelga y los cuatro dan una
  frase que dice qué hacer.
- **La guarda de turno del cliente no es redundante con la del núcleo**, y lo
  demuestra el rojo: al quitarla, el núcleo deja pasar la construcción porque en
  esa ventana `state.current` ya ha vuelto a ser el nuestro.
- **`pnpm qa` es repetible**: dos pasadas idénticas, puertos liberados y cero
  procesos vivos después. El arreglo del grupo de procesos (`detached`) sí sirve.
- **El barrido no se ha movido una semilla** pese al contagio de `async`.
- **El navegador está limpio**: ni un error de consola en toda la sesión —mapa,
  castillo, batalla, derrota y partida nueva—.

---

## Workarounds usados

| Workaround | Veredicto |
|---|---|
| Sondas propias en el *scratchpad* (agente MCP con política adversaria, `AgentLink` sobre `ws` suelto, llamadas directas a `notas.ts`/`Buzon`/`ColaDeVeredictos`) | **No afecta a quien juega.** Son un segundo cliente del mismo circuito público; no toqué producción y el árbol quedó idéntico |
| Romper cinco arreglos a mano para verlos en rojo (A, E, frontera, `run()` de la sesión) | **No afecta.** Cada fichero restaurado y verificado por `md5sum` + `git diff --stat` |
| `HEROES_MAX_DAYS=12`, `HEROES_WAIT_AGENT_MS=30000` en las sondas | **No afecta**: son los mismos valores que usa `pnpm qa` |
| Leer el DOM con `javascript_tool` mientras la pestaña estaba en segundo plano | **Sí me engañó a mí**, y lo apunto por honestidad: `requestAnimationFrame` está congelado y el DOM devuelve valores viejos (leí «Día 2» cuando el estado iba por el 3). Las medidas del navegador de este informe salen todas de capturas con la pestaña activa. **No es un fallo del producto** |

---

## No probado

- **El agente defendiendo un castillo, por el circuito MCP real.** Sí está
  probado por test y sí verifiqué el mecanismo entero en el núcleo
  (`battleOwners`, `sidesOwnedBy`, `serializeBattleTurn`, `battle_state`). Lo que
  no conseguí es que la IA estratégica decidiera atacar el castillo en una
  partida real con `pnpm server`: colocar al rival al lado no basta, decide
  `chooseHeroDestination`. Queda como **no probado end-to-end**.
- **Que una acción de batalla rechazada cuyo sustituto es un `cast` que termina
  la batalla contradiga la nota** (hallazgo G): razonado, no forzado.
- **El plazo de consulta de 30 s en el circuito real**: ninguna consulta tarda.
  Lo cubre `buzon.test.ts` con el plazo inyectado.
- **La reentrada del cliente con un ratón de verdad.** Confirmé el diagnóstico
  del ingeniero: sin *takeover*, el turno del rival no llega a ningún `await`
  real y se resuelve dentro de la misma tarea, así que dos pulsaciones humanas no
  pueden solaparse. Esa mitad la demuestra `test/session.test.ts`, que comprobé
  en rojo.
- **`ws-server.ts`** sigue sin test (abre dos puertos al importarse); lo ejercen
  `pnpm qa` y mis sondas.
- **Fuera de alcance declarado y no evaluado**: la persona defendiendo en el
  navegador, murallas (#7), acuse/contrapresión de la cola, el resto de #44,
  `map_generate`/`hero_banter`, el canal de espectadores.
- **Presupuesto de fal.ai: 0 €.** No toqué `tools/gen/`, `spend.json`, `data/`
  ni `assets/`.
- **Observación heredada, confirmada**: quien solo pulsa «fin de turno» pierde
  el día 3 (lo vi: *Partida perdida · Derrota: el enemigo se ha quedado con
  todo*). El ingeniero lo midió en las dos orillas con cinco semillas; no lo
  re-medí y no lo cuento como hallazgo de este racimo.

---

## Veredicto

**Apto con reservas.**

Lo pedido está entregado y comprobado en el flujo real, no solo en tests: el
agente defiende con el bando bien puesto —héroe y castillo—, recibe informe de
cada respuesta con `ok: true` incluido, la nota del coste **mide** el maná y
cuadra con el estado, el turno ajeno está cerrado por los dos lados con `quien`
obligatorio, el guardia de frontera muerde, `pnpm verify` da 178 verdes,
`pnpm qa` da dos pasadas limpias con 12 decisiones de batalla y el barrido no se
ha movido.

Las reservas son dos, y las dos viven en el terreno que este racimo dice
proteger —que al agente se le diga la verdad—:

1. **A**: reconectar el puente le cuesta al agente un turno extra y el veredicto
   que recibe es falso. Es una línea (`if (this.socket === socket)`), pero está
   en el camino que el ciclo ya ha visto fallar dos veces.
2. **B**: un `end_turn` a media lista tira las acciones siguientes en silencio y
   la nota afirma «aplicado entero». Es el silencio ambiguo que el usuario pidió
   expresamente eliminar, en el único hueco que quedó.

Ninguna de las dos rompe la partida ni bloquea a nadie: por eso es «con
reservas» y no «no apto». Con **A** y **B** corregidos —y **C** redactado como lo
que es, un relevo y no un cable roto— esto es apto sin matices.

---
---

# Segunda vuelta — 2026-08-24

Vuelta **acotada**: se re-verifican los dos importantes (**A**, **B**) y los
cinco menores de `hallazgos-qa.md`, y se hace una pasada adversarial **nueva**
por el ciclo de vida del socket y el conteo de acciones del director. No se
repite la validación de #29/#31 de la primera vuelta.

Todo ejecutado en este árbol de trabajo. **El árbol de salida es idéntico al de
entrada**: 27 entradas de `git status`, `19 files changed, 1450 insertions(+),
237 deletions(-)`, y los tres ficheros que rompí a mano para comprobar guardias
están restaurados con `sha256sum` idéntico (se dice cuáles abajo). Puertos
9880/9881/3100 libres antes y después de cada pasada, y cero procesos de
`ws-server.ts`, `mcp/server.ts` o `vite` vivos al terminar.

Línea base: `pnpm verify` → **186 tests en 9 ficheros**, verde, al abrir y al
cerrar la vuelta.

## Re-verificación de los hallazgos

| Hallazgo | | Evidencia |
|---|---|---|
| **A** · el `close` del socket viejo mata la petición del nuevo | ✅ | Arreglado: `agent-link.ts:107` `if (this.socket !== socket) return;`. Ver el desglose de determinismo y del caso simétrico abajo |
| **B** · un `end_turn` a media lista tira lo siguiente en silencio | ✅ | **9 formas de lista** probadas contra un `Director` real: en las 9, `actions + problems === longitud de la lista`. Y por el **circuito MCP real**: `✓ req-1: Turno del día 1: 2 de 4 acciones aplicadas, 2 descartadas` con las dos descartadas nombradas |
| **Menor 1** · el relevo redactado como cable roto | ✅ | `Buzon` real: dos `espera()` → la primera vuelve `clase:'relevo'`, su texto empieza por `ESCUCHA RELEVADA`, **no** contiene `SE HA PERDIDO LA CONEXIÓN`, y va marcada `isError`. La segunda sí se lleva la petición |
| **Menor 2** · `recogida` sobrevive al corte | ✅ | Recogida `req-9` → `corta()` → `enCurso === null`, y `haTerminado === false` (se puede reconectar). Y el relevo **no** le roba la recogida a la escucha buena: con `req-7` recogida, una escucha de sobra vuelve con `relevo` y `enCurso` sigue siendo `req-7` |
| **Menor 3** · dos numeraciones para el mismo jugador | ✅ | `describePlayer` → `jugador 0 (knight)`. Comprobado que `player.name` (`Jugador ${id+1}`, `setup.ts:90`) **ya no lo lee nadie que el agente vea**: su único lector en `src/` es el `broadcast()` del canal de espectadores (`ws-server.ts:67`). Circuito real: `Gana el jugador 0 (knight)… Tú llevabas al jugador 1 (necromancer)` |
| **Menor 4** · el guardia ciego a `import 'ruta';` | ✅ | Cierra el hueco — y el hueco era **más ancho y más viejo** de lo que dice el informe. Ver la sección propia |
| **Menor 5** · el `cast` sustituto que promete una petición que no llegará | ✅ | Las dos ramas leídas **verbatim**, y la prosa es correcta en las dos. Ver la sección propia |
| **Corrección al informe** (receta de E, limitación del `result`) | ✅ | Las dos reescritas en `implementacion.md:1005-1018`, y ahora describen lo que se verificó |

## A · determinismo y caso simétrico

**El test del ingeniero es un detector determinista, no una lotería.** Medido:

```
con el arreglo      → 10 pasadas, 10 verdes
sin el arreglo      → 15 pasadas, 15 ROJAS
```

Es decir: `viejo.socket.pause()` fija el orden de verdad. La técnica es sólida
—pausado, el socket no contesta al cierre y su `close` se queda esperando—, y no
depende de ninguna ventana de milisegundos.

**El caso simétrico está cubierto, y conviene separarlo en dos**, porque solo
una mitad es peligrosa. Arnés propio, 15 vueltas × 4 casos:

| Caso | con arreglo | sin arreglo |
|---|---|---|
| `A-sym-a` · el `close` del viejo llega **después** de que el nuevo respondiera, **sin nada en vuelo** | 15/15 ok | 15/15 ok — inofensivo: `failAll` no encuentra nada que matar |
| `A-sym-b` · igual, pero con una **2ª petición en vuelo** | 15/15 ok | **15/15 MUERTA: `el agente se ha desconectado`** |
| `A-triple` · tres agentes en cadena, dos cierres tardíos en orden inverso | 15/15 ok | **15/15 la petición del tercero muere** |
| `A-regresion` · un agente solo que se cae **de verdad** | 15/15 rinde `el agente se ha desconectado` y `connected === false` | igual |

La última fila importa: la guarda **no** se ha pasado de celosa — una
desconexión real sigue rindiendo lo que hay en vuelo y sigue diciéndoselo.

### Y lo he ejercido en el CIRCUITO REAL, que el informe daba por no cubierto

`implementacion.md:1069` dice «el relevo no se ejerce en el circuito real: el
arnés escucha en serie». Se puede: **dos puentes MCP**, con el viejo congelado
(`SIGSTOP`) para que su `close` no llegue hasta que yo quiera.

```
servidor real ⇄ WS ⇄ puente A (stdio)      A recoge req-1 y NO contesta
                                            SIGSTOP a A → su close queda en el aire
              ⇄ WS ⇄ puente B (stdio)      B conecta, pide turno
                                            SIGCONT+SIGKILL a A → su close llega ahora
```

**Con el arreglo** (log del servidor y respuesta de B):

```
[director] El agente no pudo jugar el turno (otro agente ha tomado el relevo); …   ← correcto: es req-1, de A
B recibe: "Petición req-2 · kind: adventure_turn"
B responde: "Respuesta a req-2 entregada. Vuelve a heroes_listen."
```

**Con el arreglo revertido**, en el mismo guion, aparece la línea exacta que
levantó el hallazgo en la primera vuelta:

```
[director] El agente no pudo jugar el turno (el agente se ha desconectado); toma el relevo la IA de reglas.
```

Queda cerrado: **A está arreglado y comprobado también fuera del test unitario.**

Un matiz que conviene dejar escrito, porque no lo cubre el arreglo: **el puente
que responde no se entera de que su respuesta se descartó.** Sin el arreglo, B
recibía igualmente `Respuesta a req-2 entregada` porque el puente no sabe lo que
el servidor hizo con ella. No es un hallazgo de este ciclo —es el acuse que la
cola de veredictos no tiene, ya anotado como fuera de alcance—, pero es el
motivo de que el detector fiable sea el log del servidor y no la respuesta del
puente.

## B · ¿cuadran siempre los números?

Sí en las nueve formas que probé. `informe.actions + informe.problems.length`
frente a la longitud de la lista que mandó el agente, con un `Director` real
(semilla 308, `agentPlayers:[0]`):

| Lista pedida | aplicadas | descartadas | suma / lista | Nota que recibe el agente |
|---|---|---|---|---|
| `[build, end_turn, build, recruit]` | 2 | 2 | **4 / 4** | `2 de 4 acciones aplicadas, 2 descartadas` |
| `[end_turn, build]` — el cierre **primero** | 1 | 1 | **2 / 2** | `1 de 2 … 1 descartada` |
| `[end_turn, end_turn]` — **dos cierres** | 1 | 1 | **2 / 2** | `1 de 2 … 1 descartada`, y el segundo `end_turn` sale nombrado en `problems` |
| `[]` — **lista vacía** | 0 | 0 | **0 / 0** | `Turno del día 1 aplicado entero: 0 acciones.` |
| `[end_turn]` — solo el cierre | 1 | 0 | **1 / 1** | `Turno del día 1 aplicado entero: 1 acción.` |
| `[build-ilegal, end_turn, build]` | 1 | 2 | **3 / 3** | motivos distintos: `recursos insuficientes` + `va detrás de tu end_turn` |
| `[end_turn, build-ilegal, build]` | 1 | 2 | **3 / 3** | las dos con `va detrás de tu end_turn` (no se intentan, así que no se juzga su legalidad: correcto) |
| `[build-ilegal, recruit-ilegal]` — todas mal | 0 | 2 | **2 / 2** | `0 de 2 … 2 descartadas` |
| `[move_hero que GANA la partida, build, recruit]` | 1 | 2 | **3 / 3** | las dos con `no se ha intentado: la partida ya había terminado` |

Y el turno se cerró de verdad en todos: `state.current` pasó al rival y las
acciones de detrás **no** se aplicaron a escondidas (`buildings.length` subió
exactamente 1 en el caso de referencia).

**Por el circuito MCP real**, no solo en arnés: mandé `[build, end_turn, build,
recruit]` desde un cliente MCP de verdad y el bloque que devolvió el
`heroes_listen` siguiente fue

```
CÓMO FUE LO ANTERIOR:
✓ req-1: Turno del día 1: 2 de 4 acciones aplicadas, 2 descartadas (el motivo de cada una, debajo). …
    - build mage_guild_1 en town-1: no se ha intentado: va detrás de tu end_turn, y cerrar el turno lo cierra para todo lo demás
    - recruit 1× skeleton en town-1: no se ha intentado: va detrás de tu end_turn, y cerrar el turno lo cierra para todo lo demás
```

En esa misma partida real conté **21 peticiones y 21 bloques de veredicto**: ni
uno perdido, incluidos los `✓`. El último (`req-21`) llegó **pegado al aviso de
fin de partida**, que es su única oportunidad de leerlo.

## Menor 4 · el guardia de `node:` llevaba roto desde que nació

El encargo pedía comprobar la afirmación del ingeniero. **Es cierta, y se queda
corta por dos lados.**

**Qué formas se colaban.** Evaluando la regex vieja (`/from ['"]node:|require\(['"]node:/`)
contra las siete formas de importar:

| Línea | guardia viejo | guardia nuevo |
|---|---|---|
| `import fs from 'node:fs';` | muerde | muerde |
| `import { readFileSync } from 'node:fs';` | muerde | muerde |
| `const fs = require('node:fs');` | muerde | muerde |
| `export * from 'node:fs';` | muerde | muerde |
| `export { readFileSync } from 'node:fs';` | muerde | muerde |
| **`import 'node:fs';`** | **ciego** | muerde |
| **`const fs = await import('node:fs');`** | **ciego** | muerde |

La segunda ciega —el `import()` dinámico— **no está en el informe**. Es la más
fácil de escribir sin pensarlo, porque es la forma natural de cargar `node:fs`
solo en el servidor.

**Reproducido de verdad, no deducido.** Metí en `src/core/ai/turn.ts` las tres
formas a la vez:

```ts
import '../../server/director.js';
import 'node:fs';
void import('node:os');
```

- con los guardias **de hoy**: 2 rojos, nombrando fichero y línea —
  `src/core/ai/turn.ts:5 → import '../../server/director.js';`,
  `:6 → import 'node:fs';`, `:7 → void import('node:os');`
- con las expresiones **de antes**: `Tests 8 passed (8)` — los ocho en verde
- y `npx tsc --noEmit` → **EXIT=0**: el compilador tampoco lo veía

**Desde cuándo.** El guardia nace en `3d54181` («El ciclo de agentes, con un
control de calidad ligero», 2026-08-23) ya con esa regex, y **no se toca hasta
este ciclo**:

```
3d54181  2026-08-23  /from ['"]node:|require\(['"]node:/   ← nace ciego
cb50aa4  2026-08-23  la misma
0b908e6  2026-08-24  la misma
```

O sea: **nunca hubo una versión que mordiera** esas dos formas. El invariante
«`core` es puro» ha estado respaldado por un guardia con dos agujeros durante
los tres ciclos de trabajo que van desde que se escribió. No se coló nada por
ellos —`grep` sobre `src/core` no encuentra ninguna de las dos formas hoy—, así
que el daño es de **confianza**, no de código: quien leyera «lo cubre un test»
estaba cubierto en cinco de siete formas, no en siete. Ahora sí en las siete.

## Menor 5 · la prosa de la sustituta, leída en las dos ramas

**Rama que sale sola** (semilla 304, agente defensor, sin escenario a medida).
Las cinco sustitutas de esa batalla, verbatim:

```
⚠ req-1  … hechizo magic_arrow sobre attacker-0. Eso NO ha consumido el turno de
          defender-0 —se te volverá a pedir acción para ella—, pero le ha costado
          3 de maná a Serena la Pálida.
⚠ req-2  … movimiento a (7,4). Eso ha consumido el turno de defender-0 en esta ronda.
⚠ req-3  … movimiento a (8,6). Eso ha consumido el turno de defender-1 en esta ronda.
⚠ req-4  … hechizo magic_arrow sobre attacker-0. Eso NO ha consumido el turno de
          defender-1 —se te volverá a pedir acción para ella—, pero le ha costado 3 de maná…
⚠ req-5  … ataque a attacker-0. Con eso ha TERMINADO la batalla: no habrá más peticiones para ella.
```

Correcta, y **comprobable contra los hechos de la misma tanda**: `req-1` promete
otra petición para `defender-0` y `req-2` **es** para `defender-0`; `req-4`
promete otra para `defender-1` y `req-5` **es** para `defender-1`; y `req-5`, que
remata, no promete nada — y en efecto no hubo `req-6`.

**Rama que miente de verdad** (semilla 307, escenario a medida), verbatim:

```
⚠ req-2  … hechizo magic_arrow sobre defender-0. Con eso ha TERMINADO la batalla,
          y le ha costado 3 de maná a Aldo de Valdeluz: no habrá más peticiones para ella.
```

Correcta también, y **mide** el maná en esa rama (3), que es lo que el informe
afirmaba.

**Además, el predicado es completo, no solo suficiente.** `batallaTerminada` usa
`battle.finished !== null`, y el bucle del director tiene una segunda salida
(`activeStack(battle) === null`) por la que la promesa también sería falsa. He
comprobado en `battle.ts` que esa salida **no puede darse con la batalla viva**:
los cuatro sitios que ponen `activeId = null` (`checkFinished`,
`finishByExhaustion`, `advance` y `beginRound`) ponen `finished` en la misma
línea o justo antes. No hay tercera rama silenciosa.

## Hallazgos nuevos

### 1 · menor — la nota del turno manda «pedirlas mañana» cuando no hay mañana

Es **la misma familia que el menor 5**, en el sitio nuevo que abrió esta tanda.
Cuando la partida termina a media lista, las acciones de detrás se descartan con
`MOTIVO_PARTIDA_TERMINADA` —correcto— pero la coletilla fija de
`notaTurnoAventura` (`notas.ts:72-74`) sigue diciendo:

> `… Las descartadas NO se reintentan solas: si todavía te interesan, vuelve a
> pedirlas el turno que viene corrigiendo el motivo.`

No hay turno que viene. La nota completa que recibe el agente:

```
✓ req-1: Turno del día 1: 1 de 3 acciones aplicadas, 2 descartadas (…) vuelve a pedirlas el turno que viene …
    - build town_hall en town-0: no se ha intentado: la partida ya había terminado
    - recruit 1× peasant en town-0: no se ha intentado: la partida ya había terminado
```

Un motivo que dice «la partida ya había terminado» y un consejo que dice «vuelve
a pedirlas mañana», en el mismo mensaje.

**Reproducción desde el arranque:** el agente manda `[move_hero, build,
recruit]` donde el `move_hero` le gana la partida (le quita al rival lo último
que le quedaba). Es una lista de agente perfectamente normal — ganar con
acciones puestas detrás no tiene nada de raro.
*Lo que esperaba quien lee:* que el consejo no contradiga al motivo. Basta con
que la coletilla no salga cuando todos los descartes son por partida terminada,
o que se diga en pasado.

**Atenuante que lo deja en menor:** el veredicto viaja pegado al aviso de fin de
partida —lo comprobé en el circuito real—, y ese aviso dice tres líneas más
arriba «No va a haber más peticiones: deja de llamar a heroes_listen». La
contradicción se resuelve sola en el mismo mensaje. Pero es exactamente la clase
de frase que este ciclo ha ido a quitar.

### 2 · observación — el motivo sale dos veces en el veredicto de batalla

En el circuito real, un rechazo de batalla llega así:

```
⚠ req-3: Tu acción para defender-0 se descartó (stack desconocido: "no-existe"); …
    - stack desconocido: "no-existe"
```

El mismo motivo, entre paréntesis dentro de la prosa y otra vez como viñeta.
No es un fallo —la viñeta es el `problems` crudo y la prosa es la explicación—,
pero en una batalla larga son 2× líneas por rechazo en el contexto de un modelo.
Lo dejo como observación, no como hallazgo: no miente y no bloquea.

## Pasada adversarial nueva

Lo que ataqué y no rompió:

- **Ciclo de vida del socket**: las cuatro variantes de la tabla de A, ×15
  vueltas; tres agentes encadenados; y el relevo por el circuito real con dos
  puentes MCP. Ningún cuelgue, ninguna petición huérfana, ningún veredicto falso.
- **Buzón**: dos y tres escuchas encadenadas (dos relevos seguidos y la tercera
  se lleva la petición); `corta()` **no** se lleva los veredictos pendientes y la
  petición siguiente sí los entrega; `fin()` **después** de un `corta()` con
  recogida colgando devuelve el fin y no un cuelgue.
- **Conteo del director**: las nueve formas de lista de la tabla de B.
- **Silencios**: revisé si `playAgentTurn` puede lanzar *después* de un `ask`
  correcto y dejar al agente sin veredicto (línea 156, `applyAdventureAction` del
  `end_turn`). No es alcanzable: `pendingBattle` está siempre cerrada al llegar
  ahí —`moveHero` hace `startBattle` y `return`, nunca lanza después—, y
  `state.current` no lo mueve nadie dentro del bucle. Queda como riesgo latente
  si algún día la heurística devuelve una acción de batalla ilegal
  (`director.ts:199` y `:227` aplican **fuera** de todo `try`), pero hoy no se
  puede provocar.
- **Navegador** (`pnpm dev`, http://localhost:3100): carga limpia, doble clic en
  «Fin de turno» → **día 1 → 3** y oro 8000 → 9000, que es **un turno por clic**,
  no reentrada; 15 pulsaciones de espacio seguidas → la partida termina en
  derrota y las demás no hacen nada (ni bucle, ni cuelgue, ni excepción);
  partida nueva, castillo (Gremio de magia I: oro 8000→6000, madera 10→5,
  mineral 10→5, `ENSEÑA: Prisa n.1, Flecha mágica n.1, Lentitud n.1`), héroe
  recogiendo `+8 mineral` y `+6 cristal`, batalla contra 7 esqueletos,
  `Resolver sola` → vuelta al mapa con `+8 de experiencia` y maná 20→17.
  **Consola: `[vite] connected` y `[assets] 139 imágenes generadas cargadas`, ni
  un error ni un `unhandledrejection` en toda la sesión.**
- **Colocación en el tablero de batalla**: me pareció que el defensor se pintaba
  a mitad de tablero en vez del borde derecho. Lo perseguí: `createBattle` pone
  al defensor pequeño en `col 10`, y el esqueleto estaba en `col 6`. **No es un
  fallo**: `skeleton` es `average` (4 hexes) y `peasant`/`archer` son
  `very_slow` (2), así que el esqueleto abre la ronda 1 y avanza sus cuatro hexes
  antes de que la persona toque nada. La cuenta cuadra exacta.

## Workarounds usados, y su veredicto

1. **Romper el código a mano para comprobar que los guardias muerden** —
   `src/server/agent-link.ts`, `src/core/ai/turn.ts`, `test/invariantes.test.ts`.
   Es la única forma de distinguir «verde» de «verde porque no mira».
   **Veredicto: no afecta a quien juega.** Los tres restaurados desde copia y
   verificados con `sha256sum` idéntico al de antes; `git status` y `git diff
   --stat` de salida idénticos a los de entrada, y `pnpm verify` verde con 186 al
   cerrar.
2. **Escenario a medida para el fin de partida a media lista** (al rival se le
   quitan los pueblos para que muera el día 1). **Veredicto: hallazgo válido, no
   artefacto.** El escenario solo acelera el reloj: la situación real —el agente
   gana con acciones puestas detrás en la misma lista— no tiene nada de
   construido. Lo declaro porque el atajo es mío.
3. **`SIGSTOP` al puente MCP viejo** para congelar su `close`. **Veredicto: no
   afecta a quien juega, y es fiel al fallo real.** Un puente que se cuelga o al
   que matan es exactamente lo que produce ese orden, y el servidor no puede
   distinguir un socket congelado de uno lento. La prueba de que es fiel es que
   con el arreglo revertido sale **la línea exacta** que la primera vuelta vio en
   una partida normal.
4. **La herramienta `zoom` del navegador me redimensionó la ventana** y capturó
   un fotograma a medio redibujar, con el tablero repetido cuatro veces.
   **Veredicto: artefacto MÍO, no del juego.** Comprobado con un
   `resize_window` limpio a 1280×800: el tablero se redibuja centrado y correcto.
   Lo dejo escrito para que nadie persiga ese fantasma.

## No probado

- **Los dos importantes con dos sesiones de Claude Code de verdad.** Usé dos
  procesos del puente MCP, que es el mismo suceso visto desde el servidor (dos
  `attach` sobre el mismo `AgentLink`), pero no dos clientes humanos.
- **La reentrada del cliente con un turno de rival LENTO.** Sigue sin ser
  alcanzable en el navegador: sin agente, `playAiTurn` no llega a ningún `await`
  real. Lo confirmé otra vez con el doble clic (dos días, un día por clic). La
  bandera `turnoDelRivalEnCurso` sigue siendo prevención, como está declarado.
- **El plazo de consulta de 30 s en el circuito real** — igual que la primera
  vuelta.
- **El castillo defendido por MCP real** — igual que la primera vuelta.
- **Arte: 0 €.** No toqué `tools/gen/`, `spend.json`, `data/` ni `assets/`.

Dos cosas que vi en el navegador y **no son de este ciclo** (comprobado: no
aparecen en `git diff src/client/`), anotadas para que no se pierdan:

- Con la partida perdida y sin castillo, el panel dice `No tienes héroes en el
  mapa. Contrata uno en tu castillo.` (`views/panels.ts:95`).
- Al volver de una batalla resuelta, la línea de estado se queda en `¡Batalla!`
  (`session.ts:183`); `Batalla resuelta` (`panels.ts:411`) es de otro camino.

## Veredicto de la segunda vuelta

**Apto.**

Los dos importantes y los cinco menores están cerrados y comprobados, y en tres
puntos he ido más allá de lo que el informe declaraba:

- el test de **A** es un detector determinista (15/15 rojo sin el arreglo), el
  caso simétrico está cubierto —y solo es peligroso en su mitad «con petición en
  vuelo», donde falla 15/15 sin la guarda—, y **el relevo sí se puede ejercer en
  el circuito real**: lo hice con dos puentes MCP y reproduje ahí la línea exacta
  del hallazgo original;
- los números de **B** cuadran en las nueve formas de lista que se me ocurrieron,
  incluida la partida que termina a media lista, y también por el circuito MCP
  real, donde conté 21 peticiones y 21 veredictos sin perder ninguno;
- el **menor 4** era peor de lo dicho: el guardia de `node:` también era ciego al
  `import()` dinámico, y lo era **desde que nació** en `3d54181` — tres ciclos de
  trabajo respaldados por un invariante con dos agujeros. Hoy muerde en las siete
  formas y `pnpm verify` sigue en 186.

Queda **un hallazgo menor nuevo** —la coletilla «vuelve a pedirlas el turno que
viene» cuando la partida ya ha terminado—, de la misma familia que el menor 5 y
en el código que esta tanda estrenó. No bloquea, se autocorrige en el mismo
mensaje y no justifica retener el trabajo: va al ciclo siguiente o a una línea de
`notaTurnoAventura`, como se prefiera.
