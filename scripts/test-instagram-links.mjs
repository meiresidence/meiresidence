// Regression test for "the agent answers on Instagram but the client never gets
// it" (2026-10-10, Eglent). Instagram does not deliver a DM that contains a link,
// and the agent's answer to a floor-plan request is two links. GHL showed those
// replies as sent; on the client's side there was nothing.
//
// Part 1 is pure (src/instagram.js). Part 2 boots index.js against a mock GHL and
// a mock Anthropic API and checks what actually goes out on each channel.
//
// Run: node scripts/test-instagram-links.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  isInstagram, hasLink, stripLinks, instagramSafe, extractPhone, instagramNote, AGENT_WHATSAPP,
} from '../src/instagram.js';

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`); }
};

// The real reply that never reached Mobileri Blerion on Instagram (10 Oct).
const BLERION = 'Dy shembuj konkretë aktualisht të lira:\n'
  + '- B002, 100.9 m2, 163,500 €, me pamje nga deti — plan: https://app.screencast.com/E8bM8jxHz6Qkk\n'
  + '- B019, 76.3 m2, 111,300 €, pa pamje nga deti — plan: https://app.screencast.com/MPzwEy4BM3EpB\n\n'
  + 'Të intereson me pamje nga deti, apo nuk e ke domosdoshmëri?';

console.log('\nwhat counts as a link');
test('screencast, netlify, www and bare domains are links', () => {
  for (const s of ['https://app.screencast.com/x', 'mei-tour.netlify.app/a212/', 'www.mei.al', 'shiko mei.al']) assert.equal(hasLink(s), true, s);
});
test('prices, areas, unit codes, phone numbers and e-mail addresses are not', () => {
  for (const s of ['163,500 €', '100.9 m2', 'A212/1+1', `WhatsApp ${AGENT_WHATSAPP}`, 'info@meiresidence.com', 'ok.Faleminderit']) assert.equal(hasLink(s), false, s);
});
test('only IG is Instagram', () => {
  assert.equal(isInstagram('IG'), true);
  assert.equal(isInstagram('WhatsApp'), false);
  assert.equal(isInstagram(''), false);
});

console.log('\nthe backstop');
test('the Blerion reply keeps every fact and loses every link', () => {
  const out = stripLinks(BLERION);
  assert.equal(hasLink(out), false, out);
  for (const f of ['B002, 100.9 m2, 163,500 €, me pamje nga deti', 'B019, 76.3 m2, 111,300 €, pa pamje nga deti', 'Dy shembuj konkretë aktualisht të lira:', 'Të intereson me pamje nga deti']) assert.ok(out.includes(f), `${f}\n---\n${out}`);
  assert.ok(!/plan:\s*$/m.test(out), out);
});
test('a stripped reply always tells them where the plan can go', () => {
  const out = instagramSafe(BLERION);
  assert.ok(out.endsWith(`WhatsApp: ${AGENT_WHATSAPP}`), out);
  assert.equal(instagramSafe('Shiko: https://mei-tour.netlify.app'), `WhatsApp: ${AGENT_WHATSAPP}`);
});
test('the number is not added twice', () => {
  const out = instagramSafe(`Plani: https://app.screencast.com/x\nNa shkruaj në WhatsApp ${AGENT_WHATSAPP}.`);
  assert.equal(out.split('508 8808').length - 1, 1, out);
});
test('a reply with no link is left exactly as written', () => {
  const s = 'Planimetrinë ta dërgoj në WhatsApp:\n- 2+1, 76 m2';
  assert.equal(instagramSafe(s), s);
});
test('English "Here\'s the floor plan: … — and the 3D plan: …" loses both labels', () => {
  const out = stripLinks("A212 is a 1+1, 52.2 m2. Here's the floor plan: https://app.screencast.com/x — and the interactive 3D plan: https://mei-tour.netlify.app/a212/");
  assert.equal(out, 'A212 is a 1+1, 52.2 m2.');
});

