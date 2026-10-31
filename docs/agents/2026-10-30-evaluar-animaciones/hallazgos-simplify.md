# /simplify: hallazgos consolidados y decisión (30-10-2026)

Cuatro revisores: reutilización, simplificación, eficiencia y altura. Aquí van los
hallazgos sin repetir y lo que se decidió en cada uno.

## Se aplican

1. **[Fallo] Las versiones `esqueleto` y `todo` piden «editadas una a una».**
   `reglasDeAtlas` (`encargo.ts`) elige `FILAS_DE_UNA_EDICION` siempre que hay
   `ocho.pose`. Desde la retirada de `experimento.ts` nada produce ya los papeles
   `editar`, `editar-silueta`, `editar-maniqui` ni `profundidad`.
   - Se borran los papeles de edición, `FILAS_DE_UNA_EDICION`, `FILAS_SOBRE_EL_MANIQUI`, la
     rama `edita` del `superRefine` y sus ramas de `flatten`.
   - Las filas son siempre `FILAS_OCHO`.
   - `ocho.pose` pasa a significar solo «el maniquí contra el que se escala», y es
     obligatorio si y solo si la primera referencia es `pose-esqueleto`.
   - Un test que muerda: el prompt de una versión `esqueleto` lleva las filas de
     `FILAS_OCHO`.

   Las 8 pinturas `esqueleto` y `todo` del piloto se repiten (las de «otra tirada»
   valen).
2. **Qué papel es una pose, en un solo sitio.** `esDePose(papel)` en `encargo.ts`, y si
   hace falta también qué fondo lleva al aplanarse. Lo leen `encargo.ts`, `trabajador.ts`,
   `fal.ts` y `revision/maniqui.ts`, que hoy usa `startsWith('pose')`.
3. **Un único `correrCodex(args, prompt, cwd)`** para `generar` y `juzgarConCodex`
   (`codex.ts`).
4. **Las cifras muertas.**
   - Fuera `import medir`, `cifras_en_texto` y `medidas`, `deriva` y `texto` de
     `cifras.json` (`vision.py`).
   - Se borra `medir.py` si nadie más lo usa.
   - Fuera `{{CIFRAS}}` de `juez.md` y su reemplazo en `revisar.ts`.
   - `pose.estimar` se queda.
   - Fuera también `maniqui_al_atlas` de `calibracion/sinteticos.py`, que nadie llama.
5. **Esquemas.**
   - `omitidos` pasa a ser `z.array(hallazgoSchema)` y `unidoSchema.hallazgo`, un
     `hallazgoSchema` sin cast.
   - Un `leerUnion(dir)`.
   - `leerHuesos` usa `validarCon`, igual que `cifrasDe`, `imagenesDe` y los parses de
     `jurado.ts`, para que el error lleve la ruta.
   - Un `leerSiHay(esquema, ruta)` exportado desde `esquemas.ts` para los «JSON si existe».
6. **La regla «este esqueleto vale», una vez.** En `revision/maniqui.ts`:
   - `huesosVigentes(carpeta, d, h)`, que devuelve el esqueleto o el motivo;
   - `troncoDe(celda)`;
   - `marchaHaciaAtras(huesos)`.

   Los usan `revisarElManiqui`, `maniquiBlocker` y `escalaDePose`, que queda en pocas
   líneas y apunta en la procedencia el motivo verdadero por el que no se recolocó. La
   compuerta puede devolver lo ya validado para no leerlo dos veces.
7. **El `sha256`, uno solo:** el de `poses-8d.ts`. Fuera los locales de
   `revision/maniqui.ts`, `versiones.ts` y el `createHash` en línea.
8. **`carpetaDeManiqui(id)`** en `trabajador.ts:1435`, en lugar de escribir la ruta a mano.
9. **La hoja del maniquí, decodificada una vez por hoja** (`alfaDeLaHoja`, con `aRaster`).
10. **`porRejilla`** se apunta en un solo sitio de la procedencia.
11. **C1 en `empaquetar.ts`, más legible:** un `dentro(v, tam)` y el sitio dentro de cada
    pieza, sin casts ni mutaciones. El resultado es el mismo, así que el test de C1 y
    `taller.test.ts` deben seguir en verde.
12. **Parámetros sin uso:**
    - `TrabajoDePaneles.hojas` y `fps`, con la rama `hojas` de `clips_de`;
    - `fotogramas` de `promptDeComparacion`, que pasa a usar `FIGURA.columnas`;
    - el `7` y el `8` fijos de `versiones.ts`, que pasan a `FIGURA.columnas` y
      `NOMBRES_DE_DIRECCION.length`.
13. **Abaratar sin cambiar resultados:**
    - `paneles.fuente`, con `lru_cache`;
    - en `encuadre.ts`, la luz y la ventana una vez por fotograma;
    - en `vision.py`, memoizar `_maniqui` y `datos.direccion` por clave.
14. **`--clips=`** de `revisar` se lee con `bandera()` de `tools/argumentos.ts`.

## Se descartan, a conciencia

- **`PAPELES` como tabla de propiedades** (texto, fondo, silueta, si pide `ocho.pose`).
  Con el 1 y el 2 la lista de poses ya vive en un sitio y los papeles de edición
  desaparecen; la tabla entera es un cambio de infraestructura mayor que lo que pide este
  ciclo. Queda en el backlog.
- **Un localizador único del maniquí de un encargo**, y declarar los montados sin
  esqueleto donde se elige su pose. Es correcto, pero toca `unidades.ts`, `npcs.ts` y
  `poses.ts`; el 6 quita la triple copia más dañina. Queda en el backlog.
- **Apuntar siempre los huesos en el render normal** (sin `--huesos`). Cambia el contrato
  de `pnpm taller maniqui`, y `--huesos` ya demuestra que la hoja no cambia. Se propone al
  usuario para después.
- **Cortar siempre por bandas en `empaquetar`.** Movería el empaquetado de hojas que hoy
  salen bien, y habría que compararlo contra todas. `porRejilla` se queda como respaldo.
- **El muñeco en una sola fuente (TS → Python)**, y pasar al Python el bucle, el ancla y
  las columnas. Tiene sentido, pero exige cambiar el contrato de `vision.py` justo antes
  del piloto. Se apunta como deuda: si cambia un color o un clip, hay que cambiarlo en los
  dos lados.
- **Paneles y comparaciones asíncronos** (`spawn` en vez de `execFileSync`, todo en un
  proceso), y el sello del ONNX en lugar del hash. Ahorran minutos frente a horas de Codex
  y cambian la orquestación. Se dejan para cuando el flujo se pase por el catálogo entero.
- **NCC con `cv2.matchTemplate`.** Desaparece con el 4: ya no hay NCC en Python.
- **La caja local del atrezo una vez por malla en `apuntarHuesos`.** Es barato y está en
  `poses.ts`, que acaba de rehacer 46 esqueletos byte a byte. No se toca ahora.
