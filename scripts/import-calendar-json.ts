#!/usr/bin/env -S npx tsx
// Upserts data/shows.json into exporepoapi's calendar_shows table.
//
//   npm run import:calendar              # write to Supabase
//   npm run import:calendar -- --dry-run # validate + map + log only
//
// Used for the one-off migration and, after `npm run merge` + classification,
// by the weekly refresh (.github/workflows/refresh-data.yml). Upserts on
// (series_key, edition_year). Rows not in this run are never deleted: they
// keep their old last_seen_at and are counted in calendar_scrape_runs.rows_missing.
//
// Writes scripts/out/calendar-import-log.csv with every row whose key was
// derived by a fallback rule or that was skipped (see assignSeriesKeys).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShowsFileSchema, SHOW_FIELDS } from '../src/types/show.ts';
import { assignSeriesKeys, toCalendarRow, type CalendarShowRow, type LogEntry } from './lib/calendar-rows.ts';
import { toCsv } from './lib/csv.ts';
import { adminClient, selectAll, supabaseConfigured } from './lib/supabase-admin.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_PATH = resolve(ROOT, 'data/shows.json');
const OUT_DIR = resolve(ROOT, 'scripts/out');
const LOG_PATH = resolve(OUT_DIR, 'calendar-import-log.csv');
const BATCH = 500;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
// In CI the step is optional: without secrets, skip instead of failing the refresh.
const skipIfUnconfigured = args.has('--skip-if-unconfigured');

const SKIPPED = new Set<LogEntry['reason']>(['duplicate', 'ambiguous', 'no_city']);

async function main() {
  const raw = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  const file = ShowsFileSchema.parse(raw);

  const known = new Set<string>(SHOW_FIELDS);
  const unknown = new Set<string>();
  for (const s of raw.shows as Record<string, unknown>[]) for (const k of Object.keys(s)) if (!known.has(k)) unknown.add(k);
  if (unknown.size) console.warn(`! fields in shows.json not in ShowSchema (not imported): ${[...unknown].join(', ')}`);

  const { keyed, log } = assignSeriesKeys(file.shows);
  const rows = keyed.map(toCalendarRow);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(LOG_PATH, toCsv(log as unknown as Record<string, unknown>[]));
  const byReason: Record<string, number> = {};
  for (const l of log) byReason[l.reason] = (byReason[l.reason] ?? 0) + 1;
  const skipped = log.filter((l) => SKIPPED.has(l.reason)).length;
  console.log(`shows.json: ${file.shows.length} shows → ${rows.length} rows (${skipped} skipped)`);
  console.log(`log: ${JSON.stringify(byReason)} → ${LOG_PATH}`);
  const noCode = rows.filter((r) => r.country_name && !r.country_code);
  if (noCode.length) console.warn(`! ${noCode.length} rows with a country name but no ISO code: ${[...new Set(noCode.map((r) => r.country_name))].join(', ')}`);

  if (dryRun) { console.log('dry run: nothing written'); return; }
  if (!supabaseConfigured() && skipIfUnconfigured) {
    console.log('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping Supabase upsert');
    return;
  }

  const db = adminClient();
  const startedAt = new Date().toISOString();
  const { data: run, error: runErr } = await db
    .from('calendar_scrape_runs')
    .insert({ started_at: startedAt, status: 'running', rows_seen: rows.length })
    .select('id').single();
  if (runErr) throw new Error(`create run: ${runErr.message}`);

  try {
    const existing = await selectAll<{ id: string; series_key: string; edition_year: number; calendar_slug: string | null }>(
      (from, to) => db.from('calendar_shows').select('id, series_key, edition_year, calendar_slug').order('id').range(from, to));
    const keyOf = (r: { series_key: string; edition_year: number }) => `${r.series_key}|${r.edition_year}`;
    const existingKeys = new Set(existing.map(keyOf));

    // calendar_slug is unique. If a slug now belongs to a different
    // (series_key, edition_year) than last run, release it from the old row first.
    const newKeyBySlug = new Map(rows.map((r) => [r.calendar_slug, keyOf(r)]));
    const release = existing.filter((e) => e.calendar_slug && newKeyBySlug.has(e.calendar_slug) && newKeyBySlug.get(e.calendar_slug) !== keyOf(e));
    for (let i = 0; i < release.length; i += BATCH) {
      const ids = release.slice(i, i + BATCH).map((e) => e.id);
      const { error } = await db.from('calendar_shows').update({ calendar_slug: null }).in('id', ids);
      if (error) throw new Error(`release slugs: ${error.message}`);
    }

    // first_seen_at and event_id are left out so the upsert never overwrites them.
    const payload = rows.map((r: CalendarShowRow) => ({ ...r, last_seen_at: startedAt, scrape_run_id: run.id }));
    for (let i = 0; i < payload.length; i += BATCH) {
      const { error } = await db.from('calendar_shows')
        .upsert(payload.slice(i, i + BATCH), { onConflict: 'series_key,edition_year' });
      if (error) throw new Error(`upsert batch ${i / BATCH}: ${error.message}`);
      process.stdout.write(`\rupserted ${Math.min(i + BATCH, payload.length)}/${payload.length}`);
    }
    process.stdout.write('\n');

    const inserted = rows.filter((r) => !existingKeys.has(keyOf(r))).length;
    const { count: missing, error: missErr } = await db.from('calendar_shows')
      .select('id', { count: 'exact', head: true })
      .or(`last_seen_at.is.null,last_seen_at.lt.${startedAt}`);
    if (missErr) throw new Error(`count missing: ${missErr.message}`);

    const notes = `log: ${JSON.stringify(byReason)}${release.length ? `; ${release.length} slugs moved` : ''}`;
    const { error: finErr } = await db.from('calendar_scrape_runs').update({
      finished_at: new Date().toISOString(), status: 'succeeded',
      rows_inserted: inserted, rows_updated: rows.length - inserted, rows_missing: missing ?? 0, notes,
    }).eq('id', run.id);
    if (finErr) throw new Error(`finish run: ${finErr.message}`);
    console.log(`run ${run.id}: ${inserted} inserted, ${rows.length - inserted} updated, ${missing ?? 0} missing (kept)`);
  } catch (err) {
    await db.from('calendar_scrape_runs').update({
      finished_at: new Date().toISOString(), status: 'failed', notes: String((err as Error).message).slice(0, 1000),
    }).eq('id', run.id);
    throw err;
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
