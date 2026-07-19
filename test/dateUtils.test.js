import { describe, it, expect } from 'vitest';
import { formatDateRange, isInDateRange, getISOWeek, isInISOWeek } from '../src/utils/dateUtils.js';

describe('formatDateRange', () => {
  it('formats a single day', () => {
    expect(formatDateRange('2026-01-12', '2026-01-12')).toBe('Jan 12, 2026');
  });
  it('formats a same-month range', () => {
    expect(formatDateRange('2026-01-12', '2026-01-14')).toBe('Jan 12–14, 2026');
  });
  it('formats a cross-month range', () => {
    expect(formatDateRange('2026-01-30', '2026-02-02')).toBe('Jan 30 – Feb 2, 2026');
  });
  it('formats a cross-year range', () => {
    expect(formatDateRange('2026-12-30', '2027-01-02')).toBe('Dec 30, 2026 – Jan 2, 2027');
  });
  it('handles a missing end date', () => {
    expect(formatDateRange('2026-03-05', null)).toBe('Mar 5, 2026');
  });
  it('returns a dash for missing start', () => {
    expect(formatDateRange(null, null)).toBe('—');
  });
});

describe('isInDateRange', () => {
  it('includes a show inside the range', () => {
    expect(isInDateRange('2026-02-10', '2026-02-12', '2026-02-01', '2026-02-28')).toBe(true);
  });
  it('excludes a show entirely before the from bound', () => {
    expect(isInDateRange('2026-01-05', '2026-01-06', '2026-02-01', '')).toBe(false);
  });
  it('includes a show overlapping the from bound', () => {
    expect(isInDateRange('2026-01-30', '2026-02-02', '2026-02-01', '')).toBe(true);
  });
  it('expands YYYY-MM to start of month for the from bound', () => {
    expect(isInDateRange('2026-02-01', '2026-02-01', '2026-02', '')).toBe(true);
    expect(isInDateRange('2026-01-31', '2026-01-31', '2026-02', '')).toBe(false);
  });
  it('the -31 to-bound trick includes all of February and excludes March', () => {
    expect(isInDateRange('2026-02-28', '2026-02-28', '', '2026-02')).toBe(true);
    expect(isInDateRange('2026-03-01', '2026-03-01', '', '2026-02')).toBe(false);
  });
  it('rejects shows with no start date', () => {
    expect(isInDateRange(null, null, '', '')).toBe(false);
  });
});

describe('getISOWeek', () => {
  it('assigns Jan 1 to week 53 of the previous ISO year when it falls late in the week', () => {
    // 2021-01-01 was a Friday → ISO week 53 of 2020
    expect(getISOWeek(new Date('2021-01-01'))).toEqual({ year: 2020, week: 53 });
  });
  it('assigns late December to week 1 of the next ISO year when appropriate', () => {
    // 2024-12-30 was a Monday → ISO week 1 of 2025
    expect(getISOWeek(new Date('2024-12-30'))).toEqual({ year: 2025, week: 1 });
  });
  it('handles a mid-year date', () => {
    // 2026-07-18 is a Saturday in ISO week 29
    expect(getISOWeek(new Date('2026-07-18'))).toEqual({ year: 2026, week: 29 });
  });
});

describe('isInISOWeek', () => {
  it('matches a show inside its own ISO week', () => {
    const { year, week } = getISOWeek(new Date('2026-07-18'));
    expect(isInISOWeek('2026-07-18', '2026-07-19', year, week)).toBe(true);
    expect(isInISOWeek('2026-07-18', '2026-07-19', year, week + 1)).toBe(false);
  });
  it('matches a multi-week show against any overlapped week', () => {
    // Show spanning ISO weeks 29–30 of 2026
    expect(isInISOWeek('2026-07-16', '2026-07-21', 2026, 29)).toBe(true);
    expect(isInISOWeek('2026-07-16', '2026-07-21', 2026, 30)).toBe(true);
    expect(isInISOWeek('2026-07-16', '2026-07-21', 2026, 31)).toBe(false);
  });
  it('treats a missing end date as a one-day show', () => {
    const { year, week } = getISOWeek(new Date('2026-03-04'));
    expect(isInISOWeek('2026-03-04', null, year, week)).toBe(true);
  });
});
