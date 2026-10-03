# Requisitos — mapas densos: fronteras gruesas y variadas, obstáculos y caminos

## Petición literal (03-10-2026)

> Vamos a mejorar los mapas. Empezaremos con una base con colores distintos que
> representen diferentes accidentes geograficos y elementos del mapa, usa tambien
> los iconos y los tiles que ya hay para que se vea un poco mejor pero eso es
> temporal. Las zonas tienen que estar separadas por nodos y solo se puede pasar de
> una a otra a traves de un nodo, aunque habra una habilidad llamada infiltracion
> que permitira entrar por otras partes. Los nodos suelen ser poblaciones o
> fortalezas defendidas aunque cuando no son de ningun jugador pueden estar vacios.
> La separacion de zonas tiene que quedar claramente marcada y son montañas, bosque
> denso, acantilados, muros, desniveles... Variado y adaptado al tipo de terreno de
> la zona. El resultado es una especie de rejilla irregular donde las lineas de la
> rejilla son accidentes que dificultan el paso. Por otro lado habra una rejilla
> similar pero de caminos conectando los lugares interesantes. Ahora mismo el mapa
> es un espacio plano con cosas. Hay una imagen de referencia en [Image #1]. Si te
> fijas esa imagen esta llena de cosas y las zonas estas separadas por rios,
> desniveles, bosques, cordilleras... Eso es lo que buscamos. Tu tarea es que los
> mapas se generen con esa densidad de elementos y luego generaremos los assets
> necesarios para construirlos

Imagen de referencia: `assets/art/mapas/Imagen de ChatGPT 3 oct 2026, 10_05_01.png`.

## Decisiones del usuario (preguntadas en la conversación)

1. **Los obstáculos de dentro de una región bloquean el paso** (como HoMM2), no son
   solo decorado.
2. **Fronteras de 2-3 casillas, y se vuelve a medir el lado del mapa** con la regla de
   siempre: el menor lado con mediana ≥ 8 días, p90 ≤ 20 y 0 sin terminar en 1 000
   semillas (se puede iterar con 100; la decisión final con 1 000).
3. **Los tipos de barrera son distintos en el motor** (no solo al pintarlos):
   prepara la infiltración, que podrá cruzar unos y otros no.

## Diseño aprobado por el usuario (punto de partida para el arquitecto)

Ver `/home/al/.claude/plans/vamos-a-mejorar-los-encapsulated-zephyr.md`. Resumen:
terrenos nuevos no pisables `forest`, `cliff`, `wall` junto a `mountain` y `water`;
tabla en datos de qué barrera va entre qué suelos; suelo de región entero; fronteras
gruesas e irregulares con nodos en el centro y corredores abiertos hacia cada región;
obstáculos interiores con densidad objetivo sin partir la región ni aislar objetos;
red de caminos generada; colores por barrera y arte existente en el cliente
(`assets/mapa/*`, celdas del atlas, `assets/generated/terrain/*.png` como textura
temporal); lista de assets pendientes en `docs/art/peticiones.md`.

## Criterios de aceptación

1. Los mapas del generador separan las regiones con fronteras de **al menos 2
   casillas** de grosor (salvo en los corredores de los nodos), de grosor variable.
2. Las fronteras usan **al menos cuatro** tipos de barrera distintos en el motor
   (`mountain`, `water`, `forest`, `cliff`, `wall`), y el tipo depende del suelo de
   las regiones a los lados (tabla en `data/`). En 200 semillas aparecen los cinco.
3. Solo se pasa de una región a otra por un nodo: `problemasDeRed` vacío en todos los
   planes (auditoría de `test/regiones.test.ts`, 200 semillas en el lado nuevo y 20 en
   48×48), y ningún héroe puede alcanzar otra región sin pisar un nodo.
4. Cada región tiene su suelo entero, y obstáculos interiores no pisables en una
   densidad dentro de un rango declarado en datos. Ningún obstáculo parte una
   región ni deja inalcanzable un objeto (mina, pueblo, cofre, recurso, monstruo,
   inicio, asaltante).
5. El generador pone **caminos** (`roads`) que unen los nodos de cada región entre sí
   y con sus minas y pueblos.
6. El agente puede usar los terrenos nuevos al diseñar un mapa (`map_generate`) y los
   ve en `knownMap` / tool `map`; la prosa interpola la lista. `pnpm qa` en verde.
7. El cliente pinta cada barrera con un color distinguible de los suelos y entre sí,
   con el borde de la frontera marcado; usa el arte existente (montañas de
   `assets/mapa/`, piezas de nodo, ciudad, pueblo, recursos, árboles del atlas,
   texturas de `assets/generated/terrain/`) y sin arte pinta sus marcadores. El
   espectador lo ve igual. Sin errores en consola (`pnpm capturas`).
8. `LADO_DEL_MAPA` re-medido con la regla del usuario y la tabla de CLAUDE.md
   actualizada con fecha. 0 sin terminar en el barrido.
9. `pnpm verify` verde; `pnpm banco` re-anclado con la forma del diff documentada.
10. `docs/art/peticiones.md` lista los assets que hacen falta para construir estos
    mapas (texturas por suelo, piezas de borde por barrera, puente, puerta,
    obstáculos interiores por suelo).

## Fuera de alcance

- La habilidad **infiltración** (solo se deja la identidad de cada barrera).
- Generar arte nuevo (fal.ai o codex): no se gasta nada en este ciclo.
- Cambiar la cámara del mapa a isométrica.
- Lugares interesantes nuevos con efecto de juego (ruinas, torres con función).
- Rebalancear facciones o economía.

## Preguntas abiertas (con suposición por defecto)

- ¿Los nodos en barrera gruesa deben verse distintos según la barrera (puente sobre
  agua, puerta en muro)? Por defecto: en el cliente sí, si el arte existe; si no,
  la pieza de nodo de siempre. Pasa a la lista de assets.
- ¿Coste de los caminos? Por defecto `ROAD_COST = 75` sin tocar.
- ¿El minimapa? Por defecto usa los mismos colores nuevos.

## Correcciones tras el plan (03-10-2026)

- El usuario aprueba el plan, incluida la desviación (engordar la red fina en vez de
  excavar corredores; el nodo queda en un estrechamiento de 1 casilla).
- «Los mapas actuales son muy pequeños, no hay problema por agrandarlos»: agrandar el
  lado es bienvenido. La regla de medida (mediana ≥ 8, p90 ≤ 20, 0 sin terminar) sigue
  marcando el **mínimo**; si las regiones quedan apretadas tras engordar y poner
  obstáculos, la palanca preferida es dar más área (mapa más grande o más área por
  región), no bajar `REGION_MINIMA` ni adelgazar fronteras.
- «Al menos cuatro tipos de barrera» se lee por mapa.
