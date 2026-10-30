# QA: el flujo de revisión de animaciones (30-10-2026)

Validado contra la petición literal de `requisitos.md` y sus criterios 1-8, con las decisiones
del usuario (selección por hoja entera; fuera `experimento.ts`, `evaluar.ts` y `.mezcla.png`).
Lo he usado como quien usa el taller: las órdenes de la skill, en el orden de la skill, sobre
**templario-escudo d4** (no he tocado la carpeta del piloto del caballero de la muerte salvo
para LEER sus versiones ya pintadas). Dos llamadas de juicio a Codex de las tres permitidas (un
juez y un árbitro). Ni `trabajar`, ni `versiones` válidas, ni `adoptar`, ni `assets/`.

## Comprobaciones con su porqué

| Comprobación | Por qué | Resultado |
|---|---|---|
| `pnpm typecheck` | tocan TS del taller | 0 errores (8 s) |
| `pnpm lint` | idem | 507 ficheros, 10 infos (las de `unidades.ts`, de antes) |
| `vitest run` taller-encuadre, taller-revision-maniqui, taller-jurado, taller-versiones, taller-huesos, taller, publico, clips-por-unidad | los criterios 1, 2, 3, 5, 6 y 7, y lo que tocan (`empaquetar`, `encargo`, build, `.mezcla`) | 92 de 92 en verde |
| `vitest run test/taller-8d.test.ts` | `juntar.ts` y el trabajador | 422 / 425: **los 3 rojos conocidos**, con la causa dicha (vampiro `attack` 6,5 → 3,8; `atlas.json` de caballero d0 3,8 → 4,2 y 10,5 → 14; elfo d0 6,5 → 5,6: maniquí nuevo sin rederivar). No veo otra causa |
| No corrí `pnpm verify`, `qa`, `capturas` ni `banco` | no tocan servidor, cliente ni `core` | — |

## Criterios

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | `maniqui <id> --huesos` escribe el esqueleto por hoja, en píxeles y en el mundo; hojas idénticas byte a byte; lo vigila un test | ✅ (con un trozo ⚠️) | `taller-huesos` 6/6 en verde; 800 `*.huesos.json` en `_poses/` (21 MB, sin seguimiento: hay que commitearlos o CI falla ese test). La rama «una hoja distinta lanza» (`sacarElEsqueleto`, `trabajador.ts:1149`) la leí, **no la ejecuté**: renderiza 2,5 min y escribe en `assets/` |
| 2 | `revisar-maniqui`: hacia atrás (en el mundo), reposo que se mueve, arma que no se lee; la compuerta rechaza diciéndolo | ✅ con reservas | `revisar-maniqui templario-escudo` / `elfo-arquero`: 0 avisos de sentido, 24 y 25 avisos de arma (H6). Compuerta: el test la pasa por una cola real temporal (hacia atrás, sin esqueleto con la orden, de otro render; deja pasar el bueno, la hoja B y el montado). Además pasé `maniquiBlocker` por los 880 encargos reales de 8 direcciones: 0 bloqueados; las 400 hojas A, 360 con maniquí propio (todas con esqueleto vigente) y 40 de montados (fuera, como dice el código) |
| 3 | `revisar <id> [dN…]`: paneles por clip, cifras y el jurado de ChatGPT con su esquema | ✅ con reservas | `revisar templario-escudo d4 --sin-juez`: 6 clips en 9,7 s, cada uno con tira, superposición, encuadre, coherencia (+bucle en idle/walk/charge), `paneles.json`, `cifras.json`, `prompt.md`. Con juez (`--clips=idle`): `juicio.gpt.json` válido en 75 s. Reservas: H1, H2, H5 |
| 4 | La skill conduce el flujo (maniquí, dos jurados con unión, árbitros, visor, correcciones, comparación a ciegas) | ✅ con reservas | Seguí los pasos 2-4 de punta a punta en templario d4 «idle»: escribí yo el juicio de Claude → `jurado unir` (5 hallazgos, 1 de los dos) → `jurado arbitrar` (árbitro de ChatGPT en 46 s: 4 real, 1 falso) → mi `arbitraje.claude.json` → `cruzar` (3 reales, 2 en disputa, «2 para el visor») → `visor` arrancado con la receta `set -m` de la skill, URL impresa, la página con 2 casos animados (maniquí, pintado, pintado a 2 fps), dos respuestas guardadas, recarga conserva «2 de 2», parado por su grupo y el puerto libre → `cruzar` otra vez: 4 reales, 1 falso, 0 en disputa; `instrucciones-a.txt` sin el falso. Paso 1: falta el visor del maniquí (H4). Pasos 5-6 no probados de punta a punta (abajo) |
| 5 | C1, sin modelo: el tronco sigue la trayectoria del maniquí en x e y; test con un desplazamiento fabricado | ⚠️ el mecanismo sí; lo que eligió el usuario, no probado | `taller-encuadre` 4/4. Pero no alcanza la paridad con `encuadre.py` (lo dice el ingeniero) y en las versiones ya pintadas del piloto los pies bajan hasta 15 px por debajo del suelo (H3). Hay que verlo en el visor antes de darlo por bueno |
| 6 | Varias versiones por hoja; entra la que gana a ciegas en los dos órdenes; si ninguna, se queda la de ahora y se dice | ⚠️ no probado de punta a punta | Tests puros en verde (12). `elegir` sin versiones lo dice con la orden que falta. No había ninguna ganadora que adoptar y no podía encolar ni adoptar. Riesgo de datos viejos: H2 |
| 7 | El empaquetado corta por la rejilla antes de fallar | ✅ con reserva | Test en verde. En lo pintado del piloto (leído): 4 de 11 hojas de versión se salvaron por `porRejilla`; `caballero-de-la-muerte-v-esqueleto-d1-b` falla con los dos motivos («la banda 3 tiene 6 figuras»), como debe. Motas sueltas: H8 |
| 8 | El piloto en tres unidades, revisado y enseñado al usuario en el visor | ❌ aún no | En curso por el coordinador: hay versiones de d0-d1 del caballero, ninguna `eleccion-*.json`, ninguna adoptada, no hay `piloto.md`, y el templario de escudo y el elfo arquero no han empezado |

