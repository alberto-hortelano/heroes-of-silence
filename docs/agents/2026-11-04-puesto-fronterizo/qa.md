# QA — puesto fronterizo, fase 1 (guarnición y defensa)

04-11-2026. Solo la fase 1: guarnición en ciudad, paso y pueblo; dejar y recoger al parar; la
defensa con el héroe que elige su tropa; la guarnición ajena que bloquea; la IA y el contrato del
agente. Murallas, escaleras, puertas, mejoras y arte (fases 2-4) no se juzgan. La jugabilidad
tampoco (CLAUDE.md).

Código sin commitear del worktree, tal como lo dejó el ingeniero tras `/simplify`. No he tocado
nada del repositorio; mis guiones están en el scratchpad
(`/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-mountain-node-interaction-7b9212/46fb9bb3-8555-4262-a482-fe1df0ee30b2/scratchpad/qa/`,
con las capturas en `nav1/` y `nav2/`).

## Lo que corrí, y por qué

| Comprobación | Por qué | Resultado |
|---|---|---|
| `pnpm typecheck`, `pnpm lint` | hay código cambiado | limpio; lint «Checked 514 files … No fixes applied», los 10 avisos de siempre |
| `vitest run test/guarniciones.test.ts test/session.test.ts test/escenas.test.ts` | lo nuevo, y confirmar los rojos que ya había | guarniciones verde (21); 5 rojos en session/escenas |
| los mismos dos ficheros en un worktree de HEAD (`3d6922d9`, sin los cambios) | ver si los 5 rojos son de antes | **los mismos 5 rojos en HEAD**: «cuando golpean a la persona, elige su respuesta…» (`RuedaPendiente` con 6 claves) y cuatro de «la batalla en el lienzo» («la unidad activa no tiene a dónde moverse»). No son de esta tarea. El worktree temporal ya está borrado |
| `pnpm qa` | toca el contrato y el director | sale 0; «guarnición: 2 veces dejada y 2 recogida en la crónica del agente» |
| `pnpm banco` | el núcleo cambió y se volvió a anclar | `a49a5ad6…`, «ancla: igual», 0/20 sin terminar |
| `barrido-semillas.ts 40 --tropa 3 / 5 / 7` | `repartir` lanza ahora con los cupos: un tope de tropa menor podía hacer que una defensa lanzara | 0/40 sin terminar con cada tope, ninguna excepción |
| Navegador (Playwright sin pantalla, contra el `pnpm dev` del 3123, que no arranqué yo) | la feature se ve | ver criterios; la consola sin errores en todas las pasadas |
| Guiones sobre el núcleo y la `Session` (`s8.mts`, `adv.mts`, `adv2.mts`, `swap*.mts`, `pueblo.mts`) | la pasada adversarial y el punto S8 | ver abajo |

No corrí `pnpm verify`, `verify:lento` ni `pnpm capturas`. El ingeniero corrió `capturas` antes de
`/simplify` y salió 1 por la pasada de la arena, un fallo que ya estaba en HEAD; las pantallas de
esta fase las he mirado con mis propias pasadas. Los demás ficheros de test de lo que se tocó
(invariantes, game, tropa, agent-contract, agent-link, notas, ascenso…) los cito del informe del
ingeniero sobre este mismo árbol.

## Criterios (fase 1)

