# Hallazgos de /simplify de «el camino cuesta», y la decisión del usuario — decididos por el coordinador

Dos revisores: **R/S** (reutilización y simplificación) y **E/A** (eficiencia y
altitud, con medidas).

Orden de trabajo:
- primero lo que no cambia reglas, con el ancla `d68a0aa6…` igual tras cada bloque;
- después lo que cambia reglas (puntos 10-12), con un solo re-anclaje al final,
  mirando antes la forma del diff.

## La causa que encontró la altitud, y la decisión del usuario

Los asaltantes ganan 270 de cada 304 emboscadas. **La causa no es la IA: el héroe
no puede crecer.** Su cupo de 6 se llena de lo barato, no puede cambiar esa
tropa, y su fuerza se queda en 200-300 mientras acumula millones de oro. El techo
de los asaltantes (800) se calibró contra un héroe ideal de ~500. El «si no, va
igual» de la IA tapa ese muro mandando al héroe a perder: si se quita, 27 de cada
60 partidas se atascan.

El usuario: **«Sí, mira la sección de Experiencia al final de NuevaJugabilidad.
También se puede despedir y reclutar mejores.»** La experiencia de la tropa va en
el ciclo siguiente («la tropa crece»). **Despedir entra en este ciclo.**

## Se aplican — sin cambiar reglas (ancla `d68a0aa6…` igual)

1. **Reutilización.**
   - `guarnicionInicial` usa `ejercitoDe`, que pasa a `hero/troop.ts` (R1).
   - Un solo `problemasDeTopeDeLiderazgo(grupos, quien, tope, queEs)` que suma
     con `armyLeadership`, para guarniciones y asaltantes (R2).
   - `juntoANodo(map)` se exporta desde `regiones.ts` y lo usan `generate.ts`,
     `tocaUnNodo` y `casillaLibre`. Fuera `casillasParaSembrar` (R3, S1).
2. **Bandos y asaltantes.**
   - `ladoDeAsaltante(state, id)` es el único constructor del bando de un
     asaltante (R4).
   - `protagonista` se deriva de `battleOwners` (R5, S6).
   - `dejarAsaltante(state, id, army)` borra el grupo si se queda vacío y sustituye
     los cuatro `filter` y las dos ramas de supervivientes (R6).
   - `cerrarEmboscada` recibe los datos ya estrechados y desaparece el `throw`
     inalcanzable (S5).
   - `Atacante` se escribe como `Extract<BattleFoe, …>` (S9).
3. **Tipos y vistas.**
   - `GrupoDeTropa` en el evento y en `knownMap`. `Raider` guarda
     `troops: GrupoDeTropa[]` como dato y `army` se deriva al abrir batalla, con
     lo que sobran `tropaContada` y `GrupoContado` (R7, S4).
   - `poderDe` pasa a `ai/fuerza.ts` (R8).
   - Una sola `VistaAsaltante`, compartida por `vista-espectador.ts` y
     `AdventureScene`, que manda las tropas contadas y no un objeto por
     individuo (R9).
   - `pintarGrupoNeutral` para monstruo y asaltante, con el número una sola vez
     (R10).
   - `considerar(at, valor)` y `valorDeNeutral(miPoder, suyo)` en la IA (R11).
4. **Herramientas.** `tamanos.ts` usa `baseOf` y un `lugarDelRival` exportado.
   `tools/qa/estadistica.ts` con mediana y cuantiles comunes al banco, al barrido
   y a `tamanos` (R12). `libresDeSuRegion` del test incluye la regla de «no
   pegado a un nodo» o usa la de producción (R13). Fuera los exports sin
   consumidor (S1).
5. **Un solo Dijkstra con opción.** `alcanceDelHeroe(state, hero, {
   evitarEmboscadas })` sustituye a `alcancePrudente` (S2). El invariante vuelve
   a nombrar una sola puerta. `casillasPeligrosas` deja de crear 1,66 M de
   `Point`: pasa a una máscara o a ids de región.
6. **Máscara de ocupación por día** (E). `casillasOcupadas` deja de ser un
   `Set<string>` por grupo y día y pasa a un `Uint8Array` por día, actualizado al
   mover cada grupo. Prototipado: 241 → 64 ms con el mismo sha.
   `casillaLibre` trabaja por índice (S3) y `dondeBrotan` hace una sola pasada.
7. **`createGame`** no copia en profundidad lo que `buildMap` acaba de crear (S4).
8. **Animación de la marcha** registrada en el mismo contador que
   `hayFigurasAnimadas()`; fuera el segundo mecanismo `asaltantesEnMarcha` (S8).

## Se aplican — cambian reglas o el volcado (re-anclar una vez al final)

9. **La crónica decide quién ve qué, sin dejar de emitir** (A3).
   - `raider_moved` sale de la crónica: es el 20 % del log y nadie lo lee. La
     posición está en el estado y el mapa anima con ella.
   - `raider_spawned` se emite **también para los grupos iniciales**, pero no
     inunda la crónica de la persona: o se filtra por lo que ve (la niebla), o
     los hechos «de mapa» no se pintan en el panel.
   - La regla tiene que ser **una**: no puede depender de cuándo nació el grupo.
10. **Despedir** (decisión del usuario).
    - Nueva acción de aventura `dismiss` en la base (o en un castillo propio):
      libera individuos del ejército del héroe. Va en `adventureActionSchema`,
      `RESPONSE_FORMAT`, `session.ts` y el castillo del cliente, con su
      `dismissBlocker` y su frase.
    - La IA la usa cuando tiene el cupo lleno, le sobra oro y hay algo mejor que
      reclutar: despide lo más barato y recluta lo mejor que quepa.
11. **El repliegue de la IA pasa de «va igual» a «espera y refuérzate»** (A1). Si
    el alcance prudente no da destino, el héroe vuelve a la base o se queda,
    despide, recluta y espera, en vez de entrar en una emboscada que va a perder.
    - El test del techo («no hay muros») se mide contra la fuerza que un héroe
      **puede alcanzar de verdad** con despedir y reclutar en el mapa, no contra
      un héroe ideal.
    - Se publican el barrido (0/40 y 0/1000), la duración y **cuántas emboscadas
      ganan ahora los asaltantes**.
    - Si sin el «va igual» siguen atascándose partidas, se para y se reporta, sin
      tapar nada.
12. **El telón del espectador comprime los finales cuando va atrasado** (A2).
    Mientras haya fotogramas en cola, los finales intermedios no se retienen
    2,5 s completos. El plazo de `capturas` vuelve a ser **fijo** y se fija
    midiendo. Las semillas de `capturas` vuelven a ser corrientes si el punto 11
    lo permite (A4).

## Se aplaza

- La experiencia de la tropa, el equipo y la tropa que se convierte en héroe:
  ciclo «la tropa crece».
