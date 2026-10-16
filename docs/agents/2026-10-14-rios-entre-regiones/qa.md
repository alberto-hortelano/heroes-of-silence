# QA: el río continuo (paso 1 en 13027211, paso 2 sin commit), 16-10-2026

Validado contra las peticiones literales de `requisitos.md`: «usa tambien rios para separar regiones»,
«tiene que desembocar en el mar … o salir por el borde … los rios pueden cruzar lagos» y «un rio es
algo continuo». La última decisión del usuario es que una ciudad pintada en una casilla lleva a la
ciudad al pulsarla, también si esa casilla se pisa.

Las evidencias están en `qa/`, junto a este fichero. Los scripts de medida están en el scratchpad de la
sesión: no se ha tocado el repo.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | El río es continuo de su nacimiento a su boca en el borde, y nada lo parte | ✅ | `npx tsx tools/qa/rios.ts 1 100`: «con río 100, ríos enteros 100 de 100», todos con boca. Por tamaños (script `tamanos.mts`, con `alTrazarElRio` y `riosDelMapa(…).roto`): 24×24 en 1-60, 28×28 en 1-30, 3 regiones en 1-30, 64×64 en 1-12, 10 regiones en 1-8 y 40×30 en 1-20, **0 rotos y 0 mapas que no salen**. En la escena, las 8 124 casillas del trazado de 1-100 son `water` en `analizar(map).terreno`, puentes y ciudades-puente incluidos (`escenario-rio.mts`) |
| 2 | Solo se cruza por encima: puente o ciudad-puente | ✅ | Guardia de `test/rio.test.ts` en verde (`pnpm verify`). Ninguno de los 432 nodos de agua de 1-100 está en el trazado sin ser puente. Las 121 ciudades-puente salen en la escena (`ciudadesPuente`) |
| 3 | Ancho de una casilla donde se ve, dos bajo la cara | ✅ con reservas | `rios.ts 1 100`: lejos de nodos y lagos, ancho 1 en el 100 % (3 445 casillas). Bajo la cara, 2 % / 62 % / 9 % / 27 %. Quedan **12 casillas de una bajo la cara** (s8 (2,24), s18 (1,19), s19 (17,13), s22 (6,23), s22 (15,37), s36 (15,25), s37 (40-41,22), s47 (20,5), s63 (13,37)…), donde el río se lee como una hebra bajo la pared (`qa/s19-rio-de-una-bajo-la-cara-17-13.png`, `qa/s37-rio-de-una-bajo-la-cara-40-22.png`) |
| 4 | Agua plana: sin escalones ni cañones | ✅ | `rios.ts 1 100`: «ríos con escalón: 0», «agua encajada en un río: 0» |
| 5 | Salen las tres formas | ✅ | En 1-100, esquina 38, frontera 34 y lago 28. En 1-300 (`j0forma.mts`), 104 / 107 / 89 |
| 6 | Los lagos de obstáculo no compiten con el río | ⚠️ a medias | Las charcas (el agua de una sola región) salen turbias y se distinguen bien (`qa/s52-senda-sobre-agua-10-14.png`, `qa/mapa-s66-24px.png`). Pero **el agua de frontera fuera del río va del mismo azul que el río**: 1 675 casillas en 105 franjas en 1-100, el 20 % de las del río. En s83 son 162 casillas frente a 64 del río (`qa/mapa-s83-24px.png`), y el mapa se lee como lagos dispersos. Ver H3 |
| 7 | La ciudad-puente se pinta en su orilla con su puente, y el clic, la bandera y la ruta van a ella | ✅ | Cliente real, s13 town-2 (25,5), orilla (25,6), detallado en «Desde quien juega» |
| 8 | Lo ve igual el espectador | ⚠️ no probado a la vista | La pasada `espectador` de `pnpm capturas` está en verde, pero su partida (s2, con mapa del arnés) no tiene ciudad-puente. `adaptarEscena` es la inversa exacta (`test/espectador.test.ts`: terreno, objetos y regiones iguales), y `analizar` solo lee eso, así que debería salir igual |
| 9 | La partida no se rompe | ✅ | `barrido-semillas.ts 100`: 0/100 sin terminar, duración 8 / 15 / 24. En 1-300 por forma: esquina j0 56 %, 7 / 15 / 24; lago 52 %, 7 / 15 / 30; **frontera 50 %**, 8 / 13 / 23 (el 38 % de `implementacion.md` era ruido de 34 partidas); 0 sin terminar. `pnpm banco`: «ancla: igual», `59fb0286…` |
| 10 | Los tests y las fronteras siguen en pie | ✅ | `pnpm verify`: `Test Files 128 passed / 1 skipped`, `Tests 3129 passed / 14 skipped`. No he repetido `verify:lento`: el coordinador lo cita verde (5 016) |
| 11 | `pnpm capturas` en verde | ❌ | **Sale 1 en la primera pasada** (H1). Las otras once pasadas (`CAPTURAS_SOLO=` todas menos `escritorio`) salen 0, sin errores en consola, en 259 s |

## Desde quien juega

