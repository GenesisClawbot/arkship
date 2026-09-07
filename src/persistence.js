import {
  createRun,
  mergeArchive,
  upgradeArchive,
  upgradeRun,
  validateArchive,
  validateRun,
} from './engine.js';

export const STORAGE_KEYS = Object.freeze({
  save: 'arkship.save.v2',
  legacyRun: 'arkship.run.v1',
  legacyArchive: 'arkship.archive.v1',
  legacySettings: 'arkship.settings.v1',
});

const VERSION = 2;
const MAX_SEQUENCE = 1_000_000;
const MAX_NOTICE_LENGTH = 240;
const MAX_RECOVERY_SUFFIX = 8;

const defaultArchive = () => ({
  version: VERSION,
  sequence: 0,
  completedRuns: [],
  discoveries: [],
  mutations: [],
  synergies: [],
  endings: { win: 0, loss: 0, evacuation: 0 },
  bestScore: 0,
  genomes: [],
  bankingReceipts: [],
  blueprints: [],
});

const defaultSettings = () => ({ sound: false });

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedInteger(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function validSettings(value) {
  return isRecord(value)
    && Object.keys(value).length === 1
    && typeof value.sound === 'boolean';
}

function validLegacySettings(value) {
  return isRecord(value)
    && value.version === 1
    && typeof value.sound === 'boolean';
}

function retainedRunSequence(run) {
  if (!isRecord(run)) return 0;
  let sequence = boundedInteger(run.sequence, 0, MAX_SEQUENCE) ? run.sequence : 0;
  if (typeof run.seed !== 'string' || typeof run.runId !== 'string') return sequence;
  const prefix = `${run.seed}-`;
  if (!run.runId.startsWith(prefix)) return sequence;
  const suffix = Number(run.runId.slice(prefix.length));
  if (boundedInteger(suffix, 0, MAX_SEQUENCE)) sequence = Math.max(sequence, suffix);
  return sequence;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validEnvelope(value) {
  if (!isRecord(value)
    || Object.keys(value).length !== 4
    || value.version !== VERSION
    || (value.run !== null && validateRun(value.run) !== true)
    || validateArchive(value.archive) !== true
    || !validSettings(value.settings)) {
    return false;
  }
  if (retainedRunSequence(value.run) > value.archive.sequence) return false;
  if (value.run === null) return true;
  const reconciled = mergeArchive(value.archive, value.run);
  return reconciled !== null && sameValue(reconciled, value.archive);
}

function conciseNotice(messages) {
  const result = [...new Set(messages.filter(Boolean))].join(' ');
  return result.length > MAX_NOTICE_LENGTH
    ? `${result.slice(0, MAX_NOTICE_LENGTH - 1)}…`
    : result;
}

export function createPersistence(storage) {
  let backing = storage;
  let initialized = false;
  let available = true;
  let memoryRun = null;
  let memoryArchive = defaultArchive();
  let memorySettings = defaultSettings();
  const notices = [];

  function addNotice(message) {
    if (message) notices.push(message);
  }

  function markUnavailable(message = 'UNSAVED: storage unavailable; progress lasts only in this open page.') {
    available = false;
    addNotice(message);
  }

  function resolveStorage() {
    if (backing !== undefined) {
      if (backing && typeof backing.getItem === 'function' && typeof backing.setItem === 'function') {
        return backing;
      }
      markUnavailable();
      return null;
    }
    try {
      backing = globalThis.localStorage;
    } catch {
      backing = null;
    }
    if (!backing || typeof backing.getItem !== 'function' || typeof backing.setItem !== 'function') {
      markUnavailable();
      return null;
    }
    return backing;
  }

  function readRaw(target, key) {
    try {
      return { ok: true, raw: target.getItem(key) };
    } catch {
      markUnavailable();
      return { ok: false, raw: null };
    }
  }

  function backup(target, key, raw) {
    if (raw == null) return;
    try {
      for (let suffix = 0; suffix <= MAX_RECOVERY_SUFFIX; suffix += 1) {
        const recoveryKey = suffix === 0 ? `${key}.recovery` : `${key}.recovery.${suffix}`;
        if (target.getItem(recoveryKey) === null) {
          target.setItem(recoveryKey, raw);
          return;
        }
      }
      addNotice('Recovery slots are full; the corrupt save was left untouched.');
    } catch {
      markUnavailable('UNSAVED: storage write blocked; progress remains only in this open page.');
      addNotice('A recovery copy could not be saved; the original record was left untouched.');
    }
  }

  function parseStored(target, key, upgrade, fallback, label) {
    const result = readRaw(target, key);
    if (!result.ok) return { ok: false, value: clone(fallback), present: false };
    if (result.raw === null) return { ok: true, value: clone(fallback), present: false };
    try {
      const upgraded = upgrade(JSON.parse(result.raw));
      if (upgraded !== null) return { ok: true, value: clone(upgraded), present: true };
    } catch {
      // The recovery path below handles malformed JSON and defensive upgrade failures alike.
    }
    backup(target, key, result.raw);
    addNotice(`${label} data was corrupt or unsupported and was ignored.`);
    return { ok: true, value: clone(fallback), present: true };
  }

  function envelope() {
    return {
      version: VERSION,
      run: clone(memoryRun),
      archive: clone(memoryArchive),
      settings: clone(memorySettings),
    };
  }

  function writeEnvelope(target = resolveStorage()) {
    if (!target) return false;
    try {
      target.setItem(STORAGE_KEYS.save, JSON.stringify(envelope()));
      return true;
    } catch {
      markUnavailable('UNSAVED: storage write blocked; progress remains only in this open page.');
      return false;
    }
  }

  function reconcileArchive(run, archive) {
    if (run === null) return clone(archive);
    try {
      const merged = mergeArchive(clone(archive), clone(run));
      return merged !== null && validateArchive(merged) === true ? clone(merged) : null;
    } catch {
      return null;
    }
  }

  function loadLegacy(target) {
    const archiveResult = parseStored(
      target,
      STORAGE_KEYS.legacyArchive,
      upgradeArchive,
      defaultArchive(),
      'Legacy archive',
    );
    if (!archiveResult.ok) return;

    const runResult = parseStored(
      target,
      STORAGE_KEYS.legacyRun,
      upgradeRun,
      null,
      'Legacy run',
    );
    if (!runResult.ok) return;

    const settingsResult = parseStored(
      target,
      STORAGE_KEYS.legacySettings,
      (value) => (validLegacySettings(value) ? { sound: value.sound } : null),
      defaultSettings(),
      'Legacy settings',
    );
    if (!settingsResult.ok) return;

    memoryRun = runResult.value;
    memoryArchive = archiveResult.value;
    memorySettings = settingsResult.value;

    const retainedSequence = retainedRunSequence(memoryRun);
    if (retainedSequence > memoryArchive.sequence) {
      memoryArchive = { ...memoryArchive, sequence: retainedSequence };
    }
    const merged = reconcileArchive(memoryRun, memoryArchive);
    if (merged === null) {
      memoryRun = null;
      memoryArchive = defaultArchive();
      memorySettings = defaultSettings();
      addNotice('Legacy data could not be reconciled and was ignored.');
      return;
    }
    memoryArchive = merged;
    writeEnvelope(target);
  }

  function ensureLoaded() {
    if (initialized) return;
    initialized = true;
    const target = resolveStorage();
    if (!target) return;

    const saveResult = readRaw(target, STORAGE_KEYS.save);
    if (!saveResult.ok) return;
    if (saveResult.raw === null) {
      loadLegacy(target);
      return;
    }

    let stored;
    try {
      stored = JSON.parse(saveResult.raw);
    } catch {
      stored = null;
    }
    if (!validEnvelope(stored)) {
      backup(target, STORAGE_KEYS.save, saveResult.raw);
      addNotice('V2 save data was corrupt or unsupported; recovery mode is active.');
      return;
    }
    memoryRun = clone(stored.run);
    memoryArchive = clone(stored.archive);
    memorySettings = clone(stored.settings);
  }

  function snapshot() {
    return {
      run: clone(memoryRun),
      archive: clone(memoryArchive),
      settings: clone(memorySettings),
      notice: conciseNotice(notices),
      available,
    };
  }

  function load() {
    ensureLoaded();
    return snapshot();
  }

  function startRun(seed, seedKeys = [], options = {}) {
    ensureLoaded();
    if (memoryRun?.banking?.status === 'pending') {
      addNotice('Resolve or skip pending genome banking before starting the next voyage.');
      return snapshot();
    }
    if (!boundedInteger(memoryArchive.sequence, 0, MAX_SEQUENCE - 1)) {
      addNotice('Archive sequence is full; start a new lineage after export.');
      return snapshot();
    }

    let run;
    try {
      run = createRun(seed, clone(memoryArchive), clone(seedKeys), options);
    } catch {
      run = null;
    }
    if (run === null || validateRun(run) !== true) {
      addNotice('The new voyage could not be started with that code and genome selection.');
      return snapshot();
    }

    const nextArchive = { ...memoryArchive, sequence: memoryArchive.sequence + 1 };
    if (validateArchive(nextArchive) !== true || retainedRunSequence(run) > nextArchive.sequence) {
      addNotice('The new voyage identity could not be reserved.');
      return snapshot();
    }
    memoryRun = clone(run);
    memoryArchive = nextArchive;
    writeEnvelope();
    return snapshot();
  }

  function saveRun(run) {
    ensureLoaded();
    if (validateRun(run) !== true) {
      addNotice('Run save rejected as invalid.');
      return snapshot();
    }

    let nextArchive = clone(memoryArchive);
    const retainedSequence = retainedRunSequence(run);
    if (retainedSequence > nextArchive.sequence) {
      nextArchive = { ...nextArchive, sequence: retainedSequence };
    }
    nextArchive = reconcileArchive(run, nextArchive);
    if (nextArchive === null) {
      addNotice('Run save could not update the archive.');
      return snapshot();
    }

    memoryRun = clone(run);
    memoryArchive = nextArchive;
    writeEnvelope();
    return snapshot();
  }

  function saveSettings(settings) {
    ensureLoaded();
    if (!isRecord(settings) || typeof settings.sound !== 'boolean') {
      addNotice('Settings save rejected as invalid.');
      return snapshot();
    }
    memorySettings = { sound: settings.sound };
    writeEnvelope();
    return snapshot();
  }

  return Object.freeze({ load, saveRun, startRun, saveSettings });
}
