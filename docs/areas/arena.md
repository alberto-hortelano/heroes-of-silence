# La arena

Se lee antes de tocar: `src/core/arena/`, `src/client/arena/`, `src/client/sesion/sesion-de-arena.ts`, `tools/arena/`.

El detalle que vivía en `CLAUDE.md` hasta la fase Doc de la reorganización de la arquitectura (08-11-2026), movido tal cual: solo cambiaron las rutas y los símbolos que se habían mudado (`docs/agents/2026-11-06-reorganizacion-de-la-arquitectura/rutas.tsv`). En `CLAUDE.md` queda una línea por puerta y por regla; aquí, su porqué, sus fechas y sus medidas. Una puerta o una regla nueva es una línea allí y su detalle, con fecha, aquí.

## Puertas únicas

### El editor de piezas (arena)

`conPiezas` (la única superposición de piezas sobre un catálogo: cambiar una, abrir un enlace), `cambioDePiezas` (el catálogo nuevo, hecho una vez, o el motivo: nadie de los catálogos deja de valer, dos piezas no se llaman igual, el equipo base del héroe; un retoque a media pelea, `retocarEnBatalla` con `kind: 'piezas'`, pregunta `equipoQueNoVale`), `enElHueco` (lo que exige el hueco; lo que no suma, a 0; el peso se queda), `piezaNueva` (en blanco o copia; ni id ni nombre de otra) y `piezaSobre` (sobre otra, extras a 0), `idsLlevados`/`piezasDelMontaje` (`arena/piezas.ts`). Las lecturas de una pieza atadas a un catálogo, `equipoCon` (`equipo/atado.ts`): la arena no importa las sueltas (`pieza`, `piezasPuestas`, `conEquipo`, `manosBlocker`, `equipoBlocker`, `ponerPieza`, `heroUnit`), que leen las del juego; al héroe lo viste con `cuerpoDelHeroe`. La batalla no lleva catálogo de piezas: quien cambia una a media pelea le da el suyo; el equipo puesto de cada stack, en `UnitInfo.equipo` (lo escribe `conEquipo` y viaja al espectador). Lo vigila `invariantes-datos.test.ts`, por importación

### Unidad nueva de la arena

`unidadNueva` (`arena/unidad-nueva.ts`); cuerpo + equipo con que pelea, `unidadDeCombate` (`core/unidad/formato.ts`)

### Por qué acabó una batalla (arena)

`causaDelFinal` (`battle/consultas.ts`, con `bandoVencido`) → `finalDeArena`

### Enlace de una pelea de la arena

`montajeALaURL` / `montajeDeLaURL` (`?montaje=`, con `?seed=`); un parámetro repetido, `unaVezEnLaURL` (`core/validar.ts`: la lee también la partida, `?seed=` y `?faccion=`); uno retirado, `retiradosDeLaURL`

### El editor de magia (arena)

`client/arena/magia.ts` (`montarEditorDeMagia`, la vista `?vista=magia`); la arena pelea con los de la página (`MontajeDeArena.hechizos`), los cambia a media pelea con el retoque `hechizos` y los lleva en el enlace (`hechizosDelMontaje`, versión 22: la 21 no traía las facciones); «Guardar» escribe `data/hechizos.json` (`escribirCatalogo`, en `FICHEROS_DEL_CATALOGO`). **Las facciones de cada hechizo** (08-11-2026, `docs/agents/2026-11-08-facciones-de-los-hechizos/`): una casilla por facción en la ficha, bajo «Gremio» (`data-magia-faccion`; el cambio, `conFaccion`, `core/magia/editar.ts`, en el orden de `FACTION_IDS` y sin mover la clave); quitar la última se deja y se ve como problema («facciones está vacía»), y «Guardar» no la escribe; un hechizo nuevo nace de las cinco (`hechizoNuevo`) y una copia conserva las suyas (`copiaDe`). Quitar a un hechizo la facción de una unidad que lo usa como poder lo rechaza «Guardar» («no es de su facción»); la ficha de magia no lo adelanta (backlog). En la ficha de la unidad, un poder de otra facción se ofrece apagado, con su motivo en el `title` y «(de otra facción)» (`poderDeUnidadBlocker`)

