# La ciudad, amurallada y a la escala del pueblo (20-10-2026)

## Petición literal

> Otra cosa: El pueblo me gusta porque queda muy integrado, la ciudad no.
> Vamos a cambiarla por una zona amurallada con la muralla modular y con casas dentro, misma escala que el pueblo

## Qué hay hoy

- **La ciudad** (`kind: 'town'`, un nodo del mapa) se pinta como una pieza de la hoja `assets/mapa/modulos/ciudades` (8 variantes, elegida por el id con `varianteDeId`), a 2,4 casillas de ancho (`colocar.ts`, cerca de `modulosDe('ciudades')`). Cada variante es una ciudad entera en miniatura: murallas, torres, catedral y decenas de casas diminutas. Al lado de todo lo demás del mapa se lee como una maqueta a otra escala, y no se integra.
- **El pueblo** (`kind: 'village'`) usa la hoja `modulos/pueblos`, a 1,9 casillas. Sus casas tienen la escala del mapa, y eso es lo que gusta.
- **La muralla modular**: la hoja `modulos/muro` (tramo ancho, tramo de norte a sur, dos tramos en diagonal, torre redonda, torre cuadrada, tramo en ruina, contrafuerte) y las piezas `muro-ancho-*`, `muro-hondo-*`, `muro-ns-*`, `nodo-torre` y `nodo-puerta-ancho`/`nodo-puerta-hondo`, que ya pinta `muralla.ts` en las franjas de barrera `wall`, con sus torres en las juntas y sus reglas (`torresDe`, `seApilan`, `trazaDeMuralla`…).
- **Las casas sueltas**: la tarea `docs/agents/2026-10-20-labranza-en-campos/` (en curso) recorta casas sueltas de la hoja de pueblos a una hoja propia, `modulos/casas`. Esta tarea las reutiliza.

Imagen: `ciudad-pueblo.jpg` en esta carpeta (semilla 15: a la izquierda la ciudad de (12, 16), a la derecha el pueblo de (19, 12)).

## Criterios de aceptación

