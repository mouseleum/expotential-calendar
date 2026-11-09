// Exhibitor-list extraction jobs, run by exhibitor-browser-agent on a local machine.
//
// GET  /api/exhibitor-jobs                              → { jobs: { [showId]: JobView } }
// GET  /api/exhibitor-jobs?download=<showId>            → 302 to a 5-minute signed CSV link
// POST /api/exhibitor-jobs {showId, showName, year, url} → { ok, showId, job: JobView }
//
// The queue lives in the Supabase project shared with exporepoapi:
//   events            one row per exhibitor-list URL (source='browser-agent')
//   extraction_jobs   one row per run, agent='browser' (see exporepoapi
//                     db/migrations/0010_extraction_jobs_agent.sql)
// The agent claims pending agent='browser' rows, drives a browser with Claude,
// uploads the CSV to the private Storage bucket 'exhibitor-lists' and sets
// status/summary/output_path (`storage:<bucket>/<path>`).
//
// Vercel KV hash 'exhibitor-jobs' maps calendar show id → latest job id + URL,
// so the calendar can show one status per show.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server-side only).

import { createClient } from '@supabase/supabase-js';
import { createHashStore } from './_lib/kv-hash-store.js';
import { requireWriteAuth } from './_lib/auth.js';
import { slugify } from '../scripts/lib/slugify.js';

export const EVENT_SOURCE = 'browser-agent';
export const AGENT_KIND = 'browser';
const ACTIVE = new Set(['pending', 'claimed']);

const store = createHashStore({ hashKey: 'exhibitor-jobs' });

let supabase = null;
function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  supabase ??= createClient(url, key, { auth: { persistSession: false } });
  return supabase;
}

// `storage:<bucket>/<path>` → { bucket, path }, or null for anything else
// (e.g. a CSV that only exists on the machine of a local worker).
export function parseStoragePath(outputPath) {
  const m = /^storage:([a-z0-9][a-z0-9_-]*)\/(.+)$/.exec(outputPath || '');
  return m ? { bucket: m[1], path: m[2] } : null;
}

const SIGNED_URL_SECONDS = 300;

// Validates a POST body → { input } or { error }.
export function normalizeJobRequest(body) {
  const { showId, showName, year, url } = body || {};
  if (!showId || typeof showId !== 'string') return { error: 'showId required' };
  if (!showName || typeof showName !== 'string' || !showName.trim()) return { error: 'showName required' };
  let parsed;
  try {
    parsed = new URL(String(url || '').trim());
  } catch {
    return { error: 'url must be a valid http(s) URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'url must be a valid http(s) URL' };
  }
  const y = year == null || year === '' ? null : Number(year);
  if (y !== null && !(Number.isInteger(y) && y >= 1990 && y <= 2100)) {
    return { error: 'year must be a 4-digit year' };
  }
  return {
    input: { showId, showName: showName.trim().slice(0, 200), year: y, url: parsed.toString() },
  };
}

export function eventSlug(showName, year) {
  const base = slugify(showName).slice(0, 80) || 'event';
  return year && !base.endsWith(String(year)) ? `${base}-${year}` : base;
}

// Shape returned to the browser for one show.
export function toJobView(job, entry) {
  return {
    jobId: job?.id ?? entry.jobId,
    url: entry.url,
    queuedAt: entry.at,
    status: job?.status ?? 'unknown',
    error: job?.error ?? null,
    count: job?.summary?.count ?? null,
    expectedTotal: job?.summary?.expected_total ?? null,
    costUsd: job?.summary?.cost_usd ?? null,
    outputPath: job?.output_path ?? null,
    downloadable: parseStoragePath(job?.output_path) !== null,
    workerId: job?.worker_id ?? null,
    completedAt: job?.completed_at ?? null,
  };
}

async function findOrCreateEvent(client, { showName, year, url }) {
  const { data: existing, error: findErr } = await client
    .from('events')
    .select('id')
    .eq('source_url', url)
    .limit(1);
  if (findErr) throw new Error(`event lookup: ${findErr.message}`);
  if (existing?.[0]) return existing[0].id;

  // events.slug is unique: on a clash with another event append -2, -3 …
  const base = eventSlug(showName, year);
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const { data, error } = await client
      .from('events')
      .insert({
        source: EVENT_SOURCE,
        slug,
        name: year && !showName.includes(String(year)) ? `${showName} ${year}` : showName,
        year,
        source_url: url,
        adapter_config: {},
        romify_attending: false,
      })
      .select('id')
      .single();
    if (!error) return data.id;
    if (error.code !== '23505') throw new Error(`create event: ${error.message}`); // 23505 = unique violation
  }
  throw new Error('create event: could not find a free slug');
}

