import { useMemo, useState } from 'react';
import { REGIONS } from '../utils/regions';
import { INDUSTRY_SEGMENTS } from '../utils/industries';
import { sourceLabel } from '../utils/sources';

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

  // Flat list of all venues sorted by show count desc.
  const allVenues = useMemo(() => {
    const m = new Map();
    for (const s of allShows) {
      if (s.venue) m.set(s.venue, (m.get(s.venue) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [allShows]);

  const [venueQuery, setVenueQuery] = useState('');

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

  function toggleIndustry(seg) {
    setFilters((prev) => {
      const next = new Set(prev.industries);
      if (next.has(seg)) next.delete(seg); else next.add(seg);
      return { ...prev, industries: next };
    });
  }

  function toggleAudience(aud) {
    setFilters((prev) => {
      const next = new Set(prev.audiences);
      if (next.has(aud)) next.delete(aud); else next.add(aud);
      return { ...prev, audiences: next };
    });
  }

  function toggleSource(src) {
    setFilters((prev) => {
      const next = new Set(prev.sources);
      if (next.has(src)) next.delete(src); else next.add(src);
      return { ...prev, sources: next };
    });
  }

  function clearAll() {
    setFilters({
      countries: new Set(),
      venues: new Set(),
      industries: new Set(),
      audiences: new Set(),
      sources: new Set(),
      query: '',
      minAttendees: '',
      dateFrom: '',
      dateTo: '',
      week: '',
      weekYear: '',
      flaggedOnly: false,
    });
    setExpandedCountries(new Set());
  }

  const audienceCounts = useMemo(() => {
    const m = { b2b: 0, b2c: 0, mixed: 0, unknown: 0 };
    for (const s of allShows) m[s.audience || 'unknown']++;
    return m;
  }, [allShows]);

  const sourceCounts = useMemo(() => {
    const m = new Map();
    for (const s of allShows) {
      for (const t of (s.source || '').split('+')) {
        if (!t) continue;
        m.set(t, (m.get(t) || 0) + 1);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [allShows]);

  const industryCounts = useMemo(() => {
    const m = new Map();
    for (const s of allShows) {
      const tags = Array.isArray(s.industry) ? s.industry : [];
      for (const seg of INDUSTRY_SEGMENTS) {
        if (tags.includes(seg)) m.set(seg, (m.get(seg) || 0) + 1);
      }
    }
    return m;
  }, [allShows]);

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
        <div className="filter-group__title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>ISO week</span>
          {(filters.week || filters.weekYear) && (
            <button
              style={{ padding: '0 4px', fontSize: 10, border: 'none' }}
              onClick={() => setFilters((p) => ({ ...p, week: '', weekYear: '' }))}
            >clear</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="number"
            min="1"
            max="53"
            placeholder="Week"
            value={filters.week}
            onChange={(e) => setFilters((p) => ({ ...p, week: e.target.value, weekYear: p.weekYear || years[0] || '' }))}
            style={{ flex: 1 }}
          />
          <select
            value={filters.weekYear}
            onChange={(e) => setFilters((p) => ({ ...p, weekYear: e.target.value }))}
            style={{ flex: 1 }}
          >
            <option value="">Year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dimmer)', marginTop: 4 }}>
          Shows whose dates overlap that Mon–Sun week.
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
        <div className="filter-group__title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Audience</span>
          {filters.audiences.size > 0 && (
            <button
              style={{ padding: '0 4px', fontSize: 10, border: 'none' }}
              onClick={() => setFilters((p) => ({ ...p, audiences: new Set() }))}
            >clear ({filters.audiences.size})</button>
          )}
        </div>
        {[
          { id: 'b2b', label: 'B2B (trade)' },
          { id: 'b2c', label: 'B2C (consumer)' },
          { id: 'mixed', label: 'Mixed' },
          { id: 'unknown', label: 'Unknown' },
        ].map(({ id, label }) => {
          const count = audienceCounts[id] || 0;
          return (
            <label key={id} className="filter-group__row" style={{ opacity: count === 0 ? 0.5 : 1 }}>
              <input
                type="checkbox"
                checked={filters.audiences.has(id)}
                onChange={() => toggleAudience(id)}
                disabled={count === 0 && !filters.audiences.has(id)}
              />
              <span>{label}</span>
              <span className="filter-group__count">{count}</span>
            </label>
          );
        })}
      </div>

      <div className="filter-group">
        <div className="filter-group__title" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Industry</span>
          {filters.industries.size > 0 && (
            <button
              style={{ padding: '0 4px', fontSize: 10, border: 'none' }}
              onClick={() => setFilters((p) => ({ ...p, industries: new Set() }))}
            >clear ({filters.industries.size})</button>
          )}
        </div>
        {INDUSTRY_SEGMENTS.map((seg) => {
          const count = industryCounts.get(seg) || 0;
          return (
            <label key={seg} className="filter-group__row" style={{ opacity: count === 0 ? 0.5 : 1 }}>
              <input
                type="checkbox"
                checked={filters.industries.has(seg)}
                onChange={() => toggleIndustry(seg)}
                disabled={count === 0 && !filters.industries.has(seg)}
              />
              <span>{seg}</span>
              <span className="filter-group__count">{count}</span>
            </label>
          );
        })}
      </div>

      {sourceCounts.length > 0 && (
        <div className="filter-group">
          <div className="filter-group__title" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Source</span>
            {filters.sources.size > 0 && (
              <button
                style={{ padding: '0 4px', fontSize: 10, border: 'none' }}
                onClick={() => setFilters((p) => ({ ...p, sources: new Set() }))}
              >clear ({filters.sources.size})</button>
            )}
          </div>
          {sourceCounts.map(([id, count]) => (
            <label key={id} className="filter-group__row">
              <input
                type="checkbox"
                checked={filters.sources.has(id)}
                onChange={() => toggleSource(id)}
              />
              <span>{sourceLabel(id)}</span>
              <span className="filter-group__count">{count}</span>
            </label>
          ))}
        </div>
      )}

      <div className="filter-group">
        <div className="filter-group__title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Country / Region</span>
          {(filters.countries.size > 0 || filters.venues.size > 0) && (
            <button
              style={{ padding: '0 4px', fontSize: 10, border: 'none' }}
              onClick={() => setFilters((p) => ({ ...p, countries: new Set(), venues: new Set() }))}
            >clear ({filters.countries.size + filters.venues.size})</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8, fontSize: 10 }}>
          <span style={{ color: 'var(--text-dimmer)', alignSelf: 'center', marginRight: 2 }}>regions:</span>
          <button
            style={{ padding: '1px 5px', fontSize: 10, border: '1px solid var(--border-strong)' }}
            onClick={() => setExpandedRegions(new Set(REGIONS.map((r) => r.id)))}
          >expand</button>
          <button
            style={{ padding: '1px 5px', fontSize: 10, border: '1px solid var(--border-strong)' }}
            onClick={() => setExpandedRegions(new Set())}
          >collapse</button>
          <span style={{ color: 'var(--text-dimmer)', alignSelf: 'center', marginLeft: 6, marginRight: 2 }}>venues:</span>
          <button
            style={{ padding: '1px 5px', fontSize: 10, border: '1px solid var(--border-strong)' }}
            onClick={() => setExpandedCountries(new Set([...venuesByCountry.keys()]))}
            title="Expand every country's venue list"
          >expand</button>
          <button
            style={{ padding: '1px 5px', fontSize: 10, border: '1px solid var(--border-strong)' }}
            onClick={() => setExpandedCountries(new Set())}
            title="Collapse every country's venue list"
          >collapse</button>
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

      {allVenues.length > 0 && (
        <div className="filter-group">
          <div className="filter-group__title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Venue</span>
            {filters.venues.size > 0 && (
              <button
                style={{ padding: '0 4px', fontSize: 10, border: 'none' }}
                onClick={() => setFilters((p) => ({ ...p, venues: new Set() }))}
              >clear ({filters.venues.size})</button>
            )}
          </div>
          <input
            type="text"
            placeholder="Filter venues…"
            value={venueQuery}
            onChange={(e) => setVenueQuery(e.target.value)}
            style={{ width: '100%', marginBottom: 6 }}
          />
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {allVenues
              .filter(([v]) => !venueQuery || v.toLowerCase().includes(venueQuery.toLowerCase()))
              .map(([venue, count]) => (
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
        </div>
      )}

      <div className="filter-group">
        <button onClick={clearAll} style={{ width: '100%' }}>Clear all filters</button>
      </div>
    </div>
  );
}
