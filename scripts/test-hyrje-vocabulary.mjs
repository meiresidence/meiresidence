// Regression test for the "3 hyrje" misreading (3 Sep 2026).
//
// A WhatsApp lead wrote "Jam I ntersuar pe 3 hyrje" and then "Ni pallat 3 hyrje".
// In Kosovo/diaspora usage "hyrje" means an APARTMENT, so he was asking for three
// units in the same building — the highest-value request the agent gets. Instead
// the agent asked whether he meant the 3+1 typology or "entrance no. 3", and then
// told him units are coded by letter+floor so there is no list "sipas hyrjes".
// The lead had to steer the conversation back himself.
//
// This test does not call the model. It asserts that the rule is present in the
// text that actually reaches the model at runtime: knowledge/learnings.md is
// injected into the system prompt by index.js, and the same rule is documented in
// knowledge/system-prompt.md. index.js may also carry it as a hard prompt rule —
// that copy is checked as a bonus, not required, so the two can land separately.
import fs from 'fs';

const root = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const learnings = read('knowledge/learnings.md');
const promptDoc = read('knowledge/system-prompt.md');
const index = read('index.js');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failures++;
};
const note = (name, ok) => console.log(`${ok ? 'PASS' : 'NOTE'}  ${name}${ok ? '' : ' (not present — optional)'}`);

// 1. knowledge/learnings.md — this is the copy that reaches the live prompt.
check('learnings.md: dedicated vocabulary section exists',
  /## How to read what clients write/i.test(learnings));
check('learnings.md: "hyrje" is defined as an apartment',
  /"Hyrje" means an apartment, not a building entrance/i.test(learnings));
check('learnings.md: "3 hyrje" is spelled out as three apartments',
  /"3 hyrje"\s*=\s*three apartments/i.test(learnings));
check('learnings.md: forbids reading it as the 3± typology',
  /never as the 3\+1 typology/i.test(learnings));
check('learnings.md: forbids the "sipas hyrjes" brush-off',
  /sipas hyrjes/i.test(learnings));
check('learnings.md: forbids asking the client what "hyrje" means',
  /not\*{0,2} ask what they mean by "hyrje"/i.test(learnings));
check('learnings.md: "banese" is covered too',
  /Banesë.*likewise means apartment/i.test(learnings));
check('learnings.md: multi-unit requests get their own rule',
  /multi-unit request is the hottest lead/i.test(learnings));
check('learnings.md: multi-unit requests escalate immediately',
  /escalate immediately with the number of units/i.test(learnings));
check('learnings.md: the handoff-timing rule is waived for multi-unit',
  /does not apply to a multi-unit request/i.test(learnings));
check('learnings.md: the real conversation is recorded',
  /Ni pallat 3 hyrje/.test(learnings));

// 2. knowledge/system-prompt.md — the documented prompt copy stays in sync.
check('system-prompt.md carries the vocabulary section',
  /hyrje" means an apartment/i.test(promptDoc));
check('system-prompt.md carries the multi-unit rule',
  /Multi-unit buyers are the hottest lead/i.test(promptDoc));

// 3. index.js — optional hard-rule copy in the inline prompt.
note('index.js carries the CLIENT VOCABULARY hard rule', /HYRJE" MEANS AN APARTMENT/i.test(index));
note('index.js carries the MULTI-UNIT BUYERS hard rule', /MULTI-UNIT BUYERS/i.test(index));

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll required checks passed.');
process.exit(failures ? 1 : 0);
