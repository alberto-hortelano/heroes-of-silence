# Hallazgos de QA — decididos por el coordinador

Veredicto de QA: apto con reservas (ver `qa.md`). Se corrigen antes de cerrar.
Condición dura de siempre: sha de `pnpm banco` intacto; `pnpm verify` y `pnpm qa`
verdes.

## Se corrigen

1. **I-1 — el guardia del criterio 5 no ve cuatro formas, y su comentario promete
   más.** Formas que pasan hoy: `creature(stackById(state, id).body)` (paréntesis
   anidados rompen `[^)]*`), la llamada **partida en varias líneas** (la que
   produce Biome al pasar de 100 columnas: aparecerá sola), `creature(s['body'])`
   y `[s.body].map(creature)`.
   Arreglo: dejar de usar una regex de una línea. Para cada `creature(` del
   fuente (sin comentarios), buscar su **paréntesis de cierre emparejado** y mirar
   el argumento entero, con saltos de línea, por `.body` o `['body']`/`["body"]`.
   Además, prohibir `creature` pasado como valor (`map(creature)`,
   `.then(creature)`, `const f = creature`) fuera de `src/core/data.ts`: no hay
   uso legítimo hoy (compruébalo). El docstring dice exactamente lo que cubre y lo
   que no (el alias por variable intermedia sigue sin verse: lo que lo cierra es
   la unión de la fase 3). **Verlo morder con las cuatro sondas de QA** más las
   que ya mordían.
2. **M-1 — la excepción de `espectador/adaptar.ts` mira la línea entera.** Con el
   análisis por llamada del punto 1, la excepción pasa a ser **por llamada**: se
   permite solo la llamada `creature(X.body)` precedida inmediatamente por
   `X.unit ??` con la misma `X`. Sonda: la forma permitida y una directa en la
   misma línea → rojo.
3. **M-2 — el mismo personaje en dos slots.** `createBattle` (en la puerta, donde
   ya se valida `count` y los PV) lanza si un `member` aparece dos veces en el
   mismo bando: «X ocupa dos huecos del ejército». Test.
4. **M-3 — PV imposibles entran sin lanzar** (`NaN`, `2.5`). La comprobación de
   PV de `resolveUnit` exige `Number.isSafeInteger(hp)` además de `0 < hp <= max`,
   con frase. Test con `NaN` y `2.5`.
5. **M-4 — falta el test del defensor con personaje que gana.** Añadirlo en
   `test/game.test.ts` por el flujo real (como los de heridas): el defensor
   conserva `member` y sus PV quedan escritos. Verlo morder quitando el `member`
   de la vuelta del defensor.

## No se corrige aquí

- Nada de lo aplazado en `hallazgos-simplify.md` (unión discriminada, lectores de
  `Army`, escritor único de PV): fase 3.
