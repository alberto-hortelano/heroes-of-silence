# QA — tablero de batalla simétrico (filas de 12 y 11, 104 casillas)

12-10-2026. Lo que se pidió, comprobado contra la cita del usuario y los ocho
criterios de `requisitos.md`, con la decisión del tiro generoso. No se ha tocado
código. Los guiones son de esta carpeta (`qa-*.ts`) y las capturas, de `capturas-qa/`.
Navegador: Chromium sin pantalla de Playwright, con un vite propio en un puerto
libre (:32809 y :32917), arrancado en su propio grupo y muerto al terminar
(`ss` sin escucha después). No he tocado el vite ajeno de :3100.

## Lo que corrí yo

| Comprobación | Resultado |
|---|---|
| `pnpm verify` (una vez) | salida 0, `Test Files 120 passed \| 1 skipped`, `Tests 2963 passed \| 14 skipped`, 42 s |
| `qa-nucleo.ts`: forma, espejo y 200 batallas de arena IA contra IA | `SIN FALLOS` (detalle abajo), 2 s |
| `qa-murallas.ts` y `qa-muralla-vieja.ts`, en HEAD (worktree temporal, ya borrado) y en el árbol | idénticos en los dos |
| `qa-escala.ts`, en HEAD y en el árbol | paso −4 % (tabla abajo) |
| `qa-tiro-por-el-borde.ts`, en HEAD y en el árbol | **hallazgo I1** |
| `qa-navegador.ts`: 2 recorridos de 104 clics, enlace v2, despliegue en espejo | 0 hallazgos, 0 errores en consola |
| `tools/qa/asiento.ts` y `--tropa`; `barrido-semillas.ts` | 770/2000 (38,50 %), 882/2000 (44,10 %); `sin terminar: 0/40` |

Lo cito sin repetirlo, porque el ingeniero lo dejó en verde sobre este mismo árbol (`implementacion.md`):
`verify:lento`, `banco` (`c36381e0…`), `enfrentamiento` (50,90 %), `pnpm qa` y
`pnpm capturas` (`capturas-simplify/`, 64 PNG; he revisado las de partida, móvil, espectador y base).

## Criterios

