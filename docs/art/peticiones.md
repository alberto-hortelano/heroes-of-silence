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
