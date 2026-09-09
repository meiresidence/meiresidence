// Locks in the "never make the client look stupid" rule (9 Sep 2026).
//
// The reply that started this: a client wrote one word — "Vendodhja" — and got back
//   "Kuptohet — shumë e ngatërrojnë Qerretin me diku tjetër..."
//   "Zona nuk të bind, apo thjesht s'e kishe të qartë ku ndodhet saktësisht?"
// Between them those two sentences told a buyer she was confused, then guessed at
// her motive from a menu of two. Both readings are insulting and neither was asked for.
//
// Checked here, no API key and no network:
//   1. detector — the talking-down phrasings are caught, and ordinary factual
//      location/price answers are NOT caught (a false positive would be worse).
//   2. prompt   — index.js and knowledge/system-prompt.md both carry the rule, the
//      open-question fix on the NOT-INTERESTED ladder, and the location-objection
//      rule — and none of the hard rules were eaten in the process.
//   3. kb       — knowledge/location.md no longer reads as licence to tell the
//      client that people confuse Qerret with somewhere else.
//
// Run: node scripts/test-no-condescension.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findCondescension, tidyForHuman } from '../src/voice.js';

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`); }
};

const INDEX = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const PROMPT = fs.readFileSync(new URL('../knowledge/system-prompt.md', import.meta.url), 'utf8');
const LOCATION = fs.readFileSync(new URL('../knowledge/location.md', import.meta.url), 'utf8');

console.log('\n1. Detector — the real replies that caused this');

check('"shumë e ngatërrojnë Qerretin me diku tjetër" is caught', () => {
  assert.ok(findCondescension('Kuptohet — shumë e ngatërrojnë Qerretin me diku tjetër. Ndodhet në bregdetin e Durrësit.').length);
});
check('"s\'e kishe të qartë ku ndodhet" is caught', () => {
  assert.ok(findCondescension("Zona nuk të bind, apo thjesht s'e kishe të qartë ku ndodhet saktësisht?").length);
});
check('"zona nuk të bind" — narrating their mind — is caught', () => {
  assert.ok(findCondescension('Zona nuk të bind, apo jo?').length);
});
check('English "most people don\'t know" is caught', () => {
  assert.ok(findCondescension("Most people don't know where Qerret is, so let me explain.").length);
});
check('English "in case you weren\'t aware" is caught', () => {
  assert.ok(findCondescension("In case you weren't aware, Qerret is on the Durres coast.").length);
});
check('"you\'re probably worried about..." is caught', () => {
  assert.ok(findCondescension("You're probably worried about the distance to Tirana.").length);
});
check('"ndoshta nuk e di" is caught', () => {
  assert.ok(findCondescension('Ndoshta nuk e di, por jemi 280 m nga deti.').length);
});
check('"it is a common misconception" is caught', () => {
  assert.ok(findCondescension('It is a common misconception that the area is isolated.').length);
});

console.log('\n2. Detector — normal answers must NOT trip it');

const clean = [
  'Qerret, bregdeti i Durrësit — rreth 280 metra nga plazhi përmes pyllit të pishave, ~20 min nga Durrësi dhe ~45 min nga Tirana dhe aeroporti.',
  'Çfarë të intereson te vendodhja — sa larg është deti, apo sa larg Tirana?',
  'A212 është 1+1, 52.2 m2, rreth 103,500 EUR, me pamje nga deti dhe aktualisht e lirë.',
  'The area is a developed resort strip: restaurants, cafes, a promenade. Busy May to September, quieter in winter.',
  'E kuptoj. Çfarë të pengon më shumë?',
  '150.000 euro investim → 9.000 euro bruto në vit, çdo vit, për pesë vjet.',
];
for (const [i, reply] of clean.entries()) {
  check(`clean reply ${i + 1} is not flagged`, () => {
    assert.deepEqual(findCondescension(reply), [], `flagged: ${reply}`);
  });
}

check('the guard never rewrites a reply, only logs it', () => {
  const bad = 'Kuptohet — shumë e ngatërrojnë Qerretin me diku tjetër.\n\nNdodhet në Qerret, Durrës.';
  assert.equal(tidyForHuman(bad, { contactId: 'test' }), bad);
});

console.log('\n3. The rule is in the live prompt (index.js)');

check('index.js carries the NEVER MAKE THE CLIENT LOOK STUPID section', () => {
  assert.match(INDEX, /NEVER MAKE THE CLIENT LOOK STUPID/);
});
check('index.js bans "many people confuse X with Y" / "shumë e ngatërrojnë"', () => {
  assert.match(INDEX, /many people confuse/i);
  assert.match(INDEX, /shum[eë] e ngat[eë]rrojn[eë]/i);
});
check('index.js bans narrating what the client thinks or feels', () => {
  assert.match(INDEX, /zona nuk t[eë] bind/i);
});
check('index.js bans the forced choice between two guessed motives', () => {
  assert.match(INDEX, /forced choice between two guesses/i);
  assert.match(INDEX, /are you just not looking right now\?/i);
  assert.match(INDEX, /[cç]mimi apo thjesht\s+s['’`]?je duke\s+k[eë]rkuar/i);
});
check('index.js treats a one-word topic as an agenda item, not ignorance', () => {
  assert.match(INDEX, /ONE-WORD MESSAGE NAMING A TOPIC/);
  assert.match(INDEX, /Vendodhja/);
});
check('the NOT-INTERESTED question is required to be genuinely open', () => {
  assert.match(INDEX, /The question must be genuinely OPEN/);
});
check('the location objection assumes they know where it is', () => {
  assert.match(INDEX, /assume they know exactly where it is and want a reason/i);
});

console.log('\n4. Mirrored into knowledge/system-prompt.md');

check('system-prompt.md carries the section', () => {
  assert.match(PROMPT, /## Never make the client look stupid/);
});
check('system-prompt.md carries the one-word-topic rule', () => {
  assert.match(PROMPT, /agenda item, not a\s*\n?\s*confession of ignorance/);
});
check('system-prompt.md carries the location-objection rule', () => {
  assert.match(PROMPT, /Assume they know exactly where it is/i);
});

console.log('\n5. The knowledge base no longer licenses it');

check('location.md says the "people confuse it" framing is for us, never the client', () => {
  assert.match(LOCATION, /Say it as a fact, never as a correction/i);
  assert.match(LOCATION, /never write that many people confuse Qerret/i);
});
check('location.md still names Qerret, Durres and the 280 m', () => {
  assert.match(LOCATION, /Qerret/);
  assert.match(LOCATION, /280 m/);
});

console.log('\n6. Hard rules survived the edit');

check('the retired "~8%" figure is still banned, not quoted', () => {
  assert.match(INDEX, /NEVER use "up to ~8%"/);
  assert.ok(!/(?<!NEVER use ")(?:earns?|returns?|yield of) (?:up to )?~?8%/i.test(INDEX),
    'a retired return figure came back as a claim');
});
check('parking posts are still not for sale', () => {
  assert.match(INDEX, /PARKING POSTS ARE NOT FOR SALE/);
});
check('non-buyers are still never escalated', () => {
  assert.match(INDEX, /NOT LEADS — NEVER call escalate_to_agent/);
});
check('Eglent Bici is still the only nameable staff member', () => {
  assert.match(INDEX, /The ONLY\s*\n?staff name you may ever write to a client is Eglent Bici/);
});
check('answer-every-question-in-full is still there', () => {
  assert.match(INDEX, /ANSWER EVERY QUESTION THEY ASKED/);
});

console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n');
process.exit(failures ? 1 : 0);
