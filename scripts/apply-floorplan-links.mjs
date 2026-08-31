#!/usr/bin/env node
// One-time, idempotent patch (2026-08-30, fourth of the day).
//
// Correction from Eglent: the per-unit `tour:` links (app.screencast.com) ARE the
// apartment's FLOOR PLAN. The knowledge base described them as a "video
// walkthrough", so the agent treated the floor plan as an optional extra and
// could end up sending only the mei-tour.netlify.app 3D model. Every place that
// called those links a video now calls them what they are, and the send order is
// stated once and enforced everywhere: FLOOR PLAN (tour:) first, then the 3D
// plan (3d:) — never the 3D on its own.
//
//   node scripts/apply-floorplan-links.mjs          # apply
//   node scripts/apply-floorplan-links.mjs --check  # report only
//
// Safe to run more than once.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const edits = [];
const pending = new Map();

function patch(file, name, oldStr, newStr, doneMarker) {
  const abs = path.join(ROOT, file);
  const cur = pending.get(abs) ?? fs.readFileSync(abs, 'utf8');
  if (cur.includes(doneMarker)) { edits.push(`skip  ${name} (already applied)`); return; }
  if (!cur.includes(oldStr)) throw new Error(`anchor not found for "${name}" in ${file} — aborting without writing anything.`);
  pending.set(abs, cur.replace(oldStr, newStr));
  edits.push(`ok    ${name}`);
}

// ========================================================= knowledge.md: labels
patch('knowledge.md', 'KB: tour: is the floor plan',
  '- `tour:` — a **video walkthrough** (screencast)',
  '- `tour:` — the apartment\'s **FLOOR PLAN**, on app.screencast.com. THIS IS THE PLAN\n  a buyer asks for when they say "planimetri", "plan", "layout" — it is not an\n  optional extra and it is not a marketing video. It goes FIRST.',
  "the apartment's **FLOOR PLAN**, on app.screencast.com");

patch('knowledge.md', 'KB: inventory header',
  'Per-unit (unit | total m2 | price EUR | tour: video walkthrough | 3d: interactive 3D plan):',
  'Per-unit (unit | total m2 | price EUR | tour: FLOOR PLAN (screencast) | 3d: interactive 3D plan):',
  'tour: FLOOR PLAN (screencast)');

patch('knowledge.md', 'KB: send order',
  `**When a client asks for a video, plan/planimetri, layout, photos, or a virtual
tour of a unit, the FLOOR PLAN of the apartment comes FIRST**, then the 3D plan and
the video walkthrough — or the plan together with them. **NEVER send the 3D tour on
its own** (rule from Eglent, 30 Aug 2026): the 3D is an illustrative model of the
typology, the plan is the apartment, and a buyer reads the plan first. If no floor
plan is to hand for that unit, say in one clause that Eglent sends the detailed
floor plan, and send the tour links alongside that — never instead of it.
Otherwise **send BOTH links together** — the video tour AND the 3D plan — not just
one.`,
  `**When a client asks for a plan/planimetri, the layout, a video, photos or a
virtual tour of a unit, send the unit's \`tour:\` link — the FLOOR PLAN — FIRST,
then its \`3d:\` link.** Both together is right; the plan alone is acceptable;
**the 3D link on its own is NEVER acceptable** (rule from Eglent, 30 Aug 2026).
The 3D is an illustrative model of the typology — the plan is the apartment, and
that is what a buyer reads first. If a unit line has a \`3d:\` link but no
\`tour:\` link, send the 3D and say Eglent sends that unit's detailed floor plan;
never present the 3D as if it were the plan.`,
  'send the unit\'s `tour:` link — the FLOOR PLAN — FIRST');

// =============================================================== index.js: prompt
patch('index.js', 'prompt: unit links description',
  `to two links: "tour:" (video walkthrough) and "3d:" (interactive 3D plan at`,
  `to two links: "tour:" (the apartment's FLOOR PLAN, on app.screencast.com — this is
the plan itself, not a marketing video) and "3d:" (interactive 3D plan at`,
  "the apartment's FLOOR PLAN, on app.screencast.com");

patch('index.js', 'prompt: send order in the tour section',
  `photos, or a virtual tour of a unit, send BOTH links in the same reply — the video tour
AND the 3D plan — never just one.`,
  `photos, or a virtual tour of a unit, send BOTH links in the same reply — the FLOOR
PLAN first, then the 3D plan — never the 3D on its own.`,
  'send BOTH links in the same reply — the FLOOR\nPLAN first');

patch('index.js', 'prompt: unit lookup wording',
  `m2, the price and whether it is currently free, plus its tour links (video AND 3D
plan).`,
  `m2, the price and whether it is currently free, plus its links — the FLOOR PLAN
first, then the 3D plan.`,
  'plus its links — the FLOOR PLAN\nfirst');

patch('index.js', 'prompt: worked example phrasing',
  `   Eglent will confirm today's status. Here's the video tour: <tour link> — and the
   interactive 3D plan: https://mei-tour.netlify.app/a212/"`,
  `   Eglent will confirm today's status. Here's the floor plan: <tour link> — and the
   interactive 3D plan: https://mei-tour.netlify.app/a212/"`,
  "Here's the floor plan: <tour link>");

patch('index.js', 'prompt: PLAN FIRST section names the real links',
  `PLAN FIRST, 3D SECOND — NEVER THE 3D TOUR ALONE. When a client asks for the plan,
the layout, a video or a virtual tour of a unit, the FLOOR PLAN of that apartment
comes first: the plan is what a buyer actually reads. Send the floor plan, then the
3D tour and the video walkthrough — or the plan and the 3D together — but NEVER the
3D tour on its own, and never as the first or only thing they get. The 3D is an
illustrative model of the typology; the plan is the apartment. If you do not have a
floor plan for that unit in front of you, say in one clause that the detailed floor
plan is coming from Eglent, and send it together with the tour links rather than in
place of them.`,
  `PLAN FIRST, 3D SECOND — NEVER THE 3D TOUR ALONE. Every unit line in the KNOWLEDGE
BASE carries the plan already: the "tour:" link (app.screencast.com) IS that
apartment's FLOOR PLAN, and "3d:" (mei-tour.netlify.app) is the illustrative 3D
model of the typology. When a client asks for the plan, the planimetri, the layout,
photos, a video or a virtual tour, send the FLOOR PLAN first and the 3D second.
Both together is right; the plan on its own is acceptable; the 3D link on its own
is NEVER acceptable, and never the first thing they get. The plan is the apartment
— it is what a buyer actually reads. Only if a unit has a "3d:" link and no "tour:"
link do you send the 3D alone, and then you say in one clause that Eglent sends
that unit's detailed floor plan.`,
  'the "tour:" link (app.screencast.com) IS that');

patch('index.js', 'handoff tool_result wording',
  `current status and its tour links (video walkthrough + interactive 3D plan)`,
  `current status and its links (the floor plan first, then the interactive 3D plan)`,
  'its links (the floor plan first, then the interactive 3D plan)');

console.log(edits.join('\n'));
if (!pending.size) { console.log('\nAlready up to date — nothing written.'); process.exit(0); }
if (checkOnly) { console.log(`\n--check: ${pending.size} file(s) WOULD be patched, nothing written.`); process.exit(0); }
for (const [abs, content] of pending) fs.writeFileSync(abs, content);
console.log(`\nPatched ${pending.size} file(s).`);
