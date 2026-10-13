# QA: editor de equipo en la arena (12-10-2026)

Árbol de trabajo de main, sin commitear. Probado con Playwright sin pantalla contra un vite propio
en el 3271 (PID 412252, matado por su grupo, `ss` dice que el 3271 quedó libre; el 3100, de otra
sesión, no se tocó). Los scripts están en el scratchpad (`qa2.mjs`…`qa10.mjs`). Las capturas, en
`capturas-qa/`. `data/borradores/` no existía al empezar; lo creó «Guardar» durante las pruebas y
lo he borrado al acabar (`ls`: no existe).

Siguiendo el criterio del usuario, no he comparado resultados de combate ni lanzado lotes de peleas:
he probado reglas y flujos.

## Comprobaciones

- `pnpm verify` (una vez): `Test Files 122 passed | 1 skipped (123)`, `Tests 3048 passed | 14 skipped (3062)`, salida 0.
- Cito de `implementacion.md` sin repetirlos: `verify:lento` 4899/4899 verde, banco `066767b4…`
  «igual», `pnpm qa` salida 0, `capturas` salida 0 sin errores de consola, `vite build` sin `equipo`
  en `__arena/`.
- Ninguna pasada dejó errores en la consola.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | La vista «Editar equipo» se abre con su botón y vuelve al montaje o a la pelea | ✅ | `ir-a-equipo` → `data-escena="equipo"`. «Volver al montaje», o «Volver a la pelea» si se entró desde ella (qa-01, qa-04) |
| 1 | Lista por hueco con sello del juego / cambiada / nueva; ficha con «Suma» y el rechazo | ✅ | qa-02 y qa-03: «Espada 2 NUEVA», «Brigantina CAMBIADA» (qa-04). El rechazo sale en la ficha (`.aviso-de-pieza`) y en la barra |
| 1 | 390 px sin scroll horizontal | ✅ (con reserva) | `scrollWidth 390 = clientWidth 390`, ningún elemento de `#equipo` sale por la derecha, con la lista y con la ficha abierta (qa-09, qa-10). Ver el hallazgo I2 |
| 2 | Editar una pieza del juego la guarda con el mismo id, enseña «Cambiada» y ofrece «Volver a la del juego» | ✅ | Espada con ataque 2 → 9: el sello pasa a «CAMBIADA» y salen los botones «Duplicar» y «Volver a la del juego». Al volver queda «DEL JUEGO» y solo «Duplicar». Si se pone a mano el valor del juego, la barra dice «vuelve a ser la del juego» |
| 2 | Nueva pieza o Duplicar crean una de calidad `arena` con id único `<base>-<n>`, y una nueva se borra | ✅ | `arma-2`; al duplicar, `arma-3` («Hoja QA 3») y `arma-4` («Hoja QA 4», sin sufijos encadenados). La copia de la Espada es `espada-2` y la de la Espada de armería sale «NUEVA · DE LA ARENA». «Borrar» la quita y la ficha queda vacía |
| 2 | Se editan todos los campos, y lo que no vale se rechaza con su motivo | ✅ (con reserva) | Rechazados: ataque −1, vacío (NaN) y 1,5; daño mínimo 50 con máximo 30; nombre en blanco; precio −5; escudo con velocidad 0 y +1. El campo vuelve al valor anterior. Los mensajes, en el hallazgo M1 |
| 2 | Cambiar el hueco a escudo en un paso | ✅ | Arma a dos manos con velocidad 0 → hueco «Escudo» se acepta en un paso: velocidad −1 y desaparece el campo de manos |
| 2 | Una pieza que lleva una unidad del borrador no deja de valer para ella; el rechazo dice quién la lleva | ✅ | Espada a dos manos: «La lleva «Guerrero con escudo»: Espada es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo». Borrar «Hoja QA» llevada: «quítasela antes de borrar». «Volver a la del juego» con un Bastón a una mano y el escudo puesto: rechazado con el mismo motivo |
| 3 | En una pieza del juego no se ofrece cambiar el hueco ni la calidad | ✅ | `[data-arena-pieza-campo="hueco"]` y `calidad` cuentan 0 en la Espada. En una nueva, el hueco es un desplegable y la calidad no se toca |
| 4 | «Guardar» escribe `data/borradores/equipo.json` | ✅ | «Guardado en data/borradores/unidades.json: 2 unidades. Y en data/borradores/equipo.json: 2 piezas.» En disco: `armadura-2` y `brigantina` (PV 90). Las unidades guardan `"armadura":"armadura-2"` |
| 4 | Conserva lo que no vale y lo dice | ✅ | Puse a mano `escudo-malo` (velocidad +2). Al cargar: «Piezas que no valen y se conservan tal cual al guardar: escudo-malo (…)». Al guardar: «3 piezas, y 1 que no vale, tal como estaba», y sigue en disco |
| 4 | El aviso de cambios sin guardar los cuenta | ✅ (con reserva) | «Sin guardar: 6 piezas y 1 unidad.» Al recargar con cambios salta el `beforeunload`. Ver el hallazgo M2 |
| 4 | Valida antes de escribir y escribe de forma atómica | ⚠️ | No lo he probado en el navegador: lo cubren los tests de `arena-equipo.test.ts` («no escribe ninguno si algo falla») |
| 5 | Las piezas nuevas salen en el desplegable de la ficha de unidad | ✅ | Desplegable del escudo: «Hoja QA · +3 ataque, −1 velocidad», «Hoja QA 3 …» |
| 5 | Cambia su combate y no su nivel | ✅ | Con la Espada a 9 de ataque, la tarjeta pasa de A 5 a A 12; la ficha sigue en «Índice 177 · nivel 1» y «En la pelea» dice A 12 |
| 5 | La regla de las dos manos vale igual al poner una pieza | ✅ | Mandoble con la «Hoja QA» en el hueco del escudo: «No se puede poner Mandoble a Guerrero con escudo: … no se puede llevar con Hoja QA» |
| 5 | Editar una pieza que llevan unidades abiertas cambia sus cifras | ✅ | Ver la fila de A 12. Tras recargar, el guerrero sigue con «Peto QA» (130 PV) |
| 5/PC | A media pelea cambia a todos los que llevan la pieza, de los dos bandos | ✅ | Brigantina, que lleva el esqueleto (der., IA): 170 → 280 PV. Peto QA, que lleva el guerrero (izq.): 130 → 230 PV (qa-05) |
| PC | La herida se conserva | ✅ | El guerrero recibe 44 de daño (86/130). Peto QA a 250 → 286/330; a 0 → 36/80. Los 44 siguen (qa-06) |
| PC | El cambio deja su línea en el parte | ✅ | «Cambian las cifras de Brigantina a media pelea (PV 90 → 200)», «… Peto QA … (PV 250 → 0)», «… Arco … (disparos 12 → 1)» |
| PC | Lo que deja de valer a media pelea se rechaza con su motivo | ✅ | Espada a dos manos y escudo a velocidad 0 se rechazan en plena pelea, y el parte no gana ninguna línea |
| PC | La IA no juega mientras editas | ✅ | En mi turno abro el editor, pulso Espacio en un campo y espero 4 s. Al volver sigue en ronda 1 y «Te toca», le quedan 3 casillas y el parte solo trae los dos retoques. El botón no aparece mientras el tablero cuenta una jugada (con IA contra IA no llega a salir, ver N1) |
| 6 | Un enlace v6 lleva las piezas que usa | ✅ | `v: 6`, `piezas: [armadura-2 Peto QA pv50, brigantina pv90]` |
| 6 | El enlace v6 se abre en limpio y no toca el borrador | ✅ | Aparté `data/borradores/` y abrí el enlace en un contexto nuevo. El guerrero «lleva Espada, Peto QA, Escudo» con 130 PV, el esqueleto 170 PV (Brigantina 90), y la vista enseña «Brigantina CAMBIADA» y «Peto QA NUEVA». `data/borradores` no se creó (qa-07). Con borrador en disco, `equipo.json` queda igual byte a byte tras abrir el enlace |
| 6/PC | Un enlace v5 se lee y avisa | ✅ | Es el mismo montaje con `v: 5` y sin `piezas`: «Es un enlace de antes de las piezas editables (versión 5): pelea con las piezas de esta arena, y «Peto QA», «Brigantina» están cambiadas; el resultado puede no coincidir…» (qa-08) |
| 7 | El juego no cambia | ✅ | `grep borradores` en `src/core` y `src/server`: nada. Hay un invariante en `invariantes.test.ts:1063` (verde en `verify`). El banco, citado |
| 8 | Verificación y documentación | ✅ | Lo de arriba e `implementacion.md`. La documentación no la he revisado línea a línea |

