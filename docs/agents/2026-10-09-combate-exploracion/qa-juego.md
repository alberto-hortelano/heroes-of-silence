# QA exploratoria del combate — 09-10-2026

Rama `combate`, `eab467d`. Sin implementación que validar: es una lista de hallazgos de quien juega.
`pnpm verify` en verde (2524 tests) antes de empezar. Consola del navegador: **ningún error ni aviso** en
toda la sesión (arena, partida y cuatro tamaños de ventana).

**Cómo se jugó.** Chromium sin pantalla (Playwright) con clics de ratón reales sobre el lienzo. El píxel de
cada clic sale de un espejo (`SesionDeArena`/`Session` con la misma semilla y la misma `EscenaBatalla`, como
`pnpm capturas`). El guion está en `guion/` (`navegador.ts` es un demonio que ejecuta fragmentos;
`arena.ts` y `juego.ts`, el espejo). Las capturas están en `capturas/`: `a*` son de la arena, `g*` de la
partida y `v*` de los tamaños de ventana.

**Batallas jugadas enteras a clics**
- Arena 1 (`?seed=11`): escudo y mandoble (yo) contra arquero goblin, arquero esqueleto y arquero elfo (IA). Gana la IA en la ronda 5.
- Arena 2 (`?seed=21`): espectro (vuela, sin contraataque, drena), jinete de plaga (carga) y caballero de la muerte (terror) contra hermano de carga, penitente (doble ataque y azote de no-muertos) y arquero de disparo doble. Gana la IA en la ronda 3.
- Arena 3 (`?seed=33`): un hermano de carga contra 7 esqueletos guerreros. Hay carga de 4 casillas y gana la IA en la ronda 3.
- Arena 4 (`?seed=5`): escudo contra orko de dos armas. Con ella se probaron la tecla Espacio y los fotogramas del golpe.
- Partida s29: emboscada de 6 momias reales el día 1. Se jugaron 4 rondas y luego «Resolver sola».
- Partida s2: guardia de 7 esqueletos. Se jugaron 4 rondas a clics y el último esqueleto con «Resolver sola».
- Partida s9: guardia de 6 campesinos. Victoria en 3 rondas, jugada entera a clics.
- Medida sin navegador: en las semillas 1-60, la primera guardia a la que se llega el día 1, entrada en el espejo (ver H1).

---

## Hallazgos, de lo que más afecta a quien juega a lo que menos

### H1 · Importante: la primera batalla de casi cualquier partida es una emboscada perdida de antemano
En **47 de 50 semillas** (1-60, las que tienen una guardia a la que se llega hoy), pulsar la guardia más
cercana el día 1 **no lleva a la guardia**: el camino cruza la región de unos asaltantes y la persona acaba
defendiéndose. Enfrente hay 6 momias reales (s20, s23, s25, s29, s43, s50, s54, s59), 4 vampiros (s5, s13,
s17, s28, s32, s36, s38, s49), espadachines o piqueros veteranos. Con lo que trae el héroe al empezar
(3 campesinos y 2 arqueros) eso no se gana. Solo s9, s41 y s58 llevan de verdad a la guardia.
- El aviso existe: al pasar el ratón la barra dice «Cuidado: el camino cruza la región de 6 asaltantes, que te emboscarían (en rojo)…» (`g02-s29-hover-guardia.png`).
- Pero **un solo clic** anda y empieza la batalla, sin pedir confirmación. Quien pulsa la guardia sin leer la barra entra en una pelea perdida en su primer gesto. Esperaba poder verla y confirmarla, como en HoMM2: primer clic la ruta, segundo clic la marcha.
- Reproducir: `pnpm dev`, `?seed=29`, pulsar la guardia de (9,5). Batalla contra 6 momias reales (`g03-s29-tras-clic.png`).
- Esto no es un fallo del combate, pero decide cómo se vive la primera batalla. Lo de la confirmación lo tendría que juzgar el crítico.

### H2 · Importante: no hay previsión de daño, y lo que dice la barra no sirve a quien juega
Al pasar el ratón por un enemigo, la barra dice solo «Golpearías desde (9,3).» (`a06-b1-apuntando.png`):
- **No dice cuánto daño haría** (ni un intervalo, ni «mata a 1»), ni cuánto devolvería el contraataque. HoMM2 y fheroes2 dan una horquilla de daño y las bajas que caerían; es lo que más se echa en falta para decidir. `expectedDamage` ya existe en el núcleo.
- Con un hechizo elegido pasa lo mismo: «Flecha mágica: elige sobre quién lanzarlo.» (`g04-hechizo-apuntando.png`) no dice el daño, y después hizo 20 a una momia real de 30.
- La coordenada «(9,3)» no le dice nada a la persona. Lo que la orienta es la casilla resaltada; la cifra sobra o debería ser otra cosa.
- El tirador a más de 5 casillas hace **la mitad de daño** (`damage.ts:121`), y nada lo avisa: ni la barra antes de disparar ni el parte después («Arquero → Guerrero… (disparo): 2 de daño»).

