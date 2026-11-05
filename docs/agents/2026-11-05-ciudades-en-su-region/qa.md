# QA: ciudades y pueblos en su región, y la ocupación (tarea 2 del puesto fronterizo)

05-11-2026. Árbol de trabajo sin commitear de `claude/nifty-kare-5bc168` (fases 1-3 y la pasada
Simplify). Contrasto contra la cita literal de `requisitos.md` y las decisiones P1-P4. No he tocado
código. Sí he creado ficheros temporales: los arneses del navegador en `.cache/` (ignorado por git) y
las pruebas adversariales en el scratchpad, fuera del repositorio.

## Servidor que dejo levantado

- **URL**: `http://127.0.0.1:3217/?seed=3&heroe=caballero` (Torreblanca, la ciudad de región, queda
  al sur de la base. Cierra la región 6 tomando (17,7), (9,17), (21,21) y (22,17) y la ciudad pasa a
  ser tuya, ocupada por su guarnición neutral). También `http://127.0.0.1:3217/?seed=1&heroe=guerrero`:
  El Soto, un pueblo en un paso de montaña, está a 6 casillas de la base.
- **PID 435328, grupo 435328** (`vite --port 3217 --strictPort --host 127.0.0.1`, con cwd en este
  worktree). Para pararlo:
  `kill -TERM -435328`, y después `ss -ltnp | grep ':3217'`.

## Criterios

