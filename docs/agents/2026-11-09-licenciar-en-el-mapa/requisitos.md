# Licenciar tropa en cualquier sitio del mapa

## Petición literal

El 08-11-2026, al decidir el diálogo de «lo que sobra tras la batalla» del hechizo «Levantar zombi»
(rama `claude/elastic-colden-13a21f`), el usuario dijo:

> «Solo lo que sobra, habra que añadir un boton para descartar tropas independiente de esta pantalla»

Ese diálogo deja exactamente lo que sobra; para descartar más hace falta este botón aparte.

Decisiones del usuario (09-11-2026), preguntadas antes de diseñar:

| Pregunta | Respuesta |
|---|---|
| ¿Dónde y cuándo? | **En cualquier casilla del mapa, en el turno de su bando** (y fuera de una batalla). No fuera de turno. |
| ¿El equipo de quien se va? | **A la mochila, como hoy.** |
| ¿El agente también? | **Sí, la misma regla**; se actualiza el texto de su formato. |
| ¿Cómo es el botón? | **El «−1» por tipo**, como en la base y la morada, ahora también en el panel del héroe en el mapa. |

## Estado de hoy

- `dismissBlocker` (`src/core/state/heroes.ts`) rechaza si el héroe no está en un castillo suyo.
- La acción la aplica `applyAdventureAction` (`src/core/state/game.ts`, `case 'dismiss'`), con
  `licenciar`/`elQueSeIria` (`src/core/hero/troop.ts`) y devuelve el equipo con `aLaMochila`.
- El «−1» sale de `renderTropaLicenciable` (`src/client/partida/ejercito.ts`), que pintan la base y
  la morada. El panel del héroe en el mapa (`renderTropaEquipable`, `src/client/partida/mapa/panel.ts`)
  no lo tiene.
- El contrato del agente dice que fuera de un castillo se rechaza (`src/core/contract/formato.ts`, ~277).
- La IA de respaldo solo licencia dentro de un castillo, al cambiar tropa (`planCambio`,
  `src/core/ai/strategy.ts`): no tiene que cambiar.

## Criterios de aceptación

1. Un héroe propio, en el turno de su bando, licencia `count` × `creature` estando en **cualquier
   casilla** del mapa (camino, nodo ajeno, pueblo, paso), no solo en un castillo suyo.
2. Se siguen rechazando, con la frase de `dismissBlocker`: `count` que no es entero ≥ 1; criatura
   que no existe; criatura que no lleva; más de los que lleva; héroe de otro bando; fuera de su turno
   (como cualquier acción de aventura); y lo que hoy bloquee una acción de aventura con una batalla
   pendiente o en curso.
3. Quién se va lo sigue decidiendo `elQueSeIria` (primero el de menos experiencia) y lo que llevaba
   puesto vuelve a la mochila del héroe, esté donde esté. La crónica emite `dismissed` igual.
4. ¿Puede quedarse un héroe sin tropa? Lo que diga la regla de hoy en el castillo, igual en el mapa
   (no se añade ni se quita esa restricción).
5. El panel del héroe en el mapa enseña el «−1» en la fila de quien se iría de cada tipo (la misma
   regla que `renderTropaLicenciable`: en la fila de un veterano solo si es él quien se iría), a la vez
   que los «Equipar» y los «×» del equipo que ya hay. Pulsarlo licencia uno y el panel se repinta.
6. El agente: `dismiss` vale con la misma regla; el texto de `formato.ts` dice dónde se puede ahora.
   `pnpm qa` sale bien.
7. Tests de la regla (por partes): licenciar fuera de un castillo funciona; los rechazos del criterio 2;
   el equipo vuelve a la mochila fuera del castillo.
8. Comprobado en `pnpm dev` con Playwright sin pantalla: el «−1» se ve en el panel del héroe en el mapa
   y al pulsarlo baja la tropa. `pnpm typecheck` y `pnpm lint` limpios. `pnpm banco` igual (la IA no
   cambia: el hash no debe moverse).
9. Docs al día: la línea de la regla en `docs/areas/partida.md` (y `CLAUDE.md` si la nombra), con fecha.

## Fuera de alcance

- Licenciar fuera de turno o durante una batalla.
- Un diálogo con cantidad: el botón es «−1».
- Que la IA de respaldo licencie en el mapa.
- El diálogo de «lo que sobra tras la batalla» de Levantar zombi (otra rama).
- `pnpm verify` entero: tests por partes.

## Contexto

- Áreas: `docs/areas/partida.md` (state, cliente de la partida), `docs/areas/agente.md` (contrato).
- La justificación antigua del bloqueo («tirar tropa para pasar una emboscada más ligero») la anula
  la decisión del usuario; el comentario de `dismissBlocker` debe decirlo con fecha.
- Máquina compartida: nada de matar procesos por patrón; el servidor de pruebas en un puerto libre.

## Preguntas abiertas

- Ninguna que cambie el trabajo. Suposición: el título del botón en el mapa es el mismo que en la base.
