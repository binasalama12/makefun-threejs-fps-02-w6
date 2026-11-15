// Dustbowl Relay — handover program (Node 22, standard library only).
//
// The playable game lives in game/ as plain static files: the browser loads
// its ES modules directly, with three.js supplied through an import map, so
// there is no build step to reproduce here. This program's single job is to
// deliver the entry: copy game/ and screenshots/ from beside this file into
// the output directory, then write dossier.json there using buildDossier
// from the vendored make.fun library so the summary matches byte for byte
// what the scorer rebuilds.
//
// Run it locally the same way the grader does, with MAKEFUN_OUTPUT_DIR
// standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps below mirror the gate's own limits: the dossier text budget, at
// most four screenshots of 256 KiB each, and the game tree's file and byte
// ceilings. Passing them here means the dossier is written exactly as the
// scorer expects to recompute it.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
