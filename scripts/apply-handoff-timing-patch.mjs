#!/usr/bin/env node
// One-time, idempotent patch (2026-08-30). Applies two changes to index.js:
//
//   1. INVESTMENT PROPERTY — every substantive reply must CLOSE on the line
//      that Mei Residence is bought as an investment property.
//   2. HANDOFF TIMING — no escalate_to_agent on the client's first or second
//      message; allowed from the third on, or immediately if they explicitly
//      ask for a person / call / viewing / reservation.
//
//   node scripts/apply-handoff-timing-patch.mjs          # apply
//   node scripts/apply-handoff-timing-patch.mjs --check  # report only
//
// Safe to run more than once. Refuses rather than guesses if index.js does not
// look the way it expects.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.js');
const checkOnly = process.argv.includes('--check');

let src = fs.readFileSync(INDEX, 'utf8');
const before = src;

const edits = [];
function replace(name, oldStr, newStr, doneMarker) {
  if (src.includes(doneMarker)) { edits.push(`skip  ${name} (already applied)`); return; }
  if (!src.includes(oldStr)) throw new Error(`anchor not found for "${name}" — index.js is not what this patch expects; aborting without writing.`);
  src = src.replace(oldStr, newStr);
  edits.push(`ok    ${name}`);
}

// ---------------------------------------------------------------- 1. import
replace('import handoff-timing',
  "import { looksLikeNonBuyerOutreach } from './src/not-a-lead.js';",
  "import { looksLikeNonBuyerOutreach } from './src/not-a-lead.js';\nimport { handoffTooEarly, MIN_CLIENT_TURNS_BEFORE_HANDOFF } from './src/handoff-timing.js';",
  "from './src/handoff-timing.js'");

// ------------------------------------------------------------ 2. file header
replace('header comment',
  "import express from 'express';",
  `// Investment framing + handoff timing (2026-08-30): the agent was (a) describing
// Mei Residence like a seaside holiday apartment without ever saying plainly that
// it is bought as an investment property, and (b) calling escalate_to_agent on the
// client's very first message — "a Mei specialist will contact you" before anyone
// had answered a single question. The prompt now requires every substantive reply
// to CLOSE on the investment-property line, and forbids a handoff before the third
// client message unless the client explicitly asks for a person / call / viewing /
// reservation. src/handoff-timing.js is the deterministic backstop: a too-early
// escalate() is refused outright — no needs-human tag, no specialist alert — and
// the model is told to answer the question itself.

import express from 'express';`,
  'Investment framing + handoff timing (2026-08-30)');

// ------------------------------------------------------------- 3. GOALS line
replace('GOALS line',
  '(1+1/2+1/duplex) and budget; hand off hot leads to a human.',
  '(1+1/2+1/duplex) and budget; hand off hot leads to a human — but only after you have\nactually helped them over two or three messages, never on the first one.',
  'never on the first one.');

// ------------------------------------------------- 4. two new prompt sections
const HAND_OFF_ANCHOR = 'HAND OFF (call escalate_to_agent) when: they ask for a person, want a personalized';
const NEW_SECTIONS = `MEI RESIDENCE IS AN INVESTMENT PROPERTY — SAY IT, AND CLOSE ON IT. This is not a
holiday home you buy to use two weeks a year: it is a managed, income-producing
investment (Renditeimmobilie) that happens to be on the sea, and the free owner
use is a bonus on top, not the point. Lead with the property, and END the reply
with ONE short closing line, in the client's own language, that says plainly that
Mei Residence is bought as an investment property: the unit is rented out and
managed for you under Ramada Residences by Wyndham, it earns you a return (the
65/35 rental pool or the 6% guaranteed — their choice), you hold the Property Deed
as sole owner, and you still get your own free stay each year.
- Put it at the END, as the last line, after you have answered everything they
  asked. Never open with it, never let it push the answer down.
- One or two sentences. Vary the wording, never paste the same sentence twice in a
  row, and never turn it into a sales pitch or a list.
- Say it on every substantive reply — price, availability, a unit, the returns,
  the location, the timeline, contracts, "what is this?". Skip it only on pure
  small talk ("thanks", "ok", "good morning"), on a reply to a non-lead, or when
  you already closed on it in your previous message and nothing new was asked.
- Example shape (translate, do not copy the words): "Keep in mind Mei Residence is
  bought as an investment — the apartment is rented out and fully managed under
  Ramada Residences by Wyndham, so it earns a return while you stay the legal
  owner, with free use for yourself each year."

DO NOT HAND OFF ON THE FIRST MESSAGE — EARN IT OVER TWO OR THREE. A brand-new chat
is yours to handle. Someone who has written once or twice ("hello", "how much is a
1+1?", "send me info") must get a real answer from you, not "a Mei specialist will
contact you" — that reads as being passed around before anyone has helped them,
and it burns the specialist's time on a lead nobody has qualified.
- Client message 1 and 2: NEVER call escalate_to_agent. Answer from the KNOWLEDGE
  BASE, give concrete units, prices, m2, sea view, tour links, the return options,
  the payment shape, do the arithmetic — then ask ONE question (typology, budget,
  timing, whether they are buying to invest) and close on the investment line
  above.
- From client message 3 on, a handoff is allowed when the normal HAND OFF
  conditions below are met and you have genuinely run out of KB answers.
- THE ONE EXCEPTION, valid from the very first message: they explicitly ask for a
  person, a phone call, a viewing/meeting, to reserve a unit, or a personalised
  offer, or they are a real-estate agency with buyers. Then escalate immediately —
  making someone who asked for a human wait is worse.
- If you call escalate_to_agent too early the system will refuse it, nothing is
  tagged and nobody is notified — so a reply that promises a specialist would be a
  lie. When the tool comes back saying it was too early, just answer well.

`;
replace('investment + timing prompt sections',
  HAND_OFF_ANCHOR, NEW_SECTIONS + HAND_OFF_ANCHOR,
  'MEI RESIDENCE IS AN INVESTMENT PROPERTY — SAY IT, AND CLOSE ON IT.');

