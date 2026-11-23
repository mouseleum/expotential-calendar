#!/usr/bin/env -S npx tsx
// Applies the hand-confirmed rows of scripts/out/event-link-review.csv
// (written by link-events.ts): every row with y / yes / x / 1 in `confirm`
// sets calendar_shows.event_id. Overwrites an existing link only with --force.
//
//   npm run link:apply                      # uses scripts/out/event-link-review.csv
//   npm run link:apply -- path/to/file.csv
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './lib/csv.ts';
import { adminClient } from './lib/supabase-admin.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const path = args.find((a) => !a.startsWith('--')) ?? resolve(ROOT, 'scripts/out/event-link-review.csv');
const YES = new Set(['y', 'yes', 'x', '1', 'true']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const rows = parseCsv(readFileSync(path, 'utf8')).filter((r) => YES.has((r.confirm ?? '').toLowerCase()));
  if (!rows.length) { console.log(`no confirmed rows in ${path}`); return; }

  const showIds = rows.map((r) => r.show_id);
  if (new Set(showIds).size !== showIds.length) throw new Error('a show is confirmed for more than one event; keep one');
  for (const r of rows) if (!UUID.test(r.show_id) || !UUID.test(r.event_id)) throw new Error(`bad ids in row: ${r.show_name}`);

  const db = adminClient();
  let applied = 0;
  for (const r of rows) {
    let q = db.from('calendar_shows').update({ event_id: r.event_id }).eq('id', r.show_id);
    if (!force) q = q.is('event_id', null);
    const { data, error } = await q.select('id');
    if (error) throw new Error(`${r.show_name}: ${error.message}`);
    if (data?.length) { applied++; console.log(`linked  ${r.show_name} ${r.show_year} → ${r.event_name}`); }
    else console.log(`skipped ${r.show_name} ${r.show_year} (already linked; use --force to replace)`);
  }
  console.log(`${applied}/${rows.length} confirmed links applied`);
}

main().catch((err) => { console.error(err); process.exit(1); });