### H3 · Importante: elegir desde dónde golpear no sigue a la intuición, y pulsar el cuerpo mueve a la unidad
- Pulsar en el centro del cuerpo de un enemigo **adyacente** mueve a la unidad a otra casilla antes de golpear, en vez de golpear desde donde está. Pasó tres veces:
  - Arena s21: el jinete estaba en (10,4), pegado al hermano en (9,4), y se fue a (8,3).
  - Arena s33: el hermano estaba en (6,4) y se fue a (7,3), entre esqueletos.
  - Arena s11: el escudo estaba en (9,3) y se fue a (10,2).

  Quien juega espera que pulsar a un enemigo que tiene al lado sea golpear sin moverse.
- El mapa de píxel a casilla favorece la casilla de arriba. Medido sobre un esqueleto en (7,4) con la carga disponible desde (6,4), justo a su izquierda (`a26`/`a27`):
  - En **todo el cuerpo**, a cualquier altura y de un lado a otro, sale (6,3), la casilla de arriba a la izquierda.
  - La casilla de la carga (6,4) solo sale **en los pies** del lado izquierdo (10 % de abajo).
  - La de abajo, (6,5), solo sale en los pies del centro y la derecha.

  Para cargar hay que apuntar a los pies, y la ayuda no lo dice. Se reproduce en la arena con `?seed=33`: hermano de carga a la izquierda y 7 esqueletos guerreros a la derecha; se anda a (2,4), se pulsa «Terminar turno» y se pasa el ratón por el esqueleto A.
- La ayuda de la carga dice «elige la casilla del número («»3»)». Las comillas anidadas se leen como basura tipográfica.

### H4 · Importante: en la partida no se ven los PV de nada, y en «En el campo» la cifra es siempre «1»
- La ficha de la unidad activa en la partida enseña Bando, **Efectivos 1**, Moral/Suerte, Ronda y Maná (`g03`). No enseña Vida, Ataque/Defensa, Daño ni Velocidad. La arena sí los enseña (`a02`). La persona no sabe cuánta vida le queda a su unidad ni lo que pega.
- «En el campo» pone «1» en cada fila: la cifra es `count`, que siempre vale 1 desde que la tropa son individuos. La arena pone «15 PV · tú». **Confirma #119**: el `count` del motor asoma en la pantalla.
- No se puede pulsar a un enemigo para ver su ficha (HoMM2 la abre con el botón derecho). Su vida solo se intuye por la barrita.

### H5 · Importante: el despliegue apelotona las figuras y no se distingue quién es quién
- Cada bando sale en la columna 0 o 10, en filas seguidas (3, 4, 5…). Con 3 unidades las figuras ya se tapan (`a11-b2-inicio.png`: el caballo tapa al espectro y al caballero). Con 7 forman un bloque (`a25-b3-carga-naranja.png`, `g17-s9-fin.png`).
- Los nombres «Esqueleto guerrero A…G» y «Campesino A…F» solo están en la lista. Sobre el tablero no hay ninguna marca que diga cuál es la A.
- **Rótulos que se pisan**: cuando dos figuras se juntan, sus nombres se dibujan uno encima del otro y salen frases imposibles, como «Hermano de carga (montado; Esqueleto guerrero A ado)» (`a28-b3-tras-carga.png`). Lo mismo pasa con «Guerrero con escudo» encima de la cabeza del mandoble (`a04`).
- Las casillas naranjas de «se le puede cargar» y las rojizas de «atacable» se confunden en el bloque de enemigos (`a25`).

### H6 · Importante: «Resolver sola» acaba la batalla de golpe, sin un fotograma, y no hay pantalla de victoria
- Pulsado a mitad de batalla (s29 en la ronda 4, s2 en la ronda 4), en menos de 250 ms se vuelve al mapa sin ver el final (`g08`, `g09`, `g14`). **Confirma #103.**
- Lo que pasó solo se lee en la crónica, y en s29 incluía algo que la persona no eligió: «lanzas Flecha mágica… (mata 1)».
- La victoria jugada a clics (s9, `g17-s9-fin.png`) dice «Victoria / El campo es tuyo. / Maná 20/20» y el parte. No hay resumen de bajas por bando, ni experiencia ganada (el héroe pasó al nivel 6 en s29 y solo lo dice la crónica), ni botín. HoMM2 enseña todo eso al cerrar la batalla.

