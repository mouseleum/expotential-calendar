// Filter state has Sets in it (countries, venues, industries, audiences,
// sources). JSON.stringify can't round-trip Sets, so we convert to/from arrays
// at the API boundary.

const SET_FIELDS = ['countries', 'venues', 'industries', 'audiences', 'sources'];

export function filtersToJSON(filters) {
  const out = { ...filters };
  for (const k of SET_FIELDS) {
    if (out[k] instanceof Set) out[k] = [...out[k]];
  }
  return out;
}

export function filtersFromJSON(obj) {
  const out = { ...obj };
  for (const k of SET_FIELDS) {
    out[k] = new Set(Array.isArray(obj[k]) ? obj[k] : []);
  }
  return out;
}