Lo he probado en el cliente real: vite propio en el puerto 3191 y Chromium sin pantalla con Playwright,
llevado por un espejo (`Session` y `EscenaAventura` con la misma semilla), con clics de ratón reales.
La consola no dio ningún error ni aviso en ninguna de las sesiones.

- **s13: llegar a la ciudad-puente town-2 (25,5) y tomarla.**
  - Día 1: pulso la ciudad, hay una emboscada en (11,7) y la resuelvo con «Resolver sola». Vuelvo a
    pulsarla y el héroe para en (24,6).
  - Pasar el ratón por la orilla (25,6) dice «Torreblanca (neutral) · llegas hoy (1 paso)» y enmarca
    la casilla de la ciudad (`qa/cliente-s13-d2-ruta-a-la-orilla.png`).
  - Día 2: el clic en la orilla (punto 25,5 6,4) va a la casilla (25,5) y abre el asedio. Al ganarlo,
    la **bandera roja y el óvalo del dueño salen en el castillo, en su orilla**
    (`qa/cliente-s13-d2-ciudad-tomada-bandera.png`).
  - Día 3: la ruta a (25,4), al otro lado del puente, dice «llegas hoy (2 pasos)» y cruza por la
    ciudad (`qa/cliente-s13-d3-ruta-por-el-puente.png`). Entrar y salir funciona, y el héroe queda
    en el puente (`qa/cliente-s13-d3-heroe-dentro-sobre-el-castillo.png`, ver H5).
- **s7: el castillo propio es una ciudad-puente.** Ver H1 (`qa/cliente-s7-dia1-heroe-sobre-su-castillo.png`).

## Hallazgos

### H1 · bloqueante: pulsar al propio héroe al empezar lo mete en el castillo, y `pnpm capturas` sale 1

En 1-100 hay 14 ciudades-puente cuya orilla se pisa, y **las 14 son bases** (s7, s12, s30, s46, s50,
s51, s52, s56). En s7 y s30 el héroe de j0 empieza justo en esa orilla: la casilla donde se pinta su
castillo. Por la decisión del usuario, esa casilla lleva siempre a la ciudad, así que el héroe tapa su
castillo y no se puede pulsar.

Reproducción:
1. Abre `/?seed=7` y acerca la vista.
2. Pasa el ratón por el héroe, en (12,5): la barra dice «Valdeluz (tuyo) · llegas hoy (1 paso)».
3. Púlsalo: el héroe anda a (13,5) y entra en la base, y el movimiento baja de 1346 a 1271.

Quien juega espera seleccionar o mirar a su héroe, o el «ya está en esa casilla» de antes, no gastar
movimiento entrando en el castillo.

`pnpm capturas` elige justo esta semilla para el escritorio y para con este error:
`Error: pulsar al propio héroe dice «Pulsa el suelo para andar, un edificio para entrar o a alguien
para hablar. Escape vuelve al mapa.»; el espejo, «Aldo de Valdeluz ya está en esa casilla: pulsa otra
para moverlo.»` (tools/qa/capturas.ts:1188).

El usuario decidió el clic sabiendo «14 de 121», pero no consta que supiera que son bases, ni que el
héroe inicial está en esa casilla. Lo mismo le pasaría a cualquier héroe, propio o rival, que esté de
pie en esa orilla: pulsarlo lleva a la ciudad.

### H2 · importante: el río pasa por debajo de las bases

El veto del trazado es la caja de la semilla de casa (`CAJA_DE_CASA`), no la base, que es el nodo de la
región de casa más cercano a su esquina. Así sale una base sobre el río:
- 1-100: j0 en 6 mapas (s7, s30, s46, s51, s52, s56) y j1 en 8.
- 3 regiones por bando: 12 de 60 bases.
- 40×30: 11 de 40.

A la vista se lee bien: un castillo con su puente sobre el río (`qa/s52-base-ciudad-puente-2-13.png`,
`qa/cliente-s7-heroe-dentro-sobre-el-puente.png`). Pero es el origen de H1, y no figura en el plan ni
en las decisiones del usuario. Él debería saber que su castillo puede caer en el río, o que se vete.

### H3 · importante: el agua de frontera fuera del río compite con él

El usuario pidió que el agua suelta que no es del río no compita con él a la vista. Solo se enturbian
los lagos de una región. El agua entre dos regiones que no es del río va del mismo azul: 1 675 casillas
en 1-100. Los peores casos:
- s83: 162 de fuera frente a 64 del río (forma lago, río de largo 17).
- s66: 157 frente a 82.
- s30: 147 frente a 80.
- s5: 144 frente a 82.

En `qa/mapa-s83-24px.png` los grandes lagos azules del oeste y del este pesan más que los dos ríos, que
son dos cortes cortos hasta sus lagos. Es lo que el usuario llamó «zonas de agua dispersas». En
`qa/mapa-s66-24px.png` el río de frontera se lee de arriba abajo, pero los lagos azules de las
esquinas le hacen sombra.

Ya lo dice la desviación 3 del paso 2 («la escena no sabe qué agua es del río»). Hay que enseñárselo al
usuario antes de cerrar.

### H4 · menor: sendas que se pintan sobre el agua fuera de 1-40

