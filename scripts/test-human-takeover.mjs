// Regression test for "when a real person writes, the agent must not send another
// one" (2026-10-07). Built from the real Jarosław thread: Eglent wrote to him by
// hand from the WhatsApp app on his phone (Coexistence) on 6 Oct, and nothing in
// the agent knew a person had stepped in.
//
// Part 1 is pure (src/human-takeover.js). Part 2 boots index.js against a mock GHL
// and an Anthropic key that is guaranteed to fail, and checks what actually goes
// out: nothing while a person has the conversation, nothing when a person answers
// mid-reply, and a normal reply once the person has been quiet for a day.
//
// Run: node scripts/test-human-takeover.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { isHumanOutbound, lastHumanReplyAt, humanTakeover, takeoverWindowMs, AI_OFF_TAG } from '../src/human-takeover.js';

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`); }
};

const AGENT_APP = { marketplace: { appId: '6a5f45204ecc8b1af6bd7413' } };
const HOUR = 3_600_000;

// The real thread, as GHL returned it (newest first), trimmed to the fields that matter.
const JAROSLAW = [
  { id: '62ItI9j7R3poFgu7BGF7', direction: 'outbound', source: 'app', userId: '', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-10-06T12:37:14.000Z', body: 'Sounds good, tell me about your interests in Investing in the south Ksamil, Sarande etc' },
  { id: 'XIa6RuJBQMcP8fbTx5un', direction: 'inbound', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-10-06T12:13:43.386Z', body: 'Yes' },
  { id: '6kg0pvbYsSompOdBag6b', direction: 'outbound', source: 'app', userId: '', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-10-06T12:08:12.000Z', body: 'Hello Jaroslaw, can you speak English’?' },
  { id: 'g9WaJKVBmCmTFlKjOE66', direction: 'inbound', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-10-01T14:40:01.510Z', body: 'Atëherë pres me interes propozimet tuaja më të mira.' },
  { id: '8vd4BCAhoF9JgL5zwxtk', direction: 'outbound', source: 'app', userId: 'q3sHPbwqBmtHk27FDckF', meta: AGENT_APP, messageType: 'TYPE_WHATSAPP', dateAdded: '2026-10-01T14:30:15.149Z', body: 'Faleminderit per mesazhin tuaj! Nje koleg nga Mei Residence do t\'ju pergjigjet personalisht shume shpejt.' },
  { id: 'GISpr1L9wK905TBiOxDF', direction: 'outbound', source: 'bulk_actions', userId: 'q3sHPbwqBmtHk27FDckF', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-10-01T13:31:26.007Z', body: 'Përshëndetje Jarosław, Ju urojmë një tetor të mbarë nga Mei Residence!' },
];
const JAROSLAW_LAST_HUMAN = Date.parse('2026-10-06T12:37:14.000Z');

console.log('\nwho wrote it');
test('a message typed on the phone (Coexistence echo, no app id) is a person', () => {
  assert.equal(isHumanOutbound(JAROSLAW[0]), true);
});
test('the agent\'s own message (integration app id) is not a person', () => {
  assert.equal(isHumanOutbound(JAROSLAW[4]), false);
});
test('a bulk send, a workflow or a campaign is not a person', () => {
  for (const source of ['bulk_actions', 'workflow', 'campaign', 'automated']) {
    assert.equal(isHumanOutbound({ ...JAROSLAW[5], source }), false, source);
  }
});
test('a reply typed in the GHL inbox (no app id) is a person', () => {
  assert.equal(isHumanOutbound({ id: 'x', direction: 'outbound', source: 'app', userId: 'q3sHPbwqBmtHk27FDckF', messageType: 'TYPE_WHATSAPP', body: 'Po, ju pres nesër.' }), true);
});
test('a photo sent by hand with no caption still counts', () => {
  assert.equal(isHumanOutbound({ id: 'x', direction: 'outbound', source: 'app', messageType: 'TYPE_WHATSAPP', body: '', attachments: ['https://x/y.jpeg'] }), true);
});
test('client messages, activity rows and internal notes never count', () => {
  assert.equal(isHumanOutbound(JAROSLAW[1]), false);
  assert.equal(isHumanOutbound({ direction: 'outbound', source: 'app', messageType: 'TYPE_ACTIVITY_OPPORTUNITY', body: 'Opportunity updated' }), false);
  assert.equal(isHumanOutbound({ direction: 'outbound', messageType: 'TYPE_INTERNAL_COMMENT', body: 'note' }), false);
});
test('a message id the agent itself just sent is never a person, app id or not', () => {
  const own = new Set(['mine1']);
  assert.equal(isHumanOutbound({ id: 'mine1', direction: 'outbound', source: 'app', messageType: 'TYPE_WHATSAPP', body: 'hi' }, own), false);
});
test('the newest person message is found in a newest-first list', () => {
  assert.equal(lastHumanReplyAt(JAROSLAW), JAROSLAW_LAST_HUMAN);
});

console.log('\nwhen the agent stays quiet');
test('Jarosław writes again 2 hours after Eglent did: the agent stays quiet', () => {
  const t = humanTakeover({ rawMessages: JAROSLAW, now: JAROSLAW_LAST_HUMAN + 2 * HOUR, windowMs: 24 * HOUR });
  assert.ok(t, 'expected a takeover');
  assert.equal(t.at, JAROSLAW_LAST_HUMAN);
});
test('a day and a bit after the person\'s last message, the agent answers again', () => {
  assert.equal(humanTakeover({ rawMessages: JAROSLAW, now: JAROSLAW_LAST_HUMAN + 25 * HOUR, windowMs: 24 * HOUR }), null);
});
test('a thread with only agent and bulk messages never pauses the agent', () => {
  assert.equal(humanTakeover({ rawMessages: JAROSLAW.slice(3), now: Date.parse('2026-10-01T14:45:00Z'), windowMs: 24 * HOUR }), null);
});
test(`the ${AI_OFF_TAG} tag pauses the agent regardless of time`, () => {
  assert.ok(humanTakeover({ rawMessages: [], tags: ['hot-lead', 'AI-OFF'], windowMs: 24 * HOUR }));
});
test('HUMAN_TAKEOVER_HOURS: default 24, configurable, 0 switches the time rule off', () => {
  assert.equal(takeoverWindowMs({}), 24 * HOUR);
  assert.equal(takeoverWindowMs({ HUMAN_TAKEOVER_HOURS: '48' }), 48 * HOUR);
  assert.equal(takeoverWindowMs({ HUMAN_TAKEOVER_HOURS: '0' }), 0);
  assert.equal(humanTakeover({ rawMessages: JAROSLAW, now: JAROSLAW_LAST_HUMAN + 60000, windowMs: 0 }), null);
});

// ---------------------------------------------------------------- live part ----
console.log('\nthe real server, against a mock GHL');
const MOCK_PORT = 45460;
const AGENT_PORT = 45461;
const TAKEN = 'TAKEN123456789012345';   // a person wrote 10 minutes ago, then the client wrote
const RACE = 'RACE1234567890123456';    // a person answers while the agent is replying
const FREE = 'FREE1234567890123456';    // a person wrote 3 days ago — the agent may answer
const OFF = 'OFFTAG12345678901234';     // tagged ai-off
const SPECIALIST_ID = 'SPEC1234567890123456';

const ago = (ms) => new Date(Date.now() - ms).toISOString();
const reads = {};
const sent = [];
const clientMsg = (id) => ({ id: `in-${id}`, direction: 'inbound', body: 'Sa kushton një 1+1 me pamje nga deti?', messageType: 'TYPE_WHATSAPP', dateAdded: ago(20_000) });
const personMsg = (id, when) => ({ id: `hu-${id}-${when}`, direction: 'outbound', source: 'app', userId: '', body: 'Përshëndetje, jam Eglenti — po ju shkruaj unë.', messageType: 'TYPE_WHATSAPP', dateAdded: ago(when) });

function threadFor(id) {
  reads[id] = (reads[id] || 0) + 1;
  if (id === TAKEN) return [clientMsg(id), personMsg(id, 10 * 60_000)];
  if (id === FREE) return [clientMsg(id), personMsg(id, 72 * HOUR)];
  if (id === RACE) return reads[id] === 1 ? [clientMsg(id)] : [{ ...personMsg(id, 1000), dateAdded: ago(1000) }, clientMsg(id)];
  return [clientMsg(id)];
}

const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    const url = req.url || '';
    if (url.startsWith('/conversations/search')) {
      const contactId = new URL(`http://x${url}`).searchParams.get('contactId');
      return json({ conversations: [{ id: `conv-${contactId}`, tags: contactId === OFF ? [AI_OFF_TAG] : [] }] });
    }
    const m = url.match(/^\/conversations\/conv-([A-Za-z0-9]+)\/messages/);
    if (m) return json({ messages: { messages: threadFor(m[1]) } });
    if (url === '/conversations/messages' && req.method === 'POST') {
      const b = JSON.parse(body);
      sent.push(b);
      return json({ messageId: `out-${sent.length}` });
    }
    return json({});
  });
});
await new Promise((r) => mock.listen(MOCK_PORT, r));