| Criterio | Veredicto | Evidencia |
|---|---|---|
| C1/P2. Ciudades en mitad de su región; en un nodo, solo las bases y las ciudades-puente | ✅ | Semillas 1-5: las 4 ciudades que no son base están todas `en: region` (`dondeEsta`). Ejemplo de s3: `town-2@9,12:region#6`. Lo confirman `test/ciudades-de-region.test.ts` (6/6) y la captura `qa-01-s3-inicio.png`, con el recinto en mitad de la región y sus caminos saliendo por las puertas. |
| C1/P2. Pueblos en un nodo, uno de cada cuatro parejas | ✅ | Semillas 1-5: 2 pueblos `muro/<barrera>` por mapa (s1 mountain, s2 y s3 cliff, s4 forest, s5 mountain), es decir 1 de las 4 parejas. `test/pueblos-en-un-nodo.test.ts` 6/6. |
| C2. El plan del agente admite ciudad en región o en el muro, y pueblo en el muro; lo que no vale se rechaza diciéndolo | ✅ (con H4) | Adversarial F/F2: una ciudad de región con dueño se rechaza («es de quien tenga la región; quítale el dueño o ponla en el muro»); un pueblo dentro del recinto, también; dos ciudades a 3 casillas, también; un pueblo sobre agua, también. Un pueblo en el muro de montaña entre dos regiones vale y abre su casilla con `barrera=mountain`. |
| C2. Mundos `prueba` y `ejemplo` | ✅ | `pnpm mundo validar prueba` → «el mundo "prueba" vale»; con `ejemplo`, igual. |
| C3. El dueño de un sitio de región es el de la región; el sitio del muro se toma como un paso | ✅ | En el navegador, s3 día 3: al tomar el último paso de la región 6, la crónica dice «Torreblanca es tuya: su región ya es tuya». En s1, El Soto (8,14) se toma pisándolo (`node_captured`, dueño 0). Adversarial A: cuando el rival toma un nodo, `town_owner_changed 0→null`. |
| C4/P1. La guarnición neutral dentro de una región propia la ocupa | ✅ | En el navegador, s3 día 3: «Una guarnición neutral ocupa Torreblanca: no te da nada hasta que eches al ocupante». El lateral pone «Torreblanca +0 · ocupado» y la barra «+750/día» (sin la ciudad). En el mapa, un escudo gris con aspa sobre la ciudad (`qa-04b`). |
| C4/P4. Ocupada no da oro, ni recluta, ni construye, ni crece, ni se contrata, ni vende la armería, y cada acción dice su motivo | ✅ en las reglas, ⚠️ en la pantalla (H1) | `ocupacion.test.ts` (P4 y «el lunes no crece») en verde. En el navegador, «Contratar héroe» sale apagado con la frase entera. Pero la ficha de la ciudad dice a la vez «Ingresos 500 oro/día», «Construir hoy: disponible» y «Crecimiento semanal +8» (H1). |
| C4. El héroe enemigo en la casilla la ocupa sin quedársela; no deja tropa, ni recluta, ni construye | ✅ | Adversarial E: dejar tropa da «no se puede dejar tropa: Torreblanca no es tuyo». `ocupacion.test.ts`: construir da «… no es de tu bando». Adversarial B: si el rival cierra la región con mi héroe dentro de la ciudad, sale `town_owner_changed null→1` y `site_occupied` con mi héroe como ocupante. Mi héroe dentro no recluta («no es de tu bando») ni deja tropa. |
| C5/P3. Se recupera atacando, tras la muralla del sitio; si el ocupante se va, también | ✅ (núcleo), ⚠️ en el navegador | Adversarial G: el rival que ataca a mi héroe dentro de mi ciudad de región pelea `foe hero` tras `piedra`, y al ganar se queda en la puerta (14,3) sin ocuparla. En `ocupacion.test.ts`, contra la guarnición neutral o el héroe ocupante pelea tras piedra, y en el pueblo tras madera. En el navegador no llegué a la batalla: el rival tomó mi base ese mismo día 3 (ver «No probado»). |
| Recoger lo propio de un sitio que ya no es tuyo sí, dejar no | ✅ | Adversarial C (Las Eras, con la región pasada al rival): dejar da «Las Eras ya no es tuyo: puedes recoger la guarnición que dejaste, no dejar más». `repartir_tropa` dejando, el mismo rechazo (no cuela un dejar por el reparto). Recoger, permitido. |
| La crónica (`site_occupied`, `site_freed`, `town_owner_changed`), con protagonista, sitio y sello | ✅ | Navegador s3 y `recentEvents` del agente (adversarial D2): los tres hechos con `actor` y `at`. Adversarial E: el hecho sale una sola vez aunque pasen turnos. |
| C7. La base, en un nodo; perderla elimina | ✅ | Navegador s3 día 3: el rival asalta la base tras la muralla de piedra (`qa-05`) y sale «Derrota: has perdido tu base.». |
| C8. La IA no se rompe y recupera lo suyo | ✅ | `barrido-semillas.ts`: «sin terminar: 0/4». Adversarial H: la IA del 0, con ventaja, va a por su ciudad ocupada, gana y escribe `site_freed`. |
| C9. El agente (`knownMap` con `owner`, `node`, `occupiedBy`; `occupied`; prosa OCUPACIÓN) | ✅ (con H3) | Adversarial D/D2: `{"kind":"town","owner":0,"node":false,"occupiedBy":{"hero":"hero-1","owner":1}}`, y la memoria de la niebla conserva `{"garrison":null}` cuando el rival ya no mira. `towns[].occupied` e `income.towns[].occupied` traen la frase. `pnpm qa` → exit 0, «terminado por fin de partida». |
| C9. El espectador | ✅ (por test) | `test/espectador.test.ts` 25/25: la vuelta del cable lleva los sitios con dueño y ocupante. No lo miré en el navegador. |
| C10. Banco | ✅ | `pnpm banco`: `8e45709f…`, «ancla: igual», 0/20 sin terminar. |
| Typecheck, lint y tests de lo tocado | ✅ | `pnpm typecheck` exit 0. `pnpm lint`: «Found 10 infos», los de siempre. `ocupacion`, `pueblos-en-un-nodo`, `ciudades-de-region`, `invariantes`, `agent-contract`, `espectador` y `guarniciones`: 7 ficheros, 232/232. |
| Consola del navegador | ✅ | 0 errores en las tres pasadas (s3 con la región cerrada, s3 hasta la derrota y s1 con El Soto). |

