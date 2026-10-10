# Murallas en la arena

## Petición literal

> Vamos a trabajar en los asaltos a fortificaciones
>
> Vamos a centrarnos en la muralla: Crea una forma sencilla de dibujar muros y
> probarlos en el juego pudiendo crear los dos ejercitos y testear diferentes
> formas de muralla

Viene de #7 («El asedio no existe: hasWalls() es código muerto»), pero el
usuario la acota: **primero la muralla y un banco donde probarla**, no el asedio
entero.

## Lo que hay hoy (verificado el 09-10-2026)

- La batalla (`src/core/battle/`) no tiene obstáculos: `blockedHexes` solo cuenta
  unidades. Rejilla 11 × 9, offset odd-r.
- La arena (`pnpm arena`, `src/client/arena/`, `src/core/arena.ts`) ya monta dos
  bandos con unidades de las cinco facciones y los hace luchar
  (`batallaDeArena`: la izquierda ataca, la derecha defiende). Guarda cifras en
  `data/borradores/unidades.json` a través del servidor de desarrollo
  (`tools/arena/borrador.ts`, `vite.config.ts`).
- `hasWalls()` (`town/town.ts`) no lo llama nadie.

## Criterios de aceptación

1. En la arena hay un modo para **dibujar la muralla** sobre la rejilla de
   batalla: un clic en un hex pone o quita muro; se ve al momento. Un tipo de
   pieza al menos: **muro**; y **puerta** (ver C4).
2. Se puede **guardar una forma con nombre, cargarla y borrarla**, y hay varias
   formas de ejemplo de salida (p. ej. línea recta delante del defensor, línea
   con puerta en medio, semicírculo, en L). Se guardan en un borrador del repo
   como las unidades (`data/borradores/…`), que el juego no lee; validadas al
   cargar y fail-loud con lo que no entienda.
3. Con una muralla puesta y los dos ejércitos montados, **la pelea se juega con
   ella**: ninguna unidad que camina entra en un hex de muro ni lo atraviesa;
   las voladoras pasan por encima (como en HoMM2) pero no se posan en él.
4. **La puerta**: la cruza el defensor (derecha) y no el atacante.
5. La IA de batalla juega con muros sin colgarse: si el atacante no tiene camino,
   hace algo legal (esperar/defender/disparar) y la pelea acaba, como mucho por
   `MAX_ROUNDS`, con el resultado de siempre (`finalDeArena`).
6. Se puede **jugar a mano** al menos un bando en la arena con muralla, o, si la
   arena hoy solo enfrenta IA contra IA, verlo con la IA: el criterio es poder
   probar una forma y ver qué pasa. Las casillas a las que no se puede mover por
   el muro no se ofrecen y, si se pide, el motivo lo escribe el núcleo.
7. El muro se pinta en la batalla de la arena con un marcador claro (sin arte
   nuevo), distinto de la puerta, y las unidades no se pintan encima de él.
8. Las reglas del muro viven en `core` (la batalla sabe qué hexes son muro); el
   cliente solo dibuja y manda. Toda tirada sigue por `createRng`.
9. **Las partidas no cambian**: una batalla del mapa sigue sin muro. `pnpm banco`
   da el mismo hash; `pnpm verify` en verde; `pnpm verify:lento` al cerrar.
10. Tests en `core` de: muro que bloquea al que camina, voladora que lo cruza,
    puerta por bando, validación del borrador de formas, IA que termina.

## Fuera de alcance

- Catapulta, derribar tramos, foso, torres de flechas, asedio desde el mapa de
  aventura, conectar `hasWalls()`/`castle` a las batallas del juego. Eso es el
  resto de #7 y va en ciclos siguientes.
- Arte generado (fal.ai): nada. Marcadores.
- Cambiar el agente MCP o el contrato.

## Preguntas abiertas (con la suposición por defecto)

- **¿El muro afecta al disparo?** Suposición: **no** en este ciclo; el
  arquitecto puede proponer la regla de HoMM2 (daño a la mitad disparando a
  través del muro) como mejora y se decide en el punto de control del plan.
- **¿Se puede atacar al muro?** No (sin derribo en este ciclo).
- **¿Qué lado defiende?** La derecha, como ya hace `batallaDeArena`. Si la
  forma se dibuja en cualquier columna, también vale: el muro es del tablero, la
  puerta es del defensor.
- **¿Las unidades de dos hexes (`size` 2) y el despliegue inicial?** Si una
  forma pisa un hex de despliegue, el núcleo lo dice (no se despliega encima) o
  la arena no deja dibujar ahí; lo decide el arquitecto.

## Contexto

- Hay otras sesiones en otras copias del repo: **siempre `--port` propio** (el
  3100 está ocupado), nada de matar por nombre, **no hacer push**. Playwright,
  no el Chrome del usuario.
- Rama `asalto` en `/home/al/code/heroes-asalto`. #226 (mapa más grande) cambiará
  el generador; este trabajo no lo toca, así que el rebase debería ser limpio.
- Relacionados, sin tocar: #116 (la persona no juega sus defensas), #200/#201,
  #5.

## Punto de control del plan (09-10-2026)

El usuario aprueba `plan.md` tal cual («Adelante»): el disparo a través del muro
queda fuera de este ciclo (backlog); el defensor puede quedarse en su puerta; se
puede dibujar en las columnas de salida y el despliegue esquiva la muralla.
