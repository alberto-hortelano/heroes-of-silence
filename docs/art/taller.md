# El taller de imágenes

Genera el arte con **ChatGPT por la suscripción**, a través de Codex CLI. Nunca
fal.ai, nunca `pnpm gen -- --go`, nunca una API de pago.

```bash
npx tsx tools/art/poses.ts --todos          # referencias de pose del Y Bot (render local)
pnpm taller encolar templario-escudo        # la lámina de identidad
pnpm taller                                 # trabaja hasta vaciar la cola
pnpm taller encolar templario-escudo --atlas
pnpm taller
pnpm taller corregir templario-escudo-atlas "el escudo va en el brazo izquierdo"
pnpm taller estado
pnpm taller encolar --rehacer templario-escudo   # vuelve a pedir lo ya hecho
pnpm taller retirar <id>                    # borra un pendiente que ya no vale
pnpm taller devolver <id>                   # de en-curso/ o fallido/ otra vez a pendiente/
pnpm taller derivar assets/unidades/<id>/atlas.webp
```

## La cola

`tools/taller/cola/{pendiente,en-curso,hecho,fallido}/<id>.json`, fuera de git.
El estado de un encargo es la carpeta en la que está, y tomarlo es un `rename`
atómico: pueden correr varios `pnpm taller` a la vez sobre la misma cola. Un
fallo no para la cola: el encargo va a `fallido/` con el motivo.

## Qué hace con cada encargo

1. Pasa las referencias a PNG y lanza `codex exec` con ellas **en su orden**. El
   prompt lo compone el taller: antepone el papel de cada imagen («la imagen 1 es
   la REFERENCIA DE POSE…, la imagen 2 es la IDENTIDAD DEL PERSONAJE…») y añade
   las reglas del tipo (rejilla, cámara a 25°, nunca de perfil, fondo
   transparente). Un atlas que no lleve la pose primero y la identidad después no
   entra en la cola.
2. Recoge el PNG de `~/.codex/generated_images/<hilo>/`.
3. **Recorta el halo**: ChatGPT devuelve el cuerpo con alfa 240-254 y un borde
   tenue. Lo tenue conectado al borde de la imagen pasa a 0 (relleno desde los
   bordes, no umbral) y el cuerpo pasa a opaco.
4. Si es un atlas, **busca las figuras** en vez de fiarse de una rejilla que la
   herramienta no respeta, las escala con un solo factor para toda la hoja y las
   coloca con los pies en `FIGURA.base`. Si una fila no tiene siete figuras, lo
   dice.
5. Valida con sharp (tamaño, cuerpo opaco, sin halo suelto, nada tocando el borde
   de su celda), escribe el WebP, **deriva** el JSON y escribe la procedencia.

Que el taller dé por bueno un encargo es una condición técnica, no la
aceptación: esa la da el usuario mirando capturas dentro del juego.

## Las referencias de estilo

`assets/art/<facción>/<unidad>.png` son las láminas de referencia que fijan el
estilo de cada unidad (decisión del usuario, 01-10-2026), con sus prompts en
`assets/art/prompts.json`. Están dibujadas de frente y a la altura de los ojos,
así que mandan en el aspecto y el acabado, nunca en la cámara ni en la pose.
Existen para que **la animación siga ese estilo**:

| Encargo | Imagen 1 | Imagen 2 | Imagen 3 |
|---|---|---|---|
| lámina de identidad a 25° | pose del Y Bot | lámina de `assets/art/` (identidad) | — |
| atlas | pose del Y Bot | lámina de identidad a 25° | lámina de `assets/art/` (estilo) |

El atlas de Liora ya no es referencia de nada.

## Las referencias de pose

`tools/art/poses.ts` renderiza el rig `y_bot` con sprite-forge a la cámara del
juego (`tactical_25`: ortográfica, 25° hacia abajo, dirección 2 de 8). Un perfil
es qué clip hace de ataque:

| Perfil | Ataque |
|---|---|
| `espada-escudo` | `sword and shield attack (4)` |
| `dos-manos` | `sword and shield slash` |
| `baston` | `sword and shield casting` |
| `arco` | poses de brazo escritas sobre el rig (no hay clip de arco) |

`liora-walk-v2` está rechazado: no se usa como referencia.
