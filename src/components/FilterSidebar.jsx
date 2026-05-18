import { useMemo, useState } from 'react';
import { REGIONS } from '../utils/regions';

const MONTHS = [
  { value: '01', label: 'Jan' }, { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' }, { value: '04', label: 'Apr' },
  { value: '05', label: 'May' }, { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' }, { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' }, { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' }, { value: '12', label: 'Dec' },
];

// Build YYYY-MM from a YYYY-MM string by overriding year or month.
function splitYM(v) {
  if (!v || v.length < 7) return { year: '', month: '' };
  return { year: v.slice(0, 4), month: v.slice(5, 7) };
}
function joinYM(year, month) {
  if (!year && !month) return '';
  if (year && !month) return `${year}-01`;
  if (!year && month) return ''; // need year to be meaningful
  return `${year}-${month}`;
}

export function FilterSidebar({ allShows, filters, setFilters }) {
  const countryCounts = useMemo(() => {
    const m = new Map();
    for (const s of allShows) m.set(s.country, (m.get(s.country) || 0) + 1);
    return m;
  }, [allShows]);

  const venueCounts = useMemo(() => {
    const m = new Map();
    for (const s of allShows) {
      if (s.venue) m.set(s.venue, (m.get(s.venue) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [allShows]);

  const years = useMemo(() => {
    const s = new Set();
    for (const show of allShows) if (show.start_date) s.add(show.start_date.slice(0, 4));
    return [...s].sort();
  }, [allShows]);

  const fromYM = splitYM(filters.dateFrom);
  const toYM = splitYM(filters.dateTo);

  const [expanded, setExpanded] = useState(() => new Set(REGIONS.map((r) => r.id)));

  function toggleRegion(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleCountry(country) {
    setFilters((prev) => {
      const next = new Set(prev.countries);
      if (next.has(country)) next.delete(country); else next.add(country);
      return { ...prev, countries: next };
    });
  }

  function selectAllInRegion(region, select) {
    setFilters((prev) => {
      const next = new Set(prev.countries);
      for (const c of region.countries) {
        if (select) next.add(c); else next.delete(c);
      }
      return { ...prev, countries: next };
    });
  }

  function toggleVenue(venue) {
    setFilters((prev) => {
      const next = new Set(prev.venues);
      if (next.has(venue)) next.delete(venue); else next.add(venue);
      return { ...prev, venues: next };
    });
  }

  function clearAll() {
    setFilters({
      countries: new Set(),
      venues: new Set(),
      query: '',
      minAttendees: '',
      dateFrom: '',
      dateTo: '',
      flaggedOnly: false,
    });
  }

  return (
    <div>
      <div className="filter-group">
        <div className="filter-group__title">Search</div>
        <input
          type="text"
          placeholder="Show name…"
          value={filters.query}
          onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value }))}
        />
      </div>

      <div className="filter-group">
        <div className="filter-group__title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Month range</span>
          {(filters.dateFrom || filters.dateTo) && (
            <button
              style={{ padding: '0 4px', fontSize: 10, border: 'none' }}
              onClick={() => setFilters((p) => ({ ...p, dateFrom: '', dateTo: '' }))}
            >clear</button>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginBottom: 4 }}>From</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <select
            value={fromYM.month}
            onChange={(e) => setFilters((p) => ({ ...p, dateFrom: joinYM(fromYM.year || years[0], e.target.value) }))}
            style={{ flex: 1 }}
          >
            <option value="">Month</option>
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select
            value={fromYM.year}
            onChange={(e) => setFilters((p) => ({ ...p, dateFrom: joinYM(e.target.value, fromYM.month || '01') }))}
            style={{ flex: 1 }}
          >
            <option value="">Year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginBottom: 4 }}>To</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={toYM.month}
            onChange={(e) => setFilters((p) => ({ ...p, dateTo: joinYM(toYM.year || years[years.length - 1], e.target.value) }))}
            style={{ flex: 1 }}
          >
            <option value="">Month</option>
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select
            value={toYM.year}
            onChange={(e) => setFilters((p) => ({ ...p, dateTo: joinYM(e.target.value, toYM.month || '12') }))}
            style={{ flex: 1 }}
          >
            <option value="">Year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="filter-group">
        <div className="filter-group__title">Min attendees</div>
        <input
          type="number"
          placeholder="0"
          value={filters.minAttendees}
          onChange={(e) => setFilters((p) => ({ ...p, minAttendees: e.target.value }))}
        />
      </div>

      <div className="filter-group">
        <label className="filter-group__row">
          <input
            type="checkbox"
            checked={filters.flaggedOnly}
            onChange={(e) => setFilters((p) => ({ ...p, flaggedOnly: e.target.checked }))}
          />
          Flagged only
        </label>
      </div>

      {venueCounts.length > 0 && (
        <div className="filter-group">
          <div className="filter-group__title" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Venue</span>
            {filters.venues.size > 0 && (
              <button
                style={{ padding: '0 4px', fontSize: 10, border: 'none' }}
                onClick={() => setFilters((p) => ({ ...p, venues: new Set() }))}
              >clear ({filters.venues.size})</button>
            )}
          </div>
          {venueCounts.map(([venue, count]) => (
            <label key={venue} className="filter-group__row">
              <input
                type="checkbox"
                checked={filters.venues.has(venue)}
                onChange={() => toggleVenue(venue)}
              />
              <span>{venue}</span>
              <span className="filter-group__count">{count}</span>
            </label>
          ))}
        </div>
      )}

      <div className="filter-group">
        <div className="filter-group__title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Country / Region</span>
          {filters.countries.size > 0 && (
            <button
              style={{ padding: '0 4px', fontSize: 10, border: 'none' }}
              onClick={() => setFilters((p) => ({ ...p, countries: new Set() }))}
            >clear ({filters.countries.size})</button>
          )}
        </div>
        {REGIONS.map((region) => {
          const isOpen = expanded.has(region.id);
          const regionTotal = region.countries.reduce((sum, c) => sum + (countryCounts.get(c) || 0), 0);
          if (regionTotal === 0) return null;
          const selectedInRegion = region.countries.filter((c) => filters.countries.has(c)).length;
          return (
            <div key={region.id}>
              <div className="filter-group__region-header" onClick={() => toggleRegion(region.id)}>
                <span>{isOpen ? '▾' : '▸'}</span>
                <span>{region.name}</span>
                <span className="filter-group__count">{regionTotal}</span>
              </div>
              {isOpen && (
                <div className="filter-group__countries">
                  {selectedInRegion > 0 ? (
                    <div
                      style={{ fontSize: 10, color: 'var(--text-dimmer)', cursor: 'pointer', paddingBottom: 4 }}
                      onClick={() => selectAllInRegion(region, false)}
                    >clear {selectedInRegion}</div>
                  ) : (
                    <div
                      style={{ fontSize: 10, color: 'var(--text-dimmer)', cursor: 'pointer', paddingBottom: 4 }}
                      onClick={() => selectAllInRegion(region, true)}
                    >select all</div>
                  )}
                  {region.countries.map((country) => {
                    const count = countryCounts.get(country) || 0;
                    if (count === 0) return null;
                    return (
                      <label key={country} className="filter-group__row">
                        <input
                          type="checkbox"
                          checked={filters.countries.has(country)}
                          onChange={() => toggleCountry(country)}
                        />
                        <span>{country}</span>
                        <span className="filter-group__count">{count}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="filter-group">
        <button onClick={clearAll} style={{ width: '100%' }}>Clear all filters</button>
      </div>
    </div>
  );
}
