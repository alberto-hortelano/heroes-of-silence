# QA — la trama de los mundos, fase A

Rama `claude/affectionate-gould-410d85`, commits 8773bc93 y eb0999c2 sobre `main` 7822ecfd.
Alcance (decisión del usuario): solo la **fase A**. No se ha lanzado el motor real (`claude -p`) ni
ningún `POST /__mundos` contra él. El criterio 9 queda **pendiente de la fase B** y no cuenta para
este veredicto.

Cómo se probó:

- **`pnpm verify`**, una vez: salida 0. Resultado: «Test Files 162 passed | 1 skipped · Tests 3954
  passed | 12 skipped». La carga de la máquina estaba en 26-43.
- **La CLI** (`pnpm mundo validar|medir|leer`) sobre `ejemplo`, `prueba`, una copia de la referencia
  `gen-20261022-596849` y mundos `gen-qa-*` hechos a mano para la pasada adversarial. Todos borrados
  después; `git status` queda limpio.
- **El lanzador de punta a punta, sin coste.** `npx vite --port 3271 --strictPort` corrió con
  `HEROES_MOTOR` apuntando a un motor falso:
  `/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-affectionate-gould-410d85/8fee6c7d-388c-4b5b-807d-0fc1b55b3101/scratchpad/motor/motor-falso.mjs`.
  Ese motor escribe un `stream-json` creíble y una biblia corta, copia la historia de `prueba`,
  corre el `pnpm mundo validar` **de verdad** y pasa su salida como `tool_result`. Después corrige
  la biblia y vuelve a validar.
  - Lo condujo Playwright sin pantalla, entrando por el menú: Nuevo juego → imperio → Empezar →
    El mundo → Pequeño → Generar.
  - El servidor se arrancó con `set -m` y se mató por su grupo. Después, `ss` dio el 3271 libre.

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | La skill pide primero `biblia.md` en prosa y después `historia.json`, y relee una contra otra | ✅ (en lo que la fase A puede cumplir) | **Orden:** `SKILL.md` §«Lo que escribes» pide los dos ficheros en este orden. Además dice: «La biblia se escribe entera antes de tocar la historia».<br>**Biblia:** §«Primero, la biblia» pide de 1 500 a 4 000 palabras, sin JSON, con seis secciones: antes del héroe, quién es quién (qué quiere, qué esconde, cómo habla, a quién conoce de otros lugares), los lugares, la trama (≥ 3 lugares), los desenlaces (≥ 2, incluido qué encuentra quien llega tarde) y las marcas.<br>**Relectura:** §«El bucle», paso 5, pide releer la biblia contra la historia: lugares y personas en las dos, trama por las marcas, `no` cruzado y nada contradictorio.<br>No se ha comprobado cómo sale con el motor real: eso es la fase B. |
| 2 | `pnpm mundo validar` rechaza un mundo sin biblia, con ella vacía o ridícula; lo mismo en el servidor que genera; la página dice explícitamente que no la carga | ✅ | **Mínimo de 399/400 palabras:** 399 → «- biblia.md: tiene 399 palabras y una biblia lleva al menos 400: …», salida 1. Con 400 → «vale», salida 0.<br>**Biblia vacía:** «tiene 0 palabras…», salida 1.<br>**Sin biblia:** «- biblia.md: no está; la escribe el motor antes que la historia (assets/mundos/<id>/biblia.md)». Lo mismo con un enlace roto.<br>**Carpeta vacía:** cuatro problemas, la biblia primero.<br>**La referencia** `gen-20261022-596849` sale 1 por falta de biblia.<br>**Servidor:** el motor falso en modo `biblia-corta` sale con código 0. La espera termina en `fallido` con el problema «biblia.md: tiene 312 palabras…».<br>**Página:** lo dicen el comentario de `cargar.ts` y `CLAUDE.md`. |
| 3 | Trama que encadena ≥ 3 lugares; de 4 a 8 lugares según el tamaño; en regiones distintas | ✅ en la skill y la lectura · ⚠️ sin probar con una generación real | **Lectura:** trae `lugares` (`prueba` 4-5, `ejemplo` 5-6) gracias a `lugaresDelPlan`.<br>**Skill:** §«Qué historia escribir» pide entre `lugares.de` y `.a`, cada uno en una región distinta, y una trama que encadene ≥ 3 lugares por marcas.<br>**Menú:** «de 4 a 5 / de 5 a 6 / de 6 a 8 lugares» (captura `bien-eleccion.png`).<br>**Medida:** `pnpm mundo medir` cuenta las regiones y los lugares encadenados, pero no lo exige.<br>Que salga así de verdad: fase B. |
| 4 | Árboles hondos; la medida, en el QA | ✅ (skill + medida) | **Skill:** pide preguntar por el pasado y por los otros, mentir y presionar, con respuestas distintas según las marcas. Pide ramas que vuelvan a un tronco y lo **prohíbe** con relleno. Lo orientativo es ≥ 6 nodos y 3 niveles.<br>**Comprobación de `medir` a mano contra los JSON:** Tobías 5/2/3, Aldama 4/2/3, Anselmo 4/1/2 y Corvo 4/2/3 (nodos / hondura / opciones con `hace`). Todo coincide.<br>**Referencia:** Bartolo 3/1, Grushnak 3/2, Ilvaren 2/1.<br>Ver H5 sobre la ambigüedad de «tres niveles». |
| 5 | ≥ 2 desenlaces excluyentes; los pide la skill; el motor los comprueba; la skill sabe que el mundo es de los dos | ✅ | **Skill:** §«Desenlaces excluyentes» trae un fragmento JSON. El test lo saca **de la propia `SKILL.md`**, lo mete en `prueba` y comprueba tres cosas:<br>· vale con el validador de verdad;<br>· jugado, vender el sello da 400 de oro y la otra opción se apaga con «el sello del abad ya está en manos de los orkos»;<br>· el estandarte aparece en el pozo.<br>**`medir` lo ve:** exclusiones `sello-a-la-orden / sello-a-los-orkos`, una marca que cruza y 2 lugares encadenados.<br>**Skill, §«El mundo es de los dos»:** el `ya` describe el mundo, el rival puede cerrar un desenlace y la IA toma el primero con premio, lo que coincide con `ai/lugares.ts`.<br>Ver H6. |
| 6 | El vocabulario, solo si hace falta | ✅ | No se amplía. El fragmento de los desenlaces valida con el vocabulario de hoy, y ninguna frase de la skill contradice `VOCABULARIO`:<br>· la condición `{"no": {"marca": …}}`;<br>· los límites de `alGanar` y `alPerder`;<br>· la batalla al final;<br>· `noCortaSuCamino`. |
| 7 | Opus y esfuerzo alto; permisos de `biblia.md`; progreso «escribe la biblia»; tope | ✅ (tope provisional, como dice la corrección) | **Argumentos recibidos por el motor falso** (`args.log`): `--model opus --effort xhigh`, más `--allowedTools` con `Read Glob Grep Write(assets/mundos/gen-20261022-2026/biblia.md) Edit(…/biblia.md) Write(…/historia.json) Edit(…/historia.json) Bash(pnpm mundo validar gen-20261022-2026)`.<br>**Líneas que salieron en la espera:** «lee una biblia de ejemplo», «escribe la biblia», «escribe la historia», «valida el mundo», «corrige la biblia», «relee la biblia» y «relee la historia». También «La última validación no pasó: 1 problema; el primero, biblia.md: tiene 312 palabras…».<br>**Tiempo:** se ve en «min s» (con el progreso falseado, «59 min 59 s»).<br>**Tope:** `TOPE_DEL_MOTOR_MS` = 30 min, provisional. Se fija en la fase B. |
| 8 | `ejemplo` y `prueba` siguen valiendo; sus biblias son prosa fiel | ✅ (la regeneración de `ejemplo` es de la fase B) | **Validación:** `pnpm mundo validar ejemplo|prueba` → «vale» (salida 0). Las biblias tienen 993 y 816 palabras (`wc -w`).<br>**Fidelidad, comprobada contra `historia.json` y la lectura:**<br>· `prueba`: Valdeluz, Cripta Gris y la Hoya de los Cuervos (los dos lugares están en la región 7, «Hoya de los Cuervos»); el encuentro (1 alabardero y 2 coraceros, 200 de oro); los 4 esqueletos y el gambesón; los tres desenlaces del puente.<br>· `ejemplo`: la capilla está en Tierras de Valdeluz, el campamento en los Llanos del Cierzo y la barca en el Valle Hondo, junto a Puenteroto; las cifras cuadran: cripta 100, contrato 300, desertores 2+2 y 250, Anselmo 100 / 200, lago 300 más el escudo; las marcas, quién las pone y quién las lee, también.<br>· Única inexactitud, menor: la biblia de `prueba` dice que enseñar la carta solo se puede «habiendo leído la carta en la garita antes de hablar de su capitán». Basta con tenerla leída al enseñarla: se puede hablar primero, ir a la garita y volver.<br>**Versión:** `VERSION_DEL_MUNDO` no sube. Está justificado en `plan.md` §5: la forma de los JSON no cambia y la biblia falta diciéndolo. |
| 9 | Ejercido de verdad con el motor nuevo y comparado con la referencia | — **pendiente de la fase B** | Aplazado por decisión del usuario hasta que el banco de NPC esté en `main`.<br>Ya está la tabla de partida de la referencia: 3 lugares en 3 regiones, 2 marcas, 1 que cruza (`caliz-recuperado`), 2 encadenados, 0 exclusiones, diálogos de 2-3 nodos con hondura 1-2 y sin biblia. |
| 10 | `CLAUDE.md` al día; `pnpm verify` en verde | ✅ | **`CLAUDE.md`:** «Arrancar» trae `pnpm mundo medir`, el motor con Opus `xhigh`, primero la biblia y luego la historia, el tope provisional y las biblias a mano. La fila «Un mundo» de las puertas únicas trae `problemaDeLaBiblia`, solo en disco, y que la página no la pide, más `lugaresDelPlan`. «Lugares» de las reglas dice que la skill pide los lugares por tamaño y `medir` los mide.<br>**`pnpm verify`:** salida 0 (ver arriba). |

