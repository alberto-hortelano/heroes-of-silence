# Barrido de bugs del núcleo — requisitos

**Fecha:** 2026-08-23
**Issues:** #46, #13, #8, #9 (hito *1 · Se nota jugando*)

## Petición literal

> Sesion reiniciada, empieza con los issues con el flujo de agentes

Al preguntarle por dónde arrancar entre cuatro grupos del backlog, el usuario
eligió **«Barrido de bugs (#46 #13 #8 #9)»**, descrito así en la pregunta:

> Mejora de nivel 6 inexistente para el nigromante, moradas sin requisitos,
> cuatro rasgos de criatura declarados y muertos, hechizos que no caducan.
> Barato y deja el núcleo honesto, pero no se nota tanto jugando.

Y sobre el cierre eligió **«Commit y cerrar issues»**: si QA da apto, commit en
`main` con los documentos del ciclo, push, y cerrar los issues cubiertos con un
comentario que explique qué se hizo.

## Qué tienen en común los cuatro

En los cuatro el código **declara algo que luego no cumple**: un edificio que se
puede comprar y no hace nada, una cadena de progresión que no encadena, cuatro
rasgos escritos en el tipo y en los datos que el motor no lee, y unos hechizos
sin duración ni inmunidades. No son fallos de escritura: son promesas sin
respaldo. El arreglo tiene que quitar la promesa o cumplirla, nunca dejarla a
medias.

## Criterios de aceptación

### #46 — la mejora de nivel 6 que no existe

El dragón óseo no tiene `upgradesTo` en `data/creatures.json`, pero `upgrade_6`
existe para las dos facciones. Un nigromante paga 8000 de oro y 20 gemas, no
cambia nada, y encima quema su construcción del día
(`src/core/town/town.ts:106-114`).

1. En un pueblo nigromante con `dwelling_6` construido,
   `buildBlocker(town, 'upgrade_6', bolsa)` devuelve un motivo escrito para la
   persona, no `null`.
2. `build()` lanza si se intenta: ni el oro ni `builtToday` se consumen.
3. En un pueblo caballero, `upgrade_6` sigue construyéndose y convierte los
   paladines disponibles en cruzados.
4. La regla es **general**, no un caso especial del dragón óseo: cualquier nivel
   cuya criatura base no tenga `upgradesTo` rechaza su mejora.
5. La pantalla de castillo de un nigromante no ofrece ese eslabón — el solar
   `lvl6` se ve terminado con la morada. Hoy `src/client/render/town.ts:48-56`
   encadena `dwelling_6 → upgrade_6` para las dos facciones por igual.

### #13 — las moradas no encadenan

En `data/buildings.json` solo `town_hall`, `city_hall`, `castle`, `mage_guild_2`
y los `upgrade_N` tienen `requires`. Las moradas de niveles 2 a 6 no piden nada.

1. Cada `dwelling_N` con N ≥ 2 exige, como mínimo, la morada del nivel anterior.
2. No se puede levantar `dwelling_6` el día 1 por mucho oro que haya.
3. `prebuiltBuildings()` sigue dejando una partida jugable desde el día 1.
4. El motivo del rechazo ya lo escribe `buildBlocker` (`falta construir "…"`):
   la pantalla no reimplementa ni una regla.
5. Test: el número mínimo de días para llegar a `dwelling_6` desde un pueblo
   recién creado es el que dice la cadena — uno por día, porque solo se
   construye un edificio diario.

### #8 — los cuatro rasgos muertos

`src/core/types.ts:66-77` declara `charge`, `fear`, `curse_on_hit` y
`splash_shot`; `data/creatures.json` se los asigna a caballería, campeón, dragón
óseo, momias y liches; y **ninguno se lee en ninguna parte del motor**.

1. `charge`: daño extra proporcional a los hexes recorridos antes de golpear
   (caballería y campeón).
2. `fear`: el dragón óseo penaliza al bando contrario. **No puede apoyarse en
   la moral tal cual**: `battle.ts:106` la fija una sola vez al crear la
   batalla y la fuerza a 0 en los no-muertos, así que contra el nigromante
   —una facción entera— no haría nada. El arquitecto decide el mecanismo.
3. `curse_on_hit`: la momia deja maldición sobre el objetivo al golpear.
4. `splash_shot`: el disparo del lich salpica a **todo** lo adyacente al
   objetivo, **aliados incluidos**, como en el original. Decidido por el
   usuario. Hay que mirar que `tactics.ts` no haga que la IA se dispare a sí
   misma.
5. Cada uno con **test determinista por semilla** (`createRng`), y visible en el
   registro de batalla si el jugador debería enterarse de que ha pasado.
6. **Un test que recorra `CreatureTrait` y falle si algún rasgo declarado no lo
   lee el motor.** Es el guardián que evita que esto se repita, en la línea de
   `test/invariantes.test.ts`, y tiene que nacer en verde.

### #9 — duración e inmunidades

`spells.ts:61` suma `speedBonus` para siempre: una Lentitud de la ronda 1 dura
toda la batalla. Y un no-muerto acepta Bendición y Curación tan tranquilo.

1. Prisa y Lentitud caducan; al expirar, el bono desaparece de verdad.
2. La duración es observable: estado del stack y/o registro de batalla.
3. Un no-muerto es inmune a **Maldición**, incluida la que aplique
   `curse_on_hit`. La inmunidad a Bendición y a Curación **se aplaza a #2**:
   hoy ningún héroe conoce esos hechizos, así que la regla no se podría
   ejercer ni probar de extremo a extremo.
4. `legalActions()` no ofrece un `cast` que después va a ser rechazado.
5. La duración es observable en el estado del stack y en el registro de
   batalla. **No se abre el esquema zod ni `RESPONSE_FORMAT`**: el contrato ya
   manda `speed`, `luck` y `morale` con el efecto aplicado
   (`serialize.ts:127,135,136`), así que las consecuencias observables ya
   viajan. Si no se toca `src/server/`, no hace falta `pnpm qa`.

## Fuera de alcance

Se dice explícitamente para que nadie lo amplíe por su cuenta:

- **#2 / #3 / #4** — que el gremio enseñe hechizos, los niveles 3-5 del gremio y
  poder lanzar desde el cliente. Es la siguiente tarea, no esta.
- **#24** — que la IA lance hechizos.
- **#7** — el asedio (`hasWalls()` sigue siendo código muerto).
- **#20** — nombres temáticos de morada por facción.
- **Arte.** No se genera ni una imagen: **cero gasto en fal.ai**.

## Contexto que solo tiene el coordinador

- Es la **primera vez que rueda el ciclo de agentes** de este repo. Si algo del
  proceso estorba, dilo en tu documento: se va a afinar después.
- Las cifras del juego se verifican contra **fheroes2** (`CLAUDE.md`), no contra
  el recuerdo del original.
- **Toda tirada pasa por `createRng(seed)`**. Un rasgo con probabilidad que use
  `Math.random` rompe `test/invariantes.test.ts`.
- **Fail-loud**: una acción ilegal lanza con un mensaje escrito para la persona
  (`no se puede construir Mejora de nivel 6: …`), no se corrige en silencio.
- El cliente no aplica reglas: pasa por `src/client/session.ts`.
- Presupuesto de fal.ai para esta tarea: **0 $**.

## Preguntas abiertas y su suposición por defecto

1. ~~#9 puede ser PREMATURA~~ — **resuelta por la crítica, y mi premisa era
   falsa**. No es que solo el agente por MCP pueda lanzar Prisa: **no puede
   nadie**. `battle.ts:526` rechaza lo que no esté en `hero.spells` y
   `legalActions` (`battle.ts:586`) solo recorre esa lista; nada escribe nunca
   en ella. Controladores capaces de lanzar Prisa hoy: **cero**. #9 se queda
   igualmente, reencuadrada, porque **#8 le fabrica el consumidor**.
2. **#46 se arregla rechazando**, no inventándole una mejora al dragón óseo:
   fheroes2 tampoco se la da.
3. ~~La cadena exacta de #13~~ — **decidida por el usuario: una cadena POR
   FACCIÓN**, con sus requisitos y sus costes, como fheroes2. Ver la sección
   de correcciones.
4. **Duración por defecto de Prisa/Lentitud**: el poder mágico del lanzador en
   rondas, que es lo del original.

---

# Correcciones tras la crítica — 2026-08-23

La crítica (`critica.md`) dio **#46, #13 y #8 VIGENTES** y **#9 REENCUADRADA**, y
encontró una dependencia oculta que invierte el orden. Lo que sigue manda sobre
lo escrito arriba; los criterios de arriba ya llevan aplicadas las correcciones
puntuales.

## El orden cambia: #46 · #13 · #9 · #8

**#8 y #9 no son independientes.** `curse_on_hit` aplica maldición **sin héroe y
sin hechizo**: en cuanto la momia funcione dejará `luck −1` permanente y
acumulable hasta −3 en tres golpes. Implementar #8 sobre el motor de hoy es
**volver a crear el bug que arregla #9**, y pagarlo dos veces.

El modelo de efecto con turnos restantes entra **antes** que `curse_on_hit` y
`fear`. Y eso es lo que salva a #9 de caer por falta de valor: hoy ningún
controlador puede lanzar un hechizo, pero **#8 le fabrica el consumidor dentro
de esta misma tarea**.

## #13 — la cadena es POR FACCIÓN (decisión del usuario)

Hoy `data/buildings.json` tiene **un solo juego de moradas compartido por las dos
facciones**. La decisión es reestructurarlo: cada facción con sus requisitos y
sus costes, como fheroes2.

Criterios que sustituyen a los de arriba para #13:

1. Cada morada de nivel N ≥ 2 exige, como mínimo, la del nivel anterior **de su
   facción**. Requisitos y costes pueden diferir entre caballero y nigromante.
2. No se puede levantar la morada de nivel 6 el día 1 en ninguna de las dos.
3. `prebuiltBuildings()` sigue dejando una partida jugable desde el día 1, y
   sigue siendo correcto para las dos facciones.
4. El motivo del rechazo lo escribe `buildBlocker`: la pantalla no reimplementa
   ni una regla.
5. Test por facción: la secuencia mínima de días hasta la morada de nivel 6 es
   la que dice su cadena — uno por día, porque solo se construye un edificio
   diario.

**El ripple es real y hay que decidirlo en `plan.md`, no a mitad de la
implementación.** Los ids de morada aparecen hoy en:

- `src/client/render/town.ts:48-56` — las cadenas de los solares `lvl1…lvl6`
- `prebuiltBuildings()` en `src/core/town/buildings.js`
- la tool MCP `building_list` del contrato del agente
- la tabla de solares de `CLAUDE.md`, que hay que actualizar

Dos caminos, y el arquitecto elige y lo justifica: ids propios por facción
(`knight_dwelling_3`…), o ids compartidos con un bloque de anulación por
facción. El segundo ripplea mucho menos; el primero es más explícito.

**Aviso: esto rebalancea la IA.** Verificado por el crítico: 60 días de IA contra
IA con semilla 7 y **las dos facciones levantan `dwelling_4` el día 1**, saltando
la 2 y la 3 (`chooseBuilding` prioriza `100+dwellingLevel`, `strategy.ts:160-174`).
Con la cadena, su ejército del mes 1 será otro. No es una regresión: es el
arreglo funcionando. Pero si algún test de partida se apoya en las cifras de
hoy, hay que actualizarlo **a conciencia y diciéndolo**, no ajustarlo hasta que
pase.

**#20 sigue fuera de alcance** (nombres temáticos de morada por facción), pero la
estructura nueva debe poder llevar un nombre por facción sin volver a tocarla:
después de esto, #20 es casi gratis.

## #9 — reencuadrada

No es «los hechizos no caducan»: es que **el motor no tiene el concepto de efecto
temporal**. Se hace el modelo de efectos con rondas restantes y la inmunidad de
los no-muertos a Maldición —que sí tiene consumidor aquí: la momia maldiciendo
esqueletos en un espejo nigromante—. Bendición y Curación se aplazan a #2.

## Nota de proceso, para la primera vuelta del ciclo

Los issues citan `fichero:línea` y el crítico encontró **dos citas rotas de
cuatro**, una de ellas de fichero equivocado (#8 decía `battle/types.ts` donde es
`core/types.ts`). El coordinador verifica las citas al redactar `requisitos.md`;
conviene seguir haciéndolo.

## Visto bueno al plan — 2026-08-23

El usuario aprobó `plan.md` con tres decisiones explícitas:

1. **`fear` diverge de fheroes2 a propósito**: ataque −2 durante 2 rondas sobre
   el stack que golpea el dragón óseo, en vez del aura de moral −1 del original.
   Motivo: `battle.ts:106` fuerza `morale: 0` a los no-muertos y una de las dos
   facciones lo es entera, así que el aura no asustaría a nadie en un espejo
   nigromante — dejaría el rasgo medio muerto, que es el bug que #8 cierra.
   **Va documentado como divergencia deliberada, no como olvido**: en el código
   y en `CLAUDE.md`, junto a la tabla de reglas verificadas contra fheroes2.
2. **Todo en un ciclo**: #46 · #13 · #9 · #8 seguidos, con el guardián de
   `CREATURE_TRAITS` en el último commit para que nazca en verde.
3. **La morada de nivel 6 exige `castle`**, con la prioridad nueva en
   `chooseBuilding` que eso obliga. El castillo deja de ser un no-op de 5000 de
   oro sin tocar #7.