// ------------------------------------------------- 5. HAND OFF paragraph head
replace('HAND OFF paragraph',
  `HAND OFF (call escalate_to_agent) when: they ask for a person, want a personalized
quote/viewing/reservation, need payment-plan or exact guarantee terms, are clearly
hot, are a real-estate agency partner who has BUYERS for our units, or you can't
answer from the KB.`,
  `HAND OFF (call escalate_to_agent) when — from the third client message on, or
straight away if they asked for a person/call/viewing/reservation — they ask for a
person, want a personalized quote/viewing/reservation, need payment-plan or exact
guarantee terms, are clearly hot, are a real-estate agency partner who has BUYERS
for our units, or you can't answer from the KB.`,
  'HAND OFF (call escalate_to_agent) when — from the third client message on');

// ---------------------------------------------------- 6. tool description note
replace('escalate_to_agent tool description',
  "description: 'Hand this lead to a human Mei sales agent (tags the contact needs-human + hot-lead and pings a specialist). Call when they ask for a person,",
  "description: 'Hand this lead to a human Mei sales agent (tags the contact needs-human + hot-lead and pings a specialist). TIMING: do NOT call this on the client\\'s first or second message — handle those yourself from the knowledge base; a handoff is allowed from the third client message on. The only exception, valid immediately, is a client who explicitly asks for a person, a phone call, a viewing/meeting, to reserve a unit or a personalised offer, or a real-estate agency with buyers. Too-early calls are refused by the system: nothing is tagged, nobody is notified, so never promise a specialist after one. Call when they ask for a person,",
  'TIMING: do NOT call this on the client');

// ------------------------------------------------- 7. countClientMessages()
replace('countClientMessages helper',
  'function lastClientText(contactId) {',
  `// How many separate messages this client has sent in the thread we hold
// (the CRM history is rebuilt on every message by src/thread.js, so this is
// the real conversation length, not just this process's memory).
function countClientMessages(contactId) {
  const conv = store.get(contactId);
  if (!conv) return 0;
  return conv.history.filter((m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim()).length;
}

function lastClientText(contactId) {`,
  'function countClientMessages(contactId) {');

// --------------------------------------------------- 8. guard inside escalate
replace('too-early guard in escalate()',
  `  const clientWords = lastClientMessages(contactId, 6).join('\\n');
  if (looksLikeNonBuyerOutreach(clientWords)) {`,
  `  const clientWords = lastClientMessages(contactId, 6).join('\\n');

  // Not on the first message (2026-08-30). The agent handles the first two or
  // three client messages itself; a handoff only fires from the third client
  // message on — unless they explicitly ask for a person, a call, a viewing or
  // a reservation. See src/handoff-timing.js.
  const clientTurns = countClientMessages(contactId);
  if (handoffTooEarly({ clientTurns, clientWords })) {
    console.log(\`[handoff] TOO EARLY for \${contactId} — client turn \${clientTurns}/\${MIN_CLIENT_TURNS_BEFORE_HANDOFF}, no tags, no alert\`);
    return { ok: true, alerted: false, blocked: 'too-early' };
  }

  if (looksLikeNonBuyerOutreach(clientWords)) {`,
  'blocked: \'too-early\'');

// ------------------------------------------------ 9. too-early tool_result
replace('too-early tool_result branch',
  "        if (r.blocked === 'not-a-lead') {",
  `        if (r.blocked === 'too-early') {
          results.push({ type: 'tool_result', tool_use_id: b.id, content: 'NOT escalated — it is too early. This client has only just started writing to us and did not ask for a person, a call, a viewing or a reservation. Nobody was tagged and no specialist was notified, so do NOT say or hint that anyone will contact them. Answer their question yourself, fully, from the KNOWLEDGE BASE, in their own language — availability, price, m2, sea view, tour links, completion date, the two return options, the payment shape, any arithmetic — and end by asking ONE question that moves the conversation on (which typology, which budget, when they are thinking of investing). Close the reply with the one-line reminder that Mei Residence is an investment property. You may hand over later in the conversation once you have actually helped them.' });
        } else if (r.blocked === 'not-a-lead') {`,
  "if (r.blocked === 'too-early') {");

console.log(edits.join('\n'));

if (src === before) { console.log('\nindex.js already up to date — nothing written.'); process.exit(0); }
if (checkOnly) { console.log('\n--check: index.js WOULD be patched, nothing written.'); process.exit(0); }
fs.writeFileSync(INDEX, src);
console.log('\nindex.js patched.');
