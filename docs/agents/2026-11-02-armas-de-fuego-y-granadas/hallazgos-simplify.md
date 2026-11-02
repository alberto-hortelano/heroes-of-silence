# Hallazgos de /simplify — consolidados y decididos

Cuatro revisores: reutilización, simplificación, eficiencia y altitud. Aquí van sin duplicados y cada
uno con su decisión tomada. Las líneas citadas son del diff tal como estaba al revisarlo; búscalas por
el nombre si se han movido.

## A arreglar

### Fallos

**F1. Quien lanza puede matarse con su propia granada y se queda con el turno.** Lo encontraron los
cuatro revisores, y uno lo comprobó ejecutándolo: granadero en (1,4) que lanza a (2,4). En su
siguiente turno salen `blast` sobre él y `perished`, pero `finished` sigue a `null`, `activeStack`
devuelve al muerto y `legalActions` le ofrece `move`.
- **Arreglo en el mecanismo, no en la granada**: en `advance`, tras `alEmpezarSuTurno`, si la activa
  ya no vive y la batalla sigue, se pasa al siguiente sin abrirle jugada. Así cubre todo lo que pase
  al empezar un turno.
- La granada **sí** da a quien la lanzó: es requisito, «también a quien la lanzó si sigue cerca».
- Test nuevo en `test/granada.test.ts`, que hay que ver morder.

**F2. La perforación viaja como un booleano opcional por `herir` y `trasLaArmadura`.** Quien se olvida
de pasarlo resta la armadura en silencio. Hoy `splash` no lo pasa: un arma de fuego con
`splash_shot` perfora en el blanco y no en lo salpicado, aunque la previsión diga lo mismo.
- **Arreglo**: `herir` recibe lo que dio el golpe (`Pick<DamageResult, 'damage' | 'perfora'>` o
  equivalente), sin valor por defecto, y la salpicadura reparte ese mismo resultado.
- En `damage.ts`, `fraccionQueLlega` pasa `perfora` a `trasLaArmadura` como los demás, en vez de su
  `return 1` aparte.

### El modo a distancia, en el núcleo y en un sitio

**S1. «¿Juega a distancia?» está escrito como `isShooter(u) || lanzaGranadas(u)` en cinco o seis
sitios**: `damage.ts`, `nivel.ts`, `session.ts` (`aDistancia`), `views/poderes.ts` y
`views/panels.ts` (dos veces). Además, `isShooter` y `lanzaGranadas` leen dos fuentes distintas
(`equipo.distancia` frente a `armas.distancia.tiro`) que pueden contradecirse.
- **Arreglo**: una sola función en `battle/armas.ts`, por ejemplo
  `tiroADistanciaDe(unit): 'disparo' | 'granada' | null`, leída **solo** de `armas.distancia`.
  `isShooter` y `lanzaGranadas` pasan a ser comparaciones con ella, y nadie vuelve a escribir la
  disyunción.
- Corregir el comentario de `types.ts` que dice que `lanzaGranadas` vive en `data.ts`.

**S2. La lista legal copia la regla del alcance** (`legalActionsAndCosts`, el bucle de `throw`). Debe
preguntar `lanzarBlocker(state, e.hex) === null`.

**S3. Tres sitios eligen entre apuntar y lanzar, y hay ramas muertas.** Son `aDistanciaBlocker`,
`jugadaADistancia` y `ArmaDeLaActiva.tanteoDeGranada`; las ramas muertas, `motivo ?? NINGUNA_TUYA` en
`apuntarA` y el `?? { type: 'aim' … }` de `EscenaBatalla.tanteoEn`.
- **Arreglo**: el núcleo da un solo tanteo a distancia, del tipo
  `tanteoADistancia(state, at): { kind: 'disparo', linea } | { kind: 'granada', explosion } | { motivo }`,
  y la jugada. La sesión y la escena solo pintan según la forma del resultado.
- Borrar las ramas muertas.

**S4. El panel deduce el modo del contenido de la lista y repite la frase de la recarga.** El modo
lo deduce con `lanzaGranadas && !legales.some(move || attack)`; la frase está en
`panels.ts` (`filaADistancia`).
- **Arreglo**: `accionesDeLaUnidad` recibe el modo de `ArmaDeLaActiva`.
- La frase «le falta 1 turno / le faltan N turnos» la exporta el núcleo, la misma que usa
  `disparoBlocker`.
- `filaADistancia` decide con `s.recargando > 0 || lanzaGranadas(...)` sin construir el `Html`
  para tirarlo, y calcula `granadasQueQuedan` una sola vez.

### Duplicados y restos

**S5. `DamageOptions.explosion` es un interruptor del daño que solo cambia una frase.** El literal
`{ ranged: true, cuarto, explosion: true }` se escribe dos veces (en `previsionDe` y en
`opcionesDeLaGranada`).
- **Arreglo**: quitar el campo y `dichoDeLaExplosion` de `damage.ts`. La frase la decide la previsión
  por su `kind` (`'explosion'` o `'disparo'`).
- Las opciones salen de una sola función, `opcionesDeLaGranada`, o de un `extraDeLaGranada`, como el
  `extraDelDisparo` del disparo.

**S6. El parámetro `propio` de `textoDePrevision` y `deGranada` sobra.** Cada impacto de la previsión
de la granada lleva `aliado: boolean` desde el núcleo, y se quita el parámetro.

**S7. `explosionDe(state, _s, at)` lleva un parámetro que no usa.**
- Se queda `explosionDe(state, at)`.
- Se conserva `ExplosionDeLaGranada.casillas` y `pintarGranadas` la lee, en vez de volver a llamar a
  `casillasDeLaExplosion`.