## Hallazgos

Ninguno es bloqueante.

### H1 (importante). La ficha de la ciudad ocupada contradice su propia frase
- **Cómo reproducirlo**: `?seed=3&heroe=caballero`, sal de la base, toma (17,7), (9,17), (21,21) y
  (22,17) (unos 3 días) y pulsa «Torreblanca» en «Castillos». Captura `qa-03-s3-ciudad-ocupada.png`.
- **Qué se ve**: arriba, «Torreblanca está ocupada…: no da oro, ni recluta, ni construye, ni crecen
  sus moradas…». Justo debajo, «Ingresos 500 oro/día», «Construir hoy: disponible» y «Crecimiento
  semanal: Guerrero con escudo +8, Escudero +8».
- **Qué esperaba quien juega**: que las tres filas digan lo mismo que la frase. Con la ciudad aislada
  ya se hace: la fila de ingresos añade «· sin cobrar» (`SIN_COBRAR`, `views/panels.ts:771`), así que
  con la ocupada se espera algo como «· ocupada», «Construir hoy: no (ocupada)» y el crecimiento
  apagado o con «se pierde esta semana».
- **Lo mismo**: la sección «Guarnición» de esa ficha lista la tropa neutral (3 Guerreros con escudo y
  2 Escuderos, «Liderazgo 15 / 20») como si fuera la guarnición propia de la ciudad, y debajo pone
  «Sin héroe dentro, lo que reclutes se queda de guarnición». Nada dice que esa tropa es el ocupante.

### H2 (menor). El pueblo del muro tomado se cuenta como «Paso» y no aparece en «Pueblos»
- **Cómo reproducirlo**: `?seed=1&heroe=guerrero`, sal de la base y lleva al héroe a El Soto (8,14).
  Capturas `qa-08-s1-el-soto-guarnicion.png` y `qa-09-s1-el-soto-tomado.png`.
- **Qué se ve**: la crónica dice «Paso tomado en (8, 14)», aunque el diálogo que se abre dice
  «Guarnición de El Soto». El lateral no lo lista en «Pueblos», porque `rentaDelDia` solo da los
  pueblos unidos a la base y El Soto aún no lo está. La barra sigue en «+500/día».
- **Qué esperaba quien juega**: «Pueblo tomado: El Soto». Y verlo entre sus pueblos con «sin cobrar»,
  como ya se hace con una ciudad aislada en «Castillos». Ahora mismo el pueblo recién tomado no
  aparece en ningún sitio del lateral y no se sabe por qué no da oro. La desviación 9 de la fase 3 ya
  avisa de que no hay hecho propio para el pueblo; lo que se ve en pantalla es este texto.

### H3 (menor). Para el agente, la ciudad ocupada sigue ofreciendo lo que se le va a rechazar
- **Cómo reproducirlo**: `planConCiudadDeRegion`, Centro cerrada por el 0 con la guarnición neutral
  dentro, y `serializeAdventureTurn(state, 0).towns` (adversarial adv3).
- **Qué se ve**: `occupied: "Torreblanca está ocupada…"`, pero al lado `income: 500`,
  `canBuildNow: [town_hall, castle, …]` (9 edificios) y `recruitable` con `available: 8` en cada tipo.
- **Qué esperaba**: `canBuildNow` vacío y `income` 0, o al menos que la prosa diga que con
  `occupied` esas listas no valen. La prosa OCUPACIÓN dice que «cada rechazo lo dice», así que el
  agente solo se entera al perder la jugada. Es la misma familia que H1, en el contrato.

### H4 (menor). Un plan del agente admite un pueblo del muro en el borde del mapa y en el acceso de una ciudad
- **Cómo reproducirlo**: `validateMapPlan` sobre `planConCiudadDeRegion` con un pueblo en (11,0), la
  fila 0 de la montaña entre b y c, o en (5,2), el acceso norte de la base `town-0`.
