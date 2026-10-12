# Nueva unidad y perfiles de arma como equipo (ciclo 2 del nivel único)

## Petición literal

Petición original (12-10-2026):
> Vamos a unificar los niveles de forma que el editor de personajes permita crear uno desde cero y asignarle un nivel de forma automatica. Supongo que haran falta numeros mas grandes, podemos usar multiplos de 10 o de 100 y que el nivel sea la primera cifra para simplificar

Corrección del usuario:
> Hay que desligar armas, escudo, armadura, etc del calculo del nivel. El equipo va a parte. Un templario con escudo y uno con arma a dos manos serian iguales, solo se diferencian en equipo

Sobre el escudo, respuesta del usuario en el punto de control del plan:
> Hueco propio, no hace falta llenar el hueco, de hecho solo espada tiene sentido ya que el escudo quitara velocidad

Y al cerrar el ciclo 1:
> Arranca el ciclo 2

## Contexto

- **El ciclo 1 está hecho** (`docs/agents/2026-10-12-nivel-unico/`, apto en QA, sin commitear en el árbol de trabajo de `main`). Hoy existen:
  - el índice y el nivel derivados de las cifras sin equipo (`core/nivel.ts`);
  - la escala ×10 (`ESCALA_DE_CIFRAS`);
  - el rango;
  - en la ficha de la arena, la lectura «Índice · nivel».
- **Lo que falta** es lo que el plan del ciclo 1 dejó diseñado en su §4b (`docs/agents/2026-10-12-nivel-unico/plan.md`), con las respuestas del usuario que lo corrigen:
  - el escudo **sí** es un hueco propio;
  - las claves del contrato van en inglés.
- **Hoy en la arena**:
  - `POR_PERFIL` (`core/arena.ts`) da cifras distintas por perfil de arma (espada-escudo, dos-manos, bastón, arco, ballesta, montado-lanza), así que dos templarios con distinto arma tienen distinto nivel;
  - no hay equipo en la arena;
  - el id de una unidad es el de su hoja de arte, así que no se puede crear una unidad desde cero.

## Criterios de aceptación

1. **El cuerpo es común.** El perfil de arma de la arena deja de cambiar las cifras base. Dos unidades del mismo cuerpo con distinto perfil (p. ej. templario con espada y escudo y templario con arma a dos manos) tienen las mismas cifras sin equipo y el mismo índice y nivel. Lo que hoy distingue a cada perfil (ataque, defensa, daño, tiros, velocidad) sale de su equipo.
2. **Las piezas pueden llevar más cifras.** Una pieza puede sumar daño (`[+min, +max]`) y tiros, y restar velocidad. `conEquipo` las suma, y sigue siendo la única suma de las piezas. El índice y el nivel no cambian con ninguna pieza.
3. **El escudo, en su propio hueco.**
   - Hay un cuarto hueco, `escudo`, que puede ir vacío.
   - Los escudos suman defensa y **restan velocidad**.
   - Un arma a dos manos (mandoble, bastón, arco, ballesta, lanza de jinete…) **no admite escudo**: equiparlo con un arma así, o ponerle una de dos manos a quien lleva escudo, se rechaza con un motivo para la persona. Esa regla vive en un solo sitio y la leen la arena, el juego y el agente.
   - El equipo base del héroe **no cambia**: espada, sin escudo.
4. **El juego no cambia.** Las piezas nuevas (armas por perfil y escudos) son de una calidad que el juego no reparte: ni botín, ni armería, ni equipo base. El banco sale **idéntico** al del ciclo 1. Si algo lo mueve, se explica y se decide.
5. **La arena tiene equipo.**
   - La ficha de una unidad enseña sus cuatro huecos y deja poner y quitar piezas.
   - Las cifras de combate cambian al hacerlo.
   - «Índice · nivel» no cambia.
   - Una unidad con un perfil de arma nace con el equipo de su perfil.
6. **Botón «Nueva unidad».**
   - Se elige un cuerpo: una hoja con arte completo o una criatura del catálogo.
   - La unidad nace con unas cifras mínimas (índice 1xx, nivel 1) y sin equipo, con un id propio y único en el borrador.
   - Se guarda, se monta en el montaje y pelea.
   - Se pueden crear dos unidades nuevas del mismo cuerpo, y cada una conserva sus cifras y su equipo.
   - Su arte es el de su cuerpo. Las reglas de antes siguen igual: una hoja con el arte a medias no se ofrece, y nunca el Y Bot en su lugar.
