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

---

# Fase B — los tres mundos reales (commits ae858435 y 8e339945)

Alcance: los criterios 3, 4, 5 y 9 sobre las tres generaciones reales, más lo que tocan (1, 2, 7, 8
y 10). No se lanzó el motor ni ningún `POST /__mundos`. No se tocó el `pnpm npcs trabajar` del taller,
que seguía pintando en segundo plano.

Cómo se probó:

- **CLI**: `pnpm mundo validar` y `pnpm mundo medir` sobre los tres mundos y `prueba`. La referencia
  `gen-20261022-596849` se copió a `assets/mundos/` con sus tres `cuerpo` cambiados por figuras del
  banco (ya no valida con el formato nuevo), solo para medirla. Se borró después.
- **Lectura**:
  - entera, la biblia y la historia de `ejemplo` (la historia, pasada a texto con un script);
  - entera, la biblia de `gen-20261023-172041`;
  - de `gen-20261023-830000`, la biblia por encima («Desenlaces» entera);
  - las marcas de los tres;
  - el stream del motor de la tercera generación (`.cache/mundos/gen-20261023-172041/motor.jsonl`).
- **Núcleo**, con un script propio (`scratchpad/qab/desenlaces.mts`): los dos desenlaces de `ejemplo`,
  lo que se ve después en otros lugares y lo que pasa con las marcas entre los dos jugadores. Para
  llegar a cada lugar, el héroe se planta en él (`hero.at`, `state.current`), como en
  `test/mundo.test.ts`.
- **Navegador**:
  - Playwright sin pantalla (el Chromium de Playwright por CDP, sin pantalla) contra
    `vite --port 3471`. Los dos se arrancaron con `set -m` y se mataron por su grupo; después, `ss`
    dio 3471 y 9333 libres y los grupos, vacíos.
  - Dos partidas de `?mundo=ejemplo` desde el arranque: base → mapa → clic en el rombo → escena →
    conversación. Sin errores en consola.
  - Capturas en `/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-affectionate-gould-410d85/8fee6c7d-388c-4b5b-807d-0fc1b55b3101/scratchpad/qab/cap/`.
- **`pnpm verify`**, una vez, con el árbol de trabajo tal cual (`ejemplo` regenerado sin commitear):
  salida 0, «Test Files 166 passed | 1 skipped · Tests 4016 passed | 12 skipped», carga 2.
- `npx tsx tools/qa/lugares-ia.ts ejemplo gen-20261023-830000 gen-20261023-172041 prueba`.

## Medida contra la referencia (`pnpm mundo medir`)

| | referencia 596849 | 830000 (orkos, mediano) | `ejemplo` (no muertos, mediano) | 172041 (elfos, grande) |
|---|---|---|---|---|
| Lugares / regiones | 3 / 3 | 6 / 6 (pide 5-6) | 6 / 6 (5-6) | 7 / 7 (6-8) |
| Marcas / que cruzan | 2 / 1 | 22 / 11 | 15 / 9 | 12 / 10 |
| Lugares encadenados | 2 | 6 | 6 | 7 |
| Desenlaces que se excluyen | — | 3, a tres bandas (cuerno tocado, enterrado o vendido) | 2 (`causa-escrita` / `orden-quemada`) | 3, a tres bandas (libro leído, quemado o vendido) |
| Gente principal, nodos · niveles | 2-3 · 2-3 | 6-20 · 3-5 | 6-13 · 3-5 | 9-14 · 4-5 |
| Nodos en total · palabras por nodo · nodos de < 12 palabras | 11 · 24 · 0 | 99 · 42 · 0 | 81 · 46 · 0 | 130 · 42 · 0 |
| Palabras de la biblia | — | 3 997 | 3 830 | 3 931 |
| Oro que dan (todas las ramas) / piezas / tropa | 400 / 3 / 1 | 2 500 / 6 / 3 | 1 820 / 8 / 3 | 1 550 / 6 / 1 |
| Tiempo de generación (`plan.json` → última escritura) | ~1,5 min | 19 min | 24 min | 28 min |

Notas a la tabla:

