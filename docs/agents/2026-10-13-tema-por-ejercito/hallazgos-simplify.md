# Hallazgos de /simplify — tema por ejército

Consolidé las cuatro revisiones (reutilización, simplificación, eficiencia y altitud) y quité los duplicados. Cada hallazgo lleva ya su decisión tomada. Las líneas son las del worktree al hacer la revisión.

## Se aplican

1. **Cifras de caja baja (`lining-nums`)**
   - **Problema.** El tema no-muertos usa EB Garamond, que escribe las cifras de caja baja por defecto. Se tapó con `font-variant-numeric: lining-nums` en `html, body` y repitiéndolo en `#day`. El arreglo es frágil:
     - todo atajo `font:` lo devuelve a su valor por defecto;
     - `tabular-nums` sustituye la propiedad entera;
     - en el lienzo no hay forma de aplicarlo (`ctx.font`), y las cifras de daño de la batalla salen con `letraTitulo`.
   - **Decisión.** Se resuelve en el tema:
     - ninguna `--letra-*` lleva como primera familia una con cifras de caja baja por defecto;
     - para no-muertos se elige otra serif del sistema con cifras de caja alta (compruébalo pintando «Día 1 · 2026» en Chromium);
     - se quitan los parches de `lining-nums`;
     - en `#day`, en vez del atajo `font:`, van `font-size` y `font-family`.
   - Si de verdad no hay ninguna serif instalada que encaje, deja el parche **y** apúntalo en implementacion.md con el motivo.

2. **Lista `EXCEPCIONES` del guardia de colores (`invariantes.test.ts:~1502`)**
   - **Problema.** La lista existe porque solo hay un nivel de fichas.
   - **Decisión.** Un segundo nivel de **fichas fijas** (prefijo `--info-*`):
     - se definen solo en el `:root` neutro y valen igual para todos los temas;
     - el test de paridad de `temas.test.ts` no las exige en cada bloque, y además prohíbe que un tema las redefina;
     - son las salidas de bando de la muralla, el rayado, la piedra y la madera.
   - El guardia de colores se queda sin lista.
   - El comentario que dice que `#33405a` y `#5a3a33` son «`COLOR_BANDO`» se corrige: son tonos de su propia escena, no `COLOR_BANDO`.

3. **El rival lleva la otra facción**
   - **Problema.** `faccionesConLaDe` (`session.ts:~830`) es una regla del juego y está en el cliente.
   - **Decisión.** Se mueve a `core/facciones.ts`, sin la rama especulativa de «más de dos facciones»: con `FACTION_IDS` de dos, «la otra» se deriva.

4. **Lienzo que se quedó sin tema**
   - **Problema.** `pintarCorona` (`batalla.ts:~1660`) conserva `rgba(12,10,6,0.9)` y `system-ui, "DejaVu Sans"`, y `render/figura.ts:384` conserva `system-ui, sans-serif`.
   - **Decisión.**
     - Los dos pasan por `temaDelLienzo()`.
     - Guardia nuevo en `invariantes.test.ts`: ninguna familia de letra escrita a mano en `ctx.font` dentro de `src/client/render/` (ni `system-ui`, `sans-serif`, `serif`, `Georgia` o `DejaVu` como literal).
     - Las excepciones legítimas van con su motivo; si sale alguna, apúntala. Ese guardia se rompe a mano y se ve en rojo.

5. **Una sola lectura de facción → arena**
   - **Problema.** La lectura tiene hoy tres nombres: `FACCION_DE_LA_ARENA`, `faccionDeLaArena` y `temaDeFaccion`.
   - **Decisión.**
     - Se borran `faccionDeLaArena` y su reexport en `arena.ts`.
     - `temaDeFaccion` lee `FACCION_DE_LA_ARENA[f]`.
     - Quien use las tablas movidas las importa de `core/facciones.ts`, sin reexport en `arena.ts`. Eso incluye `paneles.ts` y `tools/taller/*`.

6. **`parseFaccion` y `deLaLista`**
   - **Problema.** `parseFaccion` está en `types.ts` y reescribe `deLaLista` (`arena.ts:~1031`, privada).
   - **Decisión.**
     - `deLaLista` pasa a `core/validar.ts` y la usan `arena.ts` y `parseFaccion`.
     - `parseFaccion` pasa a `core/facciones.ts`.
     - Si al moverla cambia el mensaje de algún test de la arena, el mensaje se conserva.

7. **Leer `?faccion=` una sola vez**
   - **Problema.** `URLSearchParams.get('faccion')` se queda con el primero en silencio, cuando la arena rechaza un parámetro repetido.
   - **Decisión.**
     - `unaVezEnLaURL` pasa a `core/validar.ts`, la importa la arena y se usa para `?faccion=`.
     - La semilla del juego **no se toca**: está fuera del alcance.

8. **`main.ts` (`sinArrancar` / `deLaUrl`)**
   - Se cambia esto:
     - la frase `quita "?seed=…"…`, escrita dos veces, pasa a ser una constante;
     - el error se atribuye al parámetro que falló, no a la semilla por defecto.

