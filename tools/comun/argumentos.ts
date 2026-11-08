/** Los argumentos de las órdenes de `tools/` (`pnpm mundo`, `pnpm npcs`). */

/** El valor de `--<nombre>=<valor>`, o `undefined` si no está. */
export function bandera(args: readonly string[], nombre: string): string | undefined {
  return args.find((x) => x.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
}
