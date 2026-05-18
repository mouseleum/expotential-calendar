#!/usr/bin/env node
// Classify each show as B2B, B2C, or both using Claude Haiku 4.5.
//
// Reads src/data/shows.json, sends shows in batches to Haiku, persists
// classifications to data/audience-classifications.json (keyed by show id).
// Also writes `audience` field directly onto each show in shows.json so the
// UI can filter without a separate fetch.
//
// Usage:
//   node scripts/classify-audience-with-haiku.js              # classify all
//   node scripts/classify-audience-with-haiku.js --dry-run    # preview
//   node scripts/classify-audience-with-haiku.js --redo       # ignore cache, re-classify
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
const PERSIST_PATH = resolve(ROOT, 'data/audience-classifications.json');

const AUDIENCES = ['b2b', 'b2c', 'mixed'];
const BATCH_SIZE = 60;
const MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You classify trade show and event names by audience.

Possible classifications:
- "b2b" — strictly professional / trade-only: industry expos, manufacturing fairs, medical congresses, scientific symposia, professional conferences, B2B summits, trade shows that exhibitors and buyers attend (not the general public)
- "b2c" — strictly consumer-facing: comic cons, book fairs open to the public, food/wine festivals, classic car shows, baby/family fairs, hobby/craft fairs, home & garden shows, Christmas markets, fan conventions, sports fan expos, gaming expos for consumers
- "mixed" — both trade days and consumer days, or genuinely serves both audiences (common for tourism/travel fairs, some boat shows, some food shows, some IT/tech expos that have a consumer day)

For each show name, choose the single best classification. When the show name strongly suggests one audience, pick that. When it could plausibly serve both, pick "mixed". Don't return "unknown" — always commit to one of the three labels.

Respond with valid JSON only — no preamble, no explanation.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          a: { type: 'string', enum: AUDIENCES },
        },
        required: ['i', 'a'],
        additionalProperties: false,
      },
    },
  },
  required: ['classifications'],
  additionalProperties: false,
};

async function classifyBatch(client, batch) {
  const userContent = batch.map((show, i) => {
    const tagHint = (show.industry || []).filter((t) => t.length < 40).slice(0, 3).join(', ');
    return `${i}. ${show.name}${tagHint ? `  [${tagHint}]` : ''}`;
  }).join('\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    output_config: {
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `Classify these ${batch.length} shows.\n\n${userContent}`,
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

  const dryRun = process.argv.includes('--dry-run');
  const redo = process.argv.includes('--redo');
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : Infinity;

  const client = new Anthropic();
  const data = JSON.parse(await readFile(DATA_PATH, 'utf8'));

  // Load existing classifications unless --redo
  let persisted = {};
  if (!redo && existsSync(PERSIST_PATH)) {
    persisted = JSON.parse(await readFile(PERSIST_PATH, 'utf8'));
  }

  const toClassify = data.shows.filter((s) => redo || !persisted[s.id]);

  console.log(`Total shows:    ${data.shows.length}`);
  console.log(`Cached:         ${data.shows.length - toClassify.length}`);
  console.log(`To classify:    ${toClassify.length}`);
  console.log(`Batch size:     ${BATCH_SIZE}`);
  const totalBatches = Math.min(Math.ceil(toClassify.length / BATCH_SIZE), limit);
  console.log(`Batches:        ${totalBatches}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Sample shows to classify:');
    toClassify.slice(0, 10).forEach((s, i) => console.log(`  ${i + 1}. ${s.name}`));
    return;
  }

  if (toClassify.length === 0) {
    console.log('\nNothing to do. Use --redo to re-classify everything.');
    // Still apply persisted audiences onto shows.json
    let applied = 0;
    for (const s of data.shows) {
      if (persisted[s.id]) { s.audience = persisted[s.id]; applied++; }
    }
    await writeFile(DATA_PATH, JSON.stringify(data, null, 2));
    console.log(`Applied ${applied} audience tags from cache.`);
    return;
  }

  console.log('\nProcessing...\n');
  const showsById = new Map(data.shows.map((s) => [s.id, s]));
  let totalIn = 0, totalOut = 0, cachedIn = 0, cacheCreated = 0;
  let errors = 0;
  const counts = { b2b: 0, b2c: 0, mixed: 0 };

  const batches = [];
  for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
    batches.push(toClassify.slice(i, i + BATCH_SIZE));
  }

  for (let bi = 0; bi < totalBatches; bi++) {
    const batch = batches[bi];
    process.stdout.write(`  [${(bi + 1).toString().padStart(3)}/${totalBatches}] ${batch.length} shows... `);
    try {
      const { parsed, usage } = await classifyBatch(client, batch);
      for (const { i: index, a: audience } of parsed.classifications) {
        const show = batch[index];
        if (!show) continue;
        persisted[show.id] = audience;
        const target = showsById.get(show.id);
        if (target) target.audience = audience;
        counts[audience]++;
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
        console.log('rate limited — waiting 30s');
        await new Promise((r) => setTimeout(r, 30000));
        bi--;
        continue;
      }
      console.log(`ERROR: ${err.message}`);
      errors++;
    }

    if ((bi + 1) % 10 === 0) {
      data.shows = [...showsById.values()];
      await writeFile(DATA_PATH, JSON.stringify(data, null, 2));
      await writeFile(PERSIST_PATH, JSON.stringify(persisted, null, 2));
    }
  }

  // Apply ALL persisted audiences to shows (including pre-existing cached ones)
  for (const s of [...showsById.values()]) {
    if (persisted[s.id]) s.audience = persisted[s.id];
  }
  data.shows = [...showsById.values()];
  await writeFile(DATA_PATH, JSON.stringify(data, null, 2));
  await writeFile(PERSIST_PATH, JSON.stringify(persisted, null, 2));

  // Haiku 4.5 pricing: $1/M input, $5/M output, cache read ~$0.10/M, cache write $1.25/M
  const inCost = ((totalIn - cachedIn) / 1_000_000) * 1.0;
  const cachedCost = (cachedIn / 1_000_000) * 0.10;
  const outCost = (totalOut / 1_000_000) * 5.0;
  const writeCost = (cacheCreated / 1_000_000) * 1.25;
  const totalCost = inCost + cachedCost + outCost + writeCost;

  console.log('\n--- Done ---');
  console.log(`B2B:    ${counts.b2b}`);
  console.log(`B2C:    ${counts.b2c}`);
  console.log(`Mixed:  ${counts.mixed}`);
  console.log(`Errors: ${errors}`);
  console.log(`\nTokens — input: ${totalIn.toLocaleString()} (cache reads: ${cachedIn.toLocaleString()})`);
  console.log(`         output: ${totalOut.toLocaleString()}`);
  console.log(`Estimated cost: $${totalCost.toFixed(4)}`);
  console.log(`\nPersisted to ${PERSIST_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
