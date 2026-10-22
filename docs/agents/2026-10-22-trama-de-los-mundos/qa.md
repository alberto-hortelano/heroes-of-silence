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
