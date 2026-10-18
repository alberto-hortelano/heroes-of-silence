# Requisitos: el combate y los ejércitos de la arena pasan a ser los del juego

## Petición literal (18-10-2026)

> Mete el sistema de combate y los ejércitos en el juego sustituyendo a lo que hay, que no se
> limiten a la arena

Llega por otra sesión, que añadió: lo que hoy solo vive en la arena (`pnpm arena`) pasa a ser el
combate y los ejércitos del juego (`pnpm dev`, la IA de reglas, el agente por MCP, el espectador),
**sustituyendo** lo actual, no conviviendo con ello. Rige «sin compatibilidad hacia atrás»
(memoria del usuario): lo viejo se retira, no se mantiene en paralelo ni se migra.

## Qué es «el sistema de combate de la arena» y «los ejércitos de la arena»

Todo descrito en CLAUDE.md («Puertas únicas», «Reglas del juego», «Arena»):

- **Combate**: la rueda del golpe (`battle/rueda.ts`, `BattleState.arena.golpe`, el
  `<dialog id="rueda">`, la IA a ciegas de `ai/rueda.ts`) con las cifras por niveles del arma
  (`Pieza.rueda`, `cifrasDeLosNiveles`); salir del contacto (`battle/contacto.ts`); la carga a pie
  (`ModosDeArena.cargaAPie`); la armadura en puntos (`trasLaArmadura`, calidad `arena`); las armas
  por uso (huecos `distancia` y `carga`, `usoDelGolpe`); sin munición; «sin arma no se combate»
  (`armaDeCuerpoBlocker`); los poderes de unidad (Curar, Bendecir).
- **Ejércitos**: las cinco facciones de las hojas (Templarios, No muertos, Imperio, Elfos, Orkos),
  cada unidad un cuerpo (`cuerpo: { hoja }`) más su equipo (`KIT_DEL_PERFIL`, `unidadDeCombate`),
  frente al catálogo de criaturas del juego (`data/creatures.json`: caballeros y nigromantes).

## Decisiones del usuario (preguntadas en esta sesión, 18-10-2026)

1. **Facciones: las cinco sustituyen.** Caballeros y nigromantes se retiran; Templarios, No muertos,
   Imperio, Elfos y Orkos son las facciones del juego, con moradas, edificios, reclutamiento y
   guarniciones (neutral y de base) para cada una. Lo que no exista se inventa y se dice inventado
   en su `_comment`.
2. **Equipo: todo pasa a ser de la arena.** Una sola clase de piezas: armadura en puntos, armas con
   niveles de la rueda, huecos por uso. La armería vende y el botín reparte piezas de la arena; las
   piezas que dan PV (y las calidades `armeria`, `comun`, `especial` tal como son hoy) se retiran.
3. **Rueda: la persona elige y el agente también.** En la partida, quien juega elige en el diálogo
   de la rueda (golpe y respuesta, como en la arena); el agente por MCP manda su elección de golpe y
   de respuesta por su contrato (cambian el contrato, las peticiones y `heroes_respond`); la IA de
   reglas elige a ciegas como en la arena.
4. **Muralla de la arena en los asedios: no, después.** Las batallas del mapa siguen sin muralla.
5. **Modos encendidos en el juego**: salir del contacto, carga a pie, armadura en puntos y poderes
   de unidad (además de la rueda). Es decir, todos.
6. **Catálogo: lo que se edita en la arena.** El borrador de la arena pasa a ser el catálogo del
   juego (un `data/unidades.json` que el juego lee): editar y guardar en la arena cambia el juego.
   Cada unidad gana lo que el juego necesita (morada, coste, crecimiento…). Lo mismo, por la
   decisión 2, para las piezas: el borrador de equipo de la arena y `data/equipo.json` dejan de ser
   dos cosas.
7. **La arena se queda sin interruptores.** La arena monta peleas con las reglas del juego: se
   retiran los seis interruptores fheroes2 (`battle/reglas.ts`, `?reglas=`,
   `crearBatallaConReglas` como puerta distinta). Suposición por defecto del coordinador: también
   se retiran los interruptores de modo (`?golpe=`, `?contacto=`), porque el juego los lleva
   siempre encendidos; la arena pelea como el juego.
8. **Bases: los Templarios heredan el arte de base de los caballeros**; las otras cuatro pintan
   marcadores hasta que haya arte (como hoy el nigromante).

## Criterios de aceptación

1. `pnpm dev`: una partida nueva se juega con dos de las cinco facciones; el castillo de cada una
   recluta unidades de su facción (cuerpo + equipo, con el arte de su hoja), y sus guarniciones
   neutrales y de base son de su facción. No queda ninguna criatura de `data/creatures.json` ni
   ninguna referencia a `knight`/`necromancer` como facción jugable.