- Los tiempos los confirman las fechas de los ficheros: 11:07 → 11:26, 11:28 → 11:52 y 11:54 → 12:22.
- La tercera generación costó el equivalente de 7,48 USD: 184 000 tokens de salida, de ellos 129 000
  pensando (campo `result` del stream).

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Primero la biblia, después la historia; se releen | ✅ | **Stream de la tercera:** `Write biblia.md` → `Write historia.json` → validar (falla) → 3 `Edit` → validar («vale») → 6 `Edit` de la historia y 10 de la biblia tras la relectura («Encontré varias incoherencias entre la biblia y la historia: la llave de Eithne, la reacción de Seanna…») → validar («vale»).<br>Las dos validaciones son la orden tal cual y la espera las cuenta: el arreglo de 8e339945 funciona. |
| 2 | La biblia se exige en disco | ✅ | Las tres biblias valen, y sin biblia la referencia no medía («no tiene biblia»). No cambió desde la vuelta 2. |
| 3 | Una trama que encadena ≥ 3 lugares; de 4 a 8 según el tamaño; en regiones distintas | ✅ | **Tabla:** 6, 6 y 7 lugares, todos en el rango de su tamaño, cada uno en su región, y 6, 6 y 7 lugares encadenados.<br>**En `ejemplo`, la orden del Marqués cruza la horca, la torre, la ermita y la quinta.** Leída a mano, la cadena es real y no de relleno:<br>· la tablilla de la horca da el nombre del zapador;<br>· ese nombre abre al hermano Blas en la ermita;<br>· Blas da la orden «para Inés» o «para el Marqués» según lo que se sepa (`libro-de-fondovalle`, `encargo-del-marques`);<br>· la torre necesita además el badajo de la balsa. |
| 4 | Árboles hondos (≥ 6 nodos y ≥ 3 niveles la gente principal) | ✅ | **Tabla:** ninguna persona principal baja de 6 nodos y 3 niveles; la referencia tenía 2-3.<br>**Leído a mano en `ejemplo`, no es relleno:**<br>· Ginés: pasado → mentira → orkos; el testigo, si se sabe el nombre; lo que quiere.<br>· Inés: quién es → prometido → sospecha, a la que responde «Las sospechas no se apuntan: se rezan»; el libro → requisitos; las casacas; el sello falso.<br>· Blas: tres revelaciones según lo que se sepa y tres maneras de pedir la orden.<br>· El Marqués: la mentira oficial, el molinero y el Robledal, el encargo, leerle la orden en voz alta («Trescientos doce. Los conté yo»).<br>**Cada uno habla como dice la biblia:** el «Consta» de Inés, la tercera persona de Murg y de Chirria, el «Por mis culpas» de Blas.<br>**En la pantalla:** conversación entera con Ginés (`09`–`13`) y con Murg (`23`–`25`). |
| 5 | ≥ 2 desenlaces excluyentes, por caminos distintos, con premios distintos; se notan en otros lugares | ✅ (con H-B2) | **Núcleo, `ejemplo` (script, salida real):**<br>**A. La causa escrita.** Tablilla → «¿Qué escribe?» → Blas «para la escribana» → Chirria «suben a por ti» (nigromante) → «Colgar el badajo». Oro 25 500 → 25 700. La quinta queda solo con `sillon` (el Marqués ahogado); la ermita, con `habito` (la espada); el campamento, con `maza`.<br>**B. La orden quemada.** «¿Ninguno de sus hombres…?» → aceptar el encargo (+100) → Blas «para el Marqués» → «Dárselo para que lo queme». Oro 25 500 → 25 900 más el arnés. En la torre queda `ines-sin-causa` con la pelea; en la ermita, `coraceros`; en el campamento, `huellas`; en la quinta, `marques-tranquilo`.<br>**Se excluyen:** tras A, el rival en la torre ve «Darle un papel con sello» apagada con «la causa de los ahogados de Fondovalle ya está escrita en su libro», y en la quinta ya no está el Marqués que compra.<br>**En la pantalla:** la marca de otro lugar apaga una opción con su frase («Busco al capitán de zapadores de la presa» → «nadie ha dicho aún en voz alta un nombre…», `23`) y un premio cobrado se apaga («la plata fundida del Robledal ya no está entre los tocones», oro 26 000 → 26 150, `26`). El desenlace entero no se jugó en la pantalla: ver «No probado». |
| 8 | `ejemplo` regenerado vale y casa con el banco | ✅ (con H-B6) | `pnpm mundo validar ejemplo` → «vale».<br>`pnpm npcs estado`: sus seis figuras están `pintada` (`esqueleto-molinero-ahorcado`, `goblina-trapera`, `templario-penitente-viejo`, `orko-caudillo-viejo`, `necropolis-escribana-espectral`, `imperio-burgomaestre-anciano`) y se ven en la escena (Ginés esqueleto en `12`, Murg en `23`).<br>Las de la tercera generación siguen pintándose: `elfa-guardiana-de-la-fuente` pendiente, `elfa-arquera-desertora` con 1 de 8 direcciones. |
| 9 | Ejercido de verdad y comparado con la referencia | ✅ (con H-B3) | Tres generaciones reales (dos desde el menú), las tres validan y se miden arriba.<br>Tiempo: 19-28 min. |
| 10 | `CLAUDE.md` y `pnpm verify` | ✅ | `verify` en verde (arriba). `CLAUDE.md` dice el tope de 60 min y «de 15 a 30 minutos» en el menú, que coincide con 8e339945. |