console.log('\nphone numbers left in the DM');
test('Albanian mobiles typed locally become +355', () => {
  assert.equal(extractPhone('numri im 069 123 4567'), '+355691234567');
  assert.equal(extractPhone('068-465-7978'), '+355684657978');
});
test('international numbers keep their country code', () => {
  assert.equal(extractPhone('+41 79 523 29 49'), '+41795232949');
  assert.equal(extractPhone('0041795232949'), '+41795232949');
});
test('prices, years and our own numbers are not the client\'s number', () => {
  for (const s of ['Kam 103,500 euro', 'A212 dhe 2026', `shkrova te ${AGENT_WHATSAPP}`, '067 204 9400', 'çmimi 1.250.000']) assert.equal(extractPhone(s), '', s);
});
test('the Instagram note names the WhatsApp number and forbids links', () => {
  const n = instagramNote();
  assert.ok(n.includes(AGENT_WHATSAPP) && /NEVER put a link/.test(n));
});

// ---- Part 2: the live webhook ------------------------------------------------
console.log('\nthe live webhook');
const GHL_PORT = 47811, AI_PORT = 47812, AGENT_PORT = 47813;
const IG_PLAN = 'IGPLAN12345678901234';     // asks for the plan on Instagram
const IG_STUBBORN = 'IGSTUB12345678901234'; // the rewrite still has a link
const IG_PHONE = 'IGPHON12345678901234';    // leaves their number on Instagram
const WA_PLAN = 'WAPLAN12345678901234';     // same question on WhatsApp
const SPECIALIST_ID = 'SPEC1234567890123456';

const ago = (ms) => new Date(Date.now() - ms).toISOString();
const ask = (id, type, body) => [{ id: `in-${id}`, direction: 'inbound', body, messageType: type, dateAdded: ago(20_000) }];
const THREADS = {
  [IG_PLAN]: ask(IG_PLAN, 'TYPE_INSTAGRAM', 'Më dërgo planimetrinë e B002 të lutem'),
  [IG_STUBBORN]: ask(IG_STUBBORN, 'TYPE_INSTAGRAM', 'Send me the plan of B002'),
  [IG_PHONE]: ask(IG_PHONE, 'TYPE_INSTAGRAM', 'Po, numri im është 069 123 4567'),
  [WA_PLAN]: ask(WA_PLAN, 'TYPE_WHATSAPP', 'Më dërgo planimetrinë e B002 të lutem'),
};
const LINKED = 'B002 — 2+1, 100.9 m2, 163,500 €, me pamje nga deti. Planimetria: https://app.screencast.com/E8bM8jxHz6Qkk';
const CLEAN = `B002 — 2+1, 100.9 m2, 163,500 €, me pamje nga deti. Planimetrinë ta dërgoj në WhatsApp: na shkruaj te ${AGENT_WHATSAPP}, ose më lër numrin tënd këtu.`;

const sent = [], puts = [], aiCalls = [];
const ghl = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    const url = req.url || '';
    if (url.startsWith('/conversations/search')) {
      const contactId = new URL(`http://x${url}`).searchParams.get('contactId');
      return json({ conversations: [{ id: `conv-${contactId}`, tags: [], phone: contactId === WA_PLAN ? '+355690000000' : null }] });
    }
    const m = url.match(/^\/conversations\/conv-([A-Za-z0-9]+)\/messages/);
    if (m) return json({ messages: { messages: THREADS[m[1]] || [] } });
    if (url === '/conversations/messages' && req.method === 'POST') {
      sent.push(JSON.parse(body));
      return json({ messageId: `out-${sent.length}` });
    }
    if (req.method === 'PUT' && url.startsWith('/contacts/')) puts.push({ url, body: JSON.parse(body || '{}') });
    return json({});
  });
});
const ai = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const sys = (b.system || []).map((s) => s.text).join('\n');
    const last = b.messages?.[b.messages.length - 1];
    const lastText = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content || '');
    const first = typeof b.messages?.[0]?.content === 'string' ? b.messages[0].content : '';
    const rewrite = lastText.includes('Instagram does not deliver a message that contains a link');
    aiCalls.push({ rewrite, igNote: sys.includes('INSTAGRAM DM'), first });
    let text = LINKED;
    if (rewrite) text = first.startsWith('Send me') ? LINKED : CLEAN;
    else if (first.includes('numri im')) text = 'Faleminderit! Një koleg të shkruan në WhatsApp me planimetrinë.';
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      id: `msg_${aiCalls.length}`, type: 'message', role: 'assistant', model: b.model,
      content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
  });
});
await new Promise((r) => ghl.listen(GHL_PORT, r));
await new Promise((r) => ai.listen(AI_PORT, r));

