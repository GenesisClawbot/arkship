import {
  CATALOG,
  ENCOUNTERS,
  HAZARDS,
  MODULES,
  MUTATIONS,
  ORGANISMS,
  RESOURCE_KEYS,
  SYSTEM_NAMES,
} from './content.js';

const GRID_SIZE = 20;
const CARGO_LIMIT = 8;
const MAX_ARCHIVE_ITEMS = 256;
const MAX_BLUEPRINTS = 12;
const MAX_PLAN_HISTORY = 32;
const MAX_COUNTER = 1_000_000;
const MODERN_RULESET = 4;
const CAPACITY_RULESET = 5;
const RESCUE_STOPS = Object.freeze([4, 6, 8]);
const RESCUE_HAZARDS = Object.freeze(['solar', 'debris', 'spores']);
const INITIAL_OPEN_BAYS = Object.freeze([1, 2, 6, 7, 8, 11, 12, 13, 16, 17]);
const BASE_CAPS = Object.freeze({ power: 30, oxygen: 30, biomass: 30, heat: 40, hull: 30 });
const PHASES = new Set(['route', 'encounter', 'build', 'report', 'ended']);
const BRANCHES = new Set(MUTATIONS.map((mutation) => mutation.id));
const ORGANISM_IDS = new Set(ORGANISMS.map((item) => item.id));
const ANCHORED = Object.freeze({ engine: 17, reactor: 12, crew: 7 });
const STARTING_MODULES = Object.freeze({ ...ANCHORED, storage: 11, hydroponics: 6 });
const ROUTE_FIELDS = Object.freeze(['id', 'name', 'kind', 'hazard', 'reward', 'description']);
const V5_RUN_FIELDS = new Set([
  'version', 'ruleset', 'acceptedRescues', 'seed', 'system', 'phase', 'resources', 'crew', 'grid', 'cargo',
  'route', 'encounterId', 'discoveries', 'mutations', 'synergies', 'log', 'lastReport', 'outcome', 'ending',
  'runId', 'nextUid', 'turn', 'decisions', 'repairsThisTurn', 'notice', 'openBays', 'provenance',
  'establishedUids', 'seedUids', 'launchSeedKeys', 'plan', 'banking', 'lastSimulation',
]);
const OPTIONAL_OPERATION_IDS = new Set(['hydroponics', 'radiator', 'scrubber', ...ORGANISM_IDS]);
const PORT_EXCHANGES = Object.freeze({
  'power-for-food': Object.freeze({ power: -6, oxygen: 0, biomass: 4, heat: 0, hull: 0 }),
  'food-for-power': Object.freeze({ power: 6, oxygen: 0, biomass: -4, heat: 0, hull: 0 }),
});
const SYNERGY_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'lung-hydroponics', name: 'Warm garden', ids: ['void-lung', 'hydroponics'], text: 'Void Lung feeds adjacent hydroponics: +2 food.', delta: { biomass: 2 } }),
  Object.freeze({ id: 'moss-crew', name: 'Living provisions', ids: ['grave-moss', 'crew'], text: 'Grave Moss feeds the crew quarters: +1 food.', delta: { biomass: 1 } }),
  Object.freeze({ id: 'lichen-lung', name: 'Cold breath', ids: ['frost-lichen', 'void-lung'], text: 'Frost Lichen cools an adjacent Void Lung: −2 heat.', delta: { heat: -2 } }),
  Object.freeze({ id: 'coral-radiator', name: 'Shared current', ids: ['sun-coral', 'radiator'], text: 'Sun Coral shares current with the radiator: +1 power.', delta: { power: 1 } }),
  Object.freeze({ id: 'stomach-moss', name: 'Root feast', ids: ['bloom-stomach', 'grave-moss'], text: 'Bloom Stomach feeds beside Grave Moss: +2 food.', delta: { biomass: 2 } }),
  Object.freeze({ id: 'fern-crew', name: 'Sheltered air', ids: ['shield-fern', 'crew'], text: 'Shield Fern oxygenates the crew quarters: +1 oxygen.', delta: { oxygen: 1 } }),
  Object.freeze({ id: 'leech-storage', name: 'Stocked repair', ids: ['hull-leech', 'storage'], text: 'Hull Leech repairs beside storage: +1 hull.', delta: { hull: 1 } }),
  Object.freeze({ id: 'polyp-lung', name: 'Echoing breath', ids: ['echo-polyp', 'void-lung'], text: 'Echo Polyp amplifies an adjacent Void Lung: +2 oxygen.', delta: { oxygen: 2 } }),
]);
const SYNERGY_IDS = new Set(SYNERGY_DEFINITIONS.map((item) => item.id));

const copy = (value) => JSON.parse(JSON.stringify(value));
const sum = (a, b) => Object.fromEntries(RESOURCE_KEYS.map((key) => [key, (a[key] ?? 0) + (b[key] ?? 0)]));
const negate = (value) => Object.fromEntries(RESOURCE_KEYS.map((key) => [key, (value[key] ?? 0) === 0 ? 0 : -value[key]]));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function hash(input) {
  let value = 2166136261;
  for (const character of String(input)) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function specimenUid(seed, n) {
  return `${seed}:${String(n).padStart(4, '0')}`;
}

function makeSpecimen(seed, nextUid, id) {
  return { uid: specimenUid(seed, nextUid), id, mutation: null, age: 0, solarExposures: 0, active: false };
}

function makeFlow(values = {}) {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, values[key] ?? 0]));
}

function genomeMutation(value) {
  return value === 'base' ? null : value;
}

function mutationKey(value) {
  return value ?? 'base';
}

function provenanceFor(record, source, sourceRunId = null, acquiredThisRun = false) {
  return {
    speciesId: record.id,
    source,
    sourceRunId,
    initialMutation: record.mutation,
    acquiredThisRun,
  };
}

function moduleSpecimen(seed, id) {
  return { uid: `${seed}:module-${id}`, id, mutation: null, age: 0, solarExposures: 0, active: false };
}

function routeKindIndex(kind) {
  return ['garden', 'salvage', 'anomaly'].indexOf(kind);
}

function isModernRuleset(ruleset) {
  return ruleset === MODERN_RULESET || ruleset === CAPACITY_RULESET;
}

function routeHazard(seed, system, kind) {
  const routeHash = hash(`${seed}:${system}:hazard`);
  return RESCUE_HAZARDS[(routeHash + routeKindIndex(kind)) % RESCUE_HAZARDS.length];
}

function rescueHazards(seed) {
  const hazards = [...RESCUE_HAZARDS];
  for (let index = hazards.length - 1; index > 0; index -= 1) {
    const swap = hash(`${seed}:rescue-schedule:${index}`) % (index + 1);
    [hazards[index], hazards[swap]] = [hazards[swap], hazards[index]];
  }
  return hazards;
}

export function getRescueSchedule(state) {
  if (state?.ruleset !== CAPACITY_RULESET || !boundedString(state.seed, 40)) return [];
  return rescueHazards(state.seed).map((hazard, index) => {
    const system = RESCUE_STOPS[index];
    const kind = ['garden', 'salvage', 'anomaly'].find((candidate) => routeHazard(state.seed, system, candidate) === hazard);
    return { system, hazard, routeId: `${system}-${kind}`, people: 6 };
  });
}

export function getLifeSupport(state, people = state?.crew) {
  const living = Math.max(0, Number.isInteger(people) ? people : 0);
  const proportional = state?.ruleset === CAPACITY_RULESET || arguments.length > 1;
  return {
    people: living,
    oxygen: proportional ? Math.ceil((2 * living) / 3) : 4,
    biomass: proportional ? Math.ceil(living / 2) : 3,
  };
}

export function getPeopleRecord(state) {
  const accepted = state?.ruleset === CAPACITY_RULESET && Array.isArray(state.acceptedRescues) ? state.acceptedRescues.length : 0;
  const embarked = 6 + accepted * 6;
  const aboard = Math.max(0, Number.isInteger(state?.crew) ? state.crew : 0);
  return {
    aboard,
    embarked,
    lost: Math.max(0, embarked - aboard),
    delivered: state?.outcome === 'win' ? aboard : 0,
  };
}

function routeFor(state, kind) {
  const hazard = routeHazard(state.seed, state.system, kind);
  const names = { garden: 'Verdant Garden', salvage: 'Salvage Belt', anomaly: 'Radiant Anomaly' };
  const rescue = getRescueSchedule(state).find((entry) => entry.system === state.system && entry.routeId === `${state.system}-${kind}`);
  if (rescue) {
    return {
      id: rescue.routeId,
      name: names[kind],
      kind,
      hazard,
      reward: 'survivors',
      description: `${names[kind]} carries a rescue signal from six survivors and ${HAZARDS.find((item) => item.id === hazard).name.toLowerCase()}.`,
    };
  }
  const used = new Set((state.log ?? []).map((report) => report.encounterId).filter(Boolean));
  const encounter = ENCOUNTERS[encounterIndexFor(state, kind, used)];
  const offered = encounter?.choices.find((choice) => choice.reward.items.length > 0)?.reward.items[0] ?? 'supplies';
  return {
    id: `${state.system}-${kind}`,
    name: names[kind],
    kind,
    hazard,
    reward: offered,
    description: `${names[kind]} offers ${CATALOG[offered]?.name ?? 'supplies'} and carries ${HAZARDS.find((item) => item.id === hazard).name.toLowerCase()}.`,
  };
}

function notice(state, message) {
  if (!state || typeof state !== 'object') return { notice: message };
  const next = copy(state);
  next.notice = message;
  return next;
}

function resourceCostAffordable(resources, cost) {
  return RESOURCE_KEYS.every((key) => (resources[key] ?? 0) >= (cost[key] ?? 0));
}

function resourcesWithCaps(state, resources) {
  const caps = getCaps(state);
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, clamp(resources[key] ?? 0, 0, caps[key])]));
}

function rewardItems(choice) {
  return choice.reward?.items ?? [];
}

export function createRun(seed, archive = {}, seedKeys = [], options = {}) {
  const boundedSeed = String(seed ?? 'arkship').slice(0, 40) || 'arkship';
  const upgradedArchive = upgradeArchive(archive);
  const optionKeys = isRecord(options) ? Object.keys(options) : [];
  const selectedRuleset = optionKeys.length === 1 && optionKeys[0] === 'ruleset' && [MODERN_RULESET, CAPACITY_RULESET].includes(options.ruleset)
    ? options.ruleset
    : null;
  const modern = selectedRuleset !== null;
  if (!upgradedArchive || !Array.isArray(seedKeys) || seedKeys.length > 2 || new Set(seedKeys).size !== seedKeys.length
    || !isRecord(options) || (optionKeys.length !== 0 && !modern)) return null;
  const selected = seedKeys.map((key) => upgradedArchive.genomes.find((genome) => genome.key === key));
  if (selected.some((genome) => !genome)) return null;
  const sequence = upgradedArchive.sequence;
  let nextUid = 1;
  const cargo = [];
  const provenance = {};
  const seedUids = [];
  if (!selected.length) {
    const lung = makeSpecimen(boundedSeed, nextUid++, 'void-lung');
    cargo.push(lung);
    provenance[lung.uid] = provenanceFor(lung, 'starter');
  } else {
    for (const genome of selected) {
      const record = makeSpecimen(boundedSeed, nextUid++, genome.id);
      record.mutation = genomeMutation(genome.mutation);
      cargo.push(record);
      seedUids.push(record.uid);
      provenance[record.uid] = provenanceFor(record, 'inherited', genome.sourceRunId);
    }
  }
  const radiator = makeSpecimen(boundedSeed, nextUid++, 'radiator');
  cargo.push(radiator);
  provenance[radiator.uid] = provenanceFor(radiator, 'starter');
  const grid = Array(GRID_SIZE).fill(null);
  const establishedUids = [];
  for (const [id, index] of Object.entries(STARTING_MODULES)) {
    const record = moduleSpecimen(boundedSeed, id);
    grid[index] = record;
    establishedUids.push(record.uid);
    provenance[record.uid] = provenanceFor(record, 'starter');
  }
  return {
    version: 2,
    ...(modern ? { ruleset: selectedRuleset } : {}),
    ...(selectedRuleset === CAPACITY_RULESET ? { acceptedRescues: [] } : {}),
    seed: boundedSeed,
    system: 1,
    phase: 'route',
    resources: { power: 14, oxygen: 12, biomass: 14, heat: 3, hull: 30 },
    crew: 6,
    grid,
    cargo,
    route: null,
    encounterId: null,
    discoveries: [],
    mutations: [],
    synergies: [],
    log: [],
    lastReport: null,
    outcome: null,
    ending: null,
    runId: `${boundedSeed}-${sequence + 1}`,
    nextUid,
    turn: 0,
    decisions: 0,
    repairsThisTurn: 0,
    notice: '',
    openBays: [...INITIAL_OPEN_BAYS],
    provenance,
    establishedUids: establishedUids.sort(),
    seedUids: seedUids.sort(),
    launchSeedKeys: [...seedKeys],
    plan: null,
    banking: { status: 'none', limit: 0, eligibleKeys: [], receipt: null },
    lastSimulation: null,
  };
}

export function getCrossing(state, system = state?.system) {
  const normal = {
    id: 'normal',
    name: 'Normal space',
    start: 1,
    end: isModernRuleset(state?.ruleset) ? 3 : 9,
    reactorPower: 6,
    heat: 0,
    description: 'Standard reactor output and no crossing heat.',
  };
  if (!isModernRuleset(state?.ruleset) || !Number.isInteger(system) || system <= 3) return normal;
  const firstId = hash(`${state.seed}:crossings`) % 2 === 0 ? 'ion' : 'irradiation';
  const segmentStart = system <= 6 ? 4 : 7;
  const id = segmentStart === 4 ? firstId : firstId === 'ion' ? 'irradiation' : 'ion';
  if (id === 'ion') {
    return {
      id,
      name: 'Ion interference',
      start: segmentStart,
      end: segmentStart + 2,
      reactorPower: 2,
      heat: 0,
      description: 'Ion interference reduces Reactor output from 6 to 2 power.',
    };
  }
  return {
    id,
    name: 'Irradiated crossing',
    start: segmentStart,
    end: segmentStart + 2,
    reactorPower: 6,
    heat: 4,
    description: 'Irradiation adds 4 heat before the local route hazard.',
  };
}