## Hallazgos

### Importantes

**H-B1. Los mundos se heredan unos a otros por el banco de figuras: el tercero es el segundo con otros
nombres.**

- **Lo que se ve en la tercera generación (elfos, `172041`), frente a `ejemplo`:**
  - **Fondo:** una atrocidad tapada por una autoridad (el valle anegado o el bosque quemado), con unos
    300 muertos (312 o 318).
  - **Una escribana espectral** con el libro de sus nombres y el tic «Consta» / «Todo consta» (Inés o
    Maelis).
  - **Un molinero ahorcado llamado Ginés**, que vio la verdad, con la misma figura,
    `esqueleto-molinero-ahorcado`.
  - **Un papel firmado** que es la prueba.
  - **Un «Osorio»** (marqués en uno, mayordomo en el otro).
  - **Los desenlaces:** leer en voz alta, quemar o vender.
- **Lo que se ve en `ejemplo`, frente a la primera (orkos, `830000`):**
  - el penitente templario en su ermita (Teobaldo o el hermano Blas);
  - la goblina trapera (Uñanegra o Chirria);
  - el caudillo orko viejo «Dientenegro» o «Diente Negro»;
  - las tres con las mismas figuras.
- **La causa no es copiar el ejemplo.** La tercera no leyó `ejemplo`: lo intentó con un `Bash`
  (`wc`/`grep` de sus textos) y se le denegó, y solo leyó `prueba` (stream). La causa es el banco:
  - las figuras que pide un mundo entran en `npcs.figuras` con su descripción de personaje y su
    `pedidaPor`: «esqueleto de ahorcado… calzas pardas de molinero con manchas viejas de harina»,
    «penitente templario… cruz roja de tela medio descosida»;
  - el motor siguiente las ve en su lectura y, con un tope de 4 figuras nuevas, construye a su gente
    sobre ellas;
  - el `necropolis-guardian-viejo` de la semilla («túnica negra… ribetes morados… farol apagado»)
    es, palabra por palabra, el Osorio de la tercera.
- **Lo agravan dos cosas que no son de esta tarea:**
  - **Los nombres de las regiones y las ciudades son los mismos en los tres mapas.** Tierras de
    Valdeluz, Llanos del Cierzo, Valle Hondo, Robledal, Páramo Gris, Vega del Molino, Hoya de los
    Cuervos…; Valdeluz, Cripta Gris, Torreblanca, Puenteroto, Alcázar Hondo… (`lectura.json` de los
    tres). Así sale un «Robledal» quemado en dos mundos.
  - **Opus tiene nombres favoritos** («Ginés», «Osorio»).
- **Qué esperaba quien juega:** que el tercer mundo no le cuente la historia del segundo. Cada mundo,
  leído solo, es bueno. Pero la petición era «tramas interesantes y originales», y la herencia crece
  con cada mundo que se genera, porque cada uno deja figuras de su trama en el banco.

