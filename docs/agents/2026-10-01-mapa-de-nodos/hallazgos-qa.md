# Hallazgos de QA de la 2a — decididos por el coordinador

Veredicto de QA: apto con reservas (ver `qa.md`).

Condiciones:
- el banco no se mueve (`02bf2610…`);
- `pnpm verify`, `pnpm qa` y `pnpm capturas` en verde;
- cada arreglo lleva su test o un paso nuevo en `pnpm capturas`, y se ve morder.

## Decisión del usuario sobre I2: NO es un fallo, es la regla

> «Solo el heroe con su tropa, es la batalla final (si pierde)»

Si atacan un castillo con el héroe del dueño dentro, defiende **solo el héroe con
su tropa**, y esa batalla es la final: si pierde, el castillo cae (y con la base,
la facción). La guarnición que no viaja con él no pelea. **No se cambia.** Se
documenta como regla decidida:
- en el docstring de quien monta el bando defensor;
- en `RESPONSE_FORMAT`, para que el agente lo sepa;
- en `CLAUDE.md`, con una línea en la sección del mapa de nodos.

Y lleva **un test que la fije**, para que nadie la «arregle» después.

## Se corrigen

1. **I1: el cliente da el motivo de fin con la regla vieja.**
   `src/client/views/panels.ts` (~152) y `src/client/session.ts` (~91) dicen «no
   te quedan castillos ni héroes» y «el rival no tiene castillos ni héroes».
   - Tienen que decir la regla de verdad: «has perdido tu base» y «has tomado la
     base rival».
   - El motivo **sale del núcleo**, no se reescribe en el cliente. Si
     `game_over`/`player_defeated` no lo llevan, se añade al hecho, y el banco
     solo se mueve si eso cambia el volcado. Si lo mueve, se re-ancla mirando la
     forma: solo debe cambiar ese campo.
   - `pnpm capturas` comprueba el texto del fin de partida contra la causa real.
2. **M1:** con fugas en diagonal (muro en escalera o en diagonal pura), el rechazo
   de `validateMapPlan` nombra una casilla que no es el hueco. Tiene que nombrar
   las dos casillas del paso diagonal de verdad. Test con los dos casos.
3. **M2:** «no hay camino hasta (x,y)» tiene que decir **qué** lo cierra cuando es
   una ciudad guarnecida o un héroe rival: «lo cierra la ciudad X, con
   guarnición» o «el héroe rival Y».
4. **M4:** la captura `desktop-02-mapa-ruta-dorada-y-gris` ya no enseña la ruta y
   `pnpm capturas` da verde igual. El paso tiene que comprobar que la ruta se
   pinta (como el paso táctil) y elegir un destino alcanzable en el mapa nuevo.
5. **M5:** la ruta pintada sobre la niebla revela la forma de la red. No se pinta
   ruta (ni puntos) sobre casillas que el jugador no ha explorado; como mucho, el
   destino si está explorado.

## Se anotan, sin cambiar

- **M3:** las bases son nodos de grado 2 en 1 959 de 2 000 mapas. El plan aprobado
  lo declaraba así: la exigencia de grado ≥ 3 es para las ciudades neutrales.
  Se le comenta al usuario.
- **M6:** los muros de una casilla apenas se leen. Va en la 2b, con el tinte de
  territorio.
- Fallan igual en `HEAD`: la marcha de varios días que sale «descartada», la
  prosa «para que lo corrijas» de `map_generate` sin reintento y la barra que no
  se refresca al empezar el día. Van a issue.