export function getPortExchange(state) {
  const available = isModernRuleset(state?.ruleset) && state.phase === 'build' && [4, 7].includes(state.system) && Boolean(state.plan);
  const selected = available && PORT_EXCHANGES[state.plan?.pendingExchange] ? state.plan.pendingExchange : null;
  return {
    available,
    selected,
    flow: { ...(selected ? PORT_EXCHANGES[selected] : makeFlow()) },
  };
}

export function getRoutes(state) {
  if (!state || state.system < 1 || state.system > 9) return [];
  return ['garden', 'salvage', 'anomaly'].map((kind) => routeFor(state, kind));
}

const ENCOUNTER_POOLS = Object.freeze({
  garden: ['seed-vault', 'root-cellar', 'hull-plate', 'fern-screen', 'spore-grotto', 'old-medbay', 'crew-signal', 'lichen-wall'],
  salvage: ['scrubber-cache', 'radiator-cache', 'debris-tender', 'quiet-engine', 'reactor-coil', 'old-medbay', 'radiator-cache', 'hull-plate'],
  anomaly: ['reactor-coil', 'ice-vent', 'pollinator', 'cinder-stone', 'solar-bloom', 'radiovore-nest', 'lichen-wall', 'fern-screen'],
});

function encounterIndexFor(state, kind, used) {
  const guaranteed = kind === 'salvage' && state.system <= 2 ? (state.system === 1 ? 'scrubber-cache' : 'quiet-engine') : null;
  const pool = guaranteed ? [guaranteed, ...(ENCOUNTER_POOLS[kind] ?? [])] : (ENCOUNTER_POOLS[kind] ?? []);
  const start = guaranteed ? 0 : hash(`${state.seed}:${state.system}:${kind}`) % Math.max(1, pool.length);
  for (let offset = 0; offset < pool.length; offset += 1) {
    const id = pool[(start + offset) % pool.length];
    const index = ENCOUNTERS.findIndex((encounter) => encounter.id === id);
    if (index >= 0 && !used.has(id)) return index;
  }
  const preferred = hash(`${state.seed}:${state.system}:${kind}`) % ENCOUNTERS.length;
  for (let offset = 0; offset < ENCOUNTERS.length; offset += 1) {
    const index = (preferred + offset) % ENCOUNTERS.length;
    if (!used.has(ENCOUNTERS[index].id)) return index;
  }
  return preferred;
}

function rescueForRoute(state, route) {
  if (!route) return null;
  return getRescueSchedule(state).find((entry) => entry.system === state.system && entry.routeId === route.id) ?? null;
}

function encounterIdFor(state, route) {
  const rescue = rescueForRoute(state, route);
  if (rescue) return `rescue-${rescue.system}`;
  const used = new Set((state.log ?? []).map((report) => report.encounterId).filter(Boolean));
  return ENCOUNTERS[encounterIndexFor(state, route?.kind ?? 'garden', used)]?.id ?? null;
}

export function getRescueOpportunity(state, route = state?.route) {
  const rescue = rescueForRoute(state, route);
  if (!rescue) return null;
  const accepted = state.acceptedRescues?.includes(rescue.system) === true;
  const routeSelectable = state.phase === 'route';
  const encounterSelectable = state.phase === 'encounter' && state.route?.id === rescue.routeId && state.encounterId === `rescue-${rescue.system}`;
  return {
    ...rescue,
    accepted,
    available: !accepted && (routeSelectable || encounterSelectable),
  };
}

const RESCUE_CHOICES = Object.freeze([
  Object.freeze({
    id: 'accept-rescue',
    label: 'Connect the lifeboats: +6 people',
    description: 'Bring six survivors aboard. Their oxygen and food demand begins with this jump.',
    cost: Object.freeze({ power: 0, oxygen: 0, biomass: 0, heat: 0, hull: 0 }),
    reward: Object.freeze({ resources: Object.freeze({ power: 0, oxygen: 0, biomass: 0, heat: 0, hull: 0 }), items: Object.freeze([]) }),
  }),
  Object.freeze({
    id: 'decline-rescue',
    label: 'Continue without docking',
    description: 'Leave the signal behind without taking supplies or cargo.',
    cost: Object.freeze({ power: 0, oxygen: 0, biomass: 0, heat: 0, hull: 0 }),
    reward: Object.freeze({ resources: Object.freeze({ power: 0, oxygen: 0, biomass: 0, heat: 0, hull: 0 }), items: Object.freeze([]) }),
  }),
]);

function choiceDisabled(state, item) {
  const cost = item.cost ?? {};
  if (!resourceCostAffordable(state.resources, cost)) return { disabled: true, disabledReason: 'You cannot pay that cost.' };
  const items = rewardItems(item);
  if (state.cargo.length + items.length > CARGO_LIMIT) return { disabled: true, disabledReason: 'Cargo is full.' };
  return { disabled: false, disabledReason: '' };
}

export function getEncounter(state) {
  if (state?.phase !== 'encounter' || !state.encounterId) return null;
  const rescue = getRescueOpportunity(state);
  if (rescue && state.encounterId === `rescue-${rescue.system}`) {
    return {
      id: state.encounterId,
      title: 'Lifeboat signal',
      text: `Six survivors are adrift in the ${HAZARDS.find((item) => item.id === rescue.hazard)?.name.toLowerCase()}. Docking connects their life support to the ark.`,
      choices: RESCUE_CHOICES.map((item) => ({ ...copy(item), ...choiceDisabled(state, item) })),
    };
  }
  const source = ENCOUNTERS.find((encounter) => encounter.id === state.encounterId);
  if (!source) return null;
  return {
    id: source.id,
    title: source.title,
    text: source.text,
    choices: source.choices.map((item) => ({
      ...copy(item),
      ...choiceDisabled(state, item),
    })),
  };
}

export function getCaps(state) {
  const hasStorage = state?.grid?.some((item) => item?.id === 'storage');
  return {
    power: BASE_CAPS.power + (hasStorage ? 10 : 0),
    oxygen: BASE_CAPS.oxygen + (hasStorage ? 10 : 0),
    biomass: BASE_CAPS.biomass + (hasStorage ? 10 : 0),
    heat: BASE_CAPS.heat,
    hull: BASE_CAPS.hull,
  };
}

function adjustMainOutput(output, item, amount) {
  const key = item.mainOutput;
  if (output[key] < 0) output[key] -= amount;
  else output[key] = Math.max(0, output[key] + amount);
}

export function getItemStats(specimen, context = { symbioticActive: false }) {
  context = context ?? { symbioticActive: false };
  const item = CATALOG[specimen?.id];
  if (!item) return { input: { ...Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0])) }, output: { ...Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0])) }, mainOutput: 'defence', defence: 0 };
  const input = { ...item.input };
  const output = { ...item.output };
  let defence = item.defence;
  if (specimen?.mutation === 'efficient') {
    const largest = RESOURCE_KEYS.reduce((selected, key) => input[key] > input[selected] ? key : selected, 'power');
    if (input[largest] > 0) input[largest] = Math.floor(input[largest] / 2);
    if (item.mainOutput === 'defence') defence = Math.max(1, item.defence - 2);
    else if (output[item.mainOutput] < 0) output[item.mainOutput] = Math.min(-1, output[item.mainOutput] + 2);
    else if (output[item.mainOutput] > 0) output[item.mainOutput] = Math.max(1, output[item.mainOutput] - 2);
    if (item.id === 'cinder-bloom') output.biomass = 0;
  }
  if (item.id === 'radiovore' && (context.hazard === 'solar' || context.route?.hazard === 'solar')) {
    output.power += specimen?.mutation === 'efficient' ? 2 : 5;
  }
  if (specimen?.mutation === 'feral') {
    if (context.ruleset === CAPACITY_RULESET && item.id === 'frost-lichen') {
      input.biomass = 2;
      output.heat = -8;
    } else {
      if (item.mainOutput === 'defence') defence += 3;
      else adjustMainOutput(output, item, 3);
      output.heat += 3;
    }
  }
  if (specimen?.mutation === 'symbiotic') {
    if (item.mainOutput === 'defence') defence = Math.max(0, defence + (context.symbioticActive ? 2 : -1));
    else adjustMainOutput(output, item, context.symbioticActive ? 2 : -1);
  }
  return { input, output, mainOutput: item.mainOutput, defence };
}

export function neighbours(index) {
  if (!Number.isInteger(index) || index < 0 || index >= GRID_SIZE) return [];
  const row = Math.floor(index / 5);
  const col = index % 5;
  const result = [];
  if (row > 0) result.push(index - 5);
  if (col > 0) result.push(index - 1);
  if (col < 4) result.push(index + 1);
  if (row < 3) result.push(index + 5);
  return result;
}

function addEvent(events, type, source, text, delta = {}) {
  events.push({ type, source, text, delta: { ...Object.fromEntries(RESOURCE_KEYS.map((key) => [key, delta[key] ?? 0])) } });
}

function addResources(resources, delta) {
  for (const key of RESOURCE_KEYS) resources[key] += delta[key] ?? 0;
}

function resourcePhrase(values, direction) {
  const labels = { biomass: 'food' };
  const entries = RESOURCE_KEYS.filter((key) => (values[key] ?? 0) !== 0).map((key) => `${Math.abs(values[key])} ${labels[key] ?? key}`);
  if (!entries.length) return '';
  const joined = entries.length === 1 ? entries[0] : `${entries.slice(0, -1).join(', ')} and ${entries.at(-1)}`;
  return `${direction} ${joined}`;
}

function activationText(item, stats) {
  const parts = [];
  const used = resourcePhrase(stats.input, 'uses');
  const gains = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Math.max(0, stats.output[key] ?? 0)]));
  const reductions = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Math.min(0, stats.output[key] ?? 0)]));
  const added = resourcePhrase(gains, 'adds');
  const removed = resourcePhrase(reductions, 'removes');
  if (used) parts.push(used);
  if (added) parts.push(added);
  if (removed) parts.push(removed);
  return `${CATALOG[item.id].name} ${parts.join('; ')}.`;
}

function missingResourceText(item, stats, available) {
  const key = RESOURCE_KEYS.find((resource) => available[resource] < stats.input[resource]);
  return `${CATALOG[item.id].name} is dormant: needs ${stats.input[key]} ${key === 'biomass' ? 'food' : key}; ${available[key]} available.`;
}

function rateList(values, signed = false) {
  const labels = { biomass: 'food' };
  const entries = RESOURCE_KEYS.filter((key) => (values[key] ?? 0) !== 0).map((key) => {
    const value = values[key];
    const amount = signed ? (value > 0 ? `+${value}` : `−${Math.abs(value)}`) : Math.abs(value);
    return `${amount} ${labels[key] ?? key}`;
  });
  return entries.length ? entries.join(', ') : 'none';
}

function nominalMutationComparison(record, branch, context = {}) {
  const before = getItemStats(record, context);
  const after = getItemStats({ ...record, mutation: branch }, context);
  return `input ${rateList(before.input)}→${rateList(after.input)}; output ${rateList(before.output, true)}→${rateList(after.output, true)}; defence ${before.defence}→${after.defence}`;
}

function actualRateText(report) {
  return `input ${rateList(report.inputs)}; output ${rateList(report.outputs, true)}; defence ${report.defence}`;
}

function nominalRateText(record, context = {}) {
  const stats = getItemStats(record, context);
  return `input ${rateList(stats.input)}; output ${rateList(stats.output, true)}; defence ${stats.defence}`;
}

export function getSymbioticNeighbours(grid, index) {
  const item = grid[index];
  if (!item) return [];
  return neighbours(index).filter((near) => grid[near]?.active && ORGANISM_IDS.has(grid[near].id) && grid[near].id !== item.id);
}

function applyPairEffects(grid, resources, events, synergies, cellReports = null) {
  const apply = (source, text, delta, type = 'synergy') => {
    addResources(resources, delta);
    addEvent(events, type, source, text, delta);
  };
  for (let a = 0; a < grid.length; a += 1) {
    if (!grid[a]?.active) continue;
    for (const b of neighbours(a)) {
      if (b <= a || !grid[b]?.active) continue;
      const left = grid[a];
      const right = grid[b];
      const ids = new Set([left.id, right.id]);
      const pair = `${Math.min(a, b)}:${Math.max(a, b)}`;
      for (const definition of SYNERGY_DEFINITIONS) {
        if (!definition.ids.every((id) => ids.has(id))) continue;
        apply(pair, definition.text, definition.delta);
        synergies.push({
          id: definition.id,
          name: definition.name,
          a: left.uid,
          b: right.uid,
          text: definition.text,
          delta: { ...Object.fromEntries(RESOURCE_KEYS.map((key) => [key, definition.delta[key] ?? 0])) },
        });
        if (cellReports) {
          cellReports[a].localTargets.push({ index: b, uid: right.uid, kind: 'synergy', text: definition.text });
          cellReports[b].localTargets.push({ index: a, uid: left.uid, kind: 'synergy', text: definition.text });
        }
      }
      if (left.id === 'void-lung' && right.id === 'void-lung') {
        const text = 'Clustered Void Lungs add 2 heat.';
        apply(pair, text, { heat: 2 }, 'danger');
        if (cellReports) {
          cellReports[a].localTargets.push({ index: b, uid: right.uid, kind: 'danger', text });
          cellReports[b].localTargets.push({ index: a, uid: left.uid, kind: 'danger', text });
        }
      }
      if (left.id === 'cinder-bloom' && right.id === 'cinder-bloom') {
        const text = 'Clustered Cinder Blooms add 2 heat.';
        apply(pair, text, { heat: 2 }, 'danger');
        if (cellReports) {
          cellReports[a].localTargets.push({ index: b, uid: right.uid, kind: 'danger', text });
          cellReports[b].localTargets.push({ index: a, uid: left.uid, kind: 'danger', text });
        }
      }
    }
  }
}

