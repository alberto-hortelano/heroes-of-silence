# QA: reclutar dentro de la morada (20-10-2026)

Validado contra la petición literal: «Al hacer click en el edificio se entra y se ven las tropas para
reclutar» y «Al hacer click en la figura se muestran en la derecha sus características con el botón
para reclutar». El diff está sin commitear en `claude/game-tuning-start-a0b1d8`; las vueltas de
simplify y arte están incluidas.

**Cómo se probó**
- `pnpm verify` una vez, sobre el diff tal cual: 152 ficheros, 3711 tests en verde y 14 saltados,
  98 s, exit 0.
- `pnpm dev` propio en :3247, en su propio grupo de procesos.
- Playwright sin pantalla, conducido por un servidor de órdenes en :3248, también en su grupo.
- Los dos se mataron por su grupo y se comprobó con `ss` que los puertos quedaban libres. El :3201
  del coordinador no se tocó.
- Todas las partidas empezaron en el menú o en la URL que deja el menú, y todo se pulsó con clics
  reales: en el lienzo, en el lateral y con el teclado.
- Las capturas clave están en `qa-capturas/`.

`banco`, `capturas` y `neutro` no los he repetido: no he tocado nada. Los resultados en verde están
en `implementacion.md`: banco `3406f518…`, `capturas` (escritorio, tropa, morada, sin-arte y móvil)
sin errores de consola, y `neutro HEAD` con 0 diferencias.

## Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 1 | Al llegar a la puerta (clic en el edificio o en la lista) se entra en `'morada'` y deja de verse la plaza | ✅ | **s42163, templarios, día 1**: clic en el Pueblo del lienzo (275,440), anda hasta él y entra: `data-escena="morada"`, `data-morada="templarios_pueblo:templario-escudo"` (`03-pueblo.png`). Desde la lista («Pueblo», «Monasterio»), entra al instante. En el móvil, tocando el edificio en el lienzo (`32-movil-morada.png`). Con los orkos (**s62321**), clic en el marcador «Pueblo» (`29-pueblo-orko.png`). |
| 2 | Una figura por unidad, de pie, a cámara, en fila, enteras, sin pisarse, no más grandes que en batalla | ✅ | Templarios: Pueblo 2, Monasterio 2, Forja 1 y Establos 1. Orkos: 4. En 1440×900, 800×600, 1920×1080 y 390×844, siempre enteras y sin pisarse. Las cotas de tamaño las mide `pnpm capturas` (81 px en el escritorio y 59 px en el móvil, igual que en batalla; lo cito, no lo repito). Arte propio en todas, nunca el Y Bot. |
| 3 | Pulsar la figura la elige; aro grueso en la elegida y fino bajo el puntero; al entrar, la primera | ✅ | Al pasar el ratón sobre el escudero, la barra dice «Escudero: pulsa para ver su ficha y reclutar.» y sale el aro fino (`04`). Al pulsarlo, `data-morada=…:templario-escudero` y el aro grueso pasa a él (`05`). Con los orkos se pulsó la 4.ª (`goblin-arquero`), y pulsar el suelo no cambia la elegida. Al volver a entrar, la elegida es otra vez la primera. Ver M4 sobre la diferencia entre los dos aros. |
| 4 | En el lateral derecho: nombre, nivel e índice, las seis cifras, rasgos, equipo de serie, disponibles (+crecimiento), precio, cupo, «+1» y «Todo (n)»; la lista como botones | ✅ | Ficha del guerrero con escudo: «Índice 295 · nivel 2», «8 · +8/semana», «170 oro cada uno», «Cada uno ocupa 3; el ejército lleva 18 de 20 y caben 0.», Vida 80 PV … Velocidad 3 casillas, y Espada, Brigantina y Escudo con sus pastillas. Monje: «Rasgos: Curar (40 PV), Bendecir». Hermano de carga: «carga», con la lanza de jinete y la barda. Los botones de la lista `morada-elegir` eligen igual que pulsar la figura (el penitente desde la lista). |
| 5 | Reclutar con las acciones de siempre; apagado con el motivo del núcleo escrito debajo; se actualiza sin salir | ✅ | Ver la secuencia de abajo. |
| 6 | La mejora de la morada, si le queda alguna, sigue a mano | ⚠️ | Ninguna morada de templarios ni de orkos tiene mejora, así que no se ha visto en la página. |
| 7 | Escape y «Volver a la base» devuelven a la base con quien anduvo quieto en la puerta; lo demás, como hoy | ✅ | Escape → `town`, `data-base="quieto"`, con el héroe en la puerta del Pueblo (`06-tras-escape.png`). «Volver a la base» deja lo mismo, en el escritorio y tocándolo en el móvil. Escape con el diálogo «Menú» abierto cierra solo el diálogo y sigue en `morada`; el segundo Escape vuelve a la base. Dos Escape: morada → base → mapa, uno por nivel. «Ampliar» sigue en el panel (se construyeron la Forja, el Monasterio, los Establos y la Casa consistorial), y la conversación con un vecino se abre igual. |
| 8 | Fondo: interior si existe; si no, el recorte en penumbra; si no, el campo. Lo que falte no rompe | ✅ | Interior real en los cuatro de templarios: Pueblo (`03`), Monasterio (`11`), Forja (`25`) y Establos (`26`), con las figuras sobre el suelo. Orkos: el campo de la tropa (`29`), sin peticiones ni errores. Interior que no llega (petición abortada a mano): el recorte del Pueblo sobre el campo, y la app solo avisa (`[assets] no ha cargado …`); el `Failed to load resource` lo provoca el aborto (`38-interior-roto.png`). |
| 9 | El taller sabe pedir el interior por Codex; piloto de los 4 templarios | ⚠️ | No lo he lanzado: no se gasta, y escribiría en la cola y en `fuentes/`. Los 4 `.webp` derivados están en `assets/bases/templarios/interiores/` y se ven en el juego. `encargo` y `publico` están en verde dentro de `verify` (`interiores.test.ts`, `publico.test.ts`). |
| 10 | Escritorio y móvil, con tema | ✅ | Templarios con su tema y orkos con el suyo, en 1440×900 y en 390×844 (DPR 2, táctil), más 800×600 y 1920×1080 cambiando el tamaño con la morada abierta. En el móvil, el motivo se lee bajo los botones (`33-movil-botones.png`). |
| 11 | Tests y la pasada de `capturas` | ✅ | `verify` en verde (arriba). `morada.test.ts`, `interiores.test.ts` y la pasada `morada` existen, y la pasada está en verde según `implementacion.md`. Que cada guardia muerde lo dice el ingeniero; no lo he vuelto a romper. |

