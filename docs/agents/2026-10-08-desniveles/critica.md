# Crítica — los desniveles no representan nada

## La petición
«Lo que más me preocupa es la falta de coherencia con los desniveles: se pone la imagen de desnivel
pero no representa nada, no encaja con el mapa que hay a continuación, no parece más elevado, una
elevación no puede acabar de repente, sin continuidad». Marcas de la semilla 1 (PNG y `.taller.png`
en `docs/revision/marcas/`, iguales en juego y taller):

| Marca | Qué hay (medido con `analizar` + `relieve`, s1) |
|---|---|
| `s1-23-12` «camino a través del desnivel» | Franja de acantilado (21,14)–(25,18) entre nieve al 2 y pradera al 1, pintada como **cresta al 3**: torres de roca que salen del río (al 0) con 1,8 casillas de cara y quedan **por encima** de la meseta de al lado. No es el borde de nada: es un tercer nivel inventado. |
| `s1-3-13` «desnivel roto con agua que llega al camino» | Charca de obstáculo de 4 casillas (3,12)–(3,14) en una pradera al 1, **encajada al 0**: un agujero con caras en medio del llano, pegado al camino. |
| `s1-6-13` «camino bloqueado» | `node-3` (9,14), nodo de acantilado **sin camino** entre la pradera (1) y la nieve (2), rodeado de cresta al 3. Sin camino no hay bajada (`bajadasDe` solo mira tramos del núcleo): el paso entre niveles no se ve. Al lado, dos «mesas» de una casilla al 2, (6,11) y (8,14). |

## La hipótesis: confirmada, y es peor
1. **El nivel no lo sabe nadie que decida.** El generador sortea la barrera de cada pareja por los
   suelos (`engordarFronteras`, `vestir.ts:296-308`, `data/barreras.json`). Después, y sin ver esa
   decisión, el escenógrafo inventa un nivel por región con el suelo y una tirada
   (`nivelDeRegion`, `relieve.ts:21-27`; la regla de «rodeada de montaña» lee las barreras al revés).
   Barrera y desnivel son **dos sorteos independientes**, y la escena remienda el choque.
2. **Los remiendos crean la incoherencia que el usuario ve** (`relieve.ts:102-177`): acantilado entre
   dos niveles → cresta a `hi + 1`; entre dos iguales → cañón a `lo − 1`; mancha → mesa a `base + 1`;
   escalera de caídas → **sube casillas pisables** al nivel de arriba; tope de 3 junto al agua; y lo
   que quede a ras, +1. Cada regla arregla un guardia (`acantiladosARas`, `laderasEnfrentadas`) y
   ninguna mira si el resultado es una meseta.

## Medidas (1-40, 400 regiones; script en el scratchpad, `medir.ts`)
| Qué | Cuánto |
|---|---|
| Franjas de acantilado de frontera **entre dos regiones al mismo nivel** (cañón) | **98 franjas, 1 358 casillas** (de 258 de frontera) |
| Franjas entre dos niveles, pintadas como cresta por encima de los dos | 105 franjas, 1 703 casillas |
| Mesas de acantilado sueltas dentro de una región (obstáculo, 1-6 casillas) | **250 franjas, 695 casillas** |
| Nodos de acantilado entre dos regiones al mismo nivel | 64 de 119 |
| Cambios de nivel entre regiones (por nodo) que **no** cruzan un acantilado | **202 de 257** (bosque 83, agua 54, montaña 46, muro 19) |
| Nodos entre dos niveles **sin camino**, luego sin bajada | **147 de 257** |
| Casillas pisables vecinas a distinto nivel sin barrera en medio | 40 (+205 junto a un nodo) |
| Casillas pisables fuera del nivel de su región (la escalera) / regiones con varios | 50 / 42 |
| Charcas de obstáculo encajadas un nivel bajo su llano | 171 franjas, 522 casillas |
| Acantilado tocando agua | 87 casillas |

Es decir: **el dibujo de acantilado no dice «aquí cambia la altura»** (la mitad de las veces no
cambia), y **la altura cambia casi siempre donde no hay acantilado** (79 %), por un bosque o un muro
que el relieve atraviesa con una cara a su pie o por dentro.

## Qué haría un HoMM
En HoMM3 el motor no tiene alturas, pero el arte de «acantilado» del editor es siempre **el borde de
una meseta** que cierra sobre sí misma, el borde del mapa u otra barrera, y a lo alto se sube por un
paso dibujado. En HoMM4/5 la altura es del terreno: la meseta es una zona entera, con rampas como
únicos accesos. En ninguno hay acantilados entre dos llanos al mismo nivel, crestas que suben sobre
las dos orillas, ni montículos de roca de tres casillas con cara.
La regla de los dos: **el desnivel es de la zona y la barrera lo viste**, no al revés.

## Reencuadre
No es un problema de piezas ni de colocación (R4/R5 están bien): es **de dato**. Mientras el nivel se
invente en el cliente después de sortear las barreras, cada guardia nuevo será otro remiendo.
1. **El nivel de cada región es un dato del mapa** (`MapRegion.nivel`, #143), elegido por el
   generador **antes** que las barreras, y la barrera de cada pareja se sortea entre las compatibles:
   el acantilado solo entre niveles distintos; dos niveles distintos solo por acantilado, montaña o
   agua. Coherente por construcción, no por guardia.
2. **La escena deja de inventar alturas**: lo pisable va al nivel de su región, sin excepción; la
   barrera toma el del lado alto (es el borde de la meseta) y el agua de frontera va encajada.
3. **Cada nodo entre dos niveles es una rampa**, con camino o sin él.
4. Fuera: mesas de acantilado sueltas y charcas encajadas en el llano.

## Conflictos
- **Otro agente cambia ahora la elección del muro** (solo fronteras cortas, nunca entre ciudades) en
  el mismo sitio (`engordarFronteras`, paso 2). Mi paso 1 añade otro filtro a las mismas candidatas:
  debe ir **después** de que entre el suyo y escribirse en la misma función. El muro, en este diseño,
  solo separa regiones al mismo nivel: no se contradicen.
- Cambia el banco entero (todas las semillas, desde el mapa). La escena no está en el banco.
- `acantiladosARas` (#174) y su test se retiran: medían el remiendo, no el desnivel.

## Veredicto
Hacerla, reencuadrada como arriba y en dos entregas (núcleo, luego escena). Tres decisiones son del
usuario (ver `plan.md`, «Preguntas abiertas»).
