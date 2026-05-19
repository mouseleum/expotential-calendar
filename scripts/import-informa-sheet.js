#!/usr/bin/env node
// One-shot importer for the Informa Markets event sheet (pasted markdown).
// Reads /tmp/informa-events.md (just the raw text from the Google Sheet)
// and produces data/venue-scrapes/informa.json.
//
// The sheet has rows of 4 lines each:
//   | <name> |
//   | <date string> |
//   | <city>,<country> |
//   | View Event Site |

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const COUNTRY_FIX = {
  'Brasil': 'Brazil',
  'Türkiye': 'Turkey',
  'Hong Kong, S.A.R., China': 'China',
  'Hong Kong': 'China',
  '': null,
};

// Fallback when the sheet has the city but the country cell is blank.
// Add cities here as new sheet imports surface them.
const CITY_TO_COUNTRY = {
  'Warsaw': 'Poland',
};

const MONTHS = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
  april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
  august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

function pad(n) { return String(n).padStart(2, '0'); }

// Parse one of:
//   "19-21 May, 2026"            (same month)
//   "30 May-01 June, 2026"       (same year, cross-month)
//   "31 August-03 September, 2026"
//   "27 October, 2026"           (single day)
//   "24 January-02 February, 2027"
function parseDateRange(raw) {
  const s = raw.replace(/\s+/g, ' ').trim();

  // single day: "27 October, 2026" or "11 November, 2026"
  let m = s.match(/^(\d{1,2})\s+([A-Za-z]+),\s*(\d{4})$/);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    const d = `${m[3]}-${pad(month)}-${pad(m[1])}`;
    return { start: d, end: d };
  }

  // same month: "19-21 May, 2026" or "10-12 August, 2026"
  m = s.match(/^(\d{1,2})-(\d{1,2})\s+([A-Za-z]+),\s*(\d{4})$/);
  if (m) {
    const month = MONTHS[m[3].toLowerCase()];
    if (!month) return null;
    return {
      start: `${m[4]}-${pad(month)}-${pad(m[1])}`,
      end:   `${m[4]}-${pad(month)}-${pad(m[2])}`,
    };
  }

  // cross-month: "30 May-01 June, 2026" or "31 August-03 September, 2026"
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)-(\d{1,2})\s+([A-Za-z]+),\s*(\d{4})$/);
  if (m) {
    const sm = MONTHS[m[2].toLowerCase()];
    const em = MONTHS[m[4].toLowerCase()];
    if (!sm || !em) return null;
    // If end month < start month → end is next year (e.g. "30 Dec-02 Jan, 2026" means 2026→2027)
    const startYear = +m[5];
    const endYear = em < sm ? startYear + 1 : startYear;
    return {
      start: `${startYear}-${pad(sm)}-${pad(m[1])}`,
      end:   `${endYear}-${pad(em)}-${pad(m[3])}`,
    };
  }

  return null;
}

function parseLocation(s) {
  // "São Paulo,Brasil" or "Warsaw, " or "St. Petersburg ,United States"
  const idx = s.lastIndexOf(',');
  if (idx < 0) return { city: s.trim() || null, country: null };
  const city = s.slice(0, idx).trim();
  const country = s.slice(idx + 1).trim();
  return {
    city: city || null,
    country: COUNTRY_FIX[country] ?? (country || null),
  };
}

async function main() {
  const inputPath = process.argv[2] || '/tmp/informa-events.md';
  const raw = await readFile(inputPath, 'utf8');

  // Strip leading/trailing "| " on each line; collect non-empty cells.
  const cells = [];
  for (const line of raw.split('\n')) {
    const l = line.trim();
    if (!l.startsWith('|')) continue;
    if (l === '| :-: |') continue; // header alignment row, skip
    const cell = l.replace(/^\|\s*/, '').replace(/\s*\|$/, '').trim();
    if (cell === '' || cell === ':-:') continue;
    cells.push(cell);
  }

  // Each event = 4 cells: name, date, loc, "View Event Site"
  const events = [];
  let skipped = 0;
  for (let i = 0; i + 3 < cells.length; i += 4) {
    const name = cells[i].replace(/\\([&|])/g, '$1');
    const dateRaw = cells[i + 1];
    const loc = cells[i + 2];
    const tail = cells[i + 3];
    if (tail !== 'View Event Site') {
      // Mis-aligned — try to recover by scanning forward
      const offset = cells.slice(i, i + 12).indexOf('View Event Site');
      if (offset < 0) { skipped++; continue; }
      i += offset - 3;
      continue;
    }
    const dates = parseDateRange(dateRaw);
    if (!dates) { skipped++; continue; }
    let { city, country } = parseLocation(loc);
    if (!country && city && CITY_TO_COUNTRY[city.trim()]) {
      country = CITY_TO_COUNTRY[city.trim()];
    }
    if (!country) { skipped++; continue; }
    events.push({
      name: name.trim(),
      start_date: dates.start,
      end_date: dates.end,
      city,
      country,
      venue: null,
      industry: [],
      website: null,
      notes: 'Informa Markets',
    });
  }

  const out = {
    venue_id: 'informa',
    scraped_at: new Date().toISOString(),
    source_url: 'https://events.informamarkets.com/en/event-listing.html',
    events,
  };

  const outPath = resolve(ROOT, 'data/venue-scrapes/informa.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2));
  console.log(`Imported ${events.length} events (skipped ${skipped})`);
  console.log(`→ ${outPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
