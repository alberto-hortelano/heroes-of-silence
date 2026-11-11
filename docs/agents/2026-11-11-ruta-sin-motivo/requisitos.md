# Requisitos — ruta-sin-motivo

Tarea: `2026-11-11-ruta-sin-motivo`. Issues: 336. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (igual a `main`, `150fd189`, tras fusionar #333).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

> «Cuando mergees la PR empieza con los nuevos issues tambien en paralelo»

El coordinador eligió esta tarea (tanda 3). Lo que pide cada issue, tal cual:

### #336 — Vista previa de la ruta: devuelve `[]` sin decir por qué no hay camino

> `src/client/sesion/partida/marcha.ts` (hacia las líneas 118-119) devuelve una ruta vacía sin motivo cuando no hay camino, y quien juega (y el QA de #321) no sabe si es la niebla, una base rival, un sitio con guarnición o una barrera. Qué hacer: que la vista previa diga por qué, con el motivo del núcleo. Visto por el crítico de `docs/agents/2026-11-11-lugar-inalcanzable/`.
> 
> Sale del cierre de issues del 11-11-2026 (PR alberto-hortelano/heroes-of-silence#333).

## Criterios de aceptación

Los del issue, tal cual, salvo lo que la crítica reencuadre. Cada regla nueva, con su test visto morder; lo que se ve, comprobado en el navegador con Playwright sin pantalla.

## Fuera de alcance

Medidas de jugabilidad (CLAUDE.md, «No se prueba la jugabilidad»). `pnpm capturas` lo pasa el coordinador al final de la tanda.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`): al pulsar ya se dice el motivo; lo que falta es decirlo al señalar, y antes que nada que `porQueNoLlega` pase por la niebla (hoy nombra héroes rivales y recintos que no se ven, también en el rechazo que lee el agente). El coordinador acepta su alcance, que sustituye a los criterios de arriba:


**Encuadre del crítico** (sustituye a «Los del issue, tal cual»):
1. Al señalar una casilla a la que el héroe elegido no tiene camino, y con el dedo al primer
   toque, la barra dice por qué. Es la misma frase que da el núcleo al pulsar (un hecho, un
   sitio). No la lleva el `[]` de sin héroe, fuera de turno ni de su propia casilla.
2. **El motivo pasa por la niebla**, al señalar, al pulsar y en el rechazo del `move_hero` del
   agente. No nombra un héroe ni un grupo de asaltantes que quien lo lee no ve ahora
   (`heroesALaVista`, `asaltantesALaVista`), ni una ciudad o sus puertas en una casilla sin
   explorar. Lo hostil que no se ve no se calla como «sin camino» a secas si eso miente: la frase
   dice que algo cierra el paso sin decir qué ni dónde. Test visto morder con un rival en la
   niebla, en el caso de `planDeNodos` del crítico.
3. Lo que se dice al señalar una casilla de barrera se ve en el navegador (Playwright sin
   pantalla), con la barra estrecha incluida (`ponerEnLaBarra`). El motivo no se calcula en las
   llamadas a la ruta que no lo enseñan (`rutaQueQueda`, `pulsar`).
4. `pnpm qa` si cambia el texto que lee el agente. `pnpm banco` igual: no cambia ninguna partida.
5. La niebla no es un motivo: `caminoHasta` no la mira. El issue la nombra por error.

## Tras el plan (11-11-2026)

El coordinador aprueba `plan.md` (opción A, la niebla en `porQueNoLlega`). Pregunta abierta: con la recomendación del arquitecto, una guarnición enemiga explorada pero que no se mira ahora **no** se nombra («algo que no ves»). La frase de la barrera sobre una casilla bajo el negro, que deja ver relieve sin explorar, va a un issue aparte.
