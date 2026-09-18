// Locks in the owner channel (9 Sep 2026).
//
// Eglent (+355 67 204 9400) and Mea (+355 68 517 1265) teach the agent by
// messaging it on WhatsApp. What they send becomes a standing rule that every
// future client conversation reads. What is checked here, with no API key and
// no network:
//
//   1. identity   — both numbers resolve in every spelling; a client does not,
//                   and OWNER_MODE=off turns them back into ordinary contacts.
//   2. store      — rules round-trip through the note format, survive parsing,
//                   revoke without being deleted, and render into a prompt block.
//   3. guardrails — an instruction touching a hard rule is NOT saved before the
//                   owner confirms; the two absolute rules are refused outright;
//                   an ordinary rule saves straight through.
//   4. wiring     — index.js branches to the owner path before any lead
//                   handling, appends the rules AFTER the cache breakpoint, and
//                   the follow-up ladder skips owners.
//
// Run: node scripts/test-owner-channel.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { identifyOwner, normalizePhone, owners } from '../src/owner.js';
import { createInstructionStore, formatRule, parseRule, renderBlock, RULE_MARK } from '../src/instructions.js';
import { absoluteBreaches, conflictingRules, HARD_RULES, ABSOLUTE_RULES } from '../src/hard-rules.js';
import { OWNER_TOOLS, ownerSystemPrompt } from '../src/owner-mode.js';

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`); }
};
const acheck = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`); }
};

const INDEX = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const FOLLOWUP = fs.readFileSync(new URL('./followup-run.mjs', import.meta.url), 'utf8');

console.log('\n1. Who is an owner');

for (const spelling of ['+355672049400', '+355 67 204 9400', '355672049400', '0672049400', '067 204 9400']) {
  check(`Eglent recognised as "${spelling}"`, () => {
    assert.equal(identifyOwner({ phone: spelling })?.name, 'Eglent');
  });
}
for (const spelling of ['+355685171265', '0685171265', '+355 68 517 1265']) {
  check(`Mea recognised as "${spelling}"`, () => {
    assert.equal(identifyOwner({ phone: spelling })?.name, 'Mea');
  });
}
check('Eglent recognised by his CRM contact id, with no phone', () => {
  assert.equal(identifyOwner({ contactId: 'U8zP6NNBfCVVvK6LBWe3' })?.name, 'Eglent');
});
check('a real client number is NOT an owner', () => {
  assert.equal(identifyOwner({ phone: '+355692300351' }), null);
  assert.equal(identifyOwner({ contactId: 'rso1tDZ8UfmYiwQYahGy' }), null);
});
check('a near-miss number is not an owner', () => {
  assert.equal(identifyOwner({ phone: '+355672049401' }), null);
});
check('empty input is never an owner', () => {
  assert.equal(identifyOwner({}), null);
  assert.equal(identifyOwner({ phone: '', contactId: '' }), null);
  assert.equal(normalizePhone(''), '');
});
check('OWNER_MODE=off makes them ordinary contacts again', () => {
  assert.equal(identifyOwner({ phone: '+355672049400' }, { OWNER_MODE: 'off' }), null);
});
check('OWNER_NUMBERS replaces the defaults without a deploy', () => {
  const env = { OWNER_NUMBERS: '+355699999999:Test' };
  assert.equal(identifyOwner({ phone: '0699999999' }, env)?.name, 'Test');
  assert.equal(identifyOwner({ phone: '+355672049400' }, env), null);
  assert.equal(owners(env).length, 1);
});

console.log('\n2. The note format round-trips');

const sample = { n: 7, at: '2026-09-09T15:04:00Z', by: 'Eglent', status: 'active', overrides: [], text: 'Gjithmonë pyet për buxhetin para se të dërgosh njësi.' };