7. **Compatibilidad.** Siguen leyéndose sin perder nada:
   - un borrador de hoy (id = hoja, sin `cuerpo`, sin equipo, cifras del perfil);
   - un enlace `?montaje=` de hoy (v4).
   - Al leer un borrador antiguo, las cifras de su perfil se convierten en cuerpo + equipo de forma que sus cifras de combate no cambien. Si no se puede, se dice. Un borrador guardado de nuevo no se convierte dos veces.
   - El montaje se escribe en la versión siguiente.
8. **El agente y el contrato.** Si el contrato enseña equipo (héroe y tropa), el hueco `escudo` aparece, con su clave en inglés como el resto. `pnpm qa` pasa.
9. **Verificación.**
   - `pnpm verify` y, al cerrar, `pnpm verify:lento`.
   - Banco idéntico.
   - `pnpm capturas` (la arena cambia).
   - Arena en Playwright sin pantalla:
     - crear una «Nueva unidad», editarla y verla pelear;
     - dos templarios con perfiles distintos tienen el mismo nivel;
     - el escudo resta velocidad;
     - el arma a dos manos rechaza el escudo.
   - CLAUDE.md y `docs/historia.md`, con lo nuevo.

## Fuera de alcance

- Repartir escudos en el juego (botín, armería), o que el héroe nazca con uno.
- Arte nuevo de escudos o armas: las figuras siguen siendo las de su hoja. Ni fal.ai ni Codex.
- Derivar el liderazgo o el precio de las cifras.
- `Character.level` (rpg), que va a issue.
- Reequilibrar el juego.

## Preguntas abiertas (con suposición por defecto)

- **Cifras de cada arma y escudo.** Por defecto, las armas por perfil salen de la diferencia de hoy entre el perfil y el cuerpo común, para que una unidad de un perfil pelee igual que hoy. Para el escudo (un −1 escalón de velocidad y +defensa), el arquitecto propone las cifras, declaradas como inventadas.
- **¿Cuerpo común = el de «espada-escudo» sin lo que aporta su equipo?** Sí, salvo que el arquitecto encuentre un motivo mejor.
- **Id de una unidad nueva:** `<cuerpo>-<n>`.
- **¿Puede la tropa del juego llevar escudo?** El modelo lo admite (el hueco existe para todos), pero nada lo reparte hoy.
- **La velocidad de una pieza puede ser negativa.** Hoy las cifras de pieza son ≥ 0. Por defecto, la velocidad pasa a admitir negativos y el escalón resultante no baja del primero. Ataque, defensa, PV, daño y tiros siguen siendo ≥ 0.

## Punto de control del plan (12-10-2026, respuestas del usuario)

- **Velocidad igualada por personaje.** Todas las hojas de un mismo personaje (p. ej. `templario-escudo`, `templario-mandoble`) comparten un cuerpo con la misma velocidad, y la diferencia la pone el equipo (el escudo resta). El criterio 1 se cumple con el **mismo índice**, no solo con el mismo nivel. Se acepta que algunas hojas peleen en la arena con una casilla más o menos que hoy; el juego no cambia.
- **Los cuatro huecos van en inglés en el contrato del agente ya, en este ciclo:** `weapon`, `armor`, `accessory`, `shield` (claves de `equipment`, `unequip.slot` y cualquier sitio donde viaje un hueco). Por dentro del núcleo pueden seguir en español si la traducción vive en un solo sitio del contrato. `pnpm qa` lo comprueba.
- Aceptado lo demás del plan: el cuerpo común, las piezas `arena`, `manosBlocker` y `migrarUnidadDeArena`.

## Tras la re-verificación de QA (12-10-2026, respuestas del usuario)

- **Una unidad nueva nace donde caiga su índice.** El nivel sale de las cifras y los rasgos del cuerpo: una criatura con doble ataque nace en el 2 si su índice lo da (Paladín 217, Cruzado 225). El «nivel 1» del criterio 6 vale para el cuerpo común de una hoja, no para todo cuerpo. Ningún texto dice el nivel escrito a mano: se lee del índice.
- **El cuerpo de una criatura hereda su tamaño** (el dragón óseo ocupa dos casillas, como en el catálogo).
