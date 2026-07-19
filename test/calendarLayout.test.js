import { describe, it, expect } from 'vitest';
import { addDays, monthWeeks, layoutWeek } from '../src/utils/calendarLayout.js';

const WEEK = '2026-07-13'; // a Monday

function show(id, start, end) {
  return { id, name: id, start_date: start, end_date: end };
}

describe('addDays', () => {
  it('advances across month boundaries in UTC', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('monthWeeks', () => {
  it('returns Mondays covering the whole month', () => {
    const weeks = monthWeeks(2026, 7); // July 2026 starts on a Wednesday
    expect(weeks[0]).toBe('2026-06-29');
    expect(weeks.at(-1)).toBe('2026-07-27');
    expect(weeks).toHaveLength(5);
    for (const w of weeks) {
      expect(new Date(`${w}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });
});

describe('layoutWeek', () => {
  it('clips shows to the week and computes col/span', () => {
    const { placed } = layoutWeek([show('a', '2026-07-10', '2026-07-14')], WEEK);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ col: 0, span: 2 }); // Mon-Tue
  });

  it('excludes shows outside the week', () => {
    const { placed } = layoutWeek(
      [show('before', '2026-07-06', '2026-07-12'), show('after', '2026-07-20', '2026-07-21')],
      WEEK,
    );
    expect(placed).toHaveLength(0);
  });

  it('stacks overlapping shows into separate lanes, reusing free lanes', () => {
    const { placed } = layoutWeek([
      show('a', '2026-07-13', '2026-07-15'),
      show('b', '2026-07-14', '2026-07-16'),
      show('c', '2026-07-16', '2026-07-17'), // fits back into lane 0 after a
    ], WEEK);
    const lanes = Object.fromEntries(placed.map((p) => [p.show.id, p.lane]));
    expect(lanes.a).toBe(0);
    expect(lanes.b).toBe(1);
    expect(lanes.c).toBe(0);
  });

  it('counts shows beyond maxLanes as overflow', () => {
    const shows = Array.from({ length: 5 }, (_, i) => show(`s${i}`, '2026-07-13', '2026-07-19'));
    const { placed, overflow } = layoutWeek(shows, WEEK, 3);
    expect(placed).toHaveLength(3);
    expect(overflow).toBe(2);
  });

  it('treats a missing end_date as a one-day show', () => {
    const { placed } = layoutWeek([show('a', '2026-07-15', null)], WEEK);
    expect(placed[0]).toMatchObject({ col: 2, span: 1 });
  });
});
