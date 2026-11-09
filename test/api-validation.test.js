import { describe, it, expect } from 'vitest';
import { normalize, toCount } from '../api/manual-shows.js';
import { normalizeFlag, FLAG_STATES } from '../api/flags.js';
import { requireWriteAuth } from '../api/_lib/auth.js';
import { normalizeJobRequest, eventSlug, toJobView, parseStoragePath } from '../api/exhibitor-jobs.js';

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

describe('exhibitor-jobs normalizeJobRequest', () => {
  const valid = { showId: 'interpack-2026', showName: 'interpack', year: 2026, url: 'https://www.interpack.com/vis/v1/en/directory/a' };

  it('accepts a valid request and normalizes the URL', () => {
    const { input, error } = normalizeJobRequest({ ...valid, showName: '  interpack ' });
    expect(error).toBeUndefined();
    expect(input).toEqual({ ...valid, showName: 'interpack' });
  });
  it('requires showId and showName', () => {
    expect(normalizeJobRequest({ ...valid, showId: '' }).error).toBe('showId required');
    expect(normalizeJobRequest({ ...valid, showName: ' ' }).error).toBe('showName required');
  });
  it('rejects non-http URLs', () => {
    expect(normalizeJobRequest({ ...valid, url: 'not a url' }).error).toMatch(/url/);
    expect(normalizeJobRequest({ ...valid, url: 'javascript:alert(1)' }).error).toMatch(/url/);
    expect(normalizeJobRequest({ ...valid, url: 'file:///etc/passwd' }).error).toMatch(/url/);
  });
  it('allows a missing year but rejects a bad one', () => {
    expect(normalizeJobRequest({ ...valid, year: null }).input.year).toBe(null);
    expect(normalizeJobRequest({ ...valid, year: 'soon' }).error).toMatch(/year/);
  });
});

describe('exhibitor-jobs eventSlug / toJobView', () => {
  it('builds a slug with the year once', () => {
    expect(eventSlug('Interpack', 2026)).toBe('interpack-2026');
    expect(eventSlug('Battery Show Europe 2026', 2026)).toBe('battery-show-europe-2026');
    expect(eventSlug('', null)).toBe('event');
  });
  it('maps a job row for the browser', () => {
    const view = toJobView(
      { id: 'j1', status: 'done', error: null, summary: { count: 812, cost_usd: 0.42 }, output_path: '/x.csv', worker_id: 'mac', completed_at: 't' },
      { jobId: 'j1', url: 'https://x', at: 'a' },
    );
    expect(view).toMatchObject({ jobId: 'j1', status: 'done', count: 812, costUsd: 0.42, outputPath: '/x.csv', url: 'https://x' });
  });
  it('reports unknown when the job row is gone', () => {
    expect(toJobView(undefined, { jobId: 'j2', url: 'u', at: 'a' }).status).toBe('unknown');
  });
});

describe('exhibitor-jobs storage downloads', () => {
  it('parses storage output paths', () => {
    expect(parseStoragePath('storage:exhibitor-lists/interpack-2026/interpack-2026-2026-11-09.csv'))
      .toEqual({ bucket: 'exhibitor-lists', path: 'interpack-2026/interpack-2026-2026-11-09.csv' });
  });
  it('rejects local paths and junk', () => {
    expect(parseStoragePath('/Users/me/Exhibitors/x.csv')).toBe(null);
    expect(parseStoragePath('storage:')).toBe(null);
    expect(parseStoragePath(null)).toBe(null);
  });
  it('marks only storage CSVs as downloadable', () => {
    const entry = { jobId: 'j', url: 'u', at: 'a' };
    expect(toJobView({ id: 'j', status: 'done', output_path: 'storage:exhibitor-lists/a/b.csv' }, entry).downloadable).toBe(true);
    expect(toJobView({ id: 'j', status: 'done', output_path: '/tmp/b.csv' }, entry).downloadable).toBe(false);
  });
});
