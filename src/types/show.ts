// The shape of data/shows.json (served as /shows.json), written by
// scripts/merge.js and read by the site (src/App.jsx) and by
// scripts/import-calendar-json.ts. Both import this schema, so a field rename
// in the pipeline shows up as a validation failure instead of silent drift.
//
// Schemas are non-strict on purpose: an extra field added by the pipeline must
// not break the live site. The import script reports unknown fields.
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const ShowSchema = z.object({
  /** Site-level slug, e.g. "estro-2026-stockholm-2026-05". Unique per file. */
  id: z.string().min(1),
  name: z.string().min(1),
  start_date: isoDate,
  end_date: isoDate,
  city: z.string().nullable(),
  /** English country name as shown on the site. */
  country: z.string().nullable(),
  /** ISO 3166-1 alpha-2. Often null even when `country` is set. */
  country_code: z.string().regex(/^[A-Z]{2}$/).nullable(),
  venue: z.string().nullable(),
  industry: z.array(z.string()),
  attendees: z.number().nullable(),
  exhibitors: z.number().nullable(),
  website: z.string().nullable(),
  /** One or more source keys joined with "+", e.g. "tradeshow_calendar+venue:eventseye". */
  source: z.string().min(1),
  source_url: z.string(),
  /** Free text, e.g. "frequency: once a year" or "Informa Markets". */
  notes: z.string(),
  audience: z.enum(['b2b', 'b2c', 'mixed']).optional(),
  major_city: z.boolean().optional(),
  scan2lead: z.boolean().optional(),
});

export const ShowsFileSchema = z.object({
  generated_at: z.string(),
  source_scraped_at: z.string().nullable().optional(),
  count: z.number().int(),
  /** Number of distinct countries in `shows`. */
  countries: z.number().int(),
  shows: z.array(ShowSchema),
});

export type Show = z.infer<typeof ShowSchema>;
export type ShowsFile = z.infer<typeof ShowsFileSchema>;

/** Field names the schema knows about (used to report unmapped fields). */
export const SHOW_FIELDS = Object.keys(ShowSchema.shape) as (keyof Show)[];