check('format -> parse is lossless', () => {
  const back = parseRule(formatRule(sample), 'note1');
  assert.equal(back.n, 7);
  assert.equal(back.by, 'Eglent');
  assert.equal(back.status, 'active');
  assert.equal(back.text, sample.text);
});
check('an override key survives the round trip', () => {
  const back = parseRule(formatRule({ ...sample, overrides: ['returns', 'prices'] }));
  assert.deepEqual(back.overrides, ['returns', 'prices']);
});
check('a multi-line rule keeps its line breaks', () => {
  const back = parseRule(formatRule({ ...sample, text: 'Rregull:\nrreshti dy.' }));
  assert.equal(back.text, 'Rregull:\nrreshti dy.');
});
check('an ordinary CRM note is not mistaken for a rule', () => {
  assert.equal(parseRule('Called the client, wants a 2+1.'), null);
  assert.equal(parseRule(''), null);
  assert.equal(parseRule(`${RULE_MARK} malformed header`), null);
});
check('a header with no rule body is rejected', () => {
  assert.equal(parseRule(`${RULE_MARK} #3 | 2026-09-09T00:00:00Z | by: Mea | status: active\n   `), null);
});

console.log('\n3. The block handed to the model');

const block = renderBlock([
  { ...sample, n: 1, text: 'Gjithmonë pyet për buxhetin.' },
  { ...sample, n: 2, by: 'Mea', text: 'Mos dërgo më shumë se 3 njësi njëherësh.' },
  { ...sample, n: 3, status: 'revoked', text: 'Rregull i hequr.' },
]);
check('active rules are in, numbered, with who gave them', () => {
  assert.match(block, /1\. \[Eglent\] Gjithmonë pyet për buxhetin\./);
  assert.match(block, /2\. \[Mea\] Mos dërgo më shumë se 3 njësi njëherësh\./);
});
check('a revoked rule never reaches the model', () => {
  assert.ok(!block.includes('Rregull i hequr'));
});
check('the block tells the model the instruction wins on a conflict', () => {
  assert.match(block, /THE INSTRUCTION WINS/);
});
check('the block keeps the two absolutes whatever a rule says', () => {
  assert.match(block, /never claim to BE a named/i);
  assert.match(block, /another client's name/i);
});
check('the block forbids quoting the rules to a client', () => {
  assert.match(block, /Never quote them/i);
});
check('no active rules means no block at all', () => {
  assert.equal(renderBlock([]), '');
  assert.equal(renderBlock([{ ...sample, status: 'revoked' }]), '');
});

console.log('\n4. Hard rules and the two absolutes');

check('a return figure is flagged as touching a hard rule', () => {
  assert.deepEqual(conflictingRules('Thuaj që kthimi është 9% në vit'), ['returns']);
});
check('a discount instruction is flagged', () => {
  assert.ok(conflictingRules('Jep 10% zbritje për këdo që pyet').includes('prices'));
});
check('an ordinary instruction is not flagged', () => {
  assert.deepEqual(conflictingRules('Gjithmonë pyet për buxhetin para se të dërgosh njësi'), []);
  assert.deepEqual(conflictingRules('Bëhu më i shkurtër në përgjigje'), []);
});
check('"pretend you are Eglent" is an absolute breach', () => {
  assert.equal(absoluteBreaches('Thuaj që je Eglenti, mos thuaj që je bot')[0].key, 'not-a-human');
});
check('"send them the other client\'s number" is an absolute breach', () => {
  assert.equal(absoluteBreaches('Jep numrin e klientit tjetër që e rezervoi')[0].key, 'other-clients');
});
check('an ordinary instruction breaches nothing', () => {
  assert.deepEqual(absoluteBreaches('Gjithmonë pyet për buxhetin'), []);
});
check('every hard rule has a key, a description and a test', () => {
  for (const r of [...HARD_RULES, ...ABSOLUTE_RULES]) {
    assert.ok(r.key && r.what && r.test instanceof RegExp, `incomplete rule: ${r.key}`);
  }
  for (const r of ABSOLUTE_RULES) assert.ok(r.why && r.instead, `absolute rule ${r.key} needs why + instead`);
});

console.log('\n5. The store, against a fake CRM');

function fakeGhl() {
  const notes = [];
  let id = 0;
  const calls = [];
  const fn = async (path, method, body) => {
    calls.push(`${method} ${path}`);
    if (method === 'GET' && /\/notes$/.test(path)) return { ok: true, data: { notes: [...notes] } };
    if (method === 'POST' && /\/notes$/.test(path)) {
      const note = { id: `n${++id}`, body: body.body };
      notes.push(note);
      return { ok: true, data: { note } };
    }
    if (method === 'PUT' && /\/notes\//.test(path)) {
      const noteId = path.split('/').pop();
      const found = notes.find((n) => n.id === noteId);
      if (!found) return { ok: false, data: { message: 'not found' } };
      found.body = body.body;
      return { ok: true, data: { note: found } };
    }
    return { ok: false, data: { message: `unexpected ${method} ${path}` } };
  };
  return { fn, notes, calls };
}

await acheck('a rule saves, numbers from 1, and comes back active', async () => {
  const { fn } = fakeGhl();
  const store = createInstructionStore({ ghl: fn, contactId: 'C1' });
  const saved = await store.save({ text: 'Gjithmonë pyet për buxhetin.', by: 'Eglent' });
  assert.equal(saved.n, 1);
  const rules = await store.load({ force: true });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].status, 'active');
  assert.equal(rules[0].by, 'Eglent');
});

