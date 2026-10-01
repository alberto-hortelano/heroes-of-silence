# Hallazgos de /simplify — 1b, decididos por el coordinador

Dos revisores: **R** (reutilización y simplificación, 22 puntos) y **E/A**
(eficiencia y altitud). El banco está anclado en `c36d3cc5…`.

Orden de trabajo:
- todo lo que no cambia reglas, **con el ancla igual**, comprobando tras cada bloque;
- después **A4**, que cambia una regla a propósito, y entonces se re-ancla **una
  vez** con la forma del diff.

## Se aplican — mismo ancla

1. **El papel de cada stack se escribe en un discriminante** (A1, A10, R5).
   `BattleStack` lleva `origen: {kind:'catalogo'} | {kind:'personaje', id} |
   {kind:'heroe'}` en lugar de `member?`, `commander?` y la pregunta por
   identidad. Los consumidores (`battle.ts`, `tactics.ts`, `game.ts`,
   `serialize.ts`, `vista-espectador.ts`, `adaptar.ts`, `surrenderCost`) pasan a
   ser **exhaustivos**: un caso nuevo no compila si alguien se lo deja. Desaparece
   `cifrasDelCatalogo`, y `esDelCatalogo` queda solo donde haga falta.
   - El `Stack` del ejército (`member?`) no cambia en esta pasada. La unión del
     ejército sigue en el backlog.
   - El guardia de invariantes que hoy pregunta por la identidad se reescribe
     contra el discriminante, y se le ve morder.
2. **El héroe sale del mismo constructor de stack que la tropa** (A2): una entrada
   más de la lista resuelta. Fuera el segundo literal, el baile
   `slice(1)`/`[0]!` y la copia de `unit` en `state.heroes[side]` si nadie la lee.
3. **`settleBattle` restaura a los dos héroes una sola vez, de forma simétrica**,
   y después reparte entre ganador y perdedor (A3, R10, R11, R12, R15).
   - `applyVictory` deja de recibir `pending` y `supervivientes`.
   - `heroeVencido` recibe el precio ya resuelto (`number | null`) y no vuelve a
     validar el oro.
   - `superviviente('defender')` se calcula una vez.
   - `baseOf` se llama una vez.
4. **`battleAt` desaparece** y queda `lugarDelRival(state, foe)` (A8, R13).
   `retiradaDe` mira `hero.at` y se quita el parámetro `lugar` (A9, R14).
5. **La rendición se guarda una vez** (R8, R9, E2, R22).
   - `finished.surrender` pasa a ser `{ gold }`: quien se rinde es siempre el
     perdedor.
   - El evento `surrender` no duplica lo que ya está en `finished`.
   - `surrenderBlocker` devuelve `{coste, motivo}` y la sesión hace una sola
     llamada.
   - El `?? 0` de `panels.ts` sobra.
6. **El tope de 7 se escribe una vez** (R16, R17).
   - `generate.ts` usa `CUPO_GUARNICION`.
   - `troopBlocker` junta las dos ramas de cupo en una.
   - `capacidadDe(hero)` devuelve `{tope, cupo}` y la usan `strategy.ts` y
     `game.ts`.
7. **Ayudas que faltaban** (R6, R7): `otroBando(side)` junto a `SIDES`, y
   `sumaDelBando(state, side, f)`. Ojo: es solo la ayuda; no unifica las medidas
   de fuerza (ver lo aplazado).
8. **Eficiencia sin cambio de decisiones** (E3, E4).
   - `miPoder` se calcula una vez en `chooseHeroDestination` y se pasa a
     `objectValue`.
   - `casillaDeVuelta` usa una búsqueda en anchura que para en la primera casilla
     libre **y devuelve la misma casilla que hoy**: el ancla lo confirma.
9. **Tests y arnés** (R1–R4, R18–R21).
   - `pointFromKey`; `forzarBatalla` hacia un `Point`; `avanzarHasta` con
     predicado o política; fuera `n()`.
   - Se borra el test de ausencia de los 27 hexes.
   - La docstring de `despliegue` deja de contar la historia de
     `despliegueBlocker`.
   - Un solo comentario sobre «el héroe no bonifica», el de `BattleHero`.
   - Fuera `rendicion.entro` y la segunda expresión regular del requestId.
10. **`pnpm qa` vuelve a jugar el mapa tal cual** (A7).
    - Fuera la reescritura del mapa (`conGuardiaEnLaPuerta`, el monstruo pegado a
      cada inicio) y el estado que el arnés inyecta en la política.
    - La rendición del contrato se cubre con un **test** que construye la batalla
      (agent-link o contrato) y comprueba que se ofrece, entra y produce
      `hero_returned`.
    - `pnpm qa` solo **avisa** si en su partida no se ofreció.

## Se aplica — cambia una regla, re-anclar UNA vez al final

11. **La captura la decide lo que hay en la casilla, no el destino del héroe**
    (A4). Hoy la regla «el defensor que pierde en un castillo pierde el
    castillo» vive como caso especial de la base dentro de `heroeVencido`, y un
    héroe que pierde defendiendo un castillo propio **que no es su base no lo
    entrega**.
    - Pasa a `applyVictory`: si el vencido defendía en un castillo, el castillo
      se captura, sea base o no. Después el héroe pregunta si le queda base.
    - Mueve el banco: se re-ancla mirando la forma (cuántas capturas nuevas,
      partidas que terminan, ningún hecho imposible) y se publica el cambio de
      duración y de ganador.

## Se aplazan, a issues

- **Una sola medida de fuerza para la IA** (A5): `unitPower`/`fuerzaDe`,
  `threat` y `pesoDelBando` son tres escalas, así que los umbrales 1,6× y 1/3 no
  son comparables. Va con la issue de la IA (proteger al comandante, contratar
  más héroes, mejorar calidad en el tope). Cambia decisiones, no es limpieza.
- **La unión del `Stack` del ejército** (`{creature} | {member}`): sigue en el
  backlog.

## Se descarta

- **Tasar la rendición por liderazgo en vez de por oro del catálogo** (A6): el
  usuario decidió «50 % del oro de la tropa superviviente». Que los personajes
  salgan gratis es consecuencia de esa regla y se queda documentado. Si el
  usuario quiere cambiarlo, es una decisión suya.
