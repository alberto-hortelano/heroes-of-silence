# Ordenar la tropa para la batalla

## Petición literal

> «En la vista de tropa deberia poderse ordenar la tropa para la batalla, ahora no se de donde sale el orden»

Pregunta del coordinador y respuesta del usuario (02-11-2026): se le ofrecieron dos alcances —«Reordenar la
lista» (botones para adelantar/atrasar a cada uno; el panel dice en qué casilla de salida le toca a cada
puesto; el despliegue sigue con la regla de hoy) o «Elegir casilla de salida» (un minitablero de las tres
columnas de salida)— y eligió **«Reordenar la lista»**.

## De dónde sale hoy el orden (visto por el coordinador)

- El orden es el de `hero.army`: el de llegada. `withTroops` añade al final (reclutar, la guarnición que se
  lleva, `troopsThatFit`), `licenciar` quita sin reordenar.
- `troopsAsStacks(hero.army)` (`core/hero/troop.ts`) lo pasa tal cual a `createBattle`
  (`battleSideForHero`, `core/state/game.ts`).
- `despliegue` (`core/battle/battle.ts`): el héroe coge el primer hueco (columna del borde, fila 4) y la tropa,
  en su orden, los siguientes de `DEL_CENTRO_A_FUERA` = [4, 3, 5, 2, 6, 1, 7, 0, 8], columna a columna
  (`COLUMNAS_DE_SALIDA` = 3). Con el tope de 7 todos caben en la columna del borde: el 1.º de la tropa en la
  fila 3 (justo encima del héroe), el 2.º en la 5, el 3.º en la 2…
- El orden también decide el id del stack (`${side}-${slot}`) y el desempate de iniciativa dentro del bando.
- Ninguna acción del núcleo reordena hoy la tropa. La vista de tropa: `client/tropa/vista.ts`
  (`componerVistaDeLaTropa`, figuras en el orden del ejército, héroe primero), `client/views/tropa.ts`
  (panel), `client/escenas/tropa.ts` (escena de pie en semicírculo).

## Criterios de aceptación

1. En la vista de tropa (`pnpm dev`, abrir la tropa de un héroe propio con 2 o más individuos) cada individuo
   se puede adelantar y atrasar un puesto en el orden de la tropa. El primero no se adelanta y el último no se
   atrasa (botón apagado, con su motivo escrito si lo hay, como el resto del panel).
2. El cambio es una acción del núcleo (la lógica vive en `core`, el cliente solo manda el intent por
   `session.ts`): cambia `hero.army` de orden y nada más (ni equipo, ni veteranía, ni experiencia se pierden ni
   cambian de dueño: cada individuo se lleva lo suyo). Una acción ilegal (otro dueño, fuera de turno, puesto
   inexistente, mover más allá de un extremo, mientras se elige el héroe de salida) lanza con un mensaje para la
   persona escrito por un `*Blocker`.
3. El orden nuevo es el de la batalla siguiente: el 1.º de la lista sale en la casilla del 1.º puesto, etc.
   (lo demuestra un test de núcleo: reordenar y montar la batalla da las casillas esperadas).
4. La vista dice de dónde sale el orden: en el panel, cada individuo (o el elegido) dice en qué sitio sale en
   la batalla (p. ej. «sale justo encima del héroe», «dos casillas debajo del héroe» o la fila; la redacción es
   del arquitecto), derivado de la misma regla que usa `despliegue` (un hecho, un sitio: no se reescribe la
   tabla en el cliente).
5. El orden de las figuras del semicírculo y de los botones del panel sigue al de la tropa tras reordenar, y
   el elegido sigue elegido tras moverlo (la elección no se queda en el puesto viejo apuntando a otro).
6. `pnpm typecheck`, `pnpm lint` y los tests de lo tocado, en verde. `pnpm banco` sin cambios (nadie reordena
   en las partidas de la IA).

## Fuera de alcance

- Elegir casilla de salida libre o formaciones (minitablero). Opción descartada por el usuario.
- Cambiar la regla de despliegue (`DEL_CENTRO_A_FUERA`, el héroe en el centro).
- Que la IA de reglas reordene su tropa.
- Arrastrar figuras en el lienzo (los botones bastan; si el arquitecto ve el arrastre barato, lo propone como
  backlog).

## Preguntas abiertas (con suposición por defecto)

- **¿El agente (MCP) puede reordenar?** Suposición: no en esta tarea; si el núcleo gana la acción, el contrato
  del agente no cambia y queda como backlog. El arquitecto dice si el contrato de acciones obliga a otra cosa.
- **¿El héroe se puede mover en el orden?** Suposición: no; siempre en su hueco (centro de la columna del borde).
- **¿Dentro de su base / fuera?** Suposición: se puede reordenar en cualquier sitio en el turno propio (no gasta
  nada), salvo lo que ya bloquee `bloqueoDeTurno`.
- **Interfaz**: botones «▲»/«▼» (o «Adelantar»/«Atrasar») en la lista de quiénes del panel, junto al nombre.
  Teclado accesible. Lo decide el arquitecto.