**C5, paso a paso (s42163, templarios)**
1. Al entrar el día 1, «+1» y «Todo (0)» salen apagados, con «no cabe: el ejército ya lleva 6 de 6
   individuos» escrito debajo y sin `title`.
2. Licencio dos guerreros en la base y vuelvo a entrar: «caben 2», «Todo (2)».
3. Doble clic en «+1»: se reclutan 2 (oro 8000 → 7660), sin salir. Disponibles bajan de 8 a 6 y
   el cupo pasa a 18/20 con el motivo.
4. Licencio otra vez, entro pulsando el edificio y pulso «Todo (2)»: oro 7660 → 7320, disponibles
   a 4, apagado con su motivo.

**Los otros motivos**
- **Sin oro** (día 2, con el oro gastado en construir y reclutar): con 20 de oro y 2 monjes, sale
  «recursos insuficientes» (`18-sin-oro.png`).
- **Sin disponibles**: penitente, «solo hay 0 disponibles».
- **Con el alcaide** (el héroe fuera): «no cabe: la guarnición ocupa 18 de 20 de liderazgo y 1 ×
  Monje pide 3».
- **Orkos**: «no cabe: el ejército ocupa 20 de 20 de liderazgo y 1 × Orko con hacha y escudo
  pide 4».

## Hallazgos

Ninguno es bloqueante, y ninguno rompe lo pedido.

### Importante

**I1. La primera vez que se entra en una morada no se puede reclutar nada, y dentro no se puede hacer
sitio.**

Reproducción:
1. Menú → Nuevo juego → Templarios → Empezar (**s42163**). En orkos pasa lo mismo (**s62321**).
2. Pulsa el Pueblo.