## Hallazgos

### Importantes

**H1. `revisar` juzga sin avisar lo pintado sobre otro maniquí, y el jurado lo da por defecto
de la pintura.** `revisar-maniqui templario-escudo` dice «pintadas sobre otro maniquí (16):
d0-a … d7-b», pero `revisar templario-escudo d4` lo juzga igual contra el maniquí nuevo
(`block_idle`, escudo alzado y espada horizontal), y ChatGPT da «rehacer» con dos `no_copia_al_maniqui`
de severidad 3 y un `mira_a_otro_lado` que son el cambio de maniquí, no un fallo del pintor
(`.cache/taller/revision/templario-escudo/d4/idle/juicio.gpt.json`, tira en `…/idle/tira.png`).
Hoy son así las 16 A y B de los 45 maniquíes renderizados de nuevo (unas 570 hojas). La skill
dice qué hacer con un aviso de sentido, pero no con «pintadas sobre otro maniquí»: ni «repinta
antes de revisar», ni que `revisar` lo diga. Reproducción: `pnpm taller revisar-maniqui
templario-escudo` y `pnpm taller revisar templario-escudo d4 --clips=idle`. Esperaba: que
`revisar` avisara (o se negara) por hoja, como hace la compuerta.

**H2. Los juicios se guardan por existencia del fichero y no se rehacen cuando cambia la hoja.**
`revisar` salta el juez si existe `juicio.gpt.json` (`revisar.ts:161`), `jurado arbitrar` si
existe `arbitraje.gpt.json` (`jurado.ts:248`) y `elegir` si existe
`comparar-<h>/<v>/orden-<n>/<clip>.gpt.json` (`versiones.ts:381`), sin mirar el sha de la hoja
juzgada. Visto: volví a lanzar `revisar templario-escudo d4 --clips=idle`; los paneles se
rehicieron (15:41:38) y el juicio quedó el de antes (15:41:04), sin decir nada. Consecuencias
en el flujo de la skill:
- «Lo adoptado se vuelve a revisar (paso 2)»: la segunda ronda reutiliza el juicio de ChatGPT
  de la hoja vieja.
- El ingeniero dice que las 8 pinturas `esqueleto`/`todo` del piloto hay que repetirlas: si
  `elegir` ya corrió sobre una versión, al repintarla compara con lo dicho de la anterior. Ahora
  mismo hay comparaciones de `tirada` de d0 escribiéndose (15:38-15:39).
- `cruzar` solo escribe `instrucciones-<h>.txt` de las hojas con algo; si en otra ronda no queda
  nada, el fichero viejo se queda y `versiones` lo mete en la versión `todo` (`versiones.ts:212`).