- **Qué se ve**: los dos casos dan `VALE`, y `newGame` los monta con `barrera=mountain`.
- **Qué esperaba**: que se rechacen como ya hace el generador. La desviación 3 de la fase 3 quita del
  generador los pasos de la fila 0 porque la pieza del pueblo se sale del marco. La desviación 6
  reconoce lo del acceso. En el plan de prueba el acceso norte no lleva camino, así que no se cierra
  ninguna puerta; con un camino por ahí, sí se cerraría.

### Observaciones que no son hallazgos
- Cuando la región de una ciudad ocupada se queda sin dueño, `town_owner_changed` sale con
  `actor: null` y no se escribe `site_freed` (desviación 7). Es coherente: se ve por `from`.
- Un pueblo sobre agua dentro de una región se rechaza con «en el muro, un pueblo va sobre mountain,
  forest, cliff…». El rechazo es correcto, pero la frase habla del muro y el caso es un lago.
- El techo de `rectitud.ts` pasó de 15 a 23 (desviación 5 de la fase 2). Eso lo decide el usuario.
  No volví a medirlo.

## Workarounds usados
- **Ninguno en el estado de la partida.** Las pasadas del navegador juegan con clics reales del ratón
  desde el menú. Un `Session` espejo en node, como en `pnpm capturas`, solo sirve para saber dónde
  cae cada casilla en el lienzo. Para mirar Torreblanca arrastré el mapa, igual que lo haría la
  persona.
- «Fin de turno» lo pulsé por su posición en pantalla. Tras abrir y cerrar la ficha de una ciudad,
  `getByRole('button', {name: 'Fin de turno'})` de Playwright dejó de encontrarlo aunque estaba
  visible, habilitado, sin `inert` ni `aria-hidden` y sin ningún diálogo abierto. No conseguí aislar
  la causa. Con el ratón se pulsa bien, así que lo cuento como curiosidad del arnés y no como fallo.
- Las pruebas adversariales del núcleo manipulan el estado directamente (dueños de pasos, ejércitos,
  `state.guarniciones = {}`), igual que `ocupacion.test.ts`. Son pruebas de reglas, no de lo que ve
  quien juega.

## No probado
- **Recuperar la ciudad atacando en el navegador.** En s3 el rival asaltó y tomó la base el mismo
  día 3 (`qa-05-s3-el-rival-asalta-la-base.png`) y la partida acabó. La batalla tras la piedra y el
  `site_freed` están cubiertos por `ocupacion.test.ts` y por las adversariales G y H.
- **Llevar mi héroe a un sitio del rival y ocuparlo, en el navegador.** Hace falta que el rival
  cierre una región con un pueblo o una ciudad, y no llegó a pasar antes de la derrota. En el
  núcleo lo cubren `ocupacion.test.ts` («un héroe rival que entra la ocupa…») y las adversariales B
  y E.
- **El espectador en el navegador** (`pnpm mirar` contra una partida del servidor). Solo lo cubren
  `test/espectador.test.ts` y `pnpm qa`.
- **La armería ocupada en pantalla.** Torreblanca no la tiene. En el núcleo lo cubre `buyBlocker` en
  `ocupacion.test.ts`.
- No corrí `pnpm capturas` (el ingeniero lo dejó con solo «edicion» en rojo, igual que en HEAD), ni
  `verify` ni `verify:lento`.

## Comandos
- `pnpm typecheck` → exit 0; `pnpm lint` → «Checked 525 files … Found 10 infos.»
- `pnpm qa` → «terminado por fin de partida: 1 mapa diseñado, 4 turnos de mapa, 65 decisiones de
  batalla y 1 ascenso de tropa a héroe», exit 0.
- `npx tsx tools/qa/barrido-semillas.ts` → «sin terminar: 0/4 → []».
- `pnpm banco` → `8e45709f32fb11ef…`, «ancla: igual», 0/20 sin terminar.
- `pnpm vitest run test/{ocupacion,pueblos-en-un-nodo,ciudades-de-region,invariantes,agent-contract,espectador,guarniciones}.test.ts`
  → 232 passed. Por qué estos siete: son los que miran la regla nueva (ocupación, pueblos en un nodo,
  ciudades de región), las fronteras (invariantes), el contrato del agente, el cable del espectador y
  la guarnición de la ciudad, que se mudó a `guarniciones`.

