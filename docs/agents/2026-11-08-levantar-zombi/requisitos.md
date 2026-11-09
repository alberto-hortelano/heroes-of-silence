# Levantar zombi — requisitos

Tarea: `2026-11-08-levantar-zombi`. Coordinador: sesión lanzada desde la de «facciones de cada hechizo».

## Petición literal

Del usuario (08-11-2026), tal como la relayó la sesión que abrió esta:

> «Haz un hechizo de levantar zombi. Ahora no se puede hacer porque se hace sobre un cadaver»

Respuestas del usuario a las preguntas del coordinador (08-11-2026, literales donde las escribió):

| Pregunta | Respuesta |
|---|---|
| ¿De qué cadáveres se puede levantar? | «Vivos, de cualquier bando»: cualquier cadáver salvo los de no muertos y el del héroe |
| ¿El cadáver se gasta? | «Sí, desaparece»: un cadáver da un zombi y no se vuelve a usar |
| ¿Cuenta contra el tope de tropa del bando (3, 5 o 7)? | «No cuenta» |
| Al acabar la batalla, ¿qué pasa con el zombi? | «Se queda, si pasa el limite se elije al terminar la batalla. Si se lanza sobre el cadaver de un zombie se levanta un esqueleto y sobre el del esqueleto nada.» |

El zombi es del bando de quien lanza, uno por lanzamiento (dicho en la pregunta, sin objeción).

## Criterios de aceptación

1. Un hechizo puede tener como objetivo un **cadáver** (`objetivo` nuevo en `src/core/magia/formato.ts`, con su frase en `VOCABULARIO_DE_LA_MAGIA`) y la validación del hechizo (`problemasDelHechizo`) dice qué entregas, áreas y efectos admite ese objetivo y rechaza lo demás con su motivo.
2. Hay un efecto (o regla) que **levanta** una unidad del catálogo en la casilla del cadáver, del bando de quien lanza. Qué levanta cada cadáver:
   - cadáver de una unidad que no es no-muerta (rasgo `undead`), de cualquier bando → `zombi`;
   - cadáver de un `zombi` → un esqueleto (`esqueleto-guerrero`, suposición S1);
   - cadáver de un esqueleto (`esqueleto-guerrero`, `esqueleto-arquero`) → nada: se rechaza diciéndolo;
   - cadáver de otro no-muerto (espectro, caballero de la muerte, jinete de plaga) → se rechaza (respuesta 1);
   - cadáver del héroe → se rechaza.
3. `castBlocker` (y la unidad que lo usa como poder) **rechaza con su motivo**: la casilla sin cadáver; la casilla con cadáver pero ocupada por una unidad viva; el cadáver que no se puede levantar (2); el cadáver ya gastado. Esos motivos los leen la acción, `legalActions` y la pantalla, como cualquier `*Blocker`.
4. Al lanzarlo, aparece en el tablero un stack nuevo del bando de quien lanza, en la casilla del cadáver, y **el cadáver se gasta** (desaparece del tablero y no vale para otro lanzamiento). No cuenta contra el tope de tropa del bando.
5. `data/hechizos.json` lleva el hechizo «Levantar zombi» (id a decidir, p. ej. `levantar_zombi`), `facciones: ["no-muertos"]`, que pasa la validación del catálogo.
6. El **editor de magia de la arena** (`montarEditorDeMagia`) permite elegir el objetivo nuevo y lo que haga falta del efecto nuevo, y «Guardar» lo escribe y lo vuelve a leer.
7. En la **arena**, con un cadáver en el tablero, se lanza el hechizo sobre él y aparece el zombi (o el esqueleto); el cadáver deja de verse. Comprobado en el navegador con Playwright (capturas).
8. En la **partida**, el levantado **se queda en el ejército** al acabar la batalla (en la tropa del héroe, o de quien tenga el bando, si tiene dueño). Si con él el ejército **pasa del límite**, **se elige al terminar la batalla** a quién se deja. La persona lo elige en pantalla; la IA de reglas, por regla; el agente, ver P3.
9. Tests de la regla (validación del formato, los rechazos de `castBlocker`, lo que levanta cada cadáver, el gasto del cadáver, la vuelta al ejército y la elección por encima del límite).
10. `pnpm typecheck` y `pnpm lint` limpios; los tests de lo tocado, por partes; `pnpm banco` sin cambiar el hash (ningún hechizo de hoy cambia; si cambia, se juzga la forma del diff); `pnpm qa` si se toca el contrato o el servidor.

## Fuera de alcance

