# Crítica — los caminos atraviesan minas y ciudades (#188)

Petición: «el camino que pasa por una mina pasa por en medio de la mina o de
una ciudad igual; no deberían atravesarlas sino pasar por delante con un
pequeño desvío para entrar siempre por la puerta, como en el HoMM».

## La premisa, contra el código

**Es cierta, y nace en el núcleo, no en la escena.**

- `trazarCaminos` (`src/core/map/vestir.ts`) traza un árbol por región desde su
  centro. En `Busqueda.buscar` solo los **nodos** son final de tramo; el
  comentario lo dice: «Una mina o un pueblo sí se cruzan: hacerlos final de
  tramo obliga a rodearlos con un radio paralelo». Así que un radio hacia algo
  más lejano pasa por encima de la mina y sale por el otro lado.
- El último paso a cualquier objetivo es el más barato, venga de donde venga:
  nada mira de qué lado se entra.
- `GameMap.caminos` guarda esos tramos y la escena (`colocar.ts` → `sendas.ts`)
  los pinta tal cual, de centro a centro de casilla. La senda pasa bajo el
  sprite horneado y sale por el otro lado: eso es lo que ve el usuario.
- **La puerta** de un objeto horneado es la casilla del objeto (`MapObject.at`,
  el ancla del sprite es su pie) y la cámara mira desde el sur: «por delante»
  es llegar desde la fila de debajo (S, SE, SO).
- Las **ciudades** (bases y neutrales) son **nodos**: ya son hojas de cada
  región, pero un nodo junta 2-4 regiones y le llega un radio de cada una, así
  que la ciudad siempre «se cruza» — es el paso entre regiones y el héroe la
  atraviesa por regla. Lo que sí está mal es que una región que toca la fila de
  delante de la ciudad llegue por detrás o por el lado.
- Los planes del agente escriben casillas y `tramosDeCasillas` las une por
  adyacencia: un camino que el agente pase por una mina la cruza. No es lo que
  pide el usuario (habla del mapa que ve), y el agente lo escribe a propósito.

## Medida (semillas 1-40, `medir.ts`, 08-10-2026)

| | objetos | atravesados (≥ 2 tramos) | algún tramo por detrás | de lado | **mal** |
|---|---|---|---|---|---|
| mina | 1120 | 609 | 592 | 494 | **924** (no llega por un solo tramo de delante) |
| pueblo | 320 | 138 | 162 | 133 | **251** |
| ciudad | 277 | 262 (es un paso) | 224 | 40 | **28** llegadas por una fila peor que la mejor que toca su región |

El camino ocupa el 29,4 % de lo pisable. Ninguna semilla se libra: de 26 a 34
objetos mal por mapa.

## Veredicto

Se hace, **en el núcleo**. Arreglarlo solo en la escena (desviar la senda
pintada) separaría lo que se pinta de lo que abarata el paso: el héroe
seguiría «andando por el camino» a través de la mina, y la senda pintada
mentiría. Un hecho, un sitio: el trazado.

Dos matices al encargo:

1. **La ciudad no se puede «rodear»**: es el nodo, el único paso entre sus
   regiones. Lo que se le pide es que cada región llegue por la mejor fila que
   toca (delante > lado > detrás). Una región que solo la toca por detrás
   sigue llegando por detrás (una poterna, tapada por la propia ciudad).
2. **La historia avisa** (historia.md, «Caminos»): hacer final de tramo a minas
   y pueblos «subía el camino al 34 % y los ciclos dentro de una región de 1,2
   a 6,4». Eso era con casillas y adyacencia (antes de #153): con tramos ya no
   hay ciclos por adyacencia, pero el porcentaje de camino hay que medirlo, y el
   techo del test (mediana < 33 %) lo vigila.

Y un requisito que el encargo no dice: una mina en la última fila, o con
barrera debajo, **no tiene delante**. Hoy las hay (s1 mine-5 en (31,33)). La
colocación tiene que guardar la casilla de la puerta.

Cambia el banco: todas las semillas (cambian colocación de objetos y
caminos). Se re-ancla con la forma del diff explicada.
