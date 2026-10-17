# Sin compatibilidad hacia atrás

## Petición literal (14-10-2026)

> No queremos mantener compatibilidad hacia atras, estamos en pleno desarrollo

Llegó al cerrar las cinco tareas de la arena (#258–#263). Dos de los hallazgos pendientes del QA eran de leer enlaces viejos: el aviso de la armadura de antes y una pieza antigua con muchos PV.

## Decisiones del usuario

| Pregunta | Respuesta |
|---|---|
| El borrador del usuario, `data/borradores/unidades.json` (formato viejo) | **Convertirlo una vez y guardarlo.** Ya está hecho: el coordinador lo pasó por las conversiones de hoy y lo reescribió. Las 12 unidades son válidas y no dan avisos. El original está en el scratchpad. |
| Un enlace `?montaje=` viejo | **Se rechaza diciendo que es viejo.** El número de versión del enlace se queda solo para decir «este enlace es de una versión anterior: vuelve a copiarlo». Nada de conversiones ni avisos. |

## Qué se quita

Todo lo que existe solo para leer formatos anteriores de la arena. Lo que encontró el coordinador (`src/core/arena.ts`, 3 287 líneas):

- **El enlace**:
  - las versiones del 1 al 8 de `montajeDeLaURL`;
  - los umbrales con nombre: `CON_MURALLA`, `CON_EQUIPO`, `CON_PIEZAS`, `CON_ARMAS`, `SOLO_LA_ARENA`, `CON_ARMADURA` y los que haya;
  - `PerfilDe` y `perfilDeLasHojas`, si solo los usan los enlaces del 1 al 4;
  - `piezasDelEnlace` en lo que sea de antes;
  - los campos de enlaces viejos (`CAMPOS_DEL_ENLACE_7`…);
  - las pruebas del catálogo escaladas.
  Queda **una sola versión**, la de hoy, leída estricta, y una frase para la que no lo es.
- **Unidades y piezas**:
  - `migrarUnidadDeArena`, `loDeAntes`, `piezaDeAntes`, `piezaDeAntesDeLaMunicion`, `piezaDeAntesDeLasArmas`, `cuerpoSinElKit`, `KIT_DEL_CICLO_2`, `mismasCifras` y `conLaArmaduraEnPV`, si solo sirven para esto;
  - `CAMPO_DE_LA_ESCALA_VIEJA` (`level`);
  - `armasEnSuHueco`;
  - `UnidadMigrada` y `seRetiran`;
  - el aviso de la armadura de antes (`avisoDeLaArmaduraDeAntes`);
  - las conversiones de PV a armadura (`armaduraDePV`, `pvDeLaArmadura` y `PV_POR_PUNTO_DE_ARMADURA`), si solo las usa lo de antes;
  - el aviso de «Duplicar» una pieza del juego con PV (`avisoDeLaCopia`) se queda si sigue haciendo falta: una pieza del juego duplicada como nueva de la arena sigue pasando de PV a armadura. Eso no es compatibilidad, es la regla de hoy.
- **El borrador**: `revisarBorradorDeArena` y `revisarBorradorDeEquipo` (en `tools/arena/borrador.ts`) leen el formato de hoy y nada más. Lo que no vale se trata como cualquier unidad o pieza que no vale hoy: se lista como inválida con su motivo y se conserva al guardar.
- **La pantalla**: el recuadro «Avisos al leer» (`renderAvisosDeLectura`) se queda solo si quedan cosas que decir al leer (unidades o piezas que no valen). Si no queda nada, fuera.
- **Tests**: los de lectura de enlaces y borradores viejos, sus fixtures y las pasadas de `capturas.ts` que abren enlaces viejos.
- **Docs**:
  - En `CLAUDE.md`, las filas y párrafos que describen la lectura de lo de antes («Lo de antes de la arena», las versiones del `?montaje=`, `migrarUnidadDeArena`…) se reducen a «un enlace de otra versión se rechaza».
  - En `docs/historia.md`, una entrada con el porqué: la cita y la fecha.
- Busca si hay más compatibilidad hacia atrás fuera de la arena (cliente, servidor, `tools/`): una clave vieja de `localStorage`, un formato viejo de `data/`… Quítala igual y dilo. **El contrato del agente y el juego no se tocan**: el banco tiene que dar el mismo hash.

## Criterios de aceptación

1. **Un enlace de la versión de hoy** se monta igual que antes. Uno de otra versión se rechaza con «este enlace es de una versión anterior: vuelve a copiarlo» (o parecido), sin montar nada y sin lanzar.
2. **El borrador del usuario**, ya convertido, se lee sin avisos y monta las 12 unidades.
3. **Un borrador con una unidad en formato viejo** (p. ej. un arco en `arma`, o `level`) sale como inválida con un motivo claro, y «Guardar» la conserva. No se convierte.
4. **El juego no cambia**: `pnpm banco` da `066767b4179e0f617e21107148184ce052fff9ae7f16bbb4881b12a3218af995`.
5. `pnpm verify` y `verify:lento` en verde, y `pnpm capturas` (las pasadas de la arena) sin errores de consola.
6. **El número de líneas que se van**, dicho en `implementacion.md`.

## Fuera de alcance

- Cambiar reglas o formatos de hoy.
- El juego, el agente y el servidor, salvo compatibilidad vieja que aparezca allí.
- Las issues #264, #265 y #266.

## Contexto

- **Rama de integración**: `claude/combat-decision-system-88e11e`, en verde.
- **Servidor del usuario en el puerto 3187**: sirve esta carpeta y no se toca.
- **`data/borradores/`**: es del usuario y no se toca. Si una pasada de capturas lo aparta, se comprueba su sha256 antes y después.
