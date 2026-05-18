#!/usr/bin/env node
// Merge + dedupe raw scraper output → final data/shows.json + src/data/shows.json
// For v1 we only have Tradeshow Calendar source; dedup is intra-source only.
// Conflicts (same ID, differing fields) go to data/review-needed.json.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const RAW_PATH = resolve(ROOT, 'data/tradeshow-calendar-raw.json');
const FINAL_PATH = resolve(ROOT, 'data/shows.json');
const SHIP_PATH = resolve(ROOT, 'src/data/shows.json');
const REVIEW_PATH = resolve(ROOT, 'data/review-needed.json');

function pickBetter(a, b) {
  // Prefer record with more populated fields.
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

// City names like "Toronto, ON" → "toronto-on" (keep state for disambiguation).
function rebuildId(show) {
  const name = slugify(show.name);
  const city = slugify(show.city);
  const ym = show.start_date ? show.start_date.slice(0, 7) : 'unknown';
  return city ? `${name}-${city}-${ym}` : `${name}-${ym}`;
}

async function main() {
  const raw = JSON.parse(await readFile(RAW_PATH, 'utf8'));
  const byId = new Map();
  const conflicts = [];

  for (const show of raw.shows) {
    if (!show.start_date) {
      conflicts.push({ reason: 'missing start_date', show });
      continue;
    }
    show.id = rebuildId(show);
    const existing = byId.get(show.id);
    if (!existing) {
      byId.set(show.id, show);
      continue;
    }
    // Same ID — could be a true duplicate (same show listed twice) or a
    // collision (different shows with same slugified name + month).
    const sameShow = existing.name === show.name && existing.city === show.city && existing.end_date === show.end_date;
    if (sameShow) {
      byId.set(show.id, pickBetter(existing, show));
    } else {
      conflicts.push({ reason: 'id collision, different shows', id: show.id, existing, incoming: show });
    }
  }

  const shows = [...byId.values()].sort((a, b) => a.start_date.localeCompare(b.start_date));

  const final = {
    generated_at: new Date().toISOString(),
    source_scraped_at: raw.scraped_at,
    count: shows.length,
    countries: new Set(shows.map((s) => s.country)).size,
    shows,
  };

  // Set in JSON output → number, so swap before serializing.
  final.countries = new Set(shows.map((s) => s.country)).size;

  await mkdir(dirname(FINAL_PATH), { recursive: true });
  await mkdir(dirname(SHIP_PATH), { recursive: true });
  await writeFile(FINAL_PATH, JSON.stringify(final, null, 2));
  await writeFile(SHIP_PATH, JSON.stringify(final, null, 2));
  await writeFile(REVIEW_PATH, JSON.stringify({ conflicts }, null, 2));

  console.log(`Wrote ${shows.length} shows across ${final.countries} countries`);
  console.log(`  → ${FINAL_PATH}`);
  console.log(`  → ${SHIP_PATH}`);
  if (conflicts.length) {
    console.log(`\n${conflicts.length} conflicts → ${REVIEW_PATH}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
