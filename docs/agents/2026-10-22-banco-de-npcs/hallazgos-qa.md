# Hallazgos de QA — vuelta 1 (22-10-2026)

Veredicto del QA: apto con reservas (`qa.md`). Decisiones del coordinador:

## Se arreglan

- **H1 — el umbral de lo visible no mira la talla** (`tools/taller/validar.ts:67`: 2 % de píxeles visibles en
  toda la hoja). Lo visible crece con el cuadrado de la talla: a 1, 3,6-5,4 %; el goblin a 0,7, 2,12-2,34 %, y
  su d6 de perfil cayó debajo con un crudo bueno (21 goblins correctos). Una figura a 0,5, que el formato admite,
  fallaría siempre. Arreglo: el umbral de un encargo con talla escala con `talla²` (un hecho, un sitio: la talla
  sale del encargo o del banco, no se reescribe). Test con una hoja sintética a 0,5 y a 0,7 que hoy falla.
- **H2 — lo fallido no se reintenta y el estado miente.** «Se encadena sola» y «llegan después» piden que una
  figura no quede a medias para siempre sin intervención.
  - Reintento automático acotado: un encargo de NPC que falla se vuelve a encolar solo hasta un tope pequeño
    (p. ej. 2 reintentos, contados desde el disco/la cola, no en memoria); pasado el tope, queda fallido.
  - `pnpm npcs trabajar` (y por tanto `lanzarElTaller`) al arrancar encola lo que falte de toda figura pedida y
    sin pintar que no tenga nada pendiente ni en curso (lo derivado del disco, `encargosQueSiguen`), respetando
    el tope de reintentos: así un mundo nuevo o un reinicio rescatan lo que se quedó a medias.
  - El estado dice la verdad: `pnpm npcs estado`, `/__npcs` (si lo lleva) y el aviso de `vite build` distinguen
    «el taller la está pintando» (algo pendiente o en curso) de «se quedó a medias: falló <encargo> (motivo); se
    reintenta con `pnpm npcs encolar <id>`» (nada vivo). Derivado del disco y la cola, no escrito.
  - **Rescatar el goblin sin gastar cuota**: su crudo de d6 está en el disco (ver `qa.md` y el log
    `.cache/taller/npcs-semilla.log`, «la imagen está casi vacía tras el recorte»). Si el taller ya sabe
    reprocesar un crudo (o es barato añadir esa orden, p. ej. `pnpm npcs rehacer <id> --desde-crudo` o la que
    exista en `trabajador.ts`), recupera `goblin-chatarrero` d6 con el umbral nuevo y júntalo; si no, que quede
    para el reintento automático y dilo.
- **H3 — sin `/__npcs`, un mundo no arranca y culpa al mundo** con frases del motor. Arreglo: el mensaje dice que no
  se pudo cargar el banco de figuras (y por qué), no que el mundo nombre figuras inexistentes; y que no contradiga
  el aviso de consola. (Que el mundo no arranque sin banco es aceptable: sus figuras se validan contra él.)
- **H5 — errata en CLAUDE.md**: `derivacionDeLaCarpeta` vive en `tools/taller/juntar.ts`.

## No se arreglan (con motivo)

- **H4 — dos encargadas élficas idénticas una al lado de otra.** Es la regla escrita (especie > sexo > sin usar):
  con una sola figura élfica de mujer, sale repetida. Cambiar el orden daría a una mujer la figura de un hombre.
  Se resuelve cuando el banco crezca con los mundos; se anota en el cierre.

## Restricciones (las mismas)

El trabajador de la semilla (grupo 738121) sigue vivo con el código de antes: no se para, no se toca
`assets/npcs/` salvo el rescate del goblin por su orden, ni `tools/taller/cola/` a mano. Si el rescate del
goblin necesita escribir en `assets/npcs/goblin-chatarrero/`, hazlo por la orden del taller, no a mano. Nada de
pkill. No gastes cuota de Codex.

# Vuelta 2 (22-10-2026): se arreglan todos

Veredicto del QA: apto con reservas (`qa.md`, «Vuelta 2»). H1, H2, H3 y H5 verificados. Nuevos, todos del taller:

- **H6 — un encargo huérfano en `en-curso/` deja la figura a medias para siempre** y la frase dice «el taller la
  está pintando». Arreglo: al tomar un encargo, la ficha guarda el pid del trabajador (`Cola.tomar`); un encargo
  en `en-curso/` cuyo pid no vive (`process.kill(pid, 0)` → ESRCH) es huérfano: `rescatar` lo devuelve
  (`devolver('en-curso')`, que conserva sus fallos) y el estado lo dice («se quedó a medias: su trabajador murió»).
  Una ficha sin pid (la del trabajador viejo 738121, que corre con el código de antes) se trata como viva: no se
  le roba el encargo a un trabajador vivo. Reproducción: caso A de
  `/tmp/claude-1000/-home-al-code-heroes--claude-worktrees-affectionate-chaplygin-911d42/898c6c50-a30a-4a11-b7f3-be7621a5ce18/scratchpad/v2/adv.mts`.
- **H7 — dos `pnpm npcs trabajar` a la vez**: el temporal `.npc-<id>.json` de nombre fijo choca (ENOENT) y «ya está
  en pendiente/» tumba al segundo; `reintentarSiQueda` podría lanzar dentro del `catch` y tumbar el trabajador.
  Arreglo: temporal con el pid en el nombre; en `rescatar`, lo que otro ya encoló se salta, no lanza; el reintento
  dentro del `catch` no tumba el bucle (lo dice en el log). Caso B del mismo fichero.
- **H8 — `Cola.retomar` (`reprocesar`) borra `fallos`**: conservarlos (caso E).
- **Redacción**: una figura sin ninguna dirección y con un fallo no dice «está pedida y sin pintar: se quedó a
  medias»; que la frase no se contradiga.
