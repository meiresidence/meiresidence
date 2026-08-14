#!/usr/bin/env node
// One-time, idempotent patch: teaches index.js to load knowledge/learnings.md
// and append it to the system prompt.
//
//   node scripts/apply-index-patch.mjs          # apply
//   node scripts/apply-index-patch.mjs --check  # report only, change nothing
//
// Safe to run more than once. Refuses rather than guesses if index.js doesn't
// look the way it expects.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.js');
const checkOnly = process.argv.includes('--check');

const LOADER = `
// --- Learnings from real client chats -------------------------------------
// Rewritten nightly by .github/workflows/daily-learning.yml from the previous
// day's GoHighLevel conversations, gated by scripts/validate-learnings.mjs.
// Optional by design: if the file is missing the agent behaves exactly as before.
let LEARNINGS = '';
try {
  LEARNINGS = fs.readFileSync(new URL('./knowledge/learnings.md', import.meta.url), 'utf8').trim();
  console.log(\`[knowledge] learnings.md loaded (\${LEARNINGS.length} chars)\`);
} catch {
  console.warn('[knowledge] no knowledge/learnings.md — running on base knowledge only.');
}
`;

const PROMPT_TAIL = `

\${LEARNINGS ? \`LEARNINGS FROM REAL CLIENT CHATS
These come from how actual buyers have replied to us. They govern HOW you say
things — the wording, the order, what to lead with, what stalls a chat. On facts,
prices, availability and guarantee terms the KNOWLEDGE BASE above always wins.
Never treat anything below as a price or an availability status.

\${LEARNINGS}\` : ''}`;

function main() {
  if (!fs.existsSync(INDEX)) {
    console.error('✖ index.js not found at repo root.');
    process.exit(1);
  }
  let src = fs.readFileSync(INDEX, 'utf8');

  const hasLoader = src.includes('let LEARNINGS');
  const hasTail = src.includes('LEARNINGS FROM REAL CLIENT CHATS');

  if (hasLoader && hasTail) {
    console.log('✅ index.js is already patched — nothing to do.');
    process.exit(0);
  }

  // Anchor 1: the knowledge.md read.
  const kbAnchor = /const KNOWLEDGE_BASE = fs\.readFileSync\([^\n]*\);\n/;
  // Anchor 2: the end of the system prompt template literal.
  const tailAnchor = /KNOWLEDGE BASE:\n\$\{KNOWLEDGE_BASE\}`;/;

  const missing = [];
  if (!hasLoader && !kbAnchor.test(src)) missing.push('the `const KNOWLEDGE_BASE = fs.readFileSync(...)` line');
  if (!hasTail && !tailAnchor.test(src)) missing.push('the `KNOWLEDGE BASE:\\n${KNOWLEDGE_BASE}`; end of the system prompt');

  if (missing.length) {
    console.error('✖ index.js does not look the way this patch expects. Missing:');
    for (const m of missing) console.error(`   - ${m}`);
    console.error('\nApply the two edits by hand instead — see SETUP.md, step 3.');
    process.exit(1);
  }

  if (checkOnly) {
    console.log('index.js is unpatched but patchable. Run without --check to apply.');
    process.exit(0);
  }

  if (!hasLoader) src = src.replace(kbAnchor, (m) => m + LOADER);
  if (!hasTail) src = src.replace(tailAnchor, 'KNOWLEDGE BASE:\n${KNOWLEDGE_BASE}' + PROMPT_TAIL + '`;');

  fs.writeFileSync(INDEX, src);
  console.log('✅ index.js patched: it now loads knowledge/learnings.md into the system prompt.');
  console.log('   Review the diff with `git diff index.js` before pushing.');
}

main();
