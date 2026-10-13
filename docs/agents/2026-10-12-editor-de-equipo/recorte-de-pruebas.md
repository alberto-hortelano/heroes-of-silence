# Recorte de pruebas de equivalencia de combate (decisión del usuario, 12-10-2026)

Usuario: «se hacen demasiadas pruebas de jugabilidad, para ver si los combates se siguen resolviendo igual o cambian. Estamos en pleno desarrollo del sistema, no tiene sentido porque va a cambiar mucho» → «hazlo».

Probar reglas, no que la pelea salga igual que antes. Las líneas son orientativas (pueden haberse movido): búscalas por nombre.

## test/arena.test.ts
1. `POR_PERFIL_DE_ANTES` / `CASILLAS_DE_ANTES`: QUITAR. `deAntes()` lo usan tests de reglas (conversión de velocidad vieja, migración): REDUCIR a una unidad vieja escrita a mano con cifras cualesquiera.
2. «cada hoja por defecto pelea con las cifras de su perfil de antes, y su cuerpo es nivel 1»: REDUCIR a «toda hoja por defecto valida y su cuerpo sin equipo es nivel 1».
3. «un borrador de antes se convierte a cuerpo + el equipo de su perfil sin cambiar lo que pelea» (51 hojas): REDUCIR a una unidad: la migración pone el kit del perfil, el cuerpo es lo de antes menos el kit, y migrar dos veces no cambia nada.
4. «un enlace de la versión 4 … pelea igual que antes»: REDUCIR a la lectura (sin perfiles se rechaza con su mensaje; con perfiles se lee como cuerpo + equipo; se reescribe en la versión actual). Sin pelear ni comparar el log.
5. «va y vuelve igual, y la pelea del enlace es la misma pelea»: REDUCIR al ida y vuelta del montaje (también por URLSearchParams). Sin comparar `battle.log`.
6. «el templario con escudo y el del mandoble son el mismo índice, y pelean distinto»: REDUCIR a la relación (mismo cuerpo → mismo nivel lleven lo que lleven; el equipo cambia el combate). Sin literales 177, 3/4, [5,7,3]/[8,3,4].
7. «el criterio del usuario se cumple en lo que pelea cada hoja por defecto»: quitar los literales por hoja; dejar lo relacional (la Danzante la única a pie a 6, el jinete > 6, el de hiena > el orko, ninguna velocidad en más de la mitad).
8. «con todas en IA la batalla se juega entera al montarla»: una semilla, no cinco.

## test/poderes.test.ts
9. «IA contra IA, los poderes no la eternizan…» (4 montajes × 8 semillas, medianas): QUITAR (la regla ya la prueba «bendice cuando compensa… y no a quien ya está bendecido»).

## tools/qa/capturas.ts
10. `enlaceDeLaPelea`: quitar la segunda `lucharHastaElFinal` y la comparación «el mismo parte, carácter a carácter»; dejar `montadoOtra === montado` y que no empieza a pelear sola.

## Menores
- test/experiencia.test.ts «las cifras se reindexan: uno de rango 5 tiene lo que antes uno de nivel 1»: renombrar a la regla (el rango 5 son las bases del JSON y cada rango suma `porRango`).
- test/equipo.test.ts «El héroe nace como antes»: quitar el `toEqual` literal de `EQUIPO_BASE` (lo cubre la regla de una pieza de armería por hueco).

## No se tocan
test/nivel.test.ts (calibración), banco, invariantes, tests de reglas (validación, sumas, rechazos, lo gastado conservado), lectura de enlaces v1-v3 y muralla vieja, test/arena-equipo.test.ts, tools/qa/enfrentamiento.ts.
