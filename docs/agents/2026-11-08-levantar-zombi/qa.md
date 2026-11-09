# Levantar zombi — QA

QA, 09-11-2026, sobre `1c4ae15a` (rama `claude/elastic-colden-13a21f`; los commits `137f898f` y
`1c4ae15a` sobre `36401df2`). Sin tocar código. Árbol limpio al empezar y al acabar
(`git status --short` vacío; `data/` devuelto byte a byte tras «Guardar», `sha256sum -c` OK).

## Cómo lo he probado

- **Arena, en el navegador**: Playwright con Chromium sin pantalla (nunca el Chrome del usuario),
  vite propio en el puerto 4791 (arrancado con `set -m`, PID = PGID 78038, matado por su grupo;
  después `ss -ltnp` ya no enseña el 4791; el `:3636` ajeno no se ha tocado). **El montaje, con
  clics**: «+ Héroe» a los dos lados (el de la arena sabe todo el gremio, «Levantar zombi»
  incluido), Conocimiento 5 en la ficha del izquierdo, tres goblins y un esqueleto a la derecha, la
  derecha en «Yo», «Luchar», «Listo» en los dos despliegues. Cada jugada, con un clic real en la
  página (botón del hechizo y casilla del lienzo); un espejo `SesionDeArena` con la misma semilla
  solo decide dónde pulsar, y en cada turno se comprobó que la página y el espejo tienen la misma
  unidad activa. **Semilla 7**; la ronda de cada paso va abajo, en la tabla.
- **Editor de magia, en el navegador**: el mismo vite, con clics y teclado en la ficha.
- **C8, sobre la `Session` real** (`src/client/sesion/partida.ts`, en Node), **semilla 41**: el
  héroe de la persona contra un monstruo, **lanzando de verdad** (rayo, andar, «Levantar zombi» con
  la acción legal que da `battleLegalActions`), luego «Resolver sola» (`autoResolveBattle`) y el
  diálogo con los métodos que pulsa la página (`cambiarLoQueSobra`, `loQueSobraDeLaIA`,
  `confirmarLoQueSobra`); el marcado del diálogo con `renderLoQueSobra`. Los workarounds, abajo.