PC = punto de control del plan.

## Hallazgos

### Importantes

**I1. «Guardar» tras abrir un enlace v6 borra en silencio una pieza que tenías guardada.** Es la
desviación que el ingeniero pide revisar, y sí sorprende a quien juega.
Pasos (qa6.mjs, punto 4):
1. En `data/borradores/equipo.json` está la Brigantina cambiada (PV 90).
2. Alguien copia un enlace v6 cuya pelea lleva la Brigantina del juego (70). El enlace no la incluye.
3. Al abrirlo, la barra dice: «Las piezas «Brigantina» son las del enlace: pelean aquí sin tocar las
   tuyas, y «Guardar» las guarda.» El esqueleto pelea con 150 PV.
4. En «Editar equipo», la Brigantina sale como «DEL JUEGO»: nada dice que hay una tuya debajo, y no
   hay botón para recuperarla.
5. Al pulsar «Guardar» (por ejemplo, para guardar una unidad), el disco pasa de
   `[armadura-2, brigantina:pv90]` a `[armadura-2]`. La Brigantina de 90 se pierde sin aviso.

Qué esperaba quien juega: «sin tocar las tuyas» y que «Guardar» guarde lo suyo. No espera que un
enlace ajeno sobrescriba, y menos que borre, su borrador. Lo mismo pasa con una pieza que el enlace
trae cambiada: la del enlace sustituye a la tuya al guardar. Lo que pide quien juega es que «Guardar»
no escriba la capa del enlace, o que la barra y la vista digan claramente que guardar sustituye tus
piezas y nombren cuáles. La justificación del ingeniero (las unidades del enlace entran en el
borrador de unidades y sin sus piezas no validarían) solo vale para las piezas **nuevas** que traen
esas unidades. No vale para una pieza del juego vuelta a su valor, que es justo el caso que borra.