## Capturas (`capturas/`)
- `qa-01-s3-inicio.png`: la base y, al sur, Torreblanca en mitad de su región.
- `qa-02-s3-region-cerrada.png`, `qa-03b-s3-lateral-renta-y-cronica.png`: el lateral con
  «Torreblanca +0 · ocupado» y la crónica.
- `qa-03-s3-ciudad-ocupada.png`: la ficha de la ciudad ocupada (H1).
- `qa-04-s3-torreblanca-ocupada-en-el-mapa.png`, `qa-04b-s3-torreblanca-detalle.png`: la marca de
  ocupación (escudo gris con aspa) sobre la ciudad.
- `qa-05-s3-el-rival-asalta-la-base.png`: la defensa de la base tras la piedra.
- `qa-07-s1-el-soto-neutral.png`, `qa-08a-s1-camino.png`, `qa-08-s1-el-soto-guarnicion.png`,
  `qa-09-s1-el-soto-tomado.png`: el pueblo en un paso de montaña, tomado (H2).

## Veredicto

**Apto con reservas.** La regla está bien en todo lo que pide el usuario: dónde van ciudades y
pueblos, el dueño derivado, la ocupación con P1-P4, la muralla del sitio, recoger sí y dejar no, la
crónica, la IA, el agente, el banco y `pnpm qa`. Las reservas son de presentación: la ficha de la
ciudad ocupada se contradice (H1, importante), el pueblo del muro tomado se cuenta mal y no se lista
(H2), el contrato ofrece jugadas que se rechazarán (H3) y el validador de planes es más permisivo que
el generador (H4).

## Vuelta 2 (05-11-2026)

Vuelvo a verificar solo lo que tocan H1-H4 (sección «Vuelta 1 de QA» de `implementacion.md`) y hago
una pasada adversarial nueva sobre lo que cambió. No he tocado código. Los arneses están en `.cache/qa2/`
(ignorado por git): `nav.ts` para el navegador, `ficha-heroe.test.ts`, `h4.test.ts` y
`acceso.test.ts` como sondas del núcleo, con su `vitest.config.ts` propio, y `buscar-ocupados.ts`.
Uso el `pnpm dev` del 3217 (PID/grupo 435328) y lo dejo levantado. El navegador es Chromium de
Playwright sin pantalla.

### Criterios

