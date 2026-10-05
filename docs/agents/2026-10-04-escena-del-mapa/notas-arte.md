# Notas de la sesión de arte para separar suelo y volúmenes (04-10-2026)

La sesión de arte está de acuerdo con el `git mv` a `src/client/render/escenario/`. No tocará esos ficheros hasta que se le avise y haya fusionado `main`.

## Sprites medidos

Son los de la semilla 1 en 34×34: 7 006 sprites sin contar las nubes. Las alturas van en casillas.

| Tipo | Sprites | Alto |
|---|---|---|
| masa (árboles y picos de franja) | 869 | mediana 1,14 |
| objeto | 79 | — |
| muro | 36 | — |
| pared (cara de acantilado) | 83 | — |
| caras de roca (rectángulos de textura) | 42 | — |
| cubierta | 4 869 | mediana 0,46; 933 pasan de 0,6 (los arbolillos de bosquecillo) |
| roca | 545 | mediana 0,39 |
| orilla | 479 | máximo 0,42 |
| nube | 46 | en el borde |

## 1. Qué va en cada fotograma

- **A la superficie fija del suelo** van la cubierta baja, las rocas y la orilla. Son unos 5 000 sprites, casi todos de menos de 0,5 casillas de alto, y apenas tapan a una figura.
- **A cada fotograma** van la masa, el muro, la pared, las caras, los objetos y la cubierta alta (alto > 0,6, unos 950). En total son unos 2 000, y bastantes menos con el recorte de cámara.
- El umbral es un parámetro. Con fidelidad total, todo iría al fotograma.

## 2. La clave de profundidad ya existe

- `Sprite.y` es la `y` de la **base** en casillas, donde se apoya el ancla (el centro de la base).
  - Una pieza en la casilla (x, y) lleva y ≈ y+0,5…y+0,95.
  - Los objetos llevan y+0,85.
- Las caras de roca se ordenan con la clave `f.y + 1 − 0,01`, porque cuelgan de la casilla alta hacia la de abajo.
- Para mezclarlas con las figuras, cada figura usa la misma convención: la `y` de sus pies en casillas, no la casilla entera.
- Hoy el empate se resuelve por `x`.

## 3. Qué va a la superficie del suelo

- **Las capas 1-6 de `pintarEscena`**:
  - el suelo fundido, la sombra por nivel, las sendas, el agua con barro y espuma, y los cantos;
  - la sombra difusa al pie de cada sprite. La de un objeto que se filtra con `objeto` se filtra igual; ya lo hace con `seVe`.
- **Las capas 8 y 9**:
  - las luces y la niebla baja van a otra superficie fija encima de todo, o se quitan;
  - las nubes y la viñeta quedan fuera.

## 4. Coste por fotograma

- Los módulos están a tamaño nativo, hasta ~1 700 px de ancho, y algunos llevan **tono**: un filtro que hoy se cachea por imagen y tono.
- En cada fotograma conviene pintar desde copias ya reducidas al tamaño de pantalla y ya entonadas, una por (src, tono, escala). Es lo que hace `decoracionDe` con «una vez por tamaño».
- Escalar 2 000 `drawImage` desde 1 700 px en cada fotograma es lo caro.
- El monstruo usa un recorte sobre el atlas de la unidad. Si los monstruos los pinta el juego, se filtran con `objeto`.

## 5. Forma propuesta para la `Escena` (la decide la sesión de reglas)

- `suelo`: lo de hoy, menos los volúmenes.
- `volumenes`: `readonly { clave: number; s: Sprite } | { clave: number; cara: Cara }`, ya ordenado por clave.
- `pintarSuelo(ctx, escena, o)`.
- `pintarVolumen(ctx, v, o)`, con el mismo `imagen` y `tono`.
- `pintarEscena` se queda como la composición de las dos, para el taller. La página del taller sigue siendo el banco visual y tiene que salir idéntica píxel a píxel.

La sesión de arte se ofrece a hacer ella la separación, que es pura, después del `git mv`, en su rama y sobre la ruta nueva.