### H7 · Medio: en la arena, los arqueros ganan siempre a la infantería
Arena 1 (s11): dos infantes de 15 y 18 PV contra tres arqueros de 10 PV y 2-3 de daño. Los infantes tardan
2,5 rondas en cruzar las 10 columnas: el lento anda 3 casillas y el normal 4, y **en el campo no hay ni un
obstáculo**. Mientras tanto reciben 3 disparos por ronda, y el mandoble llega con 4 de 18 PV. Además:
- Los arqueros **no pagan nada por pelear cuerpo a cuerpo**. El goblin arquero devolvió 3 y golpeó 2 al escudo, lo mismo que dispara. En fheroes2 el tirador a mano pega la mitad.
- El tablero de batalla **no tiene obstáculos** (no hay nada en `core/battle`). En HoMM2 las rocas y los árboles cortan la línea de tiro y obligan a rodear. Así «vuela» solo sirve para saltar unidades.
- Parte de esto son cifras inventadas de la arena. Lo de los obstáculos y el castigo cuerpo a cuerpo son reglas, y quizá encajen con #200.

### H8 · Medio: la IA espera mucho, y la batalla se alarga en tiempo real
- En las 50 batallas del espejo (la IA contra la IA), el enemigo espera de media unas 4 veces por batalla, a menudo casi todo el bando en la ronda 1. Ejemplos: s29, 10 esperas en 3 rondas; s59, 10 en 3; s2, todo el bando «cede la iniciativa» en las rondas 1 y 2 (`g12`).
- La espera en sí no es tonta: el hermano de carga esperó y luego cargó 5 casillas. Pero el parte se llena de «Espera X… cede la iniciativa» y la pelea tarda.
- Medido a clics con animaciones: 7 esqueletos contra 5+héroe, 4 rondas, unos 80 s; 6 campesinos, 3 rondas, unos 44 s; la emboscada de s29, 4 rondas, unos 100 s.
- **No hay control de velocidad** de la animación. Mientras se cuenta una jugada, el panel entero se sustituye por «Ronda … / Contando la jugada…» (`a15`, `a28`): la ficha, la lista y el parte desaparecen y vuelven en cada jugada de la IA, y con 7 unidades enemigas el panel parpadea todo el rato.

### H9 · Medio: el parte de guerra se queda bajo el pliegue y no dice lo que más importa
- A 1440×900, con 5 unidades o más, el parte queda debajo de la lista «En el campo», fuera de la vista. Con 3+3 solo asoma su título (`a11`).
- Mientras se juega, la pantalla no enseña lo último que ha pasado. El parte es una caja con scroll propio que no siempre baja a la última línea (se leyó con `scrollTop` 25 de 215).
- Lo que no recoge el parte:
  - **los movimientos**: un turno enemigo que solo anda no deja rastro;
  - la mitad de daño por distancia (H2);
  - el +40 % de la carga solo aparece como «(carga de 4 hexes)», con el anglicismo «hexes».
- En la arena se mezclan dos vocabularios: la cabecera dice «Gana el bando derecho» y el parte dice «Fin: gana el defensor» y «Aniquilada… del atacante». En la partida, cuando ganas como atacante, el parte dice «Fin: gana el atacante» y no «ganas tú».

### H10 · Medio: tableta en vertical, el tablero se queda diminuto
A 820×1180 el lienzo mide unos 460 px de ancho. El tablero ocupa una franja de 30 % del alto con el cielo y el
suelo vacíos alrededor, y el rótulo del héroe se corta: «do de Valdeluz» (`v-820x1180-batalla.png`).
**Confirma #117.**
- A 390×844 (móvil) se juega y avisa «Enemigo (6) ▸» (`v-390x844`).
- A 1024×768 y a 1280×720 se ve bien, salvo el apelotonamiento de H5.

### H11 · Menor: los nombres de la arena dicen lo que no deberían, y se repiten
- «Hermano de carga (montado; antes Caballero montado)» es una nota de trabajo que llega a la ficha, al rótulo del tablero y a cada línea del parte. Lo mismo pasa con «Jinete de plaga (a caballo)» y «Jinete de hiena (goblin)».
- «Arquero» es a la vez el arquero elfo de la arena y el arquero caballero de la partida. En la arena 1 el parte decía «Arquero → …» al lado de «Goblin arquero» y «Esqueleto arquero».
- Las unidades de la arena salen por defecto con cuatro perfiles calcados (2-4/15 PV, 4-7/18 PV, 3-5/12 PV con 8 tiros, 5-9/30 PV con carga). Ninguna vuela por defecto, y el monje y la sacerdotisa no curan (la ficha lo dice: «no hay motor de habilidades»). Para probar rasgos hay que marcarlos a mano.

