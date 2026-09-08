// Locks in the human-voice work of 2026-09-08.
//
// Three things are checked, none of which needs an API key:
//   1. delivery  — a reply is split into chat-sized bubbles, never inside a list,
//                  never a stub, never over the channel limit, never losing text;
//                  and it is paced with a pause before each bubble, inside budget.
//   2. memory    — what the client already told us is read off the thread and turned
//                  into a "don't ask this again" note.
//   3. voice     — stock call-centre phrasing is detected, dead greeting lines are
//                  removed, real greetings are not; and the prompt still carries both
//                  the new human rules AND every hard rule they must not have eaten.
//
// Run: node scripts/test-human-voice.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitIntoBubbles, typingDelayMs, pacingPlan, TOTAL_DELAY_MAX_MS } from '../src/human-send.js';
import { extractKnownFacts, recallNote } from '../src/recall.js';
import { findRoboticPhrases, stripDeadOpener, tidyForHuman } from '../src/voice.js';

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`); }
};

console.log('\n1. Delivery — bubbles and pacing');

const shortReply = 'Po, A212 është ende e lirë. 1+1, 52.2 m2, rreth 103,500 EUR, me pamje nga deti.';
check('a short reply stays one message', () => {
  assert.equal(splitIntoBubbles(shortReply).length, 1);
});

const longReply = [
  'Po, e kam A212 para syve — 1+1, 52.2 m2, rreth 103,500 EUR, me pamje nga deti dhe aktualisht e lirë. Eglenti konfirmon statusin e sotëm.',
  'Ja plani i katit: https://app.screencast.com/abc123 — dhe plani 3D: https://mei-tour.netlify.app/a212/',
  'Për pagesën funksionon kështu:\n1) 5% për rezervim, online\n2) rreth 50% te noteri\n3) 45% me këste deri në dorëzim, qershor 2027',
  'Mei Residence blihet si investim: apartamenti jepet me qira dhe menaxhohet nga Ramada Residences by Wyndham, ndërsa ti mbetesh pronar me akt pronësie.',
].join('\n\n');

check('a long reply becomes several bubbles', () => {
  const b = splitIntoBubbles(longReply);
  assert.ok(b.length >= 2 && b.length <= 4, `got ${b.length} bubbles`);
});
check('no character is lost or duplicated', () => {
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  assert.equal(norm(splitIntoBubbles(longReply).join(' ')), norm(longReply));
});
check('a numbered list is never split across bubbles', () => {
  for (const b of splitIntoBubbles(longReply)) {
    const items = (b.match(/^\s*\d\)/gm) || []).length;
    assert.ok(items === 0 || items === 3, `list broken across bubbles: ${b.slice(0, 60)}`);
  }
});
check('no bubble is a stub', () => {
  const b = splitIntoBubbles(longReply);
  assert.ok(b.slice(1).every((x) => x.length >= 40), 'stub bubble');
});
check('the channel limit still holds for a huge answer', () => {
  const huge = Array.from({ length: 60 }, (_, i) => `Pika ${i + 1}. ${'x'.repeat(200)}`).join('\n\n');
  assert.ok(splitIntoBubbles(huge).every((b) => b.length <= 3500));
});
check('empty text sends nothing', () => {
  assert.deepEqual(splitIntoBubbles('   '), []);
});
check('the first bubble waits, later ones wait less', () => {
  const fixed = () => 0.5;
  assert.ok(typingDelayMs('Po, është e lirë.', 0, fixed) > typingDelayMs('Po, është e lirë.', 1, fixed));
});
check('a long bubble takes longer to "type" than a short one', () => {
  const fixed = () => 0.5;
  assert.ok(typingDelayMs('x'.repeat(400), 1, fixed) > typingDelayMs('ok', 1, fixed));
});
check('total pacing stays inside the budget', () => {
  const b = splitIntoBubbles(longReply);
  const total = pacingPlan(b, () => 1).reduce((a, x) => a + x, 0);
  assert.ok(total <= TOTAL_DELAY_MAX_MS, `${total}ms > ${TOTAL_DELAY_MAX_MS}ms`);
});
check('HUMAN_PACING=off restores instant single-message sending', () => {
  process.env.HUMAN_PACING = 'off';
  assert.equal(splitIntoBubbles(longReply).length, 1);
  assert.equal(typingDelayMs(longReply, 0), 0);
  delete process.env.HUMAN_PACING;
});

console.log('\n2. Memory — what they already told us');

const thread = {
  text: 'Po, më intereson A212. A ka pamje nga deti?',
  lastOutboundBody: 'Ja plani: https://app.screencast.com/abc123',
  history: [
    { role: 'user', content: 'Pershendetje, sa kushton nje 1+1?' },
    { role: 'assistant', content: 'Nje 1+1 fillon rreth 93,200 EUR. Ja plani 3D: https://mei-tour.netlify.app' },
    { role: 'user', content: 'Buxheti im eshte rreth 110,000 EUR' },
    { role: 'assistant', content: [{ type: 'text', text: 'E kuptoj. Ja plani: https://app.screencast.com/abc123' }] },
  ],
};
const facts = extractKnownFacts(thread, thread.text);

check('the typology they named is remembered', () => assert.deepEqual(facts.typologies, ['1+1']));
check('the budget they named is remembered', () => assert.ok(/110[.,]000/.test(facts.budgets.join(' '))));
check('the unit code is picked up from the latest message', () => assert.ok(facts.unitCodes.includes('A212')));
check('links we already sent are remembered', () => {
  assert.ok(facts.linksSent.some((l) => l.includes('screencast')));
  assert.ok(facts.linksSent.some((l) => l.includes('mei-tour')));
});
check('assistant turns with content blocks are read too', () => assert.equal(facts.ourOpeners.length, 2));
check('the note tells the model not to re-ask', () => {
  const note = recallNote(facts);
  assert.match(note, /never ask again which typology/i);
  assert.match(note, /never ask again/i);
  assert.match(note, /do not send the same link again/i);
  assert.match(note, /open differently/i);
});
check('a brand-new contact produces no note', () => {
  assert.equal(recallNote(extractKnownFacts({ history: [] }, 'Pershendetje')), '');
});

console.log('\n3. Voice — stock phrasing and dead openers');

check('call-centre phrasing is detected in Albanian and English', () => {
  assert.ok(findRoboticPhrases('Faleminderit për mesazhin! Si mund t\'ju ndihmoj?').length >= 2);
  assert.ok(findRoboticPhrases('Thank you for your message. How may I assist you today?').length >= 2);
  assert.ok(findRoboticPhrases('I cannot view the image you sent.').length >= 1);
});
check('a real answer is not flagged', () => {
  assert.deepEqual(findRoboticPhrases('Po, A212 është e lirë — 52.2 m2, rreth 103,500 EUR.'), []);
});
check('a dead greeting line is dropped', () => {
  assert.equal(stripDeadOpener('Përshëndetje!\nA212 është e lirë.'), 'A212 është e lirë.');
});
check('a greeting with the client\'s name is kept', () => {
  const t = 'Përshëndetje Mimoza!\nA212 është e lirë.';
  assert.equal(stripDeadOpener(t), t);
});
check('a one-line reply is never emptied', () => {
  assert.equal(stripDeadOpener('Përshëndetje!'), 'Përshëndetje!');
});
check('the degraded holding line is left exactly as written', () => {
  const holding = 'Faleminderit për mesazhin — një koleg do t\'ju përgjigjet së shpejti.';
  assert.equal(tidyForHuman(holding, { degraded: true }), holding);
});

console.log('\n4. The prompt — new rules present, hard rules intact');

const idx = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const has = (needle, why) => check(why, () => assert.ok(idx.includes(needle), `missing: ${needle}`));

has('HOW YOU WRITE — LIKE A PERSON TYPING ON A PHONE', 'the human-voice section is in the prompt');
has("BANNED IN EVERY LANGUAGE", 'the banned-phrase list is in the prompt');
has("WHEN THE MESSAGE ISN'T A NORMAL QUESTION", 'voice notes, photos, jokes and "are you a bot" are covered');
has('USE WHAT THEY HAVE ALREADY TOLD YOU', 'the do-not-re-ask rule is in the prompt');
has('Never claim to be a specific human being', 'the agent may not impersonate a person');

check('the hard commercial rules survived the rewrite', () => {
  assert.ok(/NEVER add the two together/.test(idx), 'the one-option return rule is gone');
  assert.ok(/NEVER use "up to ~8%"/.test(idx), 'the retired 8% ban is gone');
  assert.ok(/PARKING POSTS ARE NOT FOR SALE/.test(idx), 'the parking rule is gone');
  assert.ok(/NOT LEADS — NEVER call escalate_to_agent/.test(idx), 'the non-lead rule is gone');
  assert.ok(/The ONLY\s+staff name you may ever write to a client is Eglent Bici/.test(idx), 'the staff-name rule is gone');
  assert.ok(/ANSWER EVERY QUESTION THEY ASKED/.test(idx), 'the answer-in-full rule is gone');
});
check('the old instant single-block sender is gone', () => {
  assert.ok(!/const parts = splitMessage\(message, MAX_MESSAGE_CHARS\)/.test(idx));
  assert.ok(/splitIntoBubbles\(message\)/.test(idx));
});
check('every reply goes through the voice guard', () => {
  assert.ok(/tidyForHuman\(reply/.test(idx));
});

console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nAll checks passed.\n');
process.exit(failures ? 1 : 0);
