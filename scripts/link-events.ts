#!/usr/bin/env -S npx tsx
// Links calendar_shows to exhibitor-list events (exporepoapi `events`) by
// filling calendar_shows.event_id — the join the v2 MCP tool runs on.
//
//   npm run link:events
//
// - Exact match (same normalised name with the year stripped, same year, and
//   one show ↔ one event): event_id is set automatically.
// - Near match (trigram similarity ≥ 0.6, same year) or an exact match that
//   isn't one-to-one: not set. Written to scripts/out/event-link-review.csv.
//   Put "y" in the `confirm` column and run `npm run link:apply`.
//
// Re-run whenever a new exhibitor list lands in `events`; the weekly refresh
// runs it after the import. Never overwrites an event_id that is already set.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toCsv } from './lib/csv.ts';
import { adminClient, supabaseConfigured } from './lib/supabase-admin.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REVIEW_PATH = resolve(ROOT, 'scripts/out/event-link-review.csv');
const THRESHOLD = Number(process.env.LINK_THRESHOLD ?? 0.6);

interface Candidate {
  show_id: string; show_name: string; show_year: number; show_start_date: string | null;
  event_id: string; event_name: string; event_year: number; similarity: number; exact: boolean;
}

async function main() {
  if (!supabaseConfigured() && process.argv.includes('--skip-if-unconfigured')) {
    console.log('Supabase not configured — skipping event linking');
    return;
  }
  const db = adminClient();
  const { data, error } = await db.rpc('calendar_event_link_candidates', { p_threshold: THRESHOLD });
  if (error) throw new Error(error.message);
  const candidates = (data ?? []) as Candidate[];

  const { data: linkedRows, error: linkedErr } = await db.from('calendar_shows').select('id, event_id').not('event_id', 'is', null);
  if (linkedErr) throw new Error(linkedErr.message);
  const linked = new Map((linkedRows ?? []).map((r) => [r.id as string, r.event_id as string]));

  const exact = candidates.filter((c) => c.exact);
  const count = (key: (c: Candidate) => string) => {
    const m = new Map<string, number>();
    for (const c of exact) m.set(key(c), (m.get(key(c)) ?? 0) + 1);
    return m;
  };
  const perShow = count((c) => c.show_id);
  const perEvent = count((c) => c.event_id);
  const oneToOne = exact.filter((c) => perShow.get(c.show_id) === 1 && perEvent.get(c.event_id) === 1);
  const toSet = oneToOne.filter((c) => !linked.has(c.show_id));

  for (const c of toSet) {
    const { error: upErr } = await db.from('calendar_shows').update({ event_id: c.event_id }).eq('id', c.show_id).is('event_id', null);
    if (upErr) throw new Error(`link ${c.show_name}: ${upErr.message}`);
    console.log(`linked  ${c.show_name} ${c.show_year} → ${c.event_name}`);
  }

  const autoIds = new Set(oneToOne.map((c) => `${c.show_id}|${c.event_id}`));
  const review = candidates
    .filter((c) => !autoIds.has(`${c.show_id}|${c.event_id}`) && linked.get(c.show_id) !== c.event_id)
    .sort((a, b) => b.similarity - a.similarity)
    .map((c) => ({
      confirm: '',
      similarity: c.similarity.toFixed(3),
      kind: c.exact ? 'exact_not_one_to_one' : 'near',
      show_name: c.show_name, show_year: c.show_year, show_start_date: c.show_start_date,
      event_name: c.event_name, event_year: c.event_year,
      show_id: c.show_id, event_id: c.event_id,
      already_linked_to: linked.get(c.show_id) ?? '',
    }));

  mkdirSync(dirname(REVIEW_PATH), { recursive: true });
  writeFileSync(REVIEW_PATH, toCsv(review, ['confirm', 'similarity', 'kind', 'show_name', 'show_year', 'show_start_date',
    'event_name', 'event_year', 'show_id', 'event_id', 'already_linked_to']));
  console.log(`${toSet.length} exact links set (${oneToOne.length - toSet.length} already linked); ${review.length} candidates for review → ${REVIEW_PATH}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
