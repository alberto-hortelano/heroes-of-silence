# Crítica — la magia se juega

**#2 REENCUADRADA · #3 PREMATURA · #4 VIGENTE · #24 VIGENTE**

Buen racimo, pero no es la cadena que dice el documento y uno de los cuatro eslabones está
bloqueado por issues que no están en la lista. **El problema real, en una frase:** siete hechizos,
un motor de lanzamiento completo y un gremio que solo recarga maná — **la magia existe en el
núcleo y no llega ni a quien juega ni a la IA.**

## La premisa, afirmación por afirmación

**Ciertas, comprobadas una a una**: nada escribe en `hero.spells` (solo `setup.ts:76` y
`game.ts:405`) · `castHeroSpell` valida entero (`battle.ts:709-750`) · `legalActions()` ofrece los
`cast` legales y filtra inmunidad (`battle.ts:783-797`, líneas exactas) · `maxSpellLevel()` no lo
lee nadie (`hero.ts:72`) · el gremio solo recarga maná (`game.ts:247`) y pinta un número
(`panels.ts:167`) · solo hay `mage_guild_1` y `_2` (`buildings.json:8-9`) · `tactics.ts` no cita
`cast` ni `wait` · el cliente solo emite `defend` y `wait` (`main.ts:289-293`).

**Tres son falsas.**

1. **«Hoy no puede lanzar un hechizo nadie».** El agente MCP sí puede. Ejecutado sobre partida
   real (semilla 7): el héroe inicial nace con `magic_arrow` y 20 de maná, y en la primera batalla
   `legalActions()` devuelve `{"type":"cast","spell":"magic_arrow","target":"defender-0"}`; el
   esquema zod lo acepta (`agent.ts:37`) y el formato se lo enseña (173). Lo cierto es más
   estrecho: **no puede la persona, no quiere la IA, y ningún héroe aprende un segundo hechizo en
   toda la partida.** Error espejo del ciclo anterior.
2. **#3.3: «el solar `guild` se deriva del catálogo, `townPlots()` ya lo hace».** Deriva las
   moradas; el gremio está escrito a mano en `SOLARES_DE_VILLA` (`client/render/town.ts:38`):
   `chain: ['mage_guild_1','mage_guild_2']`. Añadir `mage_guild_3` a los datos lo haría
   construible por la IA y **no clicable por la persona**: el solar se vería terminado.
3. **#4.4: «el registro emite `cast`, falta contarlo».** Ya se cuenta (`panels.ts:278`), con el
   id crudo y sin decir sobre quién: eso es **#18**.

## El día después

Con #4 hay botón de hechizo y 20 de maná desde el día 1; con #2, un libro que crece: cambio real
y visible, sin puertas cerradas, sin contradecir `CLAUDE.md` y sin nada que borrar.
**El sustrato del ciclo anterior, comprobado:** aguanta lo que se le pide, pero justo eso.
`EffectKind` es `speed|luck|attack` y `effectOfSpell` (`spells.ts:73`) devuelve `null` para el
resto. Un Ardor Sanguíneo (`attack`) toca cuatro sitios —`SpellKind`, `castSpell`,
`effectOfSpell`, `temporalEffect`—; un `defense`, esos cuatro **más** `effectiveDefense`
(`damage.ts:43`, que no lee `effectTotal`) **más** `ETIQUETA_EFECTO` (`panels.ts:262`): no es
«simétrico y gratis», es motor. Y `castHeroSpell` exige objetivo siempre (`battle.ts:722`), así
que masivo o global no cabe. **Sirve para los cuatro `kind` que existen y uno más; no para #26.**

## Conflictos

**#3 está bloqueado dos veces y el documento no lo ve.** *Por Sabiduría (#6, #15)*: ningún héroe
puede tener `wisdom` nunca — `hero.skills` solo se escribe en `setup.ts:77` (`{logistics:1}`) y
`game.ts:406` (`{}`), y `levelFromExperience` (`hero.ts:133`) no lo llama nadie; con **#2.3** tal
como está, `maxSpellLevel()` devuelve **2 siempre** y `lightning_bolt` y `cure` **siguen muertos
tras #2 y #3**. **#2.3 y #3 se contradicen**; cuál cede, al arquitecto.

