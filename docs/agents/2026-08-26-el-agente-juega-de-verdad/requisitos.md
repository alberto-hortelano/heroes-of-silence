# Requisitos — el agente juega de verdad

**Issues**: los seis del hito 2 — #33, #27, #28 (el contrato anuncia lo que no
existe) y #30, #32, #34 (nadie puede ver jugar al agente).

## Petición literal del usuario

> «Con cual seguimos?»

y, ante tres racimos, la elección de **«El agente juega de verdad (hito 2)»**.

## Por qué este racimo y no otro, dicho para que se pueda juzgar

`CLAUDE.md` abre diciendo qué es esto: *«Clon de HoMM2 en el navegador, pensado
como banco de pruebas para un juego con IA: los NPCs los lleva un agente
conectado por MCP, los mapas los diseña ese mismo agente… El juego es el
andamio; lo interesante es lo que se puede enchufar dentro.»*

**Llevamos tres ciclos seguidos arreglando el andamio** —economía, experiencia y
magia, y el núcleo por dentro— y ninguno ha tocado lo que hace especial al
proyecto. Este hito es además el más cerca de cerrarse entero: **6 issues**, la
mitad de los cuales son enchufar piezas que ya están escritas y probadas.

## Los seis, en dos mitades que no se parecen

### A · El contrato anuncia cosas que no pasan

| Issue | Qué |
|---|---|
| **#33** | `ws-server.ts` sirve la consulta `map` y **ninguna tool MCP la expone**: endpoint huérfano |
| **#27** | `map_generate` es **una de las tres promesas del proyecto**; el esquema, `validateMapPlan` y `buildMap` están escritos y testeados, y **solo los usa un test** |
| **#28** | `hero_banter` tiene esquema y `RESPONSE_FORMAT`, **se le anuncia al agente** en `heroes_listen`… y no tiene serializador, ni punto de llamada, ni sitio donde mostrar la frase |

Los tres son la misma clase de defecto y es una que esta sesión lleva persiguiendo
desde el primer ciclo: **algo declarado que no ocurre**. Aquí es peor que en el
núcleo, porque **el destinatario del anuncio es un agente que no puede leer el
código para descubrir la mentira**: se le dice que puede recibir `hero_banter`,
lo espera, y no llega nunca.

### B · Nadie puede ver al agente jugar

| Issue | Qué |
|---|---|
| **#30** | `ws-server.ts` emite un `SpectatorSnapshotMsg` cada turno al puerto de espectadores y **no hay ningún cliente que lo lea** |
| **#32** | `SpectatorLogMsg` está declarado en `protocol.ts:77` y tiene **cero emisores** |
| **#34** | `session.ts` instancia la partida **en el propio navegador**: el juego y el agente son dos partidas distintas que no se hablan |

Hoy, ver jugar al agente consiste en **leer los `console.log` del servidor**.

## Criterios de aceptación

### Para los tres del contrato

1. **Nada anunciado al agente puede seguir sin existir al cerrar este ciclo.** Cada
   uno de los tres se resuelve en una de las dos direcciones —se enchufa, o se
   retira el anuncio— y **ninguna de las dos es la opción cómoda por defecto**: se
   elige con un motivo escrito.
2. **#27 cae de pie con o sin agente.** `link.ask('map_generate', …)` con **caída
   al generador procedimental** si el agente no responde, no responde a tiempo, o
   responde algo que `validateMapPlan` rechaza. El juego se juega sin agente: es
   un contrato de este repositorio y tiene test.
3. **El mapa que diseña el agente pasa por `validateMapPlan`** y un plan inválido
   se le **devuelve con el motivo**, como el resto de sus acciones. No se corrige
   en silencio.
4. **#33 respeta la niebla.** La consulta `map` ya pasa por `jugadorDelAgente` y
   `serializeKnownMap`; la tool nueva no puede abrir una puerta al lado. Y su
   descripción **dice qué acepta**, porque un agente que recibe un rechazo sin
   haber sido avisado no se corrige: reintenta.
5. Si `hero_banter` se enchufa, la frase **se ve** en alguna parte. Una frase que
   se genera y no se muestra es el mismo bug con un paso más.

### Para los tres de ver jugar

6. **Se puede ver una partida del agente sin leer un `console.log`.** Ese es el
   criterio, y todo lo demás es cómo.
7. **`SpectatorLogMsg` se emite o se borra.** Un tipo declarado con cero emisores
   es deuda que se paga sola cuando alguien lo lee y cree que funciona.
8. El espectador **no puede jugar**: mira. Si se pudiera actuar desde ahí,
   habría dos escritores sobre el mismo estado.

### Lo que no puede romperse

9. `pnpm verify` verde y **`pnpm qa` verde**, que aquí no es opcional: este racimo
   entero vive en `src/server/` y en el contrato.
10. **El juego se sigue jugando sin agente y sin servidor.** Es un contrato escrito
    y tiene test. Si #34 hace que el navegador necesite un servidor para arrancar,
    **el cambio está mal**.
11. `pnpm banco` no tiene por qué moverse: nada de esto es `core`. **Si se mueve,
    es que algo se coló donde no debía** — y ese es el guardia gratis que tenemos.
12. **0 € de fal.ai.**

## Fuera de alcance

- **Arte nuevo** de cualquier clase (#37-#42).
- **Cambiar las reglas del juego**, la IA o la economía. Este racimo es fontanería
  y pantalla.
- **Autenticación, despliegue o multijugador humano.** El espectador es local.

## Preguntas abiertas, con su suposición por defecto

- **¿#34 hace innecesario #30, o #30 es el escalón barato hacia #34?** Si
  `session.ts` habla por WebSocket, el navegador ya ve la partida del servidor y
  puede que no haga falta un cliente espectador aparte. *Por defecto, el orden que
  diga el crítico*: sospecho que hacer los dos por separado es trabajo duplicado y
  quiero que lo resuelva antes de que nadie escriba código.
- **¿#28 se implementa o se retira del anuncio?** *Por defecto se implementa* —es
  una frase, es barato y es sabor—, pero si el sitio donde mostrarla no existe y
  hay que inventarlo, retirarlo del anuncio es una respuesta legítima y más
  honesta que dejarlo a medias.
- **¿#34 cabe en este ciclo?** Es el más grande de los seis con diferencia: toca la
  única puerta del cliente al núcleo. *Por defecto sí*, pero si el crítico o el
  arquitecto lo ven de un ciclo entero, se parte y se dice.

## Decisiones tomadas

1. **Se lanza crítico.** Hay dos preguntas que solo se responden leyendo el
   código —el solapamiento #30/#34 y si #34 cabe— y equivocarse en ellas cuesta el
   ciclo entero.
2. **Los seis se miran juntos aunque acaben en tandas distintas**, porque las dos
   mitades se tocan: el espectador enseña lo que el contrato entrega.
