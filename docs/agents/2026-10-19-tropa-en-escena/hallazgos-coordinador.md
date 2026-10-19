# Hallazgos del coordinador al mirarla (791f03c0, 1024 px de ancho, elfos s28444)

Captura mental: las seis figuras ocupan una franja baja de ~1/8 del alto del lienzo, casi en fila,
con dos tercios de cielo encima. No se lee como «la tropa en semicírculo posando ante la cámara».

## Se arregla

- **E1. La escala de la escena encuadra al grupo, no la del combate.** El criterio 2 pedía «la misma
  escala de figura que en la batalla»: lo escribí yo, no el usuario, y da figuras diminutas. Se
  cambia (anotado en `requisitos.md`): la cámara de la escena encuadra el arco entero con margen, y
  las figuras tan grandes como quepan —objetivo: la del centro mide ~45-55 % del alto del lienzo—
  sin cortar a nadie por los lados ni por arriba, en 1440×900, 1280×720, 1024×768 y el móvil. Con
  pocas figuras no se agrandan sin tope: un tope de tamaño (p. ej. el que tendrían con 5).
- **E2. Que se lea como semicírculo.** Con más fondo entre los extremos y el héroe: los extremos
  claramente delante (más abajo y algo más grandes por la perspectiva) y el héroe al fondo en el
  centro, la curva visible. Sin solaparse (el test del arco sigue mandando, ajusta sus cotas).
- **E3. El suelo, no el cielo.** Con la cámara más cerca, que el horizonte del fondo del combate
  quede alto y el grupo sobre el suelo, no flotando sobre una banda de tierra al pie.

Verifícalo a ojo con capturas en los cuatro tamaños (y con 1, 3 y 7 figuras), y que la pasada
`tropa` de capturas lo vigile con una cota (alto de la figura del centro / alto del lienzo).
