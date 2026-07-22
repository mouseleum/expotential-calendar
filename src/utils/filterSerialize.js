// Filter state has Sets in it (countries, venues, industries, audiences,
// sources). JSON.stringify can't round-trip Sets, so we convert to/from arrays
// at the API boundary.
//
// Deserialization is defensive: presets are stored server-side without shape
// validation, so a preset saved by an older client (or a hand-crafted POST)
// may miss fields or hold wrong types. Every field is coerced to the type the
// app expects — a bad preset must never crash the UI for everyone.

const SET_FIELDS = ['countries', 'venues', 'industries', 'audiences', 'sources'];
const STRING_FIELDS = ['query', 'minAttendees', 'dateFrom', 'dateTo', 'week', 'weekYear'];
const BOOL_FIELDS = ['flaggedOnly', 'scan2leadOnly', 'majorCitiesOnly'];

export function filtersToJSON(filters) {
  const out = { ...filters };
  for (const k of SET_FIELDS) {
    if (out[k] instanceof Set) out[k] = [...out[k]];
  }
  return out;
}

export function filtersFromJSON(obj) {
  const src = obj && typeof obj === 'object' ? obj : {};
  const out = {};
  for (const k of SET_FIELDS) {
    out[k] = new Set(Array.isArray(src[k]) ? src[k].filter((v) => typeof v === 'string') : []);
  }
  for (const k of STRING_FIELDS) {
    const v = src[k];
    out[k] = typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
  }
  for (const k of BOOL_FIELDS) {
    out[k] = src[k] === true;
  }
  return out;
}
