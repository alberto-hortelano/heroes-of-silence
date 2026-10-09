# Hallazgos de /simplify: consolidados y decididos

Cuatro revisiones (reutilización, simplificación, eficiencia y altitud) sobre el diff sin commitear de la rama `combate` (09-10-2026). Aquí van deduplicadas y con la decisión ya tomada. Las líneas son las del diff de entonces y pueden haberse movido.

**Condición de todo el pase:** `pnpm banco` sale con el ancla igual, y el test de crónicas idénticas (arena en «nuestra» = juego) y `test/prevision.test.ts` siguen en verde. Ningún cambio de aquí puede cambiar el comportamiento. Si alguno lo cambia, se deshace y se anota.

## Se aplican

### Núcleo: cada regla, en un sitio

1. **Las comprobaciones del golpe, en un `*Blocker` compartido** (lo encontraron tres revisiones).
   - Problema: `previsionDe` (`battle.ts` ~1840) repite a mano las comprobaciones de `applyAction` (vivo, rival, casilla alcanzable, adyacencia), que ya estaban también en `ataqueBlocker`. Además busca el objetivo dos veces (`objetivo`/`target`), y el caso `shoot` mira `disparoBlocker` pero no vivo ni rival.
   - Cambio: un `golpeBlocker(state, s, target, from?)` (y lo equivalente para el disparo) que devuelva el motivo. Lo leen `applyAction` (lanza), `previsionDe` (lanza) y `ataqueBlocker` (la frase).
   - Una sola búsqueda del objetivo.
   - Coste: si se puede, sin el BFS de `movableFrom` en cada movimiento del ratón (eficiencia 2). Por ejemplo, `cargaDesde` con `bloqueadas` calculadas una vez. El caso de la previsión se puede apoyar en la caché de lo legal de la sesión.
2. **La regla (e), «suerte → tirada», en una sola función** `efectoConReglas(efecto, reglas)` (en `reglas.ts` o `effects.ts`).
   - La usan `temporalEffect` (`spells.ts`, que hoy pregunta lo mismo dos veces) y `efectosAlGolpear` (`battle.ts`). Así desaparece `CURSE_ON_HIT_TIRADA`.
   - Los efectos al golpear en modo fheroes2 se calculan una vez, en una constante, no en cada golpe (eficiencia 8).
   - La IA (`fraccionDeSuerte`, `tactics.ts` ~297) pregunta al núcleo cuánto vale un efecto de daño (`valorDeEfectoDeDanio` en `damage.ts`) en vez de ramificar por `kind === 'tirada'`.
3. **La regla (d), defender, en un sitio.**
   - `endTurn` lee `state.reglas` dentro, sin el parámetro posicional `sinMoral`, como hace `advance` con `probabilidadDeMoralBaja`.
   - El rótulo «(defiende)» de `applyModifiers` lee si se aplicó el bono de `effectiveDefense` (o de `bonoDeDefender`), en vez de volver a decidir la regla.
4. **La regla (f), el A/D del mando, un solo cálculo.**
   - Hoy están `opcionesDeDanio`, `ataqueYDefensaEnBatalla` y la suma de `applyModifiers` por separado.
   - Cambio: un `ataqueYDefensa(state, a, t)` que dé las cifras finales; la ficha y el golpe pasan por él.
   - Además, `opcionesDeDanio` sin `extra` y con `heroe === 'nuestra'` no reserva un objeto por pareja en la IA: lo reutiliza (eficiencia 4).
5. **`tiradaDe` sale de `tiradasPosibles`, sin cambiar la corriente de azar.** Se conserva la condición `efectoDeTirada(x) !== 0 ? lo/hi : rng.int(lo, hi)`: una criatura con min = max sigue gastando `rng.int`.
   - Con `reglas.bendicion === 'nuestra'` no se recorre `effects` buscando una tirada (eficiencia 4).
6. **`mandoDe(heroe, retreat)`**, una sola conversión de héroe a `BattleHero`. La usan `heroeDeArena` (`arena.ts`) y `battleSideForHero` (`game.ts`). Es el patrón que el comentario de `battleSideForHero` ya cuenta como lección.
7. **Las cifras del héroe inicial, en una constante del núcleo** (`CIFRAS_DEL_HEROE_INICIAL`, junto a `heroeRecienHecho`/`setup.ts`). Las lee `heroePorDefecto` de la arena (`client/arena/main.ts` ~177), que hoy las teclea. Antes, comprueba cuáles son las de verdad: dos revisiones discrepan (2/2/1/2 frente a 1/1/1/1).
8. **La previsión de un hechizo usa las funciones de `castSpell`.**
   - Una función pura `curaDe(s, caster, target)` y la del daño de hechizo, que llaman `castSpell` y `previsionDeHechizo`.
   - En `previsionDeHechizo`, los `null` comunes van una sola vez en `base`.
