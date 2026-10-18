# Hallazgos de /simplify (consolidados y decididos por el coordinador, 18-10-2026)

Cuatro revisores (reutilización, simplificación, eficiencia, altitud) sobre el diff sin commitear.
Deduplicados; cada uno con su decisión. **Ninguno cambia el comportamiento pedido**: si al aplicar
alguno ves que lo cambiaría, no lo apliques y dilo en implementacion.md.

## Se aplican

### Núcleo: la base

1. **Los extras, en una tabla y con sus dos caras juntas.** La lista de extras (ataque, defensa,
   armadura, velocidad, daño, rueda, oro) está escrita en seis sitios: `ExtrasDePieza`,
   `CAMPOS_DE_EXTRAS`, `problemasDePiezaConBase`, `piezaConBaseCanonica`, `sumarBase` (data.ts),
   `conBase` (arena.ts, resta a mano) y `conCampoDePieza` (main.ts). Escribe junto a `sumarBase` su
   inversa (`restarBase`/`diferenciaDe(final, base)`), las dos conducidas por la misma tabla de campos
   (daño y rueda por componente), y que `conBase` la llame. `sumarBase` no filtra los ceros de la rueda:
   lo hace solo la forma canónica.
2. **Una sola regla de base.** «No existe», «es ella misma», «no es de la arena», «otro hueco» y «da la
   vuelta» se deciden en `resolverEscritas`, `problemasDePiezaConBase`, `conBase`, `basesPosibles` y
   `piezaNueva`, con frases distintas. Un solo `baseBlocker` (o que `conBase`/`basesPosibles` construyan
   la escrita candidata y la juzgue `resolverBases`): `basesPosibles` filtra con él y `conBase` lanza
   con él. Las frases, una vez.
3. **Un solo juez de la pieza de la arena, que el cargador también pase.** Hoy la rueda y el tope de
   armadura los juzga `piezaDeArenaBlocker`, que entra como `juez` opcional porque `data.ts` no puede
   importar `rueda.ts`; el cargador de `data/equipo.json` y `piezasDeLaPelea` no lo pasan, así que una
   Maza con Fuerte −200 en el fichero carga sin fallar y revienta al abrir la arena (contra
   «fail-loud»: el error tiene que salir al cargar, nombrando el fichero). Saca las cifras base de la
   rueda y `ruedaDelArmaBlocker` a donde `problemasDePieza` las pueda leer sin ciclo (módulo sin
   dependencias, o la regla en `data.ts`), y quita el parámetro `juez`. «Una pieza del fichero no
   cambia de hueco» se dice una vez (hoy en `piezaDeArenaBlocker` y en `validarPiezaDeArena`).
4. **`piezasDeLaPelea` (battle.ts) lanza con el primer problema** de `resolverBases`, como
   `catalogoDeLaArena`, en vez de tirarlos y fallar luego en `piezaDe` con otro mensaje.
5. **«Cómo está escrita la pieza `id`» y «su base», del núcleo.** `eq.escritas.get(p.id) ?? p` es una
   rama muerta (paneles.ts ×2, `piezaNueva`) y `escritaDe` (main.ts) lanza; `baseDe` y
   `cadena.at(-2)` sacan la base de dos maneras. Exporta `escritaDe` (lanza) y la base desde
   `core/arena.ts`, junto a `cadenaDeBases`, y úsalas en los cuatro sitios.
6. **«De serie», una sola función.** El sello (`selloDePieza`, sobre la escrita) y el parte del retoque
   (arena.ts ~2184, sobre la resuelta contra `PIEZAS_DEL_CATALOGO`) lo deciden distinto. Una función.
7. **`juegoEscrito`**: ya no valida; quita la caché perezosa y deja una constante. `piezasDelEnlace`,
   `piezasDelMontaje` y `baseQueSeBorra` montan a mano el mapa «fichero + encima»: que lo saquen de
   `resolverBases` (`ResolucionDePiezas`), y si `escritas` solo devuelve lo que recibe, que sea quien
   lo monta. `baseQueSeBorra`: un `Set` de bases, no `find` en bucle.
8. **`piezaNueva`** hace tres cosas con `desde` + `como`: saca `piezaSobre(base, eq, sinValidar)` aparte.

### Núcleo: la rueda

9. **`ruedaDelIntercambio` una vez por golpe**: `melee` la calcula y `intercambio` la recalcula; pásala.
   `rueda` es `null` justo cuando `cruce` lo es: fuera los `rueda !== null` redundantes (battle.ts
   ~2637, ~2662, ~3620). La previsión que ya calculó `rueda` la reutiliza en `conElGolpe`.
10. **Un descriptor por tipo de la rueda** (unidad, cómo suma el arma, tope, cómo se dice): qué tipos
    van en % está en `factorDe`, `ruedaDelArmaBlocker` y `finalDe`/`UNIDAD_DE_LA_RUEDA`. `normalDicho`
    compara con `100` escrito a mano: con `RUEDA_SIN_ARMA.normal`. `porExitoCon`: sin los parámetros
    `tope` (siempre 0) y `hacia`.
