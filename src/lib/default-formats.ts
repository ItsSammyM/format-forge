import type { Format, Library } from './model.ts';

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
// Commander snapshot: https://magic.wizards.com/en/banned-restricted-list
const commanderBans = ['Ancestral Recall', 'Balance', 'Black Lotus', 'Chaos Orb', 'Channel', 'Dockside Extortionist', 'Emrakul, the Aeons Torn', 'Erayo, Soratami Ascendant', 'Falling Star', 'Fastbond', 'Flash', 'Golos, Tireless Pilgrim', 'Griselbrand', 'Hullbreacher', 'Iona, Shield of Emeria', 'Karakas', 'Jeweled Lotus', 'Leovold, Emissary of Trest', 'Library of Alexandria', 'Limited Resources', 'Mana Crypt', 'Mox Emerald', 'Mox Jet', 'Mox Pearl', 'Mox Ruby', 'Mox Sapphire', 'Nadu, Winged Wisdom', 'Paradox Engine', 'Primeval Titan', 'Prophet of Kruphix', 'Recurring Nightmare', 'Rofellos, Llanowar Emissary', 'Shahrazad', 'Sundering Titan', 'Sylvan Primordial', 'Time Vault', 'Time Walk', 'Tinker', 'Tolarian Academy', 'Trade Secrets', 'Upheaval', "Yawgmoth's Bargain", 'Amulet of Quoz', 'Bronze Tablet', 'Contract from Below', 'Darkpact', 'Demonic Attorney', 'Jeweled Bird', 'Rebirth', 'Tempest Efreet', 'Timmerian Fiends', 'Cleanse', 'Crusade', 'Imprison', 'Invoke Prejudice', 'Jihad', 'Pradesh Gypsies', 'Stone-Throwing Devils'];
// Points snapshot checked against https://canadianhighlander.ca/points-list/ on 2026-10-14.
const canadianPoints: [string, number][] = [
  ['Ancestral Recall', 8], ['Ancient Tomb', 1], ['Balance', 1], ['Black Lotus', 7], ['Demonic Tutor', 3], ['Dig Through Time', 1], ['Enlightened Tutor', 1], ['Flash', 7], ['Forth Eorlingas!', 1], ['Gifts Ungiven', 1], ['Imperial Seal', 1], ['Intuition', 1], ['Mana Crypt', 5], ['Mana Drain', 1], ['Mana Vault', 1], ['Merchant Scroll', 1], ['Mox Emerald', 3], ['Mox Jet', 3], ['Mox Pearl', 3], ['Mox Ruby', 3], ['Mox Sapphire', 3], ['Mystical Tutor', 2], ['Nadu, Winged Wisdom', 1], ['Natural Order', 1], ['Psychic Frog', 1], ['Reanimate', 1], ['Sol Ring', 3], ['Spellseeker', 1], ['Strip Mine', 1], ['Tainted Pact', 1], ['Tamiyo, Inquisitive Student', 1], ["Thassa's Oracle", 5], ['The Fantasticar', 1], ['The One Ring', 1], ['Time Vault', 7], ['Time Walk', 5], ['Tinker', 3], ['Tolarian Academy', 2], ['Treasure Cruise', 1], ['True-Name Nemesis', 1], ['Underworld Breach', 3], ["Urza's Saga", 1], ['Vampiric Tutor', 2], ['White Plume Adventurer', 1], ['Wishclaw Talisman', 1], ['Wrenn and Six', 1],
];
export const DEFAULT_FORMAT_IDS = ['kitchen-table', '2015-modern', 'prefire', 'commander', 'modern', 'canadian-highlander'];
export const isDefaultFormat = (id: string) => DEFAULT_FORMAT_IDS.includes(id);
export function defaultFormats(): Format[] {
  const base = { minCards: 60, maxCards: null, minSideboard: 0, maxSideboard: 15, copyLimit: 4, basicLandExemption: true, commanderRules: false };
  return [
    { ...base, id: '2015-modern', name: '2015 Modern', description: 'Eighth Edition through Magic Origins. Uses the Modern bans at the time of Origins. Snapshot verified 2026-10-14.', allowedSets: [...modern2015Sets], banned: [...modern2015Bans] },
    { ...base, id: 'prefire', name: 'Prefire', description: 'PreFIRE Modern uses Eighth Edition through Ravnica Allegiance, with the community PreFIRE ban list. Snapshot verified 2026-10-14.', allowedSets: [...prefireSets], banned: [...prefireBans] },
    { ...base, id: 'modern', name: 'Modern', description: 'Modern card pool and bans follow Scryfall legality data.', officialFormat: 'modern', normalOnly: true, allowedSets: [], banned: [] },
    { ...base, id: 'canadian-highlander', name: 'Canadian Highlander', description: '100+ card singleton, no sideboard, maximum 10 points. Points snapshot checked 2026-10-14.', minCards: 100, maxSideboard: 0, copyLimit: 1, eternal: true, normalOnly: true, allowedSets: [], banned: [], bannedTypes: ['Conspiracy'], maxPoints: 10, pointed: canadianPoints.map(([name, points]) => ({ name, points })) },
    { ...base, id: 'commander', name: 'Commander', description: '100-card singleton, eternal card pool, commander color identity. Ban snapshot checked 2026-10-14.', minCards: 100, maxCards: 100, maxSideboard: 0, copyLimit: 1, commanderRules: true, eternal: true, allowedSets: [], banned: [...commanderBans], bannedTypes: ['Conspiracy'], bannedCompanions: ['Lutri, the Spellchaser'] },
  ];
}
export function builtInFormats(): Format[] {
  return [
    { id: 'kitchen-table', name: 'Kitchen table', description: 'no restrictions at all', minCards: 0, maxCards: null, minSideboard: 0, maxSideboard: null, copyLimit: null, basicLandExemption: true, commanderRules: false, checkCardRoles: false, normalOnly: false, banTournamentIllegal: false, allowUnCards: true, gameplayOnly: true, eternal: true, allowedSets: [], banned: ['Invoke Prejudice', 'Cleanse', 'Stone-Throwing Devils', 'Pradesh Gypsies', 'Jihad', 'Imprison', 'Crusade'] },
    ...defaultFormats(),
  ];
}
export function addDefaultFormats(library: Library): Library {
  const defaults = builtInFormats();
  const missing = defaults.filter(format => !library.formats.some(existing => existing.id === format.id));
  if (!missing.length && library.defaultsVersion === 5) return library;
  // Keep the old Singleton rules when decks still reference them, as a custom format.
  const formats = library.formats.filter(format => format.id !== 'singleton-workshop' || library.decks.some(deck => deck.formatId === format.id)).map(format => format.id === 'kitchen-table' ? defaults[0] : format);
  return { ...library, formats: [...formats, ...missing], defaultsVersion: 5 };
}
