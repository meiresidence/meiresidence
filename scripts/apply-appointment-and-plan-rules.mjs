#!/usr/bin/env node
// One-time, idempotent patch (2026-08-30, third of the day). Four changes, all
// confirmed by Eglent:
//
//   1. The 6% is UNTOUCHED in the weeks the owner uses the apartment himself.
//   2. The owner CANNOT leave the rental programme and rent the unit out himself.
//      (Both were marked "not settled" earlier today — they are settled now.)
//   3. An appointment / viewing request no longer goes straight to a human: the
//      agent first asks what the client wants to know, answers it, and only then
//      arranges the meeting.
//   4. A client asking for the plan or a tour gets the FLOOR PLAN first, then the
//      3D tour — or both — but NEVER the 3D tour on its own.
//
//   node scripts/apply-appointment-and-plan-rules.mjs          # apply
//   node scripts/apply-appointment-and-plan-rules.mjs --check  # report only
//
// Safe to run more than once.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const edits = [];
const pending = new Map(); // file -> new content

function patch(file, name, oldStr, newStr, doneMarker) {
  const abs = path.join(ROOT, file);
  const cur = pending.get(abs) ?? fs.readFileSync(abs, 'utf8');
  if (cur.includes(doneMarker)) { edits.push(`skip  ${name} (already applied)`); return; }
  if (!cur.includes(oldStr)) throw new Error(`anchor not found for "${name}" in ${file} — aborting without writing anything.`);
  pending.set(abs, cur.replace(oldStr, newStr));
  edits.push(`ok    ${name}`);
}

// ============================================================ 1 + 2. the facts
patch('knowledge/contract-questions.md', 'own-use + exit are settled now',
  `- **What happens to the 6% in the weeks the owner uses the apartment himself**
  ("çfarë ndodh me 6% kur e përdor vetë") → the free owner use (1 week–10 days in
  high season, 2–3 weeks off season) and the 6% are both written into the
  management contract. How the two interact is set out there, and Eglent goes
  through exactly that clause before any reservation. Say that; give no percentage,
  no pro-rata rule and no "it doesn't affect it" of your own.
- **Can the owner leave the programme and rent the apartment out himself**
  ("nëse mund të dalësh nga programi dhe ta japesh vetë në qira") → the one thing
  that is certain and worth saying: the buyer holds the Property Deed as sole legal
  owner, and the management arrangement is a separate contract running 5+5 years.
  The exit terms of that contract are a point Eglent goes through personally. Never
  claim the owner can walk away freely, and never claim he is locked in.
- **Penalties if the building is not delivered on time**`,
  `- **SETTLED 30 Aug 2026 — the 6% is NOT reduced by the owner's own use.** The free
  owner stay (1 week–10 days in high season, 2–3 weeks off season) does not touch
  the guarantee: the owner still receives the full 6% for that year. Say it plainly
  and warmly — it is one of the strongest points we have. "E përdor vetë dhe prapë
  merr 6% të plotë." Do not add conditions of your own on top.
- **SETTLED 30 Aug 2026 — the owner CANNOT leave the programme and rent the unit
  out himself.** The apartment stays in the Ramada Residences management programme;
  self-renting or renting through someone else is not an option. Say it directly and
  without apology, then say why it works that way: it is a branded, centrally managed
  residence — the single operator is what protects the standard, the occupancy and
  therefore the return for every owner. The buyer is still the sole legal owner with
  the Property Deed in their own name; what is fixed is the management, not the
  ownership. Never soften this into "we'd have to check".
- **Penalties if the building is not delivered on time**`,
  'SETTLED 30 Aug 2026 — the 6% is NOT reduced');

patch('knowledge/contract-questions.md', 'checklist lines 9 and 13',
  `9. the 6% during own use → OPEN, see above`,
  `9. the 6% during own use → the 6% is NOT reduced; the owner uses the unit and still gets the full 6%`,
  'the 6% is NOT reduced; the owner uses the unit');

patch('knowledge/contract-questions.md', 'checklist line 13',
  `13. leaving the programme and self-renting → OPEN, see above`,
  `13. leaving the programme and self-renting → not possible; the unit stays in the Ramada programme (ownership is still fully the buyer's)`,
  'not possible; the unit stays in the Ramada programme');