**Levantar** (08-11-2026, «Levantar zombi»): el objetivo «cadaver» y el efecto «Levantar» en la ficha (lo que sale de un vivo, `vivos`, y de cada no-muerto, `de` en una línea «zombi: esqueleto-guerrero»; no se ofrece dentro de un disparador); «Guardar» rechaza una unidad que no existe o un vivo en `de` (`levantadosBlocker`), y la ficha lo dice ya con la misma frase y sin «Vale» (`problemasDeLaFicha`, `client/arena/magia.ts`, con las unidades de la página; H3 de QA, 09-11-2026). Lo que se levanta y no pelea en ningún puesto sale de las unidades de la página, con lo no guardado (`MontajeDeArena.unidadesDeLaPagina`, una copia al pulsar «Luchar»; N1 de QA, 09-11-2026: antes salía del catálogo del juego y el zombi levantado no tenía las cifras de su ficha), y sin ellas, del catálogo del juego (`catalogoDeLaPelea` las busca **solo** para lo que nombra un `levantar` de sus hechizos, `unidadesQueLevanta`; otro id que no pelea lanza, como antes: /simplify, 09-11-2026); si pelea, con las suyas, y un retoque lo rehace (`levantablesDe` con `catalogoTrasElRetoque`, que conserva las de la página). No viajan en el enlace: al abrirlo, la página ya tiene las suyas

### Cambiar cifras a media pelea (arena)

`retocarEnBatalla(state, r, catalogo)` (`arena/retoque.ts`, con el catálogo de la pelea, `catalogoDeLaPelea`; lo gastado se conserva con `gastadoDeMas`); el catálogo tras un retoque que entra, `catalogoTrasElRetoque`, el único: lo leen la batalla y la sesión (09-11-2026, /simplify de «Levantar zombi»: la sesión llevaba su copia y ya divergía); el tipo de un stack, `tipoDelStack`; un levantado que no venía en el montaje se retoca como cualquiera: sin ficha del montaje, la de antes es la de la unidad con que pelea ahora (`fichaDelTipoAntes`, H1 de QA de «Levantar zombi», 09-11-2026: decía «la pelea no trae la ficha de unidad:zombi»); el parte, el evento `retoque`

## El cliente

### Arena

**Arena** (`pnpm arena`): **edita el catálogo del juego** (19-10-2026, decisión del usuario) y
monta peleas con sus reglas. Las unidades son las de `data/unidades.json` y las piezas, las de
`data/equipo.json`: «Guardar» escribe los dos, y el cuerpo de todo héroe en `data/heroe.json`, en una operación (`escribirCatalogo`,
`tools/arena/borrador.ts`), validados con la regla de la carga del juego (`leerCatalogos`,
`moradasBlocker`), conservando su `_comment` y sin recargar la página (`handleHotUpdate` por
contenido, `tools/vite/arena.ts`); si algo no vale no escribe ninguno, y uno ilegible no se pisa.

**Ni lo guardado desde otra pestaña** (26-10-2026): la página lee la versión en disco de los dos
ficheros (`versionDelCatalogo`, un hash de su texto) y la devuelve al guardar; si cambió, no se escribe
ninguno y lo dice, «recárgala» (`guardarCatalogo`, `tools/arena/borrador.ts`). Tras guardar, la página
adopta la versión que dejó escrita.
Guardar cambia lo que se recluta y se compra en `pnpm dev`. La arena construida (sin servidor) lee
el catálogo del núcleo y no guarda.

**Solo las cinco facciones**, toda
unidad de una casilla y sin munición.

**Sin compatibilidad hacia atrás** (14-10-2026: «estamos en
pleno desarrollo»): el catálogo y el enlace se leen solo en el formato de hoy; una unidad del
catálogo que no vale (editada a mano) no deja arrancar la página, que dice por qué (`comun/arranque.ts`).
Es también el banco
de combate: un héroe por lado con libro (`heroeDeArena`, con el equipo base) y **el cuerpo de todo
héroe** (03-11-2026, petición del usuario: «los héroes son casi indestructibles… ¿cómo las puedo
editar en la arena?»): PV, fuerza y agilidad del héroe recién hecho (`combate` de `data/heroe.json`,
`CuerpoDeTodoHeroe`, con su regla de carga, `combateDelHeroe`) se escriben en la ficha de
cualquiera de los dos héroes y cambian a los dos (`HeroeDeArena.cuerpo`, el mismo en los dos:
un enlace con dos distintos se rechaza), también a media pelea; «Guardar» escribe solo ese
`combate` y deja la rendición, el equipo base y el comentario (`escribirCatalogo` con `heroe`; su
versión, en la de «Guardar», `FICHEROS_DEL_CATALOGO`).

