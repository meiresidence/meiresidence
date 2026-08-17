// Regression test for the "A212" stall (17 Aug 2026).
//
// A client asked: "do you have a212 apartment available? What is price? When is
// plan to be finish? What are payment terms?" — four concrete buying questions,
// three of which the knowledge base answers. The agent replied only "A specialist
// from Mei will reach out to you shortly" and tagged the contact.
//
// This test does not call the model. It asserts the two things that made that
// reply possible are gone: (1) the data the agent needed is findable in the KB by
// unit code, and (2) the prompt no longer tells the agent that availability is
// unknown / that a handoff can replace an answer.
import fs from 'fs';

const root = new URL('../', import.meta.url);
const kb = fs.readFileSync(new URL('knowledge.md', root), 'utf8');
const index = fs.readFileSync(new URL('index.js', root), 'utf8');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failures++;
};

// --- 1. Unit lookup: can the agent resolve a unit code from the KB? ----------
// Mirrors what the model has to do: find "A212" in the inventory and read off
// typology, m2, price and status.
function lookupUnit(code) {
  const re = new RegExp(
    `^- APARTAMENT ${code}/([^\\s]+) — ([\\d.,]+) m2 — (?:([\\d.,]+) EUR — )?(FREE|SOLD|RESERVED)`,
    'im',
  );
  const m = kb.match(re);
  if (!m) return null;
  return { code, type: m[1], m2: m[2], price: m[3] || null, status: m[4] };
}

const a212 = lookupUnit('A212');
check('A212 resolves from the knowledge base', !!a212, 'unit code not found in inventory');
if (a212) {
  console.log(`      -> ${a212.code} | ${a212.type} | ${a212.m2} m2 | ${a212.price} EUR | ${a212.status}`);
  check('A212 has a typology, size, price and status', Boolean(a212.type && a212.m2 && a212.price && a212.status));
}
// A sold and a reserved unit must resolve too — those replies need a status, not a price.
check('a SOLD unit resolves', !!lookupUnit('B003'));
check('a RESERVED unit resolves', !!lookupUnit('B001'));
check('an unknown code returns nothing (no guessing)', lookupUnit('Z999') === null);

// --- 2. Completion date is answerable ---------------------------------------
check('completion date present in KB', /completion \*\*Q4 2026\*\*/i.test(kb));
check('opening date present in KB', /June 2027/i.test(kb));

// --- 3. The prompt bugs that caused the stall are gone ----------------------
check(
  'prompt no longer claims availability is unmarked',
  !/availability is not\s*\n?\s*marked/i.test(index),
  'the old line told the agent per-unit status was unknown, so it deferred every availability question',
);
check('prompt tells the agent to look up unit codes', /UNIT LOOKUP/.test(index));
check('prompt forbids a handoff-only reply', /nothing but "a specialist will reach out" is never acceptable/i.test(index));
check('prompt requires answering every answerable part first', /ANSWER EVERY PART FIRST/.test(index));
check(
  'post-escalation instruction asks for the answer, not just a promise',
  /FIRST answer every part of their question/.test(index),
);
check('payment terms stay human-only', /PAYMENT TERMS are the deliberate exception/.test(index));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
