# Hallazgos de /simplify y QA de «la arena» — decididos por el coordinador

QA: apto con reservas (`qa.md`). Simplify: `simplify-crudo.md` (30).
El ancla del banco tiene que seguir **igual** tras todo esto.

## QA: se corrigen
- **H1** lo que juega la IA antes del primer turno de la persona se anima: la
  sesión no juega en el constructor (o el animador observa desde el estado
  inicial). Con todo «IA» se ve la pelea entera. Test o tramo de capturas que lo
  vea morder.
- **H2** guardar nunca pierde unidades guardadas: (a) un borrador con una unidad
  inválida no se vacía entero — se cargan las válidas, la página dice cuáles no y
  por qué, y las inválidas se conservan tal cual al guardar (o se bloquea guardar
  hasta decidir); (b) las unidades sin hoja se conservan al guardar, como promete
  el comentario.
- **H3** el `_comment` del archivo dice la verdad: qué hay que añadir para pasar
  una unidad al catálogo (facción del juego, `growth`, `upgradesTo`, guarnición
  neutral y entrada de `experiencia.json`), no «copiar».
- **H4** el final por tope de rondas se anuncia como tal («por tiempo: más vida
  total»).
- Menores que se corrigen: M1, M2, M6 (la URL lleva la semilla), M7 (zombi y
  esqueleto con `undead` por defecto: los defaults de facción no muerta llevan
  `undead`), M9, M11, M12, M13, M14 (el endpoint rechaza campos desconocidos
  diciéndolo), M5 (aviso `beforeunload` si hay cambios sin guardar).
- Se quedan: M8 (nombres del taller, el rótulo largo se recorta con elipsis si es
  fácil), M10, M15 (móvil).

## Simplify: se aplican
1, 2, 3 (un bucle de IA con predicado; los dos lanzan igual al tope), 4 (la arena
reutiliza las piezas de `renderBattlePanel`, ayuda de carga incluida), 5, 6, 7, 9,
11 (una tabla `LADOS`, fuera `BANDO_DE`), 12, 13, 14, 15, 16 (validar la lista de
hojas al recibirla), 17 si queda limpio, 18, 19, 20, 21, 22, 23, 24, 26, 27, 29
(una sola tabla de cuerpos si no mueve el juego), 30.
Se descartan: 8, 10, 25, 28 salvo que salga gratis.
