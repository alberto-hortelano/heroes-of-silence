# Hallazgos de QA — cliente nuevo, decididos por el coordinador

Veredicto de QA: apto con reservas (ver `qa.md`).

Condiciones de siempre:
- el banco no se mueve (`54a035f0…`);
- `pnpm verify`, `pnpm qa` y `pnpm capturas` en verde;
- en navegador se verifica con **Playwright**, sin la extensión;
- cada arreglo de comportamiento lleva su test o su paso en `pnpm capturas`, y se
  ve morder.

## Se corrigen

1. **En pantalla táctil la ruta no se dibuja nunca** (criterio 1 en móvil).
   Después de `pointerup` llega `pointerleave` y `aventura.salir()` borra la ruta.
   La que se ve no puede borrarla un `pointerleave` táctil: lo que limpie el
   *hover* no toca la ruta elegida con el primer toque.
   **Añadir a `pnpm capturas` una pasada con `hasTouch`** que compruebe que la
   ruta se pinta tras el primer toque y que el segundo la anda. Hoy el guion pulsa
   como ratón y por eso no lo vio.
2. **La batalla se lee mal con muchas unidades.** El tope de 7 por bando llega en
   la 1b; aquí solo lo que es del cliente:
   - El hueco negro de arriba (el cielo de `campo.webp` es transparente) se rellena
     con un degradado o un fondo coherente con la escena. El tablero tiene que
     ocupar más alto útil.
   - Fuera las chapas de nombre sobre cada figura (`Cam`, `Esq`…): el nombre sale
     en el panel, al pasar el ratón y en la unidad activa. Se queda la barra de
     vida, que no debe taparse con la de la fila de detrás.
3. «Espera a que termine la jugada.» se borra de la barra cuando acaba la
   animación.
4. **Un clic sobre un hex alcanzable que tapa una figura enemiga ataca en vez de
   mover** (29 de 1011 hexes). Si el punto cae dentro del hexágono alcanzable,
   cerca de su centro, gana el hex; la figura gana en el resto de su caja. Hace
   falta un test que reproduzca uno de esos 29 casos.
5. **Móvil en batalla:**
   - la barra fija no puede tapar los hechizos (hueco inferior igual a su alto);
   - al empezar la batalla, una pista de que el enemigo está a la derecha: el
     desplazamiento inicial, o un indicador en el borde.
6. En las fichas de coste del castillo la última cifra se sale de la chapa. La
   chapa se mide por su contenido.
7. Pulsar la casilla del propio héroe dice «No hay camino hasta ahí.». Tiene que
   decir algo verdadero, o seleccionar al héroe.
8. Dos pulsaciones rápidas de Espacio pasan dos días. «Fin de turno» se ignora
   mientras no sea el turno de la persona o haya animación o transición en curso.
   Hace falta test.

## Se aplazan, a issue (taller de imágenes)

- Arqueros contra arqueros con el mismo atlas: solo el aro los distingue. Lo
  arregla el arte por facción del taller.
- Los botones «− / Centrar / +» pueden tapar el final de la ruta: menor, y va con
  el rediseño del mapa de nodos (fase 2).
- 27 por bando sin probar: la 1b pone el tope en 7 y lo hace irrelevante.
