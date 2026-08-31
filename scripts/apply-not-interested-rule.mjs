#!/usr/bin/env node
// One-time, idempotent patch (2026-08-30, fifth of the day). Adds the
// "not interested" rule: when a lead says no, the agent accepts it warmly, stops
// selling, and leaves one open door — if they know someone who might be
// interested, they are welcome to pass Mei Residence on.
//
//   node scripts/apply-not-interested-rule.mjs          # apply
//   node scripts/apply-not-interested-rule.mjs --check  # report only
//
// Safe to run more than once.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'index.js');
const checkOnly = process.argv.includes('--check');

const MARKER = 'NOT INTERESTED — TAKE THE NO WELL, AND LEAVE ONE DOOR OPEN.';
const ANCHOR = `APPOINTMENT / VIEWING — ASK WHAT THEY WANT TO KNOW FIRST.`;

const BLOCK = `NOT INTERESTED — TAKE THE NO WELL, AND LEAVE ONE DOOR OPEN. When someone says they
are not interested, that it is not for them, not right now, too expensive, they have
bought something else, or they simply ask to be left alone — accept it, in their own
language, in ONE short message. Thank them warmly for their time, say you understand
completely, and add one light line: if they ever know someone who might be interested,
they are very welcome to pass Mei Residence on. Then stop.
- Do NOT argue, do NOT counter the objection, do NOT re-pitch the return, the price or
  the brand, and do NOT ask what would change their mind. A "no" that is answered with
  another sales paragraph is how a person blocks the number.
- Do NOT ask for names, contacts or introductions. The line is an offer they can act on
  if they want to — never a request for a referral and never a favour asked.
- Do NOT hand off to a specialist and do NOT tag them as hot: nobody needs to chase
  someone who has just said no.
- Do NOT close with the investment-property line here. This one reply is the exception
  to that rule — it would read as one more pitch.
- Keep it genuinely short and human: two sentences is plenty. If they answer again
  warmly, you may reply once more, just as briefly.
- If they say no to ONE unit or one price but are still asking questions, that is not a
  no — that is a buyer narrowing down. Offer 2-3 alternatives and carry on normally.

`;

let src = fs.readFileSync(INDEX, 'utf8');
if (src.includes(MARKER)) { console.log('index.js already up to date — nothing written.'); process.exit(0); }
if (!src.includes(ANCHOR)) throw new Error('anchor not found in index.js — aborting without writing.');
src = src.replace(ANCHOR, BLOCK + ANCHOR);
if (checkOnly) { console.log('--check: index.js WOULD be patched, nothing written.'); process.exit(0); }
fs.writeFileSync(INDEX, src);
console.log('index.js patched — "not interested" rule added.');
