# Hallazgos de `/simplify` — el contrato del agente, al día

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el diff sin commitear,
10-11-2026. Deduplicados y **con la decisión ya tomada** por el coordinador. El núcleo del cambio
(`hechos.ts`, tablas únicas, `ocupanteAlAgente`, `juzgarElVeterano`, `cronicaAlAgente`) lo dan los
cuatro por bien resuelto. Ninguno es de comportamiento del juego: `pnpm banco` no debe moverse.

## Se aplican

| # | Dónde | Qué | Cómo |
|---|---|---|---|
| S1 | `tools/qa/agente/politica.ts`, `repartos()` | Recalcula `cabe`, `lleva`, `enCasa`, `suyo`, `deCasa` que `decidir` ya calcula, y sin su guardia `Number.isInteger(cabe)` (con `troopCap` ausente compara contra `NaN` y manda un reparto antes de que `decidir` lance) | Calcularlos una vez al principio del caso, con el guardia delante, y pasárselos a `repartos`; `const acciones = [...repartos(…), ...obras(…)]` en vez del `unshift` |
| S2 | `tools/qa/agente/politica.ts`, `obras()` | Inversa de `UPGRADE_DE_MEJORA` en línea con `?? 'muralla'` (un `upgrade` desconocido se lee como «ya amurallado» y calla), e importa `OBRA_SIGUIENTE` y `OBRAS_DEL_PUESTO` del núcleo: el arnés hace de agente leyendo lo que el agente no ve | **Choque entre revisores, decidido**: no se exporta una inversa nueva. El arnés usa una tabla local de literales del contrato (`none → palisade`, `palisade → wall`, `wall →` nada) y **lanza** con un `upgrade` que no conoce; deja de importar el núcleo y **no mira el oro**: si no alcanza, el rechazo lo dice el núcleo. Si la semilla de `pnpm qa` se mueve por esto, se dice en el informe |
| S3 | `tools/qa/agente/verify-agent.ts` (~144, 151, 1162) | `nodosConObra` (Set) y `nodosMejorados` (Map) se escriben juntos con la misma clave; el nombre del Map engaña (guarda también `none`) | Un solo `Map` (`upgradeDelNodo`) y su `.size` |
| S4 | `tools/qa/agente/verify-agent.ts` (~780) | La obra repetida se reconoce con una regex sobre la prosa de `mejorarBlocker` | Casar por el prefijo de `describeAccion`, como los vecinos; el texto del motivo ya lo fija `test/mejoras-del-puesto.test.ts` |
| S5 | `src/core/contract/vocabulario.ts`, `obraDelUpgrade` | Repite el motivo «no es una obra de un puesto; valen …» de `mejorarBlocker` (`state/sitios.ts`) | Un `obraDesconocida(x, lista)` junto a `esObraDelPuesto` (`map/tipos.ts`), llamado desde los dos, como `huecoDesconocido`. **El texto no cambia** |
| S6 | `src/core/contract/hechos.ts` (~350) | Redeclara `Origen`, que existe sin exportar en `state/events.ts` | Exportarlo e importarlo (`import type`) |
| S7 | `src/core/contract/hechos.ts` (~156, 167, 172, 413) | `(typeof T)[keyof typeof T]` reescrito cuatro veces; `Upgrade` ya existe privado | Exportar `Upgrade` y un alias junto a cada tabla (como `Hit`). Ojo con `tools/qa/exportaciones.ts`: solo lo que alguien lea fuera |
| S8 | `src/core/contract/formato.ts` (`citados`, ~137) | Ayudante nuevo que no retira las copias en línea del propio fichero (~692, 719, 732, y `w.ring` ~85) | Usarlo en esas. No se sube a `core/texto.ts` ni se toca `mapa-conocido.ts`/`peticion-de-mapa.ts` |
| S9 | `src/core/contract/formato.ts`, «Acciones válidas» y PUESTOS | Las dos obras y sus precios, enumeradas a mano | Derivarlas de `OBRAS_DE_UN_PUESTO` con `UPGRADE_DE_MEJORA` y `conMiles(OBRAS_DEL_PUESTO[o].precio)`, como `CUANDOS_EN_PROSA` |
| S10 | `src/core/contract/vocabulario.ts`, `VENCE_AL_AGENTE`; `'place'` suelto en `mapa-conocido.ts` y tres veces en `hechos.ts` | Palabras que el comentario declara «las mismas» y el código reescribe | `VENCE_AL_AGENTE` lee de `CUANDO_AL_AGENTE`; una constante para `place` en `vocabulario.ts` |
| S11 | `test/guarniciones.test.ts` (~805, 868, 900), `test/mejoras-del-puesto.test.ts` (~487, 533) | `delAgente` (parse + `accionDelAgente` + el `as`) y el `intenta` con try/catch, copiados | Un ayudante en `test/partida-de-prueba.ts`; `delAgente` y `traducida` salen de él |
| S12 | `test/hechos-del-agente.test.ts` (~701) | Juega entera la partida 48×48 de la semilla 19, idéntica a la de `test/cronica.test.ts:358` | Colgar las dos comprobaciones (fugas sobre `state.log` y `cronicaAlAgente` por jugador) del `it` de `cronica.test.ts` que ya tiene ese `state`; `fugasDe` y compañía se exportan de un módulo de test común si hace falta. El fichero nuevo se queda con las muestras |
| S13 | `test/hechos-del-agente.test.ts` (`DE_BATALLA`) | Los hechos de batalla que pasan con `return e` solo se vigilan por muestras a mano: un opcional nuevo en español no rompe nada | Pasar por `fugasDe` el registro de **una batalla** real ya montada por otro test o ayudante (una, no una partida). No se reescriben campo a campo los «tal cual» |
| S14 | Comentarios | Historia del cambio en vez del porqué: `hechos.ts:22` («vivía en…»), la anécdota de la semilla 5 dos veces (`partida-del-arnes.ts` ~257 y su test ~112), «Las dos jugadas del 10-11-2026» (`test/notas.test.ts` ~331, `partida-del-arnes.ts` ~254) | El porqué en una frase («la ventana es de 25 hechos y el hecho puede salirse»); la anécdota, en un solo sitio. Las fechas entre paréntesis, convención del repo, se quedan |

