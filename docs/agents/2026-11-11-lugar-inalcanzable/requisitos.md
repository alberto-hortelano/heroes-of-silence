# Requisitos — lugar-inalcanzable

Tarea: `2026-11-11-lugar-inalcanzable`. Issues: 321. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (igual a `main`, `d791d03c`).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

El coordinador eligió esta tarea entre los issues abiertos. Lo que pide cada issue, tal cual:

### #321 — Mundo generado: un lugar sin ruta desde la base al abrir la partida

> En el QA del arte, el motor generó un mundo (`gen-*`, ya borrado) y su lugar `hornos-de-pez`, en (1,16), no dio ruta desde la base al abrir. No se investigó.
> 
> Puede ser un lugar que `lugarBlocker` (`src/core/mundo/validar.ts`) acepta donde no se llega (borde del mapa, tras una barrera sin paso) o solo niebla sin explorar. Hay que reproducirlo (generar un mundo o escribir un lugar en una casilla así) y decidir: o la validación lo rechaza, o no es un fallo y se documenta.
> 
> Hecho cuando: hay un test que coloca un lugar inalcanzable y `pnpm mundo validar` lo dice, o queda demostrado que la ruta existía.
> 
> Viene del cierre de «La base con vida» y «Arte de los lugares» (10/11-11-2026, commits 9a533eb5 y 243c56f4; detalle en `docs/agents/2026-11-10-base-con-vida/` y `docs/agents/2026-11-10-arte-de-los-lugares/`).

## Criterios de aceptación

1. Se reproduce el caso: un lugar en una casilla a la que no se llega desde la base de un jugador (o se demuestra con un test que en el caso de `hornos-de-pez`, (1,16), la ruta sí existía y lo que fallaba era otra cosa: niebla, la marcha, el cliente).
2. Si era inalcanzable: `lugarBlocker` (o la validación del mundo, `problemasDelMundo`) lo rechaza con un motivo para la persona, y `pnpm mundo validar <id>` lo dice. Test que coloca un lugar inalcanzable y ve el rechazo, visto morder.
3. Si no era un fallo: se documenta en `docs/areas/mundos.md` con fecha y el issue se cierra con la explicación.

## Fuera de alcance

La jugabilidad (si da tiempo a llegar, si la IA va). La skill del motor de mundos solo si la regla nueva cambia lo que debe escribir.

## Contexto

Área: `docs/areas/mundos.md` y `docs/areas/mapa.md`. Camino de un héroe: `alcanceDelHeroe`, `caminoHasta` (`state/marcha.ts`). Presupuesto de pruebas: solo los tests de lo que se toca, nada de `pnpm verify` entero.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`). El coordinador acepta su encuadre, que sustituye a los criterios de arriba. Preferencia del coordinador para el arquitecto: que la regla no cambie las partidas del generador (`pnpm banco` igual) salvo que haya buena razón; y, si toca `mundo/validar.ts`, que el cambio sea pequeño, porque la rama sin fusionar `claude/templarios-faction-game-fa463e` reescribe ese fichero. La vista previa de ruta que no dice por qué va a un issue aparte.

**Encuadre (crítica, 11-11-2026).** Por geometría, todo lugar que acepta `lugarBlocker` se alcanza:
0 de 36 676 casillas sin camino en 32 mapas. Lo que falla es que la región de casa de un bando
(`casaDe`) a veces solo se alcanza cruzando su base, que es un nodo. Pasa en 7 de 120 mapas
procedimentales (tamaños 4/5/7, semillas 1-40; p. ej. r4 s12, r7 s10). Tomar la base acaba la
partida, así que un lugar ahí es inalcanzable para el otro jugador, en contra de «el mundo es de los dos».

1. Se reproduce con una semilla que lo tenga: un lugar en esa región, al que el jugador contrario
   no llega sin pasar por la base rival.
2. Ese lugar se rechaza (o no se ofrece en `admitenUnLugar`, o el generador no produce esa red),
   con un motivo para la persona, y `pnpm mundo validar <id>` lo dice. El test se ve morder. Una
   comprobación de camino sin hostiles **no vale**: nunca muerde.
3. Lo que cierra el paso al empezar y se conquista (ciudad neutral con guarnición, asaltantes,
   héroe rival fuera de su base) **no** es un fallo: se documenta en `docs/areas/mundos.md` con fecha.
4. Fuera de alcance: que la vista previa de la ruta diga por qué no hay ruta
   (`sesion/partida/marcha.ts:118`). Si se quiere, va en un issue aparte.

## Tras el plan (11-11-2026)

El coordinador aprueba `plan.md` tal cual (opción C: la regla en `lugarBlocker`, sin tocar el generador). La pregunta abierta (¿el callejón tras la base es un defecto del generador?) no se decide en este ciclo: va a un issue con la medida y la opción A, para el usuario.
