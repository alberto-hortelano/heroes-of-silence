# Requisitos — continuar-tras-el-tablero

Tarea: `2026-11-11-continuar-tras-el-tablero`. Issues: 341. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (igual a `main`, `150fd189`, tras fusionar #333).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

> «Cuando mergees la PR empieza con los nuevos issues tambien en paralelo»

El coordinador eligió esta tarea (tanda 3). Lo que pide cada issue, tal cual:

### #341 — Batalla: «Continuar» aparece en cuanto el estado termina, antes de que el tablero cuente el último golpe

> Tras #257 el lateral de la batalla se congela mientras el tablero cuenta y no adelanta el final, pero el botón «Continuar» sigue saliendo en cuanto el estado trae `finished`: destripa el desenlace. Lo decidió así #158 d y lo defiende `test/escenas.test.ts` (hacia la línea 594). Qué hacer: decidir si «Continuar» espera a que el tablero acabe. Visto por el arquitecto de `docs/agents/2026-11-11-panel-durante-la-jugada/`.
> 
> Sale del cierre de issues del 11-11-2026 (PR alberto-hortelano/heroes-of-silence#333).

## Criterios de aceptación

Los del issue, tal cual, salvo lo que la crítica reencuadre. Cada regla nueva, con su test visto morder; lo que se ve, comprobado en el navegador con Playwright sin pantalla.

## Fuera de alcance

Medidas de jugabilidad (CLAUDE.md, «No se prueba la jugabilidad»). `pnpm capturas` lo pasa el coordinador al final de la tanda.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`). El coordinador acepta su alcance, que sustituye a los criterios de arriba. Sin arquitecto (decisión del coordinador): un cambio pequeño en `renderActions` y su test. Para las dos notas al arquitecto: la rama `pendiente` de `alAcabar` se borra con sus tests si queda sin uso (no se deja código muerto «por si acaso»), y el guardia de #257 en `invariantes-cliente.test.ts` se amplía para que vigile también `partida/paneles.ts`.


Sustituir «Criterios de aceptación» por:

## Criterios de aceptación (reencuadrados por la crítica)

Decidido: «Continuar» espera a que el tablero cuente el último golpe. #158 d no lo eligió así; arregló el doble clic que causaba (`docs/historia.md`, «“Continuar” pedía dos clics»), y desde #257 era lo único de la partida que adelantaba el final.

1. **«Continuar» no sale mientras se cuenta.** Con la batalla terminada y `EscenaBatalla.ocupada`, la barra de acciones de la partida no lleva `finish-battle`, ni encendido ni apagado. Lleva lo que llevaba antes de esa jugada, con los botones apagados en su sitio (#165). Con la cuenta acabada, «Continuar» sale en el mismo fotograma que «Victoria»/«Derrota» en el lateral. Se invierte `test/escenas.test.ts` («“Continuar” no se apaga con la jugada contándose») y se ve morder quitando la condición.
2. **Un clic basta.** Pulsar «Continuar» en cuanto sale vuelve al mapa, o abre lo que sobra (`abrirLoQueSobra`), sin aviso de espera ni segundo clic. Siguen en verde los tests de #158 d de `escenas.test.ts` que se conserven; si se borra la espera de `alAcabar` por quedarse sin uso, se borran sus tests y se dice por qué.
3. **Se corrige lo que deje de ser verdad**: los comentarios de `batalla/escena.ts` (`pendiente`) y `partida/reparto-del-clic.ts` (`al-acabar`), `docs/areas/batalla.md` («“Continuar” sigue saliendo…») y la entrada de #158 d en `docs/historia.md`, con fecha.
4. **Fuera**: la arena (no tiene «Continuar» y su rótulo ya calla contando), el espectador (`sinElFinal`), el lateral (#257) y cualquier forma de saltarse la animación.
5. **Navegador** (Playwright sin pantalla): una batalla de la partida que acaba con un golpe. Una captura de la barra de acciones durante la cuenta (sin «Continuar») y otra al acabar (con él), y un solo clic que vuelve al mapa.