- Que la IA de reglas **lance** este hechizo (hoy solo valora daño, cura y casillas: backlog).
- Equilibrio, coste en maná o nivel de gremio «buenos»: a ojo, dicho en el `_comment` (no se prueba la jugabilidad).
- Arte nuevo: el zombi y el esqueleto ya tienen hoja.
- Resucitar (devolver la vida a la misma unidad): esto crea una unidad nueva del catálogo.
- Compatibilidad hacia atrás de nada.

## Contexto

- Los muertos **ya se guardan en `BattleState`**: un stack con `count` 0 sigue en `state.stacks` con su `hex`, y el cliente lo pinta como cadáver (`render/batalla/figura.ts:99`). No hay hoy campo que diga si el cadáver se gastó. Sobre la casilla de un muerto puede pasar o pararse otro (uno por casilla cuenta solo a los vivos): puede haber varios cadáveres en una casilla.
- `types.ts` (`initialCount`) y `resumen.ts` cuentan los muertos como `initialCount - count` porque «ningún hechizo resucita»; `cierre.ts` (`settleBattle`) asume que «nadie añade ni reordena stacks después» de `createBattle`. Las dos premisas cambian.
- Docs que leer: `CLAUDE.md`, `docs/areas/batalla.md` (magia), `docs/areas/arena.md` (editor de magia), `docs/areas/partida.md` (el cierre de la batalla, la capacidad del ejército: `capacidadDe`, `elQueSeIria`) y, si se toca el contrato, `docs/areas/agente.md`.
- Ya existe `zombi_pegajoso` (no muertos): no tiene que ver.
- La máquina es compartida; tests por partes, nunca `pnpm verify` entero. El usuario no abre nada en el worktree: al acabar, el coordinador levanta el servidor en otro puerto y le pasa la URL. No hay push ni fusión en main sin que lo pida.

## Preguntas abiertas y suposiciones por defecto

- **S1** Del cadáver de un zombi sale `esqueleto-guerrero` (no el arquero).
- **S2** El levantado entra **sin turno en la ronda en curso** (`acted: true`), novato, con el equipo de su catálogo y 1 individuo.
- **S3** Varios cadáveres en una casilla: se levanta el **último en caer**; si ese no se puede levantar, se rechaza (no se busca otro debajo). El arquitecto puede proponer otra regla si es más simple.
- **S4** Objetivo cadáver: área 0 (un cadáver, un levantado); entregas que tengan sentido (libre, alcance, contacto; no proyectil, sobre sí ni tablero) — lo fija el arquitecto y lo dice la validación.
- **S5** Qué levanta cada cadáver vive en datos (el hechizo o una tabla en `data/`), no escrito en el motor. El arquitecto decide la forma.
- **P1** «Si pasa el límite»: el límite es la capacidad del ejército del héroe (`capacidadDe`) o el de la guarnición (`cupoDeLaGuarnicion`) si el bando es de un sitio. Un bando sin dueño (monstruo, asaltante, neutral): el levantado se pierde con él.
- **P2** La elección al terminar: la persona, un diálogo tras la batalla que no deja seguir hasta elegir; la IA de reglas, la regla de siempre (`elQueSeIria`/`licenciar` o la que proponga el arquitecto).
- **P3** El agente: si añadirle la elección cuesta una petición nueva del contrato, se juega en su lugar con la regla de la IA (`EN_SU_LUGAR`) y queda en backlog, como `repartir_tropa`. Lanzar el hechizo sí debe poder (el `at` de `cast` ya existe; que `legalActions` liste las casillas con cadáver).
- **P4** El espectador debe ver aparecer el levantado (viaja con el stack y un hecho nuevo en el registro de la batalla).

## Decisiones del usuario sobre el plan (08-11-2026)

- **P5**: «Nivel 2». El hechizo lo enseña el gremio de nivel 2 (de los no muertos); el banco se re-ancla y solo pueden cambiar los `spells_learned`.
- **P6**: «Solo lo que sobra, habra que añadir un boton para descartar tropas independiente de esta pantalla». El diálogo deja **exactamente** lo que sobra (el ejército queda justo en el límite): `dejarBlocker` rechaza dejar de más. El botón para descartar tropas en cualquier momento es **otra tarea** (fuera de alcance de esta; se propone aparte).
- **P7**: «Se pierde». El equipo de quien se deja de una guarnición se pierde, y la crónica lo dice.
- **Plan**: «Sí, adelante», entero en este ciclo (B1: la elección antes de cerrar la batalla; el agente deja por la regla de la IA y su elección va al backlog).