| Criterio | Veredicto | Evidencia |
|---|---|---|
| H1. Ficha de la ciudad ocupada por una guarnición neutral: cada fila dice lo mismo que la frase | ✅ | Navegador, `?seed=3&heroe=caballero`, tomados (17,7) el día 1, (9,17) el 2, y (21,21) y (22,17) el 3, todo con clics reales. Texto de la ficha: «Ingresos 500 oro/día · sin cobrar: ocupada» (`title` = la frase), «Construir hoy no: está ocupada» (`title` = la frase), «Mientras no mandes en ella no se amplía ni se recluta…», crecimiento «+0» / «+0» con «No crece mientras esté ocupada…», «GUARNICIÓN · La ocupa: una guarnición neutral. No es tuya: échala atacándola.» sobre sus 3 + 2, y «Contratar héroe» apagado con la frase. Ya no salen «disponible», «Liderazgo 15 / 20» ni «lo que reclutes se queda de guarnición». `qa2-02`, `qa2-03`. 0 errores de consola. |
| H1. La misma ficha con un **héroe** rival como ocupante | ✅ (por sonda, ⚠️ en el navegador) | La IA no ocupa nunca: en 1-100, IA contra IA, hay 5 `site_occupied` y los 5 son guarniciones neutrales (`buscar-ocupados.ts`), así que en pantalla no se llega sin forzar el estado. Sonda con el estado forzado como en `ocupacion.test.ts` (Centro cerrada por el 0, sin guarnición, `hero-1` en Torreblanca), pintada con `renderSide`: frase «…ocupada por Serena la Pálida, de los No muertos…», «500 oro/día · sin cobrar: ocupada», «no: está ocupada», crecimiento a +0 con su nota, «Guarnición Liderazgo 0 / 20 —» (la suya, vacía: es correcto, porque el héroe ocupante no es una guarnición) y «Contratar héroe» apagado. La tropa del rival no se enseña. La crónica dice «Un héroe del jugador 1 ocupa Torreblanca…». |
| H2. El pueblo del muro tomado: la crónica y «Pueblos» | ✅ | Navegador, `?seed=1&heroe=guerrero`, el día 1 al pisar El Soto (8,14): la crónica dice «Pueblo tomado: El Soto»; «Pueblos» muestra «El Soto +0 · sin unir», con `title` «sin cobrar: no está unido a tu base»; la barra sigue en «+500/día». `qa2-07`. |
| H2. Unirlo a la base hace que cobre | ✅ | El mismo día tomo (2,17), el otro nodo de la región 7, y la región queda cerrada y unida: «El Soto +250», la barra pasa a «+750/día» y la crónica dice «Paso tomado en (2, 17)» (el paso, por su casilla). Al pasar el día, el oro va de **25 500 a 26 250 (+750)**. `qa2-08`, `qa2-09`. 0 errores de consola. |
| H2. La crónica del espectador | ✅ (por test), ⚠️ en `pnpm mirar` | `espectador-paneles` (20/20) y el test de `pueblos-en-un-nodo` con los objetos del cable («El jugador 1 toma el pueblo de El Collado»). `renderLog` del espectador recibe `pasoOPuebloSiExiste(v.map.objects)` y `NADIE`, así que `e.from === viewer` no se cumple con un pueblo neutral. La pasada «espectador» de `pnpm capturas` se juega sin errores. |
| H3. El contrato con una ciudad ocupada | ✅ | Sonda `serializeAdventureTurn`: la ocupada por un héroe trae `income: 0`, `canBuildNow: []`, `recruitable: []` y `occupied` con la frase; la base sigue con sus 9 edificios y 2 reclutables; en `you.income`, `towns[].occupied` y `gold: 0`. La prosa OCUPACIÓN dice que la ocupada trae `income` 0 y las dos listas vacías. `agent-contract` 89/89. |
| H3. El contrato con una ciudad cortada de la base | ✅ | Sonda con (5,8) del rival: Torreblanca trae `income: 0`, con `canBuildNow` y `recruitable` llenos (cortada se construye y se recluta: es lo correcto); en `you.income`, `towns[].connected: false`, y los pueblos de Centro `{gold: 0, connected: false, occupied: null}`. La prosa ORO lo dice. |
| H4. `validateMapPlan` y el pueblo del muro en el borde o junto a una ciudad | ✅ | Sonda `h4.test.ts`: el pueblo en (17,8), el borde sur, se rechaza con «está en el borde del mapa…»; en (22,6), a 2 de Cripta Gris, «está a 2 casillas de la ciudad "Cripta Gris"…»; en (17,1), (22,7), (17,2), (17,6) y (11,4), a una del borde o a 3 de una ciudad, vale y se monta con `barrera=mountain`. El test del ingeniero cubre la fila 0 y el acceso norte de la base. `pueblos-en-un-nodo` 8/8. |
| H4. El generador usa la misma pregunta | ✅ | Leído en el código: `pueblosEnElMuro` llama a `puebloDelMuroBlocker(…, e.casillasDeCiudades)`, la misma función que usa `problemasDeLosPueblos`, y ya no tiene un `x < 1 ‖ …` propio. El banco no se mueve. |
| Adversarial: renta total = la suma del lateral | ✅ | s3: la barra pone +750 = Valdeluz 500 + Cabañas 250, y Torreblanca +0 · ocupada no entra. Sondas: libre +2000 = 500 + 500 + 4 × 250; aislada +500, con Torreblanca y sus dos pueblos «+0 · sin unir»; pueblo ocupado por un héroe +1750, con «Las Eras +0 · ocupado» y su frase. |
| Adversarial: ciudad unida sin ocupar, y la aislada | ✅ | En el navegador, la ficha de Valdeluz (s3): «Ingresos 500 oro/día», «Construir hoy disponible», crecimiento +8/+8, «Liderazgo 18 / 20» y «Sin héroe dentro, lo que reclutes…»; sin notas de ocupación (`qa2-06`). En la sonda, la aislada: «500 oro/día · sin cobrar: no está unida a tu base», «disponible» y crecimiento +8. |
| Adversarial: la armería ocupada | ⚠️ no probado | Ninguna ciudad de región nace con armería (s1-60), y una ocupada no construye. Para verla habría que construirla y que luego entrase un héroe, y la IA no lo hace. La sección de la armería solo se pinta con el edificio abierto en la base. La regla (`buyBlocker`) la cubre `ocupacion.test.ts`. |
| Adversarial: el lateral en el móvil a 390×844 | ✅ | La misma ficha de Torreblanca ocupada: el texto cabe, ninguna fila se corta, no hay scroll horizontal (`scrollWidth` 390 = `clientWidth`) y las filas se leen. `qa2-04`, `qa2-05`. |
| `pnpm typecheck` / `pnpm lint` | ✅ | exit 0; «Checked 525 files … Found 10 infos». |
| `pnpm qa` | ✅ | exit 0 (8 pueblos y 12 nodos en juego; 301 casillas exploradas por el agente). |
| `pnpm banco` | ✅ | `8e45709f32fb11ef…`, «ancla: igual», 0/20 sin terminar, 4 / 17 / 40. |
| Tests de lo tocado | ✅ | `ocupacion`, `pueblos-en-un-nodo`, `agent-contract`, `espectador-paneles`, `paneles` y `cronica`: 164/164. Por qué estos seis: la ficha y la lista de la ocupada (H1), el pueblo del muro y su regla (H2, H4), el contrato (H3), la crónica del espectador y la de la persona, y el ancla byte a byte de los paneles. |
| `pnpm capturas` (una vez) | ✅ | Sale 1 **solo** en la pasada «edicion» de la arena («Editar fichas» no visible, `capturas.ts:5960`), igual que en `HEAD`. Antes de esa, todas las pasadas se juegan: arranque, partida, móvil, táctil, sin arte, tropa, morada, anchos de la base, espectador y arena; 101 PNG en el scratchpad. No hay ningún error de consola en el log. |