9. **La previsión del contraataque cuelga efectos con la misma función que la batalla.** Se parte `applyStackEffect` en una pura `colgarEfecto(target, effect)` (inmunidad, quitar la contraria, aplicar) y la parte que anota en el registro.
10. **Reglas y URL.**
    - `reglasALaURL` se define con `reglasEncendidas(r).join(',')`.
    - Un `conRegla(reglas, nombre, version)` en `reglas.ts` sustituye el `Object.freeze({...})` del cliente sin validar.
    - El bloque que escribe `?reglas=`, copiado en `arena/main.ts`, pasa a una sola función.
11. **`danioValido(par, quien)`**: la comprobación del daño que comparten `validarUnidadDeArena` y `cifrasDeCatalogoEnLaArena`.

### Cliente: solo pinta

12. **Un solo texto de efecto.** Se exporta `cifraDeEfecto` (y `ETIQUETA_EFECTO`) de `views/panels.ts` y se usa también en `views/prevision.ts` (`deHechizo`) y en `arena/paneles.ts` (el «rinde»).
    - Es además un fallo: la copia de `paneles.ts` no conoce `attack` y llama «suerte» al miedo.
13. **La ficha del héroe trae del núcleo `duracion` y `manaMaximo`.** `paneles.ts` deja de recalcular `Math.max(1, h.poder)` y `knowledge * 10`.
14. **Un solo formateador de decimales con coma** en `core`, que importan `damage.ts`, `views/prevision.ts` y `arena/paneles.ts`. Mira si `contract/serialize.ts` ya tiene uno y reutilízalo.
15. **El liderazgo en la arena:** `renderBando` recibe `ocupados(lado)` de `main.ts`, no lo recuenta. `bandoDeArena` sigue comprobándolo (su mensaje dice el lado).
16. **El libro de hechizos.**
    - `Session.hechizos` devuelve `this.libro`, sin los cinco delegadores. Quien leía `session.selectedSpell` pasa por `session.hechizos`.
    - La clave de caché con maná y `castThisRound` se escribe una vez y la usan las dos sesiones.
    - El docstring repetido de `spellOptions` se quita.
17. **La previsión al mover el ratón.**
    - Un memo por acción (`WeakMap<BattleAction, string>`, atado a la lista legal en caché) en `previsionEn` y `previsionDelHechizo` (`escenas/batalla.ts`).
    - En `motivoSinGolpe`, `accion` se calcula una vez y se pasa a `previsionEn`.
18. **Montaje de la arena.**
    - La lista del catálogo es una constante perezosa del módulo y solo se pasa con el filtro `catalogo`.
    - El rótulo de cada miniatura (`nombreDeFigura`) se calcula al montar la lista `figuras`, no en cada fotograma.

### Tests y guardias

19. **Ayudantes de test compartidos.** `mando`, `bando` y `con` se repiten en `test/prevision.test.ts` y `test/reglas-de-batalla.test.ts`; pasan a un módulo común (por ejemplo `test/batalla-de-prueba.ts`).
20. **Hechizos sin dado, una sola semilla.** En `test/prevision.test.ts`, los escenarios de hechizo sin tirada (Flecha mágica, Rayo, Maldición) recorren una semilla por máscara, no 300.
21. **Excepción muerta en el guardia.** `test/invariantes.test.ts` (~593) deja a `src/client/session.ts` nombrar `crearBatallaConReglas`/`reglasDeLaURL`, pero no las nombra: la excepción se quita. Comprueba que el guardia sigue mordiendo (rómpelo a mano y míralo en rojo).

## Se descartan a conciencia

- **Unificar `resumenDeCifras` y `resumenDeUnidad`** (`arena/paneles.ts`). Son tipos distintos (`UnidadDeArena` con `casillas` frente a `UnitInfo` con `speed`), y unirlos pide un adaptador mayor que la copia. Una revisión lo pedía y la otra lo descartó; se queda.
- **Que el núcleo deje de escribir el texto de los `Modificador`** («ataque 3 contra defensa 2,4»). Es un cambio de forma de toda la previsión. El núcleo ya escribe texto en otros sitios (crónica, motivos de `*Blocker`). Con un solo formateador (14) basta.
- **Rehacer la caché de `SesionDeArena` invalidando en cada escritura en vez de con claves de texto** (eficiencia 7). El coste es pequeño, y invalidar a mano es justo el tipo de cambio que deja una caché vieja. Basta con unificar la clave (16).
