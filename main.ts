// Solara City — gta6-01 entry program (Node 22, standard library only).
//
// Hands the game in: copies game/ and screenshots/ from this repository into
// /output and writes /output/dossier.json with the kit's buildDossier library,
// so the judge reads the screenshots plus the game's source outline.
//
// Run locally to check the output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play locally with: node serve.ts (then open http://localhost:8080)

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// Gate limits from the competition (reference/gate.json): dossier text cap,
// at most 4 screenshots of 256 KiB each, game/ under 993 files and 48 MiB.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
