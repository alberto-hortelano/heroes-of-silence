# Hallazgos de QA de la 1b — decididos por el coordinador

Veredicto de QA: apto con reservas (ver `qa-1b.md`).

Condiciones:
- El banco no se mueve (`c36d3cc5…`). Si el punto 1 lo mueve, se re-ancla una vez
  mirando antes la forma del diff.
- `pnpm verify`, `pnpm qa` y `pnpm capturas` en verde.
- Cada arreglo lleva su test o un paso nuevo en `pnpm capturas`, y se ve morder.

## Se corrigen

1. **H-1: la IA no se rinde por la persona.** Cuando `playAiTurn` resuelve la
   defensa de un bando que lleva una persona o el agente, la IA de reglas
   **nunca elige `surrender`** en su nombre. Rendirse cuesta oro y es una
   decisión que solo puede tomar el dueño.
   - Hay que distinguirlo en el núcleo: quien resuelve la batalla sabe para qué
     bando juega.
   - Hace falta un test que reproduzca `new Session(2)` sin `hero_returned` con
     `surrendered:true` para el jugador 0.
   - Que la persona juegue sus propias defensas es otra cosa y va a issue.
2. **H-2: el precio de rendirse se ve antes y después.**
   - La entrada `surrender` de `legalActions` lleva su coste (`gold`). Tiene que
     estar en el esquema y en `RESPONSE_FORMAT`.
   - El turno de batalla trae el oro del jugador que decide.
   - El veredicto de una rendición dice cuánto se pagó.
   - En el cliente, el botón ya lo enseña; la crónica, «tras rendirse por N de
     oro».
3. **H-3: el espectador ve el final de la batalla.** Hoy el fotograma de la
   batalla terminada y el del mapa llegan seguidos, y el espectador nunca pinta
   el parte final («Se rinde … por N», «Fin: gana …»).
   - El espectador debe **reproducir el final**: el animador agota su cola y el
     final queda visible un tiempo mínimo antes de pasar al mapa.
   - Se arregla en el espectador, no frenando al servidor.
   - Hace falta un paso en `pnpm capturas` o un test de escena que lo vea.
4. **H-4: el comandante se distingue en el tablero.** Con arte y sin arte lleva
   una marca propia (estandarte, corona o un aro distinto), y la misma marca sale
   en el panel «en el campo».

## A issue / al usuario

- **H-5**: rendirse con el héroe solo cuesta 0 de oro. Es coherente con la regla
  que decidió el usuario. Se le comenta.
- **H-6** (anterior a 1b): la primera escucha de una partida nueva trae el
  veredicto de la anterior, retenido por el puente MCP. Va a issue.
- **La persona no juega sus propias defensas** en el navegador (las resuelve la
  IA). Va a issue, con la referencia a `BattleTakeover`, que ya existe para el
  agente.