**H-B2. Lo que tiene o sabe un jugador lo usa el otro: las marcas de trama son del mundo, y el
vocabulario no puede decir «lo lleva este jugador».**

- **Reproducción en el núcleo** (`desenlaces.mts`, caso C, `ejemplo`):
  1. El rival (j1) lee la tablilla y le quita la orden al hermano Blas.
  2. Quien juega (j0), que nunca ha tenido el papel, va a la quinta y «Dárselo para que lo queme».
  3. Resultado: oro 25 500 → 25 800, más el arnés de placas. Los hechos son
     `world_mark(1) world_mark(1) world_mark(0) place_state(0) gold_gained(0) loot_found(0)`.
  4. Al rival, con «el papel en el bolsillo», la torre le enseña ya a la Inés furiosa.
- Lo mismo pasa con el badajo, el cuerno (`830000`) y el libro (`172041`). La biblia de la tercera
  lo reconoce: «un libro que el rival saca y no vende queda suelto, y quien juega puede llevarlo
  igual».
- **Pasa también con lo que se sabe** (caso D): el rival habla con Ginés y fuerza el cepillo, y
  entonces, a quien juega:
  - Inés le enciende «Contarle lo que vio el molinero de los Pardo» sin haberlo visto nunca;
  - y «Preguntarle qué consta de ti» le responde «Consta usted en el libro: ciento veinte del
    cepillo de San Roque, a deber» (`ines/deudor`), un robo que hizo el otro.

  Es el mismo error que la regla del `ya` evita, pero dentro de un nodo.
- **Por qué importa:** es el caso concreto que pedía el criterio 6 («solo se amplía si aparece un
  caso que no se pueda escribir, y se cita»). Hoy, la posesión de un objeto de trama que no es una
  pieza del catálogo no se puede escribir.
- **Pide una decisión:** aceptarlo como «el mundo es de los dos», o ampliar (una marca por jugador o
  un `lleva` de objetos de trama).

**H-B3. Generar tarda de 19 a 28 minutos, y el usuario aceptó de 5 a 10.**

- `requisitos.md`, «Decisiones del usuario»: «se acepta que generar tarde 5-10 minutos».
- Lo medido es entre 2 y 5 veces eso. 8e339945 sube el tope a 60 min y el menú dice «de 15 a
  30 minutos».
- El stream dice que de 12 a 18 minutos se van pensando antes de escribir nada (`motor.ts`), con
  129 000 tokens de pensamiento en la tercera.
- No consta en la carpeta que se le haya preguntado al usuario. Pide su visto bueno, o bajar el
  esfuerzo.

### Menores

**H-B4. Lo que describe un nodo no cambia tras el desenlace, y a veces contradice la biblia** (`ejemplo`).

- **Inés, tras `causa-escrita`:**
  - sigue abriendo con «Nombre, vecindad y asunto»;
  - «¿Qué escribe?» dice que la columna de la causa «está en blanco de arriba abajo» (comprobado en
    el núcleo tras el caso A).
- **La torre:** «Mirar hacia abajo» sigue con la gente «como quien espera a que toquen a concejo»
  después de tocar.
- **Los tocones:** siguen describiendo la plata ya cogida (`26`).
- **Murg:**
  - tras `orden-quemada` sigue hablando junto a su lumbre, aunque la biblia dice que «ha apagado la
    lumbre y no habla con nadie» (solo la cosa `huellas` lo cuenta);
  - tras vencer a su banda, saluda igual.
- **Ginés:** llevárselo en la tropa deja «La arena removida» como si se hubiera enterrado a los dos.
- **Por qué no lo cazó el motor:** su relectura miró que los lugares, las marcas y los desenlaces
  estén en las dos, no el texto de los nodos que no llevan condición.

**H-B5. Las tres biblias tocan el techo de 4 000 palabras de la skill** (3 997, 3 830 y 3 931). En la
tercera, el motor gastó varias `Edit` en recortar («la biblia supera las 4 000 palabras»). Es una
observación: o el techo es justo o el motor escribe hasta él.

**H-B6. `ejemplo`, que se va a commitear, depende de figuras pedidas por un mundo que no va a git.**