const JOB_COLUMNS = 'id, status, error, summary, output_path, worker_id, completed_at';

export default async function handler(req, res) {
  try {
    const client = db();
    if (!client) {
      return res.status(503).json({ error: 'Exhibitor extraction is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)' });
    }

    const downloadId = req.method === 'GET'
      ? (req.query?.download || new URL(req.url, 'http://x').searchParams.get('download'))
      : null;
    if (downloadId) {
      const entry = (await store.all())[downloadId];
      if (!entry?.jobId) return res.status(404).json({ error: 'No exhibitor run for this show' });
      const { data: job, error } = await client.from('extraction_jobs').select('output_path').eq('id', entry.jobId).maybeSingle();
      if (error) throw new Error(`job lookup: ${error.message}`);
      const loc = parseStoragePath(job?.output_path);
      if (!loc) return res.status(404).json({ error: 'No downloadable CSV for this show (not finished, or saved only on a local worker)' });
      const { data: signed, error: signErr } = await client.storage
        .from(loc.bucket)
        .createSignedUrl(loc.path, SIGNED_URL_SECONDS, { download: loc.path.split('/').pop() });
      if (signErr || !signed?.signedUrl) throw new Error(`signed url: ${signErr?.message ?? 'none returned'}`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Location', signed.signedUrl);
      return res.status(302).end();
    }

    if (req.method === 'GET') {
      const entries = await store.all();
      const ids = Object.values(entries).map((e) => e?.jobId).filter(Boolean);
      const byId = {};
      if (ids.length > 0) {
        const { data, error } = await client.from('extraction_jobs').select(JOB_COLUMNS).in('id', ids);
        if (error) throw new Error(`job lookup: ${error.message}`);
        for (const job of data || []) byId[job.id] = job;
      }
      const jobs = {};
      for (const [showId, entry] of Object.entries(entries)) {
        if (entry?.jobId) jobs[showId] = toJobView(byId[entry.jobId], entry);
      }
      return res.status(200).json({ jobs });
    }

    if (req.method === 'POST') {
      if (!requireWriteAuth(req, res)) return;
      const { input, error } = normalizeJobRequest(req.body);
      if (error) return res.status(400).json({ error });

      // Don't queue a second run while one is still waiting or running.
      const current = (await store.all())[input.showId];
      if (current?.jobId) {
        const { data } = await client.from('extraction_jobs').select(JOB_COLUMNS).eq('id', current.jobId).maybeSingle();
        if (data && ACTIVE.has(data.status)) {
          return res.status(409).json({ error: 'A run for this show is already queued or running', job: toJobView(data, current) });
        }
      }

      const eventId = await findOrCreateEvent(client, input);
      const { data: job, error: jobErr } = await client
        .from('extraction_jobs')
        .insert({ event_id: eventId, status: 'pending', agent: AGENT_KIND })
        .select(JOB_COLUMNS)
        .single();
      if (jobErr) throw new Error(`queue job: ${jobErr.message}`);

      const entry = { jobId: job.id, url: input.url, at: new Date().toISOString() };
      await store.set(input.showId, entry);
      return res.status(200).json({ ok: true, showId: input.showId, job: toJobView(job, entry) });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('exhibitor-jobs error:', err);
    return res.status(500).json({ error: err.message || 'internal error' });
  }
}
