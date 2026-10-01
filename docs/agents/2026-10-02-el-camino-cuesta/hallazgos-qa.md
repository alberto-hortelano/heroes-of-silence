# Hallazgos de QA de «el camino cuesta» — decididos por el coordinador

Veredicto de QA: apto con reservas (ver `qa.md`).

Condiciones:
- `pnpm verify`, el barrido (0/40 y 0/1000), `pnpm qa` y `pnpm capturas` en verde;
- cada arreglo, visto morder.

El punto 1 mueve el volcado: se re-ancla una vez, mirando antes la forma.

## Se corrigen

1. **H1: la persona cae en emboscadas de grupos que no se le pintan.**
   - **Qué pasa:** el castillo ve en un radio de 5 (`visibleNow`), pero ese radio
     no se escribe en `player.fog`. El cliente pinta lo que hay en `fog`; el agente
     lee `visibleNow`.
   - **Arreglo general:** lo que un castillo propio ve se revela en `fog`, igual
     que lo que ve un héroe. Al empezar la partida, al capturar un castillo y en
     cada turno, con el radio del castillo (la cifra de `getFogDiscoveryDistance`
     que ya está documentada).
   - **Resultado:** `fog` y `visibleNow` dejan de discrepar en lo que ve el
     castillo, y el agente deja de recibir casillas `terrain: null` donde hay un
     grupo visible.
   - **Test:** que el día 1, en semillas variadas, todo grupo que pueda emboscar
     al héroe de la persona en su primer movimiento caiga dentro de `fog`, y que
     ninguna casilla de `knownMap` con objeto o grupo visible tenga
     `terrain: null`.
   - **`pnpm capturas`** ya no debería necesitar «Ver mapa entero» para encontrar
     un grupo. Si aún lo necesita, se dice por qué.
   - **Re-anclar:** cambia lo que se ve, así que el volcado se mueve. Antes de
     anclar, comprobar que solo crecen los sellos `seen` y que no cambian
     decisiones. Si cambian, publicar la forma.
2. **H2: la ruta avisa cuando entra en una región que embosca.** Si el camino
   elegido pisa una región con un grupo visible que embosca al héroe (la misma
   regla que usa la IA), la ruta lo marca (color o icono en el tramo) y la barra
   lo dice: «cuidado: el camino cruza la región de X, que te emboscaría». Paso en
   `pnpm capturas`.
3. **H3: un plan con `troops: []` se rechaza.** Lo rechazan zod y
   `validateMapPlan`, diciéndolo. No pueden existir grupos de 0 individuos. Test.
4. **H4:** las frases de `dismissBlocker` usan el nombre de la criatura, no su id.
5. **H5: los asaltantes se distinguen de los monstruos neutrales.** En el mapa
   llevan una marca propia que se lee de un vistazo, con arte y sin arte: un
   estandarte, un color o un icono, no solo el aro discontinuo. Se mira en las
   capturas.
