# Requisitos — #159, caras de acantilado lisas

## Petición
- Mandato del usuario (07-10-2026): «Sigue cerrando issues y mejorando el mapa de forma autónoma hasta que esté bien».
- Marca del usuario en `pnpm dev` («Cuadrado de fondo»): s2, casilla (23, 9), justo al sur del castillo.
  - Es una cara de caída 3 y una sola casilla.
  - Su pared se quitó y se lee como un bloque rectangular de roca lisa con bordes rectos.
  - La marca está en `docs/revision/marcas/20261007-142355-s2-23-9.*` del repo principal (`/home/al/code/heroes`), ignorado por git: el recorte PNG y el JSON con lo que hay en ese punto.
- Decisiones anteriores del usuario que siguen en pie:
  - «evitar bordes rectos, que tenga un poco de giros» (#156);
  - la pared nunca se corta con un recorte recto;
  - sin cortes rectos.

## Contexto
- **Issue #159:** los casos s9 bajo el castillo, s5 junto a la mina y la ciudad, s5 y3 x15, s6 y s7 y9 x9, y los remedios propuestos.
- **Mecánica de hoy** (`CLAUDE.md`, «Las rampas» y «Las laderas»): `ponerPared` corre, encoge y prueba el módulo estrecho, y si nada cabe quita la pared y deja un pedregal de `rocas-caidas`.
- **Lo que se ve** es la textura de cara de roca desnuda que pinta `pintarSuelo`, con su borde recto.
- **#160** (laderas) tiene también «corte vertical liso junto al estanque»; si cae solo, se cubre aquí.
- **En paralelo, en otros worktrees:**
  - #167 toca solo tests y `package.json`;
  - #161 toca el generador del núcleo y quizá `puentes.ts`/`analizar.ts`.
  - Evita reescribir `puentes.ts` salvo lo necesario.

## Criterios de aceptación
1. **Ninguna cara visible acaba en un rectángulo liso.** Donde la pared se quita, la cara se remata: encogerla, rematar con peñascos o con las esquinas de las laderas, o recortar la textura de la cara con un borde irregular. La forma la decide el arquitecto.
2. **Medida en las semillas 1-40**, antes y después:
   - un contador nuevo en el informe del escenógrafo (por ejemplo `carasLisas`), que muerde;
   - el caso del castillo de s2 (23, 9) y los de #159 resueltos, con capturas.
3. `informe.spritesSobreSenda`, `paredesSobreRampa`, `laderasMalCubiertas`, `laderasEnfrentadas` y `puentesTapados` siguen a 0.
4. **Los fps** al tope de alejar no empeoran de forma apreciable.
5. **El banco no cambia**: es solo el cliente.