- Tests, por partes y con su porqué (abajo). Ni `pnpm verify` ni la suite entera.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| C1 | Objetivo «cadáver» con su frase; `problemasDelHechizo` dice qué entregas, áreas y efectos admite y rechaza lo demás con su motivo | ✅ | El editor ofrece `cadaver` con la frase «el cadáver de una casilla sin nadie vivo encima: el último que cayó en ella, que se gasta». Probado en la ficha (`capturas/qa-magia-2…4`): proyectil → «a un cadáver se llega con la entrega «libre», «contacto», «alcance», no con «proyectil»»; área 1 → «a un cadáver no hay área: se levanta uno»; diferido → «a un cadáver no se lanza diferido: al caer, el cadáver podría ya no estar»; un daño en vez de levantar, o levantar + daño → «a un cadáver se lanza un solo efecto, «levantar»»; levantar a un enemigo, a una casilla, sobre sí o al tablero → ««levantar» solo va con el objetivo «cadaver»»; `afecta` puesto → «a un cadáver sobra «afecta»: no alcanza a nadie vivo»; «Zombi Malo» en `vivos` y «zombi» sin «:» en `de` → «… tiene que ser el id de una unidad». Libre, contacto y alcance, sin área ni afecta → «Vale». Dentro de un disparador no se ofrece «Levantar» (opciones: daño, cura, disipar, cifra, impedir, escudo). |
| C2 | Qué levanta cada cadáver | ✅ | Navegador, s7: goblin enemigo → **Zombie** (ronda 3, `qa-04`); el cadáver de ese zombi → **Esqueleto guerrero** (ronda 7, `qa-07`); el del esqueleto → rechazo (ronda 9, `qa-08`). Núcleo (guion en Node sobre `batallaDeArena`): el cadáver de un **aliado** (templario del propio bando) vale (`castBlocker` = `null`). Espectro, caballero de la muerte y cuerpo del héroe: `test/levantar.test.ts` («qué sale de cada cadáver», «del cuerpo del héroe, nada»), verde (abajo). |
| C3 | `castBlocker` rechaza con su motivo, y lo leen acción, `legalActions` y pantalla | ✅ | En la barra de la página, tras el clic: casilla vacía → «En (4,7) no hay ningún cadáver.» (`qa-03`); vivo encima de un cadáver sin gastar → «En (7,5) hay una unidad viva (Zombie).» (`qa-05`); gastado → «El cadáver de (8,4) ya se levantó.» (`qa-06`); esqueleto → ««Levantar zombi» no levanta nada del cadáver de Esqueleto guerrero.» (`qa-08`). Sin cadáveres, el botón sale apagado con `title="no hay ningún cadáver que levantar"` (`qa-01`). `legalActions` y el agente: `pnpm qa` sale 0. Ver H2: el resumen del botón miente cuando el único cadáver está fuera de alcance. |
| C4 | Stack nuevo del bando de quien lanza, en la casilla del cadáver; el cadáver se gasta y deja de verse; no cuenta contra el tope | ✅ | s7, ronda 3: `stacks 6 → 7`, `attacker-1 Zombie en (8,4) bando attacker`, aro del bando izquierdo, sin turno esa ronda (le llega en la 4); maná 50 → 41. Cuando el zombi se va a (7,5), en (8,4) ya no se pinta nada (`qa-04c`) y pulsarla dice «ya se levantó». El tope: `test/levantar.test.ts` «no cuenta contra el tope de tropa». Núcleo: dos levantados seguidos en la misma batalla salen con ids distintos (`attacker-2`, `attacker-3`). |
| C5 | `levantar_zombi` en `data/hechizos.json`, no muertos, que pasa la validación | ✅ | `id levantar_zombi`, «Levantar zombi», gremio 2, maná 6, alcance 4, `facciones: ["no-muertos"]`, `{vivos: zombi, de: {zombi: esqueleto-guerrero}}`; el editor dice «Vale: se puede lanzar y guardar.» (`qa-magia-1`), y la arena y la partida lo cargan. |
| C6 | El editor de magia elige el objetivo y el efecto nuevos; «Guardar» lo escribe y lo vuelve a leer | ✅ | Uno nuevo: objetivo `cadaver`, efecto «Levantar», `de` «zombi: esqueleto-arquero» → «Vale» (`qa-magia-6`). «Guardar» → «Guardado en data/unidades.json: 34 unidades. … Y en data/hechizos.json: 45 hechizos.»; en el disco, `"objetivo":"cadaver","efectos":[{"tipo":"levantar","vivos":"zombi","de":{"zombi":"esqueleto-arquero"}}]`; releído en una página nueva, igual y «Vale» (`qa-magia-7`). Con `vivos: no-existe`, «Guardar» se niega: «No se ha guardado: data/hechizos.json: «Alzar arquero QA» nombra «no-existe», que no es ninguna unidad de data/unidades.json.» (ver H3). `data/` devuelto como estaba. |
| C7 | En la arena: se lanza sobre un cadáver y aparece el zombi (o el esqueleto); el cadáver deja de verse | ✅ | Capturas `qa-01` a `qa-08`, una partida de la arena de la semilla 7, montada y jugada con clics. Sin errores de consola en toda la pelea. |
| C8 | En la partida, el levantado se queda en el ejército; si pasa del límite, se elige al terminar | ✅ | `Session` real, s41, Aldo de Valdeluz con 6 goblins (cupo 6, tope 20): rayo en las rondas 1-2, anda, y en la ronda 3 levanta un Zombie de un cadáver a su alcance; «Resolver sola» → la batalla queda terminada **sin cerrar** y la barra dice «No cabe todo lo que vuelve de la batalla: elige qué dejas.»; el diálogo propone dejar 1 goblin (la regla de la IA). Sin dejar nada → «aún sobra: serían 7 de 6 individuos y 9 de 20 de liderazgo», y «Seguir» no cierra; 2 goblins → «Dejas de más: aún cabe un Goblin lancero.», y no cierra; 1 goblin + el zombi → el mismo «dejas de más»; solo el zombi → vale; «+» cinco veces sobre el zombi no pasa de 1. «Como propone la IA» y «Seguir» → la batalla se cierra, barra «… dejas 1 × Goblin lancero, que no caben.», ejército final 5 goblins + 1 Zombie (6 de 6), hecho `left_behind` con `actor: 0`. La IA, la guarnición (P7, el equipo se pierde y la crónica lo dice), el monstruo (P1) y el que pierde sin rendirse: `test/sobrantes.test.ts`, verde (abajo). |
| C9 | Tests de la regla | ✅ | `test/levantar.test.ts` (13) y `test/sobrantes.test.ts` (15) cubren lo que pide el criterio; los demás ficheros tocados, al día (lista en `implementacion.md`). |
| C10 | typecheck, lint, tests por partes, banco sin cambiar, `pnpm qa` | ✅ | `pnpm typecheck` sale 0. `pnpm lint` sale 0, «Found 10 infos.» (las de `tools/taller/unidades.ts`, de antes). `pnpm banco`: «ancla: igual — las 20 partidas se juegan hexágono a hexágono igual», 0/20 sin terminar. `pnpm qa` sale 0: «terminado por fin de partida: 1 mapa diseñado, 4 turnos de mapa, 157 decisiones de batalla y 1 ascenso de tropa a héroe». |

