// Live behavioural test of the degraded path (no real network, no real keys).
//
// Boots index.js against a local mock of the GHL API and an Anthropic key that
// is guaranteed to fail, posts a webhook for a buyer-looking contact, and
// asserts the agent:
//   1. still SENDS a message (no silent drop),
//   2. sends the honest holding line, not a canned "how can I help" greeting,
//   3. writes the handoff fields and THEN tags needs-human + agent-error,
//   4. leaves the alert itself to the GHL workflow (2026-09-17) — and falls
//      back to a direct message when, and only when, the tag write fails,
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
// Tagging this one fails at the mock — the only case that still earns a direct
// message, because a tag that never lands means the GHL workflow never fires.
const UNTAGGABLE_ID = 'NOTAG1234567890123456';
// Same buyer shape, run with the mock's 24-hour window open.
const OPEN_WINDOW_ID = 'OPENWIN12345678901234';

const state = { sent: [], tagged: [], fields: [], order: [], refused: [] };
let windowShut = true;

const inboundText = {
  [BUYER_ID]: 'Po kërkoj një apartament me pamje nga deti për veten time dhe klientin tim.',
  [VENDOR_ID]: 'Përshëndetje! Ofrojmë shërbime marketing dhe video për biznese si juaji. A do të ishit të hapur t\'jua tregoja portfolion tonë?',
  [UNTAGGABLE_ID]: 'Dua të rezervoj një 2+1 me pamje nga deti, më merrni në telefon ju lutem.',
  [OPEN_WINDOW_ID]: 'Dua të rezervoj një 1+1 me pamje nga deti, sa është çmimi final?',
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
      // Stand in for a shut 24-hour window: free-form WhatsApp to the
      // specialist is refused, exactly as Meta refuses it on a quiet day.
      if (windowShut && b.contactId === SPECIALIST_ID && String(b.type).toLowerCase() === 'whatsapp') {
        state.refused.push(b);
        res.statusCode = 422;
        return json({ message: 'more than 24 hours have passed since the customer last replied' });
      }
      return json({ ok: true });
    }
    if (/^\/contacts\/[^/]+\/tags$/.test(url) && req.method === 'POST') {
      const contactId = url.split('/')[2];
      if (contactId === UNTAGGABLE_ID) {
        state.order.push(`tag-failed:${contactId}`);
        res.statusCode = 500;
        return json({ message: 'tag write refused on purpose' });
      }
      state.tagged.push({ contactId, tags: JSON.parse(body).tags });
      state.order.push(`tag:${contactId}`);
      return json({ ok: true });
    }
    if (/^\/contacts\/[^/]+$/.test(url) && req.method === 'PUT') { // custom-field snapshot
      const contactId = url.split('/')[2];
      state.fields.push({ contactId, customFields: (JSON.parse(body || '{}').customFields) || [] });
      state.order.push(`fields:${contactId}`);
      return json({ ok: true });
    }
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
  // The alert itself now travels tag -> GHL workflow -> approved WhatsApp
  // template. The agent messaging Eglent directly here would be the old bug.
  check('buyer: the alert was delegated to the GHL workflow',
    /alert delegated to the GHL workflow/.test(logs));
  // The detail message is attempted on top of the template and refused here,
  // because this mock stands in for a shut 24-hour window.
  const attempted = state.sent.filter((m) => m.contactId === SPECIALIST_ID);
  check('buyer: the agent tried ONE detail message, on WhatsApp only',
    attempted.length === 1 && String(attempted[0].type).toLowerCase() === 'whatsapp',
    JSON.stringify(attempted.map((m) => m.type)));
  check('buyer: it did not fall back to SMS or Email — the template said it already',
    !attempted.some((m) => ['sms', 'email'].includes(String(m.type).toLowerCase())));
  check('buyer: the refusal is treated as harmless, not as a failed alert',
    /the template still carried the alert/.test(logs) && !/ALERT FAILED on every channel/.test(logs));
  const buyerFields = state.fields.find((f) => f.contactId === BUYER_ID);
  check('buyer: the handoff fields were written', !!buyerFields && buyerFields.customFields.length >= 2, JSON.stringify(state.fields));
  check('buyer: the summary field says it was an agent error',
    !!buyerFields && buyerFields.customFields.some((f) => /GABIM I AGJENTIT/.test(String(f.value))),
    JSON.stringify(buyerFields && buyerFields.customFields));
  check('buyer: no field value carries a newline (WhatsApp would reject it)',
    !!buyerFields && buyerFields.customFields.slice(1).every((f) => !/[\r\n\t]/.test(String(f.value))),
    JSON.stringify(buyerFields && buyerFields.customFields));
  check('buyer: the fields were written BEFORE the tag that fires the workflow',
    state.order.indexOf(`fields:${BUYER_ID}`) !== -1
    && state.order.indexOf(`fields:${BUYER_ID}`) < state.order.indexOf(`tag:${BUYER_ID}`),
    JSON.stringify(state.order));

  // --- Case 2: vendor pitch, model down ---
  state.sent.length = 0; state.tagged.length = 0;
  const r2 = await post('/ghl-webhook', { contactId: VENDOR_ID, first_name: 'Agjencia' });
  const toVendor = state.sent.find((m) => m.contactId === VENDOR_ID);
  check('vendor: gets the info@ redirect', !!toVendor && /info@meiresidence\.com/.test(toVendor.message), toVendor && toVendor.message);
  check('vendor: NO tags applied', state.tagged.length === 0, JSON.stringify(state.tagged));
  check('vendor: specialist NOT alerted', !state.sent.some((m) => m.contactId === SPECIALIST_ID));
  check('vendor: webhook reports degraded too', r2.degraded === true, JSON.stringify(r2));

  // --- Case 2b: window open — the detail message lands on top of the template
  state.sent.length = 0; state.tagged.length = 0; state.fields.length = 0; state.order.length = 0;
  windowShut = false;
  await post('/ghl-webhook', { contactId: OPEN_WINDOW_ID, first_name: 'Fisnik' });
  const detail = state.sent.find((m) => m.contactId === SPECIALIST_ID);
  check('open window: the detail message is delivered', !!detail, JSON.stringify(state.sent));
  check('open window: it carries what the template cannot — the CRM link',
    !!detail && /conversations\/conversations\//.test(detail.message), detail && detail.message);
  check('open window: and the client\'s verbatim message',
    !!detail && /rezervoj/.test(detail.message), detail && detail.message);
  check('open window: the contact was still tagged for the workflow',
    state.tagged.some((t) => t.contactId === OPEN_WINDOW_ID && t.tags.includes('needs-human')),
    JSON.stringify(state.tagged));
  windowShut = true;

  // --- Case 3: the tag write fails, so nothing downstream can fire ---
  state.sent.length = 0; state.tagged.length = 0; state.fields.length = 0; state.order.length = 0;
  await post('/ghl-webhook', { contactId: UNTAGGABLE_ID, first_name: 'Arben' });
  check('failed tag: nothing was tagged', state.tagged.length === 0, JSON.stringify(state.tagged));
  const fallback = state.sent.find((m) => m.contactId === SPECIALIST_ID);
  check('failed tag: the agent alerts the specialist itself', !!fallback, JSON.stringify(state.sent));
  check('failed tag: it does not lead with WhatsApp',
    !!fallback && String(fallback.type).toLowerCase() !== 'whatsapp', fallback && fallback.type);
  check('failed tag: the log says why the workflow will not fire',
    /the GHL workflow will not fire/.test(logs));
} finally {
  agent.kill();
  mock.close();
}

if (failures) {
  console.log(`\n${failures} check(s) failed. Agent logs:\n${logs.slice(-3000)}`);
  process.exit(1);
}
console.log('\nAll checks passed');
