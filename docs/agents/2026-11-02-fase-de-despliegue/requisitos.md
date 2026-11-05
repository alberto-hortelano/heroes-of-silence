# Fase de despliegue (y la vista de tropa como despliegue)

## Petición literal

Primera petición (02-11-2026), que hizo la tarea `docs/agents/2026-11-02-ordenar-la-tropa/`:

> «En la vista de tropa deberia poderse ordenar la tropa para la batalla, ahora no se de donde sale el orden»

Esa tarea quedó implementada **sin commitear** en este worktree: la acción `ordenar_tropa`, los botones
▲ Adelantar / ▼ Atrasar bajo la lista, la frase «sale …» de cada uno, `salidaDelBando` y `dondeSale`
(`core/battle/battle.ts`), `moverEnLaTropa`, `puestoBlocker`. El usuario la probó y respondió:

> «No puedo ordenar al heroe, no es visual. Añade al combate una fase previa de despliegue y en tropa, que se vea
> como en el combate en la fase de despliegue. Ten en cuenta que habra habilidades como infiltracion que permitan
> desplegar mas alante o mas tarde. La vista de tropa pasa a ser la de despliegue. En un combate el despliegue lo
> hace primero el atacado, sin los enemigos, y luego el atacante con los enemigos visibles»

Preguntas del coordinador y respuestas del usuario (02-11-2026):

- **¿Qué guarda la vista de tropa?** → «Formación por defecto»: colocas a cada uno (héroe incluido) en una casilla
  de tu zona de salida y se guarda en el héroe; cada combate arranca su despliegue desde ella y ahí se retoca o se
  acepta tal cual.
- **¿Quién despliega cuando no es la persona?** → «IA y agente, automático»: la IA de reglas y el agente MCP salen
  con la formación guardada de su héroe (o la regla de hoy); que el agente despliegue por su contrato, después.
- **¿La arena también?** → «Sí, como el juego»: la arena despliega igual, cada bando según quien lo lleve
  (Yo / IA), el defensor primero.

## Criterios de aceptación

1. **La vista de tropa es la de despliegue.** Se ve como el tablero de batalla en su fase de despliegue (las
   casillas del tablero, la zona de salida del bando marcada, las figuras en sus casillas), solo con lo propio. Se
   coloca a cualquiera, **el héroe incluido**, en cualquier casilla libre de su zona (y se intercambia con quien la
   ocupe). Lo colocado se guarda en el héroe como su **formación**. La ficha y el equipo del elegido siguen ahí.
2. **La formación sobrevive a los cambios de la tropa**: reclutar, licenciar, perder a alguien en batalla, recoger
   la guarnición o cambiar el tope. Quien no tiene casilla guardada la recibe por la regla de hoy en un hueco
   libre; quien se va deja su casilla libre. Nunca dos en la misma casilla ni nadie fuera de la zona.
3. **Toda batalla empieza en fase de despliegue** (mapa y arena, las de la persona, la IA y el agente): primero
   despliega **el defensor, sin ver a los enemigos** (ni figuras, ni casillas, ni lista); después **el atacante,
   con los enemigos visibles** ya en su sitio. Hasta acabar el despliegue no hay turnos ni iniciativa.
4. Un bando de la persona despliega en pantalla, **empezando desde la formación guardada** (o la regla de hoy si
   no hay héroe con formación: guarnición, la arena), retocándola igual que en la vista de tropa, y lo cierra con
   un botón («Listo» o similar). Un bando de la IA o del agente, o sin dueño (monstruos, asaltantes, guarniciones
   neutrales), despliega solo: su formación guardada o, si no hay, la regla de hoy (`salidaDelBando`).
5. **Las reglas del despliegue son del núcleo**: qué casillas son de salida de cada unidad (la zona), el orden en
   que despliegan los bandos, si una casilla vale (muralla, ocupada, fuera de zona) con su `*Blocker` y su frase, y
   las acciones de colocar y cerrar el despliegue. El cliente solo pinta y manda intents por `session.ts`.
6. **Preparado para infiltración** (sin implementar la habilidad): la zona de salida y el momento de desplegar se
   piden **por unidad** a una función del núcleo, de modo que una habilidad pueda ampliar la zona («más adelante»)
   o hacer que una unidad despliegue después que el enemigo («más tarde»), sin tocar el cliente. Un test lo
   demuestra con una unidad de prueba a la que se le amplía la zona (cómo, lo decide el arquitecto).
7. **La muralla de la arena**: nadie se coloca en un muro ni en una puerta; la zona se recorta igual que hoy.
8. **El espectador** ve la fase de despliegue o, como poco, no se rompe: `adaptar.ts` sigue siendo la inversa
   exacta de la serialización.
9. **El banco no cambia** (`pnpm banco`, mismo sha): sin formación guardada y sin persona, el despliegue automático
   da las mismas casillas que la regla de hoy. `pnpm qa` en verde (el agente no despliega: su batalla sigue igual).
10. `pnpm typecheck`, `pnpm lint` y los tests de lo tocado, en verde; prueba en el navegador de la vista de tropa,
    de una batalla como defensor (sin ver al rival al desplegar) y como atacante (viéndolo), y de la arena.

## Fuera de alcance

- La habilidad de infiltración (ni ninguna otra que amplíe la zona): solo el enganche y su test.
- Que el agente MCP despliegue por su contrato (backlog).
- Que la IA de reglas piense su formación (despliega con la guardada o la regla de hoy).
- Equilibrio y jugabilidad (no se mide).

## Contexto

- Hoy: `salidaDelBando(tropa, conHeroe, side, muralla)` coloca (las tres `COLUMNAS_DE_SALIDA` del borde,
  `DEL_CENTRO_A_FUERA`, el héroe en el centro). El orden de `hero.army` decide además el id del stack y el
  desempate de iniciativa.
- Lo de la tarea anterior sin commitear (`ordenar_tropa`, ▲/▼, «sale …») se puede reutilizar, sustituir o quitar:
  lo decide el arquitecto. La lista de la vista de tropa ya no hace falta como forma de ordenar.
- La batalla tiene ya fases del turno (`faseDelTurno`), el golpe plantado (`golpeEnCurso`), la rueda; la persona
  defiende sus batallas en pantalla (`¡Te atacan! Defiéndete.`), y la IA conduce los turnos ajenos.
- Hay un servidor de prueba del usuario en el puerto 3196 (vite del worktree, tarea en segundo plano de la sesión).

## Preguntas abiertas (con suposición por defecto)

- **Arrastrar o clic-clic** para colocar: suposición, clic en la figura y clic en la casilla (y arrastrar si es
  barato); teclado accesible.
- **Formación en el marco del atacante** guardada una vez y reflejada al defender (como `salidaDelBando`).
- **Cómo se identifica a un novato** en la formación (no tiene id): lo decide el arquitecto.
- **El desempate de iniciativa** sigue por puesto en `hero.army`; si la formación lo cambia, que lo diga el plan.
- **La batalla del agente**: su lado despliega solo y la batalla empieza como hoy para él; el veredicto no cambia.