**Espectador (P4)**: `test/espectador.test.ts -t levantado` → 1 passed: el levantado viaja con su
`levantadoDe`, `adaptarBatalla` lo devuelve igual y `mismaBatalla` dice que es la misma batalla con
un stack más, así que la animación no se reinicia. El animador es el mismo que pinta la arena, donde
el levantado aparece en su paso (arriba). No se abrió `pnpm mirar` con un levantado de verdad: el
agente no lanza el hechizo solo.

### Tests corridos y su porqué

- `pnpm vitest run test/arena-equipo.test.ts test/levantar.test.ts test/sobrantes.test.ts` → 3
  files, 52 passed. `arena-equipo`, porque es el rojo que dejaba el informe de /simplify y el
  commit dice haberlo arreglado después; los otros dos, porque son la regla que firmo en C2-C4 y C8.
- `pnpm vitest run test/espectador.test.ts -t levantado` → 1 passed, para P4.
- Los demás ficheros los dejó en verde el ingeniero tras /simplify (`implementacion.md`,
  «Verificación»): los cito, no los repito.

## Hallazgos

### H1 — importante: «Editar» sobre un levantado a media pelea no funciona y dice algo interno

Pasos: `/arena/?seed=7`, el mismo montaje de arriba (el zombi **no** está en el montaje). Ronda 3:
se levanta un Zombie. En su turno (ronda 4), «Editar» en su ficha, PV 85 → 222, Tab.

Lo que pasa: el campo vuelve a 85 y el editor y la barra dicen «No se cambia: La pelea no trae la
ficha de unidad:zombi: no la montó la arena.» (`capturas/qa-09-retoque-zombi-levantado.png`). Sin
error de consola. En el núcleo, `retocarEnBatalla` **lanza** con esa frase (`fichaDeAntes`,
`arena/retoque.ts:201`); la sesión la recoge y la enseña.

Lo que espera quien juega: el botón «Editar» sale en el levantado como en cualquier otra unidad, así
que debería cambiar su tipo (como pasa si el zombi también venía en el montaje: lo cubre
`test/magia-arena.test.ts`), o no ofrecerse y decir por qué en palabras de la persona. «ficha de
unidad:zombi» y «no la montó la arena» son de la casa.

### H2 — menor: con el único cadáver fuera de alcance, el botón dice que no hay cadáver

