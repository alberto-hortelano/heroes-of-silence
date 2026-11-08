# QA: las facciones de cada hechizo (08-11-2026)

Probado sobre el árbol sin commitear del worktree `competent-chatelet-aa2f1f`, ya con los cambios de
`/simplify` (`hechizosDelGremio(nivel, facciones[])`, `poderDeUnidadBlocker` → `{motivo, corto}`,
`problemasDeSubconjunto`). Navegador: Playwright sin pantalla (Chromium de la caché), con un vite propio
en un puerto libre para cada pasada (38643, 44229, 34545, 39033 y 44941). Al acabar, cada uno muerto
por su grupo y su puerto comprobado libre con `ss -ltnp`. Antes copié `data/` y lo restauré después de
cada pasada que guarda. Al final, `git status --short data/` deja solo ` M data/hechizos.json`, que es el
cambio de la tarea.

Scripts: `.cache/facciones/comprobar.ts` y `partida.ts` (los del ingeniero, que volví a correr) y los
míos, `.cache/facciones-qa/qa.ts`, `qa2.ts`, `qa3.ts` y `qa4.ts`. Las capturas están en
`.cache/facciones-qa/`.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | Cada hechizo lleva sus facciones, con ids de `FACTION_IDS` | ✅ | `node` sobre `data/hechizos.json`: 43 hechizos, todos con `facciones`. Llevan las cinco salvo `curar` → `["templarios"]` y `zombi_pegajoso` → `["no-muertos"]`. El diff del JSON solo añade `facciones` tras `gremio` y reescribe el `_comment` |
| 2a | Rechaza una facción que no existe y nombra las que valen | ✅ | Con `haste` con `["enanos"]` puesto a mano, `/` y `/arena/` dicen «La página no arranca … «Prisa»: facciones: "enanos" no existe; valen templarios, no-muertos, imperio, elfos, orkos» (`e-haste-con-enanos--*.png`). La lista sale de `FACTION_IDS` (`validar.ts`, `problemasDeSubconjunto(h.facciones, FACTION_IDS, …)`) |
| 2b | Rechaza una repetida | ✅ | `magia-formato.test.ts` («elfos» repetida), en verde según el coordinador después de `/simplify` |
| 2c | Rechaza la lista vacía | ✅ | En el navegador: ««Prisa»: facciones está vacía: un hechizo es de una facción o de varias» y la etiqueta «NO VALE» en la lista (`.cache/facciones/2-prisa-vacia.png`). «Guardar» no la escribe |
| 2d | Rechaza el campo ausente o que no es una lista | ✅ | Con `haste` sin la clave, a mano: las dos páginas dicen «data/hechizos.json: - «Prisa»: falta «facciones»» (`e-haste-sin-facciones-*.png`). Lo de «no es lista» y `undefined` lo cubre `magia-formato.test.ts` |
| 3 | En el editor se marcan y desmarcan, la lista vacía se ve como problema y «Guardar» escribe | ✅ | `comprobar.ts`: desmarcar pone el «•», la lista vacía da el problema y «NO VALE», guardar `["templarios","orkos"]` lo escribe en disco y al recargar sale igual y sin «•». En `qa.ts`, la barra espaciadora sobre «Orkos» la desmarca y deja el foco en `orkos`; otra vez, vuelve a marcarla y el «•» desaparece; el tabulador va de «Templarios» a «No muertos». Tras guardar, en disco solo cambia `haste`: el `_comment` sigue igual, los ids en el mismo orden y `facciones` en su sitio (`id,nombre,descripcion,mana,gremio,facciones,entrega,…`) |
| 4 | Un hechizo nuevo nace con facción válida | ✅ | «+ Nuevo hechizo» sale con las cinco marcadas (`comprobar.ts`, paso 4) |
| 10 | La copia conserva las facciones | ✅ | La copia de Curar sale solo con Templarios (`comprobar.ts`, paso 4) |
| 5 | Tests de la validación | ✅ | `test/magia-formato.test.ts`: los cinco rechazos, un caso con varias facciones y otro con las cinco. El coordinador lo dejó en verde después de `/simplify`; lo cito y no lo repito |
| 6 / 9 | El enlace (versión 22), el retoque y el núcleo con el campo nuevo | ✅ | `qa3.ts`: monté un héroe y un monje a la izquierda y un monje a la derecha y pulsé «Copiar enlace de la pelea». El enlace tiene 5388 caracteres y dentro va `v=22`, con `haste`, `magic_arrow`, `slow`, `cure` y `lightning_bolt` con 5 facciones cada uno y `curar` con 1. Al abrirlo: «Montada la pelea del enlace … pulsa Luchar». El mismo enlace con `v=21`: «este enlace es de una versión anterior de la arena (la 21; la de hoy es la 22): vuelve a copiarlo». El retoque a media pelea no lo probé en el navegador: lo cubren los tests que cita el ingeniero |
| 7 | `typecheck` y `lint` limpios; tests por partes | ✅ | `pnpm typecheck` sin errores. `pnpm lint`: «Checked 768 files … Found 10 infos» (los de antes, en `tools/taller/unidades.ts`). Corrí los que nadie había vuelto a correr después de `/simplify`: `invariantes-capas` (el import nuevo de `types.ts` en `magia/`), `invariantes-datos` (el JSON), `morada` (el panel lee `townSpells`), `agent-contract` (`teaches`), `magia-cliente` y `ficha-en-tabla` (la ficha de los poderes). Resultado: **6 ficheros, 180 tests en verde**. Además, `pnpm qa` sale 0 (`teaches` sale de `townSpells`) |
| 8 | El editor en el navegador | ✅ | Ver las filas 3, 4 y 10. Sin errores de consola, salvo los dos 400 de los «Guardar» que se rechazan, que el script exige que sean exactamente esos dos |
| 11 | `_comment` y docs al día | ✅ | El `_comment` lo dice con fecha. `docs/areas/{batalla,arena,partida,catalogo}.md` y `CLAUDE.md` están tocados (ver H4, de antes de esta tarea) |
| 12 | El gremio enseña solo los de la facción de la ciudad | ✅ | En el flujo real (`qa.ts`, C): en el editor quité Orkos a Prisa y guardé. Partida `?seed=1&faccion=orkos&heroe=orko`, construí el Gremio de magia I: «ENSEÑA Flecha mágica, Lentitud», sin Prisa (`c-gremio-orkos-sin-prisa.png`). La misma semilla con `faccion=elfos&heroe=guerrero`: «Prisa, Flecha mágica, Lentitud» (`c-gremio-elfos-con-prisa.png`). Con los datos de hoy ninguna partida cambia, porque los cinco del gremio son de las cinco facciones: el coordinador dejó `pnpm banco` igual al ancla después de `/simplify` (ver «Notas») |
| 13 | La carga rechaza una unidad con un poder de otra facción | ✅ | Con `curar` → `["elfos"]` a mano, `/` y `/arena/` dicen «La página no arranca … data/unidades.json: la unidad «Monje»: «Curar» no es de su facción (Templarios): es de Elfos» (`e-curar-de-los-elfos-*.png`). Desde el editor, «Guardar» lo rechaza con la misma frase y no toca el disco (`comprobar.ts`, paso 5) |
| 13 (ficha) | Ficha del monje: el poder apagado con su rótulo | ✅ | `qa2.ts`, F: «[off] Zombi pegajoso (de otra facción) {«Zombi pegajoso» no es de su facción (Templarios): es de No muertos}». Los que crecen con el poder siguen saliendo como «(crece con el poder)», cada uno con su motivo. Luz cegadora y los demás válidos, encendidos |
| 14 | `zombi_pegajoso` es solo de los no muertos | ✅ | Ver la fila 1 |

