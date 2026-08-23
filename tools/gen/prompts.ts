/**
 * Los prompts del juego, en un solo sitio.
 *
 * Cada regla rara de aquí viene de un fallo real documentado en los laboratorios
 * de ne-fan; no son adornos:
 *   - Una textura se describe como MATERIAL visto a 90 grados, nunca como
 *     lugar: pedir "suelo" mete perspectiva, y "axe-hewn" llegó a pintar un
 *     hacha en la textura.
 *   - Un tile con un motivo único canta al repetirse: se pide liso y uniforme.
 *   - No se menciona el agua en un terreno sin agua: alucina ríos.
 *   - "pixel art" contamina el estilo aunque no se quiera, así que no aparece.
 */
import type { TerrainKind } from '@core/map/terrain.js';
import type { ResourceKind } from '@core/types.js';

/** La dirección de arte del proyecto: ilustración pintada, no pixel art. */
export const STYLE_TOKEN =
  'painted fantasy illustration, oil painting texture, rich saturated color, ' +
  'dramatic rim lighting, high detail, classic strategy game box art';

/** Cláusula compartida por todas las texturas de terreno. */
const SWATCH_RULE =
  'Flat material swatch seen straight-on at exactly 90 degrees, like a sample ' +
  'from a texture library. Plain and uniform, no landmarks, no single focal ' +
  'motif, no objects, no characters, no text. Seamless and tileable.';

export const TERRAIN_PROMPTS: Readonly<Record<TerrainKind, string>> = {
  grass: `Lush green meadow grass, short dense blades, small clover. ${SWATCH_RULE} ${STYLE_TOKEN}`,
  dirt: `Packed brown earth with fine gravel and dry clay. ${SWATCH_RULE} ${STYLE_TOKEN}`,
  sand: `Fine golden desert sand with soft wind ripples. ${SWATCH_RULE} ${STYLE_TOKEN}`,
  snow: `Fresh clean snow with a faint crust and pale blue shadows. ${SWATCH_RULE} ${STYLE_TOKEN}`,
  swamp: `Dark boggy peat with moss patches and rotting reeds. ${SWATCH_RULE} ${STYLE_TOKEN}`,
  lava: `Cracked black volcanic basalt with glowing orange fissures. ${SWATCH_RULE} ${STYLE_TOKEN}`,
  rough: `Broken rocky ground, loose grey scree and dry tufts. ${SWATCH_RULE} ${STYLE_TOKEN}`,
  // El agua es el ÚNICO terreno donde se nombra: en los demás, cebaría ríos.
  water: `Deep blue-green sea water with gentle rolling waves seen from directly above. ${SWATCH_RULE} ${STYLE_TOKEN}`,
};

export const RESOURCE_ICON_PROMPTS: Readonly<Record<ResourceKind, string>> = {
  wood: 'A neat stack of cut timber logs, game resource icon, centered, transparent background',
  ore: 'A pile of raw grey iron ore chunks, game resource icon, centered, transparent background',
  mercury: 'A sealed glass flask of shimmering silver quicksilver, game resource icon, centered, transparent background',
  sulfur: 'A cluster of bright yellow sulfur crystals, game resource icon, centered, transparent background',
  crystal: 'A cluster of glowing pale cyan crystals, game resource icon, centered, transparent background',
  gems: 'A handful of cut green emerald gems, game resource icon, centered, transparent background',
  gold: 'A stack of shining gold coins, game resource icon, centered, transparent background',
};

/**
 * Descripción de identidad de cada criatura.
 *
 * Este texto es a la vez el prompt y la CLAVE DE CACHÉ del personaje, como el
 * `hero_key` de ne-fan: cambiarlo repaga la imagen, así que se retoca con
 * cuidado. Y va en inglés porque es el idioma en el que estos modelos aciertan.
 */
