# La tropa del héroe en escena

## Petición literal (19-10-2026)

> Una vez en el mapa me gustaria poder ver a la tropa del heroe, en un escenario con todos en
> semicirculo mirando a camara, y ahi podria repartir equipo y ver caracteristicas y experiencia

Contexto de la conversación: el usuario está afinando el juego desde el arranque (menú → facción →
héroe → base → mapa; tarea `docs/agents/2026-10-19-arranque-y-faccion/`, en esta misma rama). Juega
en `pnpm dev`; el usuario no abre nada en los worktrees: al final se le levanta en un puerto y se le
pasa la URL (hay uno vivo en :3201 del coordinador; no tocarlo).

## Criterios de aceptación

1. Desde el mapa de aventura, con un héroe propio elegido, un botón en su panel («Tropa») y una
   tecla (T) abren una **escena de la tropa** de ese héroe. Escape y un botón «Volver al mapa» la
   cierran y se vuelve al mapa como estaba (mismo héroe elegido, misma cámara).
2. La escena es un **escenario lateral** (como la base caminable o el combate: cámara del contrato a
   25°, misma escala de figura que en la batalla) con **el héroe y cada individuo de su tropa** en un
   **semicírculo mirando a cámara** (hoja `S`), el héroe en el centro. Cada figura con la hoja de su
   unidad (`hojaDeUnidad`) o la del tipo del héroe (`figuraDelHeroe`), nunca el Y Bot si hay hoja;
   el personaje, su cuerpo. Animación en reposo (`idle`). Con 1 a 7 figuras el semicírculo se ve
   entero y sin solaparse en 1440×900, 1280×720 y en el móvil (375×812).
3. Pulsar una figura la **elige** (se nota en la escena) y el panel lateral enseña su **ficha**:
   nombre, unidad o tipo, nivel e índice, rango y **experiencia** (actual y la del siguiente rango),
   batallas y bajas si es veterano, y sus **características finales** (ataque, defensa, daño, PV,
   velocidad, armadura… lo que dé `cifrasDeUnidad`/`cuerpoDelHeroe` con lo de serie y lo suyo) con lo
   que suma el equipo (`modificadoresEnPantalla`). Solo lectura: no se editan cifras.
4. **Repartir equipo** desde la escena: el panel enseña lo que lleva la elegida por hueco y la
   **mochila del héroe**; se puede poner una pieza de la mochila a la elegida (si su regla lo permite,
   y si no, desactivada con el motivo del núcleo: `ponerseBlocker`) y quitarle una suya (a la
   mochila; lo de serie no se quita, el arma tampoco: `unequipBlocker`). Dar una pieza de un individuo
   a otro = quitarla y ponerla, sin acción nueva del núcleo salvo que el arquitecto la justifique. A un
   novato se le puede equipar (abre su hoja, como hoy).
5. Las cifras de la ficha y de la escena cambian al momento tras equipar o quitar (el nivel lo ve).
6. Todo por la sesión y el núcleo (`equip`/`unequip` de `AdventureAction`); el cliente solo pinta.
   Las acciones ilegales no se pueden lanzar desde la UI y, si llegan, fallan con su motivo.
7. Sin arte, cada figura pinta su marcador; sin agente, todo igual.
8. `pnpm verify` verde; la pasada que toque de `pnpm capturas` cubre abrir la escena, elegir, poner y
   quitar una pieza, y cerrar; el banco no cambia (es presentación más acciones que ya existían).

## Fuera de alcance

- Licenciar, reorganizar el orden de la tropa o intercambiar tropas entre héroes.
- Clips nuevos (no hay `ready` ni `win`: solo `idle`); arte nuevo; gasto en fal.ai 0.
- Editar cifras; la armería (comprar) sigue en la base.

## Preguntas abiertas (suposición por defecto)

- ¿Sustituye a lo que hoy hay de equipo y tropa en el panel del mapa? → No en esta vuelta: la escena
  se añade; el panel del mapa puede aligerarse después si el usuario lo pide.
- ¿Escena propia (`Scene = 'tropa'`) o un modo dentro del mapa? → Lo decide el arquitecto; el
  criterio 1 manda (volver al mapa como estaba).
- ¿Fondo del escenario? → Uno sencillo con el suelo de la región donde está el héroe o un fondo
  neutro con el tema de la facción; nada de arte nuevo.

## Visto bueno del plan (19-10-2026)

El usuario aprueba `plan.md` tal cual: escena propia `tropa`, héroe al fondo en el centro y la tropa en arco con los extremos más cerca de cámara, fondo del combate, solo en tu turno, el panel del mapa sin tocar.