| # | Criterio | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Una sola rejilla en todo; el hueco (11, impar) no se pisa, no se apunta, no se pinta y `legalActions` no lo ofrece | ✅ | `qa-nucleo`: en la caja −2..13 × −2..10, `isInside` acierta en todas las casillas (104 dentro); `indiceDe(allHexes()[i]) === i`; `indiceDe` y `bandoDeSalida` lanzan en las cuatro (11, impar). En 200 batallas y 26 909 jugadas, ninguna unidad pisa fuera y ningún `move`, `from` ni `muro` de la lista legal cae fuera; `movimientoBlocker((11,3))` dice «fuera». En el lienzo, los clics en (11,1/3/5/7) no mueven (`huecos-*.png`), y el editor pinta 104 casillas (`borde.ts`, `arena-05-banco-montaje.png`). Partida, arena y espectador montan con `createBattle` o `crearBatallaConReglas`, que leen `board.ts` |
| 2 | El tablero es su espejo, el despliegue es espejo exacto y la geometría no favorece a nadie (medido) | ✅ con reserva | `qa-nucleo`: en todos los pares, distancias y vecinas en espejo; en 30 000 tiros al azar con 0-4 bloqueos y 0-2 puertas cerradas, el tiro y su espejo dan lo mismo (0 distintos), y en 20 000 el tiro es recíproco (a→b = b→a); 27 salidas por bando, en espejo. En las 28 batallas sin muralla de las 200 (1-7 unidades, la mitad con dragón óseo), el despliegue del defensor es el espejo exacto del atacante (0 distintos); los tests de `battle.test.ts` lo cubren además con una muralla espejo. En pantalla: `espejo-1280x720-inicio.png` y `espejo-1920x1080-inicio.png`. **La reserva**: con el mismo ejército, el defensor gana el 61,5 % con stacks y el 55,9 % con tropa (asiento.ts, repetido), y en mis 200 batallas de arena la izquierda gana 87. Que no sea la geometría está probado por los tests exhaustivos, no por la medida: atribuirlo al orden de las vecinas y a la iniciativa es una hipótesis que nadie ha medido (M2) |
| 3 | Distancias, vecinas, tiro, carga, grandes, IA y muralla en la forma nueva, con tests del borde derecho de filas pares e impares | ✅ salvo **I1** | Tests de `board`, `muralla-*` y `tropa` (en `verify`); mis 200 batallas (tiradores, carga, grandes, voladores, las 6 murallas de ejemplo): 0 fallos. Las seis formas de ejemplo cierran y caben igual que en HEAD, también con 7 dragones por lado. **I1**: un muro que llega al borde por una fila impar deja disparar a través de él por la casilla que falta (o por la columna −1) |
| 4 | El cliente pinta la forma nueva (partida, arena, espectador), el ratón acierta en todas las casillas y la escala sigue cabiendo | ✅ | `qa-navegador`: un señor vampiro de la persona recorre el tablero en serpiente con un clic real en cada casilla; tras cada clic, «Le quedan N» del panel coincide con el espejo (`SesionDeArena`, semilla 3). **103 de 104 casillas acertadas, a 1920×1080 sin muralla y a 1280×720 con «Línea con puerta»** (incluidas las de lo alto de los muros, con `tableroA`); la que falta es la del campesino. 0 errores en consola. Escala (`qa-escala.ts`): 1280×720, 105,8 → 101,6 px; 1920×1080, 158,7 → 152,4; móvil 860, 71,1 → 68,3 (−4 %). Cabe entero en `recorrido-*.png`, `espejo-*.png`, `desktop-07-batalla-inicio.png`, `movil-03-batalla.png` y `espectador-02-batalla.png` |
| 5 | El contrato dice la forma (sin un 11 a mano) y lo que manda el agente se valida contra ella | ✅ | `serialize.ts` envía `board: tableroDelContrato()` (filas, ancho par, ancho impar, casillas y la frase derivada de `FORMA_DEL_TABLERO`); la prosa de `battle_turn` interpola la misma constante. `test/agent-link.test.ts:595` (en `verify`): el agente recibe `board` en cada `battle_turn`, ninguna acción legal cae en el hueco y un `move` a (11,1) vuelve con `ok: false` y la nota «(11,1) está fuera del tablero». `pnpm qa`, en verde según el ingeniero. En `src/` no queda ningún `width: 11` ni 99 de la rejilla (grep) |
| 6 | Las murallas guardadas y los enlaces `?montaje=` con muralla de antes se leen, o se rechazan diciendo por qué | ✅ | Decisión: se leen tal cual (plan §5; `COMENTARIO_DEL_BORRADOR_DE_MURALLAS`). Un enlace **v2 generado con el código de HEAD** (7 contra 7, dos dragones, escalera, «Semicírculo grueso», `qa-enlace-v2.json`) abre en la arena nueva («Montada la pelea del enlace (semilla 5): pulsa Luchar»), y se lucha sin errores (`enlace-v2-batalla.png`). Una forma dibujada contra el borde viejo valida, se guarda y el editor dice si cierra (`ladosDeLaForma`), igual que en HEAD. El v3 lo abren `borde.ts` y mi guion. No hay `data/borradores/murallas.json` en este árbol: lo cubre `test/arena.test.ts` |
| 7 | En la tabla de reglas de CLAUDE.md, la rejilla nueva como **regla nuestra** | ✅ | «Rejilla de batalla \| **regla nuestra** (fheroes2: 11 × 9 = 99): 9 filas, las pares de 12 y las impares de 11 = 104 hexes, offset odd-r, simétrica…», y una puerta única nueva, «Forma del tablero» |
| 8 | Banco re-anclado juzgando la forma del diff; barrido 0; enfrentamiento no empeora; `qa` y `capturas` en verde | ✅ | Barrido repetido: `sin terminar: 0/40`. El banco, la forma del diff (0 de 187 semillas cambian antes de su primera batalla), el enfrentamiento (50,90 % frente a 50,40 % en HEAD), `qa` y `capturas`: en `implementacion.md`, sin repetir. El asiento de `--simplify` lo he repetido al dígito |

### Tiro generoso (la decisión del usuario)

El test de generosidad (`board.test.ts:464`) busca los empates sin pasar por
`board.ts`, con distancia euclídea en cúbicas, y exige que tapar una sola de las
dos casillas empatadas no tape el tiro, en las tres familias (1 188 / 2 132 /
2 132). Se vio fallar con el empujón de antes. Lo que no exige —los empates de
vértice— lo dice el propio test. Aparte, mis 30 000 tiros al azar salen en espejo
y recíprocos. La regla aprobada se cumple. I1 es una consecuencia de su segunda
mitad («las casillas fuera del tablero que cruce el rayo se saltan»).

## Hallazgos

### Importantes

**I1. Se puede disparar a través de un muro que cierra contra el borde, por la casilla que falta.**
El rayo que pasa justo por el borde de dos casillas tiene dos versiones; si una
cae en la (11, impar) o en la columna −1, esa casilla «se salta». Así que, si la
otra es muro, el tiro pasa igual. Andando no se cruza: no hay casilla por la que pasar.