| Criterio | | Evidencia |
|---|---|---|
| **D5 / C2 Dejar** en un sitio propio al parar, desde su pantalla, con el motivo del núcleo en lo apagado y un cupo declarado en `data/` | ✅ | s1, paso (13,7): «Dejar ›» lleva el ejército de 5 a 0 y la guarnición de 0 a 5 de 7 (`nav1/s1-guarnicion-llena.png`). En la base, el «Dejar» apagado dice «no cabe: la guarnición de Valdeluz ocupa 18 de 20 de liderazgo y 1 × Arquero pide 3». El cupo es `GARRISON_LEADERSHIP` (`data/liderazgo.json`) con el tope de la partida |
| **D5 / C2 Recoger** | ✅ | s1: «‹ Recoger» devuelve los 5 al héroe. En la base, apagado con «no cabe: el ejército ya lleva 6 de 6 individuos». Un clic sobre un botón apagado no cambia nada |
| **D5 Intercambiar** («dejar, llevarse e intercambiar») | ❌ | Con el héroe y la guarnición llenos no hay ningún cambio posible. **En el día 1, en la base y sin haber hecho nada, en 12 de las semillas 1-20** (2, 4-8, 11, 12, 14-16, 20). En el navegador, s2 y s7: 5 de 5 botones apagados (`nav2/swap-s2.png`). Es H1 |
| **D5 Fuera la recogida automática al pasar** | ✅ | El diff quita `takeGarrison`/`garrison_taken`; los tests del ingeniero lo cubren; en el banco, el `garrison_taken` pasa a ser un `troops_taken` explícito |
| **C3 Parar abre la pantalla y pasar de largo no** | ✅ | s1: andar de (5,8) a (11,7) cruzando el paso (13,7) lo toma (`owner` 0) y no abre nada (`nav2/A-de-largo.png`). Parar en él la abre: «Guarnición del paso del acantilado de (13,7)». En un pueblo propio también se abre (s1, s2, s5 con la `Session`; región propia forzada, ver «Workarounds»). Se reabre con el botón «Guarnición» del panel del héroe; en la base, con «Dejar y recoger tropa». Escape y «Cerrar» la cierran |
| **D1 Defensa con el héroe dentro**: elige su tropa entre su ejército y la guarnición, el héroe pelea siempre, la persona en una pantalla, la IA y el agente por la IA | ✅ | s37, el día 2 el rival ataca la base: «¡Te atacan en Valdeluz!» con la propuesta de la IA (1 Arquero y 5 Guardias, 6 de 6), el «+» apagado con su motivo y un clic en el lienzo que no juega nada («¡Te atacan! Elige con quién defiendes.»). Con «−» y «Defender», en el campo quedan 5 Guardias y el héroe (♛ Aerin del Roble). Con «−» y Escape vuelve la de la IA (Arquero y 5 Guardias). En un **paso** (`adv.mts` §6, s1) la pantalla sale como «el paso de montaña de (33,27)». En un **pueblo**, la IA la elige: `defense_set` con fighting 6 y staying 1 (`adv.mts` §4) |
| **D1 Lo no elegido se pierde con el sitio** | ✅ | Héroe vencido en su paso: `node_captured` y luego `hero_defeated`, y la guarnición desaparece (`adv.mts` §1). Vencido en su pueblo: la guarnición desaparece y el pueblo vuelve a su región (§4) |
| **D2 Sin héroe, defiende la guarnición entera** | ✅ en el núcleo, ⚠️ no en pantalla | Lo prueban los tests (`guarnicion` sin héroe, 1 defensor). En 60 semillas la IA nunca atacó en su primer turno un paso de la persona guardado y sin héroe (`adv2.mts`), así que la batalla de la persona que defiende solo con la guarnición no la he visto en la pantalla |
| **D4 / C4 Guarnición ajena**: no se cruza, pisarla es pelear contra ella; si se gana, el paso es del que gana y el pueblo vuelve a su región, y quien gana se queda en la casilla de antes; si se pierde, la guarnición sigue con lo que le quede | ✅ en el núcleo, ⚠️ no en la partida | Tests del ingeniero y `adv.mts` §3: la guarnición de j0 en un pueblo de una región que pasa a j1 sigue siendo de j0 y es hostil para j1. **En `pnpm dev` la persona no se encuentra nunca una guarnición ajena**, porque la IA no deja tropa (backlog del plan): ver «Workarounds» |
| **D4 La renta no cambia** | ✅ | `state/renta.ts` no está en el diff |
| **C5 Un paso sin guarnición se toma de pasada** | ✅ | s1, (13,7): «Paso tomado en (13, 7)» al cruzarlo |
| **C10 Niebla**: la guarnición ajena no viaja | ✅ | `you.garrisons` solo trae lo propio (`guarnicionesView` filtra por dueño). La ruta rodea la guarnición ajena y la marcha rechazada la nombra, como pasa hoy con una ciudad ajena guarnecida |
| **C11 La IA** pelea contra un sitio defendido (`ventajaClara`) y no se rompe; recoge «al llegar o al contratarse» | ✅ que no se rompe, ❌ en la regla de recoger | El barrido con tope 3, 5 y 7 da 0/40 sin terminar y ninguna excepción. **Pero el héroe de la IA que vuelve vencido en el turno del rival sale de casa sin recoger: 22 de 22 casos en 1-40.** Es H2 |
| **C12 El agente**: `leave_troops`/`take_troops` en el zod y en `RESPONSE_FORMAT`, `you.garrisons`, la prosa nueva; las jugadas malas se descartan una a una con su motivo | ✅ | `pnpm qa` sale 0 y las dos jugadas cruzan. 16 jugadas malas (`adv.mts` §2): las de forma (count 0, "2", 2.5, sin count) las para el zod; las demás se descartan con su motivo (veterano con count 2, de otro tipo o que no está; un héroe ajeno o que no existe; una unidad que no existe; 99 o 50; la guarnición llena) sin tocar el ejército ni la guarnición |
| **C14 La crónica**: los hechos nuevos llevan protagonista, sitio y sello | ✅ | `troops_left {hero, site, creature, count, actor, at, seen}`; `defense_set` va detrás del `battle_started` |
| **D6 El banco cambia y se vuelve a anclar; el barrido sigue en 0** | ✅ | `a49a5ad6…` igual; barrido 0/40 con cada tope |

## Hallazgos

### Importantes

**H1. No se puede intercambiar tropa cuando el héroe y la guarnición están llenos, y en la base
eso pasa el día 1 en 12 de 20 semillas.**
Pasos: `http://localhost:3123/?seed=2&heroe=orko` (o la semilla 7); la partida abre en la base;
«Dejar y recoger tropa». El héroe está a 20 de 20 de liderazgo y la guarnición a 7 de 7: los
«Dejar ›» dicen «ya lleva 7 de 7 individuos» y los «‹ Recoger», «el ejército ocupa 20 de 20 de
liderazgo». Los cinco botones están apagados (`nav2/swap-s2.png`).
Lo que esperaba quien juega: cambiar un Orko con dos armas por un Goblin, que es justo el
«intercambiar» de D5. El cambio uno por uno vale como reparto (`repartoBlocker` da `null` para ese
mismo cambio, `swap.mts`), pero la pantalla solo mueve de uno en uno y cada mitad sola desborda un
lado. La única salida es licenciar, que pierde la tropa. El lateral de la base promete otra cosa:
«deja o se lleva lo que quiera». Si la frase de la petición («puede intercambiar tropa, dejar o
llevarse») se lee como «intercambiar, es decir, dejar o llevarse», esto es una reserva y no un
fallo: **lo tiene que decidir el usuario**.

**H2 (el punto S8). La IA vencida en el turno del rival sale de casa sin la guarnición, a veces con
el ejército vacío.**
En 1-40 (`s8.mts`): 22 veces un héroe de la IA vuelve vencido a su base (`hero_returned`) en el
turno del rival, empieza el suyo en ella con algo que recogería (`planIntercambios` no vacío) y,
**las 22 veces, sale sin recoger nada**. Ejemplos:
- s5, día 10, j0: Grommash Dientenegro vuelve con 0, la guarnición tiene 5 y sale a (21,21) **con
  0**;
- s5, día 2: guarnición 7, sale con 1;
- s13, día 2, y s18, día 3: guarnición 6, sale con 1.

Así que sí: en la práctica la IA sale sin tropa teniendo guarnición en casa. El código y la fila de
CLAUDE.md dicen lo mismo («el que vuelve vencido en el turno del rival tampoco recoge hasta que
llegue a un sitio»), pero el plan (§4) pedía que la recogida explícita cubriera los cuatro sitios de
`takeGarrison`, y `volverABase` era uno de ellos. Hasta ahora ese héroe recogía al volver; con esto,
la regla «recoge al llegar» no cuenta como llegada la vuelta a casa del vencido. No es una medida de
equilibrio: es si la regla hace lo que dice. Para cerrarlo hay que saber que el héroe llegó en el
turno del rival, por ejemplo por el `hero_returned` desde el último turno propio o por una marca en
`volverABase`. El ingeniero lo dejó parado a propósito para no inventar estado: hay que decidirlo.

