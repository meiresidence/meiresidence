// "Make the agent proactive" (2026-10-07): when a lead SHOWS INTEREST — a price, a
// unit, the payment, the plan, a visit — the agent gives exactly what was asked and
// then asks back, like a person. Not on every reply: "just when the person shows
// interest. This is the key point." No API key, no network.
//
// Run: node scripts/test-proactive.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  trailingQuestion, endsWithQuestion, isAckOnly, findGenericFollowups, interestSignals,
  questionsAlreadyAsked, proactiveNote, checkProactive,
} from '../src/proactive.js';

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`); }
};

const index = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const voice = fs.readFileSync(new URL('../knowledge/eglent-voice.md', import.meta.url), 'utf8');

console.log('\nthe prompt');
test('the BE PROACTIVE rule is in the live prompt, scoped to interest', () => {
  assert.match(index, /BE PROACTIVE WHEN THEY SHOW INTEREST — ANSWER, THEN ASK BACK LIKE A PERSON/);
  assert.match(index, /NOT on every message:\s+only when THIS message shows interest/);
});
test('no interest -> answer and stop; a thank-you still gets just "Rrofsh."', () => {
  assert.match(index, /NO INTEREST IN THIS MESSAGE → ANSWER AND STOP, no question back/);
  assert.match(index, /A "faleminderit" gets "Rrofsh\." and nothing else\./);
  assert.match(index, /When they show no interest, answering\s+and stopping is the human thing/);
});
test('order: answer, then the investment line, then the question as the very last line', () => {
  assert.match(index, /VERY LAST LINE, one short question back/);
  assert.match(index, /it goes right BEFORE that\s+question/);
});
test('generic form-letter questions are banned by name', () => {
  for (const p of ['A keni ndonjë\n  pyetje tjetër?', 'Is there anything else I can help you with?', 'Let me know if you have any questions']) {
    assert.ok(index.replace(/\s+/g, ' ').includes(p.replace(/\s+/g, ' ')), p);
  }
});
test('no pressure: never a reserve-today push, never a second question', () => {
  assert.match(index, /ONE question, never two, never a questionnaire\. No pressure/);
});
test('the times NOT to ask are kept: STOP, already bought, final no, non-lead', () => {
  const block = index.slice(index.indexOf('BE PROACTIVE WHEN'), index.indexOf('DO NOT HAND OFF ON THE FIRST MESSAGE'));
  for (const w of ['STOP', 'ALREADY BOUGHT', 'NOT INTERESTED', 'non-lead']) assert.ok(block.includes(w), w);
});
test('guessing at motives is still forbidden (the never-talk-down rule stands)', () => {
  assert.match(index, /Guessing at their REASONS or motives is still forbidden/);
  assert.match(index, /NEVER offer them a forced choice between two guesses/);
});
test('hard rules untouched: one return option or the other, parking not for sale, Eglent the only name', () => {
  assert.match(index, /65\/35 rental pool or the 6% guaranteed — their choice/);
  assert.match(index, /The ONLY\s+staff name you may ever write to a client is Eglent Bici/);
  assert.doesNotMatch(index.slice(index.indexOf('BE PROACTIVE WHEN'), index.indexOf('DO NOT HAND OFF ON THE FIRST MESSAGE')), /8%/);
});
test("Eglent's voice profile says he asks back", () => {
  assert.match(voice, /when they show interest, he never answers and goes quiet/);
});

console.log('\nreading a reply');
test('a reply ending on a question is recognised, links and emoji included', () => {
  assert.equal(endsWithQuestion('A212 — 52.2 m², 103,500 €.\n\nSi të duket, të intereson ky? 🙂'), true);
  assert.equal(endsWithQuestion('Plani: https://app.screencast.com/abc?x=1\n\nTa dërgoj edhe 3D-në?'), true);
});
test('a reply that answers and stops is recognised, even with a ? inside a link', () => {
  assert.equal(endsWithQuestion('Plani: https://app.screencast.com/abc?x=1'), false);
  assert.equal(endsWithQuestion('Po, A212 është e lirë, 103,500 €.'), false);
});
test('the trailing question is the last sentence that asks something', () => {
  assert.equal(trailingQuestion('A212 është e lirë. Çmimi 103,500 €. Ta dërgoj planimetrinë?'), 'Ta dërgoj planimetrinë?');
  assert.equal(trailingQuestion('Asnjë pyetje këtu.'), '');
});
test('acknowledgements are not questions to answer', () => {
  for (const t of ['ok', 'Faleminderit!', 'flm', '👍', 'Thanks', 'rrofsh 🙏']) assert.equal(isAckOnly(t), true, t);
  for (const t of ['Sa kushton një 1+1?', 'Çmimi', 'ok, po 2+1?']) assert.equal(isAckOnly(t), false, t);
});
test('generic form-letter questions are caught in sq / en / de', () => {
  assert.ok(findGenericFollowups('A keni ndonjë pyetje tjetër?').length);
  assert.ok(findGenericFollowups('Let me know if you have any questions.').length);
  assert.ok(findGenericFollowups('Is there anything else I can help you with?').length);
  assert.ok(findGenericFollowups('Haben Sie noch Fragen?').length);
  assert.equal(findGenericFollowups('Ta dërgoj edhe planimetrinë e A212?').length, 0);
});

console.log('\nwhat counts as interest');
test('buying signals are spotted in Albanian and the other lead languages', () => {
  const cases = {
    'Sa kushton një 1+1?': 'price',
    'A është ende e lirë A212?': 'availability',
    'Ma dërgo planimetrinë': 'plan',
    'Si bëhet pagesa, me këste?': 'payment',
    'Sa fitim jep në vit?': 'return',
    'Dua të vij ta shoh nga afër': 'visit',
    'Kur dorëzohet?': 'handover',
    'Jam i interesuar, buxheti im është 100 mijë': 'intent',
    'How much is a 2+1 with sea view?': 'price',
    'Quanto costa il duplex?': 'price',
    'Ile kosztuje apartament?': 'price',
    'Is B104 still available?': 'availability',
  };
  for (const [msg, sig] of Object.entries(cases)) assert.ok(interestSignals(msg).includes(sig), `${msg} -> ${interestSignals(msg)}`);
});
test('no interest: thanks, ok, small talk, curiosity, a decline, STOP', () => {
  for (const msg of ['Faleminderit', 'ok', '👍', 'Si je?', 'Çfarë është kjo?', 'Where is it?', 'Mirëmëngjes',
    'Nuk jam i interesuar për momentin', 'Not interested, thanks', 'STOP', 'Mos më shkruani më']) {
    assert.deepEqual(interestSignals(msg), [], msg);
  }
});

console.log('\nthe check after generation (logs only, never rewrites)');
test('a price answer with no question back is flagged', () => {
  const f = checkProactive('A212 — 52.2 m², 103,500 €, e lirë.', { contactId: 't1', clientText: 'Sa kushton A212?' });
  assert.ok(f.some((x) => x.includes('answered without asking anything back')), JSON.stringify(f));
});
test('a question tacked onto a reply with no interest is flagged', () => {
  const f = checkProactive('Mirë jam, faleminderit! Ti si je? A të intereson ndonjë apartament?', { contactId: 't6', clientText: 'Si je?' });
  assert.ok(f.some((x) => x.includes('no buying signal')), JSON.stringify(f));
});
test('a curious question answered and left there is clean', () => {
  assert.deepEqual(checkProactive('Mei Residence është në Qerret, Durrës, 280 m nga deti.', { contactId: 't7', clientText: 'Çfarë është kjo?' }), []);
});
test('a price answer that asks back is clean', () => {
  const f = checkProactive('A212 — 52.2 m², 103,500 €, e lirë.\n\nSi të duket, të intereson?', { contactId: 't2', clientText: 'Sa kushton A212?' });
  assert.deepEqual(f, []);
});
test('a generic closing question is flagged even though it is a question', () => {
  const f = checkProactive('A212 — 103,500 €.\n\nA keni ndonjë pyetje tjetër?', { contactId: 't3', clientText: 'Sa kushton A212?' });
  assert.ok(f.some((x) => x.startsWith('generic follow-up')), JSON.stringify(f));
});
test('a "thanks" from the client is never flagged for having no question back', () => {
  assert.deepEqual(checkProactive('Rrofsh.', { contactId: 't4', clientText: 'Faleminderit' }), []);
});
test('the degraded holding line is never judged', () => {
  assert.deepEqual(checkProactive('Nje koleg do t\'ju pergjigjet.', { contactId: 't5', clientText: 'Sa kushton?', degraded: true }), []);
});

console.log('\nnever ask the same thing twice');
const THREAD = {
  history: [
    { role: 'user', content: 'Pershendetje, sa kushton nje 1+1?' },
    { role: 'assistant', content: '1+1 nis nga 93,200 €.\n\nPër investim e ke në mendje, apo për ta përdorur vetë?' },
    { role: 'user', content: 'Investim' },
    { role: 'assistant', content: 'Shumë mirë. B104 — 93,200 €. Plani: https://app.screencast.com/x?y=1\n\nTa dërgoj edhe sa sjell në vit?' },
  ],
  lastOutboundBody: 'Shumë mirë. B104 — 93,200 €. Plani: https://app.screencast.com/x?y=1\n\nTa dërgoj edhe sa sjell në vit?',
};
test('the questions already asked are read off the thread, newest last, no duplicates', () => {
  assert.deepEqual(questionsAlreadyAsked(THREAD), [
    'Për investim e ke në mendje, apo për ta përdorur vetë?',
    'Ta dërgoj edhe sa sjell në vit?',
  ]);
});
test('the context note flags the buying signal in this message', () => {
  assert.match(proactiveNote({ ...THREAD, text: 'Sa kushton A110?' }), /Buying signal in this message: price, unit/);
});
test('the context note says answer-and-stop when there is no signal', () => {
  assert.match(proactiveNote({ ...THREAD, text: 'Faleminderit' }), /No buying signal spotted in this message/);
});
test('the context note tells the model not to repeat them', () => {
  const note = proactiveNote(THREAD);
  assert.match(note, /Never ask any of these again/);
  assert.ok(note.includes('Ta dërgoj edhe sa sjell në vit?'));
});
test('a first contact gets no list of earlier questions', () => {
  assert.doesNotMatch(proactiveNote({ history: [], text: 'Sa kushton?' }), /already asked/);
});
test('the note and the check are wired into index.js', () => {
  assert.match(index, /const asked = proactiveNote\(thread\);/);
  assert.match(index, /checkProactive\(reply, \{ contactId, clientText: text, degraded: !!failReason \}\);/);
});

if (failures) { console.error(`\n${failures} check(s) failed.`); process.exit(1); }
console.log('\nall proactive checks passed');
