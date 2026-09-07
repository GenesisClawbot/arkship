const RESOURCE_KEYS = Object.freeze(['power', 'oxygen', 'biomass', 'heat', 'hull']);

const flow = (values = {}) => Object.freeze(Object.fromEntries(RESOURCE_KEYS.map((key) => [key, values[key] ?? 0])));

const organism = (id, name, role, description, input, output, options = {}) => Object.freeze({
  id,
  name,
  kind: 'organism',
  role,
  description,
  input: flow(input),
  output: flow(output),
  risk: options.risk ?? 'Needs a deliberate habitat and steady supplies.',
  tags: Object.freeze(options.tags ?? ['biology']),
  art: `assets/${id}.webp`,
  mainOutput: options.mainOutput ?? RESOURCE_KEYS.find((key) => output[key] > 0) ?? 'defence',
  defence: options.defence ?? 0,
});

const moduleItem = (id, name, role, description, input, output, options = {}) => Object.freeze({
  id,
  name,
  kind: 'module',
  role,
  description,
  input: flow(input),
  output: flow(output),
  risk: options.risk ?? 'A finite machine with a clear pressure to watch.',
  tags: Object.freeze(options.tags ?? ['module']),
  art: `assets/${id}.webp`,
  mainOutput: options.mainOutput ?? RESOURCE_KEYS.find((key) => output[key] > 0) ?? 'defence',
  defence: options.defence ?? 0,
  anchored: Boolean(options.anchored),
});

export const ORGANISMS = Object.freeze([
  organism('void-lung', 'Void Lung', 'life support', 'A translucent lung that trades power for breathable air and warm biomass.', { power: 1 }, { oxygen: 5, heat: 2 }, { mainOutput: 'oxygen', risk: 'Consumes one power and adds two heat; adjacent hydroponics can use its warmth.', tags: ['biology', 'life-support'] }),
  organism('grave-moss', 'Grave Moss', 'ecology', 'A patient carpet that turns oxygen into edible mass and slowly colonises an empty bay.', { oxygen: 1 }, { biomass: 3 }, { mainOutput: 'biomass', risk: 'Consumes oxygen and spreads only every third active age, costing two biomass.', tags: ['biology', 'growth'] }),
  organism('radiovore', 'Radiovore', 'power', 'A solar feeder that converts food into current, becoming bolder under radiation.', { biomass: 1 }, { power: 2 }, { mainOutput: 'power', risk: 'Consumes scarce biomass; every second active solar exposure can mutate a neighbouring organism.', tags: ['biology', 'solar'] }),
  organism('frost-lichen', 'Frost Lichen', 'cooling', 'A pale heat sink that consumes biomass to pull dangerous heat from the ship.', { biomass: 1 }, { heat: -5 }, { mainOutput: 'heat', risk: 'Consumes one biomass for cooling and is weak when food is scarce.', tags: ['biology', 'cooling'] }),
  organism('sun-coral', 'Sun Coral', 'power', 'A bright colony that turns oxygen into current and heat.', { oxygen: 2 }, { power: 4, heat: 2 }, { mainOutput: 'power', risk: 'Consumes two oxygen and returns two heat; a radiator makes its power cheaper.', tags: ['biology', 'solar'] }),
  organism('bloom-stomach', 'Bloom Stomach', 'food', 'A pitcher organism that converts current into a rich biomass reserve.', { power: 2 }, { biomass: 5, oxygen: -1 }, { mainOutput: 'biomass', risk: 'Consumes two power and one oxygen net; its food output is best beside Grave Moss.', tags: ['biology', 'food'] }),
  organism('shield-fern', 'Shield Fern', 'defence', 'A broad fern that catches debris, at the cost of a little power and oxygen.', { power: 1, oxygen: 1 }, {}, { mainOutput: 'defence', defence: 3, risk: 'Consumes power and oxygen every jump to prevent only three debris damage.', tags: ['biology', 'defence'] }),
  organism('hull-leech', 'Hull Leech', 'repair', 'A red leech that turns food into hull repair and prefers a stocked hold.', { biomass: 3 }, { hull: 3 }, { mainOutput: 'hull', risk: 'Consumes three biomass for three hull; storage adjacency adds one hull.', tags: ['biology', 'repair'] }),
  organism('echo-polyp', 'Echo Polyp', 'oxygen', 'A resonant polyp that exhales a little oxygen and amplifies a neighbouring lung.', { biomass: 2 }, { oxygen: 2 }, { mainOutput: 'oxygen', risk: 'Consumes two biomass and needs a different active species nearby to justify its space.', tags: ['biology', 'symbiosis'] }),
  organism('cinder-bloom', 'Cinder Bloom', 'power', 'A heat-fed flower that turns stored heat into power and a little food.', { heat: 3 }, { power: 3, biomass: 1 }, { mainOutput: 'power', risk: 'Needs three starting heat; its power helps later jumps but can starve when radiators run first.', tags: ['biology', 'heat'] }),
]);

