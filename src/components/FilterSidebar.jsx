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

function splitYM(v) {
  if (!v || v.length < 7) return { year: '', month: '' };
  return { year: v.slice(0, 4), month: v.slice(5, 7) };
}
function joinYM(year, month) {
  if (!year && !month) return '';
  if (year && !month) return `${year}-01`;
  if (!year && month) return '';
  return `${year}-${month}`;
}

export function FilterSidebar({ allShows, filters, setFilters }) {
  const countryCounts = useMemo(() => {
    const m = new Map();
    for (const s of allShows) m.set(s.country, (m.get(s.country) || 0) + 1);
    return m;
  }, [allShows]);

  // country → [[venue, count], ...] sorted by count desc
  const venuesByCountry = useMemo(() => {
    const m = new Map();
    for (const s of allShows) {
      if (!s.venue || !s.country) continue;
      if (!m.has(s.country)) m.set(s.country, new Map());
      const inner = m.get(s.country);
      inner.set(s.venue, (inner.get(s.venue) || 0) + 1);
    }
    const out = new Map();
    for (const [country, inner] of m) {
      out.set(country, [...inner.entries()].sort((a, b) => b[1] - a[1]));
    }
    return out;
  }, [allShows]);

  const years = useMemo(() => {
    const s = new Set();
    for (const show of allShows) if (show.start_date) s.add(show.start_date.slice(0, 4));
    return [...s].sort();
  }, [allShows]);

  const fromYM = splitYM(filters.dateFrom);
  const toYM = splitYM(filters.dateTo);

  const [expandedRegions, setExpandedRegions] = useState(() => new Set(REGIONS.map((r) => r.id)));
  const [expandedCountries, setExpandedCountries] = useState(() => new Set());

  function toggleRegion(id) {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleCountryExpand(country) {
    setExpandedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) next.delete(country); else next.add(country);
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
    setExpandedCountries(new Set());
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

      <div className="filter-group">
        <div className="filter-group__title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Country / Region</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              style={{ padding: '0 4px', fontSize: 10, border: 'none', color: 'var(--text-dimmer)' }}
              onClick={() => {
                setExpandedRegions(new Set(REGIONS.map((r) => r.id)));
                setExpandedCountries(new Set([...venuesByCountry.keys()]));
              }}
              title="Expand all regions and country venues"
            >expand all</button>
            <button
              style={{ padding: '0 4px', fontSize: 10, border: 'none', color: 'var(--text-dimmer)' }}
              onClick={() => {
                setExpandedRegions(new Set());
                setExpandedCountries(new Set());
              }}
              title="Collapse everything"
            >collapse all</button>
            {(filters.countries.size > 0 || filters.venues.size > 0) && (
              <button
                style={{ padding: '0 4px', fontSize: 10, border: 'none' }}
                onClick={() => setFilters((p) => ({ ...p, countries: new Set(), venues: new Set() }))}
              >clear ({filters.countries.size + filters.venues.size})</button>
            )}
          </div>
        </div>
        {REGIONS.map((region) => {
          const isOpen = expandedRegions.has(region.id);
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
                    const venues = venuesByCountry.get(country);
                    const hasVenues = venues && venues.length > 0;
                    const countryExpanded = expandedCountries.has(country);
                    const selectedVenuesInCountry = hasVenues
                      ? venues.filter(([v]) => filters.venues.has(v)).length
                      : 0;
                    return (
                      <div key={country}>
                        <div className="filter-group__row" style={{ paddingRight: 0 }}>
                          <input
                            type="checkbox"
                            checked={filters.countries.has(country)}
                            onChange={() => toggleCountry(country)}
                          />
                          <span style={{ flex: 1 }} onClick={() => toggleCountry(country)}>{country}</span>
                          <span className="filter-group__count">{count}</span>
                          {hasVenues && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleCountryExpand(country); }}
                              style={{
                                marginLeft: 6,
                                padding: '1px 5px',
                                border: '1px solid var(--border-strong)',
                                fontSize: 10,
                                color: selectedVenuesInCountry > 0 ? 'var(--accent)' : 'var(--text-dim)',
                                background: 'var(--bg-elev-2)',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                              title={`${venues.length} venue${venues.length === 1 ? '' : 's'} — click to ${countryExpanded ? 'hide' : 'show'}`}
                            >
                              {countryExpanded ? '▾' : '▸'} {selectedVenuesInCountry > 0 ? `${selectedVenuesInCountry}/${venues.length}` : venues.length}
                            </button>
                          )}
                        </div>
                        {hasVenues && countryExpanded && (
                          <div style={{ paddingLeft: 20, marginBottom: 4 }}>
                            {venues.map(([venue, vCount]) => (
                              <label key={venue} className="filter-group__row" style={{ fontSize: 11 }}>
                                <input
                                  type="checkbox"
                                  checked={filters.venues.has(venue)}
                                  onChange={() => toggleVenue(venue)}
                                />
                                <span style={{ color: 'var(--text-dim)' }}>{venue}</span>
                                <span className="filter-group__count">{vCount}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
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