**H3. C1 hunde los pies bajo el suelo.** En las versiones ya pintadas del piloto (con C1 en su
procedencia, `encuadre`), el píxel más bajo de cada celda baja de la línea del suelo (y = 342):
caballero d1 `tirada` carga, fotograma 7, en 357 (C1 movió +15) y marcha 7 en 353 (+11); d1
`esqueleto` carga 7 en 354; d0 `todo` carga 3 en 352. El maniquí, en esos fotogramas, tiene el
pie más bajo en el suelo (341 en la carga de d1). La media de los desplazamientos es 0: ancla la
media al suelo, no el pie de apoyo, y los fotogramas con el pie en el suelo quedan por debajo.
Captura: `/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-animation-evaluation-improvement-f77b70/9a22707e-7925-481e-baf9-ba7f0445f74e/scratchpad/carga_d1.png`
(la carga de d1 `tirada` con la línea verde del suelo). Es probablemente la parte de la
paridad que falta (el término absoluto del estimador que tenía `encuadre.py`). Lo que votó el
usuario fue la versión de Python: hay que enseñárselo en el visor antes de pintar el piloto
entero con esto.

**H4. El «visor del maniquí» del paso 1 de la skill no existe como orden.** La skill dice
«díselo a la persona, con el visor del maniquí si quiere verlo», y el usuario pidió que el visor
sea parte del flujo; pero `pnpm taller visor <id>` solo enseña disputas y elecciones («nada que
enseñar (ni disputas sin mirar ni versiones ganadoras)»), `casos_maniqui.py` se borró y no hay
otra orden. Los dos visores vivos en los puertos 3191 y 3192 son del prototipo
(`visor.py servir`, que ya no existe en el código).

### Menores

**H5. La superposición no casa con lo pintado en la marcha y la carga.** El muñeco del maniquí se
lleva a la celda con `origen + k·(p − apoyoReposo)`, pero lo pintado se coloca por sus pies
(`posicion: false`). En versiones recién pintadas del caballero, el muñeco acaba 10-30 px por
encima de los pies pintados (marcha: esqueleto hasta 324, pintado hasta 339; carga: 308 frente
a 331) y más bajo de alto. En el templario de escudo (hoja vieja), los pies del muñeco a la
altura de las rodillas (`…/templario-escudo/d4/walk/superposicion.png`). El jurado se calibró con
estos paneles, así que no lo subo, pero empuja a dar `no_copia_al_maniqui`.

**H6. `armaIlegible` avisa demasiado y contradice «solo en unos».** 24 avisos en el templario de
escudo y 25 en el elfo arquero, casi todos «detrás del cuerpo». Y como une las piezas, puede
dar el clip entero: elfo arquero d2 «shoot», fotogramas 1-7 todos «detrás del cuerpo», justo el
caso que el criterio 2 excluye. Con este ruido, decírselo a la persona como pide la skill no
sirve, y entra tal cual en las notas de la versión `todo`.

**H7. Lo que no cumple el sentido del esquema pasa.** Un `juicio.claude.json` con `clip`
«elfo-arquero-d0-walk» en la carpeta de templario d4 idle, fotogramas `[0, 42, -3]`, categoría
`bucle` con tipo `arma_en_otra_mano` y veredicto «bien» con un hallazgo de severidad 3: `unir`
lo acepta («5 hallazgos»). Un `arbitraje.claude.json` con el índice 0 dos veces (real y falso) y
un índice 99 que no existe: `cruzar` lo acepta (se queda el primero e ignora el 99). Los
fotogramas fuera de 1-7 llegarían a las instrucciones del pintor («columna(s) 0, 42, -3»). Lo
que el esquema sí rechaza lo dice bien: el campo de más, el tipo inventado y el JSON roto, con
la ruta y el campo.

**H8. Motas sueltas tras cortar por la rejilla.** En
`caballero-de-la-muerte/d0/versiones/todo/hoja-a.webp` (salvada por `porRejilla`), la marcha
lleva una mota de 8-10 px junto a los pies en los fotogramas 1-4 (componentes aparte de la
figura, en y ≈ 341, x ≈ 250-268). El ingeniero ya avisaba de este tipo de resto.

**H9. Órdenes que salen 0 sin hacer nada.** `pnpm taller revisar-maniqui` sin id,
`revisar-maniqui --civil` (no revisa el maniquí civil, aunque la compuerta lo mira),
`reprocesar` sin id y `revisar … --clips=nada` (un clip que no existe). Las demás dicen su uso
o el motivo: `jurado` sin paso, `d8`, `versiones … d9 a`, `… d4 z`, `elegir` sin hoja, id
inexistente («no tiene arte ni en assets/unidades/ ni en assets/npcs/»).