export const MODULES = Object.freeze([
  moduleItem('reactor', 'Reactor', 'generation', 'The anchored reactor produces dependable current and a manageable plume of heat.', {}, { power: 6, heat: 3 }, { anchored: true, mainOutput: 'power' }),
  moduleItem('engine', 'Engine', 'propulsion', 'The anchored engine turns a stocked ship into a ship that can jump.', {}, {}, { anchored: true, mainOutput: 'defence' }),
  moduleItem('crew', 'Crew Quarters', 'crew', 'Six cryo bunks and the people who keep the living ark coherent.', {}, {}, { anchored: true, mainOutput: 'defence' }),
  moduleItem('storage', 'Storage', 'cargo', 'A reinforced hold that expands the first three resource caps by ten.', {}, {}, { mainOutput: 'defence' }),
  moduleItem('hydroponics', 'Hydroponics', 'ecology', 'A small farm that spends current to make oxygen and biomass.', { power: 2 }, { oxygen: 2, biomass: 3 }, { mainOutput: 'biomass' }),
  moduleItem('radiator', 'Radiator', 'cooling', 'A mechanical radiator spends current to pull four heat from the hull.', { power: 1 }, { heat: -4 }, { mainOutput: 'heat' }),
  moduleItem('scrubber', 'Scrubber', 'life support', 'A scrubber spends one current for four oxygen without adding heat.', { power: 1 }, { oxygen: 4 }, { mainOutput: 'oxygen' }),
]);

export const CATALOG = Object.freeze(Object.fromEntries([...ORGANISMS, ...MODULES].map((item) => [item.id, item])));

export const MUTATIONS = Object.freeze([
  Object.freeze({ id: 'efficient', name: 'Efficient', description: 'Halves the largest input and trims the main output by two.' }),
  Object.freeze({ id: 'symbiotic', name: 'Symbiotic', description: 'Adds two output beside another active species, or loses one in isolation.' }),
  Object.freeze({ id: 'feral', name: 'Feral', description: 'Adds three output and three heat, making abundance dangerous.' }),
]);

export const HAZARDS = Object.freeze([
  Object.freeze({ id: 'solar', name: 'Solar Radiation', description: 'Adds five heat and exposes radiovores to mutation.' }),
  Object.freeze({ id: 'debris', name: 'Debris Field', description: 'Strikes the hull for four unless Shield Ferns intercept it.' }),
  Object.freeze({ id: 'spores', name: 'Spore Bloom', description: 'Consumes three oxygen during the jump.' }),
]);

const reward = (resources = {}, items = []) => Object.freeze({ resources: flow(resources), items: Object.freeze([...items]) });
const fallbackSupplies = (description) => {
  const score = [...description].reduce((total, character) => total + character.charCodeAt(0), 0) % 3;
  return score === 0 ? { oxygen: 1 } : score === 1 ? { power: 1 } : { biomass: 1 };
};
const choice = (id, label, description, cost, result) => Object.freeze({
  id: id === 'leave' ? 'reject' : id,
  label,
  description,
  cost: flow(cost),
  reward: id === 'leave' && !result.items.length && !Object.values(result.resources).some(Boolean) ? reward(fallbackSupplies(description)) : result,
});

