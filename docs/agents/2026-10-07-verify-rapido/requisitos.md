# Requisitos — #167, `pnpm verify` rápido otra vez

## Petición
- Del usuario (07-10-2026), sobre por qué tarda tanto el ciclo, a la propuesta «una issue para devolver `verify` a 15-20 s»: «si».
- Mandato después: «Sigue cerrando issues y mejorando el mapa de forma autónoma hasta que esté bien».

## Contexto
- Issue #167. Hoy `pnpm verify` tarda ~64 s (1 998 tests). Lo pasa cada agente varias veces por tarea.
- Ciclo dosificado: es una herramienta de desarrollo, así que solo ingeniero, sin QA. El coordinador lo comprueba al final.

## Criterios de aceptación
1. **`pnpm verify` en 15-20 s** en esta máquina, medido tres veces con la máquina tranquila (con otras sesiones corriendo puede variar; dilo). Si no se llega, di qué queda y por qué.
2. **Ningún guardia desaparece.** Lo que se saca de `verify` sigue en una orden aparte, por ejemplo `pnpm verify:lento` o `pnpm test:lento`, que:
   - corre en CI (`.github/workflows/ci.yml`);
   - y se documenta en `CLAUDE.md` (Arrancar y la tabla de «Control de calidad»), con texto propuesto en `implementacion.md`. No lo edita el ingeniero.
3. **Cada guardia sigue mordiendo en `verify` con pocas semillas (1-3)**, y las medidas de 10-100 semillas van a la orden lenta. El criterio para decidir qué es lento se escribe en `implementacion.md`, con una tabla de tiempos de antes y después por fichero.
4. **Antes de partir un test, se mira si se puede abaratar**: escenas compuestas una vez y compartidas (`partidaDe` ya cachea), `componer` repetido, `beforeAll`… Abaratar es mejor que mover.
5. `pnpm banco`, `pnpm qa` y `vite build` siguen como están.

## Fuera de alcance
No se cambia la lógica del juego ni del escenógrafo.