export const CREATURE_PROMPTS: Readonly<Record<string, string>> = {
  // — Reino caballeresco —
  peasant: 'A ragged farmhand levy in patched brown homespun, gripping a pitchfork, dirt on his face',
  archer: 'A woodland archer in green leather and a hood, longbow drawn, quiver at the hip',
  ranger: 'A veteran ranger in dark green and silver, twin quivers, hooded cloak, elven longbow',
  pikeman: 'A disciplined pikeman in a steel kettle helm and blue tabard, long pike planted',
  veteran_pikeman: 'A grizzled veteran pikeman in polished plate and a blue-and-gold surcoat, halberd raised',
  swordsman: 'A footsoldier in chainmail and a kite shield, arming sword ready, white surcoat',
  master_swordsman: 'A master swordsman in gleaming full plate with a crimson plume, longsword and tower shield',
  cavalry: 'An armored lancer on a barded warhorse, blue pennant on the lance, charging pose',
  champion: 'A champion knight on a heavy black destrier in gilded plate, couched lance, golden banner',
  paladin: 'A holy paladin in radiant silver plate with a winged helm, blessed longsword glowing faintly',
  crusader: 'A crusader in white-and-gold plate with a red cross, twin blessed swords, halo of light',

  // — Necrópolis —
  skeleton: 'An animated skeleton warrior with a rusted scimitar and a cracked buckler, empty eye sockets',
  zombie: 'A shambling rotted corpse in torn grave clothes, grey-green flesh, arms outstretched',
  mutant_zombie: 'A bloated mutant zombie with distended limbs and exposed bone, sickly green ichor',
  mummy: 'A bandaged mummy in gilded funerary wrappings, dry linen unravelling, hollow glowing eyes',
  royal_mummy: 'A royal mummy in a golden pharaonic death mask and jewelled wrappings, staff of office',
  vampire: 'A gaunt vampire noble in a black high-collared cloak, pale skin, red eyes, bat wings unfurled',
  vampire_lord: 'A vampire lord in crimson-lined black armor, crown of thorns, immense leathery wings',
  lich: 'A skeletal lich in tattered violet robes, floating, holding a skull-topped staff wreathed in green fire',
  power_lich: 'An archlich crowned in bone and black iron, robes of deep purple, green necromantic fire in both hands',
  bone_dragon: 'A colossal undead dragon skeleton with tattered wing membranes and green witchfire in its ribcage',
};

/**
 * Envoltura de un retrato de criatura para el tablero de batalla.
 *
 * Perfil mirando a la derecha porque el defensor reutiliza el mismo sprite
 * espejado: así se pinta la mitad del arte. Pose neutral y NUNCA en T —
 * el "T-posegate" de ne-fan: un hero en T-pose convierte los atlas de poses
 * sutiles en hojas de turnaround.
 */
export function creatureSpritePrompt(id: string): string {
  const identidad = CREATURE_PROMPTS[id];
  if (identidad === undefined) throw new Error(`no hay prompt para la criatura "${id}"`);
  return (
    `${identidad}. Full body, side profile facing RIGHT, relaxed natural standing pose, ` +
    `arms at sides, feet on an invisible ground line, hero shot, character reference. ` +
    `Transparent background, no scenery, no ground shadow, no text, no frame. ${STYLE_TOKEN}`
  );
}

/** Retrato de busto para el panel del héroe. */
export function heroPortraitPrompt(descripcion: string): string {
  return (
    `${descripcion}. Head and shoulders portrait, three-quarter view, looking at the viewer, ` +
    `neutral dark background, no text, no frame. ${STYLE_TOKEN}`
  );
}

/**
 * Cláusula compartida por los edificios del castillo.
 *
 * Se pide **el edificio**, no el lugar: describir "una aldea" o "una escena"
 * mete paisaje y perspectiva, y entonces los solares dejan de encajar entre sí
 * porque cada imagen trae su propio horizonte.
 */
const BUILDING_RULE =
  'Single isolated building, complete and centered, seen from a low three-quarter ' +
  'view. It stands alone with nothing around it. Transparent background, no ground, ' +
  'no terrain, no cast shadow, no landscape, no characters, no text, no frame.';

/**
 * Un prompt por imagen de edificio.
 *
 * Los ocho primeros no llevan facción: son los mismos para las dos y el
 * renderizador los busca sin prefijo. Las moradas sí, porque la choza del
 * campesino y la fosa del esqueleto no pueden ser la misma imagen.
 */