Pasos: s7, ronda 3, el héroe en (3,4) y el cadáver del goblin en (8,4), a 5 casillas (alcance 4).
El botón «Levantar zombi» sale apagado con `title="no hay ningún cadáver que levantar"`, con el
cadáver a la vista (`qa-02b`). Es `cadaverBlocker` sin apuntar (`battle/lanzar.ts`), que dice lo
mismo si no hay cadáver que si ninguno está a su alcance. Quien juega espera algo como «ningún
cadáver a su alcance (4 casillas)». El rechazo por distancia con la casilla elegida sí existe, pero
con el botón apagado no se puede llegar a él.

### H3 — menor: el editor dice «Vale» de un levantar que «Guardar» rechaza

Pasos: «Editar magia», «+ Nuevo hechizo», objetivo `cadaver`, efecto «Levantar», `vivos` =
`no-existe`. La ficha dice «Vale: se puede lanzar y guardar.»; «Guardar» se niega con «… nombra
«no-existe», que no es ninguna unidad de data/unidades.json.». `levantadosBlocker` solo corre al
leer el catálogo (al guardar y al cargar), no en el veredicto en directo de la ficha. Por el código,
lo mismo pasa con un vivo en `de` («goblin-lancero: zombi»): la ficha no lo marca. Esto **no** lo
guardé para verlo. «Guardar» falla en alto y lo dice, así que no se pierde nada; el «Vale» es falso.

### H4 — menor: la ayuda del panel dice «pulsa sobre la unidad objetivo» con un hechizo de cadáver

Con «Levantar zombi» elegido, el panel lateral dice «Levantar zombi: pulsa sobre la unidad objetivo.
Escape cancela.» (`qa-05`, `qa-06`, `qa-08`) y la barra, «pulsa la casilla donde lanzarlo». La
frase del panel es fija (`batalla/panel.ts:346`) y ya era así con los hechizos de casilla; con un
cadáver confunde más, porque lo que se pulsa no es una unidad.

## Workarounds usados

- **El espejo `SesionDeArena` para saber dónde pulsar** (arena). Solo calcula píxeles y la unidad
  activa. Todas las jugadas son clics en la página y cada turno se compara con ella. No afecta al
  usuario.
- **Conocimiento 5 en el héroe izquierdo** (arena), cambiado con su campo de la ficha: con 20 de
  maná no llegaban los cinco lanzamientos del guion. Se cambia desde la página, como lo haría
  cualquiera, así que no es un workaround que se le ponga delante al usuario.
- **C8 sobre la `Session` en Node, no en la página**: llegar jugando a un gremio 2 de los no
  muertos con el ejército lleno son días de partida, y la página de la partida no tiene ganchos para
  preparar el estado. Con los ayudantes de `test/partida-de-prueba.ts`, al héroe se le dio a mano un
  ejército lleno (6 goblins), «Levantar zombi», «Rayo» y 60 de maná, y se forzó la batalla contra
  un monstruo de 3 goblins. A partir de ahí todo es la `Session` real: la batalla se jugó con
  acciones legales, y el cierre con «Resolver sola» y los métodos del diálogo. Esto no afecta al
  usuario, porque el cierre no mira cómo se consiguió el ejército. Lo que deja **sin probar** está
  abajo.
- **El cadáver del héroe y el de un espectro** salen solo en los tests: un héroe que cae cierra la
  batalla en el acto (`bandoVencido`), así que en una partida no se puede llegar a apuntar a su
  cadáver. Es un rechazo defensivo.

## No probado

- **El diálogo de lo que sobra en la página de la partida** (`pnpm dev`, «Continuar» → `<dialog
  id="sobrantes">`, Escape que no lo cierra, el aspecto de «Seguir» apagado): no se llegó jugando,
  por el coste dicho arriba. Lo probé sobre la `Session` real y su marcado con `renderLoQueSobra`
  (`capturas/qa-c8-dialogo.html`). La captura del ingeniero (`partida-sobrantes-*`) es de antes de
  /simplify, con la frase vieja («quedan 7 individuos y caben 6»).
