// Saved filter presets — named filter configurations shared across users.
//
// GET    /api/filter-presets                  → { presets: [...] }
// POST   /api/filter-presets {name, filters}  → { ok, preset }
// DELETE /api/filter-presets?id=…             → { ok, removed }
//
// Storage: Redis HASH 'filter-presets' (see api/_lib/kv-hash-store.js);
// the legacy 'filter-presets:v1' array key is migrated on first read.

import { createHashStore, getQueryId } from './_lib/kv-hash-store.js';
import { requireWriteAuth } from './_lib/auth.js';

const MAX_NAME = 60;
const MAX_PRESETS = 100;

const store = createHashStore({
  hashKey: 'filter-presets',
  legacyKey: 'filter-presets:v1',
  legacyToFields(legacy) {
    if (!Array.isArray(legacy)) return {};
    const fields = {};
    for (const p of legacy) {
      if (p && p.id) fields[p.id] = p;
    }
    return fields;
  },
});

function genId() {
  return 'pre_' + Math.random().toString(36).slice(2, 10);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const all = await store.all();
      const presets = Object.values(all).sort((a, b) =>
        (a.created_at || '').localeCompare(b.created_at || ''),
      );
      return res.status(200).json({ presets });
    }

    if (req.method === 'POST') {
      if (!requireWriteAuth(req, res)) return;
      const { name, filters, added_by } = req.body || {};
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name required' });
      }
      if (name.length > MAX_NAME) {
        return res.status(400).json({ error: `name too long (max ${MAX_NAME})` });
      }
      if (!filters || typeof filters !== 'object' || Array.isArray(filters)) {
        return res.status(400).json({ error: 'filters must be an object' });
      }
      // Soft cap on total presets — count without locking; one extra under
      // race is acceptable for this resource.
      if ((await store.count()) >= MAX_PRESETS) {
        return res.status(400).json({ error: `preset limit reached (${MAX_PRESETS})` });
      }
      const preset = {
        id: genId(),
        name: name.trim(),
        filters,
        added_by: typeof added_by === 'string' ? added_by.trim() || null : null,
        created_at: new Date().toISOString(),
      };
      await store.set(preset.id, preset);
      return res.status(200).json({ ok: true, preset });
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
    console.error('filter-presets error:', err);
    return res.status(500).json({ error: err.message || 'internal error' });
  }
}
