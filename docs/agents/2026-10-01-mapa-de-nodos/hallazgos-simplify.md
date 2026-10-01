# Hallazgos de /simplify de la 2a, y la regla nueva del usuario — decididos por el coordinador

Dos revisores: **R** (reutilización y simplificación) y **E/A** (eficiencia y
altitud). Se aplica todo junto con la decisión del usuario, y el banco se
**re-ancla una sola vez al final**, mirando antes la forma del volcado. Los
cambios que no tocan reglas se comprueban primero, uno por uno, con el ancla de
la 2a todavía puesta.

## 0. La decisión del usuario: perder la base elimina (A6)

Se sustituye la regla improvisada de `checkDefeat` (sin héroes, sin base y sin
oro para contratar) por **«perder la base elimina en el acto»**. Se retiran su
docstring y el test de los 2499/2500 de oro. La partida acaba cuando queda una
sola facción.

## Se aplican — sin cambiar reglas

1. **El generador usa la red de `regiones.ts`** (R1, R2, E6).
   - El generador construye el mapa provisional y lo valida con `problemasDeRed`.
     Si falla, reintenta.
   - Los saltos y los perfiles salen de `estructura(map)`.
   - Fuera la segunda implementación: `vecinas`, el BFS por etiqueta,
     `regionesJunto`, `deRegion` y `saltos`, unas 80 líneas.
   - Fuera el bucle de «dos caminos», que nunca rechaza un plan. Esa propiedad
     ya la vigila la auditoría de `test/regiones.test.ts`, que sí muerde.
   - `saltos` se calcula una vez por base.
   - Las casillas libres se precalculan por región.
   - `aPunto` y `VECINAS` quedan en un solo sitio.
2. **`problemasDeRed` hace un solo flood fill** (R3). Construye la `Estructura` a
   partir del `comp` que ya tiene. Fuera las comprobaciones que no se pueden
   alcanzar (R4) y la de rango repetida (R10). `inBounds(plan, p)` sustituye a
   `dentro`.
3. **Una sola foto del territorio** (R6, E2, E3, R7, R11).
   - `territorio(state)` se exporta una vez y devuelve los dueños de los nodos,
     los dueños de las regiones y la conexión de cada jugador con su base.
   - La leen la renta, la IA y los tests. `regionOwner` y `conectadoABase`, si
     se quedan, salen de esa foto.
   - `nodeOwner` lineal desaparece.
   - `regionesQueCierra` deja de reescribir la regla de «región tuya».
   - Fuera los `export` sin consumidor.
   - La región de cada mina sale de la estructura.
4. **Tipos únicos** (R5). Un solo `MapRegion`. `RegionDeRed` es `MapRegion` más
   `nodos`.
5. **Un solo validador de grupos de monstruos** (R9). `problemasDeGrupo` lo usan
   `data.ts` y `validateMapPlan`.
6. **`regions` en el cable del espectador**: se queda, porque lo pinta la 2b.

## Se aplican — cambian reglas, el banco se re-ancla una vez

7. **Lo hostil se alcanza pero no se cruza, en el camino de todos** (A1, E1).
   - El cálculo de caminos y del alcance de un héroe recibe las casillas
     hostiles de la partida (las de `enemyAt`: un héroe ajeno, o un castillo
     ajeno con guarnición). Se llega a ellas, pero no se atraviesan, igual que
     un monstruo en pie.
   - Lo usan `caminoDelHeroe`, la IA, el jugador y el agente. Así nadie se mete
     en una batalla que no eligió a mitad de un paso estrecho.
   - Desaparecen `hostiles` y la cadena `prev` de la IA, que se llevaba 147 de
     los 209 ms de `chooseHeroDestination`.
   - **Hay que respetar `frontera.ts` y su contrato de desempate.**
8. **Los puntos de movimiento del día se fijan al empezar el día** (A4).
   - Unirse a tropa a mitad de turno, sea recogiendo la guarnición o
     reclutando, no recorta los puntos que quedan. La tropa más lenta cuenta a
     partir del día siguiente.
   - Desaparece la diferencia entre pasar y llegar: la guarnición se recoge
     **al pasar** y al llegar.
   - Es una regla de juego. Se apunta como tal en `CLAUDE.md` y se marca «por
     verificar contra fheroes2»: no se cita como fuente sin haberla comprobado.
9. **`emit` lanza si la partida ya terminó** y el hecho no es `game_over` (A5).
   Así «`game_over` es el último hecho» pasa a ser un invariante del núcleo y no
   una convención. Los `return` de los bucles se quedan.
10. **Volver a medir el ×3 de la base y el límite de dos ciudades neutrales**
    (A2, A3). Se ajustaron con la regla vieja, que decidía 162 de 200 partidas.
    Con «perder la base elimina»:
    - se prueba el generador con **todos** los cruces de grado ≥ 3 como ciudad;
    - se prueba la IA sin el ×3.

    Si el barrido da 0 partidas sin terminar y la duración es razonable (se
    publican la mediana, el p90 y el máximo), los límites desaparecen. Si no,
    se quedan con su cifra medida, y el arreglo de fondo (valorar por la
    diferencia de conexión) va a la issue #115. En todo caso se borra el
    comentario del ×3, que ya no es cierto.

## Se aplazan

- **Valorar los objetivos por la diferencia de `conexionABase`**, en lugar de
  los valores fijos de ciudad, nodo y región (A2): es la IA buena, issue #115,
  salvo lo que el punto 10 demuestre que sobra.
