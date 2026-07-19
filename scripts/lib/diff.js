// Diff two show datasets for the "what's new" changelog.
//
// Show ids embed the start month ('…-city-YYYY-MM'), so a show whose dates
// move across a month boundary looks like a removal plus an addition. Those
// are re-paired on the id stem (id minus the trailing -YYYY-MM) and reported
// as date changes instead.

const ID_MONTH_RE = /-\d{4}-\d{2}$/;

function pick(s) {
  return {
    id: s.id, name: s.name, city: s.city, country: s.country,
    start_date: s.start_date, end_date: s.end_date,
  };
}

function dateChange(oldShow, newShow) {
  return {
    id: newShow.id,
    name: newShow.name,
    city: newShow.city,
    country: newShow.country,
    from: { start: oldShow.start_date, end: oldShow.end_date },
    to: { start: newShow.start_date, end: newShow.end_date },
  };
}

export function diffShows(prevShows, nextShows, cap = 200) {
  const prevById = new Map(prevShows.map((s) => [s.id, s]));
  const nextById = new Map(nextShows.map((s) => [s.id, s]));

  const changed = [];
  for (const s of nextShows) {
    const old = prevById.get(s.id);
    if (old && (old.start_date !== s.start_date || old.end_date !== s.end_date)) {
      changed.push(dateChange(old, s));
    }
  }

  const addedRaw = nextShows.filter((s) => !prevById.has(s.id));
  const removedByStem = new Map();
  for (const s of prevShows) {
    if (nextById.has(s.id)) continue;
    const stem = s.id.replace(ID_MONTH_RE, '');
    if (!removedByStem.has(stem)) removedByStem.set(stem, []);
    removedByStem.get(stem).push(s);
  }

  const added = [];
  for (const s of addedRaw) {
    const bucket = removedByStem.get(s.id.replace(ID_MONTH_RE, ''));
    if (bucket && bucket.length > 0) {
      changed.push(dateChange(bucket.shift(), s));
    } else {
      added.push(pick(s));
    }
  }
  const removed = [...removedByStem.values()].flat().map(pick);

  return {
    added: added.slice(0, cap),
    removed: removed.slice(0, cap),
    changed: changed.slice(0, cap),
    counts: { added: added.length, removed: removed.length, changed: changed.length },
  };
}
