# Banco de figuras de NPC — requisitos

Coordinador, 22-10-2026. Rama `claude/affectionate-chaplygin-911d42`, sobre `main` 7822ecfd (con la
complejidad del combate, el héroe elegido en la base, el clima y la F1a del mapa vivo ya fusionados).

## Petición literal

> «Fallan los npcs de la base, no tienen skin, es el y_bot. Deberiamos ir generando un pull de skins
> de npcs que mas adelante se puedan reutilizar. Cuando estemos en prod estaran en un servidor con
> metadatos de descripcion y etiquetas para que el motor de narrativa los pueda reutilizar
> facilmente, de momento en una carpeta que comietearemos y con las descripciones en un json»

Respuestas del usuario a las preguntas del coordinador (22-10-2026), literales:

- Tamaño del primer lote: **«Que se generen a medida que se genera un mapa con personajes, para que
  quede ya asi para el futuro. El objetivo es que el motor de narrativa pueda generar skins o
  reutilizar las que existan.»** → no hay lote fijo pedido a mano: el banco crece cuando el motor de
  narrativa (`motor-de-mundos`) genera un mundo.
- Qué acciones lleva una figura (solo reposo y marcha, o las seis de una tropa): **«Lo decide el motor
  de narrativa cuando la pide»**.
- Al pulsar «Generar el mundo», con figuras nuevas por pintar: **«Jugar ya, llegan después»**. El mundo
  se juega en cuanto su historia valida; las figuras nuevas se pintan en segundo plano y salen al
  estar listas; mientras, esa persona se pinta con una figura parecida del banco (o el Y Bot si no hay
  ninguna).
- La gente de la base: **«Sí, y sin mundo, del banco»**. Con mundo, el motor elige o pide figura
  también para la gente de la base de quien juega (alcaide, encargados, vecinos). Sin mundo
  (procedimental, «Jugar sin historia», `?seed=`), cada persona toma del banco una figura determinista
  por facción y oficio, o el Y Bot si el banco no tiene ninguna que le valga.

## Hoy (comprobado en el código)

- La gente de la base (`vecinosDeLaBase`, `town/voces.ts`, `data/vecinos.json`: alcaide, 12 encargados
  por facción —uno por sitio, sale si su sitio está construido— y 2-4 vecinos) se pinta con
  `CUERPO_DE_VECINO` (`src/client/render/personajes.ts`): el Y Bot en reposo `civil`. Su `cuerpo` de
  `data/vecinos.json` es una unidad del catálogo que no se usa al pintar (con el Y Bot de esa unidad,
  el vecino estaba en guardia con el arma).
- La gente de los lugares (F1a del mapa vivo): `persona.cuerpo` es una **unidad del catálogo**
  (`core/mundo/validar.ts` lo exige; `lugar/sesion.ts` la pinta con `hojaDeUnidad`): un soldado con
  sus armas.
- Una hoja de unidad (`assets/unidades/<id>/`): `identidad.webp`, `giro.webp` y, por cada dirección
  `d0`-`d7`, `hoja-a` (reposo, marcha, carga) y `hoja-b` (las demás acciones), empaquetadas en
  `dN/atlas.webp` + `atlas.json`. Se pintan por el taller (`tools/taller/`, `pnpm taller`), con Codex
  por la suscripción, encargos en cola en disco (`tools/taller/cola/`), sobre la profundidad del
  maniquí (`assets/unidades/_poses/`). ~18 imágenes por unidad; una que solo lleve `hoja-a`, ~10.
- El motor de narrativa: `tools/mundo/motor.ts` lanza `claude -p` con la skill
  `.claude/skills/motor-de-mundos/SKILL.md` desde `POST /__mundos` (`pnpm dev`, `desarrollo/mundo.ts`);
  escribe `assets/mundos/<id>/historia.json`, que valida `core/mundo/validar.ts`.

## Criterios de aceptación