await acheck('numbers keep counting up across owners', async () => {
  const { fn } = fakeGhl();
  const store = createInstructionStore({ ghl: fn, contactId: 'C1' });
  await store.save({ text: 'Rregulli i parë.', by: 'Eglent' });
  const second = await store.save({ text: 'Rregulli i dytë.', by: 'Mea' });
  assert.equal(second.n, 2);
});

await acheck('a new rule is live immediately — the cache does not hide it', async () => {
  const { fn } = fakeGhl();
  const store = createInstructionStore({ ghl: fn, contactId: 'C1' });
  await store.block(); // warm the cache with an empty store
  await store.save({ text: 'Mos dërgo më shumë se 3 njësi.', by: 'Mea' });
  assert.match(await store.block(), /Mos dërgo më shumë se 3 njësi/);
});

await acheck('revoke keeps the note as history and drops it from the block', async () => {
  const { fn, notes } = fakeGhl();
  const store = createInstructionStore({ ghl: fn, contactId: 'C1' });
  await store.save({ text: 'Rregull i vjetër.', by: 'Eglent' });
  const gone = await store.revoke(1, 'Eglent');
  assert.equal(gone.n, 1);
  assert.equal(notes.length, 1, 'the note must not be deleted');
  assert.match(notes[0].body, /status: revoked/);
  assert.equal(await store.block(), '');
});

await acheck('revoking a number that is not there returns null, not an error', async () => {
  const { fn } = fakeGhl();
  const store = createInstructionStore({ ghl: fn, contactId: 'C1' });
  assert.equal(await store.revoke(9, 'Mea'), null);
});

await acheck('a CRM outage falls back to the committed file, never to nothing', async () => {
  const fallback = formatRule({ n: 4, at: '2026-09-09T00:00:00Z', by: 'Eglent', status: 'active', overrides: [], text: 'Rregulli nga file.' });
  const store = createInstructionStore({
    ghl: async () => ({ ok: false, data: { message: 'Invalid JWT' } }),
    contactId: 'C1',
    fallbackText: fallback,
  });
  assert.match(await store.block(), /Rregulli nga file/);
});

await acheck('a total outage with no file still returns a block, never throws', async () => {
  const store = createInstructionStore({ ghl: async () => { throw new Error('network down'); }, contactId: 'C1' });
  assert.equal(await store.block(), '');
});

console.log('\n6. The owner-mode prompt and tools');

