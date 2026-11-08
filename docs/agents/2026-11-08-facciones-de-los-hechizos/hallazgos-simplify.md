# Hallazgos de /simplify (coordinador, 08-11-2026)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el diff del ingeniero.

## Aplicados

1. **La ficha repetía la regla del poder** (`client/arena/paneles/ficha.ts`; lo vieron tres):
   llamaba a `poderDeUnidadBlocker` y luego a `problemasComoPoder` para elegir el rótulo.
   `poderDeUnidadBlocker` devuelve ahora `{ motivo, corto }`: la ficha pinta lo que recibe y un
   tercer motivo no diría «de otra facción» en falso. `hechizosDeUnidadesBlocker` lee `.motivo`.
2. **`problemasDeFacciones` copiaba el `case 'impide'`** (`core/magia/validar.ts`): los dos pasan
   por `problemasDeSubconjunto(v, valen, campo, vacia)`, con las mismas frases que antes.
3. **`null` como comodín de «todas»** (`hechizosDelGremio`): recibe `facciones: readonly FactionId[]`;
   la partida pasa `[town.faction]` y la arena, las medidas y las capturas, `FACTION_IDS`. Los dos
   `filter` en uno.
4. **`filaDeGrupo` genérica con la clase `.facciones` cableada**: pasa a `filaDeFacciones(h)`.
5. **Guardas `Array.isArray(h.facciones)`** en `magia.ts` y `conFaccion`: el tipo es obligatorio y
   solo lo toca `conFaccion`; fuera.

## Descartados a conciencia

- **`poner`/`conCampo` mueve la clave editada al final** (altitud): es infraestructura del editor
  fuera de este diff y cambia el «•» de todos los campos y el orden de las claves en disco: backlog
  (issue). `conFaccion` se queda, porque el orden canónico de `FACTION_IDS` lo justifica igual.
- **Un helper de casillas compartido con `impide`** en la ficha de magia: tocaría el camino de
  `impide` (hoy por `conCampo`, que añade al final); con el anterior, en el mismo backlog.
- **Nombres de facciones con `.map(NOMBRE_DE_FACCION).join`** también en `parseFaccion`: formatos
  distintos, no compensa.
- **Memoizar `hechizosDelGremio`**: el catálogo es diminuto; no es camino caliente medido.

## Verificación tras aplicarlos

`pnpm typecheck` limpio; `pnpm lint` limpio (los 10 avisos info de `tools/taller/unidades.ts` son
de antes); vitest de magia-formato, poderes, game, magia-arena, arena-edicion,
arena-cuerpo-del-heroe, arena-equipo-del-heroe, magia-disparadores, documentacion (211) y arena
(78), en verde; `pnpm banco`: ancla igual.