1. **El banco existe y se commitea**: una carpeta (p. ej. `assets/npcs/<id>/`, con lo que pida el
   renderizador de figuras: ocho direcciones, `dN/atlas.webp` + `atlas.json`) y un JSON índice (p. ej.
   `data/npcs.json`) con cada figura: `id`, descripción en prosa y etiquetas (oficio, edad, sexo o
   aspecto, facción o cultura, clase social, ropa…), y qué acciones lleva. Pensado para que el motor
   elija por descripción y etiquetas, y para pasar más adelante a un servidor con esos metadatos.
2. **Validado al cargar, fail-loud**, como el resto de `data/*.json`: una entrada mal formada, un id
   repetido, una etiqueta fuera del vocabulario (si lo hay), una figura del índice sin su hoja en disco
   (test, como `figuras-de-heroe.test.ts`) o una hoja sin entrada tumban la carga o el test con el
   motivo. Una figura **pedida y aún sin pintar** es un estado legal y distinto de una rota.
3. **La gente de la base se pinta con una figura del banco**: alcaide, encargados y vecinos. Sin mundo,
   elegida de forma determinista (misma semilla, facción y persona → misma figura; sin `Math.random`),
   por facción y oficio, sin repetir figura dentro de una misma base mientras el banco tenga
   suficientes que le valgan. Sin ninguna que le valga, el Y Bot `civil` de hoy.
4. **La gente de los lugares se pinta con una figura del banco**: `persona` de `historia.json` puede
   nombrar una figura del banco por id (el formato y su validación lo admiten; si se mantiene la unidad
   del catálogo como alternativa, que sea una decisión escrita en el plan).
5. **El motor de narrativa reutiliza o pide**: la lectura para el motor (`.cache/mundos/<id>/lectura.json`
   o lo que la sustituya) trae el banco (ids, descripciones, etiquetas, acciones); la skill le dice cómo
   elegir una existente o **pedir una nueva** (descripción, etiquetas, facción, acciones que necesita), y
   cómo asignar figura a la gente de la base de quien juega. Una figura pedida entra en el JSON del banco
   como pendiente y se encola en el taller.
6. **Se juega ya y las figuras llegan después**: la generación del mundo no espera a Codex. Las figuras
   pedidas se pintan en segundo plano (la cola del taller, por la suscripción) y, al estar listas, quedan
   en el banco con su hoja y su entrada completa; la partida que las nombra las pinta al recargar (o
   antes, si es barato). Mientras, la persona se pinta con una figura parecida del banco o el Y Bot.
7. **Las hojas de NPC no son tropas**: no entran en el catálogo de unidades ni en `data/unidades.json`,
   no se reclutan, y el Y Bot no se usa nunca en lugar de una figura del banco que sí existe.
8. **Documentado** en `CLAUDE.md`: fila en la tabla de puertas únicas (el JSON del banco y su lectura
   única, la elección determinista y quién la pide), y la skill `motor-de-mundos` actualizada.
9. `pnpm verify` en verde; `pnpm qa` si se toca el servidor o el contrato; el navegador para ver la base
   y un lugar con figuras del banco en `pnpm dev`.
10. **Al menos una figura de verdad** generada por el circuito entero (el motor la pide, el taller la
    pinta con Codex, entra en el banco y se ve en la base o en un lugar), para demostrar que el circuito
    funciona. Si la cuota de Codex no da, decirlo; no sustituir por fal.ai.

## Fuera de alcance

- El servidor de producción con metadatos (solo se deja el formato pensado para migrar).
- Equilibrio, reglas, el agente MCP (`heroes_*`): el banco es presentación. `pnpm banco` no debe cambiar.
- Que un NPC pelee como tropa (si una figura lleva las seis acciones, es para el arte; no se recluta).
- Lotes grandes generados a mano fuera del motor (el usuario no lo pidió). Rehacer el arte de las tropas.
- F1b (personaje fijo de la base), F2-F5 del mapa vivo.

## Contexto que solo tiene el coordinador

