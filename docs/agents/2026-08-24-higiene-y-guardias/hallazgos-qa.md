# Hallazgos de QA — decididos

Veredicto de QA: **apto con reservas**, 21 de 23 criterios, uno rojo y uno
pendiente del usuario. Nueve hallazgos, todos menores, ninguno rompe el juego.

Los cuatro primeros son **el mismo guardia** visto por cuatro sitios, y juntos
piden un cambio de fondo. Lo demás son arreglos sueltos.

---

## 1 · El guardia mira una lista blanca, y por eso es ciego — INVERTIRLA

QA plantó ocho ficheros con la ruta dentro y **cazó uno**: se le escapan `.js`,
`.mjs`, `.cjs`, `.tsx`, `.patch`, `.envrc`, `.toml` y los ejecutables sin
extensión. Su propia regla —«un fichero que una máquina ejecuta o lee»— cubre de
sobra un `.js`, que es la clase más ejecutada que hay en un repo de Node.

El problema no son las siete extensiones que faltan: es **la forma de la lista**.
Una lista blanca falla **en silencio** ante cualquier clase que nadie previó, y
eso es lo que este repo tiene escrito que no se hace. Una lista negra falla al
revés: un formato de prosa nuevo daría un falso positivo, que se ve y se arregla.

**Decisión: invertir la lista.** Se excluyen las clases que son **para leer**
—`.md`, `.txt`, `.css`, `.html`— y los binarios; **todo lo demás se mira**. Y las
exclusiones van con su motivo escrito al lado, que es la diferencia entre una
regla y una excepción.

## 2 · El `.patch` que se cuela — NO COMMITEAR LOS PARCHES

`commits/06-rutas-absolutas.patch` contiene la ruta absoluta —es el parche que la
quita— y con la lista invertida pasaría a ser una presa. Excluir `.patch` sería
justo la excepción que mañana tapa a la siguiente.

**Decisión: los parches no se commitean.** Son andamio puro: existen para que el
coordinador reparta los nueve commits, y en cuanto los commits existen, el
historial de git los cuenta mejor. Es la misma razón por la que `.gitignore` ya
aparta `plan.md` e `implementacion.md`: *«a los tres meses son documentación falsa
que alguien se cree»*. Se añade `docs/agents/*/commits/` a `.gitignore` y se dice
en `docs/agents/README.md`.

## 3 · `RAIZ` viene percent-encoded, y por eso el comentario miente — ARREGLAR

`RAIZ = new URL('..', import.meta.url).pathname` no decodifica. En un checkout que
viva en `…/code (copia)/heroes`, **los nueve invariantes mueren con ENOENT** antes
de que ningún guardia llegue a correr. Y el comentario que justifica escapar la
expresión regular pone ese mismo ejemplo como el caso que resuelve: el escapado es
correcto y **no puede llegar a usarse nunca**.

Es ruidoso, no silencioso, así que el daño está acotado. Pero una promesa falsa en
un comentario es peor que no tenerlo.

**Decisión: `fileURLToPath`**, que decodifica. Arregla el fichero entero, no solo
el guardia nuevo, y convierte el comentario en verdad. Con un ejemplo genérico, no
con la ruta de nadie (ver 4).

## 4 · El único `/home/al` que queda en el índice lo metió este ciclo — REESCRIBIR

`test/invariantes.test.ts:256` cita `/home/al/code (copia)/heroes` en un
comentario. Es inerte, pero es un `.ts` versionado con la ruta de una máquina
dentro, en el fichero del guardia que existe para evitarlo.

**Decisión: ejemplo genérico** (`/ruta con (paréntesis)/repo` o similar). Cuesta
una línea y quita el único ejemplo vivo del límite.

## 5 · La ruta escapada de JSON se cuela — MIRAR LAS DOS FORMAS

JSON admite `\/` por `/`, y `JSON.parse` devuelve exactamente la misma ruta. El
guardia busca la literal y no la ve.

**Decisión: buscar también la forma escapada.** Dos líneas.

## 6 · `parseSeed` trata el vacío de dos maneras — UNIFICAR

`HEROES_SEED=` vacía **mata el servidor**; `?seed=` vacío en el navegador sortea.
Los dos llamantes de la misma función discrepan en el mismo caso.

**Decisión: vacío es «no se ha dado».** En los dos sitios: sin semilla, se sortea
(el navegador) o se usa la de por defecto (el servidor). Rechazar es para lo que
se pidió y no se puede dar, como `abc` — no para lo que no se pidió.

## 7 · `?seed=abc` deja una pantalla negra sin salida — DECIR CÓMO SALIR

Rechazar está bien y no se toca: si el juego sorteara otra semilla en silencio,
el informe de QA que esta función existe para permitir sería **falso**, que es
peor que una pantalla negra.

**Decisión: solo el texto.** El mensaje dice además cómo salir —quitar el
parámetro de la URL—. Cero riesgo y deja de ser un callejón.

## 8 · La huella del hook se cae con un nombre con espacio — ARREGLAR

`xargs` sin `-0` en `.claude/hooks/verde.sh`: un fichero con un espacio en el
nombre rompe el cálculo de la huella y **el guardia se duerme sin decirlo**.
Preexistente, pero este ciclo reescribió esa línea, así que se arregla aquí.

**Decisión: `-z` en `git ls-files` y `-0` en `xargs`.**

## 9 · El hook vigila menos de lo que el guardia puede poner rojo — ALINEAR

La huella excluye `assets` y `docs`, pero el guardia sí barre ficheros de máquina
que vivan ahí. Un `.json` bajo `docs/` con una ruta dentro pone `pnpm verify` rojo
**sin despertar al hook**, que es exactamente el fallo del hallazgo 8 por otra
puerta.

**Decisión: que la huella cubra todo lo que el guardia mira.** Si eso obliga a
incluir `docs`, se incluye: que el hook corra de más cuesta seis segundos.

## 10 · Abrir partida borra el resto de la URL — CONSERVARLO

`replaceState` escribe `?seed=N` y se lleva por delante cualquier otro parámetro.

**Decisión: `URLSearchParams` sobre la URL actual**, cambiando solo `seed`.

---

## El criterio 17 se corrige, y se dice por qué

QA marca el 17c en rojo **en su lectura literal**: tras commitear, los documentos
de este ciclo llevarán la ruta dentro explicando el bug.

Eso no es un fallo de la implementación: es que el criterio se redactó antes de
saber dónde estaba la frontera. La decisión —tomada al consolidar `/simplify` y
ahora confirmada— es que la frontera es **«un fichero que una máquina ejecuta o
lee»**, no «cualquier byte versionado». Un `.md` que cita la ruta para explicar
por qué se quitó no es una presa: lo lee una persona, y una persona sabe que esa
ruta es de otro.

**Se reescribe el criterio 17 en `requisitos.md`** con esa frontera, y el
docstring del guardia declara el límite —no ve la ruta de *otra* máquina— para
que nadie lo herede creyendo que ve más de lo que ve.

## Lo que no entra

- **Los ejecutables sin extensión** (un `hook` con shebang y sin punto): con la
  lista invertida ya entran, así que deja de ser un hallazgo aparte.
- **Nada de lo que QA marcó como fuera de alcance.** Si algo merece issue, lo abro
  yo al cerrar, no lo arregla este ciclo.