const DRAFT_FIELDS = Object.freeze([
  'grid', 'cargo', 'openBays', 'nextUid', 'discoveries', 'mutations', 'synergies',
  'provenance', 'establishedUids', 'seedUids',
]);

function draftSnapshot(state) {
  const snapshot = Object.fromEntries(DRAFT_FIELDS.map((key) => [key, copy(state[key])]));
  snapshot.pendingRepairs = state.plan?.pendingRepairs ?? 0;
  snapshot.refitPurchases = state.plan?.refitPurchases ?? 0;
  if (isModernRuleset(state.ruleset)) snapshot.pendingExchange = state.plan?.pendingExchange ?? null;
  return snapshot;
}

function planBaseline(state) {
  const baseline = Object.fromEntries(DRAFT_FIELDS.map((key) => [key, copy(state[key])]));
  baseline.resources = copy(state.resources);
  baseline.usedRepairs = state.repairsThisTurn ?? 0;
  return baseline;
}

function beginPlan(state) {
  state.plan = {
    baseline: planBaseline(state),
    pendingRepairs: 0,
    refitPurchases: 0,
    ...(isModernRuleset(state.ruleset) ? { pendingExchange: null } : {}),
    history: [],
  };
  return state;
}

function pushDraft(next, state) {
  next.plan.history = [...state.plan.history, draftSnapshot(state)].slice(-MAX_PLAN_HISTORY);
}

function recordLocation(container, uid) {
  const gridIndex = container.grid.findIndex((item) => item?.uid === uid);
  if (gridIndex >= 0) return `grid:${gridIndex}`;
  if (container.cargo.some((item) => item.uid === uid)) return 'cargo';
  return 'absent';
}

function recordForUid(container, uid) {
  return container.grid.find((item) => item?.uid === uid) ?? container.cargo.find((item) => item.uid === uid) ?? null;
}

function getPlanBaseFoodCost(plan) {
  return plan.reclaimedBays.length * 4
    + plan.uprootedUids.length * 2
    + plan.seedGrowth.length * 3
    + plan.newMutations.length * 3
    + plan.repairs * 4
    + plan.refitPurchases * 3;
}

export function getPlan(state) {
  const empty = {
    costs: makeFlow(), reclaimedBays: [], newMutations: [], repairs: 0, seedGrowth: [], uprootedUids: [],
    refitUids: [], refitsUsed: 0, refitLimit: 2, refitPurchases: 0, affordable: true,
    valid: true, committable: true, disabledReason: '', historyLength: 0,
  };
  if (!state?.plan?.baseline) return empty;
  const baseline = state.plan.baseline;
  const reclaimedBays = state.openBays.filter((index) => !baseline.openBays.includes(index));
  const refitUids = baseline.establishedUids.filter((uid) => recordLocation(baseline, uid) !== recordLocation(state, uid));
  const uprootedUids = refitUids.filter((uid) => ORGANISM_IDS.has((recordForUid(state, uid) ?? recordForUid(baseline, uid))?.id));
  const seedGrowth = state.seedUids.filter((uid) => state.grid.some((item) => item?.uid === uid));
  const newMutations = [];
  for (const [uid, provenance] of Object.entries(state.provenance)) {
    const before = recordForUid(baseline, uid);
    const after = recordForUid(state, uid);
    if (before && after && before.mutation !== after.mutation && after.mutation && provenance) newMutations.push({ uid, branch: after.mutation });
  }
  const repairs = state.plan.pendingRepairs;
  const refitPurchases = state.plan.refitPurchases;
  const baseCosts = makeFlow({ biomass: getPlanBaseFoodCost({ reclaimedBays, uprootedUids, seedGrowth, newMutations, repairs, refitPurchases }) });
  const exchange = resolvePortExchange(state, baseCosts);
  const costs = exchange.costs;
  const refitLimit = 2 + refitPurchases * 2;
  const allowedService = [4, 7].includes(state.system) || refitPurchases === 0;
  const valid = refitUids.length <= refitLimit && repairs + baseline.usedRepairs <= 2 && refitPurchases <= 2 && allowedService;
  const affordable = exchange.affordable;
  const disabledReason = !valid
    ? refitUids.length > refitLimit ? `This plan needs ${refitUids.length} refits; ${refitLimit} are available.` : 'This plan exceeds the service limit.'
    : !affordable ? exchange.disabledReason || `This plan needs ${baseCosts.biomass} food; ${state.resources.biomass} is available.` : '';
  return {
    costs, reclaimedBays, newMutations, repairs, seedGrowth, uprootedUids, refitUids,
    refitsUsed: refitUids.length, refitLimit, refitPurchases, affordable, valid,
    committable: valid && affordable, disabledReason, historyLength: state.plan.history.length,
  };
}

function resolvePortExchange(state, baseCosts) {
  const selected = getPortExchange(state).selected;
  const initial = makeFlow(state.resources);
  const afterExchange = { ...initial };
  const exchangeDelta = makeFlow();
  let inputAffordable = true;
  let disabledReason = '';
  if (selected) {
    const requested = PORT_EXCHANGES[selected];
    const inputKey = requested.power < 0 ? 'power' : 'biomass';
    const input = Math.abs(requested[inputKey]);
    inputAffordable = afterExchange[inputKey] >= input;
    if (!inputAffordable) disabledReason = `This exchange needs ${input} ${inputKey === 'biomass' ? 'food' : inputKey}; ${afterExchange[inputKey]} is available.`;
    afterExchange[inputKey] -= input;
    exchangeDelta[inputKey] -= input;
    const outputKey = requested.power > 0 ? 'power' : 'biomass';
    const capacity = Math.max(0, getCaps(state)[outputKey] - afterExchange[outputKey]);
    const received = Math.min(requested[outputKey], capacity);
    afterExchange[outputKey] += received;
    exchangeDelta[outputKey] += received;
  }
  const costAffordable = resourceCostAffordable(afterExchange, baseCosts);
  if (!costAffordable && !disabledReason) disabledReason = `This plan needs ${baseCosts.biomass} food; ${afterExchange.biomass} is available after the exchange.`;
  const totalDelta = sum(exchangeDelta, negate(baseCosts));
  return {
    selected,
    exchangeDelta,
    baseCosts,
    costs: negate(totalDelta),
    affordable: inputAffordable && costAffordable,
    disabledReason,
  };
}

