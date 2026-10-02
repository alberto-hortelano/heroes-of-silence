# Hallazgos de /simplify de «mover y atacar» — decididos por el coordinador

Dos revisores: reutilización y simplificación (RS) y eficiencia y altitud (EA).
Rendimiento medido contra `ee5aa5e`: la diferencia es ruido, y lo nuevo pesa
menos del 0,5 % del perfil.

Nada de esto cambia reglas. El ancla `656e567e…` tiene que seguir **igual** tras
cada bloque, y si se mueve, se para.

## Se aplican

1. **Un ordinal de turno** (EA5, RS5, RS14).
   - `advance` numera cada turno (`turno.n`) y `mismoTurno(a, b)` se exporta
     desde `core`. El cable lleva el `turnId` donde haga falta.
   - Lo usan los cuatro que hoy lo deducen cada uno a su manera: el director (por
     identidad), `capturas.ts` (gastado que crece), `verify-agent.ts` (nota y
     `stepsLeft`) y la clave de caché de `session.ts`.
   - `Movibles` lleva el `n` del turno y el gastado, y se compara con un solo
     `if`.
   - Hay que verlo morder con la moral extra, que es el caso que engañó dos veces.
2. **La carga, regla en un sitio** (RS1, RS2, EA6, EA7, RS19).
   - `cargaDesde` devuelve la longitud de la recta. El tope y el bono los aplica
     solo `damage.ts`.
   - Si el anuncio necesita el número recortado, `damage.ts` exporta
     `cargaEfectiva`.
   - `serialize` manda `chargeFrom` cuando no está vacío, sin volver a preguntar
     el rasgo.
   - La prosa del agente interpola `CARGA_MINIMA`, `CHARGE_BONUS_PER_HEX` y
     `MAX_CHARGE_HEXES`.
   - El cliente tiene un solo rótulo de carga (`rotuloDeCarga`) con la constante.
   - Fuera `cobraCarga` en `mejorCarga`, y su docstring cuenta solo lo que sigue
     siendo cierto.
3. **`rectaLibre` por cubo** (RS7): alineación con `toCube` y `hexDistance`, y
   luego se recorre solo esa dirección. Las casillas bloqueadas entran como
   parámetro opcional y se calculan una vez en `casillasDeCarga` y en `mejorCarga`
   (RS8, EA2).
4. **`quedaAlgoQueHacer`** (RS3, EA1).
   - Fuera la condición redundante de `pasosQueQuedan`.
   - Basta con saber si existe alguna vecina libre o un enemigo a golpe, sin el
     BFS entero. Si así cuesta más que derivarla de `legalActions`, se deriva de
     ahí. Lo importante es que la regla de qué se puede hacer tras moverse no esté
     escrita dos veces.
5. **`gastadoEn(state, s)`** (RS4): exportada. `seHaMovido` se monta sobre ella y
   `capturas.ts` la importa.
6. **Un tope de jugadas** (RS6, EA3): una constante en `core`, derivada de
   `MAX_ROUNDS`, que leen `autoResolve`, el director, la sesión y
   `enfrentamiento.ts`, también en su mensaje.
7. **El cliente**:
   - `session.ts` expone `ReadonlyMap<string, CasillaDeCarga>` sin reconvertir
     (RS9).
   - `pintarCargas` recorre `v.cargas` (RS10, EA4).
   - El ángulo se calcula una vez por movimiento del ratón y lo lee `vista()`
     (RS11).
   - «Si dispara, no hay ángulo» se escribe una vez, en `angulo.ts` (EA8).
   - `SIN_CARGAS` es una constante compartida con el espectador (RS17).
   - `puede` se tipa como `BattleAction['type']` (RS16).
8. **Capturas**:
   - Importa el formateador de la barra (`rotuloDeAngulo`) en vez de reconstruir
     el texto (RS12).
   - Un solo helper que convierte píxel en acción (RS13).
   - Fuera el flag de módulo `anguloJugado` (RS20).
9. **La IA tras un tramo** elige de la lista legal en vez de repetir «movido ⇒
   `end_turn`», **solo si el ancla queda igual** (EA9). Si se mueve, se queda como
   está y se dice.
10. **Limpiezas**:
    - Los tres docstrings huérfanos vuelven junto a su función (RS18).
    - Fuera los exports sin consumidor (RS15), salvo lo que se interpole.

## Se descarta

- **Nada de rendimiento aparte de lo de arriba:** la diferencia es ruido.