**I2. A 390 px, elegir una pieza no enseña su ficha.** La ficha queda debajo de toda la lista: tras
pulsar «Mandoble» empieza en y = 1666 y la pantalla mide 844. Tras «+ Nueva pieza», en y = 927. No
hay scroll horizontal, que es lo que pide el criterio 1, pero quien juega pulsa una pieza y no ve que
pase nada (salvo el marco), y tiene que bajar unos 800 px para cambiarla (qa-12). Pasos: abrir
`/arena/` a 390×844, «Editar equipo», pulsar cualquier pieza.

### Menores

**M1. Mensajes con la tripa a la vista.**
- El precio negativo dice «cuesta -5 de gold»: sale la clave en inglés y no «oro».
- El nombre vacío dice «No se cambia: La pieza no trae nombre como texto.», que no dice qué hacer.
- Un campo vacío dice «tiene que ser un entero ≥ 0 y es NaN».

**M2. «Sin guardar» cuenta piezas tocadas, no piezas distintas de lo guardado.** Hice esto:
1. Cambiar la Espada y devolverla a la del juego.
2. Crear «Hoja QA 4» y borrarla.

Con eso el aviso dice «6 piezas» cuando en neto son 4, y el `beforeunload` saltaría aunque no hubiera
nada distinto en disco.

**M3. Dos piezas pueden llamarse igual.** Una copia renombrada a «Espada» se acepta. Desde ahí, el
desplegable de la unidad y la tarjeta («lleva Espada») no distinguen la nueva de la del juego.

**M4. Al entrar en «Editar equipo» en plena pelea, la barra queda vacía.** El texto que prepara el
código («En plena pelea: lo que cambies vale ya para todos… La IA espera a que vuelvas.») no se ve
(qa-04). La regla sí está al pie de la ficha.

**M5. Al cambiar un escudo nuevo a arma, conserva la velocidad −1.** Es coherente con «el hueco rehace
solo lo que exige», pero quien juega puede no notar que su arma resta velocidad.

**M6. Un enlace v6 abierto sin borrador da una barra contradictoria.** Dice «Las cifras de … son las
del enlace» y a la vez «Sin borrador guardado todavía: las unidades salen con cifras por defecto,
inventadas». Probablemente venga de antes de este ciclo.

### Nota

**N1.** Con los dos bandos en IA, el panel dice «Contando la jugada…» hasta el final y el botón
«Editar equipo» nunca sale. Es el diseño de antes (la pelea entera se resuelve en el estado), no una
regresión. En la práctica, editar a media pelea solo se puede con un bando propio.

## Workarounds usados

- **Abrir el enlace «en limpio» apartando `data/borradores/`** (renombrado al scratchpad y devuelto).
  Simula otra máquina sin borrador, que es lo que pide el criterio. No afecta a quien juega.
- **Un v5 fabricado** cambiando `v` a 5 y quitando `piezas` del JSON del v6, como hace el ingeniero.
  Es el formato real de un v5 con cuerpo y equipo, así que vale.
- **Una pieza mala escrita a mano en `equipo.json`** para probar que se conserva. Es justo el caso
  que el criterio describe.
- **Seleccionar las piezas por `data-pieza`** y no por texto («Espada» casaba con «Espada de
  armería»). Es solo del script.

## No probado

- La escritura atómica en el navegador y el `equipo.json` ilegible: los cubren los tests.
- Un héroe con la Espada de armería cambiada a media pelea: lo cubren los tests (T7).
- El aspecto de la vista de equipo con muchas piezas nuevas (más de 10 por hueco).

## Veredicto

