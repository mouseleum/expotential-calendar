#!/usr/bin/env node
// Classify untagged trade shows into canonical industry segments using Claude Haiku 4.5.
//
// Reads src/data/shows.json, finds shows that have no canonical segment in their
// `industry` array (rules-based classifier already ran via merge.js), batches them
// to Haiku 4.5, and appends returned segments. Persists classifications to
// data/haiku-classifications.json so they survive future re-scrapes.
//
// Usage:
//   node scripts/classify-with-haiku.js              # classify all untagged
//   node scripts/classify-with-haiku.js --dry-run    # show what would be classified
//   node scripts/classify-with-haiku.js --limit 100  # process first 100 batches only
//
// Requires ANTHROPIC_API_KEY in .env or env.

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_PATH = resolve(ROOT, 'src/data/shows.json');
const PERSIST_PATH = resolve(ROOT, 'data/haiku-classifications.json');

const SEGMENTS = [
  'Technology & IT',
  'Medical & Pharma',
  'Industrial / Manufacturing',
  'Construction & Building',
  'Professional Services',
  'Automotive & Transportation',
];
const SEGMENT_SET = new Set(SEGMENTS);

const BATCH_SIZE = 50;
const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You classify trade show names into canonical industry segments.

The segments are:
1. **Technology & IT** — software, hardware, telecom, cybersecurity, AI, data, electronics, gaming, broadband, photonics, semiconductors, robotics, fintech, edtech, biotech (the tech side), e-commerce, IoT
2. **Medical & Pharma** — healthcare, pharmaceutical, biotech (the bio side), medtech, hospital, dental, veterinary, life sciences, clinical, surgery, oncology, radiology, optometry
3. **Industrial / Manufacturing** — manufacturing, industrial engineering, machinery, metalworking, chemicals, plastics, rubber, energy (oil/gas/solar/wind/hydrogen), aerospace, defense, materials, packaging, printing, electronics manufacturing, mining, woodworking, paper, steel
4. **Construction & Building** — construction, architecture, civil engineering, real estate, building materials, HVAC, plumbing, infrastructure, renovation, interior design, landscape architecture
5. **Professional Services** — finance, banking, insurance, accounting, legal, consulting, HR, recruitment, education, training, marketing, advertising, business services
6. **Automotive & Transportation** — automotive, vehicles, motorcycles, aviation, aircraft, maritime, marine, shipping, rail, railway, logistics, supply chain, mobility, transport, EV, fleet

For each show name, return 0 or more applicable segments. A show may span multiple segments (e.g. "MedTech Manufacturing Expo" → Medical & Pharma + Industrial / Manufacturing).

Return an EMPTY array if no segment clearly applies. Common examples that should get an empty array:
- Food & beverage, restaurants, gastronomy
- Sports, fitness, outdoor recreation
- Fashion, apparel, jewelry
- Beauty, cosmetics, personal care
- Art, music, entertainment, gaming consumer expos
- Agriculture, farming, livestock
- Hospitality, travel, tourism
- Toys, hobbies, pets
- Books, publishing, religion

Be conservative — only assign a segment if the show name CLEARLY indicates that domain. Don't guess from ambiguous names.

Respond with valid JSON only — no preamble, no explanation, just the JSON object.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer', description: 'The index from the input list' },
          s: {
            type: 'array',
            items: { type: 'string', enum: SEGMENTS },
            description: '0 or more segments that apply',
          },
        },
        required: ['i', 's'],
        additionalProperties: false,
      },
    },
  },
  required: ['classifications'],
  additionalProperties: false,
};

