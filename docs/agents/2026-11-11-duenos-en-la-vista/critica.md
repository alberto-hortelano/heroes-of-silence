**REENCUADRADA** — la mitad del espectador es real y pequeña; la mitad de `VistaMapa.dueños` es una limpieza sin efecto visible que mueve el riesgo en vez de quitarlo. Se hace la primera; la segunda, no.

# Crítica — duenos-en-la-vista (#303)

## El problema real, en una frase

Quien mira por el espectador no puede saber qué ciudades y pueblos están ocupados ahora mismo (lo ve
como marca en el mapa y como línea suelta en la crónica, que se va), mientras que quien juega sí lo
lee en su lateral.

La solución del issue mezcla eso con otra cosa: sacar el dueño derivado de `owner`. Eso no ataca el
problema; es una limpieza de diseño que dejó apuntada `/simplify` («la limpieza de fondo»,
`docs/agents/2026-11-05-ciudades-en-su-region/hallazgos-simplify.md:170-171`).

## La premisa, afirmación por afirmación

| Afirmación | Verificación |
|---|---|
| La rama `claude/nifty-kare-5bc168` está «sin fusionar» | **Falso**: `git merge-base --is-ancestor claude/nifty-kare-5bc168 HEAD` sale 0. Su trabajo está en `main` (`b5599489`) |
| El cliente copia el dueño derivado sobre `owner` (`conLosDueñosSabidos`) | **Cierto**: `render/mapa/sitios-sabidos.ts:48`, `objetos.push({ ...o, owner: sitio.dueño })`. Lo leen la sesión (`sesion/partida/a-la-vista.ts:178`, `:210`) y el espectador (`espectador/adaptar.ts:165-182`, `sitiosDelCable`) |
| Eso está mal: «debería ir aparte» | **No se sostiene contra el código**. La copia es deliberada y está escrita: «así el lienzo y el minimapa […] no tienen que conocer la regla del sitio» (`sitios-sabidos.ts:31-35`; también en `docs/areas/partida.md`, la línea larga de la ocupación). Todo lector del `owner` de una ciudad o un pueblo en el cliente lee la copia: `render/mapa/rotulos.ts:133`, `minimapa.ts:98`, `cosas.ts:273-281` (de `v.objetos`) y `partida/mapa/escena.ts:561` (de `objetosConocidos`). Los que leen el objeto crudo (`desarrollo/regiones.ts:193`, `render/escenario/colocar/sprite.ts:150`) solo miran nodos del muro, cuyo `owner` guardado es el bueno. **No hay hoy ningún lector que saque un dueño equivocado** |
| Los paneles del espectador no enseñan la ocupación | **Cierto**: `espectador/paneles.ts` no lee `v.sitios` en ninguna parte; «Jugadores» cuenta castillos por `t.owner` (`paneles.ts:89`) sin decir si alguno está ocupado. La crónica sí cuenta `site_occupied`/`site_freed` (`views/cronica.ts:383-413`), pero como hecho pasado, no como estado |
| «aunque el mapa sí pinta su marca» | **Cierto**: `render/mapa/mapa.ts:374`, `pintarOcupacion` sobre `v.ocupados`, que en el espectador sale del cable |
| Para los paneles hay que tocar `adaptar.ts` («la inversa exacta») | **Falso**: los paneles leen la `SpectatorView` directamente (`paneles.ts:42-47`), no lo adaptado, y el cable ya trae el ocupante de cada sitio (`shared/cable-del-espectador.ts:122-127`, `:221-222`; lo llena `server/vista-espectador.ts:102`). No viaja nada nuevo y `adaptar.ts` no se toca |

## El día después

- **Paneles**: quien mira ve qué sitios están ocupados y por quién, lo mismo que quien juega lee en su
  lateral (`partida/paneles.ts:57-63`, «Ocupados, no te dan nada: …»). Cambio visible, pequeño.
- **`VistaMapa.dueños` sin la copia**: para quien juega, **nada**. Y cierra una puerta: hoy cualquier
  lector de `v.objetos` recibe el dueño bueno sin saber la regla; sin la copia, cada lector de una
  ciudad o un pueblo tiene que acordarse de ir a `dueños`, y el que lea `o.owner` recibe el guardado
  (`null` dentro de una región) **en silencio**. Es justo el fallo que el núcleo vigila con un guardia
  de compilador (`test/invariantes-partida.test.ts:443`) y que en el cliente hoy no puede pasar. Además
  arrastra la marcha (`a-la-vista.ts:205-228`: el recuerdo al salir guarda los objetos ya con su
  dueño; tendría que guardar también los dueños) y la caché del minimapa (`minimapa.ts:68`, que
  compara `objetos` por identidad). Mucho que tocar para quedar igual o peor.
