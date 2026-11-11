# Requisitos — cronica-del-espectador

Tarea: `2026-11-11-cronica-del-espectador`. Issues: 202. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (igual a `main`, `d791d03c`).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

El coordinador eligió esta tarea entre los issues abiertos. Lo que pide cada issue, tal cual:

### #202 — Crónica: el espectador pinta en verde la caída de un héroe, concordancias («Un Momia») y coordenadas que no se pueden localizar

> Visto al cerrar #18:
> 
> - El espectador pinta en verde «Un héroe del jugador 1 vuelve a su base» y «Ha caído un héroe…»: `clase(!mio, mio)` con viewer = −1 lo pinta como victoria.
> - Concordancias: «Un Momia», «pierde el jugador 1 2 × Momia».
> - La crónica dice « en (12, 5)» pero el mapa no enseña coordenadas: la línea podría ser pulsable y centrar la cámara.
> 
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)
> 
> https://claude.ai/code/session_01WUDtu2k5ot9xisTpJtEYDy

## Criterios de aceptación

1. En el espectador (viewer sin bando), la caída de un héroe y su vuelta a la base no se pintan como victoria: la clase de color de una línea de crónica es neutra (o la del bando que toca) cuando quien mira no juega.
2. Concordancias: «Un Momia», «pierde el jugador 1 2 × Momia» y las del mismo tipo salen bien escritas (género de la unidad, o una forma que no lo necesite). Se buscan las frases de la crónica con el mismo defecto, no solo esas dos.
3. Coordenadas: la línea que dice «en (12, 5)» deja de dar coordenadas que nadie puede localizar: o es pulsable y centra la cámara (en la partida y en el espectador), o nombra el sitio de otra forma. Decide el arquitecto.
4. Lo de cada punto se comprueba en el navegador (Playwright, sin pantalla) además de con tests de lo tocado.

## Fuera de alcance

Los hechos que lee el agente (`contract/hechos.ts`).

## Contexto

Áreas: `docs/areas/interfaz.md`, `docs/areas/agente.md` (espectador). Puede que parte ya esté arreglado desde que se abrió (#18 es viejo): el crítico lo comprueba. Presupuesto de pruebas: tests de lo tocado; `pnpm capturas` no (lo pasa el coordinador al final de la tanda).

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`). El coordinador acepta su alcance, que solo estrecha la tarea (el usuario le encargó coordinar). Los criterios 2, 3 y 4 de arriba quedan **sustituidos** por estos:

2. Concordancias: «Un ${unidad}» en `hero_promoted` y `troop_rank_up` (`views/cronica.ts`) sale bien con un nombre femenino (hoy, «Sacerdotisa»), sin depender de que el catálogo no tenga otro. «N × Nombre» es la notación de la crónica y se queda. Lo que se arregla es el doble número del espectador («pierde el jugador 1 2 × …», `fraseDeBatalla`), que no se lea como un solo número.
3. Coordenadas: en la partida, una línea de la crónica que cuenta un hecho en una casilla lleva a ella, o la nombra de otra forma (decide el arquitecto). En el espectador, que no tiene cámara movible, **no se le añade cámara en esta tarea**: o la línea nombra el sitio sin coordenadas, o se queda como está y se dice.
4. Los puntos 1 y 2 se prueban con tests de `renderLog` con `viewer = NADIE` que recorren todas las ramas con color, no solo las dos del issue. El navegador (Playwright, sin pantalla), solo para el punto 3 en la partida.

## Tras el plan (11-11-2026)

El coordinador aprueba `plan.md` tal cual. Pregunta abierta resuelta con la recomendación del arquitecto: la línea pulsable **no** sigue diciendo «en (x, y)» en la partida (el botón ya lleva allí); en el espectador se queda como hoy. El espectador sin cámara (coordenadas de castillos y casillas sueltas) y la marca visual al centrar van al backlog.
