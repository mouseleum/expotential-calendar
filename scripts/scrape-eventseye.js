#!/usr/bin/env node
// Scrape eventseye.com for trade shows in United States + Europe-main countries.
// Output: data/venue-scrapes/eventseye.json
// Usage:
//   node scripts/scrape-eventseye.js                # all 20 countries
//   node scripts/scrape-eventseye.js Finland        # one country

import { load } from 'cheerio';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASE = 'https://www.eventseye.com/fairs';
const DELAY_MS = 1500;
const PAGE_SIZE = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Canonical country name → eventseye URL slug. Slugs verified via the
// location index pages. Set covers the standalone "United States" region
// (src/utils/regions.js) plus all 19 Europe-main countries.
const COUNTRY_SLUGS = {
  'United States': 'usa-united-states-of-america',
  'Austria': 'austria',
  'Belgium': 'belgium',
  'Denmark': 'denmark',
  'Finland': 'finland',
  'France': 'france',
  'Germany': 'germany',
  'Greece': 'greece',
  'Ireland': 'ireland',
  'Italy': 'italy',
  'Luxembourg': 'luxembourg',
  'Malta': 'malta',
  'Monaco': 'monaco',
  'Netherlands': 'netherlands',
  'Norway': 'norway',
  'Portugal': 'portugal',
  'Spain': 'spain',
  'Sweden': 'sweden',
  'Switzerland': 'switzerland',
  'United Kingdom': 'uk-united-kingdom',
};

// eventseye responses are Latin-1 encoded.
async function fetchPage(slug, page) {
  const suffix = page === 0 ? '' : `_${page}`;
  const url = `${BASE}/c1_trade-shows_${slug}${suffix}.html`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder('iso-8859-1').decode(buf);
}

// Parse "DD/MM/YYYY" → "YYYY-MM-DD". Returns null on failure.
function parseDate(s) {
  const m = (s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// Add days to an ISO date (YYYY-MM-DD) → YYYY-MM-DD.
function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function parseEvents(html, country) {
  const $ = load(html);
  const events = [];
  const rawRowCount = $('a[href^="f-"]').length;

  $('a[href^="f-"]').each((_, el) => {
    const $a = $(el);
    const name = $a.find('b').first().text().trim();
    if (!name) return;

    // Walk up to the <tr> that contains this event link.
    const $row = $a.closest('tr');
    if ($row.length === 0) return;

    const $cells = $row.children('td');
    // Skip if row doesn't look like an event row (4 cells expected).
    if ($cells.length < 4) return;

    // Col 3 (index 2): city anchor + optional venue anchor
    const $locCell = $cells.eq(2);
    const $locAnchors = $locCell.find('a');
    const city = $locAnchors.eq(0).text().trim() || null;
    const venue = $locAnchors.length >= 2 ? $locAnchors.eq(1).text().trim() : null;

    // Col 4 (index 3): "DD/MM/YYYY" immediately followed by "N days" (or "1 day").
    // Inner HTML has them separated by <br><i>...</i>, but .text() concatenates
    // without a space — "03/11/20262 days". Parse the date first, then look at
    // the remainder for the duration.
    const $dateCell = $cells.eq(3);
    const dateText = $dateCell.text().trim();
    // Format is MM/DD/YYYY (US-style). Skip rows with approximate dates
    // like "Jan. 2027" or "April 2027 (?)".
    const dateMatch = dateText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!dateMatch) return;
    const startDate = `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}`;

    const remainder = dateText.slice(dateMatch.index + dateMatch[0].length);
    const durationMatch = remainder.match(/(\d+)\s*days?/i);
    const days = durationMatch ? parseInt(durationMatch[1], 10) : 1;
    const endDate = days > 1 ? addDays(startDate, days - 1) : startDate;

    // Col 2 (index 1): frequency (e.g., "every 2 years", "annual")
    const frequency = $cells.eq(1).text().trim();

    events.push({
      name,
      start_date: startDate,
      end_date: endDate,
      city,
      country,
      venue,
      industry: [],
      website: null,
      notes: frequency ? `frequency: ${frequency}` : '',
    });
  });

  return { events, rawRowCount };
}

async function scrapeCountry(country, slug) {
  const all = [];
  let page = 0;
  while (true) {
    let html;
    try {
      html = await fetchPage(slug, page);
    } catch (err) {
      if (err.message.includes('HTTP 404')) break;
      throw err;
    }
    const { events, rawRowCount } = parseEvents(html, country);
    all.push(...events);
    // Paginate based on raw row count — some rows get rejected (approximate
    // dates like "April 2027 (?)") so parsed-event count may be < PAGE_SIZE
    // even when more pages exist.
    if (rawRowCount < PAGE_SIZE) break;
    page++;
    await sleep(DELAY_MS);
  }
  return all;
}

async function main() {
  const argCountry = process.argv[2];
  const targets = argCountry
    ? Object.entries(COUNTRY_SLUGS).filter(([c]) => c === argCountry)
    : Object.entries(COUNTRY_SLUGS);

  if (targets.length === 0) {
    console.error(`Unknown country: ${argCountry}`);
    console.error('Available:', Object.keys(COUNTRY_SLUGS).join(', '));
    process.exit(1);
  }

  const result = {
    venue_id: 'eventseye',
    scraped_at: new Date().toISOString(),
    source_url: 'https://www.eventseye.com',
    countries: {},
    events: [],
  };

  let total = 0;
  for (let i = 0; i < targets.length; i++) {
    const [country, slug] = targets[i];
    process.stdout.write(`[${i + 1}/${targets.length}] ${country}... `);
    try {
      const events = await scrapeCountry(country, slug);
      result.countries[country] = events.length;
      result.events.push(...events);
      total += events.length;
      console.log(`${events.length} events`);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      result.countries[country] = { error: err.message };
    }
    if (i < targets.length - 1) await sleep(DELAY_MS);
  }

  const outPath = resolve(ROOT, 'data/venue-scrapes/eventseye.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(`\nDone. ${total} events across ${targets.length} countries → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
