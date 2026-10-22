**REENCUADRADA** — el problema es real y el banco es la forma buena, pero la tarea es mayor de lo que dice (el
taller no sabe pintar nada que no sea una unidad de su lista estática, ni una figura sin hoja B), es la primera
rebanada de la F2 del mapa vivo y, sin un lote semilla, no arregla lo que el usuario se queja.

## El problema real

La gente de la base y de los lugares no tiene figura propia: la base pinta a todos con el Y Bot `civil`
(`render/base/escena.ts:126`) y el lugar, con un soldado del catálogo (`lugar/sesion.ts:138`). La solución
propuesta (un banco que crece al generar mundos) lo ataca **a la larga**; para quien abre `pnpm dev` sin mundo,
mañana no cambia nada hasta que el banco tenga figuras de su facción.

## La premisa, afirmación por afirmación

- «La gente de la base es el Y Bot `civil`»: **cierto**, deliberado (`personajes.ts:269-290`,
  `escena.ts:124-126`). No es un fallo: es la deuda declarada de la vuelta 2 de la base caminable.
- «La gente de los lugares es una unidad del catálogo»: **cierto** (`core/mundo/validar.ts:551-554`).
- «Una que solo lleve `hoja-a`, ~10 imágenes»: **el taller no puede hoy**. `juntarDireccion` no junta sin A y B
  (`tools/taller/juntar.ts:23-25`: `hojasDeFigura(false)` = `['a','b']`, devuelve `null`), y el cliente lanza con
  un atlas sin las seis acciones y su cadáver (`personajes.ts:153`, `:183`). Es una decisión del usuario escrita
  (`personajes.ts:4`: «toda figura tiene 8 direcciones y las 6 acciones», 03-10-2026). Una figura de reposo y
  marcha pide un tipo de figura nuevo en el taller y en el renderizador, y que no pueda llegar a una batalla.
- «Se pintan por el taller»: **solo lo que está en su lista en TypeScript**. Todo el camino va por id contra
  `UNIDADES`/`HEROES`/`EN_OCHO_DIRECCIONES` (`tools/taller/unidades.ts:961`, `poses-8d.ts:204-207`) y escribe en
  `assets/unidades/<id>/`, que es lo que lista la arena como tropa (`tools/arena/borrador.ts:96-115`). Un NPC
  pedido en datos necesita que el taller lea su definición de `data/`, y otra carpeta, o entra en la arena
  (contra el criterio 7).
- «Los encargos se encolan»: **sí, pero en cadena manual con revisión**. Identidad, giro y 16 hojas son tres
  `encolar` a mano, cada uno sobre lo aprobado del anterior (`trabajador.ts:929-947`, `unidades.ts:1250-1256`).
  Pintar «en segundo plano» es encadenarlos solos y **quitar la revisión humana** de la identidad: una mala se
  copia en las otras 9-17. Y nadie arranca hoy el trabajador (`pnpm taller` es una CLI).
- El maniquí del civil **existe**: el juego `civil` (`tools/art/poses.ts:1263-1270`, reposo y marcha de ambiente,
  carga `run`, ataque `quick`) con sus 16 poses en `_poses/civil-8d/`. Pero sin profundidad: solo la tienen los
  maniquíes propios (`_poses/unidades/<id>-8d/`), y la tropa se pinta sobre profundidad desde el 10-10
  (`unidades.ts:1299-1305`). Sobre la pose en color, los NPC saldrían con la calidad de antes. Tampoco hay
  `_poses/civil.png` para la identidad (`rutaPoses`, `unidades.ts:971`). La talla importa: la gente de los orkos
  incluye goblins y troll (`data/vecinos.json`), y el goblin va a 0,7 (`unidades.ts:637`).
- El estilo de un NPC sin lámina sale de `ESTILO_DE_FACCION` (`unidades.ts:981`), como el de los héroes. El
  motor **solo puede escribir su `historia.json`** y validar (`tools/mundo/motor.ts:286`).

## El día después

- Con mundo, figura propia al recargar si el trabajador corrió. Sin mundo: **Y Bot salvo lo que ya haya en el banco**. Con 12 encargados, 2-4 vecinos y el alcaide por
  facción (`data/vecinos.json`), «sin repetir en una base» pide ~17 figuras por facción, ~85 en total: 850
  imágenes solo con la hoja A, más que la cuota de un mes (~800). El criterio 3 se cumplirá con repeticiones
  durante mucho tiempo, y la queja literal solo se ve arreglada con un lote semilla.