9. **Selectores de la barra duplicados**
   - Un solo selector en lugar de dos copias:
     - una regla CSS común en `style.css`, con una clase compartida en vez de `#ejercito select` y `#tema-arena select`;
     - un helper de plantilla `selectorDeLaBarra(...)` que usan `renderSelectorDeEjercito` y `renderSelectorDeTema`;
     - un solo lector del valor de un `<select>`: se exporta `valorDe` (y `marcadoDe`, si va con él) de la arena a un módulo compartido del cliente, y lo usa `main.ts`.

10. **Fichas derivadas dentro de cada tema**
    - `--letra-encabezado: var(--letra-titulo)` donde hoy es copia literal; en templarios, también `--letra-cuerpo` si es copia.
    - Donde una ficha de un tema es otra del mismo bloque, se escribe con `var(...)`. Por ejemplo, `--herramienta-borde: var(--brass)`, `--chapa-borde: var(--gold)`, `--galon` y `--sello-enlace: var(--resalte)`, `--sello-enlace-borde: var(--etiqueta-borde)` y `--vida-fondo: var(--fondo-lienzo)`, en los temas donde coinciden.
    - Para alfas sobre otra ficha, `rgb(from var(--x) r g b / a)` si Chromium y Firefox de hoy lo aceptan; si no, se queda el literal.
    - **El neutro no cambia de valores.** Comprueba que `temaDelLienzo()` sigue leyendo un color resuelto: `getComputedStyle` de una propiedad personalizada devuelve el texto **sin resolver** `var(...)`. Si eso rompe el lienzo, o resuelves de verdad (por ejemplo leyendo `color` de un elemento sonda) o esas fichas del lienzo se quedan en literal. Decide y apúntalo.

11. **`null` de la facción redundante**
    - `Session(seed, faccion: FactionId)` siempre pasa las facciones con la de la persona.
    - Se quitan `faccionPedida` y el `| null`. «Reiniciar» y el selector leen `session.jugador.faction`.
    - La URL lleva `?faccion=` solo cuando no es `knight`.
    - El banco no cambia porque no pasa por `Session`; aun así, comprueba que `newGame` sin `factions` sigue siendo idéntico.

12. **`ponerTema`**
    - No vuelve a validar un argumento que ya llega tipado `Tema`.
    - Sale pronto si el tema no cambia, para no tirar la caché.

13. **Tests tautológicos**
    - Se borran:
      - `expect(TEMAS).toEqual(FACCIONES_DE_ARENA)` (`temas.test.ts:~100`);
      - el `toContain(temaDeFaccion(f))` que ya garantiza el tipo (`~154`);
      - el `new Session(7, 'knight')` que repite «pedir las de siempre…» (`faccion.test.ts:~73`).
    - El quitar comentarios del CSS (`replace(/\/\*[\s\S]*?\*\//g…)`), repetido en `temas.test.ts` y en `invariantes.test.ts`, pasa a un helper de test compartido.

14. **Una sola hoja de estilo**
    - `style.css` empieza con `@import './temas.css';` y se quitan los `<link>` a `temas.css` de las tres páginas.
    - Vite lo junta en una sola hoja y el orden da igual, porque `:root[data-tema]` es más específico que `:root`.
    - Comprueba que `vite build` lo junta.

15. **Restos**
    - El comentario de `COLOR_NEUTRO` (`palette.ts:38-42`), que lo llama «filo de las chapas del mapa», ya no es verdad: se corrige.
    - El JSDoc de `renderEnlace` quedó encima de `renderSelectorDeTema` (`arena/paneles.ts:~493`): se vuelve a poner en su sitio.

## Se descartan a conciencia

- **Alfa del lienzo dentro de la ficha o helper `conAlfa`.** Que las fichas sean opacas y el alfa lo ponga el código es una decisión documentada, y cuesta nanosegundos. Se queda.
- **Galones en un solo trazo.** Cambiaría cómo se ven las uniones con alfa menor que 1, y el ahorro es despreciable.
- **Caché de las cadenas `ctx.font` por tamaño.** Chrome interpreta la fuente una vez por tamaño, no en cada fotograma.
- **Leer `temaDelLienzo()` una vez por fotograma y pasarlo hacia abajo.** Es una comprobación de `null`; cambiaría firmas sin ganancia.
- **`leido` construido recorriendo `FICHAS_DEL_LIENZO`.** Se perdería tipado estricto por tres líneas.
- **No tematizar `--contorno`, `--sombra-honda`, `--velo` y `--dialogo-sombra`.** Haría falta otra lista en el test. Con el nivel `--info-*` del punto 2, el ingeniero puede moverlas allí si son idénticas en todos; si no, se quedan.
- **Linealización sRGB compartida con `pigmentos.test.ts`.** Es utilidad de test de bajo coste, y unirlas toca un test ajeno.
- **Leer la semilla con `unaVezEnLaURL`.** Es un cambio de comportamiento fuera del alcance de la tarea.