## Hallazgos

### H1 (importante): un gremio construido que no enseña nada a su facción dice «Sin gremio: construye uno»

Es consecuencia directa de C12. `renderTownSpells` (`src/client/partida/base/panel.ts:318-322`) toma
`townSpells(town).length === 0` como «no hay gremio». Hasta ahora era lo mismo, pero ya no: un gremio de
nivel 1 sin ningún hechizo de su facción también da lista vacía.

Pasos (`qa.ts`, D):

1. Abrir `/arena/?vista=magia`.
2. En Flecha mágica, Prisa y Lentitud, desmarcar «Orkos» y pulsar «Guardar» (se guarda sin queja).
3. Abrir `/?seed=1&faccion=orkos&heroe=orko`, ir al ayuntamiento, «Construir» Gremio de magia y «Cerrar».
4. Pulsar el gremio.

El panel se titula «Gremio de magia I» y debajo dice «Sin gremio: construye uno para que tus héroes
aprendan magia aquí.», con la ficha de la ciudad mostrando «Gremio de magia 1»
(`.cache/facciones-qa/d-gremio-orkos-vacio.png`). Quien juega esperaba algo como «Este gremio no enseña
hechizos de los orkos hasta el nivel 1». Hoy le dicen que construya lo que acaba de construir.

