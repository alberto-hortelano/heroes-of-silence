# Requisitos — motivos-que-nombran

Tarea: `2026-11-11-motivos-que-nombran`. Issues: 340. Rama de coordinación `claude/parallel-issue-closure-f85bd0` (igual a `main`, `150fd189`, tras fusionar #333).

## Petición literal

> «Ve cerrando issues. Intenta hacer los que se puedan en paralelo, tu dedicate a coordinar el trabajo y usa agentes para hacer los issues»

> «Cuando mergees la PR empieza con los nuevos issues tambien en paralelo»

El coordinador eligió esta tarea (tanda 3). Lo que pide cada issue, tal cual:

### #340 — Motivos del plan y de reclutar que no nombran lo que falla

> Dos motivos que despistan, vistos por los QA de #305 y #313 (11-11-2026; ya pasaban antes):
> - Plan de mapa, semilla 12: un pueblo de región en (9,7) se rechaza con un motivo sobre la base («town-0 … está dentro de la región») en vez de sobre el pueblo; y los motivos de `problemasDeLosPueblos` nombran el pueblo por su id («village-8») y no por el nombre que le dio el agente.
> - `recruitBlocker`: reclutar una criatura que no existe responde «solo hay 0 disponibles» en vez de decir que no existe.
> De paso: `equip.slot` tiene `max(32)` en el zod y `unequip.slot` no tiene tope.
> 
> Sale del cierre de issues del 11-11-2026 (PR alberto-hortelano/heroes-of-silence#333).

## Criterios de aceptación

Los del issue, tal cual, salvo lo que la crítica reencuadre. Cada regla nueva, con su test visto morder; lo que se ve, comprobado en el navegador con Playwright sin pantalla.

## Fuera de alcance

Medidas de jugabilidad (CLAUDE.md, «No se prueba la jugabilidad»). `pnpm capturas` lo pasa el coordinador al final de la tanda.

## Tras la crítica (11-11-2026)

El crítico la dio por **reencuadrada** (`critica.md`). El coordinador acepta su alcance, que sustituye a los criterios de arriba. #318 queda fuera (choca con #334+#338 en la frontera del contrato).


Sustituir «Criterios de aceptación» por:

## Criterios de aceptación (tras la crítica)

1. **El plan nombra la causa, no el síntoma.** Un pueblo, un monstruo o un cofre en el anillo de los accesos de una ciudad recibe el motivo de los accesos (`problemasDeRecintos`, `recinto.ts:664`). No vale uno sobre la ciudad ni sobre la red que ese objeto estropea. Casos de prueba, semilla 12 del procedimental con un pueblo «Portillo»: en (9,7) hoy sale «la ciudad "town-0" es la base… dentro de la región "region-4"»; en (9,8), «el pueblo "village-8" parte su región». Los dos tienen que nombrar a «Portillo» en su casilla y a Valdeluz. En (9,9) y (13,8) el motivo ya es el bueno y no cambia. Que salgan además los motivos de la red es aceptable solo si el de los accesos va primero.
2. **El pueblo se nombra como lo escribió el agente.** Los rechazos de `problemasDeRed` que nombran un pueblo (`quienEsElNodo`, `regiones.ts:501-511`: «parte su región», «no toca ninguna región», «solo toca la región», nodos pegados) dicen su `name` y su casilla, no `village-N`. Las ciudades siguen por su id, que es el que escribe el agente. Se actualiza `test/regiones.test.ts:154`.
3. **Reclutar lo que no hay dice por qué.** `recruitBlocker` distingue tres casos: la criatura no existe en el catálogo («no existe»); existe pero ese pueblo no la ofrece (no tiene su morada); y la ofrece pero no hay bastantes («solo hay N»). El texto del tercero no cambia para la persona.
4. **`unequip.slot` lleva `max(32)`**, como `equip.slot` (forma, `docs/areas/agente.md:43`).
5. **No cambia qué se acepta:** `pnpm banco` con el mismo hash, y `pnpm mundo validar ejemplo|prueba` siguen valiendo. Cada motivo nuevo, con su test visto morder. `pnpm qa` si se toca el contrato. No hay nada que mirar en el navegador.

**Fuera:** #318 (motivos de las obras con las palabras del contrato), que tiene dos lectores y vive en la frontera del contrato; sigue en su issue, sin la mitad del `1e21`, que ya cerró `lineaBlocker`.

## Tras el plan (11-11-2026)

El coordinador aprueba `plan.md` (opción A) con las dos recomendaciones del arquitecto: el test de la semilla 12 vale, con una primera afirmación de dónde está Valdeluz para que un cambio del generador falle legible; y «no la ofrece» nombra la facción de la morada ajena. Que `validateMapPlan` dé los motivos por tandas va a un issue aparte. #335 ya está fusionado en la rama de coordinación (toca `vestir-la-red.ts` y `poblar.ts`).