- `data/npcs.json` lleva `pedidaPor: gen-20261023-830000` en `orko-caudillo-viejo`, `goblina-trapera`
  y `templario-penitente-viejo`, que usa `ejemplo`.
- `ejemplo`, `data/npcs.json` y las siete carpetas de `assets/npcs/` siguen sin commitear
  (`git status`).

**H-B7. El motor ejecutó `ls -la … && wc -c …` aunque la skill le dice que validar es «la única orden
que tienes permitida»** (primer `Bash` del stream de la tercera, con resultado). Claude Code deja
pasar órdenes de solo lectura con `dontAsk`. No hace daño, pero el permiso no es tan cerrado como se
cree.

### Contexto (fuera del alcance de esta tarea)

**C-B1. Una trama de 6 o 7 lugares por un mapa de 42 o 51 casillas no se recorre antes de que acabe
la partida.**

- **En el navegador** (`ejemplo`, primera partida): el héroe salió de la base hacia la torre y, el
  día 3, el héroe imperial tomó Valdeluz. «¡Te atacan! Defiéndete» → «Resolver sola» → «Partida
  perdida» (`raro-2`, `19-dia4`).
- **`lugares-ia.ts`:** 0 hechos de lugar en los tres mundos; las partidas acaban los días 7, 6 y 4.
- Así, «el rival puede cerrar un desenlace» hoy es teórico (H9 de la F1a).

**C-B2. Lo que se ve no es lo que se cuenta (F2):**

- la horca de la Raya, en la arena roja, se pinta como una plaza imperial de noche (`04`);
- el Robledal que arde por debajo se pinta como un campamento con pinos verdes (`23`).

## Workarounds usados

- **En el núcleo, el héroe se planta en cada lugar** (`hero.at`) y el turno se cambia a mano
  (`state.current`), para probar los dos desenlaces y los casos entre jugadores sin andar 30
  casillas. Las acciones van por `applyAdventureAction`, la puerta de siempre. No afecta a quien
  juega.
- **«Ver mapa entero» y el minimapa para mover la cámara**, en vez de arrastrar. Es un gesto que
  quien juega también tiene.
- **La referencia, con sus `cuerpo` cambiados por figuras del banco**, solo para medirla, porque ya
  no valida con el formato nuevo.
- **El Chromium de Playwright arrancado a mano** con `--remote-debugging-port` y conducido por CDP,
  para no perder la partida entre un script y el siguiente.

## No probado

- **El desenlace entero en la pantalla:** reunir orden y badajo, o encargo y orden, pide recorrer
  4 lugares por el mapa, y la partida se perdió el día 3 (C-B1). Lo cubre el núcleo, con su salida
  arriba.
- **Las conversaciones de Inés, Blas y el Marqués en la pantalla.** Se leyeron enteras en el JSON.
- **Jugar `830000` y `172041` en el navegador,** y cómo se ve una figura aún sin pintar de la tercera
  (Eithne).
- **La espera del menú con el motor real:** son las capturas del ingeniero en `faseb/menu` y
  `faseb/grande`, que no se miraron.
- **`pnpm qa`, `capturas`, `banco` y `verify:lento`:** la fase B no toca `src/server/`, el contrato
  ni el juego.

## Veredicto (fase B)

**Apto con reservas.**

- **Lo que está bien:**
  - los números de los criterios 3, 4, 5 y 9 se cumplen con holgura en los tres mundos, y no por
    relleno;
  - `ejemplo` se lee como una trama de verdad: un secreto con capas, gente con voz, una cadena por
    cuatro lugares y dos desenlaces que se excluyen y se notan en otros tres sitios;
  - la validación del motor ya funciona (la tercera validó dos veces y se contó);
  - `pnpm verify` en verde.
- **Reservas, las tres para decidir con el usuario antes de dar la tarea por cerrada:**
  - **H-B1:** los mundos se parecen porque heredan su gente del banco de NPC (y los mapas comparten
    nombres);
  - **H-B2:** un jugador usa lo que tiene o sabe el otro, y es el caso concreto del criterio 6;
  - **H-B3:** generar tarda de 19 a 28 minutos frente a los 5-10 aceptados.
- **H-B4 a H-B7** son menores.