11. **`esTipoDeGolpe` a `types.ts`** junto a `TIPOS_DE_GOLPE`, y úsala en `main.ts` (~1198, que hoy hace
    `includes` y un `as`) y en `problemasDeRueda` (data.ts).
12. **`mismasArmas`** compara la rueda tipo a tipo por `TIPOS_DE_GOLPE`, no con `JSON.stringify`.
13. **`armasPorUso`**: sal antes si no hay `distancia` ni `carga` y el arma no lleva `rueda`, sin
    reservar el array en el juego (`cifrasDelIndividuo`, `heroUnit`, el banco).

### Tipos y nombres

14. **`CifraDelHueco` (types.ts) y `DICHO_DE_LA_CIFRA` (data.ts)** duplican `CifraDePieza` y
    `NOMBRE_DE_CIFRA` (hero/equipo.ts). Muda `CIFRAS_DE_PIEZA`/`NOMBRE_DE_CIFRA` a `types.ts`, deriva
    `CifraDelHueco = Exclude<CifraDePieza, 'pv'>` y el dicho de los nombres; sin la traducción del daño
    a 1/0 (data.ts ~991). El tipo de vuelta de `camposDelHueco`, una `interface` usada en los dos sitios.
15. **Qué huecos son de cuerpo a cuerpo, del núcleo**: `SECCIONES_DE_EQUIPO` y
    `HUECO_DE_CUERPO_A_CUERPO` (paneles.ts) escriben `['arma', 'carga']`; deriva de
    `camposDelHueco(h).conRueda`. El filtro `calidad === 'arena'` del cliente (paneles.ts y main.ts), en
    un solo sitio.

### Cliente

16. **`tablaDeLaRueda` reutiliza `tablaDeCifras`** (paneles.ts ~900): `FilaDeCifra.final` admite texto y
    un `cambia` explícito; una sola convención de clases y accesibilidad (`cifrasCortadas` y el CSS
    siguen a una). `filasDePieza`: un registro por cifra y un `map` sobre `campos.cifras`, no cinco `if`.
17. **`conCampoDePieza` (main.ts)**: un solo switch tras elegir el destino (`extras` o la pieza;
    `precio-gold` ↔ `oro`).
18. **Repintado del editor**: `catalogoAGuardar()` con caché por la misma clave que `catalogo()`, y
    `soloEnLaPelea()` una vez por repintado (un `Map`), no una vez por tarjeta (hoy O(n²)).

### Tests y herramientas

19. **Guardia de los modos** (invariantes.test.ts ~440): que busque la escritura del modo
    (`golpe:\s*['"]rueda` o equivalente), no la palabra `'rueda'`; fuera las excepciones de `data.ts` y,
    si la cubre, la del `<dialog id="rueda">` de capturas. Míralo morder otra vez.
20. **`toHaveLength(3)` que cuenta líneas de `RUEDA_SIN_ARMA`** (~2085): usa el permiso por declaración
    que ya calcula; que Biome parta una línea no lo ponga rojo. Míralo morder.
21. **`sinComentarios` con caché por ruta**, como `leer`: el guardia nuevo pasa ~3 veces por todo `src`.
22. **`tools/qa/capturas.ts` ~4061**: la versión del enlace viejo, `VERSION_DEL_ENLACE − 1` importada,
    no `9` escrito a mano; ensancha el permiso para eso (no es un modo).
23. **`test/rueda-del-arma.test.ts`**: `pelea` con `montajeDePrueba` de helpers (añadiéndole `piezas` y
    `modos`); `golpes`/`dar` y los de `rueda.test.ts`, un helper en `helpers.ts`.

## Se descartan, a conciencia

- **Caché de `cifrasDeLaRuedaCon` en un `WeakMap`** (eficiencia 4): crea un objeto pequeño por golpe y
  sector; la arena pelea decenas de golpes. Con el punto 9 baja solo. No compensa otra caché.
- **Resolver solo lo que cambia en cada gesto** (eficiencia 6): ~31 piezas, < 1 ms por resolución.
- **`basesPosibles`/`cadenaDeBases` con `unshift` y la segunda llamada de paneles** (eficiencia 7): n de
  decenas, por gesto. Salvo que caiga de paso con el punto 5.
- **Nombrar el arma en la nota de la rueda**: backlog (ya decidido en el plan).

## Cómo cerrar

Tras aplicar: `pnpm verify`; `pnpm banco` (mismo hash); `npx tsx tools/qa/arena-ia.ts` (igual que
antes); `CAPTURAS_SOLO=equipo,armas,rueda-del-golpe,arena pnpm capturas`. Apunta en implementacion.md
(sección nueva) qué se aplicó, qué no y por qué.
