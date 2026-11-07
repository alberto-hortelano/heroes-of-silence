/**
 * `conRespiro` (`lento.ts`): los mismos elementos, en el mismo orden, y mientras tanto el bucle de
 * eventos da la vuelta. Si dejara de darla, nada se pondría rojo aquí: el CI saldría 1 con todo en
 * verde en cuanto un test de semillas pasara de 60 s («Timeout calling "onTaskUpdate"», como el
 * 07-11-2026). Este test es el que lo dice en el bucle rápido.
 */
import { describe, expect, it } from 'vitest';
import { conRespiro, rango } from './lento.js';

/** Tiene el hilo `ms` milisegundos sin soltarlo, como un mapa que se genera. */
function ocupar(ms: number): void {
  const fin = performance.now() + ms;
  while (performance.now() < fin);
}

describe('conRespiro', () => {
  it('da los mismos elementos en el mismo orden, y un `break` corta donde cortaba', async () => {
    const vistos: number[] = [];
    for await (const s of conRespiro(rango(1, 50))) vistos.push(s);
    expect(vistos).toEqual(rango(1, 50));
    const hastaElCuarto: number[] = [];
    for await (const s of conRespiro(rango(1, 50))) {
      if (s > 3) break;
      hastaElCuarto.push(s);
    }
    expect(hastaElCuarto).toEqual([1, 2, 3]);
  });

  it('suelta el hilo mientras se trabaja: un temporizador corre antes de que acabe el bucle', async () => {
    // 20 trozos de 50 ms: con un respiro en cuanto pasan 250 ms, el bucle da la vuelta al menos
    // cuatro veces (a los 250, 500, 750 y 950 ms como tarde) y el intervalo corre en cada una, salvo
    // quizá la primera si el test empezara en otra fase del bucle. Sin respiro no corre ni una hasta
    // que acaba el bucle.
    let vueltas = 0;
    const reloj = setInterval(() => vueltas++, 5);
    try {
      for await (const _ of conRespiro(rango(1, 20))) ocupar(50);
    } finally {
      clearInterval(reloj);
    }
    expect(vueltas).toBeGreaterThanOrEqual(2);
  });
});
