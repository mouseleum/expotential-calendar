// Canonical industry segments used in the Add-show form and (later)
// in filters. Keep this list short — these are top-level buckets, not
// the long source-side taxonomy.
export const INDUSTRY_SEGMENTS = [
  'Technology & IT',
  'Medical & Pharma',
  'Industrial / Manufacturing',
  'Construction & Building',
  'Professional Services',
  'Automotive & Transportation',
];

// Muted, terminal-friendly palette — deeper tones so chips integrate with
// the dark background instead of jumping out. Hue is preserved for
// at-a-glance recognition; saturation and luminance are dialed down.
export const INDUSTRY_COLORS = {
  'Technology & IT':             { bg: '#6a4f08', fg: '#f0e0b0', border: '#8a6810' },
  'Medical & Pharma':            { bg: '#6e2530', fg: '#f0c8cc', border: '#8b3340' },
  'Industrial / Manufacturing':  { bg: '#214e26', fg: '#c4e0c6', border: '#2e6932' },
  'Construction & Building':     { bg: '#1d456c', fg: '#bcd6ee', border: '#2a5b8a' },
  'Professional Services':       { bg: '#0e4848', fg: '#b8d8d8', border: '#176161' },
  'Automotive & Transportation': { bg: '#3e2466', fg: '#d0c0e8', border: '#503282' },
};
