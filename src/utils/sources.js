// Friendly labels for source identifiers (the show.source field value, or
// any '+'-joined token within it).
export const SOURCE_LABELS = {
  tradeshow_calendar: 'Tradeshow Calendar',
  manual: 'Manual entry',
  'venue:bellacenter': 'Bella Center',
  'venue:eventseye': 'EventsEye',
  'venue:expostands': 'Expo Exhibition Stands',
  'venue:kistamassan': 'Kistamässan',
  'venue:malmomassan': 'Malmömässan',
  'venue:rx-events': 'RX Global',
  'venue:stockholmsmassan': 'Stockholmsmässan',
};

export function sourceLabel(id) {
  return SOURCE_LABELS[id] || id.replace(/^venue:/, '');
}