## Hallazgos

### Importante

**H1. El lector de la salida del validador toma cualquier `tool_result` que contenga «el mundo "…"
vale» como una validación que pasó.**

- **Dónde falla:** `respuestaDelValidador` (`tools/mundo/motor.ts`) busca en todo `tool_result` la
  frase `/el mundo "[^"]+" vale/`. La skill contiene esa frase literalmente, en el paso 5 del bucle:
  «Cuando diga «el mundo "<id>" vale», …».
- **Qué pasa:** si el motor lee su `SKILL.md` con `Read` (`queHace` ya lo prevé: «lee sus
  instrucciones»), la espera escribe «la historia vale». Si había un problema pendiente, borra «La
  última validación no pasó» aunque la biblia siga corta.
- **Origen:** la expresión regular ya estaba en `main`. Este ciclo tocó la función y la frase sigue
  en la skill.
- **Reproducción, sin coste:**
  1. Lanza `npx vite --port 3271` con `HEROES_MOTOR` apuntando al motor falso de la ruta de arriba
     (con `motor/modo.txt` = `lee-skill-tarde`).
  2. Entra en el menú: Nuevo juego → imperio → Empezar → Pequeño → Generar. El `POST` lleva
     `semilla: 2026`, añadida por la interceptación.
  3. A los 12 s aparece «La última validación no pasó: … biblia.md: tiene 312 palabras…».
  4. A los 18 s, tras «lee sus instrucciones», el aviso desaparece aunque la biblia sigue teniendo
     312 palabras.

  En el modo `bien`, la línea «la historia vale» sale justo después de «lee sus instrucciones», antes
  de escribir nada. El caso aislado da lo mismo: `respuestaDelValidador` sobre un `tool_result` con
  la skill numerada como `cat -n` devuelve `[]`.