`sendaSobreElAgua` es 0 en 1-40 (lo que mide el test) y 5 en 41-100:
- s52 (10,14) y (31,28)
- s93 (20,12-13)
- s100 (14,6) y (18,14)

Todas cruzan el borde de una **charca**, nunca el río (`qa/s52-senda-sobre-agua-10-14.png`,
`qa/s93-senda-sobre-agua-20-12.png`, `qa/s100-sendas-sobre-agua.png`). Son iguales en 13027211: vienen
del paso 1, no de la escena.

### H5 · menor: el héroe dentro de una ciudad-puente norte-sur se pinta encima del castillo

En s13 (25,5), con el castillo al sur, en la orilla (25,6), el héroe que entra se pinta en el puente,
**delante** del castillo: parece que está de pie sobre los tejados
(`qa/cliente-s13-d3-heroe-dentro-sobre-el-castillo.png`).

Con el puente de este a oeste (s7) se lee bien: el héroe queda en el puente, junto al castillo
(`qa/cliente-s7-heroe-dentro-sobre-el-puente.png`).

Reproducción:
1. Abre `/?seed=13` y toma Torreblanca (25,5) como se cuenta arriba.
2. El día 3, pulsa la orilla para entrar.
3. Pulsa Escape.

### H6 · menor: pequeñas regresiones del informe fuera de las semillas vigiladas

Composición de 1-100 con `componer`, comparada con 13027211 extraído aparte:

| Medida | 13027211 | Árbol de trabajo | Cambio |
|---|---|---|---|
| `casillasDeBarreraSinFormacion` | 0 | 1 (s41) | nuevo; s41 tiene dos ciudades-puente, (38,15) y (3,26), y el azar de la escena se desplaza |
| `carasCortadas` | 1 (s22) | 3 (s14, s22, s26) | aceptado por el usuario |
| `sendasPorObjeto` | 1 (s15) | 1 (s15) | sin cambio; viene del paso 1. `CLAUDE.md` dice 0, y el test solo mira s7, s6, s2 y s9 |

El resto del informe está a 0 en 1-100: `puentesTapados`, `sendasDeEstriboEnAgua`, `spritesSobreSenda`,
`basesSobreReserva`, `murallas*` y los demás.

### Observaciones (no son fallos)

- **Ciudades-puente cuya otra orilla es una barrera o agua.** Enfrente puede ser:
  - montaña: s22 (17,37), s36 (13,25), s46, s56, s58, s68 y otras, 12 en 1-100;
  - agua: s23 (28,15), por el ensanche bajo la cara.

  La tercera región entra en diagonal. Se lee como un puente que baja a un pie de roca
  (`qa/s22-…`, `qa/s23-…`).
- **Puentes en diagonal en el agua de frontera.** 17 nodos de agua fuera del río tienen agua en las
  cuatro vecinas en cruz (s5 (11,5), s13 (5,14), s29, s66, s96, s83…). Sus dos regiones se tocan por
  las diagonales, y el puente de troncos va en diagonal (`qa/s5-puente-en-medio-del-agua-11-5.png`).
  Se lee bien.
- **La forma lago da ríos cortos**: mediana de largo 27 y mínimo 16 (s67). Se leen como un lago con
  su desagüe al borde (`qa/mapa-s67-24px.png`). Cumple la continuidad, que es lo que manda.

## Workarounds usados

- **«Resolver sola» en las batallas de s13.** Lo ofrece la propia pantalla de batalla. No esconde nada
  del río, así que no afecta.
- **Un espejo para convertir casillas en píxeles.** Es el mismo método que `pnpm capturas`. Cada clic
  real pasa por el `casillaBajo` de la página, y lo que se cita es lo que dice la barra de la página.
  No afecta.
- **`CAPTURAS_SOLO` con todas las pasadas menos `escritorio`.** Lo usé solo porque la primera pasada
  cortó el resto. No repite nada de lo que ya se había corrido.

## No probado

- **El espectador mirando una ciudad-puente.** Su partida de `capturas` no lleva ninguna. Queda
  cubierto por la inversa exacta de `adaptarEscena`, no a la vista.
- **Un héroe rival de pie en la orilla de una base sobre el río.** Por la regla, pulsarlo llevaría a
  la ciudad y no al héroe.
- **El móvil y el táctil con una ciudad-puente.** Sus pasadas de `capturas` están en verde, pero con
  otras semillas.
- **`rectitud.ts`.** El generador no cambia en el paso 2, y el paso 1 lo midió (102 / 0 / 5).
- **`pnpm qa`.** No se tocan `src/server` ni el contrato.

## Veredicto

**No apto**, por H1. El río cumple lo que pidió el usuario: continuo de borde a borde en todos los
mapas y tamaños probados, de una casilla, plano, cruzado solo por puentes y ciudades-puente. La
ciudad-puente se pinta, se pulsa y se abandera bien.

Lo que bloquea el cierre es H1: `pnpm capturas` sale 1, y al empezar en s7 y s30 pulsar tu héroe te
mete en el castillo. Es un arreglo corto, y H2 decide cuál. Antes de fusionar hay que enseñarle al
usuario H3, con s83 y s66.