2. Una batalla del mapa (héroe contra asaltantes, contra una ciudad neutral, contra el otro
   jugador) pelea con la rueda, salir del contacto, carga a pie, armadura en puntos, armas por uso,
   sin munición y poderes de unidad, igual que una pelea de la arena con los mismos ejércitos.
3. La persona, al golpear cuerpo a cuerpo en una batalla del mapa, anda primero y luego elige en
   el diálogo de la rueda; cuando la golpean y le toca responder, elige su respuesta. La IA de
   reglas elige a ciegas.
4. El agente por MCP: su `battle_turn` le pide y acepta la elección de golpe; cuando una unidad
   suya recibe un golpe cuerpo a cuerpo, se le pide la respuesta (petición o campo nuevo, con su
   formato embebido y su veredicto, como el resto del patrón listen/respond). Un valor ilegal se
   descarta con su motivo y se dice qué se jugó en su lugar. `pnpm qa` en verde con el circuito
   entero.
5. El espectador ve esas batallas (rueda, cruce, armadura parada) sin aplicar reglas, por
   `espectador/adaptar.ts`.
6. El equipo del juego es el de la arena: la armería vende piezas de la arena, el botín reparte
   piezas de la arena, el héroe nace con su equipo de la arena (la Espada al menos); ninguna pieza
   da PV.
7. El catálogo que lee el juego es el que guarda la arena: cambiar una unidad o una pieza en la
   arena y guardar cambia lo que se recluta/compra en `pnpm dev`.
8. La arena pelea con las reglas del juego, sin interruptores; lo retirado no deja código muerto
   ni parámetros de URL que se acepten (un `?reglas=`, `?golpe=`, `?contacto=` se rechaza o se
   ignora según la regla de la URL de la arena, diciéndolo).
9. Las bases: Templarios con el arte de base de los caballeros; las otras cuatro, marcadores.
10. Los guardias de `test/invariantes.test.ts` que hoy dicen «solo la arena» se reescriben a la
    regla nueva y se ven morder (rotos a mano, en rojo, antes de darlos por buenos).
11. `barrido-semillas.ts`: 0 partidas sin terminar. Duración y equilibrio medidos (100 semillas) y
    escritos con fecha en CLAUDE.md.
12. `pnpm verify`, `pnpm verify:lento`, `pnpm qa` y `pnpm capturas` en verde; `pnpm banco`
    re-anclado juzgando la forma del diff (aquí cambia todo: se dice y se re-ancla).
13. CLAUDE.md al día: lo que era «solo la arena» pasa a ser regla del juego; lo retirado se quita.

## Fuera de alcance

- La muralla de la arena en los asedios (decisión 4).
- Arte nuevo: bases de No muertos, Imperio, Elfos y Orkos (marcadores), retratos, figuras.
- Ajuste fino de equilibrio más allá de «0 sin terminar» y lo medido: las cifras nuevas
  (costes, crecimientos, moradas) son inventadas y se dicen inventadas.
- Las tres facciones restantes por arte o voces de vecinos especiales: basta con que funcionen.
- Generación de assets con fal.ai (no se gasta nada).
- Compatibilidad con partidas, borradores o enlaces de antes.
- Commit y push: no sin que el usuario lo pida.

## Contexto

- Rama `claude/sad-moser-c52efe` (worktree), sobre `main` en 18a40180: el editor de equipo por
  tipos con bases y la rueda por niveles 0-6 (`VERSION_DEL_ENLACE` 11) ya están fusionados.
- Las unidades de la arena hoy nacen todas del cuerpo común (`CUERPO_COMUN`, nivel 1, índice
  171-194): el nivel derivado de las cifras sin equipo las deja casi todas en el nivel 1. Las
  moradas del juego van del 1 al 6 y la experiencia/rangos leen el índice de poder. El crítico y el
  arquitecto deben decir qué pasa con eso (morada como dato escrito, coste, crecimiento, liderazgo).
- Hojas por facción (`assets/unidades/`, sin héroes): Templarios 7, Imperio 9, Elfos 6, Orkos 7
  (goblins, orkos y troll), No muertos 6; héroes con hoja: 3-4 por facción.
- La máquina es compartida: ningún `pkill`/`killall`/`kill` por nombre; tests caros una vez al
  cerrar; Playwright sin pantalla, nunca el Chrome del usuario. Si hay que enseñar algo al usuario,
  se levanta el servidor en otro puerto y se le da la URL.
- Es un cambio muy grande: el arquitecto puede proponer fases (cada una deja `pnpm verify` verde),
  pero el «hecho» es el conjunto.

## Preguntas abiertas (con suposición por defecto)

- **Rangos y experiencia** de las tropas: se conservan (veteranía en el individuo, rango derivado,
  ascenso a héroe con agente), leyendo el índice de poder de las unidades nuevas. Si con el cuerpo
  común todas valen igual, el arquitecto propone cómo diferenciarlas (equipo no cuenta en el nivel
  hoy).