### Hallazgos nuevos

Ninguno bloqueante ni importante.

#### H5 (menor). Un plan del agente admite un pueblo **de dentro de una región** en el acceso de la puerta de una ciudad
- **Reproducción**: `validateMapPlan(planConCiudadDeRegion())` con un pueblo más en (14,2), el acceso
  norte de Torreblanca, por donde pasa su camino hacia la puerta (14,3). Devuelve `[]`. `newGame` lo
  monta con `barrera=null`, y el camino a la ciudad pasa por la casilla del pueblo:
  (14,2) → (14,3) → (14,4). Con (16,4) y (15,6), a 2 de la ciudad, pasa lo mismo.
  (`.cache/qa2/h4.test.ts`, `.cache/qa2/acceso.test.ts`).
- **Qué esperaba**: H4 cerró este hueco para el pueblo **del muro**, pero el de dentro de una región
  sigue pudiendo ir en el acceso de una puerta. Y la puerta del pueblo, la casilla de debajo, cae en
  la puerta de la ciudad. Se juega, porque la ruta entra igual, pero la pieza del pueblo quedaría
  plantada sobre el camino de la puerta. Es de la misma familia que H4: el plan admite algo que el
  generador evita. `problemasDeRecintos` solo mira el 3 × 3. No sé si `HEAD` lo admitía igual con
  sus ciudades del muro, y no lo he medido. Que lo decida quien coordina: quizá sea para el backlog.

