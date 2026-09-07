const ENDPOINT = 'https://plausible.io/api/event';
const DOMAIN = 'jamiecole.page';
const GAME_URL = 'https://jamiecole.page/arkship/';

const NAMES = Object.freeze({
  start: 'ARKSHIP: Voyage started',
  another: 'ARKSHIP: Another voyage',
  mutation: 'ARKSHIP: Mutation committed',
  reused: 'ARKSHIP: Genome reused',
  win: 'ARKSHIP: Voyage won',
  loss: 'ARKSHIP: Voyage lost',
  evacuation: 'ARKSHIP: Voyage evacuated',
});

const ROUTE_EVENTS = Object.freeze({
  garden: 'ARKSHIP: Garden route',
  salvage: 'ARKSHIP: Salvage route',
  anomaly: 'ARKSHIP: Anomaly route',
});

const ALLOWED_EVENTS = new Set([
  'pageview',
  ...Object.values(NAMES),
  ...Object.values(ROUTE_EVENTS),
  ...Array.from({ length: 9 }, (_, index) => `ARKSHIP: Jump ${index + 1}`),
]);

function records(container) {
  if (!container || typeof container !== 'object') return [];
  const grid = Array.isArray(container.grid) ? container.grid.filter(Boolean) : [];
  const cargo = Array.isArray(container.cargo) ? container.cargo.filter(Boolean) : [];
  return [...grid, ...cargo];
}

function committedJump(previous, next, action) {
  if (!['DEPART', 'DEPART_FINAL'].includes(action?.type)) return false;
  if (!Number.isInteger(previous?.turn) || next?.turn !== previous.turn + 1) return false;
  if (next?.system !== previous?.system + 1 || next?.lastReport?.system !== previous?.system) return false;
  return previous?.phase === 'build' || (action.type === 'DEPART_FINAL' && previous?.phase === 'route');
}

function mutationCommitted(previous, next) {
  const baseline = previous?.plan?.baseline ?? previous;
  if (!baseline) return false;
  const afterByUid = new Map(records(next).map((record) => [record.uid, record]));
  return records(baseline).some((before) => {
    const after = afterByUid.get(before.uid);
    return after && before.mutation !== after.mutation && typeof after.mutation === 'string';
  });
}

function inheritedGenomeGrown(previous, next) {
  const baseline = previous?.plan?.baseline;
  if (!baseline || !Array.isArray(baseline.seedUids)) return false;
  const nextGridUids = new Set(
    (Array.isArray(next?.grid) ? next.grid : []).filter(Boolean).map((record) => record.uid),
  );
  const established = new Set(Array.isArray(next?.establishedUids) ? next.establishedUids : []);
  const remainingSeeds = new Set(Array.isArray(next?.seedUids) ? next.seedUids : []);
  return baseline.seedUids.some((uid) => baseline.provenance?.[uid]?.source === 'inherited'
    && nextGridUids.has(uid)
    && established.has(uid)
    && !remainingSeeds.has(uid));
}

export function committedEvents(previous, next, action = {}) {
  try {
    const events = [];
    const jump = committedJump(previous, next, action);
    if (jump) {
      if (next.turn >= 1 && next.turn <= 9) events.push(`ARKSHIP: Jump ${next.turn}`);
      const routeEvent = ROUTE_EVENTS[next.lastReport?.route?.kind];
      if (routeEvent) events.push(routeEvent);
      if (mutationCommitted(previous, next)) events.push(NAMES.mutation);
      if (inheritedGenomeGrown(previous, next)) events.push(NAMES.reused);
    }
    if (previous?.phase !== 'ended' && next?.phase === 'ended') {
      const endingEvent = NAMES[next.outcome];
      if (endingEvent) events.push(endingEvent);
    }
    return events;
  } catch {
    return [];
  }
}

function freshVoyage(run) {
  return run && typeof run === 'object'
    && run.turn === 0
    && run.system === 1
    && run.phase === 'route'
    && run.outcome === null;
}

export function createAnalytics(options = {}) {
  const config = options && typeof options === 'object' ? options : {};
  const request = config.fetch ?? globalThis.fetch;
  const hostname = config.hostname ?? globalThis.location?.hostname;
  let active = config.enabled === true;

  function post(name) {
    if (!active || hostname !== DOMAIN || typeof request !== 'function' || !ALLOWED_EVENTS.has(name)) return;
    try {
      const pending = request(ENDPOINT, {
        method: 'POST',
        keepalive: true,
        credentials: 'omit',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ domain: DOMAIN, url: GAME_URL, name }),
      });
      Promise.resolve(pending).catch(() => {});
    } catch {
      // Measurement must never interrupt play or persistence.
    }
  }

  function setEnabled(enabled) {
    const wasActive = active;
    active = enabled === true;
    if (active && !wasActive) post('pageview');
    return active;
  }

  function startVoyage(run, archive) {
    if (!freshVoyage(run)) return [];
    const events = [NAMES.start];
    if (Array.isArray(archive?.completedRuns) && archive.completedRuns.length > 0) events.push(NAMES.another);
    for (const name of events) post(name);
    return events;
  }

  function transition(previous, next, action) {
    const events = committedEvents(previous, next, action);
    for (const name of events) post(name);
    return events;
  }

  if (active) post('pageview');
  return Object.freeze({ setEnabled, startVoyage, transition });
}
