**REENCUADRADA** — el problema es real y la dirección (biblia, más lugares, árboles hondos) es buena, pero la tarea pide cambios de núcleo y de validador que el código no necesita, una premisa sobre el modelo es falsa en esta máquina, y choca con el banco de NPC, que toca los mismos ficheros y el mismo formato.

## El problema real, en una frase

El motor escribe historias cortas y de un solo sitio porque **la skill se lo pide**; el formato ya admite tramas encadenadas, desenlaces excluyentes y árboles hondos.

## La premisa, afirmación por afirmación

| Afirmación | Verificación |
|---|---|
| «La skill pide de 2 a 4 lugares, cortos» | Cierto: `.claude/skills/motor-de-mundos/SKILL.md:71` («De 2 a 4 lugares, cortos: cada uno se juega en unos minutos»). La skill no menciona en ningún sitio una trama común, desenlaces ni profundidad: pide «que los lugares *puedan* conectarse». **Es la causa principal.** |
| `gen-20261022-596849`: 3 lugares, diálogos de 1-3 nodos | Cierto (medido): diálogos de 1 a 3 nodos y hondura 0-2; una sola marca cruza lugares (`caliz-recuperado`). `ejemplo`: 3 lugares, de 1 a 5 nodos, hondura ≤ 2, 2 marcas que cruzan. `prueba`: 2 lugares, ninguna marca cruza. |
| «El lanzador no fija modelo ni esfuerzo: usa el de quien lo lanza» | Cierto en el código (`tools/mundo/motor.ts:271-295`: sin `--model` ni `--effort`), pero **en esta máquina ese modelo por defecto ya es Opus con esfuerzo `xhigh` y el razonamiento siempre activo** (`~/.claude/settings.json:23,25,26`: `"model": "opus"`, `"alwaysThinkingEnabled": true`, `"effortLevel": "xhigh"`). `--settings '{"disableAllHooks":true}'` (`motor.ts:290`) añade ajustes, no reemplaza los del usuario. Por eso es casi seguro que el mundo plano ya salió de Opus a `xhigh`: **lo plano no es culpa del modelo**. Fijar `--effort high` como dice el criterio 7 **bajaría** el esfuerzo de hoy. Fijarlos sigue valiendo, pero por reproducibilidad (en otra máquina o con otros ajustes), no como arreglo. |
| `claude -p` admite modelo y esfuerzo | Cierto: `claude --help` (2.1.296) trae `--model <alias o nombre>` (`opus`) y `--effort <low\|medium\|high\|xhigh\|max>`. |
| «Hoy tarda ~1 min» | Coherente: `mundo.json` 19:29:26 e `historia.json` 19:30:52 en `gen-20261022-596849`, ~1,5 min con el pintado del mapa. |
| Tope de 15 min | Cierto (`motor.ts:44`). |
| Condición `estado` solo de este lugar | Cierto: `validar.ts:842` la comprueba contra `delLugar.estados` (los del propio lugar) y `reglas.ts:95` lee `a.mundo.estados[a.lugar.id]`. |
| `LUGARES_MAXIMOS` = 8 | Cierto (`validar.ts:58`). No hay tope de nodos por diálogo, de puntos ni de marcas; textos de nodo de 400 caracteres (`validar.ts:61-68`). |

### ¿Impide el vocabulario de hoy lo que se pide? No.

- **Encadenar lugares**: las marcas son del mundo, cualquier lugar las lee en el `si` de una opción **o de un punto** (quién está), y `alGanar`/`alPerder` las ponen (`formato.ts:157-159`). Las tres consecuencias de los ejemplos del usuario (traidor para los orkos, hereje para la Orden, la aldea que se levanta) son marcas que otros lugares leen.
- **Dos desenlaces excluyentes con premios distintos**: A con `si: [no A, no B]`, `hace: [marca A, premio]` y B al revés. `noSeApaga` lo acepta: `{no: {marca: A}}` con el efecto `marca A` cuenta como apagado (`validar.ts:783-793`). El cierre en otro lugar es lo mismo con `{no: marca A}`.
- **Árboles hondos**: navegar no tiene restricciones (todo nodo alcanzable, nada más). Mentir o presionar son opciones que ponen una marca sin premio, que ni `noSeApaga` ni el cobro una vez miran. `noCortaSuCamino` (`validar.ts:699`) solo prohíbe que una opción con `hace` e `ir` se quite el suelo a sí misma, y eso afecta a la secuencia de efectos, no a la hondura.
- **¿Hace falta el estado de otro lugar?** Solo para una condición que **cambie de vuelta**, y una trama avanza en un solo sentido: las marcas, que no se quitan nunca, son justo eso. No he encontrado ningún caso de los ejemplos del usuario que necesite otra cosa. **Se mantiene la suposición por defecto: con marcas basta, y el criterio 6 debería quedar en nada.**

## El día después

