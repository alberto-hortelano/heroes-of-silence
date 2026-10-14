# La rueda del golpe: combate por decisión (arena)

## Petición literal (13-10-2026)

> Quiero hacer mas entretenido el combate pasando del sistema aleatorio a uno de decision. Se me
> ocurre que haya varios tipos de ataque:
> - Normal: sin modificar
> - Ofensivo: +1 ataque
> - Defensivo: +1 defensa
> - Fuerte: +n daño
> - Rapido: -n daño, dos ataques
> - Romper guardia: -1 defensa al siguiente turno
> - Finta: -1 ataque al siguiente
>
> Al atacar eliges el tipo de ataque y el contrario elige la defensa, si son iguales minimo daño,
> si son contrarios maximo daño. En los dos puntos intermedios daño mayor y menor siguendo la
> siguiente rueda en la que normal esta en el centro y es neutro para todos:
>
> ```
>         rapido
> ofensivo      defensivo
>         normal
> r.guardia     finta
>         fuerte
> ```
>
> Por ejemplo si yo elijo rapido y tu eliges:
> rapido => minimo daño
> ofensivo o defensivo => algo mas de daño
> normal => daño medio
> r.guardia o finta => daño alto
> fuerte => maximo daño
>
> La forma visual seria con una rueda, eliges el ataque, el contrario elige el suyo y se ve el
> rsultado. Hazlo visualmente atractivo

## Decisiones del usuario (preguntadas en la conversación, 13-10-2026)

| Pregunta | Respuesta |
|---|---|
| Alcance | **Interruptor de la arena.** El juego, el agente MCP, el banco y el espectador no cambian; adoptarlo en el juego es otra tarea. |
| La elección del defensor | **Es su contraataque**: elige en la rueda; el golpe usa el cruce y, si contraataca, lo hace con ese tipo y sus efectos. |
| El cruce del contraataque | **Invertido**: si el defensor acierta (iguales → recibe el mínimo), devuelve el máximo, y al revés (`4 − punto`). |
| Azar | **El cruce sustituye la tirada**: daño fijo por el cruce. Suerte y moral siguen como hoy. |
| Disparos | **Solo cuerpo a cuerpo.** El disparo sigue con su tirada. |
| Las «n» | **Fuerte ×1,25; Rápido dos golpes a ×0,6 cada uno.** Cifras inventadas, en un JSON editable de `data/`. |
| Duración de Romper guardia y Finta | **Hasta que el afectado termine su próximo turno** (mecanismo nuevo: hoy los efectos caducan por rondas). |

## La regla

- Anillo, en el sentido de las agujas del reloj: rápido → defensivo → finta → fuerte → r.guardia →
  ofensivo. Normal, en el centro.
- Punto del cruce, de 0 a 4 (mínimo, bajo, medio, alto, máximo): la distancia en el anillo (0-3)
  da 0, 1, 3, 4; si cualquiera de los dos elige Normal, 2 (medio).
- Tirada fija: `min + ⌊(max − min) · punto / 4⌋` (enteros), en lugar de `rng.int(min, max)`.
- Contraataque: con el tipo que eligió el defensor y el punto `4 − punto`. Si no puede contraatacar,
  su elección solo cuenta para el cruce.
- Efectos: Ofensivo +1 ataque en el golpe que se da; Fuerte ×1,25; Rápido ×0,6 y dobla los golpes
  (con `double_attack`, cuatro); Defensivo +1 defensa a quien lo usa; Romper guardia −1 defensa y
  Finta −1 ataque a quien lo recibe. Defensivo, Romper guardia y Finta duran hasta que el afectado
  termine su próximo turno (no el turno en que nacen).
- La IA elige con una mezcla al azar (pesos en el JSON, con `createRng`) y **sin ver la elección del
  otro**: la elección es simultánea.

## Criterios de aceptación

1. En la arena hay un interruptor «Golpe: azar / rueda»; por defecto, azar. Va en el enlace de la
   pelea (`?golpe=rueda`) y un valor que no vale se rechaza diciendo cuáles valen.
2. Con rueda, al pulsar un enemigo cuerpo a cuerpo se abre una rueda con los seis tipos en anillo y
   Normal en el centro, en la disposición de la petición. Cada sector dice su nombre, su efecto (en
   tooltip) y la horquilla de daño de ese tipo contra ese objetivo.
3. Elegir un tipo (clic, teclas 1-7 o flechas + Intro) resuelve el golpe contra la elección del
   contrario; Escape cancela antes de elegir.
4. Si el contrario es la IA, elige sin ver la elección de quien ataca. Si la IA ataca a una unidad de
   la persona, la rueda se abre en modo defensa y la persona elige su respuesta (sin ver el golpe).
   Con los dos bandos «Yo», la segunda elección se hace sin ver la primera.
5. Se ve el resultado: los dos marcadores (color de cada bando) en sus sectores, el arco entre ellos,
   un medidor mínimo → máximo con el punto del golpe y, si lo hay, el del contraataque, y un rótulo
   («¡Máximo!», «Parado: mínimo»…). Después el lienzo anima el golpe con la cifra.
6. El daño cumple la tabla del ejemplo de la petición (rápido contra cada tipo) y la inversión del
   contraataque, comprobado por tests con cifras exactas.
7. Los efectos de cada tipo funcionan como dice «La regla», incluida la caducidad «hasta su próximo
   turno», con tests.
8. El parte de la batalla escribe el cruce («Fuerte contra Finta: alto; contraataque bajo»).
9. «Resolver sola» con rueda termina y es determinista por semilla.
10. El juego no cambia: `pnpm banco` sin cambio de hash; el agente no conoce `golpe`/`respuesta`;
    solo la arena enciende la rueda (guardias en `invariantes.test.ts`, vistos morder).
11. Visualmente atractivo, a escritorio y a móvil (capturas de las fases en `pnpm capturas`).

## Fuera de alcance

- Usarlo en la partida, el agente MCP o el espectador.
- Disparos, hechizos y poderes.
- Arte nuevo generado (los iconos se dibujan en SVG/CSS).
- Una IA que «lea» al rival o aprenda patrones.

## Preguntas abiertas (con suposición)

- ¿Defensivo del defensor sin contraataque da +1 defensa? **Suposición: no**; su elección solo
  cuenta para el cruce.
- Versión del `?montaje=`: **suposición**: `?golpe=` va aparte, como `?reglas=`, sin subir versión.

## Correcciones tras el plan (13-10-2026, del usuario)

- Romper guardia y Finta se cuelgan **al final del intercambio**: no tocan ni el golpe ni el
  contraataque de esa jugada. Defensivo sí cubre ya el contraataque.
- La rueda es un **diálogo modal** sobre el lienzo, con fondo transparente.
- «Resolver sola» no existe en la arena: se entiende como los dos bandos en IA, más `autoResolve`
  en el núcleo.

## Cambio tras probarlo (13-10-2026, del usuario)

> El combate se debe resolver despues de mover, ahora sale primero la rueda y luego se mueve

- Orden: **andar → elegir → golpe**, también para la respuesta cuando ataca la IA.
- Escape después de andar: **sí**. La unidad se queda donde llegó y sigue su turno, sin la carga.

El diseño está en `cambio-andar-antes.md`.
