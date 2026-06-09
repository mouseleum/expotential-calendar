// Shared per-id Redis HASH store for the KV-backed API endpoints.
// (Vercel skips underscore-prefixed paths in /api, so this is not an endpoint.)
//
// Each endpoint stores its records as one HASH (field=id → value=JSON);
// per-field HSET/HDEL is atomic, so concurrent writes don't race like a
// read-array-modify-write round-trip would.
//
// Legacy migration: a store can name an older single-key value that gets
// migrated into the hash on the first read per serverless instance. The
// module-level flag spares warm instances the extra KV round-trip; cold
// starts re-check, which is harmless (migration is idempotent).

import { kv } from '@vercel/kv';

export function getQueryId(req) {
  return req.query?.id || new URL(req.url, 'http://x').searchParams.get('id');
}

export function createHashStore({ hashKey, legacyKey, legacyToFields }) {
  let legacyMigrated = !legacyKey;

  async function migrateLegacyIfPresent() {
    if (legacyMigrated) return;
    const legacy = await kv.get(legacyKey);
    if (legacy != null) {
      const fields = legacyToFields(legacy) || {};
      if (Object.keys(fields).length > 0) await kv.hset(hashKey, fields);
      await kv.del(legacyKey);
    }
    legacyMigrated = true;
  }

  return {
    async all() {
      await migrateLegacyIfPresent();
      return (await kv.hgetall(hashKey)) || {};
    },
    set(id, value) {
      return kv.hset(hashKey, { [id]: value });
    },
    remove(id) {
      return kv.hdel(hashKey, id);
    },
    count() {
      return kv.hlen(hashKey);
    },
  };
}