### Menores

**H3. Escape en la guarnición de la base, después de un clic con el ratón, cierra también la base.**
Pasos: `?seed=1&heroe=guerrero`; en la base, «Dejar y recoger tropa»; un clic en «‹ Recoger»;
Escape. El diálogo se cierra **y se sale al mapa** (escena `town` → `adventure`). Sin el clic, con
el foco dentro del diálogo, solo se cierra el diálogo (`esc.mts`). El clic con el ratón deja el foco
en `body`, el `keydown` de `main.ts` no ve el `dialog` y aplica el Escape de la base. La
conversación de la base tiene su propio caso para esto; la guarnición no. Quien juega esperaba
cerrar el diálogo y seguir en la base.

**H4. La crónica se llena y nombra la casilla en vez del sitio.** La pantalla mueve de uno en uno,
así que dejar y recoger cinco son diez líneas: «Dejas de guarnición 1 × Arquero en (13, 7)» ×3,
«… 1 × Guardia del bosque …» ×2, «Recoges de la guarnición …» ×5 (s1). No hay «todos» por fila. La
línea dice «en (13, 7)» y no «en el paso del acantilado» (en un pueblo, la casilla y no el nombre
del pueblo). «Defiendes con 6 y dejas fuera 0» no dice de qué (individuos).

**H5. Un motivo que solo informa se pinta como un rechazo.** Bajo la fila en que ya pelean todos
sale «pelean los 5 × Guardia del bosque que hay» en el mismo naranja que «no cabe: …»
(`nav2/C-defensa.png`). El ingeniero ya lo apuntó como cambio visible de S4 sin mirar.

**H6. La defensa mueve tropa para siempre, y la pantalla no lo dice.** En s37, lo que la IA
propone sacar de la guarnición (Guardias) se queda en el ejército del héroe después de ganar, y lo
que deja fuera (4 Arqueros) se queda en la base. Es la opción A del plan («elegir es repartir»),
pero el texto de la pantalla solo habla de lo que pasa si se pierde. Quien juega puede esperar que,
al ganar, cada uno vuelva a su sitio.

**H7. El contrato del agente.** El `battle_started` le llega con `foe: {kind: "guarnicion", sitio}`,
que la prosa no explica, y con las claves en español. En `contract/agent.ts:145-152`, el comentario
de `buy_item`/`equip` («`item`, `veteran` y `creature` van como texto libre…») ha quedado encima
del de `leave_troops`, separado de su `z.object`.

## Workarounds usados

- **Un espejo de la `Session` solo para saber dónde pulsar** (como `pnpm capturas`). La página es
  la de verdad; el espejo traduce una casilla a píxeles y lleva la cuenta. No afecta a quien juega.
- **`?clima=despejado,dia`** en las URL, como `capturas`, para que el clima no tape las capturas.
  No afecta a lo que se prueba.
- **Estado forzado en los guiones del núcleo y de la `Session`** (`adv.mts`, `adv2.mts`,
  `pueblo.mts`, `swap.mts`): guarniciones ajenas puestas a mano, regiones hechas propias y ejércitos
  montados. Veredicto:
  - las regiones propias (`pueblo.mts`) solo se saltan días de tomar nodos y no cambian la lógica de
    la pantalla: no afectan;
  - **la guarnición ajena sí es un obstáculo real**: en `pnpm dev` la IA no deja tropa (backlog del
    plan), así que la persona no se encuentra nunca un paso o un pueblo ajeno guardado. La regla
    solo la ejerce un agente. Lo cuento como reserva («No probado») y no como fallo, porque el plan
    lo dejó así a sabiendas;
  - H1 **no** usa estado forzado: es el día 1 en la base (`swap2.mts`, `swapnav.mts`).

## No probado

- **La persona defendiendo solo con la guarnición** (D2) en la pantalla, y una guarnición ajena en
  la partida (D4/C4) vista desde el navegador: no ocurren en el flujo real de la fase 1 (arriba).
- **El espectador** con los hechos nuevos y una batalla `guarnicion`: no tiene código nuevo y no
  levanté `pnpm partida` + `pnpm mirar`.
- **Personajes en la defensa** (que vayan siempre y no se dejen): solo lo cubren los tests del
  ingeniero.
- **`?mundo=`** con lugares y guarniciones.
- **`pnpm capturas`** sobre el estado de después de `/simplify`.
- **La recarga a media defensa**: la probé, pero no hay guardado, así que recargar vuelve al día 1
  en la base, como siempre, sin estado roto y sin errores (`nav2/R-tras-recargar.png`). No es un
  hallazgo.

## Veredicto

**Apto con reservas.** Dejar y recoger, la pantalla al parar (y no al pasar), la defensa elegida
con el héroe dentro, perder el sitio con lo que no se eligió, la guarnición ajena en el núcleo, el
contrato del agente (también con jugadas malas), la crónica, el banco y el barrido con los tres
topes hacen lo que dicen, y la consola está limpia. Las reservas son dos decisiones antes de dar la
fase por cerrada:
- **H1**: si «intercambiar» incluye cambiar uno por otro con los dos llenos, que hoy es imposible
  en la base el día 1 en 12 de 20 semillas;
- **H2**: si el vencido que vuelve en el turno del rival debe recoger al empezar su turno.

---

# Vuelta 2 (tras Q1–Q7)

04-11-2026. Solo lo que tocan Q1–Q7 de `hallazgos-qa.md` y una pasada adversarial nueva sobre el
reparto. Fase 1; la jugabilidad no se juzga. Mismo árbol sin commitear que dejó el ingeniero
(ningún fichero de `src/`, `test/` ni `tools/` es más nuevo que su `implementacion.md`). No he
tocado nada del repositorio. Guiones y capturas en
`/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-mountain-node-interaction-7b9212/46fb9bb3-8555-4262-a482-fe1df0ee30b2/scratchpad/qa/`
(`v2core.mts`, `s8c.mts`, `v2nav.mts`; capturas en `v2/` y `v2d/`).

