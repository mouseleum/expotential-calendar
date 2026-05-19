// Vercel serverless function — manual-shows store backed by Vercel KV.
// GET    /api/manual-shows         → { shows: [...] }
// POST   /api/manual-shows {show}  → { ok: true, show: {...} }
// DELETE /api/manual-shows?id=…    → { ok: true }
//
// Storage: a Redis HASH at 'manual-shows' with field=id → value=JSON.
// Per-field HSET/HDEL is atomic, so concurrent POSTs/DELETEs don't race
// like a read-array-modify-write-array round-trip would.
//
// Legacy fallback: an older 'manual-shows:v1' key holding the array shape
// is read on the first GET and migrated to the hash, then removed.

import { kv } from '@vercel/kv';
import { slugify } from '../scripts/lib/slugify.js';

const HASH_KEY = 'manual-shows';
const LEGACY_KEY = 'manual-shows:v1';

function makeId(show) {
  const name = slugify(show.name);
  const city = slugify(show.city);
  const ym = show.start_date ? show.start_date.slice(0, 7) : 'unknown';
  return city ? `manual-${name}-${city}-${ym}` : `manual-${name}-${ym}`;
}

function normalize(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    errors.push('body must be an object');
    return { errors };
  }
  if (!input.name || typeof input.name !== 'string') errors.push('name required');
  if (!input.start_date || !/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) errors.push('start_date must be YYYY-MM-DD');
  if (input.end_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.end_date)) errors.push('end_date must be YYYY-MM-DD');
  if (!input.country || typeof input.country !== 'string') errors.push('country required');
  if (input.start_date && input.end_date && input.end_date < input.start_date) {
    errors.push('end_date must be on or after start_date');
  }
  if (errors.length) return { errors };

  const show = {
    name: input.name.trim(),
    start_date: input.start_date,
    end_date: input.end_date || input.start_date,
    city: (input.city || '').trim() || null,
    country: input.country.trim(),
    country_code: (input.country_code || '').trim() || null,
    venue: (input.venue || '').trim() || null,
    industry: Array.isArray(input.industry) ? input.industry : [],
    attendees: Number.isFinite(+input.attendees) ? +input.attendees : null,
    exhibitors: Number.isFinite(+input.exhibitors) ? +input.exhibitors : null,
    website: (input.website || '').trim() || null,
    source: 'manual',
    source_url: null,
    notes: (input.notes || '').trim() || '',
    added_by: (input.added_by || '').trim() || null,
    added_at: new Date().toISOString(),
  };
  show.id = makeId(show);
  return { show };
}

// Migrate the legacy array key into the hash, then delete it. Idempotent —
// calling twice is safe (second call sees no legacy data and does nothing).
async function migrateLegacyIfPresent() {
  const legacy = await kv.get(LEGACY_KEY);
  if (!Array.isArray(legacy) || legacy.length === 0) return;
  const fields = {};
  for (const show of legacy) {
    if (show && show.id) fields[show.id] = show;
  }
  if (Object.keys(fields).length > 0) await kv.hset(HASH_KEY, fields);
  await kv.del(LEGACY_KEY);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      await migrateLegacyIfPresent();
      const all = (await kv.hgetall(HASH_KEY)) || {};
      const shows = Object.values(all);
      return res.status(200).json({ shows });
    }

    if (req.method === 'POST') {
      const { show, errors } = normalize(req.body);
      if (errors) return res.status(400).json({ errors });
      await kv.hset(HASH_KEY, { [show.id]: show });
      return res.status(200).json({ ok: true, show });
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || new URL(req.url, 'http://x').searchParams.get('id');
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const removed = await kv.hdel(HASH_KEY, id);
      return res.status(200).json({ ok: true, removed });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('manual-shows error:', err);
    return res.status(500).json({ error: err.message || 'internal error' });
  }
}
