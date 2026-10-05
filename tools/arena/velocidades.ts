/**
 * Cuántas casillas mueve cada hoja de la arena al salir por primera vez, con el
 * porqué. **Inventadas y provisionales**, como el resto de cifras por defecto de
 * la arena: las pidió el usuario el 02-10-2026 al ver que con la velocidad por
 * perfil casi todas empataban y el empate lo gana siempre el atacante —jugaba un
 * ejército entero y luego el otro—.
 *
 * El criterio, también suyo: un humano de a pie normal mueve 4; la infantería
 * pesada o con arma a dos manos, 3, y los tiradores pesados, 3; los elfos, uno
 * más que su equivalente humano; el Danzante de espadas es el más rápido de los
 * de a pie (6); el jinete y los hostigadores, rápidos; los no muertos, lentos
 * (zombi 2, esqueleto 3), salvo lo que su papel diga otra cosa; y los orkos como
 * los humanos, con el berserker más rápido (desde el 05-10-2026, que el
 * berserker sale de la ficha, el jinete de hiena). Cada fila se ajusta con lo que dice
 * de la unidad su descripción en `tools/taller/unidades.ts`.
 *
 * Un test exige que estén todas las hojas del taller y ninguna más.
 */
export const VELOCIDAD_DE_SALIDA: Readonly<
  Record<string, readonly [casillas: number, motivo: string]>
> = {
  // Templarios
  'templario-escudo': [4, 'infantería de línea a pie: el humano de referencia'],
  'templario-mandoble': [3, 'templario pesado con mandoble a dos manos'],
  'templario-monje': [4, 'a pie y sin armadura, pero sanador y no corredor'],
  'templario-escudero': [5, 'joven y ligero, sin escudo ni placas'],
  'templario-hermano-de-carga': [7, 'a caballo: el más rápido de la arena'],
  'templario-penitente': [4, 'mayal a dos manos, pero sin armadura y descalzo'],
  // No muertos
  'esqueleto-guerrero': [3, 'esqueleto: lento, como pide el criterio'],
  'esqueleto-arquero': [3, 'esqueleto, y tirador'],
  zombi: [2, 'zombi encorvado: el más lento de la tropa'],
  'caballero-de-la-muerte': [3, 'placas negras y arma a dos manos'],
  espectro: [5, 'figura fantasmal que se desliza: no anda como un muerto'],
  // 5 y no 7, como el jinete elfo (docs/art/peticiones.md §12).
  'jinete-de-plaga': [5, 'a caballo: tope que admite hoy la arena'],
  // Imperio
  'imperio-alabardero': [3, 'alabarda a dos manos'],
  'imperio-piquero': [3, 'pica larga a dos manos'],
  'imperio-ballestero': [3, 'tirador pesado, con el pavés a la espalda'],
  'imperio-coracero': [3, 'placas pesadas: «muy duro y lento»'],
  'imperio-arcabucero': [3, 'tirador pesado con arcabuz y horquilla'],
  'imperio-rodelero': [5, 'rodela y ropera: infantería ligera de asalto'],
  'imperio-artillero-culebrina': [3, 'tirador pesado: la culebrina pesa'],
  // 5 y no 7: `test/arena.test.ts` da al hermano de carga por único jinete (docs/art/peticiones.md §12).
  'imperio-pistolero-montado': [5, 'a caballo, pero hostigador: se acerca, dispara y se va'],
  'imperio-granadero': [4, 'a pie y sin armadura: como un humano'],
  // Elfos
  'elfo-arquero': [5, 'arquero ligero (4 en un humano), más uno por elfo'],
  'elfo-explorador': [5, 'explorador agazapado, ligero; por debajo del Danzante'],
  'elfo-guardia-del-bosque': [5, 'infantería de escudo y lanza (4), más uno por elfo'],
  // 5 y no 7: `test/arena.test.ts` da al hermano de carga por único jinete (docs/art/peticiones.md §12).
  'elfo-jinete': [5, 'a caballo, «los más rápidos del juego»: tope que admite hoy la arena'],
  'elfo-sacerdotisa': [5, 'maga (4 en un humano), más uno por elfa'],
  'elfo-asesino': [5, 'infiltrador ligero, por debajo del Danzante'],
  // Orkos
  'orko-hacha-escudo': [4, 'el orko de línea: como un humano'],
  'orko-dos-armas': [4, 'sin defensa pero sin peso: como un humano'],
  'goblin-lancero': [4, 'goblin de línea con lanza: como un humano'],
  'goblin-arquero': [4, 'tirador ligero'],
  'troll-maza': [3, 'gigante con maza a dos manos'],
  // 5 y no 7, como el jinete elfo (docs/art/peticiones.md §12).
  'goblin-jinete-de-hiena': [5, 'a lomos de una hiena: el orko más rápido, en lugar del berserker'],
  'orko-armadura-pesada': [3, '«más lento y más duro», con hacha a dos manos'],
  // Héroes
  'heroe-templario-caballero': [4, 'líder de primera línea a pie'],
  'heroe-templario-abad': [4, 'sanador con cota de malla bajo el hábito'],
  'heroe-templario-inquisidor': [5, 'cazador con coraza ligera'],
  'heroe-templario-gran-maestre': [3, 'placas ornamentadas y arma a dos manos'],
  'heroe-nigromante': [4, 'mago humano: como un humano'],
  'heroe-vampiro': [5, 'noble con coraza ligera: rápido para un no muerto'],
  'heroe-lich': [3, 'esqueleto de mago: lento'],
  'heroe-imperio-duelista': [5, 'espada y daga, sin armadura: rápido, como pide su ficha'],
  'heroe-imperio-mago': [4, 'mago con coraza ligera: como un humano'],
  'heroe-imperio-capitan-mercenario': [4, 'lansquenete sin escudo: como un humano'],
  'heroe-imperio-ingeniero': [3, 'cargado de herramientas, planos y un rifle largo'],
  'heroe-elfo-danzante-de-espadas': [6, 'el más rápido de los de a pie, como pide el usuario'],
  'heroe-elfo-druida': [5, 'maga (4 en un humano), más uno por elfa'],
  'heroe-elfo-cantora': [5, 'maga (4 en un humano), más uno por elfa'],
  'heroe-orko-kaudillo': [3, 'enorme, con placas de chatarra y arma a dos manos'],
  'heroe-goblin-jefe': [5, 'pequeño y astuto'],
  'heroe-goblin-chaman': [4, 'chamán goblin a pie: como un humano'],
};