## Lo que corrí, y por qué

| Comprobación | Por qué | Resultado |
|---|---|---|
| `pnpm typecheck`, `pnpm lint` | código cambiado en la vuelta | `tsc` sale 0; lint «Checked 514 files … No fixes applied», 10 avisos de siempre |
| `pnpm qa` | Q7 toca el contrato y la prosa | sale 0; «guarnición: 2 veces dejada y 2 recogida en la crónica del agente» |
| `pnpm banco` | Q2 re-ancló el banco | `ancla: igual` (el `b8b0690c…` del ingeniero), 0/20 sin terminar, 4 / 8 / 9 días |
| Tests (`guarniciones`, `cronica`, `invariantes`, `paneles`, `agent-*`, `notas`, `game`…) | | **citados** del informe del ingeniero sobre este mismo árbol: no hay cambios desde entonces |
| `v2core.mts` (núcleo + `Session`, sin navegador) | la pasada adversarial del reparto | abajo |
| `s8c.mts 100` (IA contra IA, semillas 1-100, 935 turnos) | Q2 y que la marca no se quede pegada | abajo |
| Navegador (Playwright sin pantalla contra el `pnpm dev` del 3123: `ss -ltnp` da el pid 188129 y su `cwd` es este worktree; no lo arranqué yo) | Q1, Q3, Q4, Q5, Q6 en el flujo real | abajo; consola sin errores en todas las pasadas |

No corrí `verify`, `verify:lento` ni `capturas` (presupuesto; las corre CI o el ingeniero ya las citó).

## Criterios

| Criterio (Q) | | Evidencia |
|---|---|---|
| **Q1** Con los dos llenos se cambia uno por otro: editar y confirmar una sola acción | ✅ | `?seed=2&heroe=orko`, base el día 1: «Con Grommash Dientenegro · 5 de 6», «En la guarnición · 7 de 7»; **5 botones, 0 apagados** (eran 5 de 5). «Dejar ›» de un Orko → «8 de 7», motivo «lo que se queda no cabe en la guarnición de Valdeluz: serían 8 de 7 individuos y 21 de 20 de liderazgo», Confirmar `aria-disabled` (`v2/b2-desborda.png`). «‹ Recoger» de un Goblin lancero → 5 de 6 / 7 de 7, sin motivo, Confirmar encendido (`v2/b3-cambio.png`); confirmar cierra, seguimos en `town`, y en el mapa la crónica dice «Dejas 1 × Orko con hacha y escudo y recoges 1 × Goblin lancero en la guarnición de Valdeluz» |
| **Q1** Lo editado no toca la partida hasta confirmar; Cancelar y Escape lo descartan | ✅ | `Session`: tras desbordar y cancelar, `hero.army` y `town.garrison` son los mismos objetos en el mismo orden y el registro no crece. Navegador: «Cancelar» y Escape (foco en `BODY`) cierran, la escena sigue en `town`, y reabierta está como al principio («5 de 6 / 7 de 7», botón «Cerrar») |
| **Q1** Confirmar con un desborde no hace nada y dice por qué | ✅ | clic forzado en el Confirmar apagado: el diálogo sigue abierto y no se mueve nada; el motivo ya está bajo las columnas. Por la `Session`, la barra dice «Lo que se queda no cabe en la guarnición de Valdeluz…» |
| **Q1** Un reparto que no cambia nada no manda nada | ✅ | dejar un Orko y recogerlo otra vez: «5 de 6 / 7 de 7» y el pie vuelve a «Cerrar»; al pulsarlo, se cierra y la crónica no gana ninguna línea (1 → 1 de guarnición). En la `Session`, 0 hechos nuevos |
| **Q1** Repetirlo el mismo día | ✅ | dos confirmaciones seguidas (uno por otro y deshacerlo): dos `troops_exchanged` y dos líneas en la crónica; la composición final es la inicial |
| **Q1** Pueblo y paso | ✅ | paso: s1, el héroe para en (13,7) el día 1 y se abre «Guarnición del paso del acantilado de (13,7)» (`v2/p1-paso.png`); dejar 2 y confirmar: «Dejas 2 × Arquero en la guarnición del paso del acantilado de (13,7)»; se reabre con «Guarnición» del panel. Pueblo (`Session`, s1, Las Ventas, región forzada mía como en la vuelta 1): dejar 2 da `troops_exchanged` con `site: "village-2"` y 2 en la guarnición; recogerlos los quita y el pueblo sigue siendo mío |
| **Q1** Veteranos en el reparto | ✅ | `Session`, s2 con un veterano `v-heroe` en el héroe y otro `v-guar` (con gambesón) en la guarnición, del mismo tipo: salen en filas propias, se cambian uno por otro, y tras confirmar son **los mismos objetos** con su hoja y su equipo. Dejar un novato del tipo del veterano mueve al novato, no al veterano. Ver H-V2-2 para cómo lo cuenta la crónica |
| **Q1** Personajes en el reparto | ✅ (con nota) | `Session`: la fila del personaje lleva «un personaje no se deja en una guarnición: va siempre con su héroe» y no se mueve; en la pantalla su botón va apagado con esa nota. Ver H-V2-3 (latente, no alcanzable desde la pantalla) |
| **Q1** Turno del rival, partida terminada | ✅ | en el turno del rival el motivo es «todavía no es tu turno: ahora juega el jugador 1 (no-muertos)»; terminada, «la partida ya ha terminado». Con una batalla pendiente forzada a mano, la vista no da motivo y Confirmar sale rechazado por el núcleo en la barra («hay una batalla pendiente de resolver») sin tocar nada; no he encontrado cómo llegar a eso en el flujo real (el diálogo es modal y nada abre una batalla mientras está abierto): no es un hallazgo |
| **Q1** El agente no reparte (backlog) | ✅ | `adventureActionSchema` rechaza `repartir_tropa` |
| **Q2** El que vuelve vencido en el turno del rival recoge | ✅ | `s8c.mts`, 1-100: **96 de 96** recogen al empezar su turno (eran 22 de 22 sin recoger en 1-40). Los que vuelven en su **propio** turno: 78, 67 recogen en ese mismo turno y ninguno acaba el turno pudiendo recoger sin hacerlo; los 4 que «salen sin recoger» en su turno siguiente (s2, s46, s50 día 4; s76 día 7) ya recogieron al volver y son el que se queda en casa con hueco, que por regla no vacía la guarnición |
| **Q2** La marca `vueltoACasa` no se queda pegada | ✅ | en 935 turnos (1-100), tras el turno de cada jugador **ningún** héroe suyo sigue marcado (0). Ojo con el orden en serpiente: el héroe de j1 marcado en el turno de j0 que cierra un día sigue marcado al empezar el de j0 del día siguiente, y es correcto (j1 aún no ha jugado). La marca no viaja al agente ni al espectador (solo la leen `game.ts` y `ai/turn.ts`) |
| **Q3** Escape no cierra también la base | ✅ | s2, base: clic dentro, foco en `BODY`, Escape → diálogo cerrado y escena `town`. Con el diálogo abierto, `e` y `→` no hacen nada (turno sigue «Tu turno»). s1, paso: Escape cierra y la escena sigue en `adventure` con el héroe elegido. La defensa (s37): Escape la cierra con la propuesta de la IA y la batalla sigue |
| **Q4** La crónica dice el sitio y agrupa | ✅ | «Dejas 1 × Orko con hacha y escudo y recoges 1 × Goblin lancero en la guarnición de Valdeluz» (una línea por confirmación); «Dejas 2 × Arquero en la guarnición del paso del acantilado de (13,7)»; tras la defensa de s37, «Defiendes Valdeluz con 6 individuos y dejas fuera 4». Lo de la IA (un `recoger_tropa` por tipo, cada línea con su sitio) es la desviación declarada, permitida por Q4 |
| **Q5** Lo informativo no va como rechazo | ✅ | s37, día 2: bajo los Guardias «pelean los 5 × Guardia del bosque que hay» en el gris apagado; el rechazo «no cabe: el ejército de Aerin del Roble ya lleva 6 de 6 individuos» en el tono del rechazo (`v2d/C-defensa-menos.png`) |
| **Q6** La defensa avisa de que la tropa se queda con el héroe | ✅ | «Los que elijas se quedan con Aerin del Roble después de la batalla, y los demás, en la guarnición.» |
| **Q7** El contrato: `garrison`/`site`, la prosa, el comentario | ✅ | `BattleFoe` es `{ kind: 'garrison', site }`; la prosa de la aventura (GUARNICIONES) y la de la batalla dicen qué es, de quién y qué `site`; el comentario de `leave_troops` está sobre su esquema y el de `buy_item` sobre el suyo (`agent.ts:145-160`); `pnpm qa` en 0 |

