# Requisitos — R1: fronteras de suelo con ruido y mezcla por altura (parte de #169)

## Petición
- Mandato del usuario (07-10-2026): «Sigue cerrando issues y mejorando el mapa de forma autónoma hasta que esté bien».
- Pregunta del usuario: «Compara la arquitectura del mapa con cómo se hace en proyectos que sigan mapas por piezas como este; podríamos estar reinventando la rueda en algunos sitios». La comparación está en `comparacion.md`, en esta carpeta. Esta tarea es su **R1**.
- Encargos del usuario que siguen en pie: «evitar bordes rectos, que tenga un poco de giros».

## Contexto
- **Hoy:** la máscara de cada suelo es de 1 px por casilla y se desenfoca (`pintar.ts`, ~l.381), así que una frontera recta entre regiones sale como una recta difuminada. #169 lo describe: s13, nieve contra verde en x 21-22, y 4-16; s57, x 21.
- **El estándar:** umbralizar la máscara con ruido (fBm) y mezclar por altura con la luminancia de la textura (técnica de Mishkinis; AoE2 usa máscaras por dirección con prioridad entre suelos).
- **El suelo lo pinta un Worker**, `pintor-del-suelo.ts`, con la misma secuencia que `enEsteHilo`. Los tiempos y la memoria importan: el esbozo tarda ~2 s y el bueno ~5,5 s más, con 83 MB entre los dos.
- **En paralelo:** R3 (`regiones-con-ruido`) toca el generador del núcleo, no el cliente.

## Criterios de aceptación
1. **Ninguna frontera de suelo entre regiones se lee como una recta** a zoom medio ni al tope de alejar. Se ve un borde orgánico, con dientes y entrantes que siguen la textura. Capturas antes y después de s13 y s57 y de dos semillas más.
2. **El ruido es determinista por semilla:** el mismo en cliente, espectador y taller. Nada de `Math.random`.
3. **El tiempo del pintor y la memoria del Worker** no empeoran de forma apreciable. Se miden.
4. Sendas, agua y caras no cambian. Los contadores del informe siguen a 0.
5. Banco igual: es solo cliente.
