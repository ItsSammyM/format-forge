import type { Format, Library } from './model.ts';
import { DEFAULT_FORMAT_IDS } from './default-format-ids.ts';
export { DEFAULT_FORMAT_IDS };

// Verified against the community format sites on 2026-10-14.
// https://www.2015modern.com/legal-sets
// https://www.2015modern.com/banned-cards
// https://prefiremagic.com/legality.html
const modern2015Sets = '8ed mrd dst 5dn chk bok sok 9ed rav gpt dis csp tsp tsb plc fut 10e lrw mor shm eve ala con arb m10 zen wwk roe m11 som mbs nph m12 isd dka avr m13 rtr gtc dgm m14 ths bng jou m15 ktk frf dtk ori'.split(' ');
const prefireSets = [...modern2015Sets, ...'bfz ogw soi emn kld aer akh hou xln rix dom m19 grn rna'.split(' ')];
const modern2015Bans = [
  'Ancient Den', 'Ancestral Vision', 'Birthing Pod', 'Blazing Shoal', 'Bloodbraid Elf', 'Chrome Mox', 'Cloudpost', 'Dark Depths', 'Deathrite Shaman', 'Dig Through Time', 'Dread Return', 'Glimpse of Nature', 'Great Furnace', "Green Sun's Zenith", 'Hypergenesis', 'Jace, the Mind Sculptor', 'Mental Misstep', 'Ponder', 'Preordain', 'Punishing Fire', 'Rite of Flame', 'Seat of the Synod', 'Second Sunrise', 'Seething Song', "Sensei's Divining Top", 'Skullclamp', 'Stoneforge Mystic', 'Sword of the Meek', 'Treasure Cruise', 'Tree of Tales', "Umezawa's Jitte", 'Vault of Whispers',
];
const prefireBans = [
  'Ancient Den', 'Great Furnace', 'Tree of Tales', 'Vault of Whispers', 'Seat of the Synod', 'Blazing Shoal', 'Chrome Mox', 'Cloudpost', 'Creeping Chill', 'Counterbalance', 'Dark Depths', 'Deathrite Shaman', 'Dig Through Time', 'Eye of Ugin', 'Gitaxian Probe', 'Golgari Grave-Troll', 'Hypergenesis', 'Krark-Clan Ironworks', 'Mental Misstep', 'Ponder', 'Rite of Flame', 'Second Sunrise', 'Summer Bloom', 'Skullclamp', 'Treasure Cruise', "Umezawa's Jitte",
];
// Legacy snapshot names removed from saved Commander presets during migration.
const commanderBans = ['Ancestral Recall', 'Balance', 'Black Lotus', 'Chaos Orb', 'Channel', 'Dockside Extortionist', 'Emrakul, the Aeons Torn', 'Erayo, Soratami Ascendant', 'Falling Star', 'Fastbond', 'Flash', 'Golos, Tireless Pilgrim', 'Griselbrand', 'Hullbreacher', 'Iona, Shield of Emeria', 'Karakas', 'Jeweled Lotus', 'Leovold, Emissary of Trest', 'Library of Alexandria', 'Limited Resources', 'Mana Crypt', 'Mox Emerald', 'Mox Jet', 'Mox Pearl', 'Mox Ruby', 'Mox Sapphire', 'Nadu, Winged Wisdom', 'Paradox Engine', 'Primeval Titan', 'Prophet of Kruphix', 'Recurring Nightmare', 'Rofellos, Llanowar Emissary', 'Shahrazad', 'Sundering Titan', 'Sylvan Primordial', 'Time Vault', 'Time Walk', 'Tinker', 'Tolarian Academy', 'Trade Secrets', 'Upheaval', "Yawgmoth's Bargain", 'Amulet of Quoz', 'Bronze Tablet', 'Contract from Below', 'Darkpact', 'Demonic Attorney', 'Jeweled Bird', 'Rebirth', 'Tempest Efreet', 'Timmerian Fiends', 'Cleanse', 'Crusade', 'Imprison', 'Invoke Prejudice', 'Jihad', 'Pradesh Gypsies', 'Stone-Throwing Devils'];
// Points snapshot checked against https://canadianhighlander.ca/points-list/ on 2026-10-14.
const canadianPoints: [string, number][] = [
  ['Ancestral Recall', 8], ['Ancient Tomb', 1], ['Balance', 1], ['Black Lotus', 7], ['Demonic Tutor', 3], ['Dig Through Time', 1], ['Enlightened Tutor', 1], ['Flash', 7], ['Forth Eorlingas!', 1], ['Gifts Ungiven', 1], ['Imperial Seal', 1], ['Intuition', 1], ['Mana Crypt', 5], ['Mana Drain', 1], ['Mana Vault', 1], ['Merchant Scroll', 1], ['Mox Emerald', 3], ['Mox Jet', 3], ['Mox Pearl', 3], ['Mox Ruby', 3], ['Mox Sapphire', 3], ['Mystical Tutor', 2], ['Nadu, Winged Wisdom', 1], ['Natural Order', 1], ['Psychic Frog', 1], ['Reanimate', 1], ['Sol Ring', 3], ['Spellseeker', 1], ['Strip Mine', 1], ['Tainted Pact', 1], ['Tamiyo, Inquisitive Student', 1], ["Thassa's Oracle", 5], ['The Fantasticar', 1], ['The One Ring', 1], ['Time Vault', 7], ['Time Walk', 5], ['Tinker', 3], ['Tolarian Academy', 2], ['Treasure Cruise', 1], ['True-Name Nemesis', 1], ['Underworld Breach', 3], ["Urza's Saga", 1], ['Vampiric Tutor', 2], ['White Plume Adventurer', 1], ['Wishclaw Talisman', 1], ['Wrenn and Six', 1],
];
const normalizeTag = (tag: string) => tag.trim().toLocaleLowerCase('en-US');
export const isDefaultFormat = (id: string) => DEFAULT_FORMAT_IDS.includes(id);
export function defaultFormats(): Format[] {
  const base = { minCards: 60, maxCards: null, minSideboard: 0, maxSideboard: 15, copyLimit: 4, basicLandExemption: true, commanderRules: false };
  return [
    { ...base, id: '2015-modern', name: '2015 Modern', description: 'Modern as it was in 2015, with a card pool through Magic Origins. Ban snapshot: 2026-10-14.', allowedSets: [...modern2015Sets], banned: [...modern2015Bans] },
    { ...base, id: 'prefire', name: 'Prefire', description: 'Community Modern card pool through Ravnica Allegiance. Ban snapshot: 2026-10-14.', allowedSets: [...prefireSets], banned: [...prefireBans] },
    { ...base, id: 'modern', name: 'Modern', description: 'A 60-card format using recent sets, with its own banned list.', officialFormat: 'modern', normalOnly: true, allowedSets: [], banned: [] },
    ...(['legacy', 'vintage', 'pauper', 'pioneer'] as const).map(id => ({ ...base, id, name: id[0].toUpperCase() + id.slice(1), description: ({ legacy: 'A 60-card eternal format with a broad card pool and its own banned list.', vintage: 'An eternal format where the most powerful cards are restricted to one copy.', pauper: 'A 60-card eternal format. Only cards printed at common are legal.', pioneer: 'A 60-card format built around cards from Return to Ravnica onward.' })[id], officialFormat: id, normalOnly: false, eternal: id !== 'pioneer', allowedSets: [], banned: [] })),
    { ...base, id: 'premodern', name: 'Premodern', description: 'A 60-card format using sets from Fourth Edition through Scourge.', officialFormat: 'premodern', normalOnly: false, eternal: true, allowedSets: [], banned: [] },
    { ...base, id: 'pauper-edh', name: 'Pauper EDH', description: '100-card singleton: commons in the deck, uncommon creature commander.', minCards: 100, maxCards: 100, maxSideboard: 0, copyLimit: 1, commanderRules: true, commanderAnyCreature: true, officialFormat: 'paupercommander', bannedRarities: ['uncommon', 'rare', 'mythic', 'special', 'bonus'], eternal: true, allowedSets: [], banned: [], bannedTypes: ['Conspiracy'] },
    { ...base, id: 'canadian-highlander', name: 'Canadian Highlander', description: 'A 100-card singleton format with a 10-point deck limit.', minCards: 100, maxSideboard: 0, copyLimit: 1, eternal: true, normalOnly: true, allowedSets: [], banned: [], bannedTypes: ['Conspiracy'], maxPoints: 10, pointed: canadianPoints.map(([name, points]) => ({ name, points })) },
    { ...base, id: 'commander', name: 'Commander', description: '100-card singleton with color identity.', officialFormat: 'commander', minCards: 100, maxCards: 100, maxSideboard: 0, copyLimit: 1, commanderRules: true, eternal: true, allowedSets: [], banned: [], bannedTypes: ['Conspiracy'], bannedCompanions: ['Lutri, the Spellchaser'] },
  ];
}
export function builtInFormats(): Format[] {
  return [
    { id: 'no-format', name: 'No Format', description: 'No deckbuilding or card legality rules.', tags: ['default'], minCards: 0, maxCards: null, minSideboard: 0, maxSideboard: null, copyLimit: null, basicLandExemption: false, commanderRules: false, checkCardRoles: false, normalOnly: false, banTournamentIllegal: false, allowUnCards: true, gameplayOnly: false, eternal: true, allowedSets: [], banned: [] },
    ...defaultFormats().map(format => ({ ...format, tags: ['default'] })),
  ];
}
export function addDefaultFormats(library: Library): Library {
  const defaults = builtInFormats();
  const missing = defaults.filter(format => !library.formats.some(existing => existing.id === format.id));
  if (!missing.length && library.defaultsVersion === 12 && !library.formats.some(format => format.id === 'kitchen-table')) return library;
  // Keep the old Singleton rules when decks still reference them, as a custom format.
  const defaultById = new Map(defaults.map(format => [format.id, format]));
  const decks = library.decks.map(deck => deck.formatId === 'kitchen-table' ? { ...deck, formatId: 'no-format' } : deck);
  const formats = library.formats.filter(format => format.id !== 'kitchen-table' && (format.id !== 'singleton-workshop' || decks.some(deck => deck.formatId === format.id))).map(format => format.id === 'commander' && !format.officialFormat ? { ...format, officialFormat: 'commander' as const, banned: format.banned.filter(name => !commanderBans.includes(name)) } : format).map(format => DEFAULT_FORMAT_IDS.includes(format.id) ? { ...format, name: defaultById.get(format.id)?.name ?? format.name, description: defaultById.get(format.id)?.description ?? format.description, tags: [...new Set([...(format.tags ?? []).filter(tag => normalizeTag(tag) !== 'default'), 'default'])] } : format);
  return { ...library, decks, formats: [...formats, ...missing], defaultsVersion: 12 };
}
