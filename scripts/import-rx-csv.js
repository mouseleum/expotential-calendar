#!/usr/bin/env node
// One-shot importer for rx-events-export.csv → data/venue-scrapes/rx-events.json.
// Usage: node scripts/import-rx-csv.js /path/to/rx-events-export.csv

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_PATH = resolve(ROOT, 'data/venue-scrapes/rx-events.json');

const COUNTRY_FIX = {
  'Türkiye': 'Turkey',
  'Saudi': 'Saudi Arabia',
  'Middle East - Saudi Arabia': 'Saudi Arabia',
  'UAE': 'United Arab Emirates',
};

function parseCSV(s) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') continue;
      else cell += c;
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function cleanCountry(raw) {
  if (!raw) return null;
  // Handle "Continent » Country" with or without space after »
  const parts = raw.split('»').map((s) => s.trim()).filter(Boolean);
  let country = parts.pop() || raw;
  country = COUNTRY_FIX[country] || country;
  return country;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node scripts/import-rx-csv.js <csv-path>');
    process.exit(1);
  }
  const text = (await readFile(csvPath, 'utf8')).replace(/^﻿/, '');
  const rows = parseCSV(text);
  const headers = rows[0];
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));

  const events = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    if (row.length < headers.length) continue;
    const name = (row[idx.Title] || '').trim();
    const startDate = (row[idx['Start Date']] || '').trim();
    const endDate = (row[idx['End Date']] || '').trim();
    const country = cleanCountry(row[idx.Country] || '');
    const city = (row[idx.City] || '').trim() || null;
    const venue = (row[idx.Venue] || '').trim() || null;
    const sector = (row[idx.Sector] || '').trim();
    const industry = (row[idx.Industry] || '').trim();
    const website = (row[idx.Website] || '').trim() || null;

    if (!name || !startDate || !country) { skipped++; continue; }

    // Combine sector + industry into the raw industry array (deduped)
    const tags = [];
    if (sector) tags.push(sector);
    if (industry && industry !== sector) tags.push(industry);

    events.push({
      name,
      start_date: startDate,
      end_date: endDate || startDate,
      city,
      country,
      venue,
      industry: tags,
      website,
    });
  }

  const out = {
    venue_id: 'rx-events',
    scraped_at: new Date().toISOString(),
    source_url: 'https://www.rxglobal.com',
    events,
  };
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2));

  console.log(`Imported ${events.length} events (skipped ${skipped})`);
  console.log(`→ ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
