// Locks in the Eglent-voice rewrite of 2026-09-09.
//
// The agent used to be told to "sound like a person". It is now told to sound
// like ONE person — Eglent — from a profile built out of his own recorded calls
// (knowledge/eglent-voice.md). Three things are checked, none of which needs an
// API key or a network call:
//
//   1. the profile   — it exists, it is loaded into the prompt, and it still
//                      carries the parts of him that must never reach a client.
//   2. identity      — the voice is his, the identity is not: nothing in the
//                      profile tells the agent to introduce itself as Eglent,
//                      the honest "are you a bot" answer survived, and the guard
//                      spots a first-person claim if one ever ships.
//   3. hard rules    — the rewrite ate none of the commercial, privacy or
//                      handoff rules it sits next to.
//
// Run: node scripts/test-eglent-voice.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findRoboticPhrases, findIdentityClaims, tidyForHuman } from '../src/voice.js';

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`); }
};

const idx = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const profile = fs.readFileSync(new URL('../knowledge/eglent-voice.md', import.meta.url), 'utf8');

console.log('\n1. The voice profile');

check('knowledge/eglent-voice.md is substantial, not a stub', () => {
  assert.ok(profile.length > 4000, `only ${profile.length} chars`);
});
check('index.js loads it and puts it in the prompt', () => {
  assert.ok(/knowledge\/eglent-voice\.md/.test(idx), 'the file is never read');
  assert.ok(/\$\{EGLENT_VOICE \?/.test(idx), 'EGLENT_VOICE is never interpolated into the prompt');
  assert.ok(/EGLENT'S VOICE — HOW TO SAY IT/.test(idx), 'the prompt section header is missing');
});
check('a missing profile degrades instead of crashing', () => {
  // The loader must be in a try/catch that leaves EGLENT_VOICE as '' — the
  // prompt then simply omits the section, exactly like learnings.md.
  assert.ok(/let EGLENT_VOICE = '';/.test(idx), 'EGLENT_VOICE has no empty default');
  assert.ok(/no knowledge\/eglent-voice\.md/.test(idx), 'there is no fallback warning');
});
check('the prompt subordinates the voice to the facts', () => {
  assert.ok(/It governs WORDING ONLY/.test(idx), 'the wording-only clause is gone');
  assert.ok(/the KNOWLEDGE BASE and the sections above\nwin, always/.test(idx), 'the precedence clause is gone');
});

console.log('\n2. His mechanics are actually specified');

const mechanics = [
  ['doubling for emphasis', /Doubling and tripling for emphasis/i],
  ['his Albanian connectives', /Me thënë drejtën/],
  ['his non-native English is preserved', /we have got/],
  ['percent is converted into euros', /convert a percentage into euros/i],
  ['the check-me-yourself move', /Hap Google-n/],
  ['his short acknowledgements', /S'ka gjë/],
  ['his sign-off', /Rrofsh/],
];
for (const [why, re] of mechanics) {
  check(`the profile specifies: ${why}`, () => assert.ok(re.test(profile), `missing: ${re}`));
}
check('the prompt itself carries the mechanics, not just the file', () => {
  assert.ok(/doubling for emphasis/.test(idx), 'the prompt lost the emphasis tic');
  assert.ok(/converted into euros in the same\n  breath/.test(idx), 'the prompt lost the euro conversion');
  assert.ok(/never write "kindly", "shall", "please be advised"/.test(idx), 'the prompt lost the anti-formal English rule');
});

console.log('\n3. What must never reach a client');

const limits = [
  ['profanity', /\*\*Profanity of any kind\*\*/],
  ['politics and corruption', /Politics, protests, government, corruption/],
  ['named competitors and countries', /negative about another country, city, developer or project by name/],
  ['people as a nationality or group', /group of people by nationality, religion or origin/],
  ['internal business numbers', /revenue, profit, how many units are sold/],
  ['his private life', /his family, his children, his age/],
  ['inventing a better deal', /no invented instalment plan/],
];
for (const [why, re] of limits) {
  check(`the profile forbids: ${why}`, () => assert.ok(re.test(profile), `missing: ${re}`));
}
check('the profile yields to the hard rules when they disagree', () => {
  assert.ok(/the rule wins and the style bends around it/.test(profile));
});
check('the only return figures in the profile are 65\\/35 and 6%', () => {
  assert.ok(/the only return figures you ever write are 65\/35 and 6%/.test(profile));
  assert.ok(!/~8%/.test(profile), 'the retired ~8% figure is back in the profile');
  assert.ok(!/8-10%|8–10%/.test(profile), 'an unapproved return range is in the profile');
});

console.log('\n4. The voice is his, the identity is not');

check('the profile never tells the agent to say it is Eglent', () => {
  assert.ok(!/Unë jam Eglent Bici|Unë quhem Eglent|My name is Eglent/.test(profile),
    'the profile contains a first-person Eglent self-introduction');
  assert.ok(/never write it about yourself/.test(profile), 'the name is not reserved to him');
  assert.ok(/Never\nclaim to be Eglent/.test(profile), 'the do-not-impersonate clause is gone');
});
check('the honest "are you a bot" answer survived the rewrite', () => {
  assert.ok(/Never claim to be a specific human being/.test(idx));
  assert.ok(/Sounding like Eglent is never claiming to BE Eglent/.test(idx));
});
check('the guard spots a first-person claim to be Eglent', () => {
  assert.ok(findIdentityClaims('Une jam Eglent Bici, mire se erdhe.').length >= 1);
  assert.ok(findIdentityClaims("Hi, I'm Eglent from Mei Residence.").length >= 1);
  assert.ok(findIdentityClaims('A212 eshte e lire.\n\n- Eglent Bici').length >= 1);
});
check('naming Eglent in the third person is still allowed', () => {
  assert.deepEqual(findIdentityClaims('Eglent ta dërgon kontratën me email para nënshkrimit.'), []);
  assert.deepEqual(findIdentityClaims('Eglent Bici konfirmon statusin e sotëm.'), []);
});

console.log('\n5. Corporate register is caught');

check('English corporate filler is flagged', () => {
  assert.ok(findRoboticPhrases('Kindly be advised that we are delighted to assist.').length >= 2);
  assert.ok(findRoboticPhrases('Rest assured, our valued client, we will revert.').length >= 2);
});
check('Albanian corporate filler is flagged', () => {
  assert.ok(findRoboticPhrases('Ju falenderojmë për interesimin tuaj.').length >= 1);
  assert.ok(findRoboticPhrases('Jemi në dispozicionin tuaj për çdo pyetje.').length >= 1);
});
check('a reply in his actual voice is not flagged', () => {
  const real = 'Po, po. A212 e kam para syve — 1+1, 52.2 m2, rreth 103,500 EUR, me pamje nga deti.\n\n'
    + 'Shiko si del: 103,500 euro me 6% të garantuar = 6,210 euro bruto në vit, rreth 517 euro në muaj, '
    + '31,050 euro në pesë vjet.\n\nMë thuaj çfarë të duhet dhe unë të përgjigjem. Rrofsh.';
  assert.deepEqual(findRoboticPhrases(real), []);
  assert.deepEqual(findIdentityClaims(real), []);
  assert.equal(tidyForHuman(real), real, 'a real reply must pass through untouched');
});

console.log('\n6. Nothing else was eaten');

check('the commercial, privacy and handoff rules are all still there', () => {
  assert.ok(/NEVER add the two together/.test(idx), 'the one-option return rule is gone');
  assert.ok(/NEVER use "up to ~8%"/.test(idx), 'the retired 8% ban is gone');
  assert.ok(/PARKING POSTS ARE NOT FOR SALE/.test(idx), 'the parking rule is gone');
  assert.ok(/NOT LEADS — NEVER call escalate_to_agent/.test(idx), 'the non-lead rule is gone');
  assert.ok(/The ONLY\s+staff name you may ever write to a client is Eglent Bici/.test(idx), 'the staff-name rule is gone');
  assert.ok(/ANSWER EVERY QUESTION THEY ASKED/.test(idx), 'the answer-in-full rule is gone');
  assert.ok(/DO NOT HAND OFF ON THE FIRST MESSAGE/.test(idx), 'the earn-the-handoff rule is gone');
  assert.ok(/BANNED IN EVERY LANGUAGE/.test(idx), 'the banned-phrase list is gone');
  assert.ok(/LANGUAGE — THE FIRST THING YOU DECIDE/.test(idx), 'the reply-in-their-language rule is gone');
});
check('every reply still goes through the voice guard', () => {
  assert.ok(/tidyForHuman\(reply/.test(idx));
});

console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nAll checks passed.\n');
process.exit(failures ? 1 : 0);