- **Qué esperaba quien juega:** que la espera solo diga «vale» cuando valida el validador. No se
  sabe si el motor real llega a leer `SKILL.md` con `Read`. El arreglo natural es mirar solo el
  `tool_result` de la llamada `Bash(pnpm mundo validar <id>)`, por su `tool_use_id`.

**H2. Una generación que muere antes de escribir la historia borra la biblia.**

- **Qué es:** ya estaba apuntado en el backlog del plan (§6 b), pero las issues no se han abierto
  (`implementacion.md`). Lo confirmé en el ensayo.
- **Reproducción:** con `modo.txt` = `muere-sin-historia`, el motor escribe la biblia y sale con
  código 1. La espera termina con «el motor salió con código 1: se acabó el contexto», muestra los
  dos problemas (biblia corta, historia que falta) y «el mundo "gen-20261022-2026" no tenía
  historia: se borra». La carpeta desaparece con su `biblia.md`.
- **Por qué importa:** con Opus `xhigh` y una biblia de 1 500-4 000 palabras, son minutos de
  suscripción. Importa para la fase B, no bloquea la A.
- **Pide:** abrir la issue antes de la fase B.

### Menores

**H3. La espera habla de «la historia» cuando lo que falla es la biblia.**

- Cuando la validación no pasa por la biblia, la espera escribe «la historia aún no vale (1)».
- Cuando pasa, escribe «la historia vale».
- Si el motor sale con 0 y la biblia es corta, el motivo final es «el motor acabó, pero su historia
  no vale». La historia valía: lo que no valía era la biblia (modo `biblia-corta`).
- El título de la fase `validar` sigue siendo «Comprobando la historia».
- Esperaba «el mundo».

**H4. Una biblia que es un directorio da un `EISDIR` crudo, con ruta absoluta.**

- `pnpm mundo validar gen-qa-b` → `EISDIR: illegal operation on a directory, read
  '/home/al/code/heroes/.claude/worktrees/…/assets/mundos/gen-qa-b/biblia.md'`, salida 1.
