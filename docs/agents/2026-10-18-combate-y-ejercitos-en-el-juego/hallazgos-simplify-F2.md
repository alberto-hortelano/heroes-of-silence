# Hallazgos de /simplify sobre F2 (consolidados por el coordinador, 18-10-2026)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el diff sin commitear
de F2. La eficiencia no encontró nada caliente en el juego (< 0,4 % del barrido); lo que hay es
forma. Deduplicados, con la decisión tomada. Se aplican **dentro de F2**, antes del commit.

## Se aplican

1. **Un catálogo, sin capas** (altitud 1-2, simplificación 1-2 y 6, eficiencia 1-3 y 5,
   reutilización 3 y 5). F2 tiene un solo catálogo en disco pero conserva la forma de dos.
   - **La batalla no lleva catálogo.** `GolpeConArma` lleva el `nombre` del arma (lo escribe
     `conEquipo`), y con eso `dichoDelGolpe`, `armasDe` y `horquillaDeDanio` no leen piezas. Se
     borran `BattleState.piezasDeArena`, `piezasDeLaPelea` y `PIEZAS_POR_PELEA`.
     `retocarEnBatalla` recibe el catálogo de quien lo llama (la sesión de la arena).
   - **El enlace no se superpone: aplica.** Decisión del coordinador: al abrir un `?montaje=`, sus
     piezas que no están en el catálogo de la página, o que están con otro contenido, entran en
     ese catálogo como **cambios sin guardar** (lo mismo que editarlas a mano), y la página lo dice
     («este enlace cambia N piezas; Guardar las escribe»). Una sola lista en la página: fuera
     `capaDelEnlace`, `catalogoDelEnlace`, `piezasQueSeGuardan`, la doble vista
     `catalogo()`/`catalogoAGuardar()` y `piezasEnUso`. El enlace sigue llevando todas las piezas de
     lo montado (para abrirse igual en otra copia); sube de versión si su forma cambia.
   - Si sigue haciendo falta superponer piezas por id en algún sitio (tests), una sola función del
     núcleo (`conPiezas(base, encima)`); `MontajeDeArena.piezas` deja de ser opcional si sobrevive.
   - El catálogo atado (`CatalogoDeEquipo`) se construye una vez por lista y viaja hecho a quien lo
     necesita (blocker del cambio de pieza, retoque, despliegue, muralla): sin revalidar la misma
     lista en cadena. `idsQueCambian` por Map y por identidad antes de comparar contenido.
2. **Una regla de munición** (reutilización 2, altitud 3, simplificación 4): `municionBlocker(unit,
   equipo)` en `hero/equipo.ts`, con `cuentaTiros`; `vestir` lanza con ella y `ponerseBlocker` la
   lee (sin `troopUnit` solo para leer `shots`). F3 la borra en un sitio.
3. **«Lo que la carga del juego exige», una función** (altitud 5, simplificación 8,
   reutilización 8): piezas, bases, alguna de botín, equipo base del héroe y unidades del catálogo,
   juntas en una función (p. ej. `catalogosBlocker({ piezas, unidades })`) que llaman la carga del
   juego, «Guardar» y el editor. El equipo base se valida una vez (en `data.ts`, solo la forma; la
   regla con `equipoBlocker`), sin el triple chequeo.
4. **Huecos con el nombre de su uso** (altitud 6). En el contrato, simétricos por uso:
   `melee_weapon`, `ranged_weapon`, `lance`, `armor`, `shield`. Por dentro, los huecos de arma toman
   el nombre de su uso (o el uso el del hueco) y `USO_DEL_HUECO` desaparece; el hueco que hoy se
   llama `carga` no debe chocar con la regla de la carga (elige el nombre: p. ej. `lanza`). El
   guardia de invariantes, por tipo (solo `huecos.ts` produce un `Slot`), no por literales. F2 ya
   rompe formato y contrato: es el momento. Si el renombre interno resulta desproporcionado, haz al
   menos el del contrato y el guardia por tipo, y dilo.
5. **El precio es un número en oro** (simplificación 10): `Pieza.precio: number`; fuera el recorrido
   de recursos para rechazar los que no son oro y la reescritura `{ gold }`.
6. **`seConsigue` obligatorio** (simplificación 3, reutilización 7 y 10): `[]` para «solo en kits»;
   fuera `dondeCanonico` si queda redundante, los spreads condicionales, `?.includes(...) === true` y
   `?? []`. Una tabla de nombres en el núcleo para decir de dónde sale una pieza, que leen la prosa
   del agente, `buyBlocker` y la ficha de la arena (una frase para «solo en kits»).
7. **Una regla del equipo de una unidad** (reutilización 1, simplificación 9): `equipoQueNoVale`
   usa la misma función que `unidadQueNoLleva`; esa función y `ESPADA_DE_LA_ARENA`, la clase
   `sello-de-la-arena` y la nota de `paneles.ts` del héroe dejan de decir «de la arena» donde ya no
   lo es.
8. **Lecturas de datos con lo que hay** (reutilización 4 y 6, eficiencia 6): `leerPiezas` sobre
   `revisarLista` (`validar.ts`), con su frase de repetida; `equipoEnDisco` con `leer`; en
   `tools/arena/borrador.ts` una validación por GET y por «Guardar» (atar el resultado de
   `leerEquipo`, no volver a pasar `leerPiezas`).
9. **El `_comment` de los catálogos** (altitud 7): el escritor conserva el `_comment` que lee del
   disco y solo cae a la constante si no hay; la constante, corta.
10. **`handleHotUpdate` por contenido, no por reloj** (altitud 4): se recuerda ruta → texto escrito
    y se suprime la recarga solo si el fichero coincide; cubre `equipo.json` y `unidades.json`.
11. **Menores** (simplificación 5 y 7, reutilización 9): fuera el parámetro `hueco` de `poner`;
    fuera los envoltorios y exportaciones que solo usan los tests (`validarEquipo`,
    `piezasDelEditor` si es `[...values()]`, el alias `DEL_JUEGO`, `rutaDePiezas`); `sinPieza` lo usa
    el cliente para borrar o se borra.

## Se aplazan (con motivo)

- **Dónde vive el surtido de la armería** (altitud 8): con cinco facciones podría ser del edificio.
  Suposición por defecto para F3: **un surtido común** (`seConsigue` de la pieza) para todas las
  facciones; F3 lo dice si necesita otra cosa. Y `valorDePieza` mide sobre el portador en F3.
- `UnitInfo.sinEquipo` y la parte de munición: F3 (ya apuntado).

## Se descartan (a conciencia)

- **Enlace más corto omitiendo las piezas iguales al catálogo del build** (eficiencia 4): rompe
  que el enlace se abra igual en otra copia; +69 % de URL es aceptable.
- **`CUERPO_DE_REFERENCIA` montado a mano en `ai/strategy.ts`**: no hay helper exacto; F3 lo
  cambia al medir sobre el portador.
