# Hallazgos de QA — decididos

Veredicto de QA: **apto**, los dieciséis criterios verificados uno a uno
ejecutando. Cuatro hallazgos, ninguno regresión de este ciclo. Tres entran; uno
va a issue.

---

## 1 · `game_state` se salta la niebla entera — ENTRA, y es lo que hace verdadero al ciclo

`src/server/consultas.ts:18-19` hace `Number(args.player ?? 1)` y se lo pasa a
`serializeAdventureTurn` **sin comprobar que ese jugador sea del agente**. Y la
tool MCP se lo **anuncia**: el parámetro está documentado.

Medido por QA: `game_state{player:0}` devuelve la crónica del rival, sus
recursos, sus héroes y sus castillos.

Es **preexistente**, no lo rompió este ciclo. Pero eso no lo salva, por una razón
que manda sobre el alcance: **este ciclo se cierra diciendo que el agente ya no
lee el diario del rival, y con esta puerta abierta esa frase es falsa.** Cerrar la
principal y dejar la de al lado no es medio arreglo: es un arreglo que se cuenta
mal.

**Decisión: entra.** El servidor ya sabe qué jugadores lleva el agente
(`director.agentPlayers`); lo único que falta es que `responderConsulta` lo
reciba.

**Y se rechaza diciéndolo, no se recorta en silencio.** El precedente está en el
mismo fichero: `battle_state` no le niega la vista al agente cuando pregunta por
una batalla que no es suya — le enseña la del atacante **y se lo dice**. Aquí el
equivalente no puede ser enseñar el estado del rival con una nota, porque *eso es
la fuga*. Así que: se rechaza y la respuesta **nombra los jugadores que sí
lleva**, que es la información que el agente necesita para corregirse.

## 2 · El guardia del `as` no ve el escape por `as unknown as` — ENTRA

QA metió `(state.log as unknown as GameEvent[]).push(...)` y pasaron `tsc`, Biome
y los 230 tests.

Es exactamente la lección que este repositorio ya pagó tres ciclos: el guardia de
`node:` nació ciego a `import 'node:fs';` sin `from` y a `await import(...)`, y
nadie lo supo. **Un guardia hay que verlo morder por todas sus puertas**, no por
la que se le ocurrió a quien lo escribió.

**Decisión: entra**, y con el escape roto a mano y visto rojo antes de darlo por
bueno.

## 3 · `renderBattleLog` conserva el `default:` y misatribuye — ENTRA

Es la misma misatribución que el criterio 11 acaba de arreglar un piso más
arriba: `perished` se pinta **siempre** en clase `lose`, cuando la unidad que
cae puede ser la del rival. Y el `default:` se traga un tipo de entrada nuevo sin
que nada se ponga rojo — justo lo que el hallazgo 2 de la simplificación quitó de
`renderLog` cuatro commits antes.

**Decisión: entra.** Arreglar una crónica y dejar la de al lado con el mismo
defecto, en el mismo fichero y el mismo día, es dejarlo mal a sabiendas.

## 4 · Un castillo tiene radio de visión 0 — VA A ISSUE

El rival puede plantarse pegado a mi capital sin que me llegue un solo
`hero_moved`. `requisitos.md` mandaba decir esto si aparecía: *«si el filtro
descubre que `visibleNow` está mal, se dice y se abre issue; no se rehace aquí»*.

Es #35 quedándose al descubierto, no un fallo de este ciclo, y tocarlo cambia la
niebla de la partida entera — o sea, todas las líneas base byte a byte que los
ciclos en cola necesitan. **Issue.**

---

## Lo que QA declara no probado, y se acepta

- Su propia captura de castillo y `spells_learned` **en pantalla** (sí por test).
- El canal del espectador: hoy no tiene consumidores.
- Tres o más jugadores.
- El guardado real de #10, que no existe todavía.
- **Ninguna cifra de tiempo se convirtió en hallazgo**: la máquina estuvo con
  `load average` entre 8 y 13 toda la sesión por tener varios agentes trabajando.
  Es la decisión correcta y la misma que tomó el ingeniero.
