# Hallazgos de QA, vuelta 1 (01-11-2026)

QA dio «apto con reservas» (qa.md). Se arreglan los dos importantes; los menores quedan como están.

## Se arreglan

**H1. Con el tema elfos, la pastilla de «En el campo» no se ve en las filas que no son la
activa.** En `#lateral`, el verde y el rojo del tema (`#1f6a3a`, `#8f2a14`) están pensados para el
pergamino. Pero la fila no elegida es `#32675f` y lleva `opacity: 0.45`: contraste de 1,02 : 1 y
1,29 : 1. En los otros cuatro temas va de 4,7 a 9,4. Captura:
`.cache/qa-mod/cap4/qa-campo-1.png` (y `z.png`).
- Que la pastilla de esas filas contraste en los cinco temas y en el neutro, con un color o un
  fondo de pastilla que no dependa del fondo de la fila.
- Que lo vigile un test: `temas.test.ts` o uno nuevo que mida el contraste de las fichas que usa
  la pastilla sobre el fondo de la fila, en cada tema.
- Sin colores fijos fuera del `:root` (`invariantes.test.ts`).
- `tools/qa/neutro.ts` sin diferencias si el neutro no cambia.

**H2. La nota del sector contradice el número grande.** Desde /simplify el total va topado en la
vida de quien responde, pero la nota da el daño de cada golpe en bruto: «con Fuerte (medio), 43»
bajo un «…–28». En el 47 % de las parejas el daño pasa de la vida, y entonces muchos sectores
acaban en el mismo número.
- **En la nota**, el golpe que tumba se dice así: «con Fuerte (alto), te tumba», en vez del daño
  en bruto. El que no tumba sigue con su cifra. El dato sale del núcleo: `golpeQueViene` dice, por
  golpe, si tumba (con lo que se cobra: el total topado), y el cliente no compara cifras por su
  cuenta.
- **En el sector**, cuando el máximo es la vida de quien responde, se marca: una clase `te-tumba`
  en el sector y «puede tumbarte» en su etiqueta y en su nota. El número grande sigue siendo la
  horquilla topada.
- En la rueda de 7 a 375 px no se desborda nada.
- La previsión sigue casando con lo cobrado (el test de las 49 parejas). Añadir uno de «te tumba».

## Se quedan como están

- **H3, la suerte no entra en la previsión**: ya pasaba en la rueda del golpe, y el plan lo
  declara.
- **H4, «ataque -1» con guion y «velocidad»**: está en el backlog (issue aparte).
