# Hallazgos de QA — el agente defiende y responde

Veredicto: **apto con reservas**. `qa.md` tiene la evidencia completa. Aquí van
los hallazgos con la decisión tomada.

Las dos reservas son de la misma familia que todo el ciclo: **decirle la verdad
al agente**. Por eso se cierran aquí y no van al backlog.

---

## A · Reconectar el puente mata la petición del agente NUEVO, y le miente

`src/server/agent-link.ts`. El `close` del socket viejo llama a `failAll()` sin
comprobar que siga siendo el activo. La guarda está **en la línea de al lado**:

```ts
if (this.socket === socket) this.socket = null;          // guardado
this.failAll(new Error('el agente se ha desconectado')); // SIN guardar
```

El agente recién conectado **pierde su primer turno** y recibe un veredicto falso
—«te desconectaste»— estando conectado.

Reproducido por QA aislado **y en el circuito real**: `[director] El agente no
pudo jugar el turno (el agente se ha desconectado)` seguido de `[agente]
respuesta a una petición que ya no existe: req-4`.

**Y corrige una limitación que el ingeniero declaró mal.** Se dijo que el
`result` no llega cuando falla el socket; esto es peor y en la dirección que
importa: **sí llega, y miente**.

**Arreglo:** la misma guarda que la línea de arriba.

## B · Un `end_turn` a media lista tira las siguientes en silencio

Con `[move_hero, end_turn, build, recruit]` el agente recibe `{"actions":1,
"problems":[]}` y `note: "Turno del día 1 aplicado entero: 1 acción."`

**Dos acciones desaparecidas y cero palabras sobre ellas.** Choca con el propio
`RESPONSE_FORMAT` y con el motivo por el que el usuario pidió informe siempre: un
silencio no puede significar dos cosas distintas.

**Arreglo:** contarlo. Ni descartarlas calladamente ni aplicarlas después del
`end_turn` — decir cuántas se ignoraron y por qué. Si el agente quería
terminar, saber que había puesto tres acciones detrás es información suya.

---

## Menores, todos dentro del alcance

| # | Qué | Decisión |
|---|---|---|
| 1 | El relevo entre dos `heroes_listen` se redacta como «se ha perdido la conexión», que es falso: no se perdió nada, lo relevó otra escucha | **Arreglar**: es prosa que el agente lee y no dice la verdad |
| 2 | `recogida` sobrevive al corte | **Arreglar**: mismo patrón que C del ciclo anterior — estado de una ejecución muerta que cruza la reconexión |
| 3 | `turnBlocker` numera los jugadores 1-based y el agente ve los ids 0-based | **Arreglar**: dos numeraciones para la misma cosa es una trampa, y aquí la lee un modelo |
| 4 | El guardia de frontera es ciego a `import 'ruta';` sin `from` | **Arreglar**: un guardia con un hueco conocido invita a usarlo. Y **comprobar que muerde por esa forma** |
| 5 | La promesa del `cast` sustituto si el hechizo **termina la batalla**: se dice «se te volverá a pedir acción para ella» y no habrá más peticiones | **Arreglar si es barato**; si no se puede reproducir, **decirlo en `implementacion.md`** en vez de dejarlo insinuado |

---

## Una corrección al informe, que no es código

QA eligió dos arreglos de la Parte 1 para comprobar que se habían verificado en
rojo. **A reproduce exactamente. E no reproduce como está escrito**: subir
`PLAZO_CONSULTA_MS` a una hora deja los 14 tests en verde, porque el test inyecta
`new Buzon(60)`; el guardia sí muerde al vaciar el `setTimeout`.

El arreglo está bien y probado; **la frase del informe describe otra cosa**.
Corrígela en `implementacion.md`. Un informe de verificación que no describe lo
que se verificó es peor que no tenerlo, porque el siguiente se fía.

---

## Lo que QA no pudo probar, y hay que dejar dicho

No son hallazgos, son huecos de cobertura que deben quedar escritos:

- **El castillo defendido por MCP real.** El mecanismo está probado en test y en
  el núcleo, pero QA no consiguió que la IA estratégica decidiera atacar un
  castillo en partida real. Se entrega **verificado por test, no por circuito**.
- **El plazo de consulta de 30 s en el circuito real.**
- **La doble pulsación humana**: confirmado que **hoy no es alcanzable** — sin
  `takeover` el turno del rival no llega a ningún `await`. La bandera sigue
  siendo prevención, y así hay que contarlo.
