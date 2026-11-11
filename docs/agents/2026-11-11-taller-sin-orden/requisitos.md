# Requisitos — taller-sin-orden

Tarea: `2026-11-11-taller-sin-orden`. Issues: 327. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (igual a `main`, `d791d03c`).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

El coordinador eligió esta tarea entre los issues abiertos. Lo que pide cada issue, tal cual:

### #327 — `pnpm taller` a secas lanza el trabajador: que pida una orden

> `pnpm taller` sin argumentos arranca el trabajador y empieza a gastar imágenes de Codex. Un agente lo lanzó por error el 10-11 y pintó una imagen que nadie había pedido. Sin orden debería enseñar la ayuda y salir; el trabajador, solo con `pnpm taller trabajar`. De paso, `pnpm npcs trabajar` es hoy el mismo trabajador con otro nombre: unificar o renombrar.
> 
> Viene del cierre de «La base con vida» y «Arte de los lugares» (10/11-11-2026, commits 9a533eb5 y 243c56f4; detalle en `docs/agents/2026-11-10-base-con-vida/` y `docs/agents/2026-11-10-arte-de-los-lugares/`).

## Criterios de aceptación

1. `pnpm taller` sin argumentos enseña la ayuda (las órdenes) y sale sin gastar nada; con una orden desconocida, lo dice y sale con código ≠ 0.
2. El trabajador arranca solo con `pnpm taller trabajar`.
3. `pnpm npcs trabajar`: o se unifica con `pnpm taller trabajar` o queda claro qué hace distinto; decisión anotada en `docs/art/taller.md` con fecha.
4. Las docs que digan `pnpm taller` a secas para lanzar el trabajador (CLAUDE.md, `docs/art/*.md`, skills en `.claude/skills/`) se corrigen; `test/documentacion.test.ts` en verde.
5. Se ve arrancar (y morir) la orden: `pnpm taller` a secas imprime la ayuda; **no se lanza el trabajador de verdad** (gasta imágenes de Codex): como mucho, se comprueba su arranque sin que encargue nada.

## Fuera de alcance

#330 (limpiar `_vivos/` y el sondeo).

## Contexto

Herramienta de desarrollo: ingeniero solo, sin QA (regla de dosificar el ciclo). Docs: `docs/art/taller.md`. Presupuesto de pruebas: typecheck, lint y los tests de lo que se toca.