**H10. «Lo ya pintado se arregla con `reprocesar`» solo vale para lo que sigue en la cola.**
`reprocesar` busca el encargo en `hecho/` o `fallido/` y, si no está, dice «el encargo «…» no
está en fallido/» (lo vi con un id inexistente; con `templario-escudo-d4-a` el clasificador de
permisos no me dejó lanzarlo, y por el código sigue el mismo camino). Lo dicen la skill (paso 5)
y `docs/art/taller.md`. Para casi todo el catálogo no aplica, y el mensaje no lo explica.

**H11. Mensajes que no dicen qué orden falta.** «falta el juicio de gpt (…/juicio.gpt.json)» no
nombra `pnpm taller revisar`; «no está …/union.json» no nombra `jurado unir`. `jurado` no tiene
`--clips`: tras `revisar --sin-juez` de toda la dirección, no se puede unir un solo clip juzgado.

**H12. Restos de lo retirado.**
- Los 46 `poses.json` de `_poses/` (45 unidades y el civil) siguen listando en su `sha256` las 16
  `.mezcla.png` que se borraron (49 entradas, 16 sin fichero en el caballero). Nadie lo lee.
- `.cache/taller/revision/maniquies` sigue en disco (557 MB, última escritura a las 14:15),
  aunque el plan decía borrarla el mismo día.
- `docs/art/taller.md` dice que C1 sigue «a la cadera del maniquí»; el código sigue el tronco
  (caderas y hombros).

**H13. Ruido en consola.** Cada `revisar` imprime en rojo `[E:onnxruntime] Failed to load …
libcublasLt.so.13` antes de seguir en la CPU. El visor deja en la consola un 404 de
`respuestas.json` al cargar sin respuestas y un `ERR_ABORTED` por cada POST de 204, aunque las
respuestas se guardan.

**H14. `vision-instalar`.** `requirements.txt` resuelve (`uv pip install --dry-run` en un entorno
aparte, salida 0). Pero `uv venv` sobre el entorno que ya existe avisa de que en el futuro pedirá
`--clear`, y los modelos de pose no se bajan al instalar: los baja el primer `revisar` desde
download.openmmlab.com. No lo lancé sobre el entorno real porque lo usan otros procesos.

## Workarounds usados

- **Aparté los `prompt.md` de walk…death de templario d4** (los dejé como `.aparte` y luego los
  quité) para poder `unir`/`arbitrar` solo «idle` con dos llamadas a Codex. Equivale a lanzar
  `revisar --clips=idle` en una carpeta limpia, que es un uso legítimo. Pero deja ver H11: tras un
  `revisar --sin-juez` de la dirección entera, no hay forma de unir un clip suelto.
- **Escribí yo el juicio y el árbitro de Claude** en lugar de subagentes, para no gastar. Es el
  mismo fichero y el mismo esquema que validan `unir` y `cruzar`.
- **El navegador**: el visor lo abrí en el panel de vista previa, no en el Chrome del usuario.

## No probado, y por qué

- `maniqui --huesos` de punta a punta y su rama de «hoja distinta, lanza»: escribe en `assets/`
  y tarda 2,5 min por unidad.
- `versiones` válidas, `trabajar`, `adoptar`: lo prohibía el encargo (encolarían en la cola que
  están vaciando los trabajadores del piloto). `adoptarBlocker` solo por sus tests.
- `elegir` de punta a punta: no había versiones de templario y el del caballero lo está corriendo
  el coordinador.
- El piloto (criterio 8) y que el usuario lo vea en el visor.
- `vision-instalar` sobre el entorno real.

## Veredicto

**Apto con reservas.** Las órdenes del flujo hacen lo que dicen: la compuerta muerde y no
bloquea ningún encargo real, los dos jurados se unen y se arbitran, y el visor guarda las
respuestas y `cruzar` las lee. Los errores de uso se dicen. Antes de seguir con el piloto y el
catálogo, conviene resolver H1 (juzgar contra un maniquí que ya no es el suyo), H2 (juicios
viejos que se reutilizan en la segunda ronda y al repintar) y enseñar H3 en el visor. Los
criterios 5 y 6 quedan a medio probar y el 8 está sin hacer.