- No sale como «biblia.md: …». `medir` da lo mismo.
- En el servidor iría al `motivo` de la espera sin pasar por `sinRutas`.
- Es raro que pase (pasa igual con un `historia.json` que sea un directorio, y eso ya estaba antes).

**H5. «Tres niveles de hondo» en la skill y «hondura ≥ 3» en el plan no cuentan lo mismo.**

- `medir` cuenta la hondura en aristas desde el `inicio` (0 = solo el inicio).
- Un diálogo de tres niveles (inicio → pregunta → respuesta) da hondura 2. Es el caso de Tobías.
- El criterio de la fase B (`plan.md` §7: «hondura ≥ 3») suspendería un árbol que sí cumple la
  skill. Hay que alinear las dos cifras antes de medir.

**H6. El ejemplo de formato que manda leer la skill contradice su propia regla del `ya`.**

- La skill manda leer `prueba` como ejemplo de formato.
- Las marcas de `prueba` usan un `ya` en segunda persona: «ya pagaste el peaje», «ya te llevaste la
  lanza», «lo del pozo ya te venció una vez».
- La regla de la skill limita la prohibición a las marcas de desenlace, así que no es una
  contradicción formal. Pero el motor copia del ejemplo, y en un mundo de dos jugadores esa frase
  puede salirle a quien no hizo nada.

**H7. El suelo de 400 palabras se cumple con relleno.**

- 400 «#» separados por espacios dan «vale».
- Es lo que se decidió («un suelo, no una medida de calidad», `disco.ts`). Lo apunto para que la
  fase B lea de verdad la biblia generada.

**H8. `pnpm mundo leer` ya no lee un plan que no sea de los tamaños del menú.**

- Antes del cambio sí lo leía.
- Un mundo con 12 regiones (6 por bando, montado a mano) da «el plan tiene 12 regiones: ningún
  tamaño del menú (4, 5, 7 por bando, el doble en el plan)», salida 1.
- Es fail-loud y claro. Solo afecta a mundos montados a mano: `nuevo` y el menú ya rechazan otros
  tamaños (««regionesPorBando» tiene que ser 4, 5, 7; es 6»).
- La página sigue jugándolos, porque `lecturaParaElMotor` solo la usa el disco.

**H9. En móvil (390 px), el panel de la espera se sale por la derecha. Ya estaba antes.**

- El título `.titulo-de-inicio` es `nowrap` y ensancha la sección más allá de la pantalla. No hay
  scroll horizontal, pero el marco derecho queda cortado.
- Cuánto sobresale «El motor escribe la trama», según el tema: orkos +9 px, no muertos +42, elfos
  +43, imperio +53, templarios +136 (`movil-espera.png`).
- No lo introduce este cambio: el título de antes era más largo y los de las otras fases
  («Leyendo y pintando el mapa para el motor») también se salen.
- La elección del mundo sí cabe (`movil-eleccion.png`).

## Workarounds usados

- **Motor falso en lugar de `claude -p`.** Era obligado por el alcance. El motor falso sí corre la
  validación real y entra en la espera real por `HEROES_MOTOR`. No afecta a quien juega.
  **Queda sin probar** si la regla de permisos relativa `Write(assets/mundos/<id>/biblia.md)` casa
  con la ruta que use el motor real (fase B).
- **`POST /__mundos` interceptado para añadir `semilla: 2026`.** Así el plan congelado es el de
  `prueba` y la historia copiada por el motor falso vale. Comprobado que `mundoNuevo` con 2026 /
  imperio / 4 reproduce byte a byte el plan de `prueba`, y con 299810 el de `ejemplo`. No afecta a
  quien juega: el menú manda lo mismo de siempre (`{"faccion":"imperio","regionesPorBando":4}`).
- **Progreso falseado con `page.route`, solo para la captura de móvil** (tiempo largo y 7
  validaciones). No afecta a quien juega.

## No probado

- **Criterio 9 entero (fase B):**
  - una generación real;
  - el tiempo con la biblia y el tope definitivo;
  - la regeneración de `ejemplo`;
  - si el motor rellena para llegar a las cifras;
  - el coste de la IA en un mundo con trama larga;
  - si la regla relativa de permisos casa con la ruta real del motor.
- Cancelar a media generación y el 409 (no los toca este cambio).
- `pnpm qa`, `capturas`, `banco` y `verify:lento`: el cambio no toca `src/server/`, el contrato, el
  juego, el mapa ni el arte.

## Veredicto

**Apto con reservas** (para la fase A).

- **Lo que está bien:**
  - la skill pide de verdad una biblia con trama, varios lugares encadenados, conversaciones hondas
    sin relleno y desenlaces excluyentes, y su fragmento JSON valida y se juega;
  - la biblia se exige en la CLI y en el servidor, y se dice bien;
  - el lanzador lleva modelo, esfuerzo, permisos y la línea de progreso;
  - `medir` cuenta lo que dice;
  - `ejemplo` y `prueba` valen con biblias fieles;
  - `CLAUDE.md` está al día y `pnpm verify` en verde.
