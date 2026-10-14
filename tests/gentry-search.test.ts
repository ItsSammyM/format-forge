import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { blankFormat, parseFormatText } from '../src/lib/model.ts';
import { emptyFilters, buildSearchQuery, legalPoolBatches, legalPoolQuery, searchLegalPool } from '../src/lib/scryfall.ts';
import type { ScryfallCard } from '../src/lib/scryfall.ts';

// Regression fixture from the reported Gentry format, including its full DFC names.
const names = `Adarkar Wastes
Aetherflux Reservoir
Aragorn, the Uniter
Ancestral Recall
Ashnod's Altar
Atraxa, Praetors' Voice
Badlands
Avatar Aang // Aang, Master of Elements
Bayou
Bazaar of Baghdad
Black Lotus
Birds of Paradise
Breeding Pool
Candelabra of Tawnos
Cavern of Souls
Castle Ardenvale
Chains of Mephistopheles
Chaos Orb
Cloud, Midgar Mercenary
City of Brass
Copy Artifact
Cyclonic Rift
Edgar Markov
Donatello, Mutant Mechanic
Elesh Norn // The Argent Etchings
Emeritus of Ideation // Ancestral Recall
Force of Negation
Final Fortune
Gaea's Cradle
Gandalf the White
Homeward Path
Godless Shrine
Imperial Seal
Indominus Rex, Alpha
Intuition
Indoraptor, the Perfect Hybrid
Island
Juzám Djinn
Karplusan Forest
Karakas
Kozilek, the Broken Reality
Krenko, Mob Boss
Leonardo, Sewer Samurai
Leonardo da Vinci
Library of Alexandria
Luck Bobblehead
Mana Vault
Mana Crypt
Michelangelo, Improviser
Mind Twist
Mox Amber
Mishra's Workshop
Mox Diamond
Mox Emerald
Mox Jet
Mox Jasper
Mox Opal
Mox Pearl
Ms. Bumbleflower
Mox Ruby
Murktide Regent
Nightmare
Palantír of Orthanc
Overgrown Tomb
Perception Bobblehead
Ragavan, Nimble Pilferer
Sacred Foundry
Rhystic Study
Scrubland
Sheoldred // The True Scriptures
Smaug the Magnificent
Shinka, the Bloodsoaked Keep
Smothering Tithe
Snapcaster Mage
Sothera, the Supervoid
Sol Ring
Steam Vents
Stomping Ground
Sword of Hearth and Home
Survival of the Fittest
Swords to Plowshares
Taiga
The Aetherspark
Temple Garden
The Eternal Wanderer
The Mind Stone
The Tabernacle at Pendrell Vale
The Soul Stone
Tifa Lockhart
Timetwister
Time Walk
Time Vault
Toph, the First Metalbender
Traveling Chocobo
Tundra
Tropical Island
Ulamog, the Defiler
Underground Sea
Vorinclex // The Grand Evolution
Volcanic Island
Watery Grave
Wheel of Fortune
Y'shtola, Night's Blessed
Yawgmoth's Will`.split('\n');
const format = parseFormatText(JSON.stringify({ version: 1, decks: [], formats: [{ ...blankFormat(), id: 'gentry-regression', name: 'Gentry', minCards: 40, maxCards: 40, maxSideboard: 20, normalOnly: false, whitelistOnly: true, eternal: false, allowedCards: names }] }))[0];

test('Gentry legal-list batches stay short, balanced, and keep every full card name', () => {
  const query = buildSearchQuery('', { ...emptyFilters(), normalOnly: false }, format);
  const batches = legalPoolBatches(query, names);
  assert.ok(new TextEncoder().encode(legalPoolQuery(query, names.slice(0, 40))).length > 700);
  assert.deepEqual(batches.flat(), names);
  for (const batch of batches) {
    const sent = legalPoolQuery(query, batch);
    assert.ok(new TextEncoder().encode(sent).length <= 700); assert.ok(!sent.includes('//'));
    assert.equal((sent.match(/\(/g) ?? []).length, (sent.match(/\)/g) ?? []).length);
  }
  const difficult = ['Odd (Name)', 'Quote "Card"', 'Back\\Slash', 'Juzám Djinn', 'Front // Back'];
  assert.ok(legalPoolQuery(query, difficult).includes('name:"Front"'));
  assert.ok(legalPoolQuery(query, difficult).includes('Quote \\"Card\\"'));
  assert.throws(() => legalPoolBatches('x'.repeat(700), names), /Shorten/);
});

test('Gentry search finds the complete pool, including DFCs, through bounded mocked requests', async () => {
  const requested: string[] = [];
  const fetch = mock.method(globalThis, 'fetch', async input => {
    const query = new URL(String(input)).searchParams.get('q')!; requested.push(query);
    assert.ok(new TextEncoder().encode(query).length <= 700);
    const fronts = [...query.matchAll(/name:"([^"]+)"/g)].map(match => match[1]);
    const card = (name: string): ScryfallCard => ({ id: `gentry-${name}`, name, set: 'lea', collector_number: '1', type_line: 'Artifact', color_identity: [], card_faces: name.includes(' // ') ? name.split(' // ').map(name => ({ name })) : undefined });
    const data = names.filter(name => fronts.includes(name.split(' // ')[0])).map(card);
    data.push(card('Not in the legal list'));
    return new Response(JSON.stringify({ data, total_cards: data.length, has_more: false }), { headers: { 'Content-Type': 'application/json' } });
  });
  try {
    const result = await searchLegalPool('-t:token', format);
    assert.equal(result.total_cards, names.length); assert.deepEqual(new Set(result.data.map(c => c.name)), new Set(names));
    assert.equal(requested.length, legalPoolBatches('-t:token', names).length);
    await searchLegalPool('-t:token', format); assert.equal(requested.length, legalPoolBatches('-t:token', names).length);
  } finally { fetch.mock.restore(); }
});