*Por contenido (#26)*: contra 3+3+2+2+1, el catálogo real (3/2/2/0/0) debe 1 de nivel 2, 2 de
nivel 4 y 1 de nivel 5. Y de nivel 4-5 en el original todo es masivo, área, resurrección,
invocación o mapa: lo declarado fuera. Con `damage|speed|luck|heal` solo cabe un Rayo más caro y
una Curación más cara. **#3.2 no es realizable sin invadir #26**; su propia válvula es la
respuesta. *Corolario que toca a #2*: con 3/2/2 hechizos para 3/3/2 huecos el libro lo determina
el nivel del gremio, así que #2.1 sortea sin alternativas y #2.6 no demuestra nada.

**Solapamientos fuera de la lista**: #4.4 con **#18**; #2.3 con **#15** (`wisdom` pasa de rasgo
muerto a rasgo que siempre vale cero); #4.1 roza **#12**.

**#24 contra #47: #47 no tiene que ir antes, pero la medida de #24.4 está mal.** #24 no puede
causar #47 ni colgar una batalla: `MAX_ROUNDS = 100` con `finishByExhaustion` (`battle.ts:250`),
`autoResolve` corta a 5000 con desempate (`tactics.ts:127`), y `armyPower` (`strategy.ts:30`)
ignora héroes, maná y hechizos, así que el umbral de 1,05 no se entera. Sí cambia qué semillas
caen en el empate. Barrido de hoy: **4 de 40 no terminan en 300 días (9, 18, 24, 34)**; 1234
tampoco; las tres de `game.test.ts` (1235, 4321, 555) terminan los días 8, 6 y 7 — elegidas a mano
para esquivar #47, así que medir ahí no distingue «no empeora» de «suerte».

**La cadena real.** **#2 → #4 → #24 → #3** es falso: es un abanico. #4 y #24 **no dependen de #2**
—`legalActions()` ya ofrece `cast magic_arrow`, comprobado—. Solo hay dos aristas: **#2 → #3** y
**#2 → #24.2** (sin libro, las heurísticas de buffo no se ejercen en partida, sí en test). Orden:
**#4 · #2 · #24**, con **#3 fuera**.

**Coste contra valor.** #4 y #24 se pagan solos —y #4 va primero: lo único desbloqueado hoy, lo
más barato y lo único visible desde la primera partida—; #2 también, sin sorteo y sin la puerta de
Sabiduría. **#3 cuesta cuatro hechizos de relleno y reescribir un solar para entregar dos niveles
que nadie puede aprovechar**: no hacerlo no cuesta nada, hacerlo cementa el bug. Quien lo
desbloquea es **#6 + #15**; que #3 se vaya a ese racimo.

## Qué le cambiarías a `requisitos.md`

- «Hoy no puede lanzar un hechizo nadie» → «**el agente MCP sí puede, y solo `magic_arrow`**:
  `legalActions()` se lo ofrece y su esquema lo acepta. No puede la persona, no quiere la IA de
  reglas, y ningún héroe aprende un segundo hechizo».
- La cadena → «**#2 → #3** y **#2 → #24.2**. #4 y #24 no dependen de #2. Orden: **#4, #2, #24**».
- **Sacar #3 del racimo**; al issue: «Bloqueado. Los niveles 3-5 no los puede aprender nadie
  mientras `wisdom` sea inobtenible (#6, #15), y el contenido de 4-5 es #26. Va con #6+#15».
- **Borrar #2.1 y el sorteo de #2.6**: nada que sortear hasta #26. Y **reescribir #2.3** eligiendo
  una: se aplica `maxSpellLevel()` y se acepta que dos hechizos siguen muertos hasta #6+#15
  (dicho en el issue), o se aplaza la puerta de Sabiduría — no las dos.
- Añadir a #4: «`SOLARES_DE_VILLA` (`town.ts:38`) tiene el solar `guild` escrito a mano;
  `townPlots()` **no** lo deriva». Y #4.4 → «la crónica ya pinta `cast` (`panels.ts:278`) con el
  id crudo; aquí solo se pone el **nombre**. Quién a quién es #18».
- #24.4 → «medida sobre **40 semillas**, no sobre las tres de `game.test.ts`. Línea base: **4/40
  no terminan (9, 18, 24, 34)**. Cambiar una semilla del test **no** cuenta como pasar». Y anotar
  que se dejan fuera el contraataque, el orden de iniciativa y proteger a los propios tiradores.
- Pregunta 2: `attack` cuesta **cuatro** sitios de motor y `defense` **seis**: gratis, ninguno.