- La hoja B no tiene consumidor: la gente de la base solo hace `idle` (`escena.ts:130`), el caminante
  `idle`/`walk` (`escena.ts:56`), y el encuentro de un lugar pelea con unidades del catálogo. Que «lo decida el
  motor» vale, pero hoy pedir la B son 8 imágenes que nada pinta.
- Se cierra una puerta si el pedido → cola → segundo plano se hace solo para NPC: la F2 (exteriores, interiores,
  objetos y «animaciones bajo demanda», `docs/agents/2026-10-22-mapa-vivo/critica.md:58-60`) lo rehará.

## Conflictos

- **Solapamiento con la F2 del mapa vivo** («arte bajo demanda con Codex»: los encargos del mundo a la cola del
  taller por la suscripción; requisitos del mapa vivo: «también se genera arte para personajes»). Esta tarea
  es la rebanada de personajes de la F2, no algo fuera de ella. Decláralo así y que el circuito pedido → cola →
  aviso al terminar sea el de la F2, con el NPC como su primer cliente.
- **Roza la F1b** (la persona fija de la base que el mundo puede sustituir, «el anciano padre»). Asignar figura a
  la gente de `data/vecinos.json` desde la historia es compatible, siempre que vaya por el id de la persona y no
  fije quién hay en la base.
- **Escrito y disco**: la cola está ignorada por git (`tools/taller/cola/.gitignore`) y los `gen-*` también
  (`.gitignore:43`). Una entrada «pendiente» escrita en un `data/npcs.json` commiteado se queda pendiente para
  siempre en otro clon, o cuando se cancela el mundo que la pidió. «Un hecho, un sitio»: que esté pintada o no
  se deriva del disco, no se escribe.
- Ramas vivas: ninguna sin fusionar toca `vecinos.json`, `personajes.ts` ni `core/mundo/`.

## Coste contra valor

Valor alto (se ve en cada base). Coste real: tipo de figura nuevo en taller y cliente, definiciones en datos,
encadenado automático, quién arranca el trabajador. Codex es lo caro: sin tope de figuras nuevas por mundo, uno
de 8 lugares más su base gasta 100-150 imágenes. No hacerlo nunca deja la base en Y Bot.

**Qué no hacer**: no ampliar los permisos del motor (que pida dentro de `historia.json` y encole quien valida);
no meter las figuras en `assets/unidades/` ni en la lista de la arena; no escribir «pendiente» a mano; no
encadenar identidad → hojas sin un punto donde mirar la identidad, salvo que el usuario lo acepte.

## Qué le cambiaría a `requisitos.md`

> **Alcance**: esta tarea es la rebanada de personajes de la F2 del mapa vivo. El circuito pedido → cola del
> taller → figura en el banco se diseña para la F2 entera (los NPC son su primer cliente), no para los NPC.
>
> **Criterio 1 bis**: el taller pinta figuras cuya definición vive en datos (no en `tools/taller/unidades.ts`),
> en una carpeta que no lista la arena, con un tipo de figura de reposo y marcha (hoja A) que el renderizador
> acepta y que no puede llegar a una batalla. La hoja B, solo si el motor la pide; la skill le dice que hoy
> ninguna escena la pinta.
>
> **Criterio 2, cambio**: «pedida y sin pintar» se deriva de si su hoja está en disco; el JSON no guarda el
> estado. Una petición sin cola (otro clon, mundo cancelado) se puede volver a encolar con una orden.
>
> **Criterio 5 bis**: el motor pide figuras dentro de `historia.json`; sus permisos no cambian. Hay un tope de
> figuras nuevas por mundo (lo propone el plan) y el motor reutiliza antes de pedir.
>
> **Criterio 6 bis**: qué arranca el trabajador, y si la identidad pasa por una revisión antes de las hojas o se
> encadena sola, lo decide el usuario antes del plan.
>
> **Pregunta al usuario, antes de gastar**: un lote semilla por facción (p. ej. 3-4 figuras civiles por facción
> = 15-20 figuras, ~150-200 imágenes con la hoja A) para que la base se vea arreglada sin generar mundos. Sin él,
> la queja de la petición sigue en pie hasta que se generen muchos mundos.
>
> **Maniquí**: el civil (`_poses/civil-8d/`) con su profundidad, renderizada una vez; la talla, por figura.