function simulateInternal(state, route) {
  const resources = { ...state.resources };
  const grid = state.grid.map((item) => item ? { ...item, active: false } : null);
  const events = [];
  const synergies = [];
  const plan = state.version === 2 ? getPlan(state) : null;
  const dormantUids = new Set(plan?.uprootedUids ?? []);
  const openBays = new Set(state.openBays ?? Array.from({ length: GRID_SIZE }, (_, index) => index));
  const beforeGrid = state.grid.map((item) => item ? { ...item } : null);
  const cellReports = Array.from({ length: GRID_SIZE }, (_, index) => {
    const item = grid[index];
    return {
      index,
      uid: item?.uid ?? null,
      id: item?.id ?? null,
      name: item ? CATALOG[item.id].name : '',
      mutation: item?.mutation ?? null,
      status: item ? 'dormant' : openBays.has(index) ? 'empty' : 'sealed',
      reason: item ? 'Awaiting operation.' : openBays.has(index) ? 'Open bay.' : 'Sealed bay.',
      inputs: makeFlow(), outputs: makeFlow(), defence: 0, localTargets: [],
      trajectory: item ? {
        age: { before: item.age, after: item.age },
        solarExposures: { before: item.solarExposures, after: item.solarExposures },
        mutation: { before: item.mutation, after: item.mutation },
        grewThisJump: false,
      } : { age: null, solarExposures: null, mutation: null, grewThisJump: false },
    };
  });
  let crew = state.crew;
  let nextUid = state.nextUid;
  const caps = getCaps(state);
  const selectedRoute = route ?? state.route;
  const deltaZero = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));

  if (plan) {
    const transaction = resolvePortExchange(state, makeFlow({ biomass: getPlanBaseFoodCost(plan) }));
    if (transaction.selected) {
      addResources(resources, transaction.exchangeDelta);
      const received = transaction.exchangeDelta.power > 0
        ? `${transaction.exchangeDelta.power} power`
        : `${transaction.exchangeDelta.biomass} food`;
      const spent = transaction.exchangeDelta.power < 0
        ? `${Math.abs(transaction.exchangeDelta.power)} power`
        : `${Math.abs(transaction.exchangeDelta.biomass)} food`;
      addEvent(events, 'exchange', transaction.selected, `Port exchange spends ${spent} and receives ${received} after storage caps.`, transaction.exchangeDelta);
    }
    const planDelta = negate(transaction.baseCosts);
    addResources(resources, planDelta);
    const repairedHull = Math.min(plan.repairs * 6, Math.max(0, caps.hull - resources.hull));
    resources.hull += repairedHull;
    planDelta.hull += repairedHull;
    addEvent(events, 'plan', 'refit', `Refit plan spends ${transaction.baseCosts.biomass} food and repairs ${repairedHull} hull.`, planDelta);
    for (const mutation of plan.newMutations) {
      const before = recordForUid(state.plan.baseline, mutation.uid);
      if (!before) continue;
      const branchName = MUTATIONS.find((branch) => branch.id === mutation.branch)?.name ?? mutation.branch;
      const comparison = nominalMutationComparison(before, mutation.branch, { hazard: selectedRoute?.hazard, symbioticActive: false, ruleset: state.ruleset });
      const nominalLabel = mutation.branch === 'symbiotic' ? 'Isolated nominal' : 'Same-condition nominal';
      addEvent(events, 'mutation', mutation.uid, `Planned ${branchName} ${CATALOG[before.id].name} applies this jump. ${nominalLabel} before→after: ${comparison}. Activity depends on supplies and active neighbours.`, {});
    }
  }

  const lifeSupport = getLifeSupport(state);
  const demand = { power: -4, oxygen: -lifeSupport.oxygen, biomass: -lifeSupport.biomass, heat: -3 };
  addResources(resources, demand);
  const demandText = state.ruleset === CAPACITY_RULESET
    ? `Jump uses 4 power, ${lifeSupport.oxygen} oxygen and ${lifeSupport.biomass} food for ${lifeSupport.people} people; passive cooling removes 3 heat.`
    : 'Jump uses 4 power, 4 oxygen and 3 food; passive cooling removes 3 heat.';
  addEvent(events, 'demand', 'jump', demandText, demand);
  const crossing = getCrossing(state);
  const reactor = grid.find((item) => item?.id === 'reactor');
  if (reactor && !dormantUids.has(reactor.uid)) {
    const reactorOutput = { ...CATALOG.reactor.output, power: crossing.reactorPower };
    const reactorStats = getItemStats(reactor, { ruleset: state.ruleset });
    reactorStats.output = reactorOutput;
    addResources(resources, reactorOutput);
    reactor.active = true;
    addEvent(events, 'module', reactor.uid, activationText(reactor, reactorStats), reactorOutput);
    const index = grid.indexOf(reactor);
    cellReports[index].status = 'active';
    cellReports[index].reason = 'Operated this jump.';
    cellReports[index].outputs = makeFlow(reactorOutput);
  }
  for (const item of grid) if (item && ['engine', 'crew', 'storage'].includes(item.id) && !dormantUids.has(item.uid)) {
    item.active = true;
    const report = cellReports[grid.indexOf(item)];
    report.status = 'active';
    report.reason = 'Operated this jump.';
    if (item.id === 'crew' && state.ruleset === CAPACITY_RULESET) {
      report.reason = `Supports ${lifeSupport.people} people this jump.`;
      report.inputs = makeFlow({ oxygen: lifeSupport.oxygen, biomass: lifeSupport.biomass });
    }
  }

  const mechanics = grid.map((item, index) => ({ item, index })).filter(({ item }) => item && ['hydroponics', 'radiator', 'scrubber'].includes(item.id)).sort((a, b) => a.item.uid.localeCompare(b.item.uid));
  const available = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Math.max(0, resources[key])]));
  for (const { item } of mechanics) {
    const index = grid.indexOf(item);
    if (isModernRuleset(state.ruleset) && item.paused === true) {
      cellReports[index].reason = 'Paused by you.';
      continue;
    }
    if (dormantUids.has(item.uid)) {
      cellReports[index].reason = 'Dormant for this jump after refit.';
      continue;
    }
    const stats = getItemStats(item, { ruleset: state.ruleset });
    const affordable = RESOURCE_KEYS.every((key) => available[key] >= stats.input[key]);
    if (!affordable) {
      addEvent(events, 'dormant', item.uid, missingResourceText(item, stats, available), {});
      cellReports[index].reason = missingResourceText(item, stats, available);
      continue;
    }
    for (const key of RESOURCE_KEYS) {
      available[key] -= stats.input[key];
      resources[key] -= stats.input[key];
    }
    addResources(resources, stats.output);
    item.active = true;
    addEvent(events, 'module', item.uid, activationText(item, stats), sum(stats.output, negate(stats.input)));
    cellReports[index].status = 'active';
    cellReports[index].reason = 'Operated this jump.';
    cellReports[index].inputs = makeFlow(stats.input);
    cellReports[index].outputs = makeFlow(stats.output);
  }

  const biologicalBudget = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Math.max(0, resources[key])]));
  const biological = grid.map((item, index) => ({ item, index })).filter(({ item }) => item && ORGANISM_IDS.has(item.id)).sort((a, b) => a.item.uid.localeCompare(b.item.uid));
  for (const { item } of biological) {
    const index = grid.indexOf(item);
    if (isModernRuleset(state.ruleset) && item.paused === true) {
      cellReports[index].reason = 'Paused by you.';
      continue;
    }
    if (dormantUids.has(item.uid)) {
      cellReports[index].reason = 'Dormant for this jump after being uprooted.';
      continue;
    }
    const stats = getItemStats(item, { ruleset: state.ruleset });
    const affordable = RESOURCE_KEYS.every((key) => biologicalBudget[key] >= stats.input[key]);
    if (!affordable) {
      addEvent(events, 'dormant', item.uid, missingResourceText(item, stats, biologicalBudget), {});
      cellReports[index].reason = missingResourceText(item, stats, biologicalBudget);
      continue;
    }
    for (const key of RESOURCE_KEYS) {
      biologicalBudget[key] -= stats.input[key];
      resources[key] -= stats.input[key];
    }
    item.active = true;
  }
  for (const { item, index } of biological) {
    if (!item.active) continue;
    const symbioticActive = item.mutation === 'symbiotic' && getSymbioticNeighbours(grid, index).length > 0;
    const stats = getItemStats(item, { hazard: selectedRoute?.hazard, symbioticActive, ruleset: state.ruleset });
    addResources(resources, stats.output);
    addEvent(events, 'organism', item.uid, activationText(item, stats), sum(stats.output, negate(stats.input)));
    cellReports[index].status = 'active';
    cellReports[index].reason = 'Operated this jump.';
    cellReports[index].inputs = makeFlow(stats.input);
    cellReports[index].outputs = makeFlow(stats.output);
    cellReports[index].defence = stats.defence;
  }

  applyPairEffects(grid, resources, events, synergies, cellReports);

  if (crossing.heat > 0) {
    resources.heat += crossing.heat;
    addEvent(events, 'crossing', crossing.id, `${crossing.name} adds ${crossing.heat} heat before the local hazard.`, { heat: crossing.heat });
  }

  if (selectedRoute?.hazard === 'solar') {
    resources.heat += 5;
    addEvent(events, 'hazard', selectedRoute.hazard, 'Solar radiation adds five heat.', { heat: 5 });
    for (const item of grid) {
      if (!item || item.id !== 'radiovore' || !item.active) continue;
      item.solarExposures = (item.solarExposures ?? 0) + 1;
      if (item.solarExposures % 2 === 0) {
        const eligible = neighbours(grid.indexOf(item)).map((index) => grid[index]).find((other) => other
          && ORGANISM_IDS.has(other.id)
          && !other.mutation
          && !dormantUids.has(other.uid)
          && !(isModernRuleset(state.ruleset) && other.paused === true));
        if (eligible) {
          const targetIndex = grid.indexOf(eligible);
          const report = cellReports[targetIndex];
          const thisJump = report.status === 'active'
            ? `This jump used old rates: ${actualRateText(report)}.`
            : `This jump was ${report.status}; old nominal: ${nominalRateText(eligible, { symbioticActive: false, ruleset: state.ruleset })}.`;
          const nextJump = nominalRateText({ ...eligible, mutation: 'feral' }, { symbioticActive: false, ruleset: state.ruleset });
          eligible.mutation = 'feral';
          const mutationText = `${CATALOG[eligible.id].name} becomes Feral from Radiovore. ${thisJump} Next jump uses Feral nominal: ${nextJump}. Next route may alter rates.`;
          addEvent(events, 'mutation', eligible.uid, mutationText, {});
          cellReports[grid.indexOf(item)].localTargets.push({ index: targetIndex, uid: eligible.uid, kind: 'mutation', text: mutationText });
        }
      }
    }
  } else if (selectedRoute?.hazard === 'debris') {
    let defence = 0;
    for (let index = 0; index < grid.length; index += 1) {
      const item = grid[index];
      if (item?.active && item.id === 'shield-fern') defence += getItemStats(item, { symbioticActive: getSymbioticNeighbours(grid, index).length > 0, ruleset: state.ruleset }).defence;
    }
    const damage = Math.max(0, 4 - defence);
    resources.hull -= damage;
    addEvent(events, 'hazard', selectedRoute.hazard, `Debris strikes for ${damage} hull after shielding.`, { hull: -damage });
  } else if (selectedRoute?.hazard === 'spores') {
    resources.oxygen -= 3;
    addEvent(events, 'hazard', selectedRoute.hazard, 'Spores consume three oxygen.', { oxygen: -3 });
  }

  for (const key of RESOURCE_KEYS) {
    if (resources[key] > caps[key]) {
      const overflow = resources[key] - caps[key];
      resources[key] = caps[key];
      addEvent(events, 'cap', key, `${key === 'biomass' ? 'Food' : key} overflow is vented at the cap.`, { [key]: -overflow });
    }
  }
  const heatDamage = Math.ceil(Math.max(0, resources.heat - 15) / 2);
  if (heatDamage) {
    resources.hull -= heatDamage;
    addEvent(events, 'pressure', 'heat', `Overheat damages ${heatDamage} hull.`, { hull: -heatDamage });
  }
  if (resources.oxygen <= 0) {
    const lost = state.ruleset === CAPACITY_RULESET ? Math.min(2, Math.max(0, crew)) : 2;
    crew -= lost;
    resources.hull -= 4;
    const text = state.ruleset === CAPACITY_RULESET
      ? `Oxygen failure costs ${lost} ${lost === 1 ? 'person' : 'people'} and 4 hull.`
      : 'Oxygen failure costs 2 crew and 4 hull.';
    addEvent(events, 'pressure', 'oxygen', text, { hull: -4 });
  }
  if (resources.biomass <= 0) {
    const lost = state.ruleset === CAPACITY_RULESET ? Math.min(1, Math.max(0, crew)) : 1;
    crew -= lost;
    resources.hull -= 3;
    const text = state.ruleset === CAPACITY_RULESET
      ? `Food failure costs ${lost} ${lost === 1 ? 'person' : 'people'} and 3 hull.`
      : 'Food failure costs 1 crew and 3 hull.';
    addEvent(events, 'pressure', 'biomass', text, { hull: -3 });
  }
  if (resources.power < 0) {
    resources.hull -= 3;
    addEvent(events, 'pressure', 'power', 'Emergency jump costs three hull.', { hull: -3 });
  }
  for (const key of ['power', 'oxygen', 'biomass', 'heat']) {
    if (resources[key] < 0) {
      const recovered = -resources[key];
      resources[key] = 0;
      addEvent(events, 'floor', key, `${key === 'biomass' ? 'Food' : key} is restored to zero after consequences.`, { [key]: recovered });
    }
  }

  const activeBiology = grid.filter((item) => item?.active && ORGANISM_IDS.has(item.id));
  for (const item of activeBiology) item.age = (item.age ?? 0) + 1;
  const mosses = activeBiology.filter((item) => item.id === 'grave-moss');
  const moss = mosses.find((item) => item.age % 3 === 0);
  if (moss) {
    if (resources.biomass > 2) {
      const target = neighbours(grid.indexOf(moss)).find((index) => openBays.has(index) && !grid[index]);
      if (target !== undefined) {
        resources.biomass -= 2;
        const child = makeSpecimen(state.seed, nextUid, 'grave-moss');
        child.active = false;
        grid[target] = child;
        cellReports[target] = {
          index: target, uid: child.uid, id: child.id, name: CATALOG[child.id].name, mutation: null,
          status: 'dormant', reason: 'Grew at the end of this jump.', inputs: makeFlow(), outputs: makeFlow(), defence: 0,
          localTargets: [{ index: grid.indexOf(moss), uid: moss.uid, kind: 'growth', text: 'Grew from adjacent Grave Moss.' }],
          trajectory: { age: { before: 0, after: 0 }, solarExposures: { before: 0, after: 0 }, mutation: { before: null, after: null }, grewThisJump: true },
        };
        cellReports[grid.indexOf(moss)].localTargets.push({ index: target, uid: child.uid, kind: 'growth', text: 'Grows Grave Moss into this bay.' });
        nextUid += 1;
        addEvent(events, 'growth', child.uid, 'Grave Moss spends 2 food and fills one adjacent empty bay.', { biomass: -2 });
      }
    }
  }

  const ending = resources.hull <= 0 || crew <= 0 ? 'collapse' : state.system === 9 ? 'arrival' : null;
  const outcome = ending ? (ending === 'arrival' ? 'win' : 'loss') : null;
  const safeResources = { ...resources };
  const deltas = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, safeResources[key] - state.resources[key]]));
  for (let index = 0; index < GRID_SIZE; index += 1) {
    const before = beforeGrid[index];
    const after = grid[index];
    if (before && after?.uid === before.uid) {
      cellReports[index].trajectory.age.after = after.age;
      cellReports[index].trajectory.solarExposures.after = after.solarExposures;
      cellReports[index].trajectory.mutation.after = after.mutation;
      cellReports[index].mutation = after.mutation;
    }
  }
  const people = state.ruleset === CAPACITY_RULESET ? {
    before: Math.max(0, state.crew),
    after: Math.max(0, crew),
    embarked: getPeopleRecord(state).embarked,
    lost: Math.max(0, state.crew - crew),
  } : null;
  return { before: { ...state.resources }, resources: safeResources, deltas, events, synergies, grid, crew, outcome, ending, nextUid, caps, plan, committable: plan?.committable ?? true, disabledReason: plan?.disabledReason ?? '', cellReports, ...(people ? { people } : {}) };
}

export function simulate(state, route = state?.route) {
  if (!state || !Array.isArray(state.grid)) return null;
  return simulateInternal(state, route);
}

export function previewRoute(state, routeId) {
  if (!state || state.phase !== 'route') return null;
  const route = getRoutes(state).find((item) => item.id === routeId);
  if (!route) return null;
  return { route, ...simulateInternal(copy(state), route) };
}

export function previewRescue(state, routeId, accept = true) {
  if (!state || state.ruleset !== CAPACITY_RULESET || typeof accept !== 'boolean' || !['route', 'encounter'].includes(state.phase)) return null;
  let selected = state;
  if (state.phase === 'route') {
    const route = getRoutes(state).find((item) => item.id === routeId);
    if (!getRescueOpportunity(state, route)?.available) return null;
    selected = act(state, { type: 'SELECT_ROUTE', routeId });
  } else if (state.route?.id !== routeId || !getRescueOpportunity(state)?.available) {
    return null;
  }
  const opportunity = getRescueOpportunity(selected);
  if (!opportunity?.available) return null;
  const resolved = act(selected, { type: 'CHOOSE', choiceId: accept ? 'accept-rescue' : 'decline-rescue' });
  if (resolved.phase !== 'build') return null;
  return {
    route: copy(resolved.route),
    opportunity,
    accepted: accept,
    people: getPeopleRecord(resolved),
    lifeSupport: getLifeSupport(resolved),
    simulation: simulate(resolved),
  };
}

function unavailableFinalDeparture(reason) {
  return {
    available: false,
    reason,
    route: null,
    encounter: null,
    refusal: null,
    immediate: null,
    resolved: null,
    simulation: null,
  };
}

export function previewFinalDeparture(state, routeId) {
  if (state?.ruleset !== CAPACITY_RULESET) return unavailableFinalDeparture('Final departure is available only on ruleset 5.');
  if (!validateRun(state)) return unavailableFinalDeparture('This voyage state is invalid.');
  if (state.phase !== 'route') return unavailableFinalDeparture('Choose the final route before departing.');
  if (state.system !== 9 || state.turn !== 8) return unavailableFinalDeparture('Final departure is available only in system 9.');
  const route = getRoutes(state).find((candidate) => candidate.id === routeId);
  if (!route) return unavailableFinalDeparture('That final route is unavailable.');
  if (route.reward === 'survivors' || getRescueOpportunity(state, route)) return unavailableFinalDeparture('Rescue contacts need an explicit encounter choice.');

  const selected = act(state, { type: 'SELECT_ROUTE', routeId });
  const encounter = getEncounter(selected);
  if (!encounter || encounter.choices.length !== 2) return unavailableFinalDeparture('This contact needs an explicit encounter choice.');
  const refusals = encounter.choices.filter((choice) => choice.id === 'reject');
  const acquisitions = encounter.choices.filter((choice) => choice.id !== 'reject' && rewardItems(choice).length === 1);
  const refusal = refusals[0];
  const acquisition = acquisitions[0];
  if (refusals.length !== 1 || acquisitions.length !== 1 || rewardItems(refusal).length !== 0
    || rewardItems(acquisition)[0] !== route.reward) return unavailableFinalDeparture('This contact needs an explicit encounter choice.');
  if (refusal.disabled) return unavailableFinalDeparture(refusal.disabledReason || 'The canonical refusal is unavailable.');

  const resolved = act(selected, { type: 'CHOOSE', choiceId: refusal.id });
  if (resolved.phase !== 'build' || !validateRun(resolved)) return unavailableFinalDeparture('The refusal does not produce a valid departure plan.');
  const plan = getPlan(resolved);
  const simulation = simulate(resolved);
  if (!plan.committable || !simulation?.committable) return unavailableFinalDeparture(plan.disabledReason || simulation?.disabledReason || 'The final departure plan is invalid.');
  if (simulation.outcome !== 'win') return unavailableFinalDeparture('This final departure does not reach Eos safely.');
  if (simulation.crew !== state.crew) return unavailableFinalDeparture('This final departure would lose people.');

  const forgoneId = rewardItems(acquisition)[0];
  return {
    available: true,
    reason: '',
    route: copy(route),
    encounter: { id: encounter.id, title: encounter.title, text: encounter.text },
    refusal: {
      id: refusal.id,
      label: refusal.label,
      description: refusal.description,
      cost: copy(refusal.cost),
      reward: copy(refusal.reward),
      forgoneItem: { id: forgoneId, name: CATALOG[forgoneId].name },
    },
    immediate: {
      before: copy(state.resources),
      after: copy(resolved.resources),
      deltas: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, resolved.resources[key] - state.resources[key]])),
    },
    resolved,
    simulation,
  };
}