// ================================================== 3. appointment asks first
patch('src/handoff-timing.js', 'viewing is no longer an instant handoff',
  `  // wants a viewing / meeting / site visit
  /\\b(takim|vizit|shoh apartamentin|vij ta shoh|ta shoh nga afer|ta shoh nga afër)\\w*/i,
  /\\b(viewing|visit|site visit|meeting|appointment|come and see|see the apartment)\\b/i,
  /\\b(visita|appuntamento|incontro)\\b/i,
  /\\b(besichtigung|termin|treffen|vor ort)\\w*/i,
  /\\b(spotkanie|oglądanie|ogladanie|wizyt)\\w*/i,
  /\\b(prohlídk|prohlidk|schůzk|schuzk|návštěv)\\w*/i,
`,
  `  // NOTE (30 Aug 2026): a viewing / meeting / appointment request is deliberately
  // NOT in this list any more. Eglent's rule: when a client asks for an
  // appointment, the agent first asks what they want to know, answers it, and
  // only then arranges the meeting — so a bare "can we meet?" is handled by the
  // agent, not bounced straight to a person. A client who asks for a PERSON, a
  // CALL, a RESERVATION or a personal offer still comes through immediately.
`,
  'a viewing / meeting / appointment request is deliberately');

// ==================================== 4a. prompt: appointment + plan-before-3D
patch('index.js', 'appointment and floor-plan prompt rules',
  `HAND OFF (call escalate_to_agent) when — from the third client message on, or`,
  `APPOINTMENT / VIEWING — ASK WHAT THEY WANT TO KNOW FIRST. When a client asks to
meet, to visit, to see the site or the apartment "nga afër", do NOT jump to
arranging it and do NOT hand it to a person on the spot. Reply warmly that a visit
is easy to arrange, then ask ONE question: what exactly they would like to know or
see, so the meeting is worth their time (which typology, the location and the
surroundings, the contracts and the return, a specific unit). Answer whatever they
name — in full, from the KNOWLEDGE BASE — and arrange the meeting after that. A
client who is sent to a viewing before anyone has answered a single question
arrives cold, and half of them never arrive at all.
- If they answer with concrete questions, answer them ALL and then confirm the
  meeting and escalate.
- If they insist on just fixing a date, or ask for a person, a call or to reserve,
  escalate straight away — never make someone repeat a request for a human.

PLAN FIRST, 3D SECOND — NEVER THE 3D TOUR ALONE. When a client asks for the plan,
the layout, a video or a virtual tour of a unit, the FLOOR PLAN of that apartment
comes first: the plan is what a buyer actually reads. Send the floor plan, then the
3D tour and the video walkthrough — or the plan and the 3D together — but NEVER the
3D tour on its own, and never as the first or only thing they get. The 3D is an
illustrative model of the typology; the plan is the apartment. If you do not have a
floor plan for that unit in front of you, say in one clause that the detailed floor
plan is coming from Eglent, and send it together with the tour links rather than in
place of them.

HAND OFF (call escalate_to_agent) when — from the third client message on, or`,
  'PLAN FIRST, 3D SECOND — NEVER THE 3D TOUR ALONE');

// ============================== 4b. the same rule where the KB states it today
patch('knowledge.md', 'KB: plan before the 3D tour',
  `**When a client asks for a video, plan/planimetri, layout, photos, or a virtual
tour of a unit, ALWAYS send BOTH links together** — the video tour AND the 3D
plan — not just one.`,
  `**When a client asks for a video, plan/planimetri, layout, photos, or a virtual
tour of a unit, the FLOOR PLAN of the apartment comes FIRST**, then the 3D plan and
the video walkthrough — or the plan together with them. **NEVER send the 3D tour on
its own** (rule from Eglent, 30 Aug 2026): the 3D is an illustrative model of the
typology, the plan is the apartment, and a buyer reads the plan first. If no floor
plan is to hand for that unit, say in one clause that Eglent sends the detailed
floor plan, and send the tour links alongside that — never instead of it.
Otherwise **send BOTH links together** — the video tour AND the 3D plan — not just
one.`,
  'rule from Eglent, 30 Aug 2026');

// ========================= 5. the test asserted the old instant-viewing bypass
patch('scripts/test-handoff-timing.mjs', 'test: viewing waits, it does not bypass',
  `  [1, 'Ich möchte einen Besichtigungstermin', false, 'wants a viewing (DE)'],`,
  `  [1, 'Ich möchte einen Besichtigungstermin', true, 'viewing request waits — the agent asks what they want to know first (DE)'],`,
  'viewing request waits');

patch('scripts/test-handoff-timing.mjs', 'test: see-the-unit waits too',
  `  [1, 'Dua ta shoh apartamentin nga afer', false, 'wants to see the unit (SQ)'],`,
  `  [1, 'Dua ta shoh apartamentin nga afer', true, 'seeing the unit waits — same rule (SQ)'],`,
  'seeing the unit waits');

console.log(edits.join('\n'));
if (!pending.size) { console.log('\nAlready up to date — nothing written.'); process.exit(0); }
if (checkOnly) { console.log(`\n--check: ${pending.size} file(s) WOULD be patched, nothing written.`); process.exit(0); }
for (const [abs, content] of pending) fs.writeFileSync(abs, content);
console.log(`\nPatched ${pending.size} file(s).`);
