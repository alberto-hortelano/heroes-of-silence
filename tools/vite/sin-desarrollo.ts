import type { Plugin } from 'vite';

/**
 * Que nada de las herramientas de desarrollo llegue a `dist/`: ni el módulo de
 * `desarrollo/` ni las rutas `/__marcas` y `/__mundos`. Las aparta `HERRAMIENTAS_DE_DESARROLLO`
 * = `false`, que deja su `import()` en una rama muerta; si un día Rollup lo
 * conserva o alguien lo importa sin la guarda, el build se rompe aquí y no se
 * publica una página que escribe en disco.
 */
export function sinDesarrollo(): Plugin {
  return {
    name: 'heroes-sin-desarrollo',
    apply: 'build',
    generateBundle(_opciones, bundle) {
      for (const [nombre, trozo] of Object.entries(bundle)) {
        const texto =
          trozo.type === 'chunk'
            ? `${trozo.code}\n${trozo.moduleIds.join('\n')}`
            : typeof trozo.source === 'string'
              ? trozo.source
              : '';
        for (const huella of [
          '__marcas',
          '__mundos',
          'client/desarrollo/',
          'HERRAMIENTAS_DE_DESARROLLO',
        ])
          if (texto.includes(huella))
            this.error(
              `el build lleva herramientas de desarrollo: «${huella}» en ${nombre}. Solo pueden entrar con un import() detrás de HERRAMIENTAS_DE_DESARROLLO (src/client/main.ts)`,
            );
      }
    },
  };
}