async function classifyBatch(client, batch) {
  const userContent = batch.map((show, i) => `${i}. ${show.name}`).join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' }, // identical across all batches
      },
    ],
    output_config: {
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `Classify these ${batch.length} trade shows. Reply with the index and segments for each.\n\n${userContent}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text block in response');
  const parsed = JSON.parse(textBlock.text);
  return { parsed, usage: response.usage };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set. Add it to .env or export it.');
    process.exit(1);
  }

  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;
  const dryRun = process.argv.includes('--dry-run');

  const client = new Anthropic();

  const data = JSON.parse(await readFile(DATA_PATH, 'utf8'));

  // Find shows without any canonical segment
  const untagged = data.shows.filter((s) => {
    const tags = Array.isArray(s.industry) ? s.industry : [];
    return !tags.some((t) => SEGMENT_SET.has(t));
  });

  console.log(`Total shows:        ${data.shows.length}`);
  console.log(`Already tagged:     ${data.shows.length - untagged.length}`);
  console.log(`To classify:        ${untagged.length}`);
  console.log(`Batch size:         ${BATCH_SIZE}`);
  console.log(`Batches:            ${Math.ceil(untagged.length / BATCH_SIZE)}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Sample of shows to classify:');
    untagged.slice(0, 10).forEach((s, i) => console.log(`  ${i + 1}. ${s.name}`));
    return;
  }

  // Load existing persisted classifications (resume capability)
  let persisted = {};
  if (existsSync(PERSIST_PATH)) {
    persisted = JSON.parse(await readFile(PERSIST_PATH, 'utf8'));
    console.log(`Resuming with ${Object.keys(persisted).length} existing classifications`);
  }

  // Build batches
  const batches = [];
  for (let i = 0; i < untagged.length; i += BATCH_SIZE) {
    batches.push(untagged.slice(i, i + BATCH_SIZE));
  }
  const totalBatches = Math.min(batches.length, limit);

  console.log(`\nProcessing ${totalBatches} batches...\n`);

  const showsById = new Map(data.shows.map((s) => [s.id, s]));
  let totalIn = 0, totalOut = 0, cachedIn = 0, cacheCreated = 0;
  let classified = 0, emptyResults = 0, errors = 0;

  for (let bi = 0; bi < totalBatches; bi++) {
    const batch = batches[bi];
    process.stdout.write(`  [${(bi + 1).toString().padStart(3)}/${totalBatches}] ${batch.length} shows... `);

    try {
      const { parsed, usage } = await classifyBatch(client, batch);

      // Apply results
      for (const { i: index, s: segments } of parsed.classifications) {
        const show = batch[index];
        if (!show) continue;
        const target = showsById.get(show.id);
        if (!target) continue;
        const existing = new Set(target.industry || []);
        let added = 0;
        for (const seg of segments) {
          if (SEGMENT_SET.has(seg) && !existing.has(seg)) {
            existing.add(seg);
            added++;
          }
        }
        target.industry = [...existing];
        persisted[show.id] = segments.filter((s) => SEGMENT_SET.has(s));
        if (segments.length > 0) classified++;
        else emptyResults++;
      }

      totalIn += usage.input_tokens;
      totalOut += usage.output_tokens;
      cachedIn += usage.cache_read_input_tokens || 0;
      cacheCreated += usage.cache_creation_input_tokens || 0;

      const cacheStatus = usage.cache_read_input_tokens
        ? `cached:${usage.cache_read_input_tokens}`
        : usage.cache_creation_input_tokens
          ? `cache-write:${usage.cache_creation_input_tokens}`
          : 'no-cache';
      console.log(`✓ in:${usage.input_tokens} out:${usage.output_tokens} ${cacheStatus}`);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        console.log(`rate limited — waiting 30s and retrying`);
        await new Promise((r) => setTimeout(r, 30000));
        bi--;
        continue;
      }
      if (err instanceof Anthropic.APIError) {
        console.log(`API error ${err.status}: ${err.message}`);
      } else {
        console.log(`ERROR: ${err.message}`);
      }
      errors++;
    }

    // Persist every 10 batches in case of interruption
    if ((bi + 1) % 10 === 0) {
      data.shows = [...showsById.values()];
      await writeFile(DATA_PATH, JSON.stringify(data, null, 2));
      await writeFile(PERSIST_PATH, JSON.stringify(persisted, null, 2));
    }
  }

  // Final write
  data.shows = [...showsById.values()];
  await writeFile(DATA_PATH, JSON.stringify(data, null, 2));
  await writeFile(PERSIST_PATH, JSON.stringify(persisted, null, 2));

  // Cost summary (Haiku 4.5: $1/M input, $5/M output, cache read ~$0.10/M)
  const inCost = ((totalIn - cachedIn) / 1_000_000) * 1.0;
  const cachedCost = (cachedIn / 1_000_000) * 0.10;
  const outCost = (totalOut / 1_000_000) * 5.0;
  const writeCost = (cacheCreated / 1_000_000) * 1.25;
  const totalCost = inCost + cachedCost + outCost + writeCost;

  console.log('\n--- Done ---');
  console.log(`Shows classified with ≥1 segment: ${classified}`);
  console.log(`Shows classified as none-apply:    ${emptyResults}`);
  console.log(`Errors:                            ${errors}`);
  console.log(`\nTokens — input: ${totalIn.toLocaleString()} (cache reads: ${cachedIn.toLocaleString()})`);
  console.log(`         output: ${totalOut.toLocaleString()}`);
  console.log(`         cache writes: ${cacheCreated.toLocaleString()}`);
  console.log(`Estimated cost: $${totalCost.toFixed(4)}`);
  console.log(`\nUpdated: ${DATA_PATH}`);
  console.log(`Persisted: ${PERSIST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
