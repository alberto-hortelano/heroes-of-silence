# Hallazgos de QA de «el equipo» — decididos por el coordinador

Veredicto de QA: apto con reservas (`qa.md`).

## Se corrigen

1. **I1:** la política del arnés no pide reclutas que su propia mejora del mismo
   plan ya ha convertido. Se corrige además en `implementacion.md` la nota que
   decía «preexistente».
2. **I2: la IA no derrocha en compras.** Hoy compra 18 piezas al día para una
   tropa que muere al día siguiente: 1 187 compras del banco en 14 semillas.
   - **Regla sencilla:** se compra solo para quien sobrevive y vale la pena.
     - El héroe y los veteranos de nivel ≥ 2 primero.
     - A un novato, solo si al jugador le sobra mucho oro.
     - Tope de compras por héroe y día, en datos o como constante con nombre.
   - Es un cambio de cómo decide la IA, así que el ancla se mueve. Se re-ancla una
     vez, mirando que el diff empiece en decisiones de compra.
   - Se vuelve a medir con `tools/qa/equipo.ts`, 100 semillas, y se publica la
     distribución de compras por partida (mediana, p90, máximo) y no solo la media.
3. **I4:** el panel del héroe enseña ataque y defensa **con** el equipo, o bien
   «2 (+3)». Sale de la misma puerta de cifras y no se suma en el panel.
4. **M1:** la pieza elegida se suelta al cambiar de héroe, o al dejar de estar en
   su mochila.
5. **M2:** `repartirBotin` usa `aLaMochila`.
6. **M3: un hueco inválido en `unequip` descarta esa acción y no el turno entero.**
   - Se valida en el núcleo, con su motivo. El esquema acepta texto y
     `unequipBlocker` comprueba el hueco, igual que la criatura en
     `validateMapPlan`.
   - Se recupera la comprobación de `HUECOS` que se quitó en el simplify, ahora
     en la puerta correcta.
   - Test.
7. **M4: las frases de rechazo.**
   - Con `creature` y la criatura ausente, el rechazo no sugiere un id.
   - «no es tuyo» pasa a una forma neutra en género, por ejemplo «no es de tu
     bando».
8. **M5:** se separan los «×» de la línea «Lleva:».

## Se quedan como están (se le dice al usuario)

- **I3: la armería se levanta en 8 de 100 partidas.** Puesta antes en la lista de
  construcción, se construye en el 82-88 %, pero la morada 5 cae a la mitad. La
  decisión es del usuario.
- **M6: las piezas de velocidad suben también el movimiento en el mapa.** Se deja
  así hasta que el usuario diga otra cosa.
