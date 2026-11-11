# Hallazgos de QA que se arreglan (vuelta 1, 11-11-2026)

Del `qa.md` de esta carpeta, sobre `cb183cc4` (ya fusionado en la rama de coordinación). Decisión del coordinador:

- **H1 (se arregla).** La barra nunca usa su segunda línea: `noCabe` (`comun/barra.ts`) compara `scrollHeight > clientHeight`, y con 13px/1,5 dos líneas dan `clientHeight` 39 y `scrollHeight` 40 (medido a 380 y a 1024), así que todo texto de dos líneas «no cabe» y se corta a una; a 380 con ratón queda «No hay camino hasta … (el resto, con el ratón quieto)». Arreglo: que la medida no se equivoque por el redondeo del alto de línea (la tolerancia de 1 px que propone el QA, o un alto de línea y una reserva que den píxeles enteros), coherente con la aserción de la pasada `arena` de `pnpm capturas` (`scrollHeight ≤ clientHeight` a 1024/1100/1440) y con la barra de cuatro líneas de la batalla (que probablemente pierde la cuarta por lo mismo). Test en `barra.test.ts` que muerda.
- **H3 (se arregla).** En los motivos mixtos sale «A y B y algo más que no ves»; debe ser «A, B y algo más que no ves» (`porQueNoLlega`, `core/state/marcha.ts`). Test que muerda.
- **H2 (issue aparte).** La frase de la barrera sobre una casilla bajo el negro deja ver relieve sin explorar: ya apuntada para abrir como issue.