- **El héroe**: conserva rango, liderazgo, libro y hechizos del juego; su equipo base pasa a ser
  de la arena (la Espada). Tipos de héroe (`data/tipos-de-heroe.json`) por facción nueva.
- **Edificios y magia por facción**: se inventan para las cinco a partir de los de caballeros y
  nigromantes (mismo árbol, otros nombres/moradas), salvo que el crítico vea algo mejor.
- **Voces de la base** (`data/vecinos.json`): respaldo por facción nueva, sencillo.

## Tras la crítica (REENCUADRADA, 18-10-2026): añadidos y decisiones del usuario

Se aceptan los añadidos del crítico (`critica.md`, último bloque) y el usuario decidió:

9. **Escala: el nivel ve el equipo.** El índice de poder (`indiceDePoder`) de una unidad se calcula
   con su equipo puesto (cuerpo + equipo, `unidadDeCombate`/`conEquipo`), no sin él: una unidad con
   armadura y alabarda vale más que una con daga, sin tocar el cuerpo común. Esto **invierte** la
   regla «un solo nivel, derivado de las cifras sin equipo» de CLAUDE.md (12-10-2026) y
   `UnitInfo.sinEquipo` / «el nivel no ve el equipo»: se reescriben. De ese índice salen morada,
   coste, crecimiento, experiencia (`PV quitados × índice`) y rangos; la calibración se mide con 100
   semillas. El arquitecto dice cómo pesan la armadura, el arma de cada uso y la rueda en el índice
   (en enteros, sin coma flotante dependiente de la plataforma).
10. **Accesorio y mejoras de morada: se retiran los dos.** El juego pasa a los huecos de la arena
    sin accesorio (arma, distancia, carga, armadura, escudo), contrato incluido. Las moradas no
    tienen mejora (`*_upgrade_N`, `upgradesTo` fuera).
11. **Defensas de la persona (#116): entran.** La persona juega también las batallas en que la
    atacan, rueda incluida (elige su respuesta).
12. **Fases con commit local.** El trabajo va por fases; cada una deja `pnpm verify`, `pnpm qa` y
    el barrido en verde y se cierra con un commit local en esta rama (sin push ni fusión hasta que
    el usuario lo pida).

Añadidos del crítico que entran tal cual:

- El catálogo del juego es la lista **completa** de las unidades de las cinco facciones (hoy 12 en
  el borrador y ~23 derivadas de `tools/taller/unidades.ts` por `unidadPorDefecto`), en un fichero de
  `data/` que `core` lee sin importar `tools/`; la arena lo edita y lo guarda.
- Tipos de héroe de las cinco facciones: **se extraen** de `NuevaJugabilidad.md`
  (`/home/al/code/heroes/NuevaJugabilidad.md`, sin commitear; #127), no se inventan. Moradas y
  edificios: el reparto tropa/élite y los edificios del cuaderno (§Ciudades) son la fuente de
  nombres y asignaciones; lo que falte se inventa y se dice.
- Entran en el alcance #129/#250 (la fuerza de la IA, `unitPower`/`ventajaClara`, ve la armadura y
  el arma de cada uso) y #265 (la IA no pega por 0 teniendo otro blanco); #266 se mide. Se miden
  rondas por batalla y tiempo del banco y del barrido, antes y después.
- Criterio 4: un fallo del agente en la respuesta de la rueda **no** le quita la batalla entera:
  suposición por defecto del coordinador, esa respuesta la elige la IA a ciegas y se le dice en el
  veredicto. Se mide cuántas peticiones más tiene una batalla del agente en `pnpm qa`.
- El espectador recibe el equipo y el hecho `cruce` y reconstruye las unidades nuevas sin aplicar
  reglas.
- Lo que deja de tener sentido con un solo catálogo y un solo modo se borra:
  `MODOS_DEL_JUEGO`/`MODOS_DE_LA_ARENA`, `REGLAS_DEL_JUEGO`/`crearBatallaConReglas`, `battle/reglas.ts`,
  `BattleState.piezasDeArena` si sobra, `PiezaDelJuego` frente a `HuecoDeArena`, `enfrentamiento.ts`
  tal como está (se rehace o se retira).
- Issues que esta tarea subsume o cambia: #234, #127, #249 (subsumidos), #265 y #250 (premisa
  cambia), #112 (obsoleto). Al cerrar se propone al usuario qué escribir en cada uno; no se tocan
  sin su visto bueno.

## Visto bueno del plan (18-10-2026)

El usuario aprobó `plan.md` tal cual: fases F0-F7, el equipo (F2) antes que las facciones (F3);
coste, crecimiento y morada de cada unidad derivados del índice con equipo (varias unidades por
morada; fuera el campo `cost`); la fórmula del índice con equipo propuesta (con la rueda, R = 30,
inventada y dicha); el héroe nace con **Espada y gambesón**; la armería vende las piezas que no van
sobre otra y el botín da las que van sobre otra más la maza y el pavés (precios inventados).
