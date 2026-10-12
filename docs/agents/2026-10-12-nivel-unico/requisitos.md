# Un solo nivel, derivado de las cifras

## Petición literal

> Vamos a unificar los niveles de forma que el editor de personajes permita crear uno desde cero y asignarle un nivel de forma automatica. Supongo que haran falta numeros mas grandes, podemos usar multiplos de 10 o de 100 y que el nivel sea la primera cifra para simplificar

## Decisiones del usuario (12-10-2026, en la conversación)

1. **Origen del nivel**: una **puntuación de poder** calculada de las cifras (ataque, defensa, PV, daño, velocidad; tiro y doble ataque). Las cifras se editan libres y el nivel se recalcula solo.
2. **Curva**: **índice por centenas** sobre una curva geométrica. Cada nivel equivale a ×~1,6 de poder bruto, y el número que se enseña es 100 × nivel + lo recorrido hacia el siguiente: 340 es el nivel 3. «La primera cifra es el nivel». Medido por el coordinador: con poder ≈ √(daño medio·(1+0,1·atq) · PV·(1+0,1·def)) × velocidad, el catálogo va del campesino (0,9) al dragón óseo (145) y log₂ sigue la morada. Se rechazó el lineal puro (dragón en nivel ~145).
3. **Alcance**: **todo el juego**. Catálogo, tropa, héroe y arena comparten esta única escala de nivel.
4. **Escala**: **PV y daño ×10**; ataque y defensa no cambian, y la fórmula de daño (+10 %/punto) tampoco.
5. **Experiencia**: da **rangos** (los umbrales de hoy ×10) y cada rango suma cifras. El nivel se recalcula solo y sube. El héroe igual: su experiencia hace crecer su cuerpo y su nivel se lee de él. Ascender a héroe sigue pidiendo el rango máximo.

6. **El equipo va aparte del nivel** (corrección del usuario, 12-10-2026, literal):
   > Hay que desligar armas, escudo, armadura, etc del calculo del nivel. El equipo va a parte. Un templario con escudo y uno con arma a dos manos serian iguales, solo se diferencian en equipo

   El índice y el nivel se calculan sobre las cifras **sin equipo**: catálogo (o el cuerpo de la arena o del personaje) + rango. `conEquipo` se aplica después y no los mueve. Consecuencia en la arena: hoy los presets `POR_PERFIL` (`core/arena.ts:224-287`) cambian las cifras según el perfil de arma (espada-escudo, dos-manos, arco, ballesta, montado-lanza…). Lo que hoy distingue a esos perfiles tiene que pasar a ser equipo: arma, escudo y armadura. El cuerpo, mismas cifras y mismo nivel.

Diseño propuesto por el coordinador y aprobado por el usuario: `/home/al/.claude/plans/vamos-a-unificar-los-typed-sprout.md`. El arquitecto lo toma como punto de partida y puede corregirlo con motivo.

## Criterios de aceptación

1. Existe una sola función que da el nivel de una unidad (`nivelDeUnidad`) y otra que da su índice (`indiceDePoder`), en `core`, puras y solo con enteros. Las reglas de `core` se cumplen: nada de `Math.sqrt`, `**` ni `Math.pow`. Nada más en el repo calcula ni escribe un nivel de unidad.
2. ⌊índice / 100⌋ = nivel, con un mínimo de 1. El índice es monótono no decreciente en ataque, defensa, PV, daño y velocidad: subir cualquiera de ellos no baja el índice, y subir el ataque de una unidad tipo sí lo sube.
3. Con la calibración, cada criatura de `data/creatures.json` queda en el nivel de su morada o en el contiguo, y el campesino en el 1. La tabla (id → índice → nivel) queda fijada en un test.
4. El antiguo `level` del catálogo se llama `morada` en los datos y en los tipos. Moradas, ejército inicial, guardias y orden de facción siguen funcionando igual.
5. PV y daño ×10 en el catálogo, el equipo, el héroe, los hechizos de PV, el poder `curar`, los presets de la arena y el perfil de personaje (`rpg/stats.ts`). La experiencia (`base`) y las constantes de la IA que dependen de la escala se reescalan para que el juego se comporte como antes, dentro del ruido. Esto incluye `fuerzaMax`, el peso de `armyPower` en la estrategia y `VALOR_MINIMO_POR_MANA`.
6. La experiencia cobrada es PV quitados × `nivelDeUnidad(receptor)`. La veteranía se llama rango (1-5) y suma sus cifras; un veterano tiene un índice mayor que un novato de su misma criatura. El héroe empieza en el rango 5, su cuerpo crece por rango y su nivel se deriva del cuerpo. El liderazgo y `hero_from_troop` van por rango.
7. **Arena**:
   - La ficha ya no tiene un campo «Nivel» editable; enseña «Índice N · nivel n», que se recalcula al editar cualquier cifra, sin recargar.
   - Hay un botón «Nueva unidad»: eliges un cuerpo (una hoja con arte o una criatura del catálogo), empiezas con unas cifras mínimas y la unidad se guarda en el borrador con un id propio. Se puede montar y pelea.
   - Un borrador antiguo con `level` se sigue leyendo; el campo se ignora.