Pasos (`npx tsx docs/agents/2026-10-11-tablero-simetrico/qa-tiro-por-el-borde.ts`):
- Un fuerte en la esquina de abajo a la derecha, que se puede dibujar en el
  editor: muros en (5..10, 5) y (5, 6..8). Andando, desde (11,4) no se entra:
  sus vecinas de abajo son (10,5), que es muro, y (11,5), que no existe. Con
  `hayLinea`, en cambio, **(11,4)→(11,6) y (11,4)→(11,8) dan `true`**, mientras
  que (10,4)→(10,6) da `false`.
- Una fila impar entera de muro: con la 1, 8 tiros la atraviesan
  (`0,0→0,2…0,8` por la izquierda y `11,0→11,2…11,8` por la derecha); con la 3,
  12. En HEAD daban 0 y 0 (allí, en cambio, la fila 2 tenía 3 fugas por el borde viejo).

Lo que esperaba quien juega: «En el suelo nadie dispara a través de un muro»
(`REGLA_DE_LA_MURALLA`). Un arquero de fuera de su fuerte le dispara a lo de
dentro rozando el marco, y la IA tiradora lo aprovechará. Solo pasa con murallas
que tocan el borde izquierdo o el derecho por una fila impar; las seis de
ejemplo no lo hacen.

Para decidir (no lo arreglo): es la letra de lo que aprobó el usuario («se
saltan»), pero seguramente no su intención. Por ejemplo, que la casilla de fuera
tape cuando la casilla empatada de dentro está tapada, o que tape siempre en los
tiros con muralla. Hay que preguntarlo.

### Menores

**M1. Franja negra a la derecha del lienzo de la batalla con muralla, a 1280×720.**
Se ve en `recorrido-1280x720-Línea con puerta.png` y `enlace-v2-batalla.png`
(x ≈ 926-940). **Ya estaba en HEAD**: la misma captura, hecha con el enlace v2
sobre HEAD, la tiene igual, así que no es de este cambio. Sin muralla no sale
(`espejo-1280x720-inicio.png`).

**M2. Si el sesgo del asiento no es de la geometría, falta probarlo.** (fila 2 de la
tabla) Con el mismo ejército, el defensor gana el 61,5 % con stacks. Ha mejorado
3,2 puntos respecto a HEAD, y la geometría es simétrica en los tests, así que el
criterio se cumple por la parte de la geometría. Pero «es el orden de las
vecinas y la iniciativa» no está medido. Sería barato hacerlo: el mismo
`asiento.ts` con el orden de vecinas espejado para el defensor, en una rama.
Backlog, como dice el plan.

## Workarounds

- **Los dos bandos a mano en el recorrido del ratón** (`ia: false` en los dos
  lados, con el campesino defendiendo cada vez que le toca). También se puede
  montar así desde la página. Es para que el espejo no tenga que imitar a la IA,
  y no afecta a quien juega.
- **Un señor vampiro con `casillas` al máximo**: es una prueba de la ficha del
  catálogo, que la arena permite. Lo hace volar y andar casilla a casilla por el
  tablero entero. Tampoco afecta a quien juega.
- **La posición de cada clic se calcula con `tableroPara` y `alzadoDeLaMuralla`
  desde fuera**, la misma cuenta que hace la escena. Si la escena encuadrara de
  otra manera, el panel no coincidiría con el espejo y saldría como fallo, así
  que el guion no puede pasar por error.
- **La partida (`pnpm dev`, `?seed=N`) y el espectador no los he recorrido yo
  hasta una batalla**: cito `pnpm capturas` (clics reales desde el mapa, semilla
  27, y el espectador contra el servidor), que pinta con la misma `proyeccion.ts`
  y `render/batalla.ts` que la arena donde he hecho los 208 clics.

## No probado

- **El ratón en la partida y en el espectador, casilla a casilla**: la cuenta es
  la misma que en la arena (probado), pero no lo he repetido allí, por
  presupuesto. Las capturas de las dos (`desktop-07`, `espectador-02`) pintan la
  forma nueva en espejo.
- **El agente de verdad (MCP)**: no he jugado con Claude conectado. Cito el test
  de `agent-link` y `pnpm qa`.
- **Un `data/borradores/murallas.json` real del usuario**: no existe en este
  árbol. Lo cubre el test.
- **Los empates de vértice en el tiro**: declarados fuera de la regla generosa.

## Veredicto

**Apto con reservas.** Los ocho criterios se cumplen en el flujo real: la forma,
el espejo, el ratón en las 104 casillas a dos tamaños y con muralla, el contrato,
los enlaces v2 de verdad, CLAUDE.md y las medidas. La reserva es **I1**: tal como
está escrita, la regla del tiro aprobada abre una fuga por el borde en murallas
que lo tocan por una fila impar. Hay que preguntarle al usuario si la quiere así
antes de cerrar.
