// Per-show industry overrides. Lets anyone tag an existing show (scraped or
// manual) with canonical industry segments — the change persists in KV and
// is merged onto the show on the client.
//
// GET    /api/industry-overrides              → { overrides: { [showId]: string[] } }
// POST   /api/industry-overrides { id, industry } → { ok, industry }
// DELETE /api/industry-overrides?id=…         → { ok, removed }
//
// Storage: Redis HASH 'industry-overrides' with field=showId → value=JSON
// array of canonical segments (see api/_lib/kv-hash-store.js); the legacy
// 'industry-overrides:v1' single-key object is migrated on first read.

import { createHashStore, getQueryId } from './_lib/kv-hash-store.js';
import { requireWriteAuth } from './_lib/auth.js';

const store = createHashStore({
  hashKey: 'industry-overrides',
  legacyKey: 'industry-overrides:v1',
  legacyToFields(legacy) {
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return {};
    const fields = {};
    for (const [id, industry] of Object.entries(legacy)) {
      if (Array.isArray(industry)) fields[id] = industry;
    }
    return fields;
  },
});

const SEGMENTS = new Set([
  'Technology & IT',
  'Medical & Pharma',
  'Industrial / Manufacturing',
  'Construction & Building',
  'Professional Services',
  'Automotive & Transportation',
]);

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const all = await store.all();
      return res.status(200).json({ overrides: all });
    }

    if (req.method === 'POST') {
      if (!requireWriteAuth(req, res)) return;
      const { id, industry } = req.body || {};
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'id required' });
      }
      if (!Array.isArray(industry)) {
        return res.status(400).json({ error: 'industry must be an array' });
      }
      const validated = industry.filter((s) => typeof s === 'string' && SEGMENTS.has(s));
      if (validated.length === 0) {
        await store.remove(id);
      } else {
        await store.set(id, validated);
      }
      return res.status(200).json({ ok: true, id, industry: validated });
    }

    if (req.method === 'DELETE') {
      if (!requireWriteAuth(req, res)) return;
      const id = getQueryId(req);
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const removed = await store.remove(id);
      return res.status(200).json({ ok: true, removed });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('industry-overrides error:', err);
    return res.status(500).json({ error: err.message || 'internal error' });
  }
}