**S8. La explosión copia el bucle de «herir, escribir el hecho y perished»** de `splash` y
`dispararLoApuntado`, y también la búsqueda de «el vivo en esta casilla» de `lineaDelDisparo`.
- **Arreglo**: un `vivoEn(state, hex)` privado para las dos búsquedas.
- Un ayudante privado que hiera, escriba el hecho y el `perished`, y que lean los tres.

**S9. El animador y el tablero duplican lo del disparo.**
- `BattleAnimator.granadas()` es una copia de `apuntados()`. Hay que sacar un método genérico al
  ritmo de la cola (una sola pasada), que lean los dos.
- `pintarGranadas` clona la diana, el teñido por `CALOR_DEL_DISPARO`, el grueso y el trazo rojo de
  quien recibe. Hay que sacar ayudantes (`pintarDiana`, teñir el alcance, marcar al alcanzado) que
  usen `pintarDisparos` y `pintarGranadas`.
- **No se cambia lo que se ve del disparo.**

**S10. `isShooter`/`lanzaGranadas` en `armas.ts`: el traslado se queda.** Los revisores lo dan por
bueno. Solo cambia lo de S1.

**S11. Los validadores**:
- `CUARTO_MAXIMO` de `granada.ts` repite el 4 de `damage.ts`: exportar uno y leerlo.
- Los rangos de `recarga`, `cargas` y agilidad en `data.ts` y `validarGranada` se hacen con
  `enteroBlocker` (`core/validar.ts`) si encaja.
- En `validarPoder`, la validación de `perforacion` no copia la de `razon`: una función para las dos.
- `problemasDeMontura` juzga solo monturas; la agilidad de un arma de fuego, solo `problemasDelTiro`
  (hoy se citan entre ellas con un `|| p.tiro === 'fuego'`).

**S12. La arena**: las dos ramas de `CASILLAS_DE_LA_CIFRA.agilidad` en `arena/paneles.ts` pasan a un
solo objeto, con el mínimo y la nota según el hueco.

**S13. Menores**:
- los `?? 1` muertos de `tiroDelGolpe`;
- usar el tipo `TiroDelGolpe` en vez de `NonNullable<GolpeConArma['tiro']>`;
- `mismasArmas` compara por campos (`kind`, `recarga`, `cargas`), no con `JSON.stringify`;
- las líneas en blanco sueltas donde se quitaron imports (`render/batalla.ts`, `views/poderes.ts`,
  `battle/muralla.ts`);
- `stackById` en `escenas/batalla.ts` en vez de `stacks.find`;
- en el contrato, quitar `firearm` (`reload` ya lo dice) y conservar `grenadeRange`: es explícito para
  el agente; la prosa lo explica.

### Eficiencia

**E1. `tanteadoActual()` se llama dos veces por fotograma** (`escenas/batalla.ts`): una sola, y se
reparte el resultado.

**E2. `mejorGranada` recorre las 104 casillas con un `lanzarBlocker` completo en cada una.**
- **Arreglo**: las candidatas son la casilla de cada enemigo y sus vecinas, sin repetir y ordenadas
  por `indiceDe` (así se conserva el desempate). El resultado es idéntico, porque una casilla sin
  enemigo en su explosión vale ≤ 0.
- Cada candidata se comprueba con aritmética: dentro del tablero, que no sea la suya y dentro del
  alcance. La lista ya garantizó que `granadaBlocker` pasa.
- El daño por `(stack, cuarto)` se memoriza en un `Map` local.
- Si `rindeContra` sirve para valorar, se usa en vez de reescribir `min(expectedDamage, stackHp)`.

**E3. Cada alcanzado por una explosión es un paso `cast` de 520 ms en serie** (`anim.ts`, `blast`).
Se agrupan los `blast` seguidos del mismo `stack` y `at` en un solo paso que impacte a todos a la
vez, si el animador lo admite sin rehacerlo. Si no, va a `backlog` en `implementacion.md`, con el
motivo.

**E4. Retoque de la arena con algo en el aire.** Si un retoque cambia el tipo de tiro de un stack,
hoy explota la granada con las cifras del arma nueva, y `recargando` bloquea un arco recién puesto.
El retoque limpia lo pendiente (`granada`, `apuntado`) y `recargando` del stack cuyo tiro cambia.

## Se descarta, a conciencia

- **Unir `apuntado` y `granada` en un solo `pendiente`** (lo proponen dos revisores). El plan separó
  la granada a propósito para no tocar el disparo diferido, que no tiene tests por decisión del
  usuario. S9 quita el código duplicado y E4 el caso raro, sin cambiar el estado del disparo.
- **La recarga como `StackEffect`** (CLAUDE.md: «Lo temporal vive en `BattleStack.effects`»). Los
  efectos tienen un tope de 2 rondas y caducan por rondas; la recarga cuenta los turnos de la propia
  unidad y llega a 9. Se queda como contador, y **CLAUDE.md lo dice como excepción**, con el porqué.
- **La perforación en el índice, medida contra una armadura de referencia en vez de ×5/4.** El índice
  es a ojo y no se prueba la jugabilidad. Queda en el backlog para cuando se recalibre.
- **Un `Path2D` recordado por granada, una tabla congelada de explosiones por casilla, la previsión
  hecha a partir de la explosión del tanteo y recordar el modo en la clave de la caché.** Son siete
  casillas y un patrón que ya existía: no merece la complejidad.
