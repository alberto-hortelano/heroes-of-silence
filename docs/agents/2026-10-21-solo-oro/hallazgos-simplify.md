# Hallazgos de /simplify y decisiones (21-10-2026, coordinador)

Cuatro revisores (reutilización, simplificación, eficiencia y altitud) sobre el diff sin commitear.
Están deduplicados y con la decisión ya tomada.

## 0. Antes que nada: borrar los guardias rojos de la lenta (decisión del usuario)

> «Elimínalos. No podemos tener tests que fuercen como es el juego. Estamos en pleno desarrollo»

Se borran los `it` que caen en `verify:lento`. No se buscan semillas nuevas ni se abren excepciones.

- `test/espigas.test.ts`: el guardia que cae en s17, s174 y s157 (este ya caía en HEAD).
- `test/puertas-sin-muesca.test.ts`: el que cae en s136 y s150.
- `test/recinto-en-la-escena.test.ts`: el que cae en s11 (`recintoSobreSenda`).
- `test/sendas-sobre-agua.test.ts`: el que cae en s51.
- `test/ciudad-puente.test.ts`: el que cae en s15 (la senda sobre el agua).
- `test/puentes.test.ts`, «cruces del diagnóstico». Ya caía en HEAD y es de la misma clase.

Reglas:
- Si un fichero se queda sin tests, se borra entero. Si su helper solo lo usaba ese test, también.
- Lo que el generador hace en el vestido para evitar esos defectos se queda: no es un test.
- `CLAUDE.md` deja de citar esos guardias como si vigilaran, donde lo haga (por ejemplo, «lo vigila
  `test/x.test.ts`» o las cifras «= 0 en 1-40» que dependían de ellos). Basta con quitar la
  referencia al test; la medida con su fecha puede quedarse como historia.

## A aplicar

1. **«No alcanza el oro», una sola frase.** Se exporta `oroBlocker(coste, oro)` (`town/town.ts`) y
   lo usan construir, reclutar, `buyBlocker` y `hireHero` (`state/game.ts:1485`, `:1632`). La
   rendición de `battle.ts` queda fuera, porque ya venía de antes.
2. **La regla del pueblo, en un sitio.**
   - En `renta.ts`: los pueblos de cada región, indexados una vez por `Estructura` (un `WeakMap`,
     como la caché de `estructura` de `regiones.ts:276`). Ese índice lo leen `rentaDeLaRegion` y
     `rentaDelDia`, y se va el filtro repetido.
   - `regionDe` usa `regionDeCasilla`, o la foto, en vez de su copia.
   - `total` se suma en los mismos bucles, sin el array intermedio.
   - Una frase de la regla (`REGLA_DEL_PUEBLO`, como `REGLA_DEL_ESCUDO`), que leen la prosa del
     agente (`agent.ts`, `serialize.ts`) y el cliente (`escenas/aventura.ts:375`). En el cliente, el
     pueblo dice además si te paga ya (`session.renta.pueblos`).
3. **El núcleo dice por qué una ciudad no cobra.**
   - `RentaDelDia.ciudades` lleva todas las ciudades propias, con `nombre`, `oro` y `unida: boolean`
     (las que no están unidas, con `oro: 0`). `pueblos` lleva `nombre`, como hoy.
   - El cliente deja de buscar el nombre en `state.towns` y de deducir «no está unida»: una sola
     lectura en `panels.ts`, donde hoy hay dos con dos textos.
   - Si el contrato del agente pasa también las ciudades cortadas, mejor.
4. **`Session.renta` memorizada por `version`**, como `cacheObjetos`. Al llegar arte se repinta la
   barra y hoy cada repintado rehace `territorio`.
5. **Código muerto y casos únicos.**
   - `GameConfig.oroDeSalida`: se borra y queda `oro: ECONOMIA.oroDeSalida`.
   - `puertas.ts`: de la maquinaria de rumbos y octantes se pasa a una tabla fija de rodeos y a
     `puertaDe` con la casilla de debajo. Hay que retocar `test/regiones.test.ts:1560`.
   - `generate.ts`:
     - `puertaEn`, `filaDeLaPuerta` y `masAlla` pasan a índices directos o a leer `puertaDe`, sin
       mover el azar;
     - `ladoA` se va;
     - los pueblos viajan de una sola forma (índices o `Uint8Array`, no las dos).
   - `buildings.ts`: `costeEscrito` → `entero(raw.cost, 'el coste en oro', quien, 0)`.
   - `notaDeLaRenta` deja de exportarse.
   - El guardia «no queda más recurso que el oro» (`invariantes.test.ts:1180`) reutiliza el listado
     y el grep del guardia de al lado (`ficherosDeMaquina` o un helper común). No debe lanzar otro
     `git ls-files`.
6. **Comentarios que hablan de lo que ya no existe.** Se reescriben a lo que es hoy, o se quitan.
   - Los que siguen hablando de minas o recursos:
     - `state/events.ts:118`, `:326`;
     - `state/game.ts:145`, `:970`, `:2158`;
     - `map/recinto.ts:563`;
     - `render/minimapa.ts:44`;
     - `escenario/superficie.ts:448`, `escenario/pintar.ts:131`, `escenario/colocar.ts:266`;
     - `escenario/catalogo.ts:234` y `desarrollo/esquema.ts:38` (`atlas/mina` como ejemplo);
     - `render/assets.ts:188`, `:326`;
     - `main.ts:272`, `:404`;
     - `tools/taller/mapa.ts:85`, `:321`.
   - Las lápidas «(21-10-2026, «solo oro»)» que anuncian lo que se quitó: ese porqué va en
     `docs/historia.md`, no en el código.

## Descartado a conciencia

- `PIEZAS_DEL_MAPA = ['cofre']`: es un cargador genérico de un caso, pero no estorba.
- Renombrar `#resources` y `renderTopbar().resources` a `oro`: es mecánico y toca `style.css` y
  `capturas.ts` sin ganar nada al jugar.
- Las semillas y casillas de tests de escena buscadas otra vez a mano (altitud 5): no se
  persiguen. Si alguno cae en el futuro porque el juego cambia, se borra (decisión del usuario,
  arriba).
- El consejo «un pueblo por región de fuera» derivado de una constante del generador: vale poco.
- El precio de conversión 250 / 500 como dato: la prosa del `_comment` basta. Las cifras ya se
  comprobaron.
- `tools/taller/efectos.ts` (`RECURSOS`, `encargoDeIconosDeRecursos`), `tools/taller/vista.ts` y
  `assets/iconos/recursos/`: al backlog (issue), junto al mercado, que ya no tiene sentido.

## Cómo se prueba (vale la política del usuario: ver requisitos.md, «Cómo se prueba»)

- Mientras se itera, solo el test del fichero que se toca.
- `pnpm verify`, una vez al final.
- Para comprobar que la lenta queda verde sin correrla entera: `HEROES_LENTO=1` y vitest solo sobre
  los ficheros de los guardias tocados y `invariantes.test.ts`.
- `pnpm banco`, solo si el cambio de `generate.ts` mueve el hash. No debería, porque el azar no se
  toca. Si lo mueve, se re-ancla y se dice.
- Nada más.