- **Reservas:**
  - H1 (la espera puede decir «vale» sin que lo haya dicho el validador);
  - H2 (la biblia se pierde si el motor muere antes de la historia) conviene resolverlo, o al menos
    abrir su issue, **antes de la fase B**, que es cuando se gastan minutos de Opus;
  - H5 hay que alinearlo antes de medir.

---

# Vuelta 2 — re-verificación de los hallazgos de «Se arregla» (commit 5f804a24)

Alcance: H1, H2, H3, H4, H5, H6 y H9, los criterios que tocan y una pasada adversarial nueva sobre
lo cambiado. H7 y H8 se dejaron por decisión (`hallazgos-qa.md`). El criterio 9 sigue pendiente de
la fase B y no cuenta.

Cómo se probó:

- **`pnpm verify`: no se repite.** Salió verde en 5f804a24 (3959 tests, según `implementacion.md`)
  y desde entonces no ha cambiado nada (`git status` limpio antes y después).
- **La CLI:** `pnpm mundo validar|medir` sobre `prueba`, `ejemplo` y cinco mundos `gen-qa2-*` hechos
  a mano. Se borraron todos después.
- **La espera de verdad, entrando por el menú:**
  - Servidor: `npx vite --port 3291 --strictPort` con `HEROES_MOTOR` apuntando a un motor falso,
    arrancado con `set -m` en su propia línea y matado por su grupo. Después, `ss`: «3291 libre», y
    el grupo, vacío.
  - Navegador: Playwright sin pantalla. Nuevo juego → imperio → Empezar → Pequeño → Generar. El
    `POST` se interceptó para añadir `semilla: 2026`, como en la vuelta 1.
  - **El motor falso no es `motor-falso-qa.mjs` tal cual.** Esa copia lleva `tool_use_id` fijos
    (`x`, `y`, `z`) que no casan con sus `tool_use`, y Claude Code sí los casa. Con ella, ninguna
    respuesta del validador se reconoce, que es el caso «sin id» de abajo.
  - Usé una copia del `motor-falso.mjs` corregido por el ingeniero, con cuatro modos adversariales
    más: `scratchpad/qa2/motor-qa2.mjs`.
  - No se lanzó el motor real.

## Hallazgos de «Se arregla»

