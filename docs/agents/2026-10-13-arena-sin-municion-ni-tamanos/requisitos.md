# La arena: sin munición, sin tamaños y sin el catálogo antiguo

## Petición literal (13-10-2026)

> Elimina las caracteristicas de disparos y hexes, todo el mundo un hexe, el dragon de hueso no
> deberia existir. Todo el mundo tiene un disparo a no ser que tengan la habilidad dos disparos

## Decisiones del usuario (preguntadas, 13-10-2026)

| Pregunta | Respuesta |
|---|---|
| Alcance | **Solo la arena.** El juego (catálogo `data/creatures.json`, partida, agente, banco) no cambia. |
| El dragón óseo y la morada 6 | «**Elimina los ejércitos antiguos, solo cuentan los 5 que hay en la arena**»: en la arena desaparecen las criaturas del catálogo del juego (caballeros y nigromantes, dragón óseo incluido). Solo quedan las cinco facciones de la arena (Templarios, No muertos, Imperio, Elfos, Orkos). |
| Quién dispara | **Quien tenga arma a distancia.** Sin munición: dispara siempre que pueda. Cada disparo es uno, o dos con el rasgo «dos disparos» (`double_shot`). |

## Contexto

En este worktree hay dos tareas sin commit, en verde, que esta toca:

- **La rueda del golpe** (`docs/agents/2026-10-13-rueda-del-golpe/`).
- **Cada arma para lo suyo** (`docs/agents/2026-10-13-armas-por-uso/`):
  - trae los huecos `distancia` y `carga`;
  - las piezas de distancia llevan hoy `disparos` (el número de munición), y H1 de su QA acaba de
    añadir «no dispara: no se usa» y que la pieza nueva nazca con 12 disparos;
  - **esto lo sustituye**: llevar un arma a distancia ya es disparar.

Hoy, en la arena:

- se pueden usar criaturas del catálogo del juego: el filtro «Catálogo del juego», una «Nueva
  unidad» desde una criatura, el banco de combate con criaturas y enlaces con cuerpo
  `{ criatura }`;
- las unidades tienen munición (`shots`/`shotsLeft`) y tamaño (el dragón óseo, dos casillas).

## Criterios de aceptación

1. **Sin el catálogo del juego.** En la arena no aparece ninguna criatura del catálogo del juego:
   - ni en la lista;
   - ni en el filtro «Catálogo del juego», que desaparece;
   - ni como cuerpo de «Nueva unidad»;
   - ni en el montaje, el banco de combate, los enlaces o los borradores.

   Un enlace o un borrador de antes que las use se lee sin ellas y lo dice. Las unidades de las
   cinco facciones de la arena, incluidos sus héroes, siguen.
2. **Sin munición.** Ni en la ficha, ni en el editor de equipo (campo «Disparos» de las piezas), ni
   en el tablero (el `↑N` de los tiros que quedan), ni en el motor para las peleas de la arena.
   - Una unidad de la arena dispara si lleva un arma a distancia (o si su cuerpo es de tirador, si
     eso existe tras quitar el catálogo); y lo hace siempre que el motor permita disparar (no
     tener un enemigo al lado, etc.).
   - Cada disparo es un tiro; con `double_shot`, dos.
3. **Sin tamaños.** Toda unidad de la arena ocupa una casilla. No hay campo de tamaño en la ficha
   ni en el borrador.
4. **Lo de antes se sigue leyendo.** Los borradores y enlaces se leen convertidos, con aviso:
   - se quitan la munición y el tamaño;
   - las piezas con `disparos` se quedan sin el campo;
   - las unidades con cuerpo de criatura del catálogo se retiran diciéndolo.
5. **El juego no cambia**: `pnpm banco` con el mismo hash, el agente igual, y el dragón óseo sigue
   en el catálogo del juego.
6. La rueda del golpe y las armas por uso siguen en verde.

## Fuera de alcance

- El juego (`data/creatures.json`, la partida, la armería, el botín, el agente).
- Una criatura nueva para el nigromante del juego.
- Arte nuevo.

## Preguntas abiertas (con suposición por defecto)

- **El liche de la arena** (si su cuerpo es de no muerto de la arena, y no del catálogo) con
  `splash_shot`: sigue salpicando, y dispara si lleva arma a distancia.
- **Las facciones de la arena que traían cuerpo de criatura del catálogo**: si alguna hoja de las
  cinco facciones usa por debajo una criatura del catálogo para sus cifras, el arquitecto lo dice,
  y la hoja sigue con cifras propias.
- **`double_shot`** es hoy un rasgo de criatura del catálogo (el montaraz). En la arena se puede
  poner como rasgo del motor a cualquier unidad, como los demás rasgos.

## Decisión tras el plan (14-10-2026, del usuario)

- Se implementa el plan tal cual, **sin tocar la IA** por los tiros infinitos.
- Se mide cuántas peleas de la arena con todo en IA no terminan (en cientos de semillas) y se le
  dice al usuario. Si pasa, se arregla en otra tarea.
