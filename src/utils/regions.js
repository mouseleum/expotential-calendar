// Region groupings for the filter sidebar. Every country in scripts/countries.json
// belongs to exactly one region. Order within REGIONS controls display order.

const NORDICS = ['Denmark', 'Finland', 'Norway', 'Sweden'];
const BRITISH_ISLES = ['Ireland', 'United Kingdom'];
const DACH = ['Austria', 'Germany', 'Switzerland'];
const BENELUX = ['Belgium', 'Luxembourg', 'Netherlands'];
const SOUTHERN_EUROPE = ['France', 'Greece', 'Italy', 'Malta', 'Monaco', 'Portugal', 'Spain'];

export const REGIONS = [
  { id: 'united-states', name: 'United States', countries: ['United States'] },
  {
    id: 'europe-main',
    name: 'Europe main',
    countries: [...NORDICS, ...BRITISH_ISLES, ...DACH, ...BENELUX, ...SOUTHERN_EUROPE],
  },
  { id: 'nordics', name: 'Nordics', countries: NORDICS },
  { id: 'british-isles', name: 'British Isles', countries: BRITISH_ISLES },
  { id: 'dach', name: 'DACH', countries: DACH },
  { id: 'benelux', name: 'Benelux', countries: BENELUX },
  { id: 'southern-europe', name: 'Southern Europe', countries: SOUTHERN_EUROPE },
  {
    id: 'eastern-europe',
    name: 'Eastern Europe',
    countries: [
      'Bulgaria', 'Czech Republic', 'Hungary', 'Latvia', 'Lithuania',
      'Poland', 'Romania', 'Slovenia', 'Ukraine',
    ],
  },
  {
    id: 'middle-east',
    name: 'Middle East',
    countries: [
      'Bahrain', 'Iraq', 'Israel', 'Jordan', 'Lebanon', 'Oman', 'Qatar',
      'Saudi Arabia', 'Syria', 'Turkey', 'United Arab Emirates',
    ],
  },
  {
    id: 'africa',
    name: 'Africa',
    countries: [
      'Algeria', 'Angola', 'Cote divoire', 'Democratic Republic of the Congo',
      'Djibouti', 'Egypt', 'Ethiopia', 'Ghana', 'Kenya', 'Libya', 'Morocco',
      'Nigeria', 'Rwanda', 'Senegal', 'South Africa', 'Tanzania',
    ],
  },
  {
    id: 'central-asia',
    name: 'Central Asia',
    countries: ['Armenia', 'Azerbaijan', 'Kazakhstan', 'Uzbekistan'],
  },
  {
    id: 'south-asia',
    name: 'South Asia',
    countries: ['Bangladesh', 'India', 'Nepal', 'Pakistan', 'Sri Lanka'],
  },
  { id: 'east-asia', name: 'East Asia', countries: ['China', 'Japan', 'South Korea', 'Taiwan'] },
  {
    id: 'southeast-asia',
    name: 'Southeast Asia',
    countries: [
      'Cambodia', 'Indonesia', 'Malaysia', 'Myanmar', 'Philippines',
      'Singapore', 'Thailand', 'Vietnam',
    ],
  },
  { id: 'oceania', name: 'Oceania', countries: ['Australia', 'New Zealand'] },
  {
    id: 'north-america',
    name: 'North America',
    countries: ['Canada', 'Mexico', 'Puerto Rico', 'United States'],
  },
  {
    id: 'latin-america',
    name: 'Latin America',
    countries: [
      'Argentina', 'Bahamas', 'Brazil', 'Chile', 'Colombia',
      'Dominican Republic', 'Panama', 'Peru',
    ],
  },
];

export const COUNTRY_TO_REGION = (() => {
  const map = new Map();
  for (const r of REGIONS) {
    for (const c of r.countries) map.set(c, r.id);
  }
  return map;
})();

export function regionForCountry(country) {
  return COUNTRY_TO_REGION.get(country) || 'other';
}
