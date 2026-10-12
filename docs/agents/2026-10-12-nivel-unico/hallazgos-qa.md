# Hallazgos de QA para corregir (coordinador, 12-10-2026)

Fuente: `qa.md`. Veredicto: apto con reservas.

## Se corrigen

1. **Regresión: la pelea se cuelga con cifras enormes.**
   - `validarUnidadDeArena`, y la prueba de una criatura del catálogo en la arena, aceptan cifras con las que `poderBruto` lanza por no caber en un entero seguro.
   - Efectos:
     - la ficha deja de repintarse (`pageerror`, sin aviso en la barra);
     - «Luchar» se queda en «Contando la jugada…» para siempre.
   - Reproducción:
     - Guerrero con escudo contra Zombi, el bando izquierdo en IA, Vida = 1e15 y «Luchar»;
     - también A 25, D 20, Vida 10 000 000, Daño máx 1 000 000.
   - En HEAD no pasaba.
   - Lo esperado: el rechazo de siempre, «No se cambia: …», con el motivo. La regla de qué cifras se pueden medir vive en **un sitio** (junto a `poderBruto`, en `nivel.ts`), y la leen la validación de la arena y la de la prueba del catálogo. Por ejemplo, un tope por cifra derivado de lo que cabe, o «se puede medir» como función.
   - `data/creatures.json` cargado con cifras fuera de rango también debe fallar al cargar, diciendo cuál.
   - Un test que muerda: la unidad de la reproducción se rechaza con su mensaje y nunca llega a `herir`.
2. **Experiencia legible:** «176000 / 304000» pasa a «176 000 / 304 000», con separador de miles, en los paneles del cliente y del espectador. Si ya hay un formateador de números en el cliente, se reutiliza. El contrato del agente sigue con números.

## No se corrige

- **Índice ≥ 1000** («Índice 1298 · nivel 12»): es ⌊i/100⌋ y el nivel son las cifras de delante de las dos últimas. El catálogo no pasa del 7. Se queda así.
