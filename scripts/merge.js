#!/usr/bin/env node
// Merge raw scraper outputs (Tradeshow Calendar + per-venue scrapes)
// → final data/shows.json + src/data/shows.json
// Conflicts go to data/review-needed.json.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const RAW_PATH = resolve(ROOT, 'data/tradeshow-calendar-raw.json');
const VENUE_DIR = resolve(ROOT, 'data/venue-scrapes');
const VENUES_CONFIG = resolve(ROOT, 'scripts/venues.json');
const FINAL_PATH = resolve(ROOT, 'data/shows.json');
const SHIP_PATH = resolve(ROOT, 'src/data/shows.json');
const REVIEW_PATH = resolve(ROOT, 'data/review-needed.json');

function pickBetter(a, b) {
  const score = (s) => [s.attendees, s.exhibitors, s.venue, s.website, s.city, s.country_code]
    .filter((v) => v !== null && v !== undefined && v !== '').length;
  return score(b) > score(a) ? b : a;
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&amp;/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function rebuildId(show) {
  const name = slugify(show.name);
  const city = slugify(show.city);
  const ym = show.start_date ? show.start_date.slice(0, 7) : 'unknown';
  return city ? `${name}-${city}-${ym}` : `${name}-${ym}`;
}

// Normalize a show name for fuzzy match: lowercase, strip year, strip
// common suffixes ("2026", "annual conference"), collapse whitespace.
function normalizeForMatch(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\bannual\b|\bconference\b|\bcongress\b|\bmeeting\b|\bexpo\b|\bsummit\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0)
    .sort()
    .join(' ');
}

// True if two shows are likely the same: same normalized name + same city +
// overlapping date ranges.
function isLikelyDup(a, b) {
  if (a.city !== b.city) return false;
  const na = normalizeForMatch(a.name);
  const nb = normalizeForMatch(b.name);
  if (!na || !nb) return false;
  if (na !== nb) {
    // Token containment: shorter ⊆ longer
    const setA = new Set(na.split(' '));
    const setB = new Set(nb.split(' '));
    const [small, big] = setA.size < setB.size ? [setA, setB] : [setB, setA];
    let overlap = 0;
    for (const t of small) if (big.has(t)) overlap++;
    if (overlap < small.size) return false;
  }
  // Date overlap (or same start month)
  if (!a.start_date || !b.start_date) return false;
  const sameStartMonth = a.start_date.slice(0, 7) === b.start_date.slice(0, 7);
  return sameStartMonth;
}

async function loadTradeshowCalendar() {
  if (!existsSync(RAW_PATH)) return { shows: [], scraped_at: null };
  const raw = JSON.parse(await readFile(RAW_PATH, 'utf8'));
  for (const s of raw.shows) s.id = rebuildId(s);
  return raw;
}

async function loadVenueScrapes() {
  if (!existsSync(VENUE_DIR)) return [];
  const venuesConfig = existsSync(VENUES_CONFIG)
    ? JSON.parse(await readFile(VENUES_CONFIG, 'utf8'))
    : [];
  const byId = new Map(venuesConfig.map((v) => [v.id, v]));
  const files = (await readdir(VENUE_DIR)).filter((f) => f.endsWith('.json'));
  const shows = [];
  for (const file of files) {
    const data = JSON.parse(await readFile(resolve(VENUE_DIR, file), 'utf8'));
    const venue = byId.get(data.venue_id);
    if (!venue) {
      console.warn(`venue-scrape ${file}: no matching entry in venues.json for id=${data.venue_id}`);
      continue;
    }
    for (const ev of data.events) {
      const show = {
        name: ev.name,
        start_date: ev.start_date,
        end_date: ev.end_date,
        city: venue.city,
        country: venue.country,
        country_code: venue.country_code,
        venue: venue.name,
        industry: ev.industry || [],
        attendees: ev.attendees ?? null,
        exhibitors: ev.exhibitors ?? null,
        website: ev.website || null,
        source: `venue:${venue.id}`,
        source_url: venue.url,
        notes: ev.notes || '',
      };
      show.id = rebuildId(show);
      shows.push(show);
    }
  }
  return shows;
}

async function main() {
  const ttc = await loadTradeshowCalendar();
  const venueShows = await loadVenueScrapes();
  const byId = new Map();
  const conflicts = [];

  // 1. Tradeshow Calendar first (preferred source — more structured data)
  for (const show of ttc.shows) {
    if (!show.start_date) {
      conflicts.push({ reason: 'missing start_date', show });
      continue;
    }
    const existing = byId.get(show.id);
    if (!existing) byId.set(show.id, show);
    else if (existing.name === show.name) byId.set(show.id, pickBetter(existing, show));
    else conflicts.push({ reason: 'id collision (intra-ttc)', id: show.id, existing, incoming: show });
  }

  // 2. Venue scrapes — fuzzy-match against existing first to avoid dups
  const existingByCity = new Map();
  for (const s of byId.values()) {
    if (!existingByCity.has(s.city)) existingByCity.set(s.city, []);
    existingByCity.get(s.city).push(s);
  }

  let venueAdded = 0;
  let venueMerged = 0;
  for (const show of venueShows) {
    if (!show.start_date) {
      conflicts.push({ reason: 'venue: missing start_date', show });
      continue;
    }
    const cityShows = existingByCity.get(show.city) || [];
    const dup = cityShows.find((s) => isLikelyDup(s, show));
    if (dup) {
      // Merge: keep TTC name+id, add venue field + website if missing
      if (!dup.venue) dup.venue = show.venue;
      if (!dup.website) dup.website = show.website;
      if (!dup.source.includes(show.source)) dup.source += `+${show.source}`;
      venueMerged++;
    } else if (byId.has(show.id)) {
      // Exact ID collision but not detected as dup — rare; queue for review
      conflicts.push({ reason: 'venue: id collision, fuzzy missed', id: show.id, existing: byId.get(show.id), incoming: show });
    } else {
      byId.set(show.id, show);
      if (!existingByCity.has(show.city)) existingByCity.set(show.city, []);
      existingByCity.get(show.city).push(show);
      venueAdded++;
    }
  }

  const shows = [...byId.values()].sort((a, b) => a.start_date.localeCompare(b.start_date));

  const final = {
    generated_at: new Date().toISOString(),
    source_scraped_at: ttc.scraped_at,
    count: shows.length,
    countries: new Set(shows.map((s) => s.country)).size,
    shows,
  };

  await mkdir(dirname(FINAL_PATH), { recursive: true });
  await mkdir(dirname(SHIP_PATH), { recursive: true });
  await writeFile(FINAL_PATH, JSON.stringify(final, null, 2));
  await writeFile(SHIP_PATH, JSON.stringify(final, null, 2));
  await writeFile(REVIEW_PATH, JSON.stringify({ conflicts }, null, 2));

  console.log(`TTC: ${ttc.shows.length} shows`);
  console.log(`Venues: ${venueShows.length} events (added ${venueAdded}, merged ${venueMerged})`);
  console.log(`Final: ${shows.length} shows / ${final.countries} countries`);
  console.log(`  → ${SHIP_PATH}`);
  if (conflicts.length) console.log(`${conflicts.length} conflicts → ${REVIEW_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
