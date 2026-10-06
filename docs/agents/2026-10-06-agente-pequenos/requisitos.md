# Requisitos: tres arreglos pequeños del agente y la barra (#123, #126, #128)

## Petición literal
Usuario, 06-10-2026: «¿Hay algo que podamos ir haciendo en paralelo? Puede ser en la otra copia del repo». Entre las opciones, eligió «#123/#126/#128 pequeños».

Los issues:
- **#123**: `notaFinDePartida` (lo que recibe el agente al terminar) no dice la causa, aunque `player_defeated.reason` existe. La barra de estado no se refresca al empezar el día. La barra dice «hoy llegas a 7 de 20 pasos» aunque la ruta atraviese la niebla, y así deja adivinar el rodeo que el trazo ya no pinta.
- **#126**: `hireHero` genera `hero-${player}-${heroes.length}-${day}`, y el id se repite si se contrata, se pierde y se vuelve a contratar el mismo día. Arreglo propuesto: un contador en el estado, como el de `Veterania.id`.
- **#128**: `lineaLegible` (`src/core/contract/agent.ts`) acepta U+2028/2029, U+202E (RLO) y caracteres invisibles (U+2800, U+3164, un acento combinante suelto).

## Criterios de aceptación
1. Cada issue, arreglado con un test que lo demuestra, visto en rojo antes.
2. #126: un id de héroe no se repite nunca. Si cambia `pnpm banco`, se juzga la forma del diff (qué semillas y cuál es el primer hecho distinto) antes de re-anclar.
3. #128: `lineaLegible` rechaza lo de la lista con un motivo legible, y lo legible de hoy sigue pasando (acentos, ñ, emojis si hoy pasan).
4. `pnpm verify` y `pnpm qa` en verde.

## Contexto
- Worktree `/home/al/code/heroes-pequenos`, rama `agente-pequenos`, sacada de `main` (857a849). Al mismo tiempo, en `main` se toca `src/client/render/escenario/{colocar,pintar,relieve}.ts` (#150): no tocar esos ficheros. Otros worktrees: `heroes-niebla` (#146, la niebla en bits; ojo, #123 también lee niebla en la barra) y `heroes-capturas` (#154).
- Alguno puede estar obsoleto: el crítico lo comprueba.

## Restricciones
- Medidas con 10 semillas. `pnpm capturas` solo en QA.
- El navegador, solo con Playwright sin pantalla; nunca las herramientas claude-in-chrome.
- Puertos propios: el 3100 y el 3636 no se tocan. Nada de pkill ni killall.
- No hacer commit.

## Precisiones tras la crítica (todas VIGENTES, 06-10-2026)


Para pegar bajo «Criterios de aceptación»:

> 5. #123: la nota de fin lee la causa de la misma derivación que el cliente (`causaDelFinal`); no se escribe una segunda búsqueda en `src/server/`.
> 6. #123: ninguna frase de la barra de ruta («llegas hoy (N pasos)», «hoy llegas a X de Y») cuenta pasos sin explorar; cuenta lo mismo que pinta `pasosAPintar`, sin una lectura nueva de la niebla (choca con #146 si la añade).
> 7. #123: la barra queda limpia, o al día, al volver el turno a la persona, sin mover el puntero.
> 8. #126: la colisión solo es alcanzable con ≥ 3 jugadores (un héroe sale de `state.heroes` solo si su dueño no tiene base); el test la monta así. En el banco la forma admisible del diff es únicamente el campo `hero` de hechos sobre héroes contratados.
> 9. #128: la lista del issue son ejemplos; se cubren también U+FFA0 y U+115F y, en general, los separadores de línea/párrafo, los controles de dirección y lo que se pinta en blanco. Siguen pasando «Peña», 🐉, ❤️ (U+FE0F) y 👨‍👩‍👧 (U+200D).

- #146 quedó aparcada (PREMATURA): no hay conflicto con ella. La barra cuenta lo mismo que ya pinta `pasosAPintar`, sin una lectura nueva de la niebla.

## Punto de control del plan (06-10-2026)

- Plan aprobado tal cual.
- Frase de la barra cuando la ruta entra en la niebla, elegida por el usuario: «hoy andas N de los M pasos que se ven; sigue por tierras desconocidas».
