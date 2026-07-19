#!/usr/bin/env node
// Copy the committed data files into public/ for serving. Runs as predev and
// prebuild (public/shows.json is gitignored). changelog.json is optional so
// fresh clones from before the changelog feature still build.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = resolve(ROOT, 'public');

mkdirSync(PUBLIC, { recursive: true });
copyFileSync(resolve(ROOT, 'data/shows.json'), resolve(PUBLIC, 'shows.json'));
if (existsSync(resolve(ROOT, 'data/changelog.json'))) {
  copyFileSync(resolve(ROOT, 'data/changelog.json'), resolve(PUBLIC, 'changelog.json'));
}