**Y su equipo** (04-11-2026, petición del
usuario: «no se les puede cambiar el equipo y no pueden tener armadura»): cada héroe lleva el
suyo (`HeroeDeArena.equipo`), que empieza en `EQUIPO_BASE` y se cambia en la sección «Equipo» de
su ficha, la de las unidades (`equipoDeLaFicha`, `opcionesDelHueco`, `quitarBlocker`,
`equiparEnArena`, `quitarEnArena`, para una unidad o un héroe), con la regla del equipo de una
unidad (`equipoDeUnidadBlocker`, que `heroeDeArena` aplica al vestirlo); va en el enlace, nadie
borra una pieza que lleve (`cambioDePiezas(…, heroes)`) y «Guardar» no lo escribe. El retoque
del héroe a media pelea compara su ficha entera en palabras (`fichaDelHeroe`: también el cuerpo y
lo puesto; sin ellos, cambiar PV o equipo a media pelea no hacía nada). Y **pelea como el
juego** (19-10-2026): sin interruptores; un `?reglas=`, `?golpe=` o `?contacto=` se rechaza
diciéndolo («la arena pelea con las reglas del juego: quita «?reglas=» de la dirección»,
`retiradosDeLaURL`) y el enlace que lo trae no se monta. Lo suyo: la muralla, retocar cifras a
media pelea y que quién mueve es del **bando entero** (Yo / IA en su cabecera; con un solo bando
de la persona, la rueda dice «Tu golpe»). Monta sus unidades como stacks del catálogo de la pelea
(`catalogoDelMontaje`; dos unidades distintas con el mismo id lanzan). «Copiar enlace de la
pelea» escribe el montaje entero (`?montaje=`, versión 22 desde las facciones de los hechizos, 08-11-2026, sobre la 21 de los hechizos enteros y la 20 del material de la muralla, `VERSION_DEL_ENLACE`, leída estricta:
unidades con cuerpo y equipo, puestos `{ unidad }` y todas las piezas que lleva lo montado con sus
bases en cadena, `piezasDelMontaje`); al abrirlo, sus piezas entran en el catálogo de la página
como cambios sin guardar, con la regla de editarlas a mano (`conPiezas`, `cambioDePiezas`), y la
barra dice cuántas cambia.

**Un enlace de otra versión se rechaza** («este enlace es de una
versión anterior: vuelve a copiarlo»), sin convertir nada; cambiar el formato o las reglas es
subir la versión. Abrirlo lo monta sin luchar.

**Recargar deja la vista** (23-10-2026): la edición y el equipo van en la
URL (`?vista=edicion|equipo`, con `?pieza=` en el equipo), que escribe solo `irA` y el repintado
del equipo (`vistaALaBarra`) y lee el arranque (`vistaDeLaURL`: una que no vale se dice y abre el
montaje); la pelea no sobrevive a recargar.

**Cuerpo y equipo** (12-10-2026, ciclo 2 del
nivel único): una unidad es un cuerpo (`cuerpo: { hoja }`, el arte con que se pinta) más su
equipo (cinco huecos, `data/equipo.json`), y pelea con las dos cosas (`unidadDeCombate` →
`conEquipo`); de las dos sale el nivel, y del nivel su coste (la ficha lo lee: «Coste»). Las hojas de un personaje (`Hoja.personaje`) comparten cuerpo y agilidad
(`AGILIDAD_DEL_CUERPO`, `tools/arena/velocidades.ts`). «Nueva unidad» (`unidadNueva`) crea desde
una hoja entera una unidad `<hoja>-<n>`, con el cuerpo común y la Espada (`ESPADA`) por todo
equipo, con el `n` libre también entre las que no valen (`IdsOcupados`); nace en el nivel que dé
su índice y la barra lo lee de él (`avisoDeNuevaUnidad`); su arte es el de su cuerpo
(`cuerpo.hoja`, nunca el Y Bot en lugar del arte); sin `edificio`, la partida no la recluta. Un
catálogo con solo unidades que no valen se dice leído (`avisoDelCatalogoLeido`).

