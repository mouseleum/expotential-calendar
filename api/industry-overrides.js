// Per-show industry overrides. Lets anyone tag an existing show (scraped or
// manual) with canonical industry segments — the change persists in KV and
// is merged onto the show on the client.
//
// GET    /api/industry-overrides              → { overrides: { [showId]: string[] } }
// POST   /api/industry-overrides { id, industry } → { ok, industry }
// DELETE /api/industry-overrides?id=…         → { ok, removed }
//
// Storage: Redis HASH 'industry-overrides' with field=showId → value=JSON
// array of canonical segments. Per-field writes are atomic — no
// read-modify-write-array race.
//
// Legacy: an older 'industry-overrides:v1' single-key object is migrated
// on first GET, then removed.

import { kv } from '@vercel/kv';

const HASH_KEY = 'industry-overrides';
const LEGACY_KEY = 'industry-overrides:v1';

const SEGMENTS = new Set([
  'Technology & IT',
  'Medical & Pharma',
  'Industrial / Manufacturing',
  'Construction & Building',
  'Professional Services',
  'Automotive & Transportation',
]);

async function migrateLegacyIfPresent() {
  const legacy = await kv.get(LEGACY_KEY);
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return;
  const fields = {};
  for (const [id, industry] of Object.entries(legacy)) {
    if (Array.isArray(industry)) fields[id] = industry;
  }
  if (Object.keys(fields).length > 0) await kv.hset(HASH_KEY, fields);
  await kv.del(LEGACY_KEY);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      await migrateLegacyIfPresent();
      const all = (await kv.hgetall(HASH_KEY)) || {};
      return res.status(200).json({ overrides: all });
    }

    if (req.method === 'POST') {
      const { id, industry } = req.body || {};
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'id required' });
      }
      if (!Array.isArray(industry)) {
        return res.status(400).json({ error: 'industry must be an array' });
      }
      const validated = industry.filter((s) => typeof s === 'string' && SEGMENTS.has(s));
      if (validated.length === 0) {
        await kv.hdel(HASH_KEY, id);
      } else {
        await kv.hset(HASH_KEY, { [id]: validated });
      }
      return res.status(200).json({ ok: true, id, industry: validated });
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
    console.error('industry-overrides error:', err);
    return res.status(500).json({ error: err.message || 'internal error' });
  }
}