## Hallazgos

### H-V2-1 · menor · Los clics rápidos en «Dejar ›» / «‹ Recoger» se pierden

1. `http://localhost:3123/?seed=2&heroe=orko` → «Dejar y recoger tropa».
2. Doble clic rápido en «Dejar ›» del Orko con hacha y escudo.

Pasa **uno** (7 de 7 → 8 de 7), no dos. El `click` de `mover-en-el-reparto` en `main.ts` hace
`break` con `ev.detail > 1`: tiene sentido cuando cada clic era una acción del núcleo, pero ahora el
botón solo edita. Quien quiere pasar tres pulsa tres veces seguidas y ve pasar uno, sin aviso. La
defensa («−»/«+») no tiene esa guarda. Se esperaba que cada clic pase uno.

### H-V2-2 · menor · Un cambio de veterano por otro del mismo tipo se lee como que no pasó nada

Con un veterano de un tipo en el héroe y otro del mismo tipo en la guarnición (o un veterano por un
novato), el hecho es `left: [{orko-hacha-escudo, 1}], taken: [{orko-hacha-escudo, 1}]` y la crónica
dice «Dejas 1 × Orko con hacha y escudo y recoges 1 × Orko con hacha y escudo en la guarnición de
Valdeluz». El reparto es correcto (son los objetos que se pidieron, con su hoja y su equipo); lo
que no se entiende es la línea. Solo con veteranos, que en el día 1 no hay (`v2core.mts` §2, con
veteranos puestos a mano).

### H-V2-3 · menor (latente) · `moverEnElReparto` con un personaje lanza en vez de dar su motivo

`Session.moverEnElReparto('guarnicion', 'character')` lanza «no hay ninguna unidad «character» en
data/unidades.json»: la búsqueda de la fila excluye a los que llevan `member`, así que cae en la
frase de «no queda ningún …», que llama a `unidadDelJuego`. La rama `fila.motivo !== null` que su
comentario promete para el personaje no se alcanza. **Desde la pantalla no pasa**: el botón del
personaje va con `aria-disabled` y `main.ts` no llama. Lo apunto por si otra vía llama a la sesión.

## Workarounds usados

- **Veteranos y personaje puestos a mano** en el ejército y la guarnición (`v2core.mts` §2): en el
  día 1 no hay ninguno. No afecta a quien juega: lo que mira es el reparto, que es el mismo código
  que la pantalla; la vista en el navegador con veteranos sigue **no probada**.
- **Región del pueblo forzada mía** para el reparto en un pueblo (`v2core.mts` §3), como en la
  vuelta 1: llegar a un pueblo propio jugando lleva días. El paso sí se jugó en el navegador.
- **`pendingBattle` y `finished` puestos a mano** (§4): para ver qué dice la vista; el
  `finished` sintético rompe `desenlace.ts` («la crónica no dice quién quedó eliminado»), que es
  del estado falso, no un hallazgo.
- El `pnpm dev` del 3123 no lo arranqué yo y no lo he parado.

## No probado

- La pantalla del reparto **con un veterano o un personaje en el navegador** (solo `Session`).
- El reparto en un pueblo en el navegador (solo `Session`).
- La crónica del espectador (sigue con la casilla, como dice el ingeniero).

