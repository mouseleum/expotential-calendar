import { useMemo, useState } from 'react';
import { REGIONS } from '../utils/regions';

export function FilterSidebar({ allShows, filters, setFilters }) {
  const countryCounts = useMemo(() => {
    const m = new Map();
    for (const s of allShows) m.set(s.country, (m.get(s.country) || 0) + 1);
    return m;
  }, [allShows]);

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

  function clearAll() {
    setFilters({
      countries: new Set(),
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
        <div className="filter-group__title">Date range</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value }))}
            style={{ flex: 1 }}
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value }))}
            style={{ flex: 1 }}
          />
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