### H12 · Menor: el feedback del golpe es poco legible
- La cifra flotante «−2» sale, pero es pequeña y dura unos 300 ms (`a30-golpe-mosaico.png`).
- La munición del tirador («↑11») va en verde pálido sobre el suelo, al lado de la barra de vida. Cuesta leerla (`a02`).
- En la partida, las tropas sin arte propio son el maniquí Y Bot teñido (campesinos y arqueros naranjas o azules, momias y campesinos grises; `g03`, `g17`). Es lo esperado, pero hoy es casi todo lo que se ve en una batalla del mapa.
- El cadáver del arquero esqueleto no se veía al final de la arena 1 (`a09`), y el del goblin quedó bajo el escudo muerto. No lo comprobé más.

### H13 · Menor: la rendición vale 0 de oro con solo el héroe en pie
En la emboscada de s29, con todas las tropas muertas, el botón decía «Rendirse (0 oro)» (`g07`). Puede ser
la regla (se paga por la tropa que se salva), pero a quien juega le parece un error o un regalo. Debería
explicarse o no ofrecerse.

---

## Issues abiertas: qué se confirma

- **#103**: confirmada. «Resolver sola» cierra sin un fotograma (H6).
- **#117**: confirmada. Tableta vertical (H10).
- **#119**: confirmada en lo que se ve. «Efectivos 1» y la cifra «1» de cada fila (H4).
- **#201**: indicios. El héroe de s29 sube al nivel 6 y sigue con **Poder 1** (`g09`, panel del héroe). Con «duran el poder mágico del lanzador», Prisa y Lentitud durarían 1 ronda. No lancé ningún hechizo temporal: el héroe de partida solo trae Flecha mágica.
- **#200**: no lo verifiqué contra la fuente. El cuerpo a cuerpo sin castigo del tirador (H7) y la mitad de daño a más de 5 casillas son candidatos a divergencia que habría que mirar en fheroes2.
- **#116**: no probado. Para eso hace falta que el rival ataque en su turno, y no llegué.

## Lo que funciona y conviene no romper

- Mover en varios tramos y que «Le quedan N casillas» lo diga.
- «Defender» y «Esperar» se apagan tras moverse.
- La tecla Espacio termina el turno de la unidad.
- Los motivos de lo ilegal: «No puedes llegar a ese hexágono.» y «No alcanza a esa unidad cuerpo a cuerpo este turno.», también al pasar el ratón.
- Los rasgos funcionan:
  - «sin contraataque»: el espectro golpea sin que le devuelvan nada;
  - doble ataque: el penitente pega 9+11;
  - disparo doble;
  - carga con su +40 %;
  - la maldición, que se refresca sin acumularse.
- La IA juega con sentido. El hermano esperó y luego cargó, y los arqueros se ceban con el infante de menos defensa.
- Las semillas reproducen: espejo y página jugaron lo mismo en todas las batallas.

## Workarounds de la sesión

- **El espejo para saber dónde pulsar.** No afecta a quien juega: el clic es real y la acción que se aplica es la que la página lee en ese píxel.
- **Desincronizaciones al principio**, en s29 y s2: el guion pulsaba mientras la página aún contaba la jugada. La página ignora ese clic a propósito (aviso «Espera a que termine la jugada.») y el espejo lo aplicaba igual. Se corrigió esperando a que la ficha de la página nombrara a la unidad activa del espejo; desde s9 las dos partidas no se separaron. Las dos batallas afectadas se cerraron con «Resolver sola». **No es un fallo del juego.**
- **Una sospecha que no se reprodujo.** Una vez la barra dijo «Golpearías desde (5,4)» y el espejo calculó (4,4) en el mismo píxel (arena s21, el espectro contra el hermano). Al repetir pasando el ratón y pulsando en el mismo píxel, coincidieron siempre. Probablemente fue el doble movimiento del ratón del guion.

## No probado

- #116 (las defensas en el turno del rival).
- Hechizos temporales (Prisa y Lentitud) y la moral en acción: no salió ningún turno extra por moral alta en mis batallas, y la moral solo se vio como cifra «1».
- Asedio o batalla en un castillo.
- Batallas con el agente conectado (`pnpm qa`): no se tocó el servidor.
- La arena con todo en IA (lo cubre `pnpm capturas`).