- Quien juega: más lugares en su camino, gente con la que se puede hablar más rato y una decisión que se nota en otro sitio. Es lo que pidió.
- **El mundo es de los dos** (`formato.ts:316-318`: `estados` y `marcas` son de la partida, no de cada jugador). Con desenlaces excluyentes, si el rival elige uno primero, el otro se le cierra a quien juega, y se le dice con la frase `ya` de la marca, escrita en segunda persona (`reglas.ts:122`: no dice quién la puso). Es el M2 de la F1a, que se arregló para los premios (`yaCobrado`) pero no para las marcas. Hoy es raro: el rival casi no visita lugares (H9 de `mapa-vivo/qa.md:78`) y la IA elige la primera opción con premio que encuentra en su orden (`ai/lugares.ts`). **No hay que ampliar el núcleo por esto en esta tarea**, pero la skill tiene que saberlo para que el `ya` de una marca de desenlace no diga «tú».
- La IA solo prueba `PASOS_HACIA_UN_PREMIO` = 3 opciones con `hace` sin premio antes de rendirse (`ai/lugares.ts:60`). Una trama con más pasos sin premio no la sigue, y eso no hace daño. `hariaAlgoEn` explora esas tres jugadas en cada lugar y en cada turno (`strategy.ts:112`), así que con 8 lugares y más opciones sin premio su coste crece: **se mide con el `ejemplo` regenerado** (`tools/qa/lugares-ia.ts`), no se supone.
- Lo que se vuelve más difícil: si el validador exige desenlaces o profundidad, `prueba` (escrita a mano para los tests) tiene que crecer hasta cumplirlo, y cada test que monta una historia en línea también.

## Conflictos

- **Con el banco de NPC** (`claude/affectionate-chaplygin-911d42`, 4 commits sobre la misma base 7822ecfd, la última a las 20:29). Toca justo lo que toca esta tarea: `SKILL.md` (+43 líneas), `tools/mundo/motor.ts`, `tools/mundo/disco.ts` (`validarEnDisco` con el banco), `core/mundo/{formato,validar,lectura}.ts` y las dos `historia.json` de `ejemplo` y `prueba`. Cambia el formato de la persona (`cuerpo` → `figura`, y añade `figuras` y `base` a la historia), **sin subir `VERSION_DEL_MUNDO`**, que sigue en 1. Regenerar `ejemplo` aquí antes de fusionarla gasta una de las 2-3 generaciones en un formato que se va a retirar. **Orden: fusionar primero el banco de NPC (o esperarlo) y regenerar después.** Si esta tarea sube la versión del mundo, una de las dos ramas tendrá que rehacer sus mundos.
- Con el issue tracker no hay solapamiento (`gh issue list`: nada sobre mundos ni lugares).
- Con `CLAUDE.md` no hay contradicción: «Un hecho, un sitio» lo cumple la biblia si es solo prosa para el motor.

## Coste contra valor

- **Skill y lanzador** (lugares por tamaño, biblia primero, una trama que cruza lugares, desenlaces, gente que habla mucho, `--model`/`--effort`/tope, permiso para `biblia.md` y la línea de progreso): barato y ataca la causa. Es casi todo el valor.
- **La biblia como requisito del mundo**: barato si se comprueba solo en disco (`disco.ts:22`, `FICHEROS`: la CLI y el servidor). Que la cargue la página (`cargar.ts:58`) no aporta nada: el juego no la lee y ningún mundo va al build. Sería pedir un fichero solo para decir que falta.
- **Desenlaces declarados y probados por el validador**: caro, porque probar que cada desenlace se alcanza exige simular entre lugares lo que hoy no se simula: oro, piezas, tropa que cabe y batallas que dependen de la partida (`noCortaSuCamino` solo sabe lo determinista de una opción). Y no prueba lo que se quejó el usuario: un desenlace alcanzable puede ser plano. **No hacerlo.**
- **Medidas de profundidad como regla**: el motor las cumple con relleno (nodos de «¿y qué más?») y castigan los mundos escritos a mano. El usuario no quiere guardias de jugabilidad (memoria «Pocas pruebas de jugabilidad»). **No como regla:** como una medida del QA (lugares, nodos y hondura por diálogo, marcas que cruzan lugares, desenlaces) para comparar con `gen-20261022-596849` (criterio 9).
- **No hacer nada**: el próximo mundo seguirá saliendo de 3 lugares sueltos. La parte de la skill no se puede quitar.

## Qué le cambiaría a `requisitos.md` (para pegar)

> **Criterio 4 (sustituye a la última frase):** La profundidad la pide la skill, no el validador. Se mide en el QA (nodos y hondura por diálogo de la gente principal, comparados con `gen-20261022-596849`); no es una regla de `pnpm mundo validar`.
>
> **Criterio 5 (sustituye a la última frase):** Los desenlaces los pide la skill, y el motor comprueba al releer la biblia que existen y se excluyen. El validador no los declara ni los prueba. La skill sabe que el mundo es de los dos: el rival puede cerrar un desenlace, y el `ya` de una marca de desenlace no habla en segunda persona.
>
> **Criterio 6:** El vocabulario de hoy basta (las marcas cubren el encadenamiento y la exclusión; verificado en `critica.md`). Solo se amplía si al escribir la skill aparece un caso concreto que no se pueda escribir, y ese caso se cita.
>
> **Criterio 2 (sustituye a la segunda frase):** La regla de la biblia vive en el lado del disco (`validarEnDisco`: la CLI y el servidor que genera). La página no la carga, porque el juego no la lee y ningún mundo va al build, y se dice así en `cargar.ts` y en `CLAUDE.md`.
>
> **Criterio 7 (añadir):** `--model opus` y el esfuerzo que decida el usuario. Ojo: hoy el motor ya hereda `xhigh` de `~/.claude/settings.json`, así que `high` sería bajarlo. El tope de tiempo se fija tras la primera generación real, medida (con 1,5 min por 3 lugares a `xhigh`, una biblia y 4-8 lugares pueden pasar de 15).
>
> **Antes de generar (nuevo):** se fusiona primero el banco de NPC (`claude/affectionate-chaplygin-911d42`), que cambia la persona de `cuerpo` a `figura`, la skill y `motor.ts`. Ninguna generación real antes de esa fusión.