| Hallazgo | Estado | Evidencia |
|---|---|---|
| **H1** — la espera solo cree lo que contesta su llamada al validador | ✅ | **Modo `lee-skill-tarde`, de punta a punta:**<br>· a los 14 s, «1 validación», «el mundo aún no vale (1)» y «La última validación no pasó: 1 problema; el primero, biblia.md: tiene 312 palabras…»;<br>· a los 20 s, «lee sus instrucciones», con la `SKILL.md` entera (que trae la frase) en su `tool_result`. **El aviso sigue** a los 20 s y a los 26 s;<br>· a los 27 s, la segunda validación da «el mundo vale» y la partida arranca en `?mundo=gen-20261022-2026&tropa=7&rueda=7`;<br>· consola sin errores.<br>Ver además la pasada adversarial (id repetido, `grep` con la frase, varias en un mensaje). |
| **H2** — la biblia sola se queda | ✅ | **`muere-sin-historia`** (biblia de 312 palabras, salida 1): espera «el motor salió con código 1: se acabó el contexto», los dos problemas y la última línea «queda la biblia en assets/mundos/gen-20261022-2026/ para mirarla». En disco quedan `biblia.md` (312 palabras), `mundo.json` y `plan.json`.<br>**`muere-sin-nada`** (modo nuevo: sale 1 sin escribir nada): «el mundo "gen-20261022-2026" no tenía ni biblia ni historia: se borra». La carpeta desaparece.<br>**`biblia-corta`** (biblia e historia, salida 0): «quedan la biblia y la historia en assets/mundos/gen-20261022-2026/ para mirarlas».<br>**Carrera del aviso** (ver la pasada adversarial): la línea de la biblia no se puede perder; la de «se borra», sí. |
| **H3** — la espera habla del mundo | ✅ | Las líneas «el mundo aún no vale (1)» y «el mundo vale» salen en los modos `lee-skill-tarde`, `biblia-corta` y `paralelo`.<br>Con `biblia-corta`, el motivo final es «el motor acabó, pero el mundo no vale».<br>El título de la fase `validar` es «Comprobando el mundo» (en el `h1` de las 10 capturas de móvil de esa fase).<br>`grep historia` en `tools/mundo/motor.ts` y `src/client/desarrollo/mundo.ts` solo da tres cosas que hablan de verdad del fichero o del modo: «no tenía ni biblia ni historia», «Jugar sin historia» y `data-mundo="sin-historia"`. |
| **H4** — un fichero que no se lee se dice con su nombre, sin ruta absoluta | ✅ | Salida 1 en todos los casos, y `medir` da lo mismo que `validar`:<br>· `biblia.md` directorio → «biblia.md: no es un fichero (assets/mundos/gen-qa2-a/biblia.md)»;<br>· `historia.json` directorio → «historia.json: no es un fichero (…)»;<br>· `biblia.md` con `chmod 000` → «biblia.md: no se puede leer, EACCES (assets/mundos/gen-qa2-c/biblia.md)»;<br>· `biblia.md` enlace a `/tmp` → «no es un fichero»;<br>· `historia.json` enlazado a sí mismo → «historia.json: no se puede leer, ELOOP (…)»;<br>· `plan.json` directorio → «plan.json: no es un fichero (…)».<br>Ninguno saca una ruta de la máquina. Todos empiezan por «<fichero>: », así que `problemaDeLaLinea` los pasa a la espera. |
| **H5** — `medir` cuenta niveles, como la skill | ✅ (con una nota menor, M2) | `pnpm mundo medir prueba ejemplo` da:<br>· Corvo, nodos 4 · niveles 3;<br>· Tobías 5 · 3;<br>· Aldama 4 · 3;<br>· Anselmo 4 · 2.<br>Es la hondura de la vuelta 1 más uno.<br>La skill (l. 118) dice «el inicio es el primero: inicio → pregunta → respuesta son tres».<br>`plan.md` §7 (fase B) pide «≥ 3 niveles (el inicio es el 1)».<br>`CLAUDE.md` y `cli.ts` dicen «niveles». |
| **H6** — las marcas de `prueba` y `ejemplo` describen el mundo | ✅ | Leí uno a uno los 10 `falta` y los 10 `ya`. Ninguno habla a «tú», por ninguna forma: ni pronombre, ni pretérito, ni futuro, ni imperativo, ni «os» o «vuestro». Por ejemplo, «el peaje del puente ya está pagado», «la lanza ya no cuelga en la garita», «los ahogados del lago ya vencieron a alguien».<br>La sección «Marcas» de las dos biblias no cita frases en segunda persona. La de `prueba` corrige lo de la carta («también vale si la leyó el rival») y dice qué encuentra quien llega tarde.<br>Los «ya te llevaste…» que quedan en `core/mundo/reglas.ts` y en `test/mundo.test.ts` son la frase del núcleo para quien sí se lo llevó (`mio`): están bien.<br>El fragmento de desenlaces de la skill («el sello del abad ya está en manos de…») también es neutro. `pnpm mundo validar prueba` y `… ejemplo` → «vale», salida 0. |
| **H9** — la espera cabe en 390 px | ✅ | **Mediciones:** 390×844 y, además, 320×844, con las 5 facciones. «El mundo» y las cinco fases de la espera (congelar, pintar, motor, validar, fallido) con progreso servido por `page.route`: 59 min 59 s, 12 validaciones, un problema de 230 caracteres, una ruta de 90 sin espacios y la línea «queda la biblia…».<br>**Resultado, en las 60 pantallas:**<br>· el marco va de 16 a 374 px (de 16 a 304 en 320 px);<br>· `scrollWidth` del documento y de `#inicio` igual al ancho;<br>· ningún hijo pasa del marco y ningún texto queda cortado;<br>· la consola, sin errores.<br>**El título parte la línea:** «Leyendo y pintando el mapa para el motor», en 2-3 líneas (en 4 a 320 px); «No se ha podido generar el mundo», en 2-4.<br>**Capturas:** `scratchpad/qa2/m390-*-pintar.png` y `m320-*-fallido.png`.<br>**Pero** ver M1: el cambio de `#inicio` corta el título de **otra** pantalla por debajo de 390. |

### Criterios de la vuelta 1 que tocan

- **Criterio 2** (la biblia se exige y se dice bien) sigue ✅.
  - Se reforzó con H4: una biblia que no se lee también se dice con su fichero.
  - En el servidor, `biblia-corta` termina en `fallido` con «biblia.md: tiene 312 palabras…».
- **Criterio 4** (hondura medida) pasa a medir en las mismas unidades que pide la skill (H5).
- **Criterio 5** (el mundo es de los dos) gana coherencia: el ejemplo de formato ya no contradice
  la regla del `ya` (H6).
- **Criterio 7** (progreso en la espera): las líneas «escribe la biblia», «escribe la historia»,
  «valida el mundo», «corrige la biblia», «relee la biblia» y «relee la historia» salen igual, con
  el contador de validaciones.
