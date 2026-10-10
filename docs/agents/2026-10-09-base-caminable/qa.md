# QA — la base caminable (vuelta 3 cerrada, tras /simplify)

09-10-2026, 23:06-23:40. Árbol sin commitear de la rama `bases`. Juego real: `pnpm dev --port 3297 --strictPort`
(receta `set -m`, matado por su grupo; `ss` → «libre»), Playwright sin pantalla (Chromium headless), clics y
toques reales, semilla 12. Los scripts están en `.cache/qa-base/` (ignorado) y las capturas que cito, en
`capturas/qa-*.png`.

**No repetido, por instrucción** (en verde en la tanda de cierre de `implementacion.md` §Simplify, sin cambios
desde entonces): `pnpm verify:lento` (4404 en verde), `pnpm qa` (salida 0; 3 `town_voices` por 6
`adventure_turn` = 0,50), `pnpm banco` (`9fc436ed…`, «ancla: igual»), `vite build`, `pnpm capturas` (salida 0,
consola limpia). **Corrido aquí**: `pnpm verify` → 106 ficheros, 2622 en verde, 13 saltados, 31,6 s.

## Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| 1' Escenario lateral, sin casillas, scroll horizontal; delante la plaza y detrás los edificios con la puerta a la vista, recortados por arriba | ✅ | `qa-s0-base.png` (entrada), `qa-s2-02-extremo-izq.png` / `qa-s2-04-extremo-der.png`. Ancho 58 pasos y 12,1 a la vista a 1440×900 (lienzo 1080×588, paso 89,3 px). La cámara llega a 0 y a 45,90 (= 58 − 12,10). El gremio y el castillo se recortan por arriba (`qa-s4-05-gremio.png`). La curva se dio por perdida (vuelta 3) |
| 2' Sitio sin construir = relleno del panorama; construir pone el edificio encima | ✅ | T1 y T5 vacíos se leen como muro, casas y árboles, sin hueco (`qa-s2-02`, `qa-s2-04`). Castillo, armería, taberna, mercado, gremio y casa consistorial construidos con la base abierta aparecen al momento en su sitio (`qa-s1-03-castillo-construido.png`, `qa-s3-03-armeria.png`, `qa-s4-02-taberna.png`, `qa-s4-06-casa-consistorial.png`) |
| 3' Franja de 3,5 pasos; adulto igual que en combate; movimiento libre; clic fuera = punto más cercano; la cámara sigue con tope | ✅ con reserva | Clic en el cielo → anda hasta el borde de atrás (`s2-01`); esquina inferior izquierda del lienzo → el punto de abajo más cercano (`s2-03`); esquina superior derecha en el extremo → pegado al muro (`s2-05`). La cámara se para en sus topes. Escala: `pasoDeLaBase` = paso del combate y `test/base-escala` en verde. **Reserva**: la captura de comparación combate/base (`capturas/comparacion-*.png`, 15:07) es de la vuelta 2 (otro arte) y no se rehízo: ver H3 |
| 4' Las figuras siempre delante de los edificios | ✅ | Quien camina y los encargados se pintan sobre la puerta en todas las capturas (`qa-s1-02`, `qa-s3-03`, `qa-s4-02`) |
| 5 Ayuntamiento (o castillo) → su puerta y «Ampliar»: lista con coste o motivo de `buildBlocker`; construir lo hace aparecer | ✅ | El hover dice «Ayuntamiento: pulsa para ampliar la base.». El clic anda hasta la puerta y la marca pasa a `ampliar`. Lista 11 filas con coste y, en las moradas 3-6, «falta construir "Morada de nivel N"». Castillo: recursos 20/20/8000 → 0/0/3000 y aparece. Segundo intento el mismo día: «no se puede construir Casa consistorial: ya se ha construido hoy en este pueblo». Día 4: la casa consistorial sustituye al ayuntamiento y los ingresos pasan de 500 a 1000 |
| 6 Morada → reclutar («+1»/«Todo»); gremio, armería (comprar), mercado (#14); contratar héroe sin taberna; la muralla es cerca, no castillo | ✅ | Morada 1: «+1» y «Todo (0)», con la guarnición llena (20/20). El rechazo es la frase del núcleo y el oro no se mueve; el caso con sitio lo cubre `pnpm capturas`. Gremio: enseña 3 hechizos y la mejora. Armería con héroe: 3 artículos, «Comprar» 3500 → 2700 oro. Mercado: «aún no hace nada… (#14)». Contratar: botón en lo general el día 1 sin taberna, y funciona (quien camina pasa de alcaide a héroe, `s3-02`). La taberna lo repite. El fondo es tapia baja con pilares, no muralla almenada |
| 6b `town_voices` medido en `pnpm qa` | ✅ | Anotado en `implementacion.md`: 0,50 por `adventure_turn`, no «casi dobla» |
| 7 Encargado por edificio construido y vecinos; clic → a su lado, conversación con nombre, papel y línea | ✅ | «Pedro / capataz de los campesinos / «Labran de día y forman de tarde. No se quejan mucho.»» (`qa-s1-05-conversacion-encargado.png`). Cada edificio construido trae su encargado (castillo, armería, taberna, gremio). 4 vecinos en la disposición |
| 8 Narrador (`town_voices`, validación, fallo que no para, veredicto, espectador, respaldo) | ✅ (no re-ejercido) | `pnpm qa` en verde en la tanda de cierre; `test/voces`, `agent-contract`, `notas` y `espectador-paneles` en el `verify` de hoy. Sin agente: líneas de respaldo deterministas (la misma frase de Pedro en tres pasadas). No tenía ninguna sospecha concreta para volver a correr `pnpm qa` |
| 9 Arte propio del caballero revisado por el usuario; nigromante con marcadores | ✅ / ⚠️ | Caballero: «Lo veo bien» (requisitos, cierre del arte), 5 tramos y 20 recortes. **Marcadores**: probados en el navegador con el arte del caballero quitado (404 por ruta, `qa-s5-07-sin-arte-castillo.png`): suelo, bloques con nombre, golpe, «Ampliar», morada y conversación funcionan. **La disposición del nigromante en el navegador no se probó** (ver «No probado») |
| 10 Se juega entero sin arte y sin agente | ✅ | Todo lo anterior va sin agente (sesión local). Sin arte, la base se juega entera (`qa-s5-07`). La única salida en consola es el aviso esperado `[base] sin índice del arte de knight: HTTP 404` |
| 11 / 11' Órdenes y capturas (entrar, extremo, ampliar, morada, conversación, móvil, comparación) | ✅ con reserva | Las órdenes, en verde (arriba). Capturas del cierre en `capturas/simplify-*` y en el scratchpad de la tanda (`desktop-05d-castillo-ampliar` incluido). **Reserva**: la comparación combate/base es de la vuelta 2 (H3) |

## Hallazgos

### Bloqueantes
Ninguno.

### Importantes
- **H1. Llegar a una morada lejana cuesta varios clics y unos 10 s, sin atajo.** Con 58 pasos y 12 a la vista,
  un edificio lejano no se ve desde la entrada: no se puede pulsar y hay que ir pulsando el borde del lienzo.
  Medido con clics reales: de la entrada al ayuntamiento y luego a la armería (14 pasos), 3 clics y 10,6 s;
  de lvl6 (x 2,8) al ayuntamiento (x 29), 5 clics y 18 s. Reclutar en la morada 5 (x 54,8) o en la 4 (x 8,1)
  supone ese paseo cada semana, y lo general no tiene reclutamiento ni lista de edificios. Los 58 pasos los
  aceptó el usuario; la fricción de recorrerlos no estaba medida.
  - Pasos: semilla 12 → «Castillos: Valdeluz» → pulsar el borde izquierdo del lienzo cuatro veces → morada 4.
  - Quien juega esperaba poder ir a un edificio conocido sin cruzar la plaza a trozos.
- **H2. Al volver a entrar en la misma base, todo sigue como se dejó, aunque haya pasado un día.** Quien camina
  sigue donde estaba (no en la entrada) y lo que estaba abierto sigue abierto: marca `sitio:lvl1` con el panel
  de la morada, o `sitio:tavern` el día 2 tras dejarla abierta el día 1. La escena solo se reinicia si cambia
  la sesión o la base (`EscenaBase.base()`); «Volver al mapa» no cierra lo abierto.
  - Pasos: semilla 12 → abrir la base → pulsar la choza → «Volver al mapa» → «Fin de turno» → reabrir → el
    panel de la morada ya está puesto y nadie ha andado.
  - No rompe nada, pero contradice «empezar donde empieza quien juega» y el comentario de la propia escena
    («otra base empieza en su entrada»). Si se quiere así, que se decida; si no, cerrar lo abierto al salir.
- **H3. La captura de comparación combate/base (11') es de la vuelta 2.** `capturas/comparacion-combate-base-1440x900.png`
  y las dos `-x4` son de las 15:07, con la fachada suelta y el fondo otoñal de la vuelta 2. Nada las regenera
  (`pnpm capturas` no las hace). La escala probablemente se mantiene (mismo `pasoDeLaBase`, `base-escala` en
  verde), pero la evidencia que pide el criterio no es de la versión que se entrega.

### Menores
- **H4. La barra de estado de la base dice cosas del mapa.** Al abrir la base desde «Castillos», la barra sigue
  con «Haz clic en el mapa para mover a tu héroe; arrastra para mirar. Espacio pasa el turno.» (`qa-s0-base.png`,
  móvil `qa-s5m-02-ampliar.png`). Tras llegar a un sitio se queda el texto del hover («Ayuntamiento: pulsa para
  ampliar la base.»). Probablemente viene de antes; con la escena nueva confunde más.
- **H5. En el móvil, la conversación tapa a quien habla.** El cuadro de diálogo cubre el centro del lienzo de
  364×370 y deja ocultos a Pedro y al alcaide (`qa-s5m-03-conversacion.png`). En escritorio no pasa
  (`qa-s1-05`).
- **H6. En el móvil, al abrir la base desde la lista, la página no sube.** Se queda desplazada donde estaba el
  botón y medio lienzo queda bajo la cabecera fija (`qa-s5-02-movil-base.png`). Seguramente viene de antes.
- **H7. En los extremos, la figura se corta contra el marco** (x 0,4 y 57,6: la lanza y medio cuerpo fuera,
  `qa-s2-02-extremo-izq.png`).
- **H8. «(#14)» se le enseña a quien juega** en el panel del mercado: es un número de issue.
- **H9. Los botones «Construir» y «Todo (0)» parecen activos cuando no se puede.** Responden con el motivo del
  núcleo en la barra, como antes. Con «Hoy ya se ha construido» en la cabecera, las filas ya no dicen el motivo
  propio de cada una.
- **H10. Sin arte, una banda oscura vertical en el borde derecho del lienzo** (~x 1095 de 1100,
  `qa-s5-07-sin-arte-castillo.png`).

## Pasada adversarial (lo que no rompió)
- **Clics rápidos durante la marcha.** Edificio, luego tres puntos del suelo a 120 ms: manda el último y la marca
  acaba en `quieto`, sin errores.
- **Escape.** Con conversación: la cierra (marca `quieto`) y el segundo cierra la base. Con un panel: igual. A
  mitad de marcha: cierra la base de una vez (no hay nada abierto), y al reabrir la marcha termina y la marca
  llega a `quieto` en 300 ms.
- **Construir con la base abierta.** Los seis edificios aparecen sin salir de la base, y el encargado nuevo
  aparece con ellos.
- **Redimensionar con un panel abierto.** 900×700, 1920×1080, 700×900 y 2560×1440: la marca se conserva, nunca
  hay scroll horizontal de página, y a 2560 el clic en el ayuntamiento (calculado con el lienzo nuevo) abre
  «Ampliar» (`qa-s5-05-2560-ampliar.png`).
- **Móvil 390×844 (táctil, dpr 2).** Un toque en el ayuntamiento abre «Ampliar», un toque en un encargado abre la
  conversación, y no hay scroll horizontal (`scrollWidth` 390).
- **Consola.** Limpia en todas las pasadas con arte. Solo aparecen el aviso del suelo del mapa a 2560 (no es de
  este cambio) y el 404 provocado en la pasada sin arte.

## Workarounds usados
- **Arte del caballero quitado con `page.route` (404)** para ver los marcadores: es el estado real de una
  facción sin arte, sin preparar nada. **No afecta** a quien juega.
- **Base abierta desde la lista «Castillos» en lugar de pulsarla en el mapa**: es un camino real de la interfaz
  (y da el caso del alcaide). La entrada del héroe por el mapa la cubre `pnpm capturas` (`desktop-04`).
- **Píxeles calculados con `camaraQuieta`/`dondePulsarElSitio`**, como `pnpm capturas`. Si la cuenta divergiera
  del juego, el clic fallaría, así que no oculta nada.

## No probado
- **La disposición del nigromante en el navegador.** Solo es mía una base de caballero: las ciudades
  neutrales nigromantes están en la mitad del rival, y tomar su base termina la partida. No hay forma sin estado
  sintético. Lo cubren `base-disposicion` y `base-arte` (los dos en verde). Los marcadores, en sí, los vi con el
  caballero sin arte.
- **El turno del rival y la partida terminada con la base abierta**: no los ejercí.
- **Las voces narradas** (vienen del agente): no las vi en el espectador en esta pasada. Las cubren `pnpm qa` y
  `espectador-paneles` en la tanda de cierre.

## Veredicto
**Apto con reservas.** Lo pedido se cumple en el flujo real: escena integrada, ampliar, construir, moradas, PNJ,
jugable sin arte ni agente, y consola limpia. Las reservas son H1 (fricción de los 58 pasos), H2 (la base
reabre como se dejó) y H3 (la comparación de escala de 11' es de la vuelta 2); ninguna bloquea.
