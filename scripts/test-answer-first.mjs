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
// unknown / that a handoff can replace an answer. It also locks in the facts and
// guardrails taken from Eglent's own reply (knowledge/examples.md), and the rule
// that replies always come back in the client's own language.
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

// --- 4. Eglent's gold-standard reply is loaded and its facts are live -------
const examples = fs.readFileSync(new URL('knowledge/examples.md', root), 'utf8');

check('examples.md is wired into the prompt', /GOLD-STANDARD REPLIES/.test(index));
check('examples.md is read at startup', /knowledge\/examples\.md/.test(index));
check("Eglent's A212 reply is present verbatim", /A212 is still free and it costs 103500 Euro/.test(examples));

// Payment terms are now answerable by the agent, not deferred.
check('payment shape: 5% reservation', /5%\s*to reserve/i.test(index));
check('payment shape: ~50% at the Notary', /50%\s*on signing the agreement\s*\n?at the public Notary/i.test(index));
check('payment shape: 45% in instalments to June 2027', /45%\s*in instalments from signing until handover in\s*\n?June 2027/i.test(index));
check('only a personalised schedule still escalates', /Only a PERSONALISED schedule/.test(index));

// Both return options, presented as a choice.
check('return option (a): 65/35 Ramada pool', /65% to the owner/.test(index) && /35% to the SPV/.test(index));
check('return option (b): 6% for 5 or 10 years', /6% guaranteed on the investment amount for the first 5 years, or 10 years/.test(index));
check('the stale one-figure rule is explicitly superseded', /SUPERSEDES the\s*\n?older KNOWLEDGE BASE line/.test(index));
check('no invented return percentages', !/8-10%|up to ~8%/.test(index.replace(/NEVER use "up to ~8%", "8-10%"/, '')));

// Ownership and owner-usage facts Eglent volunteers.
check('property deed / sole owner stated', /Property\s*\nDeed from the Albanian Property Registry and is the SOLE legal owner/.test(index));
check('free owner usage stated', /1 week to 10 days in summer and 2-3 weeks off season/.test(index));

// Furnishing is unit-specific, never scaled.
check('A212 furnishing figure present', /full furnishing for A212 is \+10,400 EUR/.test(index));
check('furnishing figure is fenced to A212', /quote it ONLY for A212/.test(index));

// The one thing NOT to copy from Eglent's reply.
check('non-Mei stock is off-limits', /MEI RESIDENCE ONLY/.test(index));
check('no EUR\\/m2 quoting', /Never quote a EUR\/m2 figure/.test(index));
check('examples.md flags the nearby units as not-to-copy', /NEVER offers these/.test(examples));

// Length rule relaxed for multi-question messages.
check('long structured answers allowed when asked a lot', /LENGTH EXCEPTION/.test(index));

// --- 5. Language: always mirror the client, never the example ---------------
check('language rule is stated first and hard', /LANGUAGE — THE FIRST THING YOU DECIDE/.test(index));
check('language is judged by their words, not their number', /never by their phone country code/.test(index));
check('mid-conversation language switches are followed', /switch language mid-conversation/.test(index));
check(
  'the English examples must not drag replies into English',
  /Copy their STRUCTURE, ORDER and DEPTH — never their language/.test(index),
);
check('examples.md carries the same warning', /never the language/i.test(examples));
check(
  'Albanian is only the no-signal fallback, not the greeting default',
  /Albanian is the fallback ONLY when there is genuinely no language to read/.test(index) &&
    !/default Albanian\s*\n?for a bare greeting/.test(index),
  'a greeting is a language signal — "Hello" must get English',
);
// The instruction sits inside a single-quoted JS string, so the source contains
// CLIENT\'S with a backslash — allow it.
check("handoff reply is written in the client's language", /IN THE CLIENT\\?'S OWN LANGUAGE/.test(index));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
