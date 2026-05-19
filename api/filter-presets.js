// Saved filter presets — named filter configurations shared across users.
//
// GET    /api/filter-presets                  → { presets: [...] }
// POST   /api/filter-presets {name, filters}  → { ok, preset }
// DELETE /api/filter-presets?id=…             → { ok, removed }
//
// Storage: Redis HASH 'filter-presets' with field=preset_id → value=JSON.
// Per-field HSET/HDEL is atomic — concurrent saves don't race.
//
// Legacy: older 'filter-presets:v1' array key is migrated on first GET.

import { kv } from '@vercel/kv';

const HASH_KEY = 'filter-presets';
const LEGACY_KEY = 'filter-presets:v1';
const MAX_NAME = 60;
const MAX_PRESETS = 100;

function genId() {
  return 'pre_' + Math.random().toString(36).slice(2, 10);
}

async function migrateLegacyIfPresent() {
  const legacy = await kv.get(LEGACY_KEY);
  if (!Array.isArray(legacy) || legacy.length === 0) return;
  const fields = {};
  for (const p of legacy) {
    if (p && p.id) fields[p.id] = p;
  }
  if (Object.keys(fields).length > 0) await kv.hset(HASH_KEY, fields);
  await kv.del(LEGACY_KEY);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      await migrateLegacyIfPresent();
      const all = (await kv.hgetall(HASH_KEY)) || {};
      const presets = Object.values(all).sort((a, b) =>
        (a.created_at || '').localeCompare(b.created_at || ''),
      );
      return res.status(200).json({ presets });
    }

    if (req.method === 'POST') {
      const { name, filters, added_by } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name required' });
      }
      if (name.length > MAX_NAME) {
        return res.status(400).json({ error: `name too long (max ${MAX_NAME})` });
      }
      if (!filters || typeof filters !== 'object') {
        return res.status(400).json({ error: 'filters must be an object' });
      }
      // Soft cap on total presets — count without locking; one extra under
      // race is acceptable for this resource.
      const existing = await kv.hkeys(HASH_KEY);
      if (existing.length >= MAX_PRESETS) {
        return res.status(400).json({ error: `preset limit reached (${MAX_PRESETS})` });
      }
      const preset = {
        id: genId(),
        name: name.trim(),
        filters,
        added_by: typeof added_by === 'string' ? added_by.trim() || null : null,
        created_at: new Date().toISOString(),
      };
      await kv.hset(HASH_KEY, { [preset.id]: preset });
      return res.status(200).json({ ok: true, preset });
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
    console.error('filter-presets error:', err);
    return res.status(500).json({ error: err.message || 'internal error' });
  }
}