**Apto con reservas.** Todos los criterios se cumplen en el flujo real. La reserva es **I1**: tal como
está, un enlace v6 abierto seguido de «Guardar» puede borrar sin aviso una pieza que tenías guardada,
y la barra promete lo contrario («sin tocar las tuyas»). La decisión sobre esa capa es del usuario.
**I2** (390 px) es de experiencia y no rompe el criterio literal.

## Re-verificación (vuelta de QA, 12-10-2026)

Solo los puntos de «Se corrigen» de `hallazgos-qa.md`. Playwright sin pantalla contra un vite propio
(`npx vite --port 3292 --strictPort`, su propio grupo, matado por el grupo; `ss`: «3292 libre»; el
3100 de otra sesión no se tocó). `data/borradores/` no existía y no existe al acabar. No repetí
`verify`, `verify:lento`, `banco` ni `capturas`: los cita `implementacion.md` («Vuelta de QA»,
verify 3050 passed, lento 4901 passed, banco `066767b4…af995` igual, capturas sin errores en consola).
Scripts en el scratchpad (`rever/a.mjs`, más `resto`, `m4`, `m6` del ingeniero apuntados al 3292).

| Punto | Estado | Evidencia |
|---|---|---|
| I1: tu pieza sobrevive a «Guardar» tras abrir un v6 | ✅ | Brigantina a +90 PV guardada; enlace v6 hecho con la del juego (templario-escudo contra esqueleto-guerrero, semilla 7). Abrirlo y pulsar «Guardar» **dos veces**: disco `brigantina:pv90` las dos; `unidades.json` con las 2 unidades del enlace. Barra: «No se guardan las del enlace «Brigantina»: se quedan las de esta arena, y las unidades guardadas pelearán con ellas.» Tras guardar, la ficha aún dice «En esta pelea va la del enlace»; al recargar sin enlace, +90 PV y sin el aviso. 0 errores en consola. |
| I1: la comprobación nueva bloquea guardar | ✅ provocada | Tu Espada a dos manos guardada; enlace v6 con el templario (Espada del juego + Escudo). Abrirlo y «Guardar»: «No se ha guardado: con tus piezas en vez de las del enlace, la lleva «Guerrero con escudo»: Espada es un arma a dos manos y no se puede llevar con Escudo: quita antes el escudo.» `mtime` de `equipo.json` y `unidades.json` idéntico antes y después: no se escribe nada. Salida: devolver la Espada a una mano en «Editar equipo» y guardar → «Guardado … 2 unidades». |
| I2: a 390 px, elegir lleva a la ficha | ✅ | Tras «Mandoble» y tras «+ Nueva pieza» de escudo, la ficha empieza en y = 77 de 844; `scrollX` 0. A 1440 px, `scrollY` 0 → 0. |
| M1: mensajes para la persona | ✅ | «cuesta -5 de oro: tiene que ser un entero ≥ 0», «ataque tiene que ser un entero ≥ 0 y no es un número», «La pieza no tiene nombre: escribe uno». |
| M2: «Sin guardar» cuenta diferencias | ✅ | Ir y volver: nada; con una nueva: «Sin guardar: 1 pieza.» |
| M3: dos piezas no se llaman igual | ✅ | La copia nace «Espada 2»; renombrarla a «Espada» o la Espada a «Brigantina» (otro hueco): «Ya hay una pieza que se llama «…»: ponle otro nombre…». Renombrar la propia Espada a «ESPADA» entra (es la misma pieza). |
| M4: la barra en plena pelea | ✅ | Al entrar y tras elegir: «En plena pelea: lo que cambies vale ya para todos los que la llevan, de los dos bandos. La IA espera a que vuelvas.» |
| M5: escudo → otro hueco | ✅ | Escudo nuevo pasado a arma: velocidad 0. |
| M6: v6 sin borrador, una sola frase | ✅ | «… Sin borrador guardado todavía (data/borradores/unidades.json): «Guardar» lo crea.» Sin contradicción. |

### Hallazgos de esta vuelta

- **Menor.** El mensaje del bloqueo propone «quita antes el escudo», pero la salida natural en ese caso
  es la contraria (volver tu arma a una mano, o no guardar esa unidad): quitarle el escudo cambiaría la
  unidad del enlace. Se entiende y no deja a nadie sin salida.
- **Menor (no probado en el navegador).** Una pieza nueva del enlace con el mismo id o el mismo nombre
  que una tuya: por código, el id choca y se queda la tuya (lo anuncia «No se guardan las del enlace…»);
  el nombre repetido lo pararía la comprobación nueva con «con tus piezas en vez de las del enlace, ya
  hay una pieza que se llama…», que no explica bien de dónde viene.

### Veredicto final

**Apto.** I1 (la reserva de la vuelta anterior) está corregido y la comprobación nueva bloquea sin
escribir nada; I2 y M1-M6 se cumplen en el flujo real, sin errores en consola.
