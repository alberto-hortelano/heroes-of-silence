# Requisitos: el mapa con la misma nitidez en el zoom máximo

## Petición literal

> Algo de la optimizacion del mapa no funciona, se ven algunas partes borrosas y contrasta con otras que se ven muy claras, asegurate de que todo tenga la misma calidad con el zoom al maximo. Una cosa que veo borrosa es el suelo con una roca que he identificado como cuberta-rough/2.webp Creo que al fusionar el suelo en imagenes se pierde definicion. Vamos a optimizar para el zoom maximo

## Contexto (del coordinador)

- Viene del ciclo `2026-10-04-escena-del-mapa` (commit `ba057bd`): suelo fijo pintado una vez por partida en un Worker y volúmenes pintados a cada fotograma en píxeles de dispositivo.
- Diagnóstico probable, que el arquitecto debe confirmar midiendo:
  1. **El suelo se pinta a `PX_DEL_SUELO` = 72 px por casilla** (`render/escenario/superficie.ts`) y la cámara llega a `TILE_MAX` = 110 px CSS (`render/camara-mapa.ts`) × dpr. En la pantalla del usuario (1983×1053 CSS, dpr ≈ 1,09) eso es ≈ 120 px de dispositivo: el suelo se amplía ×1,5-1,7. Todo lo que va al suelo —texturas, relieve, caras de roca, agua, sendas y la **cubierta baja** por debajo de `UMBRAL_DE_VOLUMEN` (0,6 casillas), como `assets/mapa/modulos/cubierta-rough/2.webp`— sale borroso. Los volúmenes se pintan desde su arte original y salen nítidos: de ahí el contraste.
  2. **`PIXELES_DEL_MAPA` = 1,5 M** (`render/mapa.ts`) baja la densidad de todo el lienzo en pantallas mayores. El lienzo del usuario pasa de 1,5 M píxeles de dispositivo, así que también le afecta. Se puso por fps al tope de ALEJAR (39 fps en 4K frente a 7), no al acercar.
  3. Comprobar también que el arte de origen tenga resolución suficiente para el zoom máximo (texturas de 512 px; módulos de cubierta de ~120-180 px). Si algún arte es más pequeño que lo que se pinta a 120 px por casilla, decirlo: eso es un pedido de arte y no se arregla en el render.
- Ahora el suelo se pinta en un Worker, así que pintar más caro no congela el hilo principal. Aun así, el criterio de QA del ciclo anterior sigue en pie: ninguna tarea larga de más de ~100 ms en el hilo principal.
- El usuario **pide optimizar para el zoom máximo**. Al alejar se acepta que la calidad baje, siempre que no se note un salto feo.

## Criterios de aceptación

1. **En el zoom máximo** (`TILE_MAX`), en la pantalla del usuario (1983×1053, dpr 1,09) y en 1920×1080 dpr 1, el suelo se pinta **sin ampliar**. La resolución efectiva del suelo en píxeles de dispositivo por casilla debe ser ≥ la de la cámara, o la del arte de origen si esta es menor. Lo mismo vale para la cubierta baja (`cubierta-rough/2.webp` incluido) y para los volúmenes. Hay que demostrarlo con una cifra por capa y con capturas recortadas de antes y después, a 1:1, en la semilla 1 y en otra.
2. **Misma calidad en todas las capas** en el zoom máximo: comparando a ojo, ninguna capa (suelo, cubierta baja, caras de roca, sendas, volúmenes, figuras) se ve visiblemente más blanda que otra. Las capturas lo enseñan.
3. **Si el presupuesto de píxeles (`PIXELES_DEL_MAPA`) se mantiene**, no debe rebajar la densidad en el zoom máximo en pantallas de hasta 2560×1440 dpr 1 y en la del usuario. Si en pantallas mayores tiene que rebajarla, se dice con la cifra.
4. **Rendimiento:**
   - fps quieto y arrastrando, en el zoom máximo y en el tope de alejar, en 1920×1080, en la pantalla del usuario y en 3840×2160;
   - tabla de antes (`ba057bd`) y después;
   - al tope de alejar no se empeora de forma apreciable respecto a `ba057bd`;
   - ninguna tarea larga de más de ~100 ms en el hilo principal al cargar ni al hacer zoom (`PerformanceObserver` `longtask`);
   - la memoria total del suelo (MB) se publica antes y después.
5. **El cambio de zoom no da saltos feos.** Si hay varias resoluciones del suelo, el paso de una a otra no se ve como un parpadeo ni como un hueco de suelo sin pintar más de un instante, y mientras tanto se ve la versión anterior.
6. El cliente, el espectador y el taller pintan lo mismo (el taller con la misma `separar`/`pintarSuelo`).
7. `pnpm verify`, `pnpm banco` con el ancla igual (`1b90bfd9…`; es solo cliente), `pnpm qa` y `pnpm capturas` en verde. Se actualizan `CLAUDE.md` («Mapa de aventura») y `docs/historia.md`.

## Fuera de alcance

- Generar arte nuevo. Si algún arte de origen no llega a la resolución del zoom máximo, va a `docs/art/peticiones.md` o a un issue, no a este ciclo.
- Cambiar `TILE_MAX` para disimular el problema (acercar menos), salvo que el usuario lo decida en el punto de control.
- Cambiar qué es suelo y qué es volumen (`UMBRAL_DE_VOLUMEN`), salvo que el arquitecto lo proponga como la solución y el usuario lo apruebe.
- El núcleo.

## Preguntas abiertas (con la suposición por defecto)

- **¿Suelo por trozos a la resolución de la cámara, suelo entero a más resolución, o subir la cubierta baja a la capa de volúmenes?** La decide el arquitecto midiendo memoria, tiempo y fps, y se la presento al usuario. Por defecto, la que dé la nitidez del criterio 1 con la menor memoria.
- **¿Qué hacer con `PIXELES_DEL_MAPA` al acercar?** Por defecto, que el presupuesto dependa del zoom o se mida de nuevo para que no afecte al zoom máximo en la pantalla del usuario.

## Decisiones del usuario en el punto de control (2026-10-05)

- **Plan aprobado tal cual:**
  - el suelo entero a 120 px por casilla, con un esbozo a 60 px que se pinta antes;
  - densidad plena al acercar, con el presupuesto según el zoom;
  - la caché de copias sube a 80 MB;
  - las copias nuevas por fotograma se acotan por píxeles.
- **Aceptado:**
  - +53 MB de suelo y hasta +40 MB de caché;
  - el suelo nítido llega unos 5,5 s después del esbozo, sin congelar.
- **4K a dpr 1 se queda como hoy** (densidad 0,46, unos 35 fps).
- **Los 13 módulos de volumen** que no llegan a 120 px por casilla se apuntan en `docs/art/peticiones.md`.