Tras aplicar: `pnpm typecheck`, `pnpm lint`, `npx tsx tools/qa/exportaciones.ts`, los tests de los
ficheros tocados (por partes), `pnpm qa` y `pnpm banco` (una vez; no debe cambiar). El guardia de
`hechos-del-agente` (ahora repartido con `cronica.test.ts`) hay que **verlo morder otra vez**.

## Se descartan a conciencia

- **Anclar la última semilla buena del arnés** (eficiencia): la búsqueda desde 1 es diseño previo
  (#131) y deliberado (una semilla anclada se pudre en silencio); nueve partidas de 6 turnos son
  segundos. No se toca.
- **Exportar una inversa total `mejoraDelUpgrade`** (reutilización, altitud): la resuelve S2 de otra
  manera; el arnés no debe importar tablas del núcleo.
- **Subir `citados` a `core/texto.ts`** y retirar las copias de otros ficheros: fuera del diff.
- **Construir campo a campo los hechos «tal cual»** (~150 líneas): lo cubre S13 más barato.
- **`si()`, los `switch` verbosos, `lineasDe` del arnés**: mirados por los revisores y limpios.

## A backlog (issues al cerrar; no se arreglan aquí)

- **`nextUpgrade: { upgrade, cost } | null` en el nodo propio de `knownMap`** (de `laObraDelPuesto`):
  hoy el orden y el precio de las obras solo viajan en la prosa.
- **`AccionDelAgente = z.infer<typeof adventureActionSchema>`** y fuera el cast del director
  (`LineaDelAgente` duplica el zod a mano; patrón previo que el diff extiende).
- **Un esquema por hecho servido** que haga derivable la lista plana `CLAVES_DE_LOS_HECHOS`.
- **La ventana de 25 de `recentEvents`** puede dejar fuera un hecho propio del agente antes de su
  turno siguiente (visto en la semilla 5); cerrarlo sería «desde tu último turno» en `cronicaPara`.