**La muralla de
la arena** (`battle/muralla.ts`, formas en `data/borradores/murallas.json`, `arena/murallas.ts`):
muros altos donde suben los de dentro y los atacantes con escalera o el rasgo `escalar`, puertas
entre dos casillas que abre y cierra quien defiende, sin tiro a través en el suelo; un tirador en
lo alto suma `defensaEnLoAlto` (`data/muralla.json`, inventado), que pone `opcionesDeDanio` y por
eso lo cuentan igual el golpe, la IA, la ficha y la previsión. Las formas de la arena son de
piedra; las batallas del mapa llevan la de su sitio (piedra o madera, `data/sitios.json`), y un
enlace con `"material": "madera"` la monta de madera. Los botones de la muralla son los de la
partida (`MurallaDeLaActiva`, `botonesDeMuralla`).

**En el montaje, los bandos y la ficha mandan sobre la muralla** (#246, 11-11-2026,
`docs/agents/2026-11-11-arena-clic-a-1024/`): su fila no baja de 24rem (la cabecera de un bando
con una unidad, y el título de la ficha con la primera fila de su tabla de cifras, también la de
quien dispara: 373 px medidos) y la muralla toma lo que sobra hasta su alto, que es el de su
rejilla: los mandos (la regla en prosa, las formas) se desplazan a su lado (`contain: size`,
`arena.css`). Antes su fila `auto` tomaba el alto de los mandos y, desplegada —lo de salida—,
los bandos y la ficha medían 0 px a 1024×768 y a 1280×800 y 70 a 1440×900: el clic en el nombre
de una unidad caía en la rejilla. Hoy a 1024×768 la muralla se desplaza 30 px y desde 1280×800
entra entera; a ≤ 760 px no cambia. Lo vigila la pasada «montaje-anchos» de `pnpm capturas`
(`tools/qa/capturas/pasadas/montaje-anchos.ts`; sola, `CAPTURAS_SOLO=montaje-anchos`, ~12 s):
a 1024×768, 1280×800, 1440×900 y 1920×1080, desplegada y plegada, la cabecera y la primera
unidad de cada bando enteras a la vista, `elementFromPoint` en el nombre de cada unidad, el clic
de verdad que abre su ficha y se lee, y la muralla que se usa (la última casilla, una forma).

**Poderes** (11-10-2026; también en el juego): una unidad con Curar lo
usa en su turno (jugada `power`, cierra el turno, no tras moverse). En la batalla,
«Editar» del panel abre la ficha del tipo o del héroe y el cambio vale en la pelea y en el
catálogo. La ficha escribe ataque, fuerza, agilidad y PV, y da de final la defensa, el daño, las
casillas y «peso N de F: −k agilidad» (montado de guerra, «peso N de M (Caballo de guerra): −k
casillas», y con montura una fila más, «Marcha», `marchaDe`) (`filasDerivadas`,
`client/arena/paneles/ficha.ts`).

**El nivel no se escribe** (12-10-2026): la
ficha enseña «Índice N · nivel n» (`lecturaDelNivel`), que se recalcula al tocar cualquier cifra o
pieza; una unidad con `level` no vale. `SesionDeArena` vive en `sesion/partida.ts`.

**La vista de
edición** («Editar fichas», `arena/edicion.ts`): las
fichas que se quieran, sin tope (12-10-2026), las mismas del montaje (`fichaDe`), recordadas en
`localStorage`, en tres columnas como mucho y las demás debajo; la vista se desplaza entera, como
una página, sin regiones ni fichas con scroll propio. Un gesto de ficha escribe en la ficha que lo
contiene (`fichaDelElemento`, por `data-clave-de-ficha`), qué se abre lo dice `abrirFichaBlocker`,
un cambio repinta solo su ficha, nunca en `elegida`, y cada retrato anima y gira el suyo
(`animDeFicha`). La lista solo se pliega con su botón (`listaPlegadaTras`).

**La ficha**, una sola
disposición en el montaje, la edición y el combate: el título es el nombre con «✎ Editar»
(`renombrar`; Intro guarda, Escape no; sin campo «Nombre» entre las cifras), arriba la figura con
sus clips en columna y las cifras a la derecha (en una columna estrecha, debajo: `@container`;
en combate, sin figura), y los rasgos del motor como las habilidades: etiquetas con × y el resto
en un desplegable.

