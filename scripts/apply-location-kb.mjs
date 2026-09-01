#!/usr/bin/env node
// Idempotent patch: wire knowledge/location.md into the agent.
//
// Claude sessions cannot push to this repo, so the index.js half of the
// "location & nearby" change ships as this script and is applied on GitHub via
// .github/workflows/apply-patch.yml (Actions -> Apply patch script ->
// apply-location-kb.mjs). Running it twice is a no-op.
//
// It does three things:
//   1. loads knowledge/location.md into a LOCATION constant, like CONTRACT_QA
//   2. injects it into the system prompt as its own authoritative section
//   3. points the WHAT'S NEARBY rule at that section as the no-API-key fallback
//
// Run with --check to report without writing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'index.js');
const check = process.argv.includes('--check');

let src = fs.readFileSync(file, 'utf8');
const before = src;
const done = [];
const skipped = [];

// ---- 1. loader -------------------------------------------------------------
const LOADER_ANCHOR = `} catch {
  console.warn('[knowledge] no knowledge/contract-questions.md — contract answers fall back to the base KB.');
}
`;
const LOADER = `
// Location & nearby (2026-09-01): knowledge/location.md carries the approved
// distances, travel times and description of Qerret/Golem. It is the static
// half of "what's near Mei Residence" — find_places (Google Places) is the live
// half and only runs when GOOGLE_MAPS_API_KEY is set. With this file loaded the
// agent can always answer where the project is and how far Durres, Kavaje,
// Tirana and the airport are, with or without an API key.
let LOCATION = '';
try {
  LOCATION = fs.readFileSync(new URL('./knowledge/location.md', import.meta.url), 'utf8').trim();
  console.log(\`[knowledge] location.md loaded (\${LOCATION.length} chars)\`);
} catch {
  console.warn('[knowledge] no knowledge/location.md — location answers fall back to the base KB.');
}
`;

if (src.includes("knowledge/location.md', import.meta.url")) {
  skipped.push('loader already present');
} else {
  if (!src.includes(LOADER_ANCHOR)) fail('loader anchor (contract-questions catch block) not found');
  src = src.replace(LOADER_ANCHOR, LOADER_ANCHOR + LOADER);
  done.push('added the location.md loader');
}

// ---- 2. prompt section -----------------------------------------------------
const INJ_ANCHOR = "${CONTRACT_QA}` : ''}\n";
const INJ = `
\${LOCATION ? \`LOCATION & WHAT'S AROUND — AUTHORITATIVE, FOLLOW EXACTLY
The approved distances, travel times and description of the area. Where this and
an older KNOWLEDGE BASE line disagree, THIS WINS. Quote these figures as they are
written; never round them into a better number and never add a distance, a travel
time or a business name that is not here or returned by find_places.

\${LOCATION}\` : ''}
`;

if (src.includes("LOCATION & WHAT'S AROUND — AUTHORITATIVE")) {
  skipped.push('prompt section already present');
} else {
  if (!src.includes(INJ_ANCHOR)) fail('prompt anchor (CONTRACT_QA injection) not found');
  src = src.replace(INJ_ANCHOR, INJ_ANCHOR + INJ);
  done.push('injected the LOCATION prompt section');
}

// ---- 3. WHAT'S NEARBY fallback --------------------------------------------
const OLD_RULE = `Give 2-3 of the closest, not a list of ten. If the tool is not available or fails,
say what you do know (Qerret, Durres, ~280 m from the beach, ~45 min from Tirana) and
offer to have the team send details — NEVER name a shop, a distance or an opening time
you have not been given.`;
const NEW_RULE = `Give 2-3 of the closest, not a list of ten. If the tool is not available or fails,
answer from the LOCATION & WHAT'S AROUND section below — it has the approved distances
and travel times (beach, Golem, Kavaje, Durres, the airport, Tirana) and a description
of the area, so "where is it and what is around it" is ALWAYS answerable — then offer
to have the team send specifics. NEVER name a shop, a distance or an opening time you
have not been given by find_places or by that section.`;

if (src.includes(NEW_RULE)) {
  skipped.push("WHAT'S NEARBY fallback already updated");
} else {
  if (!src.includes(OLD_RULE)) fail("WHAT'S NEARBY rule not found in its expected form");
  src = src.replace(OLD_RULE, NEW_RULE);
  done.push("pointed WHAT'S NEARBY at the LOCATION section");
}

// ---- report ----------------------------------------------------------------
function fail(msg) {
  console.error(`apply-location-kb: ${msg}. index.js has moved — patch by hand.`);
  process.exit(1);
}

for (const d of done) console.log(`applied  ${d}`);
for (const s of skipped) console.log(`skipped  ${s}`);

if (src === before) {
  console.log('\nnothing to do — index.js already patched.');
  process.exit(0);
}
if (check) {
  console.log('\n--check: not written.');
  process.exit(0);
}
fs.writeFileSync(file, src);
console.log('\nindex.js written.');
