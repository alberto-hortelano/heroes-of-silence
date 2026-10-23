# Hallazgos de /simplify sobre 8773bc93 (consolidados y decididos)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud). Lo que se repite entre
ellos va en un solo punto. Todo **se aplica** salvo lo de «Descartado». No cambia comportamiento
salvo donde se dice (texto de mensajes de la biblia y de `pnpm mundo medir`).

## Se aplica

1. **La línea de problema, una sola forma** (altitud 1). `cli.ts` escribe `- <problema>` y
   `motor.ts` (`respuestaDelValidador`) la reconoce con una regex que repite los nombres de
   fichero y quita el «- » a mano. Dos caras de un hecho: escribirlas juntas en `tools/mundo/`
   (p. ej. `lineaDeProblema(p)` y su inversa `problemaDeLaLinea(l): string | null` en `disco.ts`),
   que usan `cli.ts` y `motor.ts`. El test del motor usa la salida tal como la imprime la CLI.
2. **Los ficheros del mundo, una tabla** (altitud 2, simplificación 12). Una lista en `disco.ts`
   de los ficheros del mundo (`mundo.json`, `plan.json`, `historia.json`, `biblia.md`) con cuáles
   escribe el motor, y `rutaDelFichero(id, nombre)` sobre `carpetaDe`. De ella salen: los
   `--allowedTools` de `argumentosDelMotor` (Write/Edit de los que escribe el motor), `queHace`
   (escribe/corrige/relee la suya, lee la de ejemplo; una tabla, no ternarios encadenados), el
   reconocedor del punto 1 y la frase «no está; la escribe el motor…» (una función). Los literales
   de `core/mundo/validar.ts` no se tocan (fuera del diff).
3. **Una sola lectura del mundo en disco** (altitud 3, simplificación 2 y 9, eficiencia 3,
   reutilización 3). `leerCrudos` devuelve también la biblia (texto o `null`), leídas en paralelo,
   así «no hay ningún mundo» se decide una vez y `validarEnDisco` no repite `existsSync`. Y
   `leerMundoDeDisco(id): Promise<MundoLeido>` que lanza con los problemas, para `cli.ts medir`,
   los dos tests de `motor-de-mundos.test.ts` y `tools/qa/lugares-ia.ts` (las cuatro copias del
   trío leer → comprobar → `leerMundo`).
4. **`medida.ts` con los helpers del formato** (reutilización 1-2, simplificación 3-7, altitud 5):
   - `efectosDe(efectos, 'marca')` y `batallaDe(o)` de `formato.ts` en vez de filtrar a mano.
   - `opcionesDe` → `opcionesConEfectos` (choca con `opcionesDe` de `reglas.ts`), calculadas una
     vez por lugar y reutilizadas en marcas y exclusiones; que «ponen» salga de una sola fuente
     (opciones con su `alGanar`/`alPerder` de la batalla, y los encuentros) sin el bucle aparte.
   - `marcasLeidas`/`marcasQueNo` en una función (`marcasDe(c)` → `{ marca, negada }[]`).
   - Exclusiones con `Map<string, Set<string>>`, sin la clave `"a\nb"` ni el `split`.
   - Separar `marcasQueCruzan` de `encadenados` (componente mayor) para que cada bloque haga una
     cosa; union-find o lo más corto.
   - `honduraDe`: una línea que diga por qué no usa `recorrido` (no da distancias).
5. **El texto de `medir` sale de `medida.ts`** (simplificación 1): `describirMedida(m): string[]`
   en `medida.ts`, `cli.ts` solo imprime. Sin `cuantos` ni concordancias de plural: «lugares: 3»,
   «marcas que cruzan: a, b».
6. **`problemaDeLaBiblia` con dos casos** (simplificación 8): `null` («no está») y menos del
   mínimo (una sola frase con las palabras que tiene, también 0). Sin el plural de «palabra».
   Ajustar los tests a eso.
7. **`lugaresDelPlan`** (simplificación 10): se queda (altitud dice que es la altura buena), pero
   la lista de tamaños válidos para su mensaje y el de `pedidoBlocker` sale de un solo sitio.
8. **Tests de `medir` sobre lo estable** (simplificación 11): `ejemplo` se regenerará en la fase
   B, así que un test que fija sus cifras se romperá por motivos ajenos. Las cifras exactas, sobre
   `prueba` (a mano y estable) o una historia mínima en el test; de `ejemplo`, solo que se mide sin
   lanzar.
9. **Modelo y esfuerzo como constantes** (altitud 6): `MODELO_DEL_MOTOR` y `ESFUERZO_DEL_MOTOR`
   junto a `TOPE_DEL_MOTOR_MS`, y el test las lee de ahí.
10. **Menores** (simplificación 12): quitar `import { performance } from 'node:perf_hooks'` de
    `lugares-ia.ts` (es global); acortar a dos líneas el comentario de `cargar.ts` y el de
    `--model/--effort`.

## Descartado a conciencia

- **`buildMap` repetido en `medirMundo`** (eficiencia 1, reutilización): exponer el mapa en
  `MundoLeido` cambia un contrato de `core` por unos milisegundos de una herramienta de medida.
- **El resto de eficiencia** (2, 4-6): milisegundos o menos en una CLI.
- **Exportar del núcleo `marcasDeCondicion`/`marcasQueHace`** (altitud 5, alternativa profunda):
  `medida.ts` es medida y no regla; con el punto 4 queda con los helpers que ya exporta
  `formato.ts`. Si el vocabulario crece con `o`/`y`, se revisa entonces.
- **Atar las cifras de la skill (400, rango de palabras) y «de 5 a 15 minutos» del menú al tope**
  (altitud 4): el tiempo real se mide en la fase B y entonces se fijan tope y frase juntos; la
  cifra 400 de la skill es prosa para el motor, y el validador ya le dice el mínimo al fallar.
- **Salida `--json` de `pnpm mundo validar`** (altitud 1, alternativa profunda): con el punto 1
  basta; el motor ya parsea el stream de `claude -p`, que es texto.
