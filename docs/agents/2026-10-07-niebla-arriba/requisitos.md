# Requisitos — #152, lo pintado fuera del mapa asoma sobre la niebla

## Petición
- Mandato del usuario (07-10-2026): «Sigue cerrando issues y mejorando el mapa de forma autónoma hasta que esté bien».
- Issue #152, con su síntoma, su causa y su propuesta.

## Contexto
- Los volúmenes se recortan al mapa por los lados y por abajo, pero no por arriba: así lo dice CLAUDE.md, «Se recortan al mapa por los lados y por abajo, no por arriba», y es a propósito, porque un pico de la fila 0 asoma por encima del borde.
- La niebla solo cubre el rectángulo del mapa.
- Las decisiones del usuario que siguen en pie: los volúmenes se pintan también sobre lo no explorado y la niebla los tapa después; lo que asoma por encima de lo explorado es la copa de una formación cuya raíz sigue en la niebla (aceptado por el usuario); lo horneado, no.
- En paralelo: #159 toca `pintar.ts` (las caras) y #161 el núcleo. No toques las caras.

## Criterios de aceptación
1. En 3840×2160, al tope de alejar, con `?seed=1`, no asoma nada de una casilla sin explorar por encima del borde superior del mapa.
2. Lo que asoma por encima del borde superior desde una casilla **explorada** de la fila de arriba se sigue viendo.
3. Capturas antes y después, en el cliente real con Playwright sin pantalla. Mismo caso en el espectador, si aplica.
4. Los fps no cambian de forma apreciable.
5. Un test que muerda.