- **`pnpm mirar` con un levantado en pantalla**: el agente no lanza el hechizo solo. Lo cubren el
  test del cable y el animador compartido.
- **«Luchar» en la arena con un hechizo que levanta una unidad que no existe**, sin guardar (H3).
- `pnpm capturas`: no lo corrí. El cambio que se ve en la arena ya lo ejercí con clics, y la última
  pasada entera del ingeniero llegó a «espectador» y «arena» en verde.

## Notas que no son de esta tarea

- Tras el «Guardar» del editor, `git status` marcaba `data/heroe.json` modificado además de
  `data/hechizos.json`, sin haber tocado el cuerpo del héroe en esa página. Lo devolví sin mirar la
  diferencia. Parece del «Guardar» de la arena y no de esta tarea; no lo he investigado.
- El «Guardar» rechazado deja en la consola «Failed to load resource: … 400 (Bad Request)». Es el
  rechazo del servidor y lo provoqué yo a propósito.

## Veredicto

**Apto con reservas** (en la escala del coordinador: **Hallazgos**, ninguno bloqueante). La regla, la
arena, el editor, el cierre con lo que sobra, el banco y el agente hacen lo que pidió el usuario. Las
reservas: H1, el retoque de un levantado a media pelea, que no funciona y habla en jerga de la casa;
H2 a H4, frases que confunden; y el diálogo de lo que sobra, que no se ha visto en la página de la
partida.

## Vuelta 2

QA, 09-11-2026, sobre `187f4a2a` (la corrección de H1-H4). No he tocado código. Árbol limpio al
empezar y al acabar (`git status --short` vacío). `data/` igual byte a byte (`sha256sum -c` de los
28 ficheros, OK tras el «Guardar» rechazado). Solo los criterios que tocan H1-H4, más una pasada
adversarial sobre lo cambiado.

**Cómo**: Playwright con Chromium sin pantalla. Vite propio en el :4795, lanzado dos veces con `set -m`
en su propia línea (PID = PGID 113636 y luego 116729, `cwd` en este worktree) y matado por su grupo.
Las dos veces, `ss -ltnp | grep :4795` daba «libre». El `:3636` ajeno sigue escuchando y no lo he
tocado. **Arena**: `/arena/?seed=7`, el mismo montaje de la vuelta 1, hecho con clics (un héroe a
cada lado, Conocimiento 5 en el izquierdo; a la derecha tres goblins y un esqueleto guerrero; la
derecha en «Yo»; «Luchar»; «Listo» en los dos despliegues). Todas las jugadas, con clics reales. El
espejo `SesionDeArena` solo dice dónde pulsar, y cada retoque de la página se le aplica igual
(`espejo.retocar`). Así no se desincroniza: en toda la pelea no salió ningún «DESINCRONÍA».
**Editor de magia**: el mismo vite, con clics y teclado. Guiones en el scratchpad, fuera del repo.

### Criterios

