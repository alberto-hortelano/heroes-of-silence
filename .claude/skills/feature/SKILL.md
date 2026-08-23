---
name: feature
description: Ejecuta el ciclo de equipo sobre una tarea — requisitos (coordinador) → crítica (crítico) → plan (arquitecto) → implementación y tests (ingeniero) → validación (QA) → corrección de hallazgos. Úsala para cualquier trabajo sustancial de Heroes of Silence; para un cambio trivial es sobrecoste.
---

# /feature — ciclo de equipo

Tú eres el **coordinador**: hablas con el usuario, decides el alcance y delegas. Los cuatro roles (`critico`, `arquitecto`, `ingeniero`, `qa`) viven en `.claude/agents/`. Arrancan con contexto limpio y **no se ven entre sí**: todo lo que necesitan viaja por ficheros. Si no lo escribes ahí, no existe para ellos.

`<tarea>` = `AAAA-MM-DD-slug-corto` (fecha de hoy, slug en kebab-case del objetivo).

**Los cinco documentos viven en `docs/agents/<tarea>/`** — una carpeta, una ruta que pasar. Tres se commitean y dos no, y de eso se encarga `.gitignore`, no tu memoria:

| Fichero | Lo escribe | ¿Se commitea? |
|---|---|---|
| `requisitos.md` | coordinador | **sí** — qué se pidió, con la cita literal. Envejece bien: es historia |
| `critica.md` | `critico` | **sí** — por qué la tarea se hizo así, se reencuadró o se descartó |
| `qa.md` | `qa` | **sí** — qué se verificó y con qué evidencia |
| `plan.md`, `implementacion.md` | `arquitecto`, `ingeniero` | **no** — son andamio: a los tres meses son documentación falsa que alguien se cree |

Pasa siempre la **ruta absoluta** de la carpeta al lanzar un rol: ellos no adivinan dónde está.

## 1 · Requisitos (lo haces tú, sin delegar)

Antes de lanzar a nadie, escribe `docs/agents/<tarea>/requisitos.md`:

- **Petición literal** del usuario, citada. Es la referencia de QA; si la parafraseas, la corrompes.
- **Criterios de aceptación** numerados y comprobables. Los absolutos se expanden a estados concretos.
- **Fuera de alcance**: lo que NO se hace, para que nadie lo amplíe por su cuenta.
- **Contexto** que solo tú tienes: decisiones de la conversación, presupuesto de fal.ai si lo hay, la pantalla donde importa.
- **Preguntas abiertas** con su suposición por defecto.

Si algo ambiguo cambia materialmente el trabajo, pregúntalo AHORA — no a mitad del ciclo, cuando ya se ha gastado un plan.

## 2 · Crítico

Lánzalo con la ruta, antes que a nadie. Devuelve `critica.md`, que empieza por un veredicto:

- **VIGENTE** → sigue al arquitecto sin más trámite. Es el caso frecuente y cuesta minutos.
- **REENCUADRADA** o **PREMATURA** → **lleva la crítica al usuario antes de seguir**: cambia lo que se va a construir, así que no es tuya la decisión. Sus correcciones entran en `requisitos.md`.
- **OBSOLETA** → no lances al arquitecto. Enseña la evidencia al usuario y, con su visto bueno, cierra el issue con el texto que trae la crítica.
- **EN CONFLICTO** → decide con el usuario el orden o la fusión, y reescribe `requisitos.md`.

Sáltatelo solo cuando la tarea la acaba de describir el usuario en la conversación. Para cualquier cosa que venga de la cola de issues, **no lo saltes**: ese es justo el material que se pudre.

## 3 · Arquitecto

Lánzalo con el objetivo en una frase y la ruta. Devuelve `plan.md` (tope: 120 líneas).

**Punto de control humano**: presenta al usuario el resumen del plan —recomendación, ficheros, mejoras propuestas, riesgos— y espera su visto bueno o sus correcciones. Las correcciones se anotan en `requisitos.md` antes de seguir.

## 4 · Ingeniero

Lánzalo con la ruta y la instrucción de seguir `plan.md`. Devuelve código, tests e `implementacion.md` con la verificación ejecutada.

Si el informe trae desviaciones que afectan al diseño, vuelve al arquitecto (o decide tú si es menor) antes de pasar a QA.

**Antes de llamar a QA**, un paso barato que evita una vuelta entera: invoca `/simplify` sobre el diff. El código recién escrito casi siempre tiene una abstracción de más o una duplicación que se ve mejor en frío.

## 5 · QA

Lánzalo con la ruta. Devuelve `qa.md` con veredicto.

- **Apto** → paso 6.
- **Hallazgos** → reanuda al **mismo ingeniero** con `SendMessage` (conserva su contexto: más barato y sin relectura) pasándole los hallazgos concretos. Después, QA re-verifica *solo* los criterios afectados más una pasada adversarial nueva.
- Dos vueltas sin cerrar: para y consulta al usuario. Un bucle QA↔ingeniero que no converge suele significar que el requisito está mal escrito, no que el código esté mal.

## 6 · Cierre

Resume al usuario: qué se hizo, qué demuestra que funciona, qué quedó fuera y el backlog que propuso el arquitecto. **El backlog va a issues de GitHub**, no a un documento. No commitees ni abras PR salvo que se pida.

## Cuándo NO usar esto

Cambio de una línea, typo, ajuste de color, pregunta, o un experimento que se va a tirar. El ciclo cuesta cuatro contextos: si el trabajo es menor que su coordinación, hazlo tú y ya.

## Paralelismo

Crítico → arquitecto → ingeniero → QA es una cadena; no la paralelices (y el crítico va primero justamente para que los otros tres no se gasten en balde). Lo que sí puede ir en paralelo, en un solo mensaje con varias llamadas a `Agent`, es la **exploración previa**: varios `Explore` sobre zonas distintas para alimentar `requisitos.md`.
