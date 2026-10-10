# Hallazgos de /simplify (muralla alta), consolidados y decididos

Cuatro revisores (altitud, reutilización, eficiencia, simplificación). Sin
muralla nada puede cambiar: `pnpm banco` con el mismo hash y `enfrentamiento.ts`
idéntico.

## Se aplica

### El nivel, un hecho en un sitio (altitud; simplificación 7, 13; reutilización 9-11)
1. `nivelDe(m, hex): 0 | 1` y `mismoNivel(state, a, b)` en `muralla.ts`. Los leen
   `enLoAlto`, `canReachMelee`, el bucle de ataques de `legalActionsAndCosts`
   (`conNiveles`), `distanciaACaminar`, y en el cliente `anim.ts` (elevación),
   `escenas/batalla.ts` y `render/batalla.ts` (sin `new Set(muros.map(hexKey))`
   por fotograma). Fuera las guardas `muros.length > 0` / `=== 0` / `hayMuralla`
   delante de `esMuro`/`enLoAlto`: una sola forma de preguntar. Una sola forma de
   elevar en pantalla (`elevado`, `cajaDeFigura`, `alto()` → una).
2. Los conjuntos de lo que la muralla cierra (simplificación 11-13; altitud
   «cerradas»): una función de `muralla.ts` decide según tamaño y vuelo (lo que se
   cierra para posarse y para recorrer), y `cerradasPara`, `cerradasAlPaso`,
   `cerradasAlRecorrer` la leen. Fuera la rama muerta de `cabezasCerradas` y los
   comentarios falsos. `cerradaPara` (muralla.ts) pasa a `piezaEn(m, key)` sin
   bando para «qué pieza hay»; el bando lo decide `porQueNoCabe`. Un `macizas(m)`
   con nombre en vez de `cerradasDeLaMuralla(m, 'attacker')` como truco (línea de
   tiro, despliegue).
3. La defensa en lo alto, una regla (altitud, reutilización 2, simplificación 4,
   10): `bonoEnLoAlto(state, s)` (o equivalente) en el núcleo que leen
   `effectiveDefense`/sus llamantes, la IA y la ficha de la arena; la ficha lo
   llama una vez.
4. La regla de escalar, una (altitud, reutilización 1, simplificación 2, 3, 8,
   15): `piesDeSubida` de la IA pregunta a `subirBlocker`/`escaleraBlocker` (o a
   `escalasA`) y usa `cerradasPara`, sin `ocupadas` ni `puertas.some` a mano;
   `escalaBlocker` sale de `escalasA` (si hay acción de ese tipo, `null`; si no, el
   primer motivo), sin repetir `quienNoEscala`/`!s.escalera`; `subidaAndando` no
   redacta otra vez quién sube y cómo; la frase «una unidad de dos casillas no
   sube» una vez. `escalera: true` no llega al stack que no puede usarla (grande,
   volador, héroe): se filtra al crear la batalla.
5. La escalera del montaje a la batalla, una representación (simplificación 1):
   marca por unidad (`batallaDeArena` recibe la marca con cada unidad), sin índices
   paralelos, `EscalerasDeArena`, `SIN_ESCALERAS` ni su validación de puestos. Si
   `BattleSide.conEscalera` puede ser una marca por miembro, mejor.
6. El tipo `'poner_escalera' | 'subir'` una vez en `battle/types.ts`
   (simplificación 6). `muroPorElegir` opcional en `ControlDeBatalla` si sale limpio
   (simplificación 5). Fuera la guarda que nunca salta de `escala()` o la
   conversión va donde se lee `data-escala` (simplificación 16).
7. `pasoDelRecorrido` sin la comprobación de vuelo duplicada en `cargaDesde`
   (simplificación 14).

### Eficiencia
8. Recorridos sin claves de texto (eficiencia 1): el atacante en el suelo recorre
   con un conjunto cerrado (los muros), sin función de paso; la función de paso
   solo cuando arranca arriba, y trabajando con índices (un `Uint8Array` de muros
   por índice en la caché de la muralla).
9. Línea de tiro cacheada (eficiencia 2): la visibilidad entre casillas es fija
   por muralla; tabla perezosa por índice en la caché de la muralla.
10. La IA no recalcula lo que ya dio `legalActions` (eficiencia 3, 4): `aTiro` de
    los `shoot` de `acciones` y solo para tiradores; en `legalActionsAndCosts`, el
    nivel por casilla alcanzable una vez, fuera del bucle de enemigos.
11. La caché `DISTANCIAS` no guarda consultas que dependen de la ocupación
    (eficiencia 5): `asaltoALaMuralla` llama a `distanciasDesde` directamente (o se
    cachean los pies estáticos y se filtran los ocupados).
12. `move` que más acerca: una función `mejorMovimiento(acciones, medida)` para los
    tres bucles de `tactics.ts` (reutilización 8, simplificación 9).

### Cliente
13. `pintarColumna` reutiliza el `camino` de `hexesDe` con `translate(0, -alto)`
    (reutilización 4, eficiencia 7); `pintarPuertas` indexa con `indiceDe`
    (reutilización 5); `alturaEnElCamino` usa `tramoEn` (reutilización 3); el
    `ALTO_DE_FIGURA[...]` de `climbed` comparte la cuenta de `move`
    (reutilización 9); una plantilla de botón en `botonesDeEscala`
    (reutilización 12).

## Se descarta a conciencia

- **Cachear las caras de las columnas como `Path2D`** y la unión etiquetada de
  `piezas` en vez de cierres (eficiencia 7-8, parte): ~20 columnas, coste por
  fotograma pequeño; con la tapa cacheada basta.
- **Memoizar las pruebas de impacto del ratón** (eficiencia 9): por evento, no por
  fotograma; solo si al tocar `muroBajo` sale natural.
- **`unidadEn(state, hex)` para las tres búsquedas** (reutilización 7): una es del
  cliente y las otras dos difieren (cabeza frente a cuerpo); solo si sale sin
  forzar.
- Los dos caminos del cliente para elegir el muro (botón y clic, altitud): leen
  las acciones legales, no inventan regla. El orden «subir antes que poner» del
  clic sin botón se queda (es interfaz).