**Las cifras, en una tabla de una columna** (13-10-2026, `tablaDeCifras`): el
nivel arriba («Índice N · nivel n») y una fila por cifra con rótulo corto, la casilla que se
escribe (el cuerpo; en el héroe, sus cuatro, y las de su cuerpo sin casilla) y el **final**, un
`<output>` que no se escribe, con todo lo que suma (`unidadDeCombate`; en el héroe, su cuerpo con
rango y equipo base), en otro tono si cambia. Sin «En la pelea» ni párrafos de nota: **toda
aclaración es un tooltip** (`nota`, `views/notas.ts`: un «ⓘ» con `aria-label` y sin `title`,
que se enseña en un bocadillo junto a él al pasar el ratón, al tocarlo o con el foco del teclado en
él —nunca con el foco de una casilla: tapaba lo que se escribía—, anclado con `position-area`), en
la fila, en la cabecera de la columna, en el título de cada sección, en el de la ficha (lo que
decía su pie) y en cada poder; también en el editor de equipo. La casilla cabe cinco cifras (en
`ch`), las cabeceras van en una línea y, si a su lado no cabe la tabla entera, va debajo de la
figura (`flex-wrap`); lo vigila `cifrasCortadas` (`tools/qa/capturas/ficha.ts`) en
`pnpm capturas`. La pastilla de modificador tiene letra y tamaño propios (12 px) en todas partes.

**Lo que suma una pieza tiene una forma**: `modificadoresDePieza` (`equipo/dicho.ts`, una
lista en el orden de `CIFRAS_DE_PIEZA`, con `NOMBRE_DE_CIFRA`, los rótulos de la tabla) y
`textoDeModificador` (signo siempre, el único que formatea); en pantalla, `modificadoresEnPantalla`
(una pastilla por cifra, en la ficha, el editor de equipo y los paneles del juego), y donde no cabe
marcado (un `<option>`, el agente), `cifrasDePieza`, el mismo texto con comas. Una unidad con el arte a medias (el taller generándola)
se lista como incompleta con su motivo y no se monta —nunca el Y Bot en su
lugar—; `vite build` lo avisa y no falla (`arteEnOchoDirecciones`, #140).

**El editor de
equipo** («Editar equipo», escena `equipo`, también desde el panel de la pelea; 18-10-2026): el
catálogo entero, en cinco secciones por tipo —Cuerpo a cuerpo (`arma`, con la casilla «es una lanza»), A distancia,
Armadura, Escudo y Montura (26-10-2026: fuerza, agilidad, peso y la casilla «de guerra»; una nueva
nace con la fuerza del cuerpo común y agilidad 2, `enElHueco`)—, con el sello «armería», «botín» o «solo en kits», y la ficha de la elegida con
solo los campos de su tipo (`camposDelHueco`), un precio en oro y dos casillas «Se consigue».
Una pieza puede ir **sobre otra** de su hueco (desplegable «Base», con la cadena dicha: Espada →
Espada de herrería → Espada bendita); cada cifra se escribe como extra y su final va al lado, y el
vínculo es vivo (cambiar la base cambia lo que cuelga de ella y a quien lo lleva). Las de cuerpo a
cuerpo llevan «Rueda del golpe» (niveles absolutos, vuelta 2 del 18-10-2026): una barra por tipo del
anillo (sin Normal, siempre ×1) de 0 a 6, llena desde la izquierda hasta el nivel, con «−» (baja un
nivel, peor) y «+» (sube, mejor; también en la Finta, donde mejor es restar menos), que no pasan de
0 ni de 6, y lo que da ese nivel al lado («Daño ×1,5», «resta 1 a 5 casillas»); sin base, la
casilla es el nivel, y con base, lo que lo sube o lo baja (la barra, el final; uno fuera de 0 a 6 no
vale, con su motivo). Un arma nueva nace con todo a 3, como la Espada. Al lado, la rueda del combate
teñida por nivel (el mismo tono para el mismo nivel en toda arma, del rojo del 0 al verde del 6),
solo para leer (`ruedaDeLaPieza`, en `batalla/rueda/disco.ts`, la geometría que comparte con
`batalla/rueda/rueda.ts`). «+ Nueva pieza», «Duplicar», «Nueva sobre esta» y «Borrar» (no se borra la base
de otra, ni la que alguien lleva, ni la última de botín); quien lleva una pieza suma lo que da y su
nivel lo ve. A media pelea, el cambio vale ya para todos los que la llevan, de los dos bandos y el
héroe, con lo gastado restado, y queda en el parte; la IA espera.