const agent = spawn(process.execPath, ['index.js'], {
  cwd: new URL('../', import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(AGENT_PORT),
    GHL_API_BASE: `http://127.0.0.1:${MOCK_PORT}`,
    GHL_API_KEY: 'mock-key',
    ANTHROPIC_API_KEY: 'sk-ant-invalid-on-purpose',
    ANTHROPIC_MODEL: 'claude-sonnet-5',
    SPECIALIST_CONTACT_ID: SPECIALIST_ID,
    INBOUND_DEBOUNCE_MS: '1',
    HUMAN_PACING: 'off',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
agent.stdout.on('data', (d) => (logs += d));
agent.stderr.on('data', (d) => (logs += d));
const post = (data) => fetch(`http://127.0.0.1:${AGENT_PORT}/ghl-webhook`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
}).then((r) => r.json());
const live = async (name, fn) => {
  try { await fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`); }
};
const to = (id) => sent.filter((s) => s.contactId === id);

try {
  await sleep(1200);
  await live('a person wrote 10 min ago: the client\'s new message gets no agent reply', async () => {
    const r = await post({ contactId: TAKEN });
    assert.equal(to(TAKEN).length, 0, JSON.stringify(to(TAKEN)));
    assert.ok(r.humanTakeover, JSON.stringify(r));
  });
  await live('a person answers while the agent is replying: the agent\'s reply is dropped', async () => {
    const r = await post({ contactId: RACE });
    assert.equal(to(RACE).length, 0, JSON.stringify(to(RACE)));
    assert.ok(r.humanTakeover, JSON.stringify(r));
    assert.ok(reads[RACE] >= 2, 'the thread must be re-read right before sending');
  });
  await live(`tagged ${AI_OFF_TAG}: no agent reply`, async () => {
    await post({ contactId: OFF });
    assert.equal(to(OFF).length, 0);
  });
  await live('the person last wrote 3 days ago: the agent answers as normal', async () => {
    await post({ contactId: FREE });
    assert.equal(to(FREE).length, 1, JSON.stringify(sent));
  });
} finally {
  agent.kill();
  mock.close();
}

if (failures) {
  console.error(`\n${failures} check(s) failed.\n--- agent logs ---\n${logs.slice(-3000)}`);
  process.exit(1);
}
console.log('\nall human-takeover checks passed');
