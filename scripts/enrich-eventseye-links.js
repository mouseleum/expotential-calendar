#!/usr/bin/env node
// Fetches each eventseye.com show's detail page once to find its official
// website (the listing page scrape-eventseye.js reads never has it — see
// scripts/lib/eventseye-detail.js). Results persist in
// data/eventseye-official-links.json keyed by detail_url, so weekly refreshes
// only fetch pages for shows seen for the first time; the initial backfill
// (~3,250 shows) is a one-time cost.
//
// Usage:
//   node scripts/enrich-eventseye-links.js              # fetch all uncached
//   node scripts/enrich-eventseye-links.js --limit 100  # first 100 only

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractOfficialWebsite } from './lib/eventseye-detail.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EVENTSEYE_PATH = resolve(ROOT, 'data/venue-scrapes/eventseye.json');
const CACHE_PATH = resolve(ROOT, 'data/eventseye-official-links.json');

const DELAY_MS = 400;
const PERSIST_EVERY = 20;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDetail(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return new TextDecoder('iso-8859-1').decode(buf);
}

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

  if (!existsSync(EVENTSEYE_PATH)) {
    console.error(`${EVENTSEYE_PATH} not found — run npm run scrape:eventseye first.`);
    process.exit(1);
  }
  const data = JSON.parse(await readFile(EVENTSEYE_PATH, 'utf8'));

  let cache = {};
  if (existsSync(CACHE_PATH)) cache = JSON.parse(await readFile(CACHE_PATH, 'utf8'));

  const uniqueUrls = [...new Set(data.events.map((e) => e.detail_url).filter(Boolean))];
  const notCached = uniqueUrls.filter((u) => !(u in cache));
  const todo = notCached.slice(0, limit);

  console.log(`Detail URLs:    ${uniqueUrls.length}`);
  console.log(`Already cached: ${uniqueUrls.length - notCached.length}`);
  console.log(`To fetch:       ${todo.length}\n`);

  let found = 0, none = 0, errors = 0;
  for (let i = 0; i < todo.length; i++) {
    const url = todo[i];
    process.stdout.write(`[${i + 1}/${todo.length}] `);
    try {
      const html = await fetchDetail(url);
      const official = extractOfficialWebsite(html);
      cache[url] = official;
      if (official) { found++; console.log(`✓ ${official}`); }
      else { none++; console.log('— no official site listed'); }
    } catch (err) {
      errors++;
      console.log(`ERROR: ${err.message} (will retry next run)`);
    }
    if ((i + 1) % PERSIST_EVERY === 0) await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));
    if (i < todo.length - 1) await sleep(DELAY_MS);
  }
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2));

  // Apply the (now more complete) cache onto every event and rewrite
  // eventseye.json so merge.js sees real websites without any changes on
  // its end.
  let applied = 0;
  for (const ev of data.events) {
    if (ev.detail_url && cache[ev.detail_url]) {
      ev.website = cache[ev.detail_url];
      applied++;
    }
  }
  await writeFile(EVENTSEYE_PATH, JSON.stringify(data, null, 2));

  console.log(`\nFetched this run: ${todo.length} (${found} found, ${none} none, ${errors} errors)`);
  console.log(`Websites applied across all events: ${applied} / ${data.events.length}`);
  console.log(`Cache: ${CACHE_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