function transitionToRoute(state) {
  const next = copy(state);
  next.phase = 'route';
  next.route = null;
  next.encounterId = null;
  next.repairsThisTurn = 0;
  next.notice = '';
  return next;
}

function applyEncounter(state, selected) {
  const next = copy(state);
  for (const key of RESOURCE_KEYS) next.resources[key] -= selected.cost[key] ?? 0;
  for (const key of RESOURCE_KEYS) next.resources[key] += selected.reward.resources[key] ?? 0;
  next.resources = resourcesWithCaps(next, next.resources);
  for (const itemId of rewardItems(selected)) {
    if (next.cargo.length >= CARGO_LIMIT) break;
    const specimen = makeSpecimen(next.seed, next.nextUid, itemId);
    next.cargo.push(specimen);
    if (next.version === 2) next.provenance[specimen.uid] = provenanceFor(specimen, 'encounter', next.runId, true);
    next.nextUid += 1;
    if (!next.discoveries.includes(itemId)) next.discoveries.push(itemId);
  }
  next.decisions += 1;
  next.phase = 'build';
  next.notice = '';
  if (next.resources.hull <= 0 || next.crew <= 0) {
    next.phase = 'ended';
    next.outcome = 'loss';
    next.ending = 'collapse';
    if (next.version === 2) next.banking = { status: 'complete', limit: 0, eligibleKeys: [], receipt: { runId: next.runId, selectedKeys: [] } };
  } else if (next.version === 2) {
    beginPlan(next);
  }
  return next;
}

function applyRescueEncounter(state, accept) {
  const opportunity = getRescueOpportunity(state);
  if (!opportunity?.available) return notice(state, 'That rescue signal is no longer available.');
  const next = copy(state);
  if (accept) {
    next.crew += opportunity.people;
    next.acceptedRescues = [...next.acceptedRescues, opportunity.system].sort((a, b) => a - b);
  }
  next.decisions += 1;
  next.phase = 'build';
  next.notice = '';
  beginPlan(next);
  return next;
}

function restoreSnapshot(next, snapshot) {
  for (const key of DRAFT_FIELDS) next[key] = copy(snapshot[key]);
  next.plan.pendingRepairs = snapshot.pendingRepairs;
  next.plan.refitPurchases = snapshot.refitPurchases;
  if (isModernRuleset(next.ruleset)) next.plan.pendingExchange = snapshot.pendingExchange ?? null;
}

function committedEligibility(state) {
  const retained = [...state.grid.filter(Boolean), ...state.cargo];
  const keys = new Set();
  for (const item of retained) {
    if (!ORGANISM_IDS.has(item.id)) continue;
    const provenance = state.provenance[item.uid];
    if (!provenance) continue;
    if (provenance.acquiredThisRun || item.mutation !== provenance.initialMutation) keys.add(`${item.id}:${mutationKey(item.mutation)}`);
  }
  return [...keys].sort();
}

function pendingBank(state, limit) {
  return { status: 'pending', limit, eligibleKeys: committedEligibility(state), receipt: null };
}

function actBuild(state, action) {
  const next = copy(state);
  if (action.type === 'PLACE') {
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= GRID_SIZE || next.grid[action.index]) return notice(state, 'Choose an empty bay.');
    if (state.version === 2 && !next.openBays.includes(action.index)) return notice(state, 'That bay is sealed.');
    const cargoIndex = next.cargo.findIndex((item) => item.uid === action.itemId);
    if (cargoIndex < 0) return notice(state, 'That specimen is not in cargo.');
    if (state.version === 2) pushDraft(next, state);
    next.grid[action.index] = next.cargo.splice(cargoIndex, 1)[0];
    next.decisions += 1;
  } else if (action.type === 'MOVE') {
    if (!Number.isInteger(action.from) || action.from < 0 || action.from >= GRID_SIZE
      || !Number.isInteger(action.to) || action.to < 0 || action.to >= GRID_SIZE
      || !next.grid[action.from] || next.grid[action.to]) return notice(state, 'Choose an occupied bay and an empty destination.');
    if (CATALOG[next.grid[action.from].id]?.anchored) return notice(state, 'That room is anchored.');
    if (state.version === 2 && !next.openBays.includes(action.to)) return notice(state, 'That bay is sealed.');
    if (state.version === 2) pushDraft(next, state);
    next.grid[action.to] = next.grid[action.from];
    next.grid[action.from] = null;
    next.decisions += 1;
  } else if (action.type === 'REMOVE') {
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= GRID_SIZE || !next.grid[action.index]) return notice(state, 'Choose an occupied bay.');
    if (CATALOG[next.grid[action.index].id]?.anchored) return notice(state, 'That room is anchored.');
    if (next.cargo.length >= CARGO_LIMIT) return notice(state, 'Cargo is full.');
    if (state.version === 2) pushDraft(next, state);
    next.cargo.push(next.grid[action.index]);
    next.grid[action.index] = null;
    next.decisions += 1;
  } else if (action.type === 'DISCARD') {
    const index = next.cargo.findIndex((item) => item.uid === action.itemId);
    if (index < 0) return notice(state, 'That specimen is not in cargo.');
    if (state.version === 2) pushDraft(next, state);
    const [discarded] = next.cargo.splice(index, 1);
    if (state.version === 2) next.seedUids = next.seedUids.filter((uid) => uid !== discarded.uid);
    next.decisions += 1;
  } else if (action.type === 'MUTATE') {
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= GRID_SIZE || !next.grid[action.index] || !ORGANISM_IDS.has(next.grid[action.index].id)) return notice(state, 'Select a biological specimen.');
    if (!BRANCHES.has(action.branch)) return notice(state, 'That mutation is unknown.');
    if (next.grid[action.index].mutation) return notice(state, 'This specimen has already mutated.');
    if (state.version === 2) pushDraft(next, state);
    else {
      if (next.resources.biomass < 3) return notice(state, 'Mutation needs 3 food.');
      next.resources.biomass -= 3;
    }
    next.grid[action.index].mutation = action.branch;
    if (state.version !== 2 && !next.mutations.includes(action.branch)) next.mutations.push(action.branch);
    next.decisions += 1;
  } else if (action.type === 'REPAIR') {
    if (state.version === 2) {
      if (next.plan.pendingRepairs + next.plan.baseline.usedRepairs >= 2) return notice(state, 'Repair limit reached for this jump.');
      if (next.resources.hull + next.plan.pendingRepairs * 6 >= getCaps(next).hull) return notice(state, 'Hull is already full.');
      pushDraft(next, state);
      next.plan.pendingRepairs += 1;
    } else {
      if (next.repairsThisTurn >= 2) return notice(state, 'Repair limit reached for this jump.');
      if (next.resources.biomass < 4) return notice(state, 'Repair needs 4 food.');
      if (next.resources.hull >= getCaps(next).hull) return notice(state, 'Hull is already full.');
      next.resources.biomass -= 4;
      next.resources.hull = Math.min(getCaps(next).hull, next.resources.hull + 6);
      next.repairsThisTurn += 1;
    }
    next.decisions += 1;
  } else if (action.type === 'RECLAIM' && state.version === 2) {
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= GRID_SIZE || next.openBays.includes(action.index)) return notice(state, 'Choose a sealed bay.');
    if (!neighbours(action.index).some((index) => next.openBays.includes(index))) return notice(state, 'Reclaim a bay beside an open bay.');
    pushDraft(next, state);
    next.openBays = [...next.openBays, action.index].sort((a, b) => a - b);
    next.decisions += 1;
  } else if (action.type === 'BUY_REFITS' && state.version === 2) {
    if (![4, 7].includes(state.system)) return notice(state, 'Refit service is available in systems 4 and 7.');
    if (next.plan.refitPurchases >= 2) return notice(state, 'Refit purchase limit reached.');
    pushDraft(next, state);
    next.plan.refitPurchases += 1;
    next.decisions += 1;
  } else if (action.type === 'TOGGLE_OPERATION' && isModernRuleset(state.ruleset)) {
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= GRID_SIZE || !next.grid[action.index]) return notice(state, 'Choose an installed optional room.');
    if (!OPTIONAL_OPERATION_IDS.has(next.grid[action.index].id)) return notice(state, 'Core rooms are always on.');
    pushDraft(next, state);
    if (next.grid[action.index].paused === true) delete next.grid[action.index].paused;
    else next.grid[action.index].paused = true;
    next.decisions += 1;
  } else if (action.type === 'PORT_EXCHANGE' && isModernRuleset(state.ruleset)) {
    if (![4, 7].includes(state.system)) return notice(state, 'Port exchange is available in systems 4 and 7.');
    if (action.exchange !== null && !PORT_EXCHANGES[action.exchange]) return notice(state, 'That port exchange is unknown.');
    if ((next.plan.pendingExchange ?? null) === action.exchange) return notice(state, 'That port exchange is already selected.');
    pushDraft(next, state);
    next.plan.pendingExchange = action.exchange;
    next.decisions += 1;
  } else if (action.type === 'TOGGLE_OPERATION') {
    return notice(state, 'Operational controls are available on ruleset 4 voyages.');
  } else if (action.type === 'PORT_EXCHANGE') {
    return notice(state, 'Port exchange is available on ruleset 4 voyages.');
  } else if (action.type === 'UNDO_PLAN' && state.version === 2) {
    const snapshot = next.plan.history.at(-1);
    if (!snapshot) return notice(state, 'There is nothing to undo.');
    restoreSnapshot(next, snapshot);
    next.plan.history.pop();
    next.notice = '';
  } else if (action.type === 'RESET_PLAN' && state.version === 2) {
    const history = next.plan.history;
    restoreSnapshot(next, { ...next.plan.baseline, pendingRepairs: 0, refitPurchases: 0, pendingExchange: null });
    next.plan.history = [];
    next.notice = '';
    void history;
  } else if (action.type === 'EVACUATE' && state.version === 2) {
    if (state.system !== 7) return notice(state, 'Evacuation is available only in system 7.');
    restoreSnapshot(next, { ...next.plan.baseline, pendingRepairs: 0, refitPurchases: 0, pendingExchange: null });
    next.plan = null;
    next.phase = 'ended';
    next.outcome = 'evacuation';
    next.ending = 'evacuation';
    next.banking = pendingBank(next, 1);
    next.notice = '';
  } else if (action.type === 'DEPART') {
    const routeSystem = Number(String(state.route?.id ?? '').split('-')[0]);
    const commitRoute = routeSystem === state.system ? state.route : getRoutes(state).find((route) => route.kind === state.route?.kind) ?? state.route;
    const forecast = simulate(state, commitRoute);
    if (state.version === 2 && !forecast.committable) return notice(state, forecast.disabledReason);
    next.route = commitRoute;
    next.resources = forecast.resources;
    next.grid = forecast.grid;
    next.crew = forecast.crew;
    next.nextUid = forecast.nextUid;
    next.synergies = [...new Set([...next.synergies, ...forecast.synergies.map((item) => item.id)])];
    next.mutations = [...new Set([
      ...next.mutations,
      ...forecast.grid.map((item) => item?.mutation).filter(Boolean),
      ...(forecast.plan?.newMutations ?? []).map((mutation) => mutation.branch),
    ])];
    if (state.version === 2) {
      for (const item of forecast.grid.filter(Boolean)) {
        if (!next.provenance[item.uid]) {
          const report = forecast.cellReports.find((cell) => cell.uid === item.uid);
          const parentUid = report?.localTargets.find((target) => target.kind === 'growth')?.uid;
          const parent = next.provenance[parentUid];
          next.provenance[item.uid] = provenanceFor(item, 'growth', parent?.sourceRunId ?? next.runId, parent?.acquiredThisRun ?? false);
        }
      }
      next.establishedUids = [...new Set([...next.establishedUids, ...forecast.grid.filter(Boolean).map((item) => item.uid)])].sort();
      next.seedUids = next.seedUids.filter((uid) => !forecast.grid.some((item) => item?.uid === uid));
      next.repairsThisTurn = 0;
      next.plan = null;
      next.lastSimulation = { cellReports: forecast.cellReports, plan: forecast.plan };
    }
    next.lastReport = {
      system: state.system,
      before: forecast.before,
      after: forecast.resources,
      deltas: forecast.deltas,
      events: forecast.events,
      synergies: forecast.synergies,
      route: commitRoute,
      encounterId: state.encounterId,
      ...(state.version === 2 ? { plan: forecast.plan, cellReports: forecast.cellReports } : {}),
      ...(state.ruleset === CAPACITY_RULESET ? { people: forecast.people } : {}),
    };
    next.log = [...next.log, next.lastReport].slice(-20);
    next.turn += 1;
    next.decisions += 1;
    next.system += 1;
    if (forecast.outcome) {
      next.phase = 'ended';
      next.outcome = forecast.outcome;
      next.ending = forecast.ending;
      if (state.version === 2) next.banking = forecast.outcome === 'win' ? pendingBank(next, 2) : { status: 'complete', limit: 0, eligibleKeys: [], receipt: { runId: next.runId, selectedKeys: [] } };
    } else {
      next.phase = 'report';
    }
    next.notice = '';
  }
  return next;
}