- Nada que borrar después en la parte de los paneles.
- No contradice `CLAUDE.md`: «Un hecho, un sitio» lo cumple ya `conLosDueñosSabidos` (una función,
  dos lectores).

## Conflictos

- **#298** (el infiltrado visible): la rama `claude/vigilant-wozniak-17edfb` **está en `main`**; el
  issue sigue abierto. También quiere una fila en el panel del espectador. Solapamiento suave en
  `espectador/paneles.ts`, sin contradicción: que la sección de la ocupación no se escriba de forma que
  la fila del infiltrado no quepa al lado. Ninguna de las dos bloquea a la otra. Con el reencuadre,
  #303 ya no toca `adaptar.ts` ni `serializeKnownMap`.
- **#324** (el narrador en el espectador): la rama `claude/templarios-faction-game-fa463e` no toca
  `src/client/espectador/`, `shared/cable-del-espectador.ts` ni `render/mapa/` (`git diff --stat
  HEAD...` sobre esas rutas, vacío). Sin conflicto.
- **#336** (la ruta sin motivo): la parte de `dueños` tocaría `partida/mapa/escena.ts:561`
  (`describirCasilla`) y el tipo de `sesion/partida/marcha.ts:54`, ficheros donde #336 puede
  trabajar. Con el reencuadre, desaparece.
- **#334+#338, #341, #335, #340**: servidor y contrato de batalla, lateral de la batalla, generador y
  motivos del núcleo. Ningún fichero en común con los paneles del espectador.

## Coste contra valor

- Paneles: poco código (leer `v.sitios`, nombrar cada sitio como ya lo nombra la crónica del
  espectador, `paneles.ts:222-226`), un test puro (los paneles no tocan el DOM) y una mirada en el
  navegador. Vale lo que cuesta: es paridad con quien juega.
- `dueños` aparte: coste medio y valor nulo para quien juega; si no se hace nunca, no pasa nada que
  se pueda señalar. **No debería hacerse** mientras no aparezca un lector del cliente que necesite el
  `owner` guardado de una ciudad o un pueblo y no el sabido.

## Qué le cambiaría a `requisitos.md`

Sustituir «Criterios de aceptación» por:

> ## Criterios de aceptación (reencuadrados por la crítica)
>
> 1. **El panel del espectador dice qué ciudades y pueblos están ocupados ahora**, leyendo
>    `SpectatorView.sitios` (el `ocupante` ya viaja: no se añade nada al cable ni se toca
>    `adaptar.ts`). Cada uno con su nombre (como lo nombra la crónica del espectador) y quién lo
>    ocupa: un héroe de tal jugador, una guarnición de tal jugador o una guarnición neutral. Sin
>    ninguno ocupado, la sección no sale.
> 2. Lo que dice el panel coincide con la marca que pinta el mapa del espectador: los dos salen de
>    los mismos `sitios` del cable. Un test puro de `panelDelEspectador` con una vista con un sitio
>    ocupado y otra sin ninguno, visto morder.
> 3. Comprobado en el navegador con Playwright sin pantalla. Si una partida del agente no llega a
>    ocupar nada, vale una vista del espectador montada con un sitio ocupado; se dice cuál.
>
> ## Fuera de alcance (añadir)
>
> - **`VistaMapa.dueños` aparte de `owner`**: no se hace. La copia de `conLosDueñosSabidos` es la
>   que evita que cada lector tenga que saber la regla del sitio; sin ella, leer `o.owner` de una
>   ciudad de región daría `null` sin avisar.
> - La fila del infiltrado (#298).

Texto para el issue #303 al cerrarlo:

> La ocupación sale en el panel del espectador (leyendo `SpectatorView.sitios`, sin cambiar el
> cable). La otra mitad, `VistaMapa.dueños` aparte de `owner`, se descarta a conciencia: hoy
> todos los lectores del cliente reciben el dueño sabido sin conocer la regla del sitio
> (`render/mapa/sitios-sabidos.ts`). Separarlo obligaría a cada lector a ir a buscarlo, y uno
> que se olvidara leería el `null` guardado sin avisar. No cambia nada para quien juega. La rama
> citada (`claude/nifty-kare-5bc168`) ya está en `main`.
