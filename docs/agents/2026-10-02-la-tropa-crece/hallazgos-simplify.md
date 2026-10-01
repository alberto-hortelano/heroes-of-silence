# Hallazgos de /simplify del ciclo A de «la tropa crece» — decididos por el coordinador

Dos revisores: **R** (reutilización y simplificación) y **E/A** (eficiencia y
altitud, con perfiles de CPU).

Primero va todo lo que deja el ancla `3bb44c4b…` igual, comprobándolo después de
cada bloque. Solo el punto 9 puede moverla: en ese caso se re-ancla una vez
mirando la forma, y lo único que puede cambiar es ese campo.

## Se aplican — mismo ancla

1. **Una sola regla de «quién se va primero»** (R1, R2). `elQueSeIria(army,
   creatureId)` exportada de `troop.ts`. Sobre ella se montan `sinIndividuos`, la
   IA (`laMasBarata`) y el botón del panel, que compara el `veterania.id` que
   devuelve. Desaparecen las dos copias con `<=` y la `experienciaDe` duplicada.
2. **El nivel vive en la unidad** (A2, R3, R4). `UnitInfo` (o `CombatProfile`)
   lleva el nivel de quien recibe:
   - lo ponen los tres constructores (catálogo, personaje y héroe);
   - `cifrasVeteranas` le suma las subidas, igual que hace con ataque y defensa;
   - `herir` lee `objetivo.unit.nivel`;
   - fuera `BattleMember.nivel`, `HeroeDelBando.nivel`, `Entrada.nivel` y
     `BattleStack.nivel`, y los sitios que los rellenan;
   - `veteraniaDe` pasa a ser `nivelDeVeterania(origen)`, que da 1 al héroe y al
     novato, y los tres lectores la llaman una vez;
   - `resolveUnit` calcula el nivel una sola vez.
3. **Una sola función de núcleo para «cifras = catálogo + veteranía»** (A3). Las
   cifras de un stack de catálogo se sacan de su origen y su `body`. La usan
   `troopUnit`/`resolveUnit` y la rama `case 'catalogo'` de `adaptar.ts`, que
   vuelve a ser un `switch` plano. La regla deja de estar escrita tres veces.
   - El invariante del catálogo se ajusta para admitir **esa** función, sin abrir
     una excepción.
   - Hay que verlo morder.
4. **`armyPower` no fabrica `UnitInfo` por veterano** (E1). Suma `unitPower(base)`
   más el incremento por nivel sin crear objetos, o guarda las cifras por objeto
   `Veterania`. Se mide antes y después.
5. **El cable del espectador no manda lo que nadie lee** (E2, R7). En
   `stackAlCable` fuera `ganado`, `nivel` (con el punto 2 ya no existe) y
   `origen.oro`. La hoja de servicios (`batallas`, `bajas`, `heroes`) **se
   queda en el núcleo**, porque la usa el ciclo B, pero **no viaja**. Su docstring
   dice que es del ciclo B. Se mide el fotograma antes y después.
6. **`applyDamage` deja de exportarse** (A1). Los tres tests de `battle.test.ts`
   llaman a `herir(s, d, null)`. Así es el módulo quien impide nombrarla fuera, y
   **se borra el guardia de texto**: un guardia de texto menos.
7. **`count: 1` se comprueba una vez, al montar el bando** (A5). Los dos `throw`
   pasan a uno, en la puerta de entrada.
8. **Limpiezas**:
   - Fuera `habilidadesGanadas`, que no tiene consumidores (R8).
   - `esDelCatalogo`: se lleva al test o se corrige su docstring (R9).
   - `conVeterania` recibe un objeto de contexto y se llama una vez (R11).
   - `planCambio` usa `firme` y `saleFirme` (R12).
   - Se exporta `type TroopGroup` (R13).
   - `experienciaDeHeroe` interpola sin la rama nula (R14).
   - `enteroDesde` es una sola validación compartida por los tres sitios (R19).
   - `veterania.ts` usa `baseOf` y un callback opcional `alAcabarTurno` en
     `partidaDeSemilla`, en vez de copiar el bucle (R5).
   - `Hero.level` se deriva de `experience` (`nivelDe`): un hecho, un sitio. Fuera
     el `while` que los resincroniza y la pareja de constantes que tenía que
     cuadrar (R15). Si esto mueve el ancla, está mal.

## Puede mover el ancla — re-anclar una vez si lo hace

9. **`troop_level_up.hero` sale** (R10): nadie lo lee. `veterano` se queda, porque
   lo usa el ciclo B. Comprobar que el único cambio del volcado es ese campo.

## Se aplazan

- **Identidad desde el reclutamiento** (A6), con la hoja a cero dentro. Quitaría
  las ramas novato/veterano repartidas por cuatro módulos, pero engorda el volcado
  y mueve el ancla. Se decide en el ciclo B, que es quien necesita el id. Se
  anota en el plan del B.
- **Referencia a la ficha del catálogo en `BattleStack`** (A4). Hoy `origen.oro`
  existe porque el guardia del catálogo prohíbe leerlo desde un stack de batalla.
  Se queda como está.
