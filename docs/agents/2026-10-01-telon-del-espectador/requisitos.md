# El espectador cuenta cada batalla en orden y llega al final de verdad

Arreglo corto y aislado. Viene de la segunda pasada de QA de la 1b, hallazgos H-7
y H-8 de `docs/agents/2026-10-01-tropa-de-individuos/qa-1b.md`, sección «Segunda
pasada». El usuario eligió hacer el commit de la 1b (`89418c9`) y corregir esto
aparte.

## El fallo

Con un agente rápido, el telón (`src/client/espectador/telon.ts`) aplica de golpe
todos los fotogramas que aún no han terminado. El animador recibe entonces la
batalla entera en el fotograma final y la repite desde el principio, a unos
520 ms por paso. Mientras tanto:

- el panel ya dice «Fin: gana el atacante»;
- el tablero muestra muertos de pie con la barra de vida vacía;
- el espectador acumula retraso: enseña el fin de partida **22 s** después de que
  el servidor emita `game_over`.

QA leyó además un riesgo en el código, sin reproducirlo: si el último fotograma de
la cola ya es de otra batalla, `numeroDeBatalla` no sube y la segunda batalla
podría animarse con las posiciones y las caídas de la primera.

La corona del comandante es pequeña y queda tapada por la etiqueta del nombre (H-8).

## Criterios de aceptación

1. **Los fotogramas se reproducen en orden y sin saltos.** El espectador consume
   la cola fotograma a fotograma. Si se queda atrás, **acelera** la reproducción
   (o comprime los pasos ya viejos) en vez de aplicarlos todos de golpe y
   repetir. La identidad de cada batalla viaja con el fotograma o se deriva de
   forma que dos batallas seguidas nunca se mezclen. Un test lo prueba con dos
   batallas consecutivas en la cola.
2. **El texto de fin no se adelanta al tablero.** «Fin: …» y la línea de la
   rendición solo aparecen cuando el animador ha pintado el último golpe. Después
   el final se ve el tiempo mínimo que ya existe, y se pasa al mapa.
3. **El retraso está acotado.** Con la política rápida de `pnpm qa`, el espectador
   enseña el fin de partida a pocos segundos del `game_over` del servidor, no a
   22. Se mide y se apunta.
4. **La corona se ve siempre**: más grande, y sin que la etiqueta del nombre la
   tape.
5. **`pnpm capturas` lo vigila de verdad:**
   - comprueba el **tablero** en el final y no solo el texto (ninguna figura
     muerta en pie cuando sale «Fin»: lo verifica con el estado espejo o con los
     píxeles);
   - sigue al espectador hasta el mapa o el fin de partida, y falla si no llega
     dentro de un plazo.

   Se ve morder volviendo al telón de antes.

## Fuera de alcance

El servidor no se toca; tampoco el núcleo ni el banco (`957a2486…`, intacto). El
cliente que juega no cambia.

## Verificación

`pnpm verify`, `pnpm qa` y `pnpm capturas`. En el navegador, solo con Playwright.