### Observaciones que no son hallazgos
- **La ficha abre con el scroll del lateral de antes.** Si se baja el lateral del mapa hasta
  «Castillos» y se pulsa la ciudad, la ficha conserva el scroll y el título «TORREBLANCA» queda medio
  cortado arriba (`qa2-02`; en `fix-02` del ingeniero se ve igual). Viene de antes y no es de esta
  tarea: es cómo se conserva el scroll al repintar.
- `puebloDelMuroBlocker` rechaza también el pueblo a 2 casillas al este o al oeste de una ciudad,
  donde no hay puerta ni acceso, pero la frase dice «en su recinto o en un acceso de sus puertas».
  Es conservador y coincide con lo que ya hacía el generador. Solo la frase lo dice de más.
- Con un héroe como ocupante, la sección «Guarnición» no repite quién ocupa (sí lo hace con una
  guarnición ajena). Lo dicen la frase de arriba y «no: está ocupada», y la guarnición que se
  enseña sí es la propia, así que no se contradice.

### Workarounds
- **En el navegador, ninguno en el estado**: clics reales desde la base. El `Session` espejo en node
  solo calcula dónde cae cada casilla y cuándo se pasa el turno, como `pnpm capturas`. El cambio a
  390×844 lo hago con `setViewportSize` a media partida. Equivale a girar o encoger la ventana y no
  toca la partida.
- **Las sondas del núcleo fuerzan el estado** (dueños de pasos, `guarniciones = {}`, el héroe
  colocado), igual que `ocupacion.test.ts`. Así pruebo las reglas y lo que pintan: el ocupante
  héroe, la ciudad aislada y el pueblo ocupado. Lo que ve quien juega solo está probado en el
  navegador con la guarnición neutral, porque la IA nunca ocupa con un héroe en 1-100.

### No probado
- La ficha ocupada por un **héroe** y la armería ocupada, en el navegador: en el juego no se llega
  a ninguna de las dos sin forzar el estado (ver arriba). Las dos están cubiertas por sondas y por tests.
- El espectador en vivo con `pnpm mirar`. Lo cubren los tests, la pasada «espectador» de
  `pnpm capturas` y `pnpm qa`.

### Capturas nuevas (`capturas/`)
- `qa2-01-s3-lateral-torreblanca-ocupada.png`: el lateral con «Torreblanca +0 · ocupada» y la crónica.
- `qa2-02-s3-ficha-torreblanca-ocupada.png`, `qa2-03-s3-ficha-bajada.png`: la ficha de la ocupada (H1).
- `qa2-04-movil-ficha-arriba.png`, `qa2-05-movil-ficha-abajo.png`: la misma ficha a 390×844.
- `qa2-06-s3-ficha-de-la-base.png`: Valdeluz, unida y sin ocupar.
- `qa2-07-s1-el-soto-tomado-sin-unir.png`: «Pueblo tomado: El Soto» y «El Soto +0 · sin unir» (H2).
- `qa2-08-s1-el-soto-unido.png`, `qa2-09-s1-dia-2-cobrado.png`: unido, +250, y el día 2 cobra 750.

### Veredicto (vuelta 2)

**Apto.** H1-H4 están arreglados como decidió `hallazgos-qa.md`. Lo he comprobado en el navegador
con clics reales (H1 por la guarnición neutral; H2 entero, también el cobro al unir el pueblo) y con
sondas de lo que el juego no deja alcanzar (el ocupante héroe, la ciudad cortada, el pueblo ocupado y
el contrato). La renta total cuadra con el lateral en los cinco casos. El móvil cabe. 0 errores de
consola. `pnpm qa` sale 0, el banco sigue igual y `pnpm capturas` solo falla en «edicion», como en
`HEAD`. H5 es menor, de la familia de H4, y no impide cerrar.
