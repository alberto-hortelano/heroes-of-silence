# Requisitos — duenos-en-la-vista

Tarea: `2026-11-11-duenos-en-la-vista`. Issues: 303. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (igual a `main`, `150fd189`, tras fusionar #333).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

> «Cuando mergees la PR empieza con los nuevos issues tambien en paralelo»

El coordinador eligió esta tarea (tanda 3). Lo que pide cada issue, tal cual:

### #303 — Vista: el dueño derivado aparte de owner, y la ocupación en los paneles del espectador

> El cliente copia el dueño derivado sobre `owner` (`conLosDueñosSabidos`), cuando debería ir aparte: `VistaMapa.dueños`, por id. Los paneles del espectador no enseñan la ocupación, aunque el mapa sí pinta su marca.
> Qué hacer: `VistaMapa.dueños` por id, sin la copia, y la ocupación en los paneles del espectador (`adaptar.ts`, la inversa exacta).
> 
> De la tarea «Ciudades y pueblos fuera de los nodos, y la ocupación» (`docs/agents/2026-11-05-ciudades-en-su-region/`, rama `claude/nifty-kare-5bc168`, sin fusionar).

## Criterios de aceptación

Los del issue, tal cual, salvo lo que la crítica reencuadre. Cada regla nueva, con su test visto morder; lo que se ve, comprobado en el navegador con Playwright sin pantalla.

## Fuera de alcance

Medidas de jugabilidad (CLAUDE.md, «No se prueba la jugabilidad»). `pnpm capturas` lo pasa el coordinador al final de la tanda.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`): la copia del dueño en `owner` se queda (es a propósito y ningún lector sale mal); lo que falta es la ocupación en los paneles del espectador, que el cable ya trae. El coordinador acepta su alcance, que sustituye a los criterios de arriba. Sin arquitecto (decisión del coordinador): una fila de panel y su test.


Sustituir «Criterios de aceptación» por:

## Criterios de aceptación (reencuadrados por la crítica)

1. **El panel del espectador dice qué ciudades y pueblos están ocupados ahora**, leyendo
   `SpectatorView.sitios` (el `ocupante` ya viaja: no se añade nada al cable ni se toca
   `adaptar.ts`). Cada uno con su nombre (como lo nombra la crónica del espectador) y quién lo
   ocupa: un héroe de tal jugador, una guarnición de tal jugador o una guarnición neutral. Sin
   ninguno ocupado, la sección no sale.
2. Lo que dice el panel coincide con la marca que pinta el mapa del espectador: los dos salen de
   los mismos `sitios` del cable. Un test puro de `panelDelEspectador` con una vista con un sitio
   ocupado y otra sin ninguno, visto morder.
3. Comprobado en el navegador con Playwright sin pantalla. Si una partida del agente no llega a
   ocupar nada, vale una vista del espectador montada con un sitio ocupado; se dice cuál.

## Fuera de alcance (añadir)

- **`VistaMapa.dueños` aparte de `owner`**: no se hace. La copia de `conLosDueñosSabidos` es la
  que evita que cada lector tenga que saber la regla del sitio; sin ella, leer `o.owner` de una
  ciudad de región daría `null` sin avisar.
- La fila del infiltrado (#298).

Texto para el issue #303 al cerrarlo:

La ocupación sale en el panel del espectador (leyendo `SpectatorView.sitios`, sin cambiar el
cable). La otra mitad, `VistaMapa.dueños` aparte de `owner`, se descarta a conciencia: hoy
todos los lectores del cliente reciben el dueño sabido sin conocer la regla del sitio
(`render/mapa/sitios-sabidos.ts`). Separarlo obligaría a cada lector a ir a buscarlo, y uno
que se olvidara leería el `null` guardado sin avisar. No cambia nada para quien juega. La rama
citada (`claude/nifty-kare-5bc168`) ya está en `main`.