check('the three tools exist with the right names', () => {
  assert.deepEqual(OWNER_TOOLS.map((t) => t.name).sort(), ['list_instructions', 'revoke_instruction', 'save_instruction']);
});
check('save_instruction carries the confirmation flag', () => {
  const save = OWNER_TOOLS.find((t) => t.name === 'save_instruction');
  assert.ok(save.input_schema.properties.confirmed);
  assert.ok(save.input_schema.properties.overrides);
  assert.deepEqual(save.input_schema.required, ['instruction']);
});
const ownerPrompt = ownerSystemPrompt({ ownerName: 'Eglent' });
check('the prompt separates an instruction from a test question', () => {
  assert.match(ownerPrompt, /A QUESTION OR A TEST/);
  assert.match(ownerPrompt, /save nothing/i);
});
check('the prompt asks once when it cannot tell', () => {
  assert.match(ownerPrompt, /Ta ruaj si rregull\?/);
});
check('the prompt requires a confirmation before a hard-rule override', () => {
  assert.match(ownerPrompt, /you must NOT save it yet/);
  assert.match(ownerPrompt, /confirmed: true/);
});
check('the prompt lists what can never be overridden', () => {
  assert.match(ownerPrompt, /NEVER, WHATEVER THEY SEND/);
});
check('the owner is never treated as a lead', () => {
  assert.match(ownerPrompt, /never treat them as a lead/i);
  assert.match(ownerPrompt, /no\s+investment pitch/i);
});
check('the prompt names the owner it is talking to', () => {
  assert.match(ownerSystemPrompt({ ownerName: 'Mea' }), /talking to Mea/);
});

console.log('\n7. Wiring in the live agent');

check('index.js checks for an owner before any lead handling', () => {
  const ownerAt = INDEX.indexOf('const owner = identifyOwner(');
  // Compare against the WEBHOOK's own lead handling, not the import lines.
  const boughtAt = INDEX.indexOf('await tagContact(contactId, [BOUGHT_TAG]');
  const handoffAt = INDEX.indexOf('await retryDeferredHandoff(');
  const generateAt = INDEX.indexOf('await generateReply(conv, contactId)');
  assert.ok(ownerAt > 0, 'no owner branch in the webhook');
  for (const [label, at] of [['bought', boughtAt], ['handoff', handoffAt], ['generateReply', generateAt]]) {
    assert.ok(at > 0, `could not find the ${label} step to compare against`);
    assert.ok(ownerAt < at, `the owner branch must come before ${label}`);
  }
});
check('the owner branch returns before the client path', () => {
  assert.match(INDEX, /if \(owner\) \{[\s\S]{0,1600}return res\.status\(200\)\.json\(\{ reply: ownerReply/);
});
check('an owner failure says nothing was saved, rather than going quiet', () => {
  assert.match(INDEX, /asgjë nuk u ruajt/);
});
check('the thread carries the phone, so a number identifies the owner', () => {
  assert.match(INDEX, /phone: conversation\.phone \|\| ''/);
});
check('standing rules are appended to the context note, not the cached prompt', () => {
  assert.match(INDEX, /const standing = await instructions\.block\(\);/);
  assert.match(INDEX, /conv\.contextNote = `\$\{conv\.contextNote\}/);
  assert.ok(!/SYSTEM_PROMPT[^\n]*instructions\.block/.test(INDEX), 'rules must never go in the cached system prompt');
});
check('a hard-rule override is refused until it is confirmed', () => {
  assert.match(INDEX, /NOT SAVED YET/);
  assert.match(INDEX, /args\.confirmed !== true/);
});
check('an absolute breach is refused outright and never softened', () => {
  assert.match(INDEX, /NOT SAVED and it will not be saved/);
  assert.match(INDEX, /do not save a softer version/);
});
check('a store failure never claims the rule was saved', () => {
  assert.match(INDEX, /Never claim it was saved/);
});
check('the follow-up ladder skips owners', () => {
  assert.match(FOLLOWUP, /identifyOwner\(\{ contactId: c\.contactId, phone: c\.phone \}\)/);
  assert.match(FOLLOWUP, /owner channel, never followed up/);
});

console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n');
process.exit(failures ? 1 : 0);
