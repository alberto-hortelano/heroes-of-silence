# Ciclo de agentes

Aquí vive un directorio por tarea, `AAAA-MM-DD-slug`, con los documentos que se
pasan entre sí los cuatro roles de `.claude/agents/`. Arrancan con el contexto
limpio y no se ven entre ellos: **si algo no está escrito aquí, para ellos no
existe**.

| Fichero | Lo escribe | ¿Se commitea? |
|---|---|---|
| `requisitos.md` | el coordinador | **sí** — qué se pidió, con la cita literal |
| `critica.md` | `critico` | **sí** — por qué se hizo así, se reencuadró o se descartó |
| `qa.md` | `qa` | **sí** — qué se verificó y con qué evidencia |
| `plan.md` | `arquitecto` | no |
| `implementacion.md` | `ingeniero` | no |

Los tres primeros describen **decisiones** y envejecen bien. Los dos últimos
describen código, y el código cambia: commiteados, a los tres meses son
documentación falsa que alguien se cree. Los ignora `.gitignore`, no la memoria
de nadie.

El ciclo se lanza con la skill `/feature`.