Lo que se ve: el héroe sale con la tropa llena (6 de 6 individuos; 18/20 en templarios, 20/20 en
orkos) y todo sale apagado. El motivo dice que no cabe, pero no que se licencia en la base, y dentro
no hay «−1». Quien juega, que acaba de entrar a reclutar, no tiene nada que hacer dentro y tiene que
adivinar que debe salir y licenciar. No es un fallo de la implementación: licenciar dentro está en
el backlog del plan y el ejército de salida es del núcleo. Pero es la primera experiencia de la
feature, en las dos facciones probadas.

Se esperaba al menos una pista en el motivo o en el cupo («licencia en la base para hacer sitio») o
el «−1» dentro.

### Menores

**M1. «Hermano de carga (montado; antes Caballero montado)».** Así sale el nombre en la lista, en la
banda de la ficha (cortado: «HERMANO DE CARGA (…») y en la barra. Es una nota interna de
`data/unidades.json` a la vista de quien juega. Ahora se ve mucho más, porque la ficha la lleva de
título. Se reproduce en s42163: construir los Establos y entrar (`26-establos.png`).

**M2. El nombre largo se corta en la banda de la ficha.**
- En la Forja sale «GUERRERO CON ARMA …» (`25-forja.png`).
- La lista de encima sí lo dice entero, pero la banda es el título de la ficha.

**M3. Motivos del núcleo poco claros.**
- «recursos insuficientes» no dice cuánto falta (precio 100, oro 20).
- «solo hay 0 disponibles» suena raro.

Son frases de `recruitBlocker`, de antes de este cambio. La ficha las pone ahora en primer plano.

**M4. Cuesta distinguir el aro de la elegida del aro bajo el puntero.**
- Los dos son dorados, de 3 px y de 1,5 px.
- En la captura ampliada (`30-orko-arquero.png`) apenas se distinguen.
- Es el mismo código que en la tropa.

**M5. Un Escape mantenido sale de la morada y de la base de una vez.**
- El manejador de `main.ts` no mira `ev.repeat`.
- Lo comprobé con un `keydown` seguido de otro con `repeat: true`: morada → base → mapa.
- Una pulsación normal va bien. Pasa igual en la tropa y en la base.

**M6. Tras «+1» o «Todo», la barra de estado se queda vacía.**
- No se confirma nada: solo cambian los números y el oro.
- Antes decía «Pulsa una figura…».

**M7. En el móvil, «+1» y «Todo» quedan bajo el pliegue.**
- Hay que bajar el lateral más allá de la lista de unidades: 4 botones en orkos.
- La barra dice «Escape vuelve a la base», y en un móvil no hay Escape.

**M8. «Todo (0)» apagado se sigue leyendo como un botón principal.** Sale en granate en templarios y
en rojo oscuro en orkos, mientras que «+1» apagado sale gris. Como el motivo va debajo en letra
pequeña (0,8 em), la jerarquía visual invita a pulsar «Todo».

**Datos (fuera de alcance, solo constancia).** El «Orko con hacha y escudo» lleva de serie la
Espada, no un hacha, y la base de los orkos se llama «Valdeluz», como la de los templarios.

**De antes, no de este cambio.** Escape no cierra la conversación con un vecino:
1. `show()` pone el foco en «Seguir».
2. El manejador ignora las teclas que nacen dentro de un `dialog`.

El código no está en este diff, así que C7, que pide la gente «como hoy», se cumple.

## Pasada adversarial (sin fallos)

- **Doble clic en el edificio**: entra una vez.
- **Doble clic en una figura**: la elige, sin efectos raros.
- **Doble clic en «+1»**: dos reclutas. Es coherente: son dos clics al mismo botón y el segundo no
  cae en otro.
- **Escape a media marcha hacia una morada**: no entra en ella. Como no hay nada abierto en la base,
  la cierra al mapa, que es lo de siempre.
- **Lista de edificios**: lleva directo, sin andar, así que no hay marcha que interrumpir.
- **«T» dentro de la morada**: no abre la tropa (sigue en `morada`).
- **La tropa (T en el mapa)**, que comparte `EscenaDePie`, funciona entera:
  - abre `data-tropa="hero-0"`;
  - pulsar una figura la elige (`hero-0-puesto-0`) y la barra la nombra al pasar el ratón;
  - Escape vuelve al mapa;
  - sin errores en consola.
- **Cambiar el tamaño de la ventana con la morada abierta** (1440 → 800 → 1920): reencuadra sin
  romperse.
- **Consola**, en todo el recorrido: solo `[vite]`, `[assets] N imágenes…` y, en el móvil, el aviso
  de siempre del suelo del mapa (×1.65). El único error es el `Failed to load resource` del aborto
  provocado a mano.

## Workarounds usados

- **Licenciar en la base para tener cupo**: es el gesto real de quien juega, no un atajo, y es
  justo I1.
- **Contratar un segundo héroe, construir y reclutar hasta quedarse sin oro** el día 2, para ver «sin
  oro»: es juego real, solo que dirigido.
- **Abortar con `page.route` la petición del interior**, para ver el respaldo del recorte: simula un
  fichero que falta. Quien juega no lo tiene delante salvo que el índice y el disco se desalineen,
  que es lo que vigila `base-arte.test.ts`.
- **Un `keydown` sintético con `repeat: true`** para M5: simula mantener la tecla.

## No probado

- **C6**: ninguna morada de estas facciones tiene mejora.
- **C9**: el encargo a Codex no se lanza, para no gastar ni ensuciar la cola.
- **El turno del rival y la partida terminada**: en ninguno de los dos se puede estar en la base.
- **Con agente conectado**: no toca el servidor ni el contrato, así que tampoco `pnpm qa`.
- **Reclutar con éxito hacia la guarnición** (el alcaide con sitio): solo se ha visto el caso
  bloqueado. Los tests lo cubren.
- **`verify:lento`**: no se repite, por el presupuesto. Corre en CI.

## Veredicto

**Apto con reservas.** Lo que pide el usuario se cumple en el flujo real, en el escritorio y en el
móvil, con las dos facciones y con los cuatro interiores del piloto:
- pulsar el edificio entra en él;
- se ven las tropas;
- pulsar la figura enseña sus características a la derecha, con «+1» y «Todo», y su motivo cuando no
  se puede.

La reserva es I1: la primera visita no permite reclutar y no dice cómo hacer sitio. También conviene
limpiar M1, el nombre con la nota interna.

---

## Vuelta 2 (20-10-2026, tarde): la morada dentro de la base

Validado contra la petición literal de la vuelta 2:
- «que se muestre integrada en la base, que la imagen del exterior pase a ser la del interior»;
- «la imagen del exterior de la casa de reclutamiento está torcida»;
- «al hacer la pantalla más estrecha se encoge la parte donde se ve la base… que se ajuste a máxima
  altura».

Y contra lo que añadió después: «que los reclutas queden justo delante de la morada abierta… que el
personaje se quede delante, más lejos de lo que van a aparecer los reclutas». Todo con el arte ya
pintado: el retoque del pueblo y las cuatro `abierta-*`.

**Cómo se probó**
- `pnpm dev` propio en :3263 y Playwright sin pantalla, conducido por un servidor de órdenes en
  :3264. Los dos, en su propio grupo de procesos. Al acabar se mataron por su grupo, `ss` dio
  «libre» y no quedó ningún proceso en esos grupos. El :3201 no se tocó.
- La primera partida empieza en `/`: «Nuevo juego» → Templarios → «Siguiente» → «Empezar». Sale
  **s2118**, y la URL que deja el menú es `?seed=2118&faccion=templarios&heroe=caballero`. Las demás
  partidas abren esa URL, o la de orkos (`?seed=2118&faccion=orkos`, que da `heroe=orko`).
- Todo con clics reales, toques y teclado. No se usó estado sintético.
- `verify`, `verify:lento`, `banco` y `capturas` no se repiten: el coordinador los da en verde.
  Solo se corrieron, baratos y con el arte de verdad,
  `pnpm vitest run test/base-arte.test.ts test/morada.test.ts test/base-escala.test.ts`: 63 en verde
  y 1 saltado, 5 s.
- Las capturas, en `qa-capturas/v2-*.png`.

### Criterios

| # | Criterio | | Evidencia |
|---|---|---|---|
| 12 | Entrar no saca de la base: la cámara se acerca y centra, la versión abierta sustituye al exterior, una figura por unidad delante, y Escape y «Volver» devuelven la base | ✅ | **s2118, día 1, 1440×900.** Clic en el pueblo del lienzo (160, 420): anda y entra en 2,4 s, con `data-morada="templarios_pueblo:templario-escudo"`. Se ve la choza abierta, centrada y acercada: el hogar, los aperos y el estandarte, con la plaza alrededor (los pilares y el árbol a la izquierda, el ayuntamiento a la derecha; `v2-02`). Delante, los dos reclutas, y el aro en el primero. Al pulsar la segunda figura se elige el escudero (`templarios_pueblo:templario-escudero`); los botones del lateral eligen igual. Escape y «Volver a la base» devuelven `town` / `quieto` con el exterior cerrado (`10-tras-escape`). **Día 3:** el Monasterio (`v2-04`), la Forja (`v2-05`) y los Establos (`v2-06`, entrados andando por el lienzo) se abren igual. Ver I1: en una ventana de escritorio estrecha la casa no se llega a ver. |
| — | Añadido: los reclutas justo delante de la casa abierta y el personaje más adelante, más lejos que ellos | ✅ | En las cuatro moradas y en todos los anchos, los reclutas pisan el empedrado al pie de la casa abierta. El héroe espera de espaldas más cerca de la cámara, con la cabeza por debajo de los pies de la fila (`v2-02`, `v2-04`, `v2-07`). Ver M2 cuando solo hay una unidad. |
| 13 | Nunca fondo oscuro ni un cuadro flotante; alrededor, la plaza, sin fundido | ✅ | Ni en 1440, 1100 y 800, ni en el móvil, ni en el monasterio y los establos, que van en el tope de la base, a 390 y a 800 (`v2-11`): siempre plaza alrededor. En los orkos, el marcador del pueblo y su suelo, sin negro (`v2-08`). |
| 14 | La versión abierta de cada morada: mismo edificio y sitio, sin la pared de delante, la sala dentro a la escala del adulto, sin gente, recortada como una edición e indexada | ✅ | Las cuatro están en `indice.json` → `abiertas`, con el pie igual que su exterior: pueblo 624/624, forja 713/713, establos 704/710 y monasterio 799/803. Las cuatro van sin fachada, con su sala y sin gente pintada, y los reclutas de 160 px casan con bancos, yunque y pesebres. `base-arte.test.ts` está en verde con ellas. Ver M1: una costura en el pueblo abierto. |
| 15 | El exterior del pueblo, de frente, sin halo, en su sitio | ✅ | `templarios_pueblo.webp`, del retoque: la fachada va paralela al cuadro, sin pared lateral ni faldón en escorzo, y el zócalo va recto (`v2-01`). Ampliado ×2 sobre el árbol y el cielo, sin halo. Casa con el ayuntamiento: puertas de alto parecido, mismo empedrado y la misma luz. La puerta del JSON solo cambió en x (343 → 385, el centro de la puerta nueva); y sigue en 656. |
| 16a | La base no encoge en alto al estrechar (escritorio) | ✅ | El lienzo de la base y el del mapa, medidos en la misma partida: a 1440, 1080×756 y 1080×756; a 1100, 740×756 y 740×756; a 800, 440×720 y 440×720 (la barra de arriba pasa a dos líneas en los dos); a 770, 410×720 y 410×720. Dentro de la morada mide lo mismo, también al cambiar el tamaño con ella abierta (1440 → 1100 → 800 → 1440). |
| 16b | Lo mismo por debajo de 760 px y en el móvil | ❌ | Ver I2. A 750, 700 y 640 de ancho, la base mide 370 de alto y el mapa 548. En el móvil (390×844), 370 y 513. Estrechando de 770 a 750, la base pasa de 720 a 370 de alto; el mapa, de 720 a 548. |
| 17 | La tropa (T) no cambia | ✅ | T desde el mapa (1440): cinco figuras más el héroe, la ficha a la derecha, el lienzo de 1080×756 y sin errores (`v2-14`). A 700 y en el móvil, el lienzo es de 370, igual que la base. |

### Hallazgos

**I1. Importante: en una ventana de escritorio estrecha, la morada se acerca tanto que no se ve la
casa.**
- Pasos:
  1. Abre `?seed=2118&faccion=templarios&heroe=caballero` en una ventana de 700×900 a densidad 1 (un
     navegador de escritorio estrechado; cualquier ancho por debajo de 760).
  2. Pulsa «Pueblo» en la lista.
- Lo que sale: un lienzo de 370 de alto, a 168 px por paso (`pasoDeLaHoja(1)`, ×2,7 sobre los 62 de
  la base). Se ven el empedrado, las dos figuras con la cabeza casi en el borde de arriba y, como
  mucho, el pie del hogar (`v2-10`). En el monasterio, solo el pie de los bancos; en los establos,
  la parte baja de la cuadra (`v2-11`, los dos de la izquierda).
- Lo que esperaba quien juega: «que la imagen del exterior pase a ser la del interior», es decir,
  ver la casa abierta.
- En un móvil de verdad (densidad 2) no pasa: el acercamiento es ×1,36 y la choza se ve entera
  (`v2-07`). Es la combinación de densidad 1 y el marco de 370.

**I2. Importante, y lo decide el usuario: por debajo de 760 px, la base sigue encogiendo.**
- El plan guardó a propósito el marco de 380 del móvil, como la tropa y la batalla. Pero el
  usuario pidió: «Eso no pasa en el mapa y no debe pasar en la base. Que se ajuste a máxima
  altura».
- Al estrechar la ventana de 770 a 750 px:
  - el mapa baja de 720 a 548 de alto;
  - la base, de 720 a 370: una franja de la mitad que el mapa, con el lateral debajo (`v2-09`).
- En el móvil (390×844), el mapa mide 513 de alto y la base 370.
- En el escritorio de 760 px en adelante se cumple (16a).

**I3. Importante: un doble clic en un edificio de la lista lanza una excepción.**
- Pasos:
  1. s2118, día 1: construye el monasterio y vuelve a la base.
  2. Haz doble clic en «Monasterio» en la lista «Edificios».
- Lo que sale:
  - entra en la morada, pero la consola da `pageerror: no se puede entrar en la morada: no hay ninguna base abierta`;
  - la barra se queda con el texto de la base («Pulsa el suelo para andar… «Volver al mapa» (o
    Escape) sale.») dentro de la morada.
- Se repite dos de dos veces. Con un clic sencillo no pasa, ni con un doble clic en el edificio
  del lienzo.
- La causa probable:
  - el primer clic entra al instante (`irA` → `llegar` → `abrirLaMorada`);
  - el segundo da todavía en el botón `ir-a-sitio`;
  - `irA` (`escenas/castillo.ts:410`) no mira la escena: pone `AYUDA_DE_LA_BASE`, mueve al que
    anduvo y la cámara de la base, y `abrirLaMorada` lanza (`session.ts:1675`).
- Es de la misma familia que el N1 de la tropa (d00c2aa8). `pnpm capturas` saldría 1 con él, pero
  no lo ejercita.
- Lo que esperaba quien juega: que el segundo clic no haga nada.

**M1. Menor (arte): costura vertical a la derecha del pueblo abierto.**
- El recorte acaba recto en el borde de su región (x = 512 del tramo 3). Codex pintó ahí un trozo
  de empedrado y piedra claros, y al lado queda la sombra gris del hueco entre la choza y el
  ayuntamiento.
- Se ve como un rectángulo claro con el canto recto:
  - a 1440, en (805-830, 430-525) de la página;
  - a 1100 y en el móvil, a la derecha del escudero (`v2-12`).
- Con el exterior cerrado no se nota.

**M2. Menor: con una sola unidad, el héroe pisa el aro de la elegida.**
- Pasa en la forja y en los establos. El que anduvo espera en la x de la puerta, la misma que la
  única figura, y su casco tapa el borde de abajo del aro grueso. En los establos también tapa las
  patas del caballo (`v2-05`, `v2-06`, y `v2-11` a la derecha).
- Con dos o más unidades queda entre ellas y no estorba.
- El C12 decía «o se aparta si estorba».

**M3. Menor: el lateral abre bajado.**
- Al cambiar el ancho dentro de la morada, el panel queda bajado: a 1100 empieza en «Escudero», y no
  se ven ni el nombre de la morada ni la lista (`09-morada-resize-1100`).
- Al salir de la Forja con Escape, el panel de la base abre bajado hasta «Edificios», con «Forja»
  resaltado. Al volver del mapa a la base, igual (`30-base-reentrada`).
- Puede venir de antes de esta vuelta; no lo he comparado con HEAD.

**M4. Menor (ya en el riesgo §8 del plan): a densidad 1,5 la morada casi no se acerca.**
- A 1440×900 y densidad 1,5, la base ya va a la hoja: la morada solo centra la choza abierta, con
  figuras de unos 100 px CSS (`v2-13`).
- Se ve integrada, pero si el usuario mira con esa densidad, su «se ve muy pequeño» puede seguir en
  pie. Es su regla de la hoja: más grande, pixela.

### Workarounds usados

- **Ir al mapa y pasar el día** para levantar la forja y los establos (uno por día): es juego real.
- **`setViewportSize` a media partida** para estrechar la ventana: es el gesto de quien redimensiona.
- **Una ventana de 390×844 a densidad 1** (redimensionar la de escritorio) para ver el monasterio y
  los establos en la maqueta estrecha: es lo que ve quien estrecha el navegador, y por eso salió I1.
  Para el móvil de verdad usé otro contexto, a densidad 2 y con toques.

Ninguno mete estado falso ni se salta una pantalla.

### No probado

- **Con agente conectado**, y por eso tampoco `pnpm qa`: la vuelta no toca el servidor ni el contrato.
- **El turno del rival y la partida terminada**: en ninguno se está en la base.
- **Con el alcaide** (sin héroe dentro): en las partidas de hoy el héroe empieza en la base y no
  salió.
- **Las moradas de las otras tres facciones sin arte**: solo los orkos, como pedía el encargo.
- **La caché y la cola de Codex**: no se han lanzado.

### Veredicto

**Apto con reservas.** En el escritorio a partir de 760 px y en el móvil de verdad se cumple lo que
pide el usuario:
- la morada se abre dentro de la plaza, con la versión abierta de cada una de las cuatro templarias;
- los reclutas, delante de la casa, y el personaje, más adelante;
- el pueblo, de frente y sin halo;
- la base, a la altura del mapa al estrecharla.

Las reservas, por orden:
- I3, una excepción con un doble clic;
- I1, en una ventana de escritorio estrecha la casa no se ve;
- I2, por debajo de 760 px la base sigue encogiendo, a 370 frente a los 548 del mapa. Es una
  decisión del plan que choca con la frase literal del usuario: que lo decida él.

### Arreglado por el coordinador tras esta vuelta (20-10-2026)

- **I1:** la morada se acerca solo hasta donde cabe la sala de la casa abierta (`ALTO_DE_LA_SALA`, 2,2
  figuras sobre el pie de su puerta). Lo vigila `test/morada.test.ts` con una cifra propia; lo vi
  morder con la constante a 1 (20 en rojo).
- **I2:** la base, la tropa y la morada, al alto del mapa también en el móvil (390×844: 513); la
  batalla sigue en 380. `base-anchos` compara con el mapa también en el móvil.
- **I3:** `irA` no hace nada fuera de la base, y el segundo clic de un doble clic en la lista no
  cuenta (`ev.detail > 1`).
- **M2:** quien anduvo espera en el borde de delante de la franja; su cabeza no tapa ni el aro de
  la elegida (el test mira la cabeza contra el aro).
- **Se quedan:** M1 (la costura a la derecha del pueblo abierto), M3 (el lateral abre desplazado) y
  M4 (a densidad 1,5 la morada casi no se acerca).

Con lo arreglado: `pnpm verify` en verde (3576), `neutro.ts HEAD` con las 2 diferencias esperadas
(el alto de la base) y `CAPTURAS_SOLO=escritorio,tropa,morada,movil,base-anchos pnpm capturas` sale 0.