- **Criterio 8** (`ejemplo` y `prueba` valen; biblias fieles) sigue ✅.
  - La biblia de `prueba` sube a 883 palabras.
  - La inexactitud de la carta está corregida.

## Pasada adversarial (lo nuevo)

| Caso | Qué pasa | Veredicto |
|---|---|---|
| **Dos validaciones en un mensaje y sus dos respuestas en otro** (`paralelo`, dos `tool_use` con ids distintos y dos `tool_result` en un mismo mensaje `user`) | El contador dice «2 validaciones», pero sale **una sola** línea «el mundo aún no vale (1)». `respuestaDelValidador` vuelve con la primera respuesta que casa, y la segunda id se queda en `validando` para siempre. | Menor (M3). En la práctica las dos respuestas dicen lo mismo, porque es el mismo disco. |
| **Un `Read` de la skill y una validación en un mismo mensaje**, primero el `Read` | El `Read` se salta y la validación da «el mundo vale». La partida arranca. | ✅ |
| **`tool_use` y `tool_result` sin id** (`sin-id`; es también lo que hace `motor-falso-qa.mjs`) | Sale la línea «valida el mundo», pero el contador se queda en 0 validaciones y no hay «aún no vale». Al final, el servidor valida por su cuenta y dice «el motor acabó, pero el mundo no vale», con el problema de la biblia. | Aceptable: Claude Code siempre lleva el id. La espera calla en vez de inventarse un «vale». |
| **Respuesta repetida con el mismo id** de una validación ya contestada, con la `SKILL.md` dentro (`id-repetido`) | Se ignora: el id se borró al contestar la primera vez. El aviso de la biblia corta sigue. | ✅ |
| **Validación denegada** («Claude requested permissions…», `is_error`) | No dice nada del mundo y el último problema se queda. Cuenta como validación («2 validaciones») aunque no corrió. | Menor (M3): ya pasaba en `main`. |
| **Otro `Bash` (un `grep` de la skill) cuya salida trae «el mundo "<id>" vale»** | Se ignora. | ✅ |
| **La carrera del aviso final** (la espera deja de preguntar al ver `fallido`): un cliente que pregunta sin parar a `/__mundos/<id>/progreso` mientras el motor muere | **`muere-sin-historia`: 0 de 51** respuestas `fallido` sin la línea «queda la biblia…». En ese camino, entre `fallido` y la línea solo hay microtareas (`existsSync` es síncrono), así que ningún `GET` se cuela.<br>**`muere-sin-nada`: 3 de 51** respuestas `fallido` sin la línea «… se borra»: el `rm` es E/S. Con la espera de verdad, que pregunta cada 1,5 s, la probabilidad es de milisegundos entre 1 500. | La línea que importa para la fase B (H2) **no se pierde**. La de «se borra» sí puede perderse (M4, ya en `main`). |
| **Un `ya` en segunda persona por otra forma** (futuro, imperativo, «os», «vuestro», «usted») | Leí a mano las 20 frases y no hay ninguno.<br>Pero el guardia de `test/motor-de-mundos.test.ts` solo caza «tú/te/ti/tu/tus/tienes/has/llevas/sabes» y los pretéritos en -aste/-iste. «ya pagarás», «paga el peaje» o «ya os lo llevasteis» lo pasarían. | Menor (M5). Hoy no afecta: los dos mundos están limpios. |
| **El menú entero a 390, 360 y 320 px** (menú, facciones, «El mundo», espera) | **A 390:** todo cabe y ningún título se corta.<br>**A 360 con templarios:** «Elige tu facción» se corta 12 px («ELIGE TU FACCIÓ…»).<br>**A 320:** se cortan «Heroes of Silence» y «Elige tu facción» (templarios, elfos, orkos). | Menor, regresión por debajo de 390 (M1). |

## Hallazgos nuevos

### Menores

**M1. Por debajo de 390 px, el cambio de `#inicio` corta el título de la elección de facción.**

- **Qué pasa:** con `grid-template-columns: minmax(0, 1fr)`, la sección ya no se ensancha, pero
  `.titulo-de-inicio` sigue con `white-space: nowrap` y `overflow: hidden` fuera de «El mundo» y de
  la espera. El título sobrante no se ve.
- **Medido en 360×800, templarios**, con la regla de antes inyectada (`grid-template-columns: none`):
  - antes, el marco llegaba a 356 px y el título cabía (286 de 286);
  - ahora, el marco acaba en 344 y el `h1` mide 286 de 274;
  - captura: `scratchpad/qa2/m360-templarios-facciones-ahora.png` frente a `…-antes.png`.
- **Reproducción:** `pnpm dev` → ventana de 360 px → Nuevo juego → marcar templarios. El título se
  lee «ELIGE TU FACCIÓ».
