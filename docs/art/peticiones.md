# Peticiones de la sesión de arte a la de reglas

Cambios fuera de lo que la rama `arte` puede tocar. Los hace la sesión de reglas.

## 1. Ids de unidad para las facciones nuevas (fase 4)

Las hojas de `assets/unidades/<id>/` usan ids provisionales (ver
`docs/art/unidades.md`). Cuando el catálogo tenga las unidades, hace falta una
tabla id-del-catálogo → id-de-hoja, o usar los mismos ids. Mientras ninguna
criatura del catálogo lleve uno de estos ids, `personajes.ts` no puede
engancharlas: `test/personajes.test.ts` exige que cada cuerpo de la tabla exista
en el catálogo.

## 2. Que `comoAtlas` exija los campos derivados (#120)

Los JSON del taller llevan `altura` y `cajaDeClic` medidos sobre la imagen.
Cuando se enganchen, la tabla `ALTURA` de `personajes.ts` y los factores de
`cajaDeFigura` de `render/batalla.ts` deberían leerlos del JSON en vez de
escribirlos a mano. `personajes.ts` sí lo puedo tocar yo al enganchar las hojas;
`render/batalla.ts` no.

## 3. Enganchar las piezas del mapa nuevo

`assets/mapa/<pieza>.webp`, en el estilo pintado oscuro que eligió el usuario
(referencia: `assets/mapa/muestras/pintado.webp`). Aprobadas el 01-10-2026.

| Pieza | Fichero | Para qué |
|---|---|---|
| Montaña infranqueable | `montana-1`, `montana-2`, `montana-3` | cordillera: alternar variantes y solaparlas para que se lea como muro |
| Nodo sin fortificar | `nodo-hito` | hito con poste vacío |
| Nodo con empalizada | `nodo-empalizada` | fortificación de nivel 1 |
| Nodo con torre | `nodo-torre` | fortificación de nivel 2 (incluye la empalizada) |
| Ciudad (punto fuerte) | `ciudad` | murallas de serie |
| Pueblo | `pueblo` | abierto, sin murallas |
| Oro, piedra, madera | `oro`, `piedra`, `madera` | recursos |

Cada pieza lleva al lado su `.json` **derivado de la imagen** (`ancho`, `alto` y
`ancla`: el centro de su base, en píxeles de la imagen), para colocarla por el
pie sin escribir cifras a mano (#120), y su `.procedencia.json`.

- **La bandera del dueño la pinta el juego** en su color, colgada del poste del
  nodo (está vacío a propósito) o sobre la ciudad. Las piezas no llevan
  estandartes.
- La escala en pantalla la decide `render/mapa.ts`. Una composición de prueba con
  la montaña a ~4 casillas de ancho, la ciudad a ~3,5, el pueblo a ~2,7, los
  nodos a 1,1-1,8 y los recursos a ~1 casilla se veía bien con las figuras a
  ~1 casilla de alto.
- `assets/rpg/map-atlas.png` (castillo, minas, árboles…) sigue en el estilo
  anterior, pixel art. El usuario dijo que no pasa nada por rehacerlo: si se
  quiere coherente, se pide al taller en el estilo pintado.
