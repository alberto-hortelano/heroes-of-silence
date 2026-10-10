# Hallazgos de /simplify (consolidados, con la decisión tomada)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el
diff de la implementación. Deduplicados. **Ninguno cambia el juego sin muralla:
`pnpm banco` debe seguir con el mismo hash, sin re-anclar, y `enfrentamiento.ts`
igual que antes.**

## Se aplica

### Núcleo

1. **Un solo recorrido de distancias, el rápido.** `distanciaACaminar`
   (`battle.ts` ~615) reescribe a mano el BFS de `reachable` (`board.ts:268`) con
   `neighbours` + `hexKey` + `Map<string>`. Sustituir por un BFS por índices en
   `board.ts` junto a `reachable` (multiorigen, sobre `CASILLAS`, que llena un
   `Int16Array(BOARD_SIZE)`), y que `distanciaACaminar` lo use. Quitar la rama
   muerta `if (dist.has(hexKey(h))) continue;`. El `recta` de `distanciaACaminar`
   duplica `distanceTo` de `tactics.ts:117`: una sola.
2. **La IA mide con muralla en un solo sitio** (altitud 1, eficiencia 1,
   simplificación 12). Quitar la rama `hayMuralla ? filter : enemigos`
   (`tactics.ts:713`); que `distanceTo` de tactics sea la distancia andando (que
   sin muralla ya es `hexDistance`) y la usen también `mejorGolpe` y
   `convieneEsperar`. Las tablas de distancia se calculan una vez por enemigo y
   decisión (o se cachean por muralla, bando y hexes del objetivo) y se reutiliza
   la del objetivo elegido: hoy se hacen N+1 recorridos. Condición: banco con el
   mismo hash y `enfrentamiento.ts` idéntico; si no, se para y se anota.
3. **`movimientoBlocker` no repite las reglas de `movableFrom`** (altitud 2,
   reutilización 8). Una comprobación por celda que devuelva el motivo (un `fits`
   que dice por qué no cabe) y que lean `movableFrom` y el blocker. Así una
   restricción nueva no deja al blocker diciendo `null`.
4. **`despliegueBlocker` en el núcleo** (altitud 4). `despliegue` lanza hoy en
   mitad de `createBattle` y el editor solo se entera al pulsar «Luchar». Un
   `*Blocker` que lean `despliegue` (para lanzar) y el panel de la arena (que
   avisa mientras se dibuja y deshabilita «Luchar» con el motivo). `despliegue`
   usa la unión ya cacheada (`cerradasDeLaMuralla(m, 'attacker')`), no la suya
   (reutilización 9).
5. **La zona de salida, del núcleo** (altitud 5): exportar
   `bandoDeSalida(hex): Side | null` (o equivalente) en vez de
   `COLUMNAS_DE_SALIDA`, y que el sombreado del editor lo lea.
6. **Validación con los helpers de `arena.ts`** (reutilización 1-3, 5;
   simplificación 1-2): un `revisarLista(crudas, validar, clave)` genérico que usen
   `revisarBorradorDeArena` y `revisarBorradorDeMurallas`; `validarBorradoDe*` sale
   de `revisar` (primer inválido → lanza), sin repetir el chequeo de duplicados;
   usar `texto`, `sinRepetir`, `lista` y el patrón de campos sobrantes; en
   `muralla.ts`, `isInside` en vez del chequeo de límites propio.

### Servidor de desarrollo y cliente

7. **Borrador genérico en `tools/arena/borrador.ts`** (reutilización 4,
   simplificación 3): `leerMurallas`/`escribirMurallas` calcan
   `leerBorrador`/`escribirBorrador`. Un lector/escritor genérico por
   `{ruta, revisar, validar, clave, comentario, campo}`, como ya es
   `servirBorrador` en `vite.config.ts`. Fuera `MurallasLeidas`.
8. **El lado cliente del borrador, uno** (reutilización 12; simplificación 9):
   `arrancarMurallas`/`escribirFormas` calcan `arrancar`/`guardar` (`main.ts`).
   Un helper de leer y otro de guardar para los dos borradores, con los mensajes
   correctos (borrar no dice «No se ha guardado la muralla»); `guardar-forma` y
   `borrar-forma` en dos `case`. Arranque: `Promise.all` en vez de encadenar
   (eficiencia 5).
9. **Qué pieza hay en un hex lo dice `cerradaPara`** (reutilización 10-11,
   simplificación 4-5, 7): `renderMuralla` y `tocarHex` sin su `Map`/`some`
   propios; `HerramientaDeMuralla = PiezaDeMuralla | 'goma'`, la lista de
   herramientas sale de `NOMBRE_DE_HERRAMIENTA`; el ternario de `salida` en una
   función pequeña (simplificación 6). Quitar la guarda muerta de `borrarForma`
   (simplificación 8).
10. **`pintarMuralla`** (simplificación 10, eficiencia 4, reutilización 13): tabla
    de estilo por pieza en vez de tres ternarios; `medio`/`alto` fuera del bucle;
    el hex se indexa por `row * BOARD_WIDTH + col` sobre `hexesDe(t)` (sin Map por
    fotograma); fuera el `throw` inalcanzable.
11. **Repintar solo el editor en las acciones de muralla** (eficiencia 6), si
    sale sin enredar el código; si enreda, se descarta y se anota.

### Tests

12. Los tests usan `FORMAS_DE_EJEMPLO` en vez de redefinir «Línea recta» y «Línea
    con puerta»; un solo helper de columna; el `unidad` de test a
    `test/helpers.ts` (reutilización 14-15).

## Se descarta a conciencia

- **`createBattle` vuelve a validar la muralla** (altitud 6): es la puerta del
  núcleo y el contrato es fail-loud; validar en el borde y confiar dentro
  rompería eso. Barato (≤ 99 hexes). Se queda.
- **`cerradasPara` copia el Set de la muralla en cada llamada** (eficiencia 3): la
  copia ya existía con `blockedHexes` (solo unidades) y son ≤ 99 claves; pasar el
  conjunto hacia abajo toca firmas fuera del diff. Se queda.
- **Pintar la muralla en un lienzo fuera de pantalla** (eficiencia 4, parte 2):
  ~20 piezas por fotograma en una pantalla de batalla; no compensa la caché.
- **La unidad de dos hexes en la distancia andando** (altitud 3, la parte de
  `hexSize`): cambia comportamiento; ya está en el backlog del plan.
- **`moveRejection` duplicado en las dos sesiones**: sigue el patrón de
  `attackRejection`.
