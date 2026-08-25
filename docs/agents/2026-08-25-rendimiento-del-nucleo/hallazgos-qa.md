# Hallazgos de QA — decididos

Veredicto de QA: **apto con reservas**, 14 criterios y 6 hallazgos verificados
uno a uno. Cinco hallazgos; uno entra, cuatro se anotan.

**Lo primero, porque es lo que QA hizo mejor que el ciclo**: verificó el criterio
1 con **un solo instrumento** —el `banco.ts` de HEAD copiado sobre cada commit,
incluido `34d31fc`, que no tenía banco— en vez de fiarse de doce medidas tomadas
con doce versiones distintas de la herramienta. Los doce commits dan el mismo
sha256 y el `diff` de los volcados de 3 MB es vacío. Y lo llevó **a 500
semillas**, más allá de lo que probó el ciclo: `diff` vacío también.

---

## A · El guardia tenía un segundo agujero — ENTRA, y ya está hecho

`cost < ultimoPop` **no dispara si la búsqueda anterior terminó extrayendo coste
0** — un origen sin salidas—, porque `0 < 0` es falso. La segunda búsqueda hereda
el `orden` de la primera y el empate se resuelve al revés **en silencio**.

Y es alcanzable: un `map_generate` con un pueblo rodeado de agua da esa búsqueda
degenerada dentro de `validateMapPlan`.

No expone nada hoy —los dos llamantes alojan una frontera por llamada— pero eso
no lo salva: **`CLAUDE.md` ya promete «lanza si la reutilizas»**, y una promesa
más fuerte que el código es peor que no tenerla.

**Hecho por el coordinador** (`e2fa99f`): un segundo `throw` que no mira costes
sino si la frontera ya se agotó. Una búsqueda sana llama a `pop()` hasta que
devuelve `undefined` —una vez, al final— y no vuelve a empujar.

Los dos guardias rotos a mano y vistos rojos, cada uno por su puerta. **Y el dato
que confirma a QA**: el test que ya existía —«se niega a servir a una segunda
búsqueda»— **sigue verde sin el guardia nuevo**. Nunca cubrió ese caso.

`pnpm banco` después: mismo sha256, 28 300 líneas, ancla igual.

## B · `CLAUDE.md` heredaba la promesa — ENTRA, hecho

Reescrito con lo que hay: son **dos** `throw`, y hicieron falta los dos.

Todo lo demás que escribí, QA lo verifica cierto: 251 tests, `verify` 6,7 s,
banco 4,1 s, barrido 1,1 s, `qa` 5,4 s, CI corriendo el banco, y el contrato del
desempate —que comprobó **rompiéndolo**—. También la premisa de reproducibilidad:
en `core` solo hay `min/max/floor/ceil/abs/round/imul`, y el sha no cambia con
`LANG` ni `TZ` distintos.

## C · La viñeta del navegador no era reproducible — SE ANOTA

El ingeniero apuntó «clic en niebla → *No hay camino hasta ahí*» en la semilla 71.
QA lo intentó: **ese mapa no tiene ni una casilla de agua**, así que la niebla no
bloquea y el héroe camina (720 → 80). El mensaje sale al pulsar la casilla del
propio héroe.

No cambia ningún veredicto —lo que se quería ver, la ruta y su coste, se vio— y
vive en `implementacion.md`, que no se commitea. Se anota porque una comprobación
manual mal descrita se hereda como si fuera cierta.

## D · El test de los 20 pares es ciego a su propia frontera — SE ANOTA

Mutar `>` a `>=` en `stepTowards` deja `game.test.ts` **49 de 49 en verde**. Lo
cazan `agent-link` y el ancla del sha256, así que la malla completa aguanta; el
test solo no.

No entra porque el ciclo ya tiene la red que importa —el volcado— y porque
reforzarlo bien es trabajo de quien toque `stepTowards` la próxima vez. Se anota
para que no se confunda «ese test pasa» con «ese camino está probado».

## E · Las cifras: QA no arbitra, y hace bien — SE ACEPTA

El ingeniero midió −3,2 % para la primera optimización y el crítico −7,1 %; el
ingeniero mandó la suya. QA hizo **once pasadas alternadas**: **−4,7 %** (mínimos)
/ **−4,9 %** (medianas), con una **dispersión del 13 % que cubre a los dos** — y
con la máquina **no en reposo** (Chrome al 30 %, un `vite --host` de otro
proyecto al 24 %).

**Se acepta el reproche**: «manda el mío» era sobreconfianza, y la conclusión
correcta es que con esa dispersión ninguna de las dos cifras se sostiene sola.

La que sí se sostiene, y es la que va al issue: **`autoResolve` 240 → 146 ms,
−39 %**, donde el ingeniero (−38 %) y el crítico (−36 %) coinciden. Y el titular
del ciclo, que QA mide por su cuenta: **8935 → 3533 ms, −60,5 %**.

---

## Un efecto colateral, y va aquí para que no se pierda

QA paró un `pnpm dev` con `pkill -f vite` y **mató de paso el servidor de
desarrollo de otro proyecto del usuario** (`ne-fan`, un `vite --host`). Hay que
relanzarlo a mano; no se hizo porque es otro repositorio.

Queda escrito como lo que es: una orden demasiado ancha en una máquina
compartida. `pkill -f vite` no distingue de quién es el vite.
