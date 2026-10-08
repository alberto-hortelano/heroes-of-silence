# Crítica — las regiones definen el mapa (#195)

Sustituye a #177 (la regla del lado, caducada) y a #111 (28 minas en cualquier tamaño).

## La premisa, contra el código (main 60c784f)

- `LADO_DEL_MAPA = 34` es el dato (`generate.ts`); `intentarRed` saca las parejas de
  regiones de fuera del área: `pares = max(2, round(W·H / AREA_POR_REGION))`, 300.
  En 34×34, 4 parejas: 5 regiones por bando (la de casa y 4 de fuera), 10 en total.
- Las minas son 14 por bando fijas (dos de cada recurso): 3 en casa y 11 repartidas
  en orden por las de fuera (3/3/3/2 en 34; 5/6 en un 24×24, donde no caben bien).
  Cierto: no escalan.
- **Consecuencia que la premisa no dice**: con el área, 32×32 da 3 parejas
  (round(1024/300) = 3) y 34 da 4. La «mediana 7 en 32» de `CLAUDE.md` y el «32 ya
  cumple» de #177 hablan de mapas con **distinto número de regiones** y la misma
  cantidad de minas: la regla del lado mezclaba dos palancas. Pasar el dato a las
  regiones lo arregla de raíz.

Línea base medida hoy (08-10-2026, main 60c784f, `tools/qa/tamanos.ts`, 1 000
semillas): 34×34 8 / 16 / 47 días (mediana / p90 / máx), 0 sin terminar; 30×30
7 / 12 / 26. Banco: ancla c53c353b…, 8 / 17 / 47.

## Qué toca

- `src/core/map/generate.ts`: el dato (`REGIONES_POR_BANDO`), el lado derivado
  (una función con su inversa al lado), el reparto de minas por región, la opción
  del generador para pedir por regiones.
- `src/server/partida.ts` (`ANCHO_DEL_MAPA`): ya lee `LADO_DEL_MAPA`; sigue igual
  si `LADO_DEL_MAPA` pasa a ser derivado. Solo el comentario.
- Contrato `map_generate` (`serializeMapRequest`) y `validateMapPlan`: el agente
  diseña a mano con `width`/`height`. Ver plan: no se rompe nada.
- Tests: `lado-del-generador.test.ts`, `regiones.test.ts`, `agent-link.test.ts`
  leen `LADO_DEL_MAPA`; tests nuevos del lado derivado y de las minas.
- `CLAUDE.md` («Lado del mapa»), `docs/historia.md`, `tools/qa/tamanos.ts`
  (mide lados; debe poder medir regiones).

## Riesgos

1. **Rango del generador (#102)**: 24-64. La función del lado tiene que caer
   dentro para todo número de regiones que se acepte, y lo de fuera lanzar
   antes de intentar, como hoy con el lado.
2. **Espejo y equilibrio**: las regiones van en parejas 2k/2k+1; el reparto de
   minas tiene que ser por pareja (lo mismo en una y su espejo), no por bando a
   ojo. `colocarPar` ya lo da.
3. **Costes de #188/#189 en `vestir.ts`**: más minas en una región = más puertas y
   ramales; el número por región de fuera no debe subir del de hoy (≤ 3) o la
   rectitud y la densidad de caminos (techos de `regiones.test.ts`, `rectitud.ts`
   en 120/15/8 con techo 8 en el tercero) se mueven. No hace falta tocar
   `vestir.ts`.
4. **Banco**: se mueve entero (cambia la corriente del `rng` al colocar minas).
   Se juzga la forma del diff, no el sha.
5. **Coma flotante**: `Math.sqrt` no vale en `core`; la raíz, entera y por bucle.

## Veredicto

Hacerla. Mínimo: el dato pasa a regiones, el lado se deriva con la inversa exacta
de la cuenta de hoy (así el número de regiones de un lado pedido a mano no
cambia), las minas por región. El agente sigue con ancho y alto.