export function act(state, action = {}) {
  if (!state || !action || typeof action.type !== 'string') return notice(state, 'That action is invalid.');
  if (action.type === 'DEPART_FINAL') {
    const preview = previewFinalDeparture(state, action.routeId);
    return preview.available ? act(preview.resolved, { type: 'DEPART' }) : copy(state);
  }
  if (!validateRun(state)) return notice(state, 'This run data is invalid.');
  const allowed = {
    route: ['SELECT_ROUTE'],
    encounter: ['CHOOSE'],
    build: ['PLACE', 'MOVE', 'REMOVE', 'DISCARD', 'MUTATE', 'REPAIR', 'RECLAIM', 'BUY_REFITS', 'TOGGLE_OPERATION', 'PORT_EXCHANGE', 'UNDO_PLAN', 'RESET_PLAN', 'EVACUATE', 'DEPART'],
    report: ['CONTINUE'],
    ended: ['BANK_GENOMES'],
  };
  if (!PHASES.has(state.phase) || !allowed[state.phase].includes(action.type)) {
    if (action.type === 'CHOOSE' && state.phase === 'build') return notice(state, 'No encounter is awaiting a choice.');
    return notice(state, state.phase === 'route' ? 'Choose a route first.' : state.phase === 'encounter' ? 'Choose an encounter option.' : 'That action is not available now.');
  }
  if (state.phase === 'route') {
    const route = getRoutes(state).find((item) => item.id === action.routeId);
    if (!route) return notice(state, 'That route is unavailable.');
    const next = copy(state);
    next.route = route;
    next.encounterId = encounterIdFor(state, route);
    next.phase = 'encounter';
    next.notice = '';
    return next;
  }
  if (state.phase === 'encounter') {
    const rescue = getRescueOpportunity(state);
    if (rescue) {
      if (action.choiceId === 'accept-rescue') return applyRescueEncounter(state, true);
      if (action.choiceId === 'decline-rescue') return applyRescueEncounter(state, false);
      return notice(state, 'That encounter option is unavailable.');
    }
    const encounter = ENCOUNTERS.find((item) => item.id === state.encounterId);
    const selected = encounter?.choices.find((item) => item.id === action.choiceId);
    if (!selected) return notice(state, 'That encounter option is unavailable.');
    const disabled = choiceDisabled(state, selected);
    if (disabled.disabled) return notice(state, disabled.disabledReason);
    return applyEncounter(state, selected);
  }
  if (state.phase === 'build') return actBuild(state, action);
  if (state.phase === 'ended') {
    if (state.version !== 2 || state.banking.status !== 'pending') return notice(state, 'That action is not available now.');
    if (!Array.isArray(action.keys) || action.keys.length > state.banking.limit || new Set(action.keys).size !== action.keys.length
      || action.keys.some((key) => !state.banking.eligibleKeys.includes(key))) return notice(state, 'Choose distinct eligible genomes within the banking limit.');
    const next = copy(state);
    next.banking.status = 'complete';
    next.banking.receipt = { runId: next.runId, selectedKeys: [...action.keys] };
    next.notice = '';
    return next;
  }
  return transitionToRoute(state);
}

export function getBankOptions(state) {
  if (!state?.banking || !['pending', 'complete'].includes(state.banking.status)) return [];
  return state.banking.eligibleKeys.map((key) => {
    const separator = key.lastIndexOf(':');
    const id = key.slice(0, separator);
    const mutation = key.slice(separator + 1);
    const item = CATALOG[id];
    const retained = [...state.grid.filter(Boolean), ...state.cargo].find((record) => record.id === id && mutationKey(record.mutation) === mutation);
    const provenance = retained ? state.provenance[retained.uid] : null;
    const stats = getItemStats({ id, mutation: genomeMutation(mutation) }, { ruleset: state.ruleset });
    const operation = activationText({ id }, stats);
    const defence = stats.defence ? ` Provides ${stats.defence} debris defence.` : '';
    return {
      key, id, mutation, name: `${mutation === 'base' ? '' : `${MUTATIONS.find((branch) => branch.id === mutation)?.name} `}${item?.name ?? id}`.trim(),
      description: `Growth costs 3 food. ${operation}${defence}`,
      sourceRunId: provenance?.sourceRunId ?? state.runId,
      source: provenance?.source ?? 'encounter',
    };
  });
}

export function classifyBuild(state) {
  const ids = new Set((state.grid ?? []).filter(Boolean).map((item) => item.id));
  const verdant = ['grave-moss', 'bloom-stomach', 'hull-leech'].filter((id) => ids.has(id)).length;
  const radiant = ['radiovore', 'sun-coral', 'cinder-bloom'].filter((id) => ids.has(id)).length;
  const symbiotic = ['void-lung', 'echo-polyp', 'frost-lichen'].filter((id) => ids.has(id)).length;
  if (verdant >= radiant && verdant >= symbiotic && verdant >= 2) return { id: 'verdant', name: 'Verdant Ark', description: 'A food-funded living ark that grows and repairs.' };
  if (radiant >= symbiotic && radiant >= 2) return { id: 'radiant', name: 'Radiant Ark', description: 'A solar ark that turns hazards into current.' };
  if (symbiotic >= 2) return { id: 'symbiotic', name: 'Symbiotic Ark', description: 'A connected ecology whose neighbours share strength.' };
  return { id: 'balanced', name: 'Balanced Ark', description: 'A practical ecosystem with room to specialise.' };
}

export function scoreRun(state) {
  const active = (state.grid ?? []).filter((item) => item?.active).length;
  const crew = Math.max(0, state.crew ?? 0);
  const viability = (state.outcome === 'win' ? 100 : 0) + Math.max(0, state.resources?.hull ?? 0) + crew * 3;
  const specialisation = classifyBuild(state).id;
  return { total: viability + active * 5, viability, crew, specialisation };
}

function emptyArchive() {
  return { version: 2, sequence: 0, completedRuns: [], discoveries: [], mutations: [], synergies: [], endings: { win: 0, loss: 0, evacuation: 0 }, bestScore: 0, genomes: [], bankingReceipts: [], blueprints: [] };
}

