import { describe, it, expect } from 'vitest';
import { normalize, toCount } from '../api/manual-shows.js';
import { normalizeFlag, FLAG_STATES } from '../api/flags.js';
import { requireWriteAuth } from '../api/_lib/auth.js';

describe('manual-shows toCount', () => {
  it('keeps missing values null instead of coercing to 0', () => {
    expect(toCount(null)).toBe(null);
    expect(toCount(undefined)).toBe(null);
    expect(toCount('')).toBe(null);
  });
  it('accepts numbers and numeric strings', () => {
    expect(toCount(1200)).toBe(1200);
    expect(toCount('500')).toBe(500);
  });
  it('rejects non-numeric strings', () => {
    expect(toCount('1 200')).toBe(null);
    expect(toCount('lots')).toBe(null);
  });
});

describe('manual-shows normalize', () => {
  const valid = { name: 'Test Fair', start_date: '2026-09-01', country: 'Germany' };

  it('accepts a minimal valid show', () => {
    const { show, errors } = normalize(valid);
    expect(errors).toBeUndefined();
    expect(show.id).toMatch(/^manual-test-fair/);
    expect(show.end_date).toBe('2026-09-01');
    expect(show.attendees).toBe(null);
    expect(show.source).toBe('manual');
  });
  it('rejects missing required fields', () => {
    const { errors } = normalize({});
    expect(errors).toContain('name required');
    expect(errors).toContain('country required');
  });
  it('rejects end_date before start_date', () => {
    const { errors } = normalize({ ...valid, end_date: '2026-08-31' });
    expect(errors).toContain('end_date must be on or after start_date');
  });
  it('rejects non-http(s) website URLs', () => {
    const { errors } = normalize({ ...valid, website: 'javascript:alert(1)' });
    expect(errors).toEqual(['website must start with http:// or https://']);
  });
  it('stores a valid audience and nulls invalid ones', () => {
    expect(normalize({ ...valid, audience: 'b2b' }).show.audience).toBe('b2b');
    expect(normalize({ ...valid, audience: 'everyone' }).show.audience).toBe(null);
    expect(normalize(valid).show.audience).toBe(null);
  });
  it('accepts https websites', () => {
    const { show } = normalize({ ...valid, website: 'https://example.com' });
    expect(show.website).toBe('https://example.com');
  });
});

describe('flags normalizeFlag', () => {
  it('accepts each valid state', () => {
    for (const state of FLAG_STATES) {
      const { flag, error } = normalizeFlag({ id: 'x', state });
      expect(error).toBeUndefined();
      expect(flag.state).toBe(state);
    }
  });
  it('treats null/empty state as a clear', () => {
    expect(normalizeFlag({ id: 'x', state: null }).flag).toBe(null);
    expect(normalizeFlag({ id: 'x', state: '' }).flag).toBe(null);
  });
  it('rejects unknown states and missing ids', () => {
    expect(normalizeFlag({ id: 'x', state: 'maybe' }).error).toMatch(/state must be one of/);
    expect(normalizeFlag({ state: 'skip' }).error).toBe('id required');
    expect(normalizeFlag(null).error).toBe('id required');
  });
  it('trims the by name and nulls empties', () => {
    expect(normalizeFlag({ id: 'x', state: 'skip', by: '  Mikael ' }).flag.by).toBe('Mikael');
    expect(normalizeFlag({ id: 'x', state: 'skip', by: '  ' }).flag.by).toBe(null);
  });
});

describe('requireWriteAuth', () => {
  function mockRes() {
    const res = { code: null, body: null };
    res.status = (c) => { res.code = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
  }

  it('allows everything when WRITE_TOKEN is unset', () => {
    delete process.env.WRITE_TOKEN;
    expect(requireWriteAuth({ headers: {} }, mockRes())).toBe(true);
  });
  it('rejects a missing or wrong token with 401', () => {
    process.env.WRITE_TOKEN = 'sesame';
    try {
      const res = mockRes();
      expect(requireWriteAuth({ headers: {} }, res)).toBe(false);
      expect(res.code).toBe(401);
      expect(requireWriteAuth({ headers: { 'x-write-token': 'wrong' } }, mockRes())).toBe(false);
    } finally {
      delete process.env.WRITE_TOKEN;
    }
  });
  it('accepts the correct token', () => {
    process.env.WRITE_TOKEN = 'sesame';
    try {
      expect(requireWriteAuth({ headers: { 'x-write-token': 'sesame' } }, mockRes())).toBe(true);
    } finally {
      delete process.env.WRITE_TOKEN;
    }
  });
});