7b. **El equipo no cuenta para el nivel.**
   - Poner o quitar cualquier pieza a una unidad no cambia ni su índice ni su nivel; sí cambia sus cifras de combate.
   - Dos unidades de la arena con el mismo cuerpo y distinto perfil de arma (p. ej. un templario con espada y escudo y otro con arma a dos manos) tienen las mismas cifras base y el mismo nivel, y solo se distinguen por su equipo.
   - Si hace falta un hueco de escudo o piezas nuevas en `data/equipo.json` (inventadas y declaradas como tales), el plan lo dice.
8. El agente lee en `creature_stats` la `morada`, el `nivel` y el `indice` (derivados), y en la tropa el rango. `pnpm qa` pasa.
9. Barrido de semillas: 0 partidas sin terminar. Duración (mediana / p90) y victorias de j0 en 100 semillas, comparadas con las de hoy (en 1-1000: 8 / 14 / 29, j0 524). Se escriben con su fecha, y un cambio grande se explica.
10. `pnpm verify` y `pnpm verify:lento` en verde. Banco re-anclado, con la forma del diff juzgada. CLAUDE.md (puertas únicas, reglas del juego) y `docs/historia.md` actualizados.

## Fuera de alcance

- Derivar automáticamente el liderazgo o el precio de las cifras: siguen siendo campos.
- Cambiar la fórmula de daño, la moral, la suerte o las constantes de ataque/defensa.
- Activar las habilidades por rango (siguen inertes).
- Arte nuevo: la «Nueva unidad» usa cuerpos que ya existen; nada de fal.ai ni de Codex.
- Reequilibrar facciones o criaturas más allá de reescalar.

## Contexto

- Exploración previa (12-10-2026):
  - `UnitInfo.nivel` solo lo leen `herir` (`battle/damage.ts:519`) y el reparto de equipo de la IA (`ai/strategy.ts:661`).
  - `Creature.level` lo leen `data.ts:114`, `town.ts:204,228`, `setup.ts:61` y `serialize.ts:933`.
  - En la arena, `level` se edita en `client/arena/paneles.ts:718`, se valida en `core/arena.ts:481` y los presets están en `POR_PERFIL` (`arena.ts:224-287`).
  - Hoy no se puede crear una unidad sin una hoja de arte (`unidadPorDefecto`).
  - `unitPower` (`ai/fuerza.ts:17`) es daño medio × PV: con ×10 crece ×100.
  - Banco anclado en `tools/qa/banco.ts:901-905`.
- Presupuesto de pruebas: la máquina es compartida. Solo el test de lo que se toca mientras se itera; `verify` una vez por tanda; `verify:lento`, `capturas` y `banco` una vez al cerrar. Las medidas, con 100 semillas.
- Navegador: con Playwright y sin pantalla, nunca con el Chrome del usuario.

## Preguntas abiertas (con suposición por defecto)

- **¿Cifras mínimas de una «Nueva unidad»?** Por defecto: las que dan el índice 100 (nivel 1), cerca del campesino reescalado.
- **¿El rango cambia de nombre en la interfaz?** Por defecto sí: «Rango 3 · nivel 4» en paneles y crónica.
- **¿Hace falta un id para una unidad nueva sin hoja?** Por defecto: `<cuerpo>-<n>`, único en el borrador.

## Punto de control del plan (12-10-2026, respuestas del usuario)

- **Dos ciclos.** Este (ciclo 1): nivel derivado, ×10, morada, rango, contrato y la lectura «Índice · nivel» en la arena (§1-§4 del plan). El ciclo 2 (§4b: «Nueva unidad» y los perfiles de arma como equipo) se abre aparte, con su propia carpeta; de este ciclo quedan fuera la «Nueva unidad» y el criterio 7b en lo que toca a los perfiles de la arena. «El equipo no mueve el nivel» **sí** entra en el ciclo 1.
- **Escudo (para el ciclo 2)**, literal: «Hueco propio, no hace falta llenar el hueco, de hecho solo espada tiene sentido ya que el escudo quitara velocidad». Es un cuarto hueco opcional: nadie nace con escudo y el equipo base sigue siendo la espada. El escudo resta velocidad.
- **Contrato en inglés**: `rank`, `level`, `powerIndex`, `dwelling`.
- Aceptadas las correcciones del arquitecto: razón 2/1 y `unitPower` / 100.

## Corrección tras el ingeniero (12-10-2026, decisión del usuario)

Con PV quitados × nivel, los ascensos a rango 5 cayeron de 0,25 a 0,05 por partida en 1-1000 (pegar a un héroe paga su nivel 3-4, no su rango 5+). El usuario elige **cobrar por índice**: la experiencia es PV quitados × `indiceDePoder(receptor)` / 100, en enteros: la experiencia se guarda en centésimas o los umbrales se escalan en consecuencia, sin coma flotante en `core`. Después se calibra la `base` de experiencia hasta que los rangos 5 por partida vuelvan a ~0,25 (1-1000, `tools/qa/veterania.ts`), con subidas de héroe y j0 medidos y escritos con fecha.
