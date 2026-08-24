// Live behavioural test of the degraded path (no real network, no real keys).
//
// Boots index.js against a local mock of the GHL API and an Anthropic key that
// is guaranteed to fail, posts a webhook for a buyer-looking contact, and
// asserts the agent:
//   1. still SENDS a message (no silent drop),
//   2. sends the honest holding line, not a canned "how can I help" greeting,
//   3. tags the contact needs-human + agent-error,
//   4. alerts the specialist contact,
// and for a vendor-pitch contact: replies with the info@ redirect and applies
// NO tags and NO specialist alert.
//
// Run:  node scripts/test-degraded-live.mjs
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const MOCK_PORT = 45450;
const AGENT_PORT = 45451;

const BUYER_ID = 'BUYER123456789012345';
const VENDOR_ID = 'VENDOR12345678901234';
const SPECIALIST_ID = 'SPEC1234567890123456';

const state = { sent: [], tagged: [] };

const inboundText = {
  [BUYER_ID]: 'Po kërkoj një apartament me pamje nga deti për veten time dhe klientin tim.',
  [VENDOR_ID]: 'Përshëndetje! Ofrojmë shërbime marketing dhe video për biznese si juaji. A do të ishit të hapur t\'jua tregoja portfolion tonë?',
};

// ---- mock GHL ----
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    const url = req.url || '';
    if (url.startsWith('/conversations/search')) {
      const contactId = new URL(`http://x${url}`).searchParams.get('contactId');
      return json({ conversations: [{ id: `conv-${contactId}` }] });
    }
    if (/^\/conversations\/conv-([A-Za-z0-9]+)\/messages/.test(url)) {
      const contactId = url.match(/^\/conversations\/conv-([A-Za-z0-9]+)\/messages/)[1];
      return json({ messages: { messages: [{ id: `msg-${contactId}`, direction: 'inbound', body: inboundText[contactId] || 'hi', messageType: 'TYPE_WHATSAPP', dateAdded: '2026-08-24T10:00:00.000Z' }] } });
    }
    if (url === '/conversations/messages' && req.method === 'POST') {
      const b = JSON.parse(body);
      state.sent.push(b);
      return json({ ok: true });
    }
    if (/^\/contacts\/[^/]+\/tags$/.test(url) && req.method === 'POST') {
      state.tagged.push({ contactId: url.split('/')[2], tags: JSON.parse(body).tags });
      return json({ ok: true });
    }
    if (/^\/contacts\/[^/]+$/.test(url) && req.method === 'PUT') return json({ ok: true }); // custom-field snapshot
    return json({});
  });
});

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failures += 1;
};

const post = (path, data) => fetch(`http://127.0.0.1:${AGENT_PORT}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
}).then((r) => r.json());

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
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
agent.stdout.on('data', (d) => (logs += d));
agent.stderr.on('data', (d) => (logs += d));

try {
  await sleep(1200); // let it boot

  // --- Case 1: buyer, model down ---
  const r1 = await post('/ghl-webhook', { contactId: BUYER_ID, first_name: 'Borys' });
  check('buyer: webhook reports degraded', r1.degraded === true, JSON.stringify(r1));
  const toBuyer = state.sent.find((m) => m.contactId === BUYER_ID);
  check('buyer: a message was still sent (no silent drop)', !!toBuyer);
  check('buyer: holding line promises a person, not the old canned greeting',
    !!toBuyer && /koleg nga Mei Residence/.test(toBuyer.message) && !/Si mund t[’']ju ndihmoj/.test(toBuyer.message),
    toBuyer && toBuyer.message);
  const buyerTags = state.tagged.find((t) => t.contactId === BUYER_ID);
  check('buyer: tagged needs-human + agent-error', !!buyerTags && buyerTags.tags.includes('needs-human') && buyerTags.tags.includes('agent-error'), JSON.stringify(state.tagged));
  const alert = state.sent.find((m) => m.contactId === SPECIALIST_ID);
  check('buyer: specialist alerted with AGENT ERROR', !!alert && /AGENT ERROR/.test(alert.message), alert && alert.message);

  // --- Case 2: vendor pitch, model down ---
  state.sent.length = 0; state.tagged.length = 0;
  const r2 = await post('/ghl-webhook', { contactId: VENDOR_ID, first_name: 'Agjencia' });
  const toVendor = state.sent.find((m) => m.contactId === VENDOR_ID);
  check('vendor: gets the info@ redirect', !!toVendor && /info@meiresidence\.com/.test(toVendor.message), toVendor && toVendor.message);
  check('vendor: NO tags applied', state.tagged.length === 0, JSON.stringify(state.tagged));
  check('vendor: specialist NOT alerted', !state.sent.some((m) => m.contactId === SPECIALIST_ID));
  check('vendor: webhook reports degraded too', r2.degraded === true, JSON.stringify(r2));
} finally {
  agent.kill();
  mock.close();
}

if (failures) {
  console.log(`\n${failures} check(s) failed. Agent logs:\n${logs.slice(-3000)}`);
  process.exit(1);
}
console.log('\nAll checks passed');
