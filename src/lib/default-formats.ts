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
export function defaultFormats(): Format[] {
  const base = { minCards: 60, maxCards: null, minSideboard: 0, maxSideboard: 15, copyLimit: 4, basicLandExemption: true, commanderRules: false };
  return [
    { ...base, id: '2015-modern', name: '2015 Modern', description: 'Eighth Edition through Magic Origins. Uses the Modern bans at the time of Origins. Snapshot verified 2026-10-14.', allowedSets: [...modern2015Sets], banned: [...modern2015Bans] },
    { ...base, id: 'prefire', name: 'Prefire', description: 'PreFIRE Modern uses Eighth Edition through Ravnica Allegiance, with the community PreFIRE ban list. Snapshot verified 2026-10-14.', allowedSets: [...prefireSets], banned: [...prefireBans] },
    { ...base, id: 'commander', name: 'Commander', description: '100-card singleton, eternal card pool, commander color identity. Ban snapshot checked 2026-10-14.', minCards: 100, maxCards: 100, maxSideboard: 0, copyLimit: 1, commanderRules: true, eternal: true, allowedSets: [], banned: [...commanderBans], bannedTypes: ['Conspiracy'], bannedCompanions: ['Lutri, the Spellchaser'] },
  ];
}
export function addDefaultFormats(library: Library): Library {
  if (library.defaultsVersion === 3) return library;
  const candidates = library.defaultsVersion === 1 || library.defaultsVersion === 2 ? defaultFormats().filter(f => f.id === 'commander') : defaultFormats();
  const missing = candidates.filter(f => !library.formats.some(existing => existing.id === f.id || existing.name.trim().toLowerCase() === f.name.toLowerCase()));
  return { ...library, formats: [...library.formats, ...missing], defaultsVersion: 3 };
}