## Veredicto (vuelta 2)

**Apto.** Q1–Q7 hacen lo que piden en el flujo real y en la pasada adversarial: con los dos llenos
se cambia uno por otro y se confirma en una acción y un hecho con el sitio; cancelar, Escape y un
reparto sin cambios no tocan la partida; veteranos y personajes salen bien del reparto; el vencido
que vuelve recoge (96 de 96) y la marca no se queda pegada; la defensa avisa y separa la nota del
rechazo; el contrato dice `garrison`/`site` con su prosa. Los tres hallazgos son menores (dos de
lectura, uno latente) y no impiden cerrar la fase 1.

# Fase 2 · vuelta 1 (murallas del mapa: piedra, madera, escaleras y puertas)

Alcance: el diff sin commitear sobre `e652738d` (fase 2 + su `/simplify`), contra lo que pidió el
usuario: «En las ciudades hay muralla. En los pueblos empalizada.» (D3), «las murallas si cierran
[…] Tambien hay puertas» (D7) y la escalera para «Todo el atacante» (D8). Fase 3 (mejoras del
paso) y fase 4 (arte del mapa) fuera. Guiones y capturas en
`/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-mountain-node-interaction-7b9212/46fb9bb3-8555-4262-a482-fe1df0ee30b2/scratchpad/qa-f2/`
(`g/adv.qa.test.ts`, `g/nav.mts`, `g/arena.mts`; `nav/*.png` y `nav/*.log`; `capturas/`). Ningún
fichero del repo tocado: los guiones viven en el scratchpad con su propia config de vitest.

## Lo que corrí, y por qué

| Orden | Por qué | Resultado |
|---|---|---|
| `pnpm typecheck`, `pnpm lint` | cambia código | limpio; «Checked 516 files… Found 10 infos» (los de siempre) |
| `vitest run test/datos-de-sitios test/espectador test/agent-contract test/invariantes` | lo nuevo de la fase (formas, qué muralla lleva cada batalla, escaleras, la inversa del espectador con muralla, el contrato y los guardias) | 190/190 |
| `g/adv.qa.test.ts` (mío, 24 casos) | la pasada adversarial del núcleo: formas rotas, cierre medido sin `pasoPermitido`, voladores, tope 3/5/7, defensa elegida + muralla, lo que queda tras ganar, jugadas mal escritas del agente | 24/24 (salidas abajo) |
| Playwright sin pantalla contra el `pnpm dev` del 3123 (pid 188129, de este worktree; no lo arranqué ni lo paré) con un espejo `Session` | el flujo de quien juega: atacar la ciudad neutral de s6, defender la base de s37, `?tropa=3`, la arena con enlaces v18/v17 | sin errores en consola en las cuatro |
| `pnpm qa` | toca contrato y servidor | sale 0, s3: «muralla: 40 turnos de batalla con "walls" (piedra), mandadas open_gate, close_gate» |
| `QA_SEMILLA=1,2,4…12 pnpm qa` | buscar una semilla en que el agente **ataque** una muralla | ninguna: s6, s9, s10 salen 0 y solo defienden (open/close_gate); el resto sale 1 por lo que su búsqueda exige (`dismiss`, `weather`), no por la muralla |
| `CAPTURAS_SOLO=espectador pnpm capturas …/qa-f2/capturas` | el espectador con una batalla con muralla, tras el `/simplify` (que tocó el contrato y el lienzo; el ingeniero no la volvió a correr) | sale 0, 24 s, «34 turnos de batalla», sin errores; `espectador-02-batalla.png` pinta la piedra |
| `pnpm banco`, `barrido-semillas.ts` | citar que el `/simplify` no movió el juego | «ancla: igual», 0/20; barrido 0/4, peor batalla 7 rondas |

## Criterios (fase 2)

