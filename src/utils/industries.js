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

// Saturated palette for chips, designed for the dark Briefing Terminal
// background — solid color block, white text.
export const INDUSTRY_COLORS = {
  'Technology & IT':             { bg: '#b8860b', fg: '#ffffff', border: '#b8860b' },
  'Medical & Pharma':            { bg: '#b03a48', fg: '#ffffff', border: '#b03a48' },
  'Industrial / Manufacturing':  { bg: '#2f7a3a', fg: '#ffffff', border: '#2f7a3a' },
  'Construction & Building':     { bg: '#2a6db0', fg: '#ffffff', border: '#2a6db0' },
  'Professional Services':       { bg: '#1f7a7a', fg: '#ffffff', border: '#1f7a7a' },
  'Automotive & Transportation': { bg: '#6a3aa0', fg: '#ffffff', border: '#6a3aa0' },
};
