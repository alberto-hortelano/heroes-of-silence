# Requisitos — R4 y R5: el relieve por esquinas y la bajada como pieza

## Petición
- **Pregunta del usuario (07-10-2026):** «Compara la arquitectura del mapa con cómo se hace en proyectos que sigan mapas por piezas como este; podríamos estar reinventando la rueda en algunos sitios».
- **La comparación** está en `docs/agents/2026-10-07-arquitectura-mapa/comparacion.md`, en las secciones R4 y R5.
- **Decisiones del usuario:**
  - R4, «Sí, tras R1 y R3»: el relieve con la altura en las esquinas (marching squares o dual grid), con arte nuevo de diagonales y esquinas interiores.
  - R5, «Junto con R4»: la bajada por un acantilado como pieza «cara con paso», no como un tajo en la pared.
- **Encargos de siempre:** «evitar bordes rectos, que tenga un poco de giros»; que la repetición no se note; ninguna pared cortada con un recorte recto.

## Contexto
- **Hoy** (CLAUDE.md, el mapa de aventura):
  - las caídas se detectan por arista y por fila;
  - las piezas son frontales al sur y laderas al este y al oeste;
  - las diagonales salen como escaleras;
  - las esquinas se arreglan caso a caso (`esquinas`, `topesDeCara`, `tramoDeFrontal`, `sinBarrancos`, `juntoDeLadera`…);
  - las rampas son tajos (`rampas`, `ponerPared`), y las caras se pintan bajo la silueta de su pared (`caras.ts`, #159).
  - Los acantilados van en cresta (#174, `acantiladosARas`).
- **Lo que debe resolver:**
  - las laderas de #160: lenguas colgantes, la V de s9 sobre la senda, frontales sobre la senda que baja;
  - el escalón de nivel sobre el muro fino recto (#180);
  - el muro bajo suelto (#172);
  - las juntas de cara y ladera sin tapar.
- **El arte va por codex con `pnpm taller`**, nunca fal.ai. Las peticiones van en `docs/art/peticiones.md`.
  - Con el usuario ya se han hecho pilotos de laderas (§19-§20) y de puentes (§17-§18). Léelos, porque cuentan qué sale bien y qué no del modelo de imagen.
  - Las piezas nunca se espejan, y la cámara está a 25°.
- **En paralelo:**
  - R3 cambia el generador del núcleo, las fronteras y el banco.
  - #173 aparta volúmenes de los pasos de montaña en `colocar.ts`.
  - R4 es solo cliente y arte: el banco no cambia.

## Entregables de esta fase (diseño, sin implementar)
1. **`plan.md`:**
   - el modelo de datos de la altura por esquinas (de dónde sale, a partir de `nivel` por casilla);
   - el catálogo de casos (cuántas piezas por material y caída);
   - cómo se colocan y qué se borra del sistema de hoy;
   - cómo entra la bajada (R5);
   - qué contadores del informe quedan y cuáles sobran;
   - el plan por fases, con un piloto primero: un material y una caída, en una semilla.
2. **La petición de arte del piloto** para `docs/art/peticiones.md`, como sección nueva, con el formato de las anteriores: qué piezas, en qué cámara, qué guía, cómo se derivan sus juntas.
3. **Un prototipo del modelo de esquinas sin arte**, con marcadores: cuántos casos salen en las semillas 1-40 y con qué frecuencia. Así se dimensiona el arte.