- Arte **solo por Codex** con la suscripción (`tools/taller/codex.ts`, memoria «Imágenes por Codex»);
  fal.ai no, salvo autorización del usuario. En octubre la cuota se agotó a unas 800 imágenes.
- La máquina es compartida: nada de `pkill`; presupuesto de pruebas (tests caros una vez al cerrar).
- Figuras de pie: el tope es la resolución de la hoja (memoria «Tamaño de las figuras»).
- Sin compatibilidad hacia atrás: los mundos generados (`gen-*`) no van a git; `prueba` y `ejemplo` sí,
  y se pueden reescribir al formato nuevo.
- No subir nada a origin.

## Preguntas abiertas (con la suposición por defecto)

- ¿Qué vocabulario de etiquetas? → cerrado y pequeño, en el núcleo, con su frase para el motor (como
  `VOCABULARIO` de `core/mundo/formato.ts`), más la descripción libre en prosa.
- ¿Dónde vive la asignación de figura a la gente de la base de un mundo? → en `historia.json` del mundo
  (por id de persona de `data/vecinos.json`), no en `data/vecinos.json`.
- ¿Semilla del banco antes del primer mundo? → para que el criterio 3 se vea sin generar un mundo, puede
  pintarse a mano un primer puñado por el mismo circuito de pedido (cuántas, que lo proponga el plan y
  se consulte al usuario antes de gastar cuota).
- ¿La figura nueva se ve sin recargar? → no hace falta; basta con recargar.

## Tras la crítica (REENCUADRADA, 22-10-2026): decisiones del usuario

- **Alcance**: esta tarea es la rebanada de personajes de la F2 del mapa vivo («arte bajo demanda con
  Codex»). El circuito pedido → cola del taller → figura en el banco se diseña para la F2 entera (los NPC son
  su primer cliente).
- **Criterio 1 bis**: el taller pinta figuras cuya definición vive en datos (no en
  `tools/taller/unidades.ts`), en una carpeta que no lista la arena, con un tipo de figura de reposo y marcha
  (hoja A) que el renderizador acepta y que no puede llegar a una batalla. La hoja B, solo si el motor la pide
  (la skill le dice que hoy ninguna escena la pinta). Esto excepciona, para los NPC, la regla del 03-10 «toda
  figura lleva las 6 acciones»: el usuario dijo «lo decide el motor de narrativa cuando la pide».
- **Criterio 2, cambio**: «pedida y sin pintar» se deriva de si su hoja está en disco; el JSON no guarda el
  estado. Una petición sin cola (otro clon, mundo cancelado) se puede volver a encolar con una orden.
- **Criterio 5 bis**: el motor pide figuras dentro de `historia.json`; sus permisos no cambian. Encola quien
  valida. Hay un tope de figuras nuevas por mundo (lo propone el plan) y el motor reutiliza antes de pedir.
- **Criterio 6 bis** — decisiones del usuario: **«Se encadena sola»** (identidad → giro → hojas sin revisión
  humana; una figura mala se borra o se vuelve a pedir con una orden) y **«pnpm dev al generar»** (tras validar
  la historia, el servidor de desarrollo lanza el trabajador en segundo plano, con el tope por mundo).
- **Lote semilla** — decisión del usuario: **«3 por facción (15)»**, ~150 imágenes de Codex con la hoja A,
  pedidas por el mismo circuito (no a mano fuera de él), para que la base sin mundo deje de ver el Y Bot.
  Se generan tras implementar el circuito; si la cuota no da, se dice cuántas salieron.
- **Maniquí**: el civil (`_poses/civil-8d/`) con su profundidad, renderizada una vez; la talla, por figura
  (goblins 0,7, etc.).

## Tras el plan (22-10-2026): decisiones del usuario

- Plan aprobado tal cual («Adelante»): se retira `persona.cuerpo` (unidad del catálogo) de los lugares y vale
  el vocabulario de etiquetas del §4 del plan.
- Semilla: **«Todas de seguido»** — las 15 peticiones se piden y se pintan sin parar, sin revisión previa.