export const BUILDING_PROMPTS: Readonly<Record<string, string>> = {
  village_hall: 'A modest timber-framed village hall with a slate roof and a small bell gable',
  town_hall: 'A stone town hall with arched windows, a carved gable and a banner over the door',
  city_hall: 'A grand civic palace with a columned portico, a gilded dome and wide steps',
  castle: 'A fortified gatehouse with a raised portcullis flanked by two tall crenellated towers',
  mage_guild_1: 'A slender stone wizard tower with a conical blue roof and one glowing arched window',
  mage_guild_2: 'A two-tiered wizard tower with a brass orrery on the roof and glowing runes cut into the stone',
  tavern: 'A cosy timbered tavern with a hanging painted sign, warm lit windows and barrels by the door',
  marketplace: 'A row of open market stalls under striped awnings, with crates of goods and a set of scales',

  // — Reino caballeresco —
  knight_dwelling_1: 'A humble thatched farm hut with a wattle fence and a haystack beside it',
  knight_dwelling_2: 'A wooden archery range with a shingled shed, straw target butts and racks of longbows',
  knight_upgrade_2: 'A dark green timber ranger lodge with a watchtower and twin straw target butts',
  knight_dwelling_3: 'A squat stone barracks with a rack of pikes outside and a blue pennant on the roof',
  knight_upgrade_3: 'A reinforced stone barracks with a walled drill yard, blue and gold banners and a halberd trophy',
  knight_dwelling_4: 'An armory forge with a smoking chimney, an anvil at the door and swords on a rack',
  knight_upgrade_4: 'A grand armory of pale stone with a gilded sword above the door and a suit of plate on display',
  knight_dwelling_5: 'A long timber stable with a fenced paddock and a saddle hung by the door',
  knight_upgrade_5: 'A tournament jousting arena with striped tents, a heraldic grandstand and gilded lances',
  knight_dwelling_6: 'A small white stone chapel with a rose window and a golden cross on the roof',
  knight_upgrade_6: 'A soaring cathedral of white and gold stone with flying buttresses and a radiant rose window',

  // — Necrópolis —
  necromancer_dwelling_1: 'An open grave excavation with broken headstones, abandoned spades and scattered bones',
  necromancer_dwelling_2: 'A rusted graveyard gate under a stone arch, with mounded fresh graves behind the railings',
  necromancer_upgrade_2: 'A putrid plague pit ringed by iron railings, greenish mist and a leaning mausoleum',
  necromancer_dwelling_3: 'A small sandstone pyramid tomb with a sealed door and carved funerary glyphs',
  necromancer_upgrade_3: 'A gilded pharaonic pyramid flanked by two obelisks and a black jackal statue',
  necromancer_dwelling_4: 'A derelict gothic manor with boarded windows, a broken weathervane and circling bats',
  necromancer_upgrade_4: 'A grand gothic mansion with black spires, crimson stained glass and tall iron gates',
  necromancer_dwelling_5: 'A cracked stone mausoleum with a domed roof and green witchfire spilling from the doorway',
  necromancer_upgrade_5: 'A necromantic laboratory tower with bubbling green vats, bone scaffolding and carved sigils',
  necromancer_dwelling_6: 'A dragon roost built from a colossal ribcage of bone, with a dark stone altar inside',
  necromancer_upgrade_6: 'A towering temple of fused dragon skeletons crowned with a brazier of green witchfire',
};

export function buildingPrompt(name: string): string {
  const identidad = BUILDING_PROMPTS[name];
  if (identidad === undefined) throw new Error(`no hay prompt para el edificio "${name}"`);
  return `${identidad}. ${BUILDING_RULE} ${STYLE_TOKEN}`;
}

/**
 * Fondo de la pantalla de castillo.
 *
 * El centro tiene que quedar VACÍO: encima van once solares, y un fondo con
 * protagonista pelearía con los edificios que se dibujan sobre él.
 */
export const TOWN_BACKDROP_PROMPTS: Readonly<Record<string, string>> = {
  knight: `Wide empty backdrop of rolling green hills under a bright blue sky with soft clouds, seen from a low viewpoint, open and uncluttered, nothing in the middle of the frame. No buildings, no characters, no text. ${STYLE_TOKEN}`,
  necromancer: `Wide empty backdrop of barren grey moorland under a bruised violet sky with a pale moon, seen from a low viewpoint, open and uncluttered, nothing in the middle of the frame. No buildings, no characters, no text. ${STYLE_TOKEN}`,
};
