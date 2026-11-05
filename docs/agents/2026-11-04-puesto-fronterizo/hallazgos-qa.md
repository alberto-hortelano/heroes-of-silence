# Hallazgos de QA de la fase 1 (vuelta 1), decididos

De `qa.md` (apto con reservas). Decididos por el coordinador; H1 con el usuario (D9 de
`requisitos.md`). Solo fase 1: nada de murallas, escaleras ni mejoras.

## Q1 · El intercambio es repartir y confirmar (H1, D9)

Hoy cada botón mueve un individuo y con el héroe y la guarnición llenos todo sale apagado (12 de
20 bases el día 1; `?seed=2&heroe=orko`, `?seed=7`). → el diálogo de la guarnición pasa a ser un
reparto que se edita (como la defensa: cada fila con lo que hay de cada tipo a cada lado, «‹» y
«›» o «−»/«+», los veteranos uno a uno) y un botón «Confirmar» que manda **una** acción del núcleo
con el reparto final (p. ej. `repartir_tropa { hero, enElHeroe }`), juzgada por `repartoBlocker`
y escrita por `repartir`. Lo apagado lleva su motivo del núcleo: el de cada paso de la edición
(lo que ya no cabe a un lado se puede editar si el final cabe: el motivo va en «Confirmar», no en
cada flecha) y el del reparto final. Escape o «Cancelar» descartan lo editado. `dejar_tropa` y
`recoger_tropa` se quedan para la IA y el agente (el contrato no cambia; que el agente no pueda
cambiar con los dos llenos va al backlog). Un hecho por confirmación en la crónica (ver Q4).
Se vigila con tests del núcleo (un cambio con los dos llenos vale; un final que desborda se
rechaza con su frase) y en el navegador con `?seed=2&heroe=orko`.

## Q2 · El héroe que vuelve vencido recoge (H2)

22 casos en 1-40 de un héroe de la IA que vuelve vencido a su base en el turno del rival y sale
en el suyo sin recoger nada (s5 día 10: guarnición 5, sale con 0). El plan (§4) cubría los cuatro
sitios de `takeGarrison` y la vuelta era uno. → la vuelta cuenta como llegar: el núcleo marca al
héroe al volver (`volverABase` o donde se decida, un dato efímero del héroe que se borra al
recoger o al acabar su turno, escrito en un solo sitio) y `playAiTurn` lo trata como al que llega.
Sin leer la crónica (S2 lo quitó). El banco cambiará: re-anclar con la forma del diff (qué
semillas, primer hecho distinto).

## Q3 · Escape no cierra también la base (H3)

En la guarnición de la base, tras un clic, Escape cierra el diálogo y además sale al mapa (foco en
`body`; el `keydown` de `main.ts` aplica el Escape de la base). → el mismo trato que la
conversación: con un diálogo modal abierto, Escape es suyo. Mirar la defensa también.

## Q4 · La crónica dice el sitio y agrupa (H4)

Una línea por individuo («Dejas de guarnición 1 × Arquero en (13, 7)» repetida), la casilla en vez
del sitio, y «Defiendes con 6 y dejas fuera 0» sin decir dónde. → un hecho por acción con lo que
movió por tipo, nombrado con `nombreDelSitio`/`delSitio`; la defensa dice el sitio. Lo de la IA
(varias `recoger_tropa` seguidas) también se lee en una línea si es la misma pasada; si eso pide
juntar hechos en el núcleo de forma rara, basta con que cada línea diga el sitio y se explique en
`implementacion.md`. Re-anclar `test/fixtures/paneles.txt` si cambia.

## Q5 · Lo informativo no se pinta como rechazo (H5)

«pelean los 5 × … que hay» va en el naranja de «no cabe». → otro estilo (el apagado neutro) para
el motivo que solo informa; el núcleo distingue los dos (o no da motivo informativo y la vista no
lo inventa).

## Q6 · La defensa avisa de que la tropa se queda con el héroe (H6)

Lo que la defensa saca de la guarnición sigue en el ejército del héroe tras ganar. Es lo que se
quiere (la defensa es un reparto), pero la pantalla no lo dice. → una línea en el diálogo de la
defensa («Los que elijas se quedan con <héroe> después de la batalla»), escrita con el nombre.

## Q7 · El contrato del agente (H7)

El `foe { kind: "guarnicion", sitio }` llega sin prosa y con claves en español; en
`contract/agent.ts:145-152` el comentario de `buy_item`/`equip` quedó encima del de
`leave_troops`. → la prosa de la batalla dice qué es una guarnición (de quién y de qué sitio), con
las claves del contrato en inglés como el resto (`garrison`, `site`), y el comentario a su sitio.
`pnpm qa` sigue en 0.

## No son hallazgos de esta tarea

- Los 5 rojos de `session.test.ts` y `escenas.test.ts`: de HEAD (comprobado en `3d6922d9`).
- Que la persona no se encuentre una guarnición ajena en `pnpm dev`: la IA no deja tropa (backlog).
- `destinoDeRecluta` con `GARRISON_LEADERSHIP` a mano (visto por el ingeniero de `/simplify`): se
  cambia a `cupoDeLaGuarnicion` si es trivial y no mueve el banco; si no, se deja y se dice.

---

# Hallazgos de QA de la fase 2 (vuelta 1), decididos

De `qa.md` («Fase 2 · vuelta 1», apto con reservas). Decididos por el coordinador (04-11-2026). El
juego no cambia: `pnpm banco` se queda en `883fe9be…`.

## QF2-1 · Lo que espera el clic de la muralla no se pierde con un clic en otro sitio (H-F2-1)

Con «Poner escalera» esperando el muro, un clic en una casilla verde mueve la unidad, suelta lo que
esperaba sin decirlo y gasta el turno de la escalera (s6; ya pasaba en la arena). Un hechizo apuntado
sí bloquea ese movimiento, y el docstring de `pulsarEscala` dice que «un clic en otro sitio se queda
en él y lo dice». → el mismo trato que lo apuntado: mientras la muralla espera el clic, un clic que no
es en lo alto de un muro elegible (o en una puerta elegible) no juega nada y la barra lo dice («Elige
lo alto de un muro o pulsa Escape»); Escape y los botones siguen soltándolo. En la partida y en la
arena (una pieza, `LoApuntado`). Se vigila con un test de la sesión (el clic en una casilla de andar
no mueve con la muralla esperando) y se mira una vez en el navegador con s6. Docstrings al día.

## QF2-2 · El test del volador muerde (H-F2-2)

«el volador no lleva escalera» (`test/datos-de-sitios.test.ts`) no prueba un volador: el catálogo no
tiene ninguno. → montar en el test un volador de verdad (una unidad con el rasgo de volar, en un
catálogo de la pelea o la forma que use `quienNoEscala`) y verlo morder: quitando la rama del volador
de `quienNoEscala` el test sale rojo.

## No son hallazgos de esta tarea

- La batalla contra un pueblo en la partida del navegador: la IA no deja tropa (backlog de la fase 1);
  cubierta en el núcleo y en la arena.
- `place_ladder` y `climb` del agente en `pnpm qa`: en las semillas que pasan solo defiende; los
  cubren los tests del contrato. Si es barato, que `pnpm qa` busque además una semilla donde el agente
  asalte; si no, backlog.