- **A 320:** también se corta «Heroes of Silence» en el menú.
- **Alcance:** a 390 no pasa (lo que pedía H9), pero 360 es un ancho de Android corriente.
- **Qué esperaba quien juega:** leer el título entero. Valdría que parta la línea o encoja la letra,
  como ya hacen los de «El mundo». El ingeniero mantuvo el `nowrap` de la lista de facciones para
  que mida igual con cualquier tema; el que se corta es el título, no la lista.

**M2. `medida.ts` se contradice en cómo cuenta los niveles.**

- La documentación del campo `niveles` (l. 32) dice «del camino **más largo** desde el `inicio`».
- `nivelesDe` (l. 94) dice, y hace, «el camino **más corto** al nodo más lejano», en anchura.
- En un árbol dan lo mismo. Con una rama que vuelve al tronco, que es lo que pide la skill, no:
  manda el código. Solo hay que corregir el comentario.
- Además, `plan.md` §5 (l. 38) y §6 (l. 68) aún dicen «hondura». No es un fallo, porque §7, que es
  lo que se medirá, ya dice niveles.

**M3. El contador de validaciones y las respuestas no van a la par en dos casos raros.**

- **Una validación denegada** cuenta como validación. Ya pasaba en `main`.
- **Dos respuestas en un mismo mensaje:** la segunda se pierde, y su id se queda en `validando`.
- Ninguno de los dos hace decir «vale» sin que lo diga el validador, que era H1.

**M4. La línea «… no tenía ni biblia ni historia: se borra» puede no llegar a la espera.**

- La carrera que reconoce el ingeniero existe, pero solo en este camino: el `rm` es E/S y un `GET`
  puede caer entre `fallido` y la línea.
- Medido con un sondeo sin pausa: 3 de 51.
- La de «queda la biblia» no se pierde (0 de 51).
- Ya pasaba en `main` con «no tenía historia: se borra». Lo que se pierde es solo una línea
  informativa.

**M5. El guardia del `ya` en segunda persona solo caza algunas formas.**

- La expresión de «los mundos del repositorio describen el mundo» no caza futuro (-arás),
  imperativo, «os» ni «vuestro».
- Hoy los dos mundos están limpios, comprobado a mano. Pero el guardia dejaría pasar un `ya`
  regenerado en la fase B como «ya os lo llevasteis».

## Workarounds usados (vuelta 2)

- **Motor falso en lugar de `claude -p`**, como en la vuelta 1: es una copia corregida (ids que
  casan) con modos adversariales. No afecta a quien juega.
- **Interceptar el `POST /__mundos` para añadir `semilla: 2026`**, como en la vuelta 1, para que la
  historia copiada de `prueba` valga. El menú manda lo mismo de siempre.
- **El progreso servido por `page.route` en las mediciones de móvil**, para tener lo más largo en
  cada fase. Solo afecta a lo que se pinta, no al flujo.
- **Un sondeo de `/__mundos/<id>/progreso` sin pausa** para ver la carrera. La espera de verdad
  pregunta cada 1,5 s.
- **Para comparar M1, la regla de `#inicio` de antes**, inyectada con `addStyleTag` en vez de
  sacar otro árbol. Es solo la regla que cambió.

## No probado

- **El motor real**, sin cambios respecto a la vuelta 1 (fase B). Queda pendiente:
  - comprobar de verdad que Claude Code repite el `id` de cada `tool_use` en su `tool_result`;
  - si emite varios `tool_result` en un solo mensaje cuando valida en paralelo.

  El motor falso lo imita, no lo prueba.
- **`pnpm verify`**, **`verify:lento`**, **`capturas`**, **`qa`** y **`banco`**:
  - `verify` es el mismo commit en verde;
  - el cambio no toca `src/server/`, el contrato, el juego, el mapa ni el arte;
  - `tools/qa/neutro.ts` lo corrió el ingeniero (4 diferencias del espectador que no son de este
    cambio).

## Veredicto (vuelta 2)

**Apto** para la fase A.

- Los siete hallazgos de «Se arregla» están resueltos y probados en el flujo real de la espera.
- El más importante, H1, aguanta la pasada adversarial: ningún texto ajeno a la respuesta del
  validador hace decir «vale».
- H2 conserva la biblia y lo dice, y esa línea no se puede perder.
- Los cinco menores nuevos no bloquean:
  - M1 corta el título de la elección de facción entre 320 y 389 px;
  - M2 es un comentario;
  - M3 y M4 son líneas de la espera en casos raros, ya en `main`;
  - M5 es un guardia estrecho.
- Conviene arreglar **M1** y **M5** antes de la fase B. M5, porque la fase B regenera `ejemplo` y
  el guardia es lo que vigilaría su `ya`.