| Hallazgo | Criterio | | Evidencia |
|---|---|---|---|
| H1 | «Editar» un levantado que no venía en el montaje cambia su tipo | ✅ | s7, ronda 4, turno del zombi `attacker-1` (levantado en la ronda 3, en (8,4)). La ficha abre con PV 85; PV 222 → «Cambiado: vale ya en esta pelea.» en el editor y en la barra; el campo se queda en 222 (`qa2-03`). |
| H1 | Un segundo retoque compara con el primero | ✅ | En el mismo turno, PV 222 → 40. La ficha abre con 222. El parte dice «Cambian las cifras de Zombie a media pelea (vida 85 → 222)» y después «(vida 222 → 40)» (`qa2-04`). |
| H1 | Lo que se levanta después nace con lo retocado | ✅ | Ronda 5: el segundo zombi, `attacker-2`, se levanta del goblin caído en (7,5). Nace con **40 PV**, y su fila dice «▶ Zombie B 40 PV · tú Editar» (`qa2-05`). En el espejo, `levantables`: `{zombi: 40, esqueleto-guerrero: 30}`. |
| H1 | Un tipo que pelea y además se levanta: el retoque alcanza a los dos | ✅ | Ronda 6: el héroe derecho mata a `attacker-1` con Rayo, y de su cadáver se levanta un Esqueleto guerrero, `attacker-3`, en (8,4). Además ya peleaba `defender-3`, del montaje. «Editar» en el levantado, PV 30 → 77. Las dos filas dicen 77 PV: «▶ Esqueleto guerrero 77 PV» (el levantado, del bando izquierdo) y «◀ Esqueleto guerrero 77 PV» (el del montaje, del derecho). En el registro: `Esqueleto guerrero [defender-3,attacker-3] vida 30 → 77` (`qa2-06`). |
| H1 | Volver a retocar el zombi con uno vivo y otro muerto | ✅ | Ronda 6, zombi 40 → 60, desde «Editar» en `attacker-2`. El parte dice «vida 40 → 60». El muerto (`attacker-1`) queda con `hp` 60 y `count` 0, y el vivo con 60/60 (`qa2-07`, `qa2-08`). Sin errores de consola en toda la pelea. |
| H2 | Botón apagado por distancia | ✅ | Ronda 3: el héroe en (3,4) y el único cadáver en (8,4), a 5 casillas (alcance 4). El botón sale apagado con `title` «ningún cadáver que se pueda levantar está a su alcance (4 casillas)» (`qa2-01`). Es la misma frase que da `castBlocker` sin apuntar en el espejo. Sin cadáveres (ronda 2), sigue diciendo «no hay ningún cadáver que levantar». A 2 casillas, encendido: «Cuesta 6 de maná». Pulsarlo apagado no elige nada ni cambia la barra. La rama «en contacto» no se alcanza con los datos de hoy (`levantar_zombi` es de alcance); la cubre `test/levantar.test.ts`. |
| H3 | La ficha del editor dice lo mismo que «Guardar» | ✅ | «+ Nuevo hechizo», objetivo cadáver, efecto «Levantar». Con `vivos` = `no-existe`, la ficha dice ««Alzar QA2» nombra «no-existe», que no es ninguna unidad de data/unidades.json» (no «Vale»), y la lista, «SOLO ARENA · NO VALE» (`qa2-09`). «Guardar» se niega con «No se ha guardado: data/hechizos.json: » más **la misma frase** (`qa2-12`). Con `de` = «goblin-lancero: zombi»: ««Alzar QA2»: Goblin lancero no es no-muerto, y de un vivo sale siempre lo de «vivos» (zombi)» (`qa2-10`). Con `de` = «zombi: no-existe-2»: «… nombra «no-existe-2» …». Vuelto a `zombi`, «Vale» y desaparece el «no vale». Con `vivos` = una unidad **nueva, sin guardar** (`templario-escudo-2`, creada con «Crear» en la misma página): «Vale» (`qa2-11`). En la lista, ningún hechizo del juego sale «no vale»: solo el de la prueba. |
| H4 | La ayuda del panel dice qué se pulsa | ✅ | Con «Levantar zombi» elegido: «Levantar zombi: pulsa la casilla del cadáver que levantar. Escape cancela.» (`qa2-02`). Con «Flecha mágica»: «… pulsa sobre la unidad objetivo …», como antes. La barra de abajo sigue diciendo «pulsa la casilla donde lanzarlo». No es mentira (el ingeniero lo declara como desviación). |

### Tests

- `pnpm vitest run test/levantar.test.ts test/magia-arena.test.ts test/magia-cliente.test.ts` → «3
  passed · 41 passed». Son los tests de H1-H4. Los vuelvo a correr sobre el árbol del commit (el
  ingeniero los corrió antes de commitear) y porque la rama «en contacto» de H2 solo la prueban
  ellos.