export function mergeArchive(archive = {}, state) {
  const next = upgradeArchive(archive);
  const run = upgradeRun(state);
  if (!next || !run) return next;
  for (const key of ['discoveries', 'mutations', 'synergies']) {
    const values = run[key];
    for (const value of values ?? []) if (!next[key].includes(value)) next[key].push(value);
    next[key] = next[key].slice(-MAX_ARCHIVE_ITEMS);
  }
  if (run.outcome && !next.completedRuns.includes(run.runId)) {
    next.completedRuns = [...next.completedRuns, run.runId].slice(-MAX_ARCHIVE_ITEMS);
    next.endings[run.outcome] = Math.min(MAX_ARCHIVE_ITEMS, next.endings[run.outcome] + 1);
    next.bestScore = Math.max(next.bestScore, scoreRun(run).total);
    if (run.outcome === 'win' && run.banking.limit === 2) {
      next.blueprints = [...next.blueprints, {
        runId: run.runId, seed: run.seed, openBays: [...run.openBays],
        grid: run.grid.map((item) => item ? { id: item.id, mutation: item.mutation } : null),
      }].slice(-MAX_BLUEPRINTS);
    }
  }
  if (run.banking.status === 'complete' && run.banking.receipt && !next.bankingReceipts.some((receipt) => receipt.runId === run.runId)) {
    next.bankingReceipts = [...next.bankingReceipts, copy(run.banking.receipt)].slice(-MAX_ARCHIVE_ITEMS);
    const options = new Map(getBankOptions(run).map((option) => [option.key, option]));
    for (const key of run.banking.receipt.selectedKeys) {
      const option = options.get(key);
      if (option && !next.genomes.some((genome) => genome.key === key)) next.genomes.push(option);
    }
  }
  return next;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedInteger(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function boundedString(value, maximum = 180, allowEmpty = false) {
  return typeof value === 'string' && value.length <= maximum && (allowEmpty || value.length > 0);
}

function exactResourceRecord(value, bounds = {}) {
  if (!isRecord(value) || Object.keys(value).length !== RESOURCE_KEYS.length) return false;
  return RESOURCE_KEYS.every((key) => boundedInteger(value[key], bounds[key]?.[0] ?? -100, bounds[key]?.[1] ?? 100));
}

function validStoredResources(value) {
  return exactResourceRecord(value, {
    power: [0, 40], oxygen: [0, 40], biomass: [0, 40], heat: [0, 40], hull: [-40, 30],
  });
}

function sameRoute(actual, expected) {
  return isRecord(actual)
    && Object.keys(actual).length === ROUTE_FIELDS.length
    && ROUTE_FIELDS.every((key) => actual[key] === expected[key]);
}

function expectedRoute(seed, system, kind, priorReports, ruleset) {
  return routeFor({ seed, system, log: priorReports, ...(ruleset ? { ruleset } : {}) }, kind);
}

function expectedEncounterId(seed, system, route, priorReports, ruleset) {
  return encounterIdFor({ seed, system, log: priorReports, ...(ruleset ? { ruleset } : {}) }, route);
}

function validSynergy(value) {
  return isRecord(value)
    && Object.keys(value).length === 6
    && SYNERGY_IDS.has(value.id)
    && boundedString(value.name, 80)
    && boundedString(value.a, 120)
    && boundedString(value.b, 120)
    && value.a !== value.b
    && boundedString(value.text, 240)
    && exactResourceRecord(value.delta);
}

function validEvent(value) {
  return isRecord(value)
    && Object.keys(value).length === 4
    && boundedString(value.type, 40)
    && boundedString(value.source, 120)
    && boundedString(value.text, 300)
    && exactResourceRecord(value.delta);
}

function validReport(report, seed, priorReports, ruleset) {
  if (!isRecord(report) || Object.keys(report).length !== 8) return false;
  const system = priorReports.length + 1;
  if (report.system !== system || system > 9 || !['garden', 'salvage', 'anomaly'].includes(report.route?.kind)) return false;
  const route = expectedRoute(seed, system, report.route.kind, priorReports, ruleset);
  if (!sameRoute(report.route, route) || report.encounterId !== expectedEncounterId(seed, system, route, priorReports, ruleset)) return false;
  if (!validStoredResources(report.before) || !validStoredResources(report.after) || !exactResourceRecord(report.deltas)) return false;
  if (!RESOURCE_KEYS.every((key) => report.before[key] + report.deltas[key] === report.after[key])) return false;
  if (!Array.isArray(report.events) || report.events.length > 100 || !report.events.every(validEvent)) return false;
  if (!Array.isArray(report.synergies) || report.synergies.length > 32 || !report.synergies.every(validSynergy)) return false;
  const ledger = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
  for (const event of report.events) for (const key of RESOURCE_KEYS) ledger[key] += event.delta[key];
  return RESOURCE_KEYS.every((key) => ledger[key] === report.deltas[key]);
}

function validKnownList(value, allowed, maximum) {
  return Array.isArray(value)
    && value.length <= maximum
    && new Set(value).size === value.length
    && value.every((entry) => allowed.has(entry));
}

function validSpecimen(record, seed, nextUid, modern = false) {
  const hasPaused = isRecord(record) && Object.prototype.hasOwnProperty.call(record, 'paused');
  if (!isRecord(record) || Object.keys(record).length !== 6 + (hasPaused ? 1 : 0) || !CATALOG[record.id]
    || !boundedString(record.uid, 120) || typeof record.active !== 'boolean'
    || !boundedInteger(record.age, 0, 9) || !boundedInteger(record.solarExposures, 0, 9)) return false;
  if (hasPaused && (!modern || typeof record.paused !== 'boolean' || !OPTIONAL_OPERATION_IDS.has(record.id))) return false;
  if (CATALOG[record.id].kind === 'module' && record.mutation !== null) return false;
  if (CATALOG[record.id].kind === 'organism' && record.mutation !== null && !BRANCHES.has(record.mutation)) return false;
  const prefix = `${seed}:`;
  if (!record.uid.startsWith(prefix)) return false;
  const suffix = record.uid.slice(prefix.length);
  if (suffix.startsWith('module-')) return STARTING_MODULES[suffix.slice(7)] !== undefined && suffix === `module-${record.id}`;
  if (STARTING_MODULES[record.id] !== undefined) return false;
  if (!/^\d{4,7}$/.test(suffix)) return false;
  return boundedInteger(Number(suffix), 1, nextUid - 1);
}

function validateRunV1(value) {
  try {
    if (!isRecord(value) || value.version !== 1 || !boundedString(value.seed, 40) || !PHASES.has(value.phase)) return false;
    if (Object.prototype.hasOwnProperty.call(value, 'ruleset')) return false;
    if (!boundedInteger(value.system, 1, 10) || !boundedInteger(value.turn, 0, 9) || value.system !== value.turn + 1) return false;
    if (!Array.isArray(value.grid) || value.grid.length !== GRID_SIZE || !Array.isArray(value.cargo) || value.cargo.length > CARGO_LIMIT) return false;
    if (!validStoredResources(value.resources) || !boundedInteger(value.crew, -6, 6) || !boundedInteger(value.nextUid, 3, MAX_COUNTER)) return false;
    if (!boundedInteger(value.decisions, 0, MAX_COUNTER) || !boundedInteger(value.repairsThisTurn, 0, 2) || !boundedString(value.notice, 180, true)) return false;
    if (!boundedString(value.runId, 160) || !value.runId.startsWith(`${value.seed}-`) || !boundedInteger(Number(value.runId.slice(value.seed.length + 1)), 1, MAX_COUNTER)) return false;
    if (!Array.isArray(value.log) || value.log.length !== value.turn || !value.log.every((report, index) => validReport(report, value.seed, value.log.slice(0, index)))) return false;
    if (!validKnownList(value.discoveries, new Set(Object.keys(CATALOG)), Object.keys(CATALOG).length)
      || !validKnownList(value.mutations, BRANCHES, BRANCHES.size)
      || !validKnownList(value.synergies, SYNERGY_IDS, SYNERGY_IDS.size)) return false;

    const records = [...value.grid.filter(Boolean), ...value.cargo];
    const uids = new Set();
    for (const record of records) {
      if (!validSpecimen(record, value.seed, value.nextUid) || uids.has(record.uid)) return false;
      uids.add(record.uid);
    }
    for (const [id, index] of Object.entries(ANCHORED)) {
      if (value.grid[index]?.id !== id || value.grid[index].uid !== `${value.seed}:module-${id}`) return false;
    }
    const expectedLastReport = value.turn ? value.log.at(-1) : null;
    if (JSON.stringify(value.lastReport) !== JSON.stringify(expectedLastReport)) return false;
    if (records.some((record) => record.mutation && !value.mutations.includes(record.mutation))) return false;
    if (value.log.some((report) => report.synergies.some((synergy) => !value.synergies.includes(synergy.id)))) return false;

    if (value.phase !== 'ended' && (value.outcome !== null || value.ending !== null || value.resources.hull <= 0 || value.crew <= 0)) return false;
    if (value.phase === 'ended') {
      if (!['win', 'loss'].includes(value.outcome)) return false;
      if (value.outcome === 'win' && (value.ending !== 'arrival' || value.system !== 10 || value.turn !== 9)) return false;
      if (value.outcome === 'loss' && (value.ending !== 'collapse' || (value.resources.hull > 0 && value.crew > 0))) return false;
    }

    if (value.phase === 'route') {
      return value.system <= 9 && value.route === null && value.encounterId === null && value.repairsThisTurn === 0;
    }

    if (!isRecord(value.route) || !['garden', 'salvage', 'anomaly'].includes(value.route.kind) || !boundedString(value.encounterId, 80)) return false;
    const routeSystem = Number(String(value.route.id).split('-')[0]);
    const departed = value.phase === 'report' || (value.phase === 'ended' && routeSystem === value.system - 1);
    const current = ['encounter', 'build'].includes(value.phase) || (value.phase === 'ended' && routeSystem === value.system);
    if (!departed && !current) return false;
    const expectedSystem = departed ? value.system - 1 : value.system;
    const priorReports = departed ? value.log.slice(0, -1) : value.log;
    const route = expectedRoute(value.seed, expectedSystem, value.route.kind, priorReports);
    if (!sameRoute(value.route, route) || value.encounterId !== expectedEncounterId(value.seed, expectedSystem, route, priorReports)) return false;
    if (departed && !RESOURCE_KEYS.every((key) => value.resources[key] === value.lastReport.after[key])) return false;
    if (value.phase === 'report' && (value.system > 9 || !value.lastReport || value.lastReport.system !== expectedSystem)) return false;
    if (value.phase === 'ended' && value.outcome === 'win' && !departed) return false;
    return true;
  } catch {
    return false;
  }
}

function validGenome(value) {
  if (!isRecord(value) || Object.keys(value).length !== 7 || !ORGANISM_IDS.has(value.id) || !['base', ...BRANCHES].includes(value.mutation)) return false;
  if (value.key !== `${value.id}:${value.mutation}` || !boundedString(value.name, 120) || !boundedString(value.description, 400, true)) return false;
  return boundedString(value.sourceRunId, 160) && ['starter', 'encounter', 'inherited', 'growth', 'legacy'].includes(value.source);
}

export function validateArchive(value) {
  try {
    if (!isRecord(value) || Object.keys(value).length !== 11 || value.version !== 2 || !boundedInteger(value.sequence, 0, MAX_COUNTER)) return false;
    if (!Array.isArray(value.completedRuns) || value.completedRuns.length > MAX_ARCHIVE_ITEMS || new Set(value.completedRuns).size !== value.completedRuns.length || !value.completedRuns.every((id) => boundedString(id, 160))) return false;
    if (!validKnownList(value.discoveries, new Set(Object.keys(CATALOG)), MAX_ARCHIVE_ITEMS) || !validKnownList(value.mutations, BRANCHES, MAX_ARCHIVE_ITEMS) || !validKnownList(value.synergies, SYNERGY_IDS, MAX_ARCHIVE_ITEMS)) return false;
    if (!isRecord(value.endings) || Object.keys(value.endings).length !== 3 || !['win', 'loss', 'evacuation'].every((key) => boundedInteger(value.endings[key], 0, MAX_ARCHIVE_ITEMS))) return false;
    if (!boundedInteger(value.bestScore, 0, 1_000_000_000)) return false;
    if (!Array.isArray(value.genomes) || value.genomes.length > ORGANISM_IDS.size * 4 || !value.genomes.every(validGenome) || new Set(value.genomes.map((item) => item.key)).size !== value.genomes.length) return false;
    if (!Array.isArray(value.bankingReceipts) || value.bankingReceipts.length > MAX_ARCHIVE_ITEMS || !value.bankingReceipts.every((receipt) => isRecord(receipt) && Object.keys(receipt).length === 2 && boundedString(receipt.runId, 160) && Array.isArray(receipt.selectedKeys) && receipt.selectedKeys.length <= 2 && new Set(receipt.selectedKeys).size === receipt.selectedKeys.length && receipt.selectedKeys.every((key) => value.genomes.some((genome) => genome.key === key)))) return false;
    if (!Array.isArray(value.blueprints) || value.blueprints.length > MAX_BLUEPRINTS || !value.blueprints.every((blueprint) => isRecord(blueprint) && Object.keys(blueprint).length === 4 && boundedString(blueprint.runId, 160) && boundedString(blueprint.seed, 40) && validOpenBays(blueprint.openBays) && Array.isArray(blueprint.grid) && blueprint.grid.length === GRID_SIZE && blueprint.grid.every((record) => record === null || (isRecord(record) && Object.keys(record).length === 2 && CATALOG[record.id] && (record.mutation === null || BRANCHES.has(record.mutation)))))) return false;
    return true;
  } catch { return false; }
}

function validLegacyArchive(value) {
  if (!isRecord(value)) return false;
  if (value.version !== undefined && value.version !== 1) return false;
  if (!Object.keys(value).length) return true;
  return boundedInteger(value.sequence, 0, MAX_COUNTER)
    && Array.isArray(value.completedRuns) && value.completedRuns.every((item) => boundedString(item, 160))
    && validKnownList(value.discoveries, new Set(Object.keys(CATALOG)), MAX_ARCHIVE_ITEMS)
    && validKnownList(value.mutations, BRANCHES, MAX_ARCHIVE_ITEMS)
    && validKnownList(value.synergies, SYNERGY_IDS, MAX_ARCHIVE_ITEMS)
    && isRecord(value.endings) && boundedInteger(value.endings.win, 0, MAX_ARCHIVE_ITEMS) && boundedInteger(value.endings.loss, 0, MAX_ARCHIVE_ITEMS)
    && boundedInteger(value.bestScore, 0, 1_000_000_000);
}

export function upgradeArchive(value = {}) {
  if (validateArchive(value)) return copy(value);
  if (!validLegacyArchive(value)) return null;
  const next = emptyArchive();
  if (Object.keys(value).length) {
    next.sequence = value.sequence;
    next.completedRuns = [...value.completedRuns].slice(-MAX_ARCHIVE_ITEMS);
    next.discoveries = [...value.discoveries];
    next.mutations = [...value.mutations];
    next.synergies = [...value.synergies];
    next.endings.win = value.endings.win;
    next.endings.loss = value.endings.loss;
    next.bestScore = value.bestScore;
  }
  return next;
}

function validProvenance(value, records) {
  if (!isRecord(value)) return false;
  const recordUids = new Set(records.map((record) => record.uid));
  for (const [uid, provenance] of Object.entries(value)) {
    if (!boundedString(uid, 120) || !isRecord(provenance) || Object.keys(provenance).length !== 5 || !CATALOG[provenance.speciesId]
      || !['starter', 'encounter', 'inherited', 'growth', 'legacy'].includes(provenance.source)
      || (provenance.sourceRunId !== null && !boundedString(provenance.sourceRunId, 160))
      || (provenance.initialMutation !== null && !BRANCHES.has(provenance.initialMutation))
      || typeof provenance.acquiredThisRun !== 'boolean') return false;
  }
  return records.every((record) => value[record.uid]?.speciesId === record.id) && [...recordUids].every((uid) => value[uid]);
}

function validOpenBays(value) {
  return Array.isArray(value) && value.length <= GRID_SIZE && new Set(value).size === value.length
    && value.every((index) => boundedInteger(index, 0, GRID_SIZE - 1))
    && value.every((index, position) => position === 0 || value[position - 1] < index);
}

function validBanking(value, run) {
  if (!isRecord(value) || !['none', 'pending', 'complete'].includes(value.status) || ![0, 1, 2].includes(value.limit)
    || !Array.isArray(value.eligibleKeys) || new Set(value.eligibleKeys).size !== value.eligibleKeys.length
    || !value.eligibleKeys.every((key) => /^[-a-z]+:(base|efficient|symbiotic|feral)$/.test(key))) return false;
  if (value.status === 'none') return value.limit === 0 && value.eligibleKeys.length === 0 && value.receipt === null && !run.outcome;
  if (run.outcome === 'loss') return value.status === 'complete' && value.limit === 0 && value.eligibleKeys.length === 0 && isRecord(value.receipt) && value.receipt.runId === run.runId && value.receipt.selectedKeys.length === 0;
  if (JSON.stringify(value.eligibleKeys) !== JSON.stringify(committedEligibility(run))) return false;
  if (value.status === 'pending') return ['win', 'evacuation'].includes(run.outcome) && value.receipt === null && value.limit === (run.outcome === 'win' ? 2 : 1);
  return isRecord(value.receipt) && value.receipt.runId === run.runId && Array.isArray(value.receipt.selectedKeys) && value.receipt.selectedKeys.length <= value.limit && new Set(value.receipt.selectedKeys).size === value.receipt.selectedKeys.length && value.receipt.selectedKeys.every((key) => value.eligibleKeys.includes(key));
}

function validDraftCore(value, seed, modern = false) {
  if (!isRecord(value) || !Array.isArray(value.grid) || value.grid.length !== GRID_SIZE || !Array.isArray(value.cargo) || value.cargo.length > CARGO_LIMIT || !validOpenBays(value.openBays)) return false;
  if (value.grid.some((item, index) => item && !value.openBays.includes(index)) || !boundedInteger(value.nextUid, 1, MAX_COUNTER)) return false;
  if (!validKnownList(value.discoveries, new Set(Object.keys(CATALOG)), MAX_ARCHIVE_ITEMS) || !validKnownList(value.mutations, BRANCHES, MAX_ARCHIVE_ITEMS) || !validKnownList(value.synergies, SYNERGY_IDS, MAX_ARCHIVE_ITEMS)) return false;
  const records = [...value.grid.filter(Boolean), ...value.cargo];
  if (new Set(records.map((record) => record.uid)).size !== records.length || !records.every((record) => validSpecimen(record, seed, value.nextUid, modern)) || !validProvenance(value.provenance, records)) return false;
  if (!Array.isArray(value.establishedUids) || new Set(value.establishedUids).size !== value.establishedUids.length || !value.establishedUids.every((uid) => value.provenance[uid])) return false;
  if (!Array.isArray(value.seedUids) || new Set(value.seedUids).size !== value.seedUids.length || !value.seedUids.every((uid) => records.some((item) => item.uid === uid) && value.provenance[uid]?.source === 'inherited')) return false;
  return Object.entries(ANCHORED).every(([id, index]) => value.grid[index]?.id === id);
}

function validPlan(value, run) {
  if (run.phase !== 'build') return value === null;
  const modern = isModernRuleset(run.ruleset);
  const hasExchange = isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'pendingExchange');
  if (!isRecord(value) || Object.keys(value).length !== 4 + (hasExchange ? 1 : 0)
    || !isRecord(value.baseline) || !boundedInteger(value.pendingRepairs, 0, 2) || !boundedInteger(value.refitPurchases, 0, 2)
    || !Array.isArray(value.history) || value.history.length > MAX_PLAN_HISTORY) return false;
  if (hasExchange && (!modern || (value.pendingExchange !== null && !PORT_EXCHANGES[value.pendingExchange]) || (value.pendingExchange !== null && ![4, 7].includes(run.system)))) return false;
  if (Object.keys(value.baseline).length !== DRAFT_FIELDS.length + 2 || !validOpenBays(value.baseline.openBays) || !validStoredResources(value.baseline.resources) || !boundedInteger(value.baseline.usedRepairs, 0, 2)) return false;
  if (!validDraftCore(value.baseline, run.seed, modern)) return false;
  if (JSON.stringify(value.baseline.establishedUids) !== JSON.stringify(run.establishedUids)
    || JSON.stringify(value.baseline.provenance) !== JSON.stringify(run.provenance)
    || JSON.stringify(value.baseline.resources) !== JSON.stringify(run.resources)
    || value.baseline.nextUid !== run.nextUid
    || JSON.stringify(value.baseline.discoveries) !== JSON.stringify(run.discoveries)
    || JSON.stringify(value.baseline.mutations) !== JSON.stringify(run.mutations)
    || JSON.stringify(value.baseline.synergies) !== JSON.stringify(run.synergies)) return false;
  return value.history.every((snapshot) => {
    const snapshotHasExchange = isRecord(snapshot) && Object.prototype.hasOwnProperty.call(snapshot, 'pendingExchange');
    return isRecord(snapshot) && Object.keys(snapshot).length === DRAFT_FIELDS.length + 2 + (snapshotHasExchange ? 1 : 0) && !('history' in snapshot)
      && (!snapshotHasExchange || (modern
        && (snapshot.pendingExchange === null || (PORT_EXCHANGES[snapshot.pendingExchange] && [4, 7].includes(run.system)))))
      && boundedInteger(snapshot.pendingRepairs, 0, 2) && boundedInteger(snapshot.refitPurchases, 0, 2)
      && validDraftCore(snapshot, run.seed, modern)
      && JSON.stringify(snapshot.establishedUids) === JSON.stringify(value.baseline.establishedUids)
      && JSON.stringify(snapshot.provenance) === JSON.stringify(value.baseline.provenance)
      && JSON.stringify(snapshot.discoveries) === JSON.stringify(value.baseline.discoveries)
      && JSON.stringify(snapshot.mutations) === JSON.stringify(value.baseline.mutations)
      && JSON.stringify(snapshot.synergies) === JSON.stringify(value.baseline.synergies);
  });
}

function validCellReport(report, index) {
  return isRecord(report) && Object.keys(report).length === 12 && report.index === index && (report.uid === null || boundedString(report.uid, 120))
    && (report.id === null || CATALOG[report.id]) && boundedString(report.name, 120, true)
    && (report.mutation === null || BRANCHES.has(report.mutation))
    && ['active', 'dormant', 'empty', 'sealed'].includes(report.status) && boundedString(report.reason, 300)
    && exactResourceRecord(report.inputs) && exactResourceRecord(report.outputs) && boundedInteger(report.defence, 0, 100)
    && Array.isArray(report.localTargets) && report.localTargets.every((target) => isRecord(target) && Object.keys(target).length === 4 && boundedInteger(target.index, 0, 19) && (target.uid === null || boundedString(target.uid, 120)) && ['synergy', 'danger', 'growth', 'mutation'].includes(target.kind) && boundedString(target.text, 300))
    && isRecord(report.trajectory) && Object.keys(report.trajectory).length === 4 && typeof report.trajectory.grewThisJump === 'boolean'
    && ['age', 'solarExposures'].every((key) => report.trajectory[key] === null || (isRecord(report.trajectory[key]) && Object.keys(report.trajectory[key]).length === 2 && boundedInteger(report.trajectory[key].before, 0, 9) && boundedInteger(report.trajectory[key].after, 0, 9)))
    && (report.trajectory.mutation === null || (isRecord(report.trajectory.mutation) && Object.keys(report.trajectory.mutation).length === 2 && (report.trajectory.mutation.before === null || BRANCHES.has(report.trajectory.mutation.before)) && (report.trajectory.mutation.after === null || BRANCHES.has(report.trajectory.mutation.after))));
}

function validPlanSummary(value, modern = false) {
  const fields = ['costs', 'reclaimedBays', 'newMutations', 'repairs', 'seedGrowth', 'uprootedUids', 'refitUids', 'refitsUsed', 'refitLimit', 'refitPurchases', 'affordable', 'valid', 'committable', 'disabledReason', 'historyLength'];
  return isRecord(value) && Object.keys(value).length === fields.length && fields.every((key) => key in value)
    && exactResourceRecord(value.costs, Object.fromEntries(RESOURCE_KEYS.map((key) => [key, [modern ? -100 : 0, 100]])))
    && validOpenBays([...value.reclaimedBays].sort((a, b) => a - b))
    && Array.isArray(value.newMutations) && value.newMutations.every((mutation) => isRecord(mutation) && Object.keys(mutation).length === 2 && boundedString(mutation.uid, 120) && BRANCHES.has(mutation.branch))
    && ['seedGrowth', 'uprootedUids', 'refitUids'].every((key) => Array.isArray(value[key]) && new Set(value[key]).size === value[key].length && value[key].every((uid) => boundedString(uid, 120)))
    && boundedInteger(value.repairs, 0, 2) && boundedInteger(value.refitsUsed, 0, MAX_COUNTER) && boundedInteger(value.refitLimit, 2, 6) && boundedInteger(value.refitPurchases, 0, 2) && boundedInteger(value.historyLength, 0, MAX_PLAN_HISTORY)
    && ['affordable', 'valid', 'committable'].every((key) => typeof value[key] === 'boolean') && boundedString(value.disabledReason, 240, true);
}

function validPeopleReport(value) {
  return isRecord(value) && Object.keys(value).length === 4
    && boundedInteger(value.before, 0, 24)
    && boundedInteger(value.after, 0, 24)
    && boundedInteger(value.embarked, 6, 24)
    && boundedInteger(value.lost, 0, 3)
    && value.after === value.before - value.lost;
}

function validReportV2(report, seed, priorReports, ruleset) {
  const capacity = ruleset === CAPACITY_RULESET;
  if (!isRecord(report) || ![8, 10, 11].includes(Object.keys(report).length)) return false;
  if (capacity !== Object.prototype.hasOwnProperty.call(report, 'people')) return false;
  if (capacity && !validPeopleReport(report.people)) return false;
  const legacyShape = copy(report);
  delete legacyShape.plan;
  delete legacyShape.cellReports;
  delete legacyShape.people;
  if (!validReport(legacyShape, seed, priorReports, ruleset)) return false;
  if (Object.keys(report).length === 8) return true;
  return validPlanSummary(report.plan, isModernRuleset(ruleset)) && Array.isArray(report.cellReports) && report.cellReports.length === GRID_SIZE && report.cellReports.every(validCellReport);
}

function validRescueHistory(run) {
  const accepted = run.acceptedRescues;
  if (!Array.isArray(accepted) || accepted.length > RESCUE_STOPS.length || new Set(accepted).size !== accepted.length
    || accepted.some((system, index) => !RESCUE_STOPS.includes(system) || (index > 0 && accepted[index - 1] >= system) || system > run.system)) return false;
  if (['route', 'encounter'].includes(run.phase) && accepted.includes(run.system)) return false;
  const schedule = new Map(getRescueSchedule(run).map((entry) => [entry.system, entry]));
  let previousAfter = 6;
  for (const report of run.log) {
    const rescued = accepted.includes(report.system);
    const expectedBefore = previousAfter + (rescued ? 6 : 0);
    const expectedEmbarked = 6 + accepted.filter((system) => system <= report.system).length * 6;
    if (report.people.before !== expectedBefore || report.people.embarked !== expectedEmbarked) return false;
    let expectedAfter = expectedBefore;
    if (report.events.some((event) => event.type === 'pressure' && event.source === 'oxygen')) expectedAfter -= Math.min(2, expectedAfter);
    if (report.events.some((event) => event.type === 'pressure' && event.source === 'biomass')) expectedAfter -= Math.min(1, expectedAfter);
    if (report.people.after !== expectedAfter || report.people.lost !== expectedBefore - expectedAfter) return false;
    if (rescued) {
      const entry = schedule.get(report.system);
      if (!entry || report.route.id !== entry.routeId || report.encounterId !== `rescue-${report.system}`) return false;
    }
    previousAfter = expectedAfter;
  }
  const pending = accepted.filter((system) => system > run.log.length);
  if (pending.length > 1 || pending.some((system) => system !== run.system || run.route?.id !== schedule.get(system)?.routeId || run.encounterId !== `rescue-${system}` || run.phase !== 'build')) return false;
  return run.crew === previousAfter + pending.length * 6;
}

export function validateRun(value) {
  try {
    if (!isRecord(value) || value.version !== 2 || !boundedString(value.seed, 40) || !PHASES.has(value.phase)) return false;
    if (Object.prototype.hasOwnProperty.call(value, 'ruleset') && ![MODERN_RULESET, CAPACITY_RULESET].includes(value.ruleset)) return false;
    const modern = isModernRuleset(value.ruleset);
    const capacity = value.ruleset === CAPACITY_RULESET;
    if (capacity !== Object.prototype.hasOwnProperty.call(value, 'acceptedRescues')) return false;
    if (capacity && (Object.keys(value).length !== V5_RUN_FIELDS.size || Object.keys(value).some((key) => !V5_RUN_FIELDS.has(key)))) return false;
    if (!boundedInteger(value.system, 1, 10) || !boundedInteger(value.turn, 0, 9) || value.system !== value.turn + 1) return false;
    if (!Array.isArray(value.grid) || value.grid.length !== GRID_SIZE || !Array.isArray(value.cargo) || value.cargo.length > CARGO_LIMIT || !validOpenBays(value.openBays)) return false;
    if (value.grid.some((item, index) => item && !value.openBays.includes(index))) return false;
    if (!validStoredResources(value.resources) || !boundedInteger(value.crew, capacity ? 0 : -6, capacity ? 24 : 6) || !boundedInteger(value.nextUid, 1, MAX_COUNTER) || !boundedInteger(value.decisions, 0, MAX_COUNTER) || !boundedInteger(value.repairsThisTurn, 0, 2) || !boundedString(value.notice, 180, true)) return false;
    if (!boundedString(value.runId, 160) || !value.runId.startsWith(`${value.seed}-`) || !boundedInteger(Number(value.runId.slice(value.seed.length + 1)), 1, MAX_COUNTER)) return false;
    if (!validKnownList(value.discoveries, new Set(Object.keys(CATALOG)), MAX_ARCHIVE_ITEMS) || !validKnownList(value.mutations, BRANCHES, MAX_ARCHIVE_ITEMS) || !validKnownList(value.synergies, SYNERGY_IDS, MAX_ARCHIVE_ITEMS)) return false;
    const records = [...value.grid.filter(Boolean), ...value.cargo];
    if (new Set(records.map((record) => record.uid)).size !== records.length || !records.every((record) => validSpecimen(record, value.seed, value.nextUid, modern))) return false;
    if (!validProvenance(value.provenance, records)) return false;
    if (!Array.isArray(value.establishedUids) || new Set(value.establishedUids).size !== value.establishedUids.length || value.establishedUids.some((uid, index) => index > 0 && value.establishedUids[index - 1] >= uid) || !value.establishedUids.every((uid) => value.provenance[uid])) return false;
    if (!Array.isArray(value.seedUids) || new Set(value.seedUids).size !== value.seedUids.length || value.seedUids.some((uid, index) => index > 0 && value.seedUids[index - 1] >= uid) || !value.seedUids.every((uid) => records.some((item) => item.uid === uid) && value.provenance[uid]?.source === 'inherited')) return false;
    if (!Array.isArray(value.launchSeedKeys) || value.launchSeedKeys.length > 2 || new Set(value.launchSeedKeys).size !== value.launchSeedKeys.length || !value.launchSeedKeys.every((key) => /^[-a-z]+:(base|efficient|symbiotic|feral)$/.test(key))) return false;
    for (const [id, index] of Object.entries(ANCHORED)) if (value.grid[index]?.id !== id) return false;
    if (!validPlan(value.plan, value) || !validBanking(value.banking, value)) return false;
    if (!Array.isArray(value.log) || value.log.length !== value.turn || !value.log.every((report, index) => validReportV2(report, value.seed, value.log.slice(0, index), value.ruleset)) || JSON.stringify(value.lastReport) !== JSON.stringify(value.turn ? value.log.at(-1) : null)) return false;
    if (capacity && !validRescueHistory(value)) return false;
    const detailedReport = value.lastReport && [10, 11].includes(Object.keys(value.lastReport).length);
    if (detailedReport) {
      if (!isRecord(value.lastSimulation) || Object.keys(value.lastSimulation).length !== 2 || JSON.stringify(value.lastSimulation.cellReports) !== JSON.stringify(value.lastReport.cellReports) || JSON.stringify(value.lastSimulation.plan) !== JSON.stringify(value.lastReport.plan)) return false;
    } else if (value.lastSimulation !== null) return false;
    const pendingBranches = value.phase === 'build' ? new Set(getPlan(value).newMutations.map((mutation) => mutation.branch)) : new Set();
    if (records.some((record) => record.mutation && record.mutation !== value.provenance[record.uid]?.initialMutation && !value.mutations.includes(record.mutation) && !pendingBranches.has(record.mutation))) return false;
    if (value.log.some((report) => report.synergies.some((synergy) => !value.synergies.includes(synergy.id)))) return false;
    if (value.phase !== 'ended' && (value.outcome !== null || value.ending !== null || value.resources.hull <= 0 || value.crew <= 0)) return false;
    if (value.phase === 'ended') {
      if (!['win', 'loss', 'evacuation'].includes(value.outcome) || value.ending !== ({ win: 'arrival', loss: 'collapse', evacuation: 'evacuation' })[value.outcome]) return false;
      if (value.outcome === 'win' && (value.system !== 10 || value.turn !== 9)) return false;
      if (value.outcome === 'loss' && value.resources.hull > 0 && value.crew > 0) return false;
      if (value.outcome === 'evacuation' && value.system !== 7) return false;
    }
    if (value.phase === 'route' && (value.route !== null || value.encounterId !== null || value.system > 9)) return false;
    if (['encounter', 'build', 'report'].includes(value.phase) && (!isRecord(value.route) || !boundedString(value.encounterId, 80))) return false;
    if (value.phase !== 'route') {
      if (!isRecord(value.route) || !['garden', 'salvage', 'anomaly'].includes(value.route.kind) || !boundedString(value.encounterId, 80)) return false;
      const routeSystem = Number(String(value.route.id).split('-')[0]);
      const departed = value.phase === 'report' || (value.phase === 'ended' && routeSystem === value.system - 1);
      const current = ['encounter', 'build'].includes(value.phase) || (value.phase === 'ended' && routeSystem === value.system);
      if (!departed && !current) return false;
      const expectedSystem = departed ? value.system - 1 : value.system;
      const priorReports = departed ? value.log.slice(0, -1) : value.log;
      const route = expectedRoute(value.seed, expectedSystem, value.route.kind, priorReports, value.ruleset);
      if (!sameRoute(value.route, route) || value.encounterId !== expectedEncounterId(value.seed, expectedSystem, route, priorReports, value.ruleset)) return false;
      if (departed && !RESOURCE_KEYS.every((key) => value.resources[key] === value.lastReport.after[key])) return false;
    }
    return true;
  } catch { return false; }
}

export function upgradeRun(value) {
  if (validateRun(value)) return copy(value);
  if (!validateRunV1(value)) return null;
  const next = copy(value);
  next.version = 2;
  next.openBays = Array.from({ length: GRID_SIZE }, (_, index) => index);
  const records = [...next.grid.filter(Boolean), ...next.cargo];
  next.provenance = Object.fromEntries(records.map((record) => [record.uid, provenanceFor(record, 'legacy')]));
  next.establishedUids = next.grid.filter(Boolean).map((record) => record.uid).sort();
  next.seedUids = [];
  next.launchSeedKeys = [];
  next.plan = next.phase === 'build' ? null : null;
  next.banking = next.phase === 'ended'
    ? { status: 'complete', limit: 0, eligibleKeys: [], receipt: { runId: next.runId, selectedKeys: [] } }
    : { status: 'none', limit: 0, eligibleKeys: [], receipt: null };
  next.lastSimulation = null;
  if (next.phase === 'build') beginPlan(next);
  return validateRun(next) ? next : null;
}

export { CATALOG, ORGANISMS, MODULES, ENCOUNTERS, HAZARDS, MUTATIONS, RESOURCE_KEYS, SYSTEM_NAMES };
