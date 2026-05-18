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

// Shaded pastel palette for chips (matches the spec mockup).
export const INDUSTRY_COLORS = {
  'Technology & IT':             { bg: '#fff3cd', fg: '#6b5200', border: '#e6c97a' },
  'Medical & Pharma':            { bg: '#f8d7da', fg: '#7a1f2b', border: '#e8a8b0' },
  'Industrial / Manufacturing':  { bg: '#d4edda', fg: '#1e5e2c', border: '#9bd4ab' },
  'Construction & Building':     { bg: '#d6e8fb', fg: '#1d4d8a', border: '#a3c6ec' },
  'Professional Services':       { bg: '#d3ecec', fg: '#1d5757', border: '#9ec9c9' },
  'Automotive & Transportation': { bg: '#e4d8f1', fg: '#4a2f6e', border: '#bea9d9' },
};