| Criterio | | Evidencia |
|---|---|---|
| **F2-1** Contra una ciudad (también la base y la neutral), muralla de **piedra** | ✅ | s6, la neutral de (8,7): «batalla piedra» (`nav/a.log`, `a0-batalla.png`); s37, la base: «muralla piedra» (`d.log`); la base y la neutral en `datos-de-sitios` |
| **F2-2** Contra un pueblo, **empalizada de madera**; en un paso, ninguna | ✅ (⚠️ en el navegador de la partida) | núcleo: `contraElPueblo` → `MURALLAS_DEL_MAPA.pueblo`, el héroe atacado en su pueblo → madera, el paso → `SIN_MURALLA` sin escaleras (`datos-de-sitios`); mío: tras ganar a una neutral, la batalla siguiente en un paso ajeno con guarnición sale sin muralla ni escaleras, 15 de 15. En la partida del navegador **no se puede montar** (la IA no deja tropa); la madera se ve en la arena (`arena-madera.png`) |
| **F2-3** Las murallas **cierran** | ✅ | BFS mío por `neighbours` sin `pasoPermitido`, saltando muros y la arista de la puerta: desde la salida del atacante, 0 casillas de la salida del defensor alcanzables en las dos formas (55 y 64 de suelo alcanzable). La variante del `_comment` con la puerta al oeste del hueco se rechaza: «una muralla del mapa cierra: con esta, el atacante la rodea andando» |
| **F2-4** Hay **puertas**, el defensor las abre y cierra | ✅ | s37, el Arquero defensor: «Abrir puerta» encendido y «Cerrar puerta» apagado con «La puerta ya está cerrada.»; abierta → «Esa puerta ya se ha abierto o cerrado en este turno.»; un clic forzado en el apagado no la cierra (espejo `[true]`); la unidad siguiente la cierra (`d2-abierta.png`, `d3-cerrada.png`). Al atacante no le sale ningún botón de puerta (`a.log`, primer turno: solo «Poner escalera» y «Subir») |
| **F2-5** **Todo el atacante** lleva escalera (D8), el defensor no | ✅ | s6: «atacantes 7 (escalera: 7)»; s37: «atacante escaleras 6/6»; `?tropa=3`: «atacantes 3 (escalera: 3)»; tras rehacer la defensa, «atacantes con escalera 5/5, defensores con escalera 0/2» |
| **F2-6** La persona juega la muralla atacando: poner, subir, bajar dentro, con sus motivos apagados | ✅ | s6: antes de llegar, los dos apagados con «No está al pie de ningún muro.»; tras andar, «Ya se ha movido este turno: se llega al pie y se sube en el turno siguiente.» (`?tropa=3`); con dos o tres muros al pie, el botón queda marcado y la barra dice «Elige el muro: pulsa en lo alto de una de las columnas marcadas, o Escape para cancelar.»; el clic en lo alto pone la escalera; 7 puestas, 7 subidas, bajadas dentro a (8,6) y (8,3); «Subir» apagado con «En ese muro está Konstanz von Adler.» cuando lo alto está ocupado; sin escalera propia, «No lleva escalera.» (arena) |
| **F2-7** Escape suelta lo que espera el clic | ✅ | s6 y `?tropa=3`: tras Escape, barra vacía, el botón sin `primary` y la escena sigue en la batalla (`a2b-tras-escape.png`) |
| **F2-8** La escalera puesta la usa cualquiera; no se gasta otra en el mismo pie y muro | ✅ | mío: con la del héroe puesta en (6,1)→(7,1), otro atacante con la suya en ese pie ve `subir` a (7,1) y `poner_escalera` solo a (7,0) y (7,2) |
| **F2-9** La IA asalta y defiende, y las batallas acaban | ✅ | s37: la IA atacante pone 2 escaleras y la batalla acaba en 5 rondas; tope 3/5/7 × semillas 1-20 contra la base: 60 batallas, 0 en `MAX_ROUNDS`, ronda máxima 7/8/10, ningún bando por encima del tope ni stack en un muro; las 50 de `datos-de-sitios` |
| **F2-10** El tope de tropa con muralla (`?tropa=3`) | ✅ | en el navegador, 3 contra 3 tras la piedra, el asalto completo (`t*.png`); en el núcleo, la tabla de F2-9 |
| **F2-11** Defensa elegida (fase 1) + muralla | ✅ | s37 con héroe y 3 goblins en la base: `defensa {"hero":"hero-1","sitio":"town-1"}`, muralla piedra; `elegirLaDefensa` con un orko: la batalla rehecha sigue con `MURALLAS_DEL_MAPA.ciudad` por identidad, el atacante con sus 5 escaleras y los defensores dentro, en (10,3) y (11,4). En el navegador, «Como propone la IA» y la batalla tras la piedra (`d0-defensa.png`) |
| **F2-12** Tras la victoria no queda nada de la muralla | ✅ | 15 semillas ganando a una neutral: 0 campos `escalera` en la tropa del héroe ni en `JSON.stringify(state)`; la batalla siguiente, en un paso, sin escaleras ni muros (0 de 15). En el navegador, la ciudad de s6 pasa al jugador 0 y el mapa vuelve sin errores (`a6-mapa.png`) |
| **F2-13** Formas rotas en `data/sitios.json` lanzan nombrando el fichero | ✅ | 15 formas rotas a mano, todas con «data/sitios.json: la muralla del pueblo: …» y su motivo: muro fuera del tablero (con la forma del tablero dicha), col negativa, muro repetido, puerta no vecina, puerta sobre un muro, puerta al revés, muros vacíos (abierta), muro sin `row`, decimal, `material: null`, `puertas` que no es lista, dos puertas iguales; la raíz `null` o `[]`: «data/sitios.json: tiene que ser un objeto» |
| **F2-14** El agente: cuatro jugadas en el contrato, mal escritas descartadas con su motivo, la prosa solo con `walls` | ✅ (⚠️ `place_ladder`/`climb` en el circuito) | zod rechaza `place_ladder` sin `wall`, la puerta sin `b`, `wall` decimal y el nombre en español (`poner_escalera`); el núcleo, con su frase: `(99,0)` «en (99,0) no hay muro», el hueco (7,4), un muro lejos «no está al pie de ese muro», subir sin escalera «primero hay que ponerla (un turno)», el atacante abriendo «las puertas las abre y las cierra quien defiende», el defensor subiendo «quien defiende sube a la muralla andando», la puerta al revés «entre (8,4)-(7,4) no hay puerta», cerrar la cerrada. `walls` al defensor con `material`, `tiles`, `gates[].open` y `ladders`; la lista legal en inglés. La prosa MURALLA dice la regla entera (leída: arriba). `pnpm qa` solo cruza `open_gate`/`close_gate` |
| **F2-15** El espectador, inversa exacta, pinta la muralla | ✅ | `test/espectador.test.ts` (la vuelta con muralla, escaleras y puerta abierta); `CAPTURAS_SOLO=espectador`: `espectador-02-batalla.png` con la piedra, sin errores |
| **F2-16** La arena: enlace v18 de madera sí, v17 no | ✅ | «Copiar enlace»: `v 18`, `material piedra`; con `madera`, «Montada la pelea del enlace (semilla 4)» y la empalizada de estacas; v17: «este enlace es de una versión anterior de la arena (la 17; la de hoy es la 18): vuelve a copiarlo»; `barro`: «material "barro" no existe; valen piedra, madera»; sin material: «falta «material»» |

## Hallazgos

### H-F2-1 · menor · Con «Poner escalera» esperando el muro, un clic en una casilla verde mueve la unidad y le quita la escalera de ese turno, sin decirlo

1. `http://localhost:3123/?seed=6&…&clima=despejado,dia` (la URL de `urlDePartida(6)`), «Volver al
   mapa», pulsar la ciudad neutral de (8,7).
2. En la batalla, andar con el héroe (Konstanz) hasta una casilla de fuera con dos muros vecinos y terminar el turno.
3. En el turno siguiente, «Poner escalera»: la barra dice «Elige el muro: pulsa en lo alto de una de
   las columnas marcadas, o Escape para cancelar.»
4. Pulsar una casilla verde que no sea muro (en la prueba, (5,5)).

