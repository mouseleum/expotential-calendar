// Tags each show with whether its city is a "major" one for its country —
// backs the "Major cities only" filter, which exists to cut noise from the
// long tail of one-off small-town shows (mostly US/France EventsEye
// listings: local gun shows, hobby fairs, etc.) without hiding countries
// that are already fairly concentrated (most of Europe).
//
// Fully automatic and self-updating: a city qualifies if it's among the
// country's top N cities by show count, or if it accounts for at least
// MIN_SHARE of that country's shows on its own. No manual curation file to
// maintain — as trade-show activity shifts between cities over time, the
// set adjusts on its own at the next merge.

import { stripDiacritics } from './normalize.js';

export const TOP_N = 15;
export const MIN_SHARE = 0.015;

// Normalizes a city string for grouping/matching: strips a trailing
// US/Canada-style ", ST" state/province code, diacritics, punctuation, and
// case. The show's own `city` field is never rewritten — this key only
// decides which (country, city) pairs count as "major".
export function cityKey(city) {
  if (!city) return '';
  return stripDiacritics(city.toLowerCase())
    .replace(/,\s*[a-z]{2,3}$/i, '')
    .replace(/['’.]/g, '')
    .trim();
}

// Returns a Set of `${country}||${cityKey}` strings for every (country,
// city) pair that qualifies as major. `shows` need only have `city` and
// `country`.
export function computeMajorCities(shows, { topN = TOP_N, minShare = MIN_SHARE } = {}) {
  const byCountry = new Map(); // country -> Map(cityKey -> count)
  for (const s of shows) {
    if (!s.country) continue;
    const key = cityKey(s.city);
    if (!key) continue;
    if (!byCountry.has(s.country)) byCountry.set(s.country, new Map());
    const counts = byCountry.get(s.country);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const majors = new Set();
  for (const [country, counts] of byCountry) {
    const total = [...counts.values()].reduce((a, n) => a + n, 0);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    sorted.slice(0, topN).forEach(([key]) => majors.add(`${country}||${key}`));
    sorted.forEach(([key, n]) => {
      if (n >= total * minShare) majors.add(`${country}||${key}`);
    });
  }
  return majors;
}

export function isMajorCity(show, majorSet) {
  if (!show.country) return false;
  return majorSet.has(`${show.country}||${cityKey(show.city)}`);
}
