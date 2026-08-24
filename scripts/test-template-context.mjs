// Regression test for the 2026-08-24 "template reply gets a clueless answer"
// failure. Contact Mimoza was sent the Albanian re-engagement template as a bulk
// WhatsApp send, replied three times in six seconds, and got back an English
// "I can't view the image/content itself — could you tell me what you'd like to
// know?" — the agent had never seen the template it was replying to.
//
// Run: node scripts/test-template-context.mjs
import assert from 'node:assert/strict';
import { buildThread } from '../src/thread.js';

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`); }
};

// The real thread, exactly as GHL returned it (newest first).
const MIMOZA = [
  { id: 'qXPIKerEATfCri0rmPVQ', direction: 'inbound', body: 'Kjo', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-24T11:26:15.984Z' },
  { id: 'TOsJjZeojlefUV2oq5nH', direction: 'inbound', body: 'Qa eshte', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-24T11:26:13.754Z' },
  { id: 'AWZ8RLmnH4lEhPH6IDhn', direction: 'inbound', body: '*Headline:* Mei Residence\n*Source URL:* https://www.instagram.com/p/DaxaAxcgrFb/\n\non this?', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-24T11:26:10.439Z' },
  { id: 'vxKmXtLZheK0VJ3YvRzk', direction: 'outbound', source: 'bulk_actions', body: 'Një investim që të paguan çdo vit\n\nPërshëndetje Mimoza, jam Eglenti nga Mei Residence 👋 Ka kaluar pak kohë... a je ende i interesuar?', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-24T11:23:09.247Z' },
  { id: 'uJmZeI5MtKfvawHKfOMf', direction: 'inbound', body: 'This message is currently unavailable.', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-07-15T10:57:58.778Z' },
];

console.log('\nthe Mimoza thread');
test('every unanswered client message is answered, not just the first', () => {
  const t = buildThread(MIMOZA);
  assert.equal(t.pendingCount, 3, 'all three burst messages must be read');
  assert.ok(t.text.includes('Qa eshte'), '"Qa eshte" was dropped by the old cooldown');
  assert.ok(t.text.includes('Kjo'), '"Kjo" was dropped by the old cooldown');
});
test('the follow-up template we sent is recovered from the CRM', () => {
  const t = buildThread(MIMOZA);
  assert.equal(t.afterTemplate, true, 'a bulk_actions send must be flagged as an automated follow-up');
  assert.ok(t.lastOutboundBody.includes('Mei Residence'), 'the template text must reach the prompt');
});
test('the reply goes out on the channel it arrived on', () => {
  assert.equal(buildThread(MIMOZA).channel, 'WhatsApp');
});
test('WhatsApp\'s "currently unavailable" placeholder is not treated as a question', () => {
  const t = buildThread(MIMOZA);
  assert.ok(!t.text.includes('currently unavailable'));
  assert.ok(!JSON.stringify(t.history).includes('currently unavailable'));
});

console.log('\nordinary threads');
test('a real back-and-forth becomes an alternating transcript', () => {
  const t = buildThread([
    { id: '4', direction: 'inbound', body: 'Sa kushton?', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-20T10:03:00.000Z' },
    { id: '3', direction: 'outbound', source: 'app', body: 'Pershendetje! Si mund t\'ju ndihmoj?', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-20T10:02:00.000Z' },
    { id: '2', direction: 'inbound', body: 'Pershendetje', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-20T10:01:00.000Z' },
  ]);
  assert.deepEqual(t.history.map((m) => m.role), ['user', 'assistant']);
  assert.equal(t.history[0].content, 'Pershendetje');
  assert.equal(t.text, 'Sa kushton?');
  assert.equal(t.afterTemplate, false, 'a hand-typed reply is not an automated template');
});
test('consecutive messages from the same side merge into one turn', () => {
  const t = buildThread([
    { id: '4', direction: 'inbound', body: 'jam?', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-20T10:05:00.000Z' },
    { id: '3', direction: 'outbound', source: 'app', body: 'Po.', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-20T10:04:00.000Z' },
    { id: '2', direction: 'inbound', body: 'A eshte i lire A212?', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-20T10:02:00.000Z' },
    { id: '1', direction: 'inbound', body: 'Pershendetje', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-20T10:01:00.000Z' },
  ]);
  assert.deepEqual(t.history.map((m) => m.role), ['user', 'assistant']);
  assert.equal(t.history[0].content, 'Pershendetje\nA eshte i lire A212?');
});
test('nothing new from the client means no reply at all', () => {
  const t = buildThread([
    { id: '2', direction: 'outbound', source: 'app', body: 'Faleminderit!', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-20T10:02:00.000Z' },
    { id: '1', direction: 'inbound', body: 'ok', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-20T10:01:00.000Z' },
  ]);
  assert.equal(t, null, 'an echo/no-op webhook must not produce a second reply');
});
test('CRM activity rows are not conversation turns', () => {
  const t = buildThread([
    { id: '2', direction: 'inbound', body: 'Pershendetje', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-20T10:02:00.000Z' },
    { id: 'x', direction: 'inbound', body: 'Opportunity moved to Hot Lead', messageType: 'TYPE_ACTIVITY_OPPORTUNITY', dateAdded: '2026-08-20T10:01:30.000Z' },
    { id: 'n', direction: 'outbound', body: 'internal note', messageType: 'TYPE_INTERNAL_COMMENT', dateAdded: '2026-08-20T10:01:00.000Z' },
  ]);
  assert.equal(t.text, 'Pershendetje');
  assert.equal(t.history.length, 0);
});
test('an Instagram DM is answered on Instagram', () => {
  const t = buildThread([
    { id: '1', direction: 'inbound', body: 'hello', messageType: 'TYPE_INSTAGRAM', dateAdded: '2026-08-20T10:01:00.000Z' },
  ]);
  assert.equal(t.channel, 'IG');
});
test('history always starts on a client turn (Messages API requirement)', () => {
  const t = buildThread(MIMOZA);
  assert.ok(t.history.every((m, i) => i === 0 ? m.role === 'user' : true));
});

console.log(failures ? `\n${failures} test(s) FAILED\n` : '\nall template-context tests passed\n');
process.exit(failures ? 1 : 0);