La unidad anda (le quedan 3 de 4 casillas), lo que esperaba se suelta, la barra queda vacía y los
dos botones salen apagados con «Ya se ha movido este turno: se llega al pie y se sube en el turno
siguiente.» (`nav/mv.log`, `mv-clic-verde.png`). Quien juega, que tiene el muro marcado y una frase
que solo ofrece «lo alto» o Escape, pierde su escalera de ese turno por un clic cerca del muro (los
pies son casillas verdes pegadas a las columnas). Con un hechizo o un poder esperando, el clic no
mueve (`movimientoEn` devuelve nada con `apuntado`); con la muralla sí, porque la muralla no entra
en `LoApuntado.actual`. Es el comportamiento que la arena ya tenía (`session.muroPorElegir = null`
antes de mover, en HEAD), pero el docstring de `pulsarEscala` promete otra cosa («Con un botón
esperando, un clic en otro sitio se queda en él y lo dice»). Se esperaba que el clic se quedara
esperando y lo dijera, como en el resto del tablero.

### H-F2-2 · menor · El test del volador no muerde: no hay ninguna unidad que vuele en el catálogo

`test/datos-de-sitios.test.ts`, «el volador no lleva escalera aunque su bando ataque una muralla»,
busca un volador de no muertos con `hasTrait(u, 'flying')` y, si no lo hay, monta solo el jinete.
Ninguna de las 34 unidades del catálogo vuela (búsqueda en las cinco facciones: lista vacía), así que
el test solo comprueba que el jinete lleva escalera; la rama de `quienNoEscala` para quien vuela no
la ejerce nada de la fase. El «visto morder» de la implementación (sin `conEscaleras`, rojo en «el
volador») mordía por el jinete. No afecta a quien juega hoy (no hay voladores); el día que entre uno,
su escalera no está vigilada.

## Observaciones (no son hallazgos)

- **Como director de arte**: las columnas de piedra son altas y opacas; lo que queda detrás (los
  defensores al fondo, quien sube por la cara de atrás) se ve solo como silueta naranja, y el
  pasillo de la puerta (fila 4) queda tapado por las columnas de las filas 5-8 de delante: la
  puerta se lee por su marco naranja y, abierta, por sus dos hojas (`d2-abierta.png`). Es el dibujo
  de la arena; el arte del mapa es la fase 4 y la batalla no pide arte.
- **La puerta cerrada no impide el cuerpo a cuerpo de un lado al otro** (regla de la arena, la
  dijo el ingeniero); la prosa del agente dice que «cerrada no la cruza nadie que ande» y «tapa el
  tiro», y no que se pueda golpear a través. La lista legal lo trae, así que no lleva a error.
- «Resolver sola» vuelve al mapa sin pantalla de final y con la barra vacía: igual que antes de la
  fase.

## Workarounds usados

- **El espejo `Session`** para saber dónde pulsar en el lienzo (como `pnpm capturas`), con la
  semilla fijada en la URL: no cambia lo que ve quien juega.
- **«Resolver sola»** para cerrar cada batalla tras probar la muralla, en vez de jugarla entera: la
  muralla ya se había jugado a mano; lo que queda es la IA de siempre.
- **El pueblo con guarnición, puesto a mano** (`ponerLaGuarnicion`) en las pruebas del núcleo: jugando
  no se llega (la IA no deja tropa). Lo que cubre es la regla, no la pantalla; la pantalla de la
  madera se vio en la arena.
- **Posiciones y turnos forzados** (`forzarTurno`, `hex =`) en las jugadas mal escritas del agente:
  para tener al atacante al pie y al defensor con el turno; las frases son las del núcleo.

## No probado

- **La batalla contra un pueblo en la partida del navegador** (madera, la persona atacando o
  defendiendo su pueblo): no se monta jugando; cubierta en el núcleo y vista en la arena.
- **`place_ladder` y `climb` del agente en el circuito** (`pnpm qa`): en ninguna de las semillas que
  pasan (3, 6, 9, 10) el agente ataca una muralla; las cubren el contrato (`agent-contract`) y mis
  jugadas directas.
- **Rehacer la defensa con «Defender» (una elección distinta de la de la IA) en el navegador**: solo en
  el núcleo (F2-11).
- **Un volador con muralla**: no hay ninguno en el catálogo (H-F2-2).
- `pnpm capturas` entera (solo la pasada «espectador»).

## Veredicto (fase 2, vuelta 1)

**Apto con reservas.** Lo que pidió el usuario se cumple en el flujo real: la ciudad (base y neutral)
tras la piedra, el pueblo tras la madera y el paso sin muralla; las dos cierran (medido sin el código
que lo juzga), llevan su puerta, que solo abre y cierra quien defiende, y todo el atacante lleva su
escalera; la persona pone, sube, baja dentro y abre y cierra con los motivos del núcleo, Escape
suelta, la IA asalta y defiende sin batallas eternas (también con tope 3 y 5 y con la defensa
elegida), el agente tiene sus cuatro jugadas con sus rechazos dichos y la prosa solo con muralla, y el
espectador la pinta. Las reservas son H-F2-1 (un clic cerca del muro, con el botón esperando, gasta
el turno de la escalera sin aviso) y lo no probado en el navegador: la madera en una partida y la
escalera del agente en el circuito.

## Fase 2 · cierre de la vuelta 1 (coordinador, 04-11-2026)

H-F2-1 y H-F2-2, corregidos (QF2-1 y QF2-2 de `hallazgos-qa.md`; detalle en `implementacion.md`,
«Fase 2 · QA vuelta 1»). Con la muralla esperando el clic, el clic en una casilla de andar no mueve y
la barra lo dice (test de escena sobre una `Session` real, visto morder con el código de antes, y s6
en el navegador: no se mueve, «…o Escape para cancelar.», la escalera se pone después en (6,5)); el
test del volador monta un volador de verdad y muerde sin su rama de `quienNoEscala`. `pnpm banco`
igual (`883fe9be…`), `datos-de-sitios` 14/14, typecheck limpio. Al ser dos hallazgos menores de
cliente y de test, con sus guardias vistos morder, no se lanza otra vuelta de QA entera.