- Lo demás (`typecheck`, `lint`, `arena*`, `paneles`, `escenas`, `session`, `magia-motor`, los
  invariantes, `documentacion`, `exportaciones`, `banco`) lo dejó en verde el ingeniero
  (`implementacion.md`, «Tras QA, vuelta 1 → Verificación»). Lo cito y no lo repito: desde entonces
  no ha cambiado nada en `src/` ni en `test/`.

### Hallazgos de la vuelta 2

**N1 — menor: en la arena, el zombi que se levanta no tiene las cifras de la página, y «Editar» lo
destapa.**
Pasos: `/arena/?seed=7`, el montaje de arriba. Antes de «Luchar», «+ der.» en el Zombie, abrir su
ficha, PV 85 → 100, y quitarlo del bando: queda editado en la página, sin guardar y sin pelear.
«Luchar»; en la ronda 3 se levanta un zombi del goblin caído.
- El levantado pelea con **85 PV**, los del juego, y no con los 100 de la página («▶ Zombie 85 PV»,
  `qa2-14`).
- «Editar» sobre él abre la ficha con **PV 100**. Al cambiar solo el ataque, 2 → 3, el parte dice
  «Cambian las cifras de Zombie a media pelea (ataque 2 → 3; vida 85 → 100)»: un cambio de vida que
  la persona no ha hecho en ese gesto (`qa2-15`).

La causa: `catalogoDeLaPelea` (`src/core/arena/montaje.ts`) busca lo que se levanta en
`CATALOGO_DEL_JUEGO` cuando no viene en el montaje, y `catalogoDelMontaje` solo recibe las unidades
de los bandos. `fichaDelTipoAntes` (la corrección de H1) lee ese mismo catálogo, así que la batalla
es coherente consigo misma. Lo que no cuadra es la batalla con la página.

Lo que espera quien juega: en la arena pelea lo de la página, guardado o no. Es lo que ya hace el
veredicto de la ficha de magia tras H3 (`unidades()` = las de la página, sin guardar incluidas).
El fallo no viene de 187f4a2a: el levantado ya nacía con 85 desde /simplify. Pero H1 lo hace
visible, porque ahora «Editar» abre la ficha de la página. Solo pasa si se edita el zombi sin
montarlo; sin editarlo, todo cuadra. No bloquea.

### Workarounds de la vuelta 2

- **El espejo `SesionDeArena`**, como en la vuelta 1: solo calcula los píxeles y la unidad activa,
  y cada retoque se le repite con `retocar`. No afecta al usuario.
- **Los goblins y el héroe derecho terminan turno sin hacer nada**, salvo el Rayo que mata al
  primer zombi. Así es como lo jugaría una persona que lleva los dos bandos («Yo» a los dos lados).
  No es estado sintético.

### No probado en la vuelta 2

- **El `title` del botón apagado en pantalla**: Chromium sin pantalla no dibuja el tooltip nativo.
  Leí el atributo, que es lo que enseña al pasar el ratón. Que el motivo de un hechizo apagado solo
  se vea en el tooltip es de antes de esta tarea.
- **Retocar con el mismo valor**: rellenar el campo con lo que ya tenía no dispara `change`, así que
  la página no hace nada (`qa2-04b`). El «Sin cambios» de la sesión no lo vi en pantalla.
- **H2 «en contacto»**: ningún hechizo del juego levanta en contacto. Solo lo cubre el test.

### Veredicto de la vuelta 2

**Apto.** H1-H4 están arreglados y se ven en el flujo real: el retoque de un levantado, dos veces;
lo que se levanta después, que nace con lo retocado; un tipo que pelea y además se levanta, retocado
en los dos bandos; el botón por distancia; la ficha del editor con la frase de «Guardar»; y la ayuda
del panel. Sin errores de consola en la pelea. En el editor de magia, el único error de consola es el
400 del «Guardar» que rechacé a propósito. N1 es menor y viene de antes de este commit. Se puede
arreglar ahora o dejar en el backlog: no bloquea.
