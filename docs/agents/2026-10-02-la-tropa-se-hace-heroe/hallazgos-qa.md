# Hallazgos de QA de «la tropa se hace héroe» — decididos por el coordinador

Veredicto de QA: apto con reservas (`qa.md`).

## Se corrigen

1. **I1: el héroe nacido sin tropa deja la base sin defensa.** Decisión del
   usuario: **«Recoge la guarnición»**.
   - Al nacer, el héroe se lleva la guarnición de la base, como el contratado
     (`hireHero`) y el que vuelve vencido (`volverABase`). Se usa la misma puerta,
     `takeGarrison` o la que use `hireHero`, sin copiarla.
   - **Lo mismo para el portador que se queda sin tropa** al ascender su veterano:
     recoge la guarnición. Si los dos están en la base, el arquitecto de este
     arreglo decide cuál la recoge. Por defecto la recoge el nacido y el portador
     se queda sin tropa, pero así la base deja de estar indefensa. Que ninguna
     regla deje un héroe con tropa vacía en la casilla de la base mientras haya
     guarnición.
   - **Test:** las semillas 11 y 23 de la sonda de QA (rival con dos campesinos
     junto a la base). Con ascenso, la base aguanta igual que sin él.
   - **El banco no se mueve:** sin agente no hay ascensos.
2. **M1: nombre e historia en blanco.** El esquema rechaza los que solo tienen
   espacios o caracteres de control.
   - Si el hueco es el mismo `nombreDeMapa` de #97, se arregla allí, en la puerta
     compartida, y lo heredan las dos peticiones.
   - Test de las dos.
3. **M3: `CLAUDE.md`** pasa a 936 tests y a los tiempos medidos hoy.
   - `pnpm verify`.
   - `pnpm capturas`, ~87 s, también en la tabla de control de calidad.
4. **M4: el tope de héroes llega al agente.** Si un veterano de nivel 5 está en la
   base y no se le pregunta por el tope, la nota del turno lo dice en una línea.

## Se queda como está

- **M2: el agente mudo cuesta 300 s por veterano.** Es el mismo plazo que en el
  resto de peticiones, y el ascenso es raro.
