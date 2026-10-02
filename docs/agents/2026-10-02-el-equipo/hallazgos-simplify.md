# Hallazgos de /simplify de «el equipo» — decididos por el coordinador

Dos revisores: reutilización y simplificación (RS), y eficiencia y altitud (EA,
con perfil del banco: lo nuevo suma ~60 ms de 4,5 s, así que no hay camino
caliente).

Nada de esto cambia reglas. El ancla nueva `7c24a8b4…` tiene que seguir **igual**
tras cada bloque. Si alguno la mueve, está mal hecho: se para y se mira.

## Se aplican

1. **Un solo destino de equipo** (EA7, RS5, RS9).
   - `hero/equipo.ts` exporta `destinoDeEquipo(hero, {veteran?, creature?})`, que
     devuelve un portador o el motivo. Sube allí el `Portador` de la IA.
   - También exporta `conEquipoDe(hero, portador, equipo) → Hero`.
   - Lo leen las acciones `equip`/`unequip`, sus dos *blockers*, la IA y el
     panel.
   - Fuera los cuatro `findIndex`, los `as Troop`/`as string` y la comprobación
     muerta de `HUECOS.includes` en `unequipBlocker`. `main.ts` valida el
     `data-slot` antes de mandarlo.
2. **La mochila se escribe en un sitio** (EA8, RS13): `aLaMochila(hero, ...ids)`.
   Lo usan los siete sitios de `game.ts` y `ascenderVeterano`, más un
   `idsPuestos(equipo)`.
3. **El botín se decide en un solo punto** (EA9).
   - Al cerrar la batalla, en `settleBattle`: si el bando que pierde era neutral
     (asaltante o guarnición neutral), el vencedor cobra.
   - Desaparecen las tres llamadas y la lectura de `owner` antes de
     `captureTown`.
   - **El ancla no debe moverse.** Si se mueve porque cambia el orden de las
     tiradas o de los hechos, el arreglo se queda a medias y se dice por qué.
4. **Una sola regla de cómo nace una hoja** (RS4): `conVeterania` parte de
   `previa ?? hojaNueva(state)`.
5. **Prosa y precios de un solo sitio** (RS1, RS2, RS3, EA10, EA11).
   - `cifrasDePieza(p)` vive en `hero/equipo.ts` y la leen el panel y
     `CATALOGO_DE_EQUIPO_EN_PROSA`.
   - Un formateador de precio en `core`, con nombres de recurso en español, lo
     leen `describirPrecio`, `precioView` y el cliente. `costLabel` se apoya en
     él o se queda solo para el cliente, pero sin tercera redacción.
   - `renderArmeria` deja de pintar solo el oro.
6. **El equipo con una sola forma en el payload** (RS7):
   `equipment: equipoView(...)` también en las filas de tropa.
7. **Una fila de tropa** (RS6, EA12).
   - `filaDeTropa(g, extras)` la comparten `renderArmy`, `renderTropaLicenciable`
     y `renderTropaEquipable`.
   - Una sola línea de equipo, con los «×» opcionales.
   - El ancla de paneles tiene que salir igual. Si cambia algún byte, se justifica.
8. **Lo que se vende** (EA13): un predicado `seVende(p)` que leen `buyBlocker` y
   `piezasDeArmeria`.
9. **Constantes derivadas** (EA4): `piezasDeArmeria()` y `piezasDeBotin()` pasan a
   constantes de módulo.
10. **`portadores` de la IA** (EA2): filtra antes de calcular, y saca el nivel sin
    fabricar cifras. Así cierra el `characterOf(undefined)` latente con un
    personaje en el ejército, y lo prueba con un test.
11. **El contrato dice lo que hace el núcleo** (EA14): se alinea la frase de
    `RESPONSE_FORMAT` con `quienRecibe`, que pide un individuo sin hoja. No se
    cambia la regla.
12. **Limpiezas**:
    - `EQUIPO_BASE` sin el `throw` duplicado de `validarEquipo` (RS10).
    - `cuantasLleva` en línea (RS11).
    - `selectedItem` sin setter público (RS12).
    - `heroeSuyo` se queda: devuelve un motivo en vez de lanzar (RS8).

## Se descartan, con motivo

- **EA1, la caché de la suma por equipo:** unos 20 ms en el banco. Se aplica solo
  si sale gratis al tocar `conEquipo`.
- **EA3, recalcular portadores por vuelta:** 34 ms y no es un camino caliente.
- **EA5, que la caché del espectador no acierte:** ya pasaba antes del ciclo.
- **EA6, que `unitPower` mire ataque y defensa:** cambia el juego. Va como issue,
  enlazado con `valorDePieza`, que se borra al hacerlo.
