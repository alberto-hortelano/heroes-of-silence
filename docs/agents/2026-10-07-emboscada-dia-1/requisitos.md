# Requisitos — #130, emboscada sin aviso el día 1

## Petición
Viene del backlog. El usuario la eligió para trabajarla en paralelo el 07-10-2026 («#130 emboscada día 1»).

Texto de la issue: «En `?seed=1`, día 1, el héroe pierde toda la tropa en una emboscada de 5 momias que no están a la vista, y la ruta no muestra el rombo rojo de emboscada. **No es regresión**: con HEAD anterior pasa en 100 de 100 semillas, ahora en 98 de 100. Pregunta de fondo: ¿la vista previa de la ruta debe avisar de una región que embosca aunque el grupo no se vea, o es correcto que la niebla lo oculte?»

Viene de `docs/agents/2026-10-03-mapas-densos/qa.md`, H7 (capturas qa-06 y qa-07).

## Contexto
- **Asaltantes:** son grupos neutrales que patrullan regiones sin dueño y emboscan al pisar si sacan `ventajaClara` (`ai/fuerza.ts`). Viven en `GameState.raiders` y todo pasa por la niebla.
- **Pregunta de diseño abierta:** si avisar de una región que embosca aunque no se vea el grupo. Es del usuario. El crítico debe traer opciones con su coste para el juego (información, reglas de niebla, el agente), y el coordinador se las lleva.
- **Banco:** si cambia una regla, el banco cambia y la forma del diff se enseña al usuario antes de re-anclar. Sin semilla nueva sin terminar (`barrido-semillas`).
- **Dónde:** esta tarea vive en `/home/al/code/heroes-emboscada` (rama `emboscada-dia-1`).
- **En paralelo:** #157 (puentes), #155 (núcleo, `generate.ts`/`vestir.ts`) y los restos del agente (`lineaLegible`, la barra y los veredictos).

## Criterios de aceptación (provisionales, hasta que el usuario decida)
1. Que un jugador no pierda la tropa el día 1 sin poder saber que se arriesgaba. Puede ser con un aviso que respete la niebla, con un cambio de regla o con otra cosa que decida el usuario.
2. Lo mismo para el agente: lo que ve el cliente lo ve el agente, por la misma niebla.
3. Comprobaciones:
   - `pnpm verify`;
   - el barrido de semillas;
   - `pnpm banco` (o el diff juzgado);
   - `enfrentamiento.ts` si cambia la IA de batalla;
   - el navegador con `?seed=1`.

## Fuera de alcance
- Rehacer el sistema de asaltantes.

## Decisión del usuario tras la crítica (REENCUADRADA, 07-10-2026)
El usuario elige la **opción C** de `critica.md`: «C: se ve al ver su región». Un grupo de asaltantes se ve en cuanto se ve cualquier casilla de su región, y la marcha se para al descubrir un grupo que embosca.

Criterios que sustituyen a los provisionales (de `critica.md`):
1. **El día 1 no queda ninguna ruta que acabe en emboscada sin aviso.** Se mide en 100 semillas y debe dar 0.
2. **Una sola regla de qué grupo se ve**, la usan cliente, espectador y agente. Es una función del núcleo y pasa por la niebla.
3. **La marcha se para** al descubrir un grupo que embosca en la ruta.
   - Lo que anduvo cuenta.
   - El veredicto del agente lo dice.
   - Ojo: #121 va en paralelo en la rama `agente-restos` y cambia el veredicto de una marcha parcial. Se coordina al fusionar, sin duplicar el recorte.
4. **La ventaja de la IA de reglas, que ve los grupos sin niebla, queda escrita** (CLAUDE.md, historia.md). No se cambia aquí, porque es de #115.
5. **No se quitan los grupos de las regiones que tocan la base**, que fue decisión del usuario.
6. **Banco:** si cambia, se presenta la forma del diff al usuario antes de re-anclar. Ninguna semilla sin terminar, y el agente (`pnpm qa`) en verde.

## Punto de control (07-10-2026)
El usuario aprueba `plan.md` tal cual: «Adelante». Eso incluye fusionar #121 (rama agente-restos) primero y reutilizar `notaMarchaParcial`.

## Banco (07-10-2026)
El usuario aprueba re-anclar el banco, «Sí, re-anclar», con la forma presentada: solo cambia `seen` (427 líneas en 153 semillas), no cambia ningún `fin` y no hay `march_halted` de la IA. Se re-ancla al fusionar, después de los restos (#121). Si el hecho de marcha cortada de #121 entra en el núcleo, `notaMarchaParcial` formatea los dos hechos.