const encounterSpecs = [
  ['seed-vault', 'Garden Seed Vault', 'A silent greenhouse offers viable spores behind a cracked seal.', [choice('take', 'Take the spores', 'Pay a little current to bring a new garden aboard.', { power: 1 }, reward({}, ['grave-moss'])), choice('leave', 'Leave it sealed', 'Keep the hold clear and move on.', {}, reward())]],
  ['root-cellar', 'Root Cellar', 'A dead garden still has one living bulb under its floor.', [choice('harvest', 'Harvest the bulb', 'Trade oxygen for a hungry stomach.', { oxygen: 1 }, reward({}, ['bloom-stomach'])), choice('leave', 'Leave it sealed', 'Keep the hold clear and move on.', {}, reward())]],
  ['pollinator', 'Lost Pollinator', 'A tiny machine swarm is trapped in a greenhouse corridor.', [choice('rescue', 'Rescue it', 'Spend biomass to gain a resonant polyp.', { biomass: 1 }, reward({}, ['echo-polyp'])), choice('leave', 'Leave it sealed', 'Keep the hold clear and move on.', {}, reward())]],
  ['scrubber-cache', 'Scrubber Cache', 'A salvage crate still contains a clean oxygen scrubber.', [choice('claim', 'Claim the scrubber', 'Pay two power for a reliable oxygen machine.', { power: 2 }, reward({}, ['scrubber'])), choice('leave', 'Leave the crate', 'Keep the hold clear and move on.', {}, reward())]],
  ['radiator-cache', 'Radiator Cache', 'A radiator fan is bolted to a derelict service spine.', [choice('claim', 'Claim the radiator', 'Pay one power to bring cooling aboard.', { power: 1 }, reward({}, ['radiator'])), choice('leave', 'Leave the crate', 'Keep the hold clear and move on.', {}, reward())]],
  ['reactor-coil', 'Reactor Coil', 'A spare coil hums in a sealed maintenance locker.', [choice('strip', 'Strip the coil', 'Take a radiovore that can turn food into current.', { biomass: 1 }, reward({}, ['radiovore'])), choice('leave', 'Leave the coil', 'Keep the hold clear and move on.', {}, reward())]],
  ['hull-plate', 'Hull Plate', 'The wreck has a living repair organism fused to its inner skin.', [choice('cut it free', 'Cut it free', 'Spend hull integrity to gain a leech.', { hull: 2 }, reward({}, ['hull-leech'])), choice('leave', 'Leave it fused', 'Keep the hold clear and move on.', {}, reward())]],
  ['ice-vent', 'Ice Vent', 'A cold vent has become a home for a frost lichen.', [choice('gather', 'Gather the lichen', 'Spend oxygen to bring cooling biology aboard.', { oxygen: 1 }, reward({}, ['frost-lichen'])), choice('leave', 'Leave the vent', 'Keep the hold clear and move on.', {}, reward())]],
  ['solar-bloom', 'Solar Bloom', 'A radiation-fed coral opens in the wreckage.', [choice('cultivate', 'Cultivate it', 'Spend oxygen to take a power-producing coral.', { oxygen: 2 }, reward({}, ['sun-coral'])), choice('leave', 'Leave the bloom', 'Keep the hold clear and move on.', {}, reward())]],
  ['fern-screen', 'Fern Screen', 'A shield fern has grown across the only safe passage.', [choice('transplant', 'Transplant it', 'Spend power and oxygen to make the hull safer.', { power: 1, oxygen: 1 }, reward({}, ['shield-fern'])), choice('leave', 'Leave it rooted', 'Keep the hold clear and move on.', {}, reward())]],
  ['cinder-stone', 'Cinder Stone', 'A black stone burns with a flower that remembers heat.', [choice('carry it', 'Carry the stone', 'Spend heat to gain a cinder bloom.', { heat: 3 }, reward({}, ['cinder-bloom'])), choice('leave', 'Leave the stone', 'Keep the hold clear and move on.', {}, reward())]],
  ['spore-grotto', 'Spore Grotto', 'A cave breathes out a cloud of hungry moss.', [choice('bottle it', 'Bottle the moss', 'Spend oxygen to harvest grave moss.', { oxygen: 1 }, reward({}, ['grave-moss'])), choice('leave', 'Leave the grotto', 'Keep the hold clear and move on.', {}, reward())]],
  ['crew-signal', 'Raider Signal', 'A raider crew broadcasts a map to a hidden garden and demands a toll.', [choice('pay-raiders', 'Pay the raiders', 'Spend two power to leave with a living specimen.', { power: 2 }, reward({}, ['grave-moss'])), choice('bribe-raiders', 'Bribe the raiders', 'Spend two biomass to buy four oxygen and a clean escape.', { biomass: 2 }, reward({ oxygen: 4 })), choice('leave', 'Ignore the signal', 'Keep the hold clear and move on.', {}, reward())]],
  ['debris-tender', 'Pirate Tender', 'A pirate tender has a working radiator in its belly and a hull gun trained on the ark.', [choice('tow it', 'Tow it aboard', 'Sacrifice two hull to recover a radiator.', { hull: 2 }, reward({}, ['radiator'])), choice('burn engines', 'Burn the engines', 'Spend two oxygen to force the tender away and gain three power.', { oxygen: 2 }, reward({ power: 3 })), choice('leave', 'Leave the tender', 'Keep the hold clear and move on.', {}, reward())]],
  ['old-medbay', 'Old Medbay', 'A medbay cultures a hungry bloom stomach and still has emergency repair tools.', [choice('recover', 'Recover the culture', 'Spend biomass to take the stomach aboard.', { biomass: 1 }, reward({}, ['bloom-stomach'])), choice('stabilize', 'Stabilize the hull', 'Spend two power to repair four hull before departing.', { power: 2 }, reward({ hull: 4 })), choice('leave', 'Leave the medbay', 'Keep the hold clear and move on.', {}, reward())]],
  ['quiet-engine', 'Quiet Engine', 'A quiet engine room still has an oxygen scrubber in its service bay.', [choice('open the room', 'Open the room', 'Spend power to recover the scrubber.', { power: 1 }, reward({}, ['scrubber'])), choice('leave', 'Leave the room', 'Keep the hold clear and move on.', {}, reward())]],
  ['lichen-wall', 'Lichen Wall', 'An ice wall is threaded with frost lichen.', [choice('peel it free', 'Peel it free', 'Spend biomass to make the lichen settle.', { biomass: 1 }, reward({}, ['frost-lichen'])), choice('leave', 'Leave the wall', 'Keep the hold clear and move on.', {}, reward())]],
  ['radiovore-nest', 'Radiovore Nest', 'The anomaly pulses with a radiovore nest.', [choice('take one', 'Take one', 'Spend biomass to gain a solar feeder.', { biomass: 1 }, reward({}, ['radiovore'])), choice('leave', 'Leave the nest', 'Keep the hold clear and move on.', {}, reward())]],
];

export const ENCOUNTERS = Object.freeze(encounterSpecs.map(([id, title, text, choices]) => Object.freeze({ id, title, text, choices: Object.freeze(choices), hazardConsequences: Object.freeze({ solar: 'heat', debris: 'hull', spores: 'oxygen' }) })));

export const SYSTEM_NAMES = Object.freeze(['Launch', 'Mossway', 'Salvage Belt', 'Lumen Reach', 'Quiet Dark', 'Red Garden', 'Glasswake', 'Cinder Line', 'Last Relay', 'Arrival']);

export { RESOURCE_KEYS };