const agent = spawn(process.execPath, ['index.js'], {
  cwd: new URL('../', import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(AGENT_PORT),
    GHL_API_BASE: `http://127.0.0.1:${GHL_PORT}`,
    GHL_API_KEY: 'mock-key',
    ANTHROPIC_API_KEY: 'sk-ant-mock',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${AI_PORT}`,
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
const textTo = (id) => sent.filter((s) => s.contactId === id).map((s) => s.message).join('\n');

try {
  await sleep(1200);
  await live('Instagram plan request: the reply is rewritten, sent on IG, with no link and the WhatsApp number', async () => {
    await post({ contactId: IG_PLAN });
    const out = textTo(IG_PLAN);
    assert.ok(out, 'nothing was sent');
    assert.ok(sent.filter((s) => s.contactId === IG_PLAN).every((s) => s.type === 'IG'));
    assert.equal(hasLink(out), false, out);
    assert.ok(out.includes(AGENT_WHATSAPP), out);
    assert.ok(out.includes('163,500 €'), out);
    assert.ok(aiCalls.some((c) => c.igNote), 'the Instagram channel note never reached the model');
    assert.ok(aiCalls.some((c) => c.rewrite), 'no rewrite was asked for');
  });
  await live('Instagram: if the rewrite still has a link, it is cut out before sending', async () => {
    await post({ contactId: IG_STUBBORN });
    const out = textTo(IG_STUBBORN);
    assert.ok(out, 'nothing was sent');
    assert.equal(hasLink(out), false, out);
    assert.ok(out.includes('163,500 €') && out.includes(`WhatsApp: ${AGENT_WHATSAPP}`), out);
  });
  await live('Instagram: a client who leaves their number gets it saved on the contact and handed to a person', async () => {
    await post({ contactId: IG_PHONE });
    assert.ok(textTo(IG_PHONE), 'nothing was sent');
    const put = puts.find((p) => p.url === `/contacts/${IG_PHONE}` && p.body.phone);
    assert.ok(put, JSON.stringify(puts));
    assert.equal(put.body.phone, '+355691234567');
    assert.match(logs, /\[ig\] IGPHON12345678901234 left their phone \+355691234567/);
    assert.match(logs, /\[handoff\] IGPHON12345678901234: tagged:true/, 'the handoff must fire so a person sends the plan on WhatsApp');
  });
  await live('WhatsApp is untouched: the floor-plan link goes out as before', async () => {
    const before = aiCalls.filter((c) => c.rewrite).length;
    await post({ contactId: WA_PLAN });
    const out = textTo(WA_PLAN);
    assert.ok(out.includes('https://app.screencast.com/E8bM8jxHz6Qkk'), out);
    assert.equal(aiCalls.filter((c) => c.rewrite).length, before, 'a WhatsApp reply must never be rewritten');
    assert.equal(sent.filter((s) => s.contactId === WA_PLAN)[0].type, 'WhatsApp');
  });
} finally {
  agent.kill();
  ghl.close();
  ai.close();
}

if (failures) {
  console.error(`\n${failures} check(s) failed.\n--- agent logs ---\n${logs.slice(-4000)}`);
  process.exit(1);
}
console.log('\nall instagram-links checks passed');
