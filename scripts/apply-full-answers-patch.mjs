#!/usr/bin/env node
// One-time, idempotent patch (2026-08-30, second of the day). Removes the reply
// length cap so the agent answers EVERY question a client asks.
//
// A client sent a 14-point due-diligence list (contracts, the exact 6% formula,
// gross vs net, owner use, fees, exit from the programme, delay penalties) and
// got a short reply that left most of it unanswered. Two causes: the prompt told
// the agent to be "chat-short (1-4 sentences)" with a soft exception, and a truly
// complete answer can exceed WhatsApp's 4096-character message limit, which the
// provider rejects outright — the client would get nothing at all.
//
// So: the prompt now requires every question to be answered, states there is no
// length limit, and the send path splits a long reply into consecutive messages
// (src/split-message.js) instead of shortening it.
//
//   node scripts/apply-full-answers-patch.mjs          # apply
//   node scripts/apply-full-answers-patch.mjs --check  # report only
//
// Safe to run more than once.

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

// ------------------------------------------------------------------ 1. import
const PLACES_IMPORT = "import { PLACES_TOOL, findPlaces, isConfigured as placesConfigured } from './src/places.js';";
replace('import split-message',
  PLACES_IMPORT,
  PLACES_IMPORT + "\nimport { splitMessage, MAX_MESSAGE_CHARS } from './src/split-message.js';",
  "from './src/split-message.js'");

// ------------------------------------------------------- 2. sendReplyChunked()
replace('sendReplyChunked helper',
  `const addTags = (contactId, tags) =>
  ghl(\`/contacts/\${contactId}/tags\`, 'POST', { tags }, '2021-07-28');`,
  `// Long answers are SENT IN FULL, as consecutive messages (2026-08-30). The
// agent used to be told to keep replies short, so a client who asked fourteen
// due-diligence questions in one message got four sentences back. It now answers
// every question; anything over the channel's 4096-character limit would be
// rejected outright by the provider (the client would get nothing), so we split
// on paragraph boundaries instead of shortening. One part = one chat bubble.
async function sendReplyChunked(contactId, message, channel = 'WhatsApp') {
  const parts = splitMessage(message, MAX_MESSAGE_CHARS);
  if (parts.length <= 1) return sendReply(contactId, message, channel);
  console.log(\`[msg] \${contactId}: reply is \${message.length} chars — sending as \${parts.length} messages\`);
  let last = { ok: true, data: null };
  for (const [i, part] of parts.entries()) {
    last = await sendReply(contactId, part, channel);
    if (!last.ok) {
      console.error(\`[msg] \${contactId}: part \${i + 1}/\${parts.length} FAILED\`, JSON.stringify(last.data).slice(0, 200));
      return last;
    }
    if (i < parts.length - 1) await sleep(700); // keep the parts in order
  }
  return last;
}

const addTags = (contactId, tags) =>
  ghl(\`/contacts/\${contactId}/tags\`, 'POST', { tags }, '2021-07-28');`,
  'async function sendReplyChunked(');

// --------------------------------------------------------- 3. use it to send
replace('send the client reply chunked',
  '    const sent = await sendReply(contactId, reply, channel); // reply on the same channel it arrived on',
  '    const sent = await sendReplyChunked(contactId, reply, channel); // reply on the same channel it arrived on',
  'await sendReplyChunked(contactId, reply, channel)');

// ------------------------------------------------------- 4. the prompt itself
replace('answer-every-question prompt rule',
  `STYLE: warm, professional, chat-short (1-4 sentences, plain text, at most one
emoji). Use their name if known. Ask ONE question at a time. Never say you are an AI
language model.
LENGTH EXCEPTION: when a client asks several concrete buying questions at once
(availability, price, timeline, payment, returns), give the FULL structured answer
even if it runs long — one short line per point, in the order they asked, exactly
like Eglent's reply in GOLD-STANDARD REPLIES below. Short stays the default for
greetings, small talk and single questions.`,
  `STYLE: warm, professional, plain text, at most one emoji. Use their name if known.
Never say you are an AI language model. Keep greetings and small talk short (1-4
sentences) and ask ONE question at a time there.

ANSWER EVERY QUESTION THEY ASKED — THERE IS NO LENGTH LIMIT ON A REAL ANSWER.
When a client asks several concrete questions — and serious buyers send lists of
ten or fifteen: the contracts, the exact 6% formula, gross or net, what it is
calculated on, how many years, how many weeks of owner use, the yearly fees, the
operator's commission, taxes, furnishing, leaving the programme, delay penalties —
you answer ALL of them, in the order they asked, one short labelled line per point.
Never pick the three easiest and stop. Never answer half and offer the rest "in a
meeting". Never compress a fifteen-point list into a paragraph of generalities.
- Length is NOT a reason to leave anything out. Write as long a reply as the
  questions need — the system splits a long message into consecutive chat messages
  by itself, so nothing you write is ever cut.
- Number or dash the points so a long reply stays readable on a phone. One line
  each; no essays per point.
- The ONLY points you may leave open are the ones the CONTRACT & MONEY ANSWERS
  section marks as not settled — and even those get their honest one-line answer
  from that section, never silence and never "we'll cover it in the meeting".
- If they also ask for a meeting or a viewing, answer every point FIRST and put
  the meeting at the end. A client who sends a due-diligence list and gets "let's
  discuss it in person" reads it as us dodging the list.`,
  'ANSWER EVERY QUESTION THEY ASKED — THERE IS NO LENGTH LIMIT');

// ------------------------------ 5. the old test asserted the rule we replaced
const TEST = path.join(ROOT, 'scripts', 'test-answer-first.mjs');
let tsrc = fs.readFileSync(TEST, 'utf8');
const OLD_CHECK = "check('long structured answers allowed when asked a lot', /LENGTH EXCEPTION/.test(index));";
const NEW_CHECK = "check('every question gets answered, with no length cap', /THERE IS NO LENGTH LIMIT ON A REAL ANSWER/.test(index));";
if (tsrc.includes(NEW_CHECK)) {
  edits.push('skip  test-answer-first.mjs (already applied)');
} else if (tsrc.includes(OLD_CHECK)) {
  fs.writeFileSync(TEST, tsrc.replace(OLD_CHECK, NEW_CHECK));
  edits.push('ok    test-answer-first.mjs');
} else {
  throw new Error('anchor not found in scripts/test-answer-first.mjs — aborting.');
}

console.log(edits.join('\n'));

if (src === before) { console.log('\nindex.js already up to date — nothing written.'); process.exit(0); }
if (checkOnly) { console.log('\n--check: index.js WOULD be patched, nothing written.'); process.exit(0); }
fs.writeFileSync(INDEX, src);
console.log('\nindex.js patched.');
