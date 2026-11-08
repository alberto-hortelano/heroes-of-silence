/** Los argumentos de las órdenes de `tools/` (`pnpm mundo`, `pnpm npcs`, `pnpm taller`). */

/** El valor de `--<nombre>=<valor>`, o `undefined` si no está. */
export function bandera(args: readonly string[], nombre: string): string | undefined {
  return args.find((x) => x.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
}

/**
 * Los nombres de `--solo=a,b,c`, o `undefined` si no está: con qué encargos se queda una orden
 * del taller. El taller lo leía a mano en ocho sitios.
 */
export function soloDe(args: readonly string[]): string[] | undefined {
  return bandera(args, 'solo')?.split(',');
}