1. La ciudad deja de pintarse con la hoja `ciudades`. Se compone en la escena como un recinto amurallado: un anillo de muralla hecho con las piezas modulares (tramos, torres en las esquinas y juntas, una puerta) y casas dentro.
2. **Misma escala que el pueblo** («la escala del pueblo» es la de sus casas en la hoja `pueblos` a 1,9: 0,55-0,85 de ancho y 0,57-0,90 de alto; no el `ALTO_DE_CASA` de la labranza): los tramos, las torres y la puerta, a la escala con que se pintan en las murallas del mapa; las casas, al tamaño de las del pueblo. Una casa de la ciudad y una del pueblo, puestas una al lado de la otra, miden lo mismo.
3. **Aberturas por cada camino** (sustituye al de la puerta al sur; ver `critica.md`): la senda que llega a la ciudad entra en el recinto por una abertura, venga de donde venga (en 1-40, el 75 % de los tramos llega en diagonal, 170 de 217 ciudades no tienen ningún camino por el sur y la casilla de debajo es barrera en el 77 %). Cada abertura va flanqueada por torres y sin pieza de puerta (decisión del usuario, 20-10-2026: no se usa `nodo-puerta-ancho`, que es la del nodo de muro que se asalta). Ninguna senda pasa bajo un tramo o una torre del recinto.
4. **Dentro**, casas de la hoja `casas` en número que llene el recinto sin parecer una mancha: sin repetir la misma casa al lado y con algo de suelo o de calle entre ellas. Si cabe, alguna pieza que diga «ciudad» y no «pueblo» (una torre del homenaje, la iglesia de la hoja de pueblos) es bienvenida, pero no es obligatoria.
5. **Cada ciudad, distinta y estable**: la composición (casas, su orden, cuál va dónde) sale del id de la ciudad o de la semilla de la escena, siempre la misma para la misma ciudad, como hoy `varianteDeId`.
6. **Se distingue de un pueblo y de una muralla de barrera**: se lee como una ciudad (recinto cerrado con puerta) y no como un pueblo grande, ni como un tramo de la barrera `wall` del mapa.
7. Lo que cuelga de la ciudad sigue funcionando: la bandera y la marca del dueño (`asientoDeObjeto`), el clic sobre ella, la reserva del objeto (`reservaDe`) y las bajadas o paredes que se ordenan respecto a ella (`ordenadoEn`, `llegaA`).
8a. **Ciudad-puente** (#144, 43 de 217 en 1-40): el recinto va en su orilla (`sitioDe`) y se entra desde el puente.
8b. **Lo de debajo**: lo que se ve entre las casas es suelo de la ciudad: ni agua, ni la cara de un acantilado, ni masa de las barreras que el recinto pisa.
8. Los guardias del escenógrafo que hoy están a 0 en 1-40 siguen a 0 (`basesSobreReserva`, `spritesSobreSenda`, `murallasPartidas`, `torresApiladas`, `pisablesTapadas`…). El plan dice si los muros del recinto cuentan o no en `torresApiladas`, `murallasPartidas` y `murallaIncoherente`, y por qué.
9. Imagen antes/después de dos o tres ciudades en semillas distintas, una de ellas en un relieve difícil (junto a un acantilado o un río), para el usuario.

## Fuera de alcance

- El núcleo: qué casillas ocupa una ciudad, sus puertas, su captura y sus reglas no cambian. Es solo cómo se pinta.
- La base (escenario lateral, `render/base/`) y la ciudad del espectador fuera del mapa.
- El pueblo, que se queda como está.
- Tocar el trazado de los caminos o las puertas del núcleo para que los caminos entren por un lado concreto.
- Arte nuevo: con las piezas de muralla y las casas recortadas que ya existen. Si falta algo imprescindible (p. ej. una puerta de recinto que encaje), se dice y se pide al usuario antes de encargarlo.

## Contexto

- Va después de `2026-10-20-labranza-en-campos`: depende de la hoja `casas` que deriva esa tarea y toca el mismo código (`colocar.ts`).
- Presupuesto de pruebas: 10 semillas, `verify:lento` y `pnpm capturas` una vez, al cerrar.
- El usuario no abre nada en los worktrees: se le mandan las imágenes.

## Al cerrar

Se borran la hoja `ciudades` (webp, json, procedencia, módulos), su entrada en `tools/taller/escenario/modulos.ts` y sus referencias en los tests.

## Decisiones del usuario (20-10-2026)

- **Crítica: REENCUADRADA** (`critica.md`). A 2,4 casillas y a la escala del mapa no caben varias casas: lado 2 (2,8 casillas) deja ver 1-3 y apila las torres de las esquinas (`seApilan`); lado 4 (4,8, 5×5) admite 6-8 pero tapa los caminos y dobla la huella.
- **Tamaño**: el usuario elige viendo **maquetas** de tres opciones (lado 2, lado 4 y muralla a menor escala en ~2,8 casillas con casas a la escala del pueblo) en dos o tres ciudades reales, antes del plan. Las maquetas van en esta carpeta.
- **Tamaño elegido** (el usuario, al ver `maqueta-intermedia.jpg`: «Sí, esa, muy llena de casas, con casas pegadas a las murallas»): recinto de **lado 3** entre torres (unas 3,5 casillas de ancho), la muralla y sus torres al **0,8** de la escala con que se pintan en el mapa, y las casas a la escala del pueblo.
- **Muy lleno de casas**: el recinto va apretado de casas, más que la maqueta (que puso 5 con huecos vacíos); las casas se arriman a la muralla por dentro, pegadas a ella, y solo quedan libres las calles de las aberturas. Sustituye al «sin parecer una mancha» del criterio 4: lo que se pide es una ciudad apiñada; sigue sin repetirse la misma casa al lado.
- **Entrada**: aberturas por cada camino, flanqueadas por torres, sin pieza de puerta.

- **Plan aprobado** (el usuario, 20-10-2026: «Sí, sigue con el plan»), con sus dos valores por defecto: el clic sigue yendo por casilla, y la pieza «de ciudad» en la plaza no entra en este ciclo (va a una issue).

## Cambio tras ver la primera implementación (20-10-2026)

> Las aberturas anchas no funcionan, cierralo con puertas arcos o lo que sea, si ya hay algo usalo y si no crea arte nueva, tiene que tener las 8 direcciones

Con la primera versión, una senda que llega en diagonal abría de 1 a 1,6 casillas de un lado (en s15 (12,16) el muro este quedaba en una sola torre). Sustituye a la decisión «aberturas flanqueadas por torres, sin pieza de puerta»:

- **Cada entrada es una puerta** que cierra el hueco: ninguna abertura más ancha que su puerta.
- **8 direcciones**: la entrada de cada senda se ajusta a una de las 8 (N, NE, E, SE, S, SO, O, NO). Propuesta del coordinador (por confirmar en el plan): el recinto con las esquinas achaflanadas, ocho caras, con los tramos diagonales que ya tiene la hoja `muro` (`diagonal-baja`, `diagonal-sube`), para que una puerta diagonal se apoye en su cara.
- **Arte**: N y S con `nodo-puerta-ancho`, E y O con `nodo-puerta-hondo` (existen y casan con la muralla modular; imagen `puertas-existentes.jpg`). Las 4 diagonales no existen: **arte nuevo** con el taller y Codex por la suscripción (sin fal.ai), en el estilo de esas dos y de la hoja `muro`, con su guía de geometría a 45°, derivado y registrado como las demás hojas de módulos. Si en el plan sale mejor un juego de 8 nuevas y coherentes que mezclar 2 existentes y 4 nuevas, se dice y se decide con el usuario.
- Las puertas, al 0,8 como la muralla del recinto, y la senda pasa por su arco.

**Decisiones del usuario sobre el plan de las puertas** (20-10-2026, al ver el plan reescrito):
- **Arte: 6 piezas nuevas** de una sola familia (4 puertas, una por eje —`n-s`, `e-o`, `ne-so`, `no-se`—, y 2 tramos diagonales lisos a 45°), en una hoja `modulos/recinto` pedida a Codex por la suscripción. No se reutilizan `nodo-puerta-ancho` ni `-hondo`.
- **Puerta: arco de medio punto con el rastrillo alzado**, sin poste de bandera.
- **Octógono**: 8 caras iguales con su torre en cada vértice; vale la pérdida de un 17 % de plaza (menos casas).
- Por defecto, sin preguntar: dos sendas que piden la misma cara comparten puerta y se abren en Y fuera de ella.

## Tras el QA de la vuelta 2 (21-10-2026; `qa.md`, NO APTO)

Se arreglan sin preguntar: H1 (`test/acantilados.test.ts` exime la huella del recinto), H2 (el tablero de la ciudad-puente con el río al sur tapa la muralla y la puerta sur: 15 de 217 en 1-40), H5 (un nodo del mapa dentro del recinto: s98, s105), H8 (la marca del dueño sobre las fachadas) y H9 (la plaza asoma por el sur).

Decisiones del usuario (21-10-2026):
- **Solo 6 caras con puerta**: N, S y las cuatro diagonales. Las caras E y O no llevan puerta (de lado, la senda llegaba a un muro); la senda que llega del este o del oeste entra por la puerta NE/SE o NO/SO. Sin arte nuevo.
- **Las reglas del núcleo, en esta tarea** (no a issues): el héroe no atraviesa la muralla —las casillas del recinto se pisan solo por sus puertas—, el héroe de salida no nace dentro de su recinto, y dos ciudades no quedan tan cerca que sus recintos se toquen o se fundan (en s2, cuatro en un solo castillo; s45, s50, s62, s105 rotas). Esto mueve el banco y la rectitud: se re-anclan juzgando la forma del diff, como dice `CLAUDE.md`.

Decisiones del usuario sobre el plan de la vuelta 3 (21-10-2026):
- **Puerta solo donde llega un camino** (no en toda cara con acceso; contra la recomendación del plan): una cara del recinto lleva puerta si un camino del mapa entra por ella. La regla depende de los caminos —del generador y del agente—, y el núcleo la deriva de ellos.
- **La ciudad-puente con el puente al este o al oeste**: esa cara lleva `puerta-e-o` solo ahí, como la puerta del puente.
- **Tres fases, un commit por fase**, con parada tras la fase 1 si se tiran demasiados mapas.

Decisiones del usuario tras la parada de la fase 1 (21-10-2026):
- **Lado mínimo del generador, 26** (`LADO_MINIMO_DEL_GENERADOR`, hoy 24): con la separación de 5, el 24×24 se quedaba sin mapa en 15 de 200 semillas; en 26, 200 de 200. Por regiones y el plan del agente, lo que se derive de ese mínimo (y su prosa).
- **La ciudad-puente se mueve a tierra en la fase 2**, junto con el paso por las puertas. En la fase 1 sigue en el río con su recinto tierra adentro; H2 se arregla en la escena acortando el puente de la ciudad hasta el pie de su cara, con el guardia `puenteSobreElAnillo`.

## Preguntas abiertas (con la suposición por defecto)

- ¿El recinto tapa casillas vecinas que se pisan? Lo que pinta la ciudad hoy ya desborda su casilla; no se añade más desborde del que hay sin decirlo.