Con los datos de hoy no pasa: los cinco del gremio son de las cinco facciones. Pero se llega solo con
el editor y «Guardar», sin tocar nada a mano, y es justo lo que la regla nueva permite.

### H2 (menor, declarado en «Qué NO queda cubierto»): la arena no avisa del poder que deja de valer hasta «Guardar»

`qa2.ts`, G: en la misma página marqué Elfos en Curar y desmarqué Templarios, sin guardar. La ficha de
magia no muestra ningún problema y la del monje sigue con «Curar (12 PV)» puesto, sin aviso. Solo
«Guardar» lo rechaza. Está en el backlog del plan (§6). Lo apunto porque quien juega lo descubre al
final y no donde lo cambió.

### H3 (menor, de antes de esta tarea): «Guardar» reescribe `data/heroe.json`

Cada «Guardar» de la arena deja 19 líneas cambiadas en `data/heroe.json`. El fichero no está en la forma
de `JSON.stringify(…, null, 2)`, comprobado con `node`, y el diff de la tarea no lo toca. No es de esta
tarea, pero quien guarde facciones desde la arena verá ese fichero sucio en `git status`.

### H4 (menor, de antes, documentación): `docs/areas/arena.md:81` sigue diciendo «versión 20» del enlace

La línea 27, que tocó esta tarea, ya dice 22. La 81, «Copiar enlace de la pelea … versión 20 desde el
material de la muralla», es anterior y quedó desfasada al lado.

## Workarounds usados

- **Editar `data/hechizos.json` a mano** (E) para ver que una página que no arranca dice por qué. Es
  exactamente el caso que cubre el contrato «Una página que no arranca dice por qué» y no afecta a
  quien juega. Restaurado.
- **Abrir una partida nueva por URL** (`?seed=1&faccion=…&heroe=…`) para llegar al gremio. Es el arranque
  documentado; se construyó el gremio con clics reales.
- **Dar permiso de portapapeles al contexto de Playwright** para leer el enlace copiado. Solo afecta a
  la lectura de la prueba.

Ninguno esconde un obstáculo de quien juega.

## No probado

- **El retoque `hechizos` a media pelea**, en el navegador: lo cubren los tests de la arena que cita el
  ingeniero. No lo repetí.
- **Que el héroe aprenda en su libro solo lo de su facción** en la partida: lo vi en el panel del gremio,
  no en el libro. `game.test.ts` lo cubre con un hechizo solo de los elfos y el coordinador lo dejó en
  verde después de `/simplify`.
- **`pnpm capturas` y `neutro.ts`**: las capturas no abren el editor de magia, y la línea de CSS no cambió
  desde el `neutro.ts` del ingeniero (0 diferencias). La fila a 375 px se parte en dos líneas sin
  scroll horizontal (`scrollWidth` 375 = `innerWidth`, `h-fila-375.png`).
- **`pnpm banco`**: lo cito. El coordinador lo dejó igual al ancla después de `/simplify` y no repetí.

## Notas

C12 de `requisitos.md` daba por hecho que el banco se movería y habría que re-anclar. El plan (§1) vio
que con los datos de hoy ninguna partida cambia, porque los cinco del gremio son de las cinco
facciones, y el banco sigue igual. La regla está, y se ve en el flujo real (fila 12), pero ninguna
partida con los datos de hoy la nota. Repartir esos cinco por facción es una decisión del usuario sobre
los datos, no un fallo.

## Veredicto

**Hallazgos: apto con reservas.** Los criterios 1-14 se cumplen en el flujo real y en los tests, sin
errores de consola. H1 es una frase falsa en la pantalla del gremio que la regla nueva hace posible:
conviene corregirla antes de cerrar. H2-H4 son menores y anteriores o ya están declarados.

## Corrección del coordinador (08-11-2026, tras este informe)

- **H1, corregido**: `renderTownSpells` (`src/client/partida/base/panel.ts`) mira el nivel del gremio
  (`mageGuildLevel`) para decir «Sin gremio»; con gremio y nada de su facción dice «Este gremio no
  enseña ningún hechizo de su facción.». Comprobado con Playwright (`.cache/facciones-qa/h1.ts`):
  Flecha, Lentitud y Prisa sin orkos, guardado, partida de los orkos, gremio I construido → la frase
  nueva, sin «Sin gremio», consola limpia; `data/` restaurado.
- **H4, corregido**: `docs/areas/arena.md` dice la versión 22 del enlace.
- **H2 y H3**: backlog (avisar en la ficha de magia de que quitar una facción deja sin poder a una
  unidad; «Guardar» reescribe `data/heroe.json` por su formato).
