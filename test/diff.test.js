import { describe, it, expect } from 'vitest';
import { diffShows } from '../scripts/lib/diff.js';

function show(id, start, end, name = 'Show') {
  return { id, name, city: 'Berlin', country: 'Germany', start_date: start, end_date: end };
}

describe('diffShows', () => {
  it('reports added and removed shows', () => {
    const prev = [show('a-berlin-2026-05', '2026-05-01', '2026-05-02')];
    const next = [show('b-berlin-2026-06', '2026-06-01', '2026-06-02')];
    const d = diffShows(prev, next);
    expect(d.added.map((s) => s.id)).toEqual(['b-berlin-2026-06']);
    expect(d.removed.map((s) => s.id)).toEqual(['a-berlin-2026-05']);
    expect(d.changed).toHaveLength(0);
    expect(d.counts).toEqual({ added: 1, removed: 1, changed: 0 });
  });

  it('reports same-id date changes directly', () => {
    const prev = [show('a-berlin-2026-05', '2026-05-01', '2026-05-02')];
    const next = [show('a-berlin-2026-05', '2026-05-03', '2026-05-04')];
    const d = diffShows(prev, next);
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.changed[0]).toMatchObject({
      id: 'a-berlin-2026-05',
      from: { start: '2026-05-01', end: '2026-05-02' },
      to: { start: '2026-05-03', end: '2026-05-04' },
    });
  });

  it('pairs cross-month id changes as a date change, not add+remove', () => {
    const prev = [show('intersolar-munich-2026-05', '2026-05-07', '2026-05-09')];
    const next = [show('intersolar-munich-2026-06', '2026-06-23', '2026-06-25')];
    const d = diffShows(prev, next);
    expect(d.added).toHaveLength(0);
    expect(d.removed).toHaveLength(0);
    expect(d.changed[0]).toMatchObject({
      id: 'intersolar-munich-2026-06',
      from: { start: '2026-05-07', end: '2026-05-09' },
      to: { start: '2026-06-23', end: '2026-06-25' },
    });
  });

  it('returns empty diff for identical datasets', () => {
    const shows = [show('a-berlin-2026-05', '2026-05-01', '2026-05-02')];
    const d = diffShows(shows, shows);
    expect(d.counts).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  it('caps each list but keeps true counts', () => {
    const next = Array.from({ length: 250 }, (_, i) => show(`n${i}-city-2026-05`, '2026-05-01', '2026-05-01'));
    const d = diffShows([], next, 200);
    expect(d.added).toHaveLength(200);
    expect(d.counts.added).toBe(250);
  });
});
