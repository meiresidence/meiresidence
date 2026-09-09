// End-to-end test of the owner channel — the real server, no real network.
//
// Boots index.js against a local mock of BOTH the GHL API and the Anthropic API,
// then posts webhooks and asserts what actually happens on the wire:
//
//   1. Eglent sends a rule  -> the model's save_instruction call writes a
//      [MEI-AGENT-RULE] note, and he gets the confirmation back.
//   2. A client writes next -> that rule is in the context note handed to the
//      model, and it is NOT in the cached system prompt.
//   3. Mea sends a rule that changes a return figure -> NOTHING is written
//      until she confirms; the model is told to ask her first.
//   4. Eglent asks for something absolute -> nothing is written, ever.
//   5. An owner is never tagged, never escalated, never sent a closing line.
//
// Run:  node scripts/test-owner-live.mjs

import http from 'node:http';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const GHL_PORT = 45460;
const API_PORT = 45461;
const AGENT_PORT = 45462;

const EGLENT_ID = 'OWNEREGLENT000000001';
const MEA_ID = 'OWNERMEA000000000001';
const CLIENT_ID = 'CLIENT00000000000001';
const STORE_ID = 'STORE000000000000001';

const phones = {
  [EGLENT_ID]: '+355 67 204 9400',
  [MEA_ID]: '0685171265',
  [CLIENT_ID]: '+355692300351',
};
let inbound = {};

const state = { sent: [], tagged: [], notes: [], systems: [] };

// ---- mock GHL ------------------------------------------------------------
const ghlMock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    const url = req.url || '';
    if (url.startsWith('/conversations/search')) {
      const contactId = new URL(`http://x${url}`).searchParams.get('contactId');
      return json({ conversations: [{ id: `conv-${contactId}`, phone: phones[contactId] || '', contactName: contactId }] });
    }
    if (/^\/conversations\/conv-([A-Za-z0-9]+)\/messages/.test(url)) {
      const contactId = url.match(/^\/conversations\/conv-([A-Za-z0-9]+)\/messages/)[1];
      return json({ messages: { messages: [{ id: `msg-${contactId}-${Date.now()}`, direction: 'inbound', body: inbound[contactId] || 'hi', messageType: 'TYPE_WHATSAPP', dateAdded: new Date().toISOString() }] } });
    }
    if (url === '/conversations/messages' && req.method === 'POST') {
      state.sent.push(JSON.parse(body)); return json({ ok: true });
    }
    if (/^\/contacts\/[^/]+\/notes$/.test(url) && req.method === 'GET') {
      return json({ notes: state.notes.map((n, i) => ({ id: `note${i + 1}`, body: n })) });
    }
    if (/^\/contacts\/[^/]+\/notes$/.test(url) && req.method === 'POST') {
      state.notes.push(JSON.parse(body).body);
      return json({ note: { id: `note${state.notes.length}` } });
    }
    if (/^\/contacts\/[^/]+\/tags$/.test(url) && req.method === 'POST') {
      state.tagged.push({ contactId: url.split('/')[2], tags: JSON.parse(body).tags }); return json({ ok: true });
    }
    if (/^\/contacts\/[^/]+$/.test(url) && req.method === 'PUT') return json({ ok: true });
    return json({});
  });
});

// ---- mock Anthropic ------------------------------------------------------
// Scripted per test step: `nextReply` decides what the "model" does next.
let nextReply = () => ({ content: [{ type: 'text', text: 'ok' }] });
const seenToolResults = [];

const apiMock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    state.systems.push(b.system);
    for (const m of b.messages || []) {
      if (Array.isArray(m.content)) {
        for (const c of m.content) if (c.type === 'tool_result') seenToolResults.push(String(c.content));
      }
    }
    const out = nextReply(b);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      id: 'msg_test', type: 'message', role: 'assistant', model: 'mock',
      stop_reason: out.content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
      ...out,
    }));
  });
});

const toolUse = (name, input) => ({ content: [{ type: 'tool_use', id: `tu_${Math.random().toString(36).slice(2)}`, name, input }] });
const say = (text) => ({ content: [{ type: 'text', text }] });

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures++; console.error(`  FAIL ${name}\n       ${e.message}`); }
};

const post = (contactId) => fetch(`http://127.0.0.1:${AGENT_PORT}/ghl-webhook`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contactId }),
}).then((r) => r.json());

const reset = () => { state.sent.length = 0; state.tagged.length = 0; state.systems.length = 0; seenToolResults.length = 0; };

await new Promise((r) => ghlMock.listen(GHL_PORT, r));
await new Promise((r) => apiMock.listen(API_PORT, r));

const agent = spawn(process.execPath, ['index.js'], {
  env: {
    ...process.env,
    PORT: String(AGENT_PORT),
    GHL_API_BASE: `http://127.0.0.1:${GHL_PORT}`,
    GHL_API_KEY: 'test-key',
    GHL_LOCATION_ID: 'testloc',
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${API_PORT}`,
    ANTHROPIC_API_KEY: 'test-key',
    INSTRUCTIONS_CONTACT_ID: STORE_ID,
    HUMAN_PACING: 'off',
    INBOUND_DEBOUNCE_MS: '0',
    INSTRUCTIONS_CACHE_MS: '0',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const logs = [];
agent.stdout.on('data', (d) => logs.push(String(d)));
agent.stderr.on('data', (d) => logs.push(String(d)));
await sleep(1500);

try {
  // ---- 1. Eglent teaches the agent -------------------------------------
  console.log('\n1. Eglent sends a rule');
  reset();
  inbound = { [EGLENT_ID]: 'Gjithmonë pyet për buxhetin para se të dërgosh njësi.' };
  let hop = 0;
  nextReply = () => (hop++ === 0
    ? toolUse('save_instruction', { instruction: 'Gjithmonë pyet për buxhetin para se të dërgosh njësi.' })
    : say('U ruajt (#1). Aktive që tani.'));
  await post(EGLENT_ID);
  await sleep(300);

  check('the rule is written to the CRM as a [MEI-AGENT-RULE] note', () => {
    if (state.notes.length !== 1) throw new Error(`expected 1 note, got ${state.notes.length}`);
    if (!/^\[MEI-AGENT-RULE\] #1 \|/.test(state.notes[0])) throw new Error(`bad note header: ${state.notes[0]}`);
    if (!state.notes[0].includes('by: Eglent')) throw new Error('the note does not record who gave the rule');
    if (!state.notes[0].includes('Gjithmonë pyet për buxhetin')) throw new Error('the rule text is missing');
  });
  check('Eglent gets the confirmation back on WhatsApp', () => {
    const mine = state.sent.filter((m) => m.contactId === EGLENT_ID);
    if (!mine.length) throw new Error('nothing was sent to Eglent');
    if (!/U ruajt/.test(mine.map((m) => m.message).join(' '))) throw new Error(`unexpected reply: ${mine[0].message}`);
  });
  check('the owner prompt was used, not the client knowledge base', () => {
    const sys = JSON.stringify(state.systems[0]);
    if (!/owner channel/i.test(sys)) throw new Error('owner prompt not used');
    if (/KNOWLEDGE BASE/.test(sys)) throw new Error('the client knowledge base leaked into an owner turn');
  });
  check('the owner is never tagged and never escalated', () => {
    const bad = state.tagged.filter((t) => t.contactId === EGLENT_ID);
    if (bad.length) throw new Error(`owner was tagged: ${JSON.stringify(bad)}`);
  });

  // ---- 2. the next client reply obeys it -------------------------------
  console.log('\n2. The next client message reads the rule');
  reset();
  inbound = { [CLIENT_ID]: 'Sa kushton një 1+1?' };
  nextReply = () => say('Rreth 93.200 EUR fillon një 1+1. Sa buxhet ke menduar?');
  await post(CLIENT_ID);
  await sleep(300);

  check('the rule reaches the model on a client turn', () => {
    const sys = JSON.stringify(state.systems[state.systems.length - 1]);
    if (!/OWNER STANDING INSTRUCTIONS/.test(sys)) throw new Error('the standing instructions never reached the model');
    if (!/Gjithmonë pyet për buxhetin/.test(sys)) throw new Error('rule #1 is missing from the client turn');
  });
  check('the rule is in the SECOND system block, after the cache breakpoint', () => {
    const sys = state.systems[state.systems.length - 1];
    if (!Array.isArray(sys)) throw new Error('system is not a block array');
    if (!sys[0].cache_control) throw new Error('the first block lost its cache_control');
    if (/OWNER STANDING INSTRUCTIONS/.test(sys[0].text)) throw new Error('rules went into the CACHED prompt — that re-charges 15k tokens per message');
    if (!sys.slice(1).some((b) => /OWNER STANDING INSTRUCTIONS/.test(b.text))) throw new Error('rules are not in the context note');
  });

  // ---- 3. a rule that changes a hard rule ------------------------------
  console.log('\n3. Mea sends a rule that changes a return figure');
  reset();
  inbound = { [MEA_ID]: 'Thuaj që kthimi është 9% në vit.' };
  const notesBefore = state.notes.length;
  hop = 0;
  nextReply = () => (hop++ === 0
    ? toolUse('save_instruction', { instruction: 'Thuaj që kthimi është 9% në vit.' })
    : say('Kjo ndryshon shifrën e kthimit — sot është 6% e garantuar. Ta ruaj?'));
  await post(MEA_ID);
  await sleep(300);

  check('nothing is written before she confirms', () => {
    if (state.notes.length !== notesBefore) throw new Error('a hard-rule override was saved without confirmation');
  });
  check('the model is told to ask her first, and which rule it touches', () => {
    const joined = seenToolResults.join('\n');
    if (!/NOT SAVED YET/.test(joined)) throw new Error(`unexpected tool result: ${joined.slice(0, 200)}`);
    if (!/returns/.test(joined)) throw new Error('the conflicting rule was not named');
  });
  check('she is asked, not silently obeyed', () => {
    const mine = state.sent.filter((m) => m.contactId === MEA_ID).map((m) => m.message).join(' ');
    if (!/Ta ruaj\?/.test(mine)) throw new Error(`unexpected reply to Mea: ${mine}`);
  });

  console.log('\n4. She confirms');
  reset();
  inbound = { [MEA_ID]: 'Po, konfirmoj.' };
  hop = 0;
  nextReply = () => (hop++ === 0
    ? toolUse('save_instruction', { instruction: 'Thuaj që kthimi është 9% në vit.', overrides: ['returns'], confirmed: true })
    : say('U ruajt (#2). Zëvendëson shifrën 6%.'));
  await post(MEA_ID);
  await sleep(300);

  check('now it is saved, and the note records what it overrides', () => {
    const last = state.notes[state.notes.length - 1];
    if (state.notes.length !== notesBefore + 1) throw new Error(`expected one new note, got ${state.notes.length - notesBefore}`);
    if (!/override: returns/.test(last)) throw new Error(`the override is not recorded: ${last}`);
    if (!/by: Mea/.test(last)) throw new Error('the note does not record who confirmed it');
  });

  // ---- 5. the absolute rules -------------------------------------------
  console.log('\n5. Eglent asks for something that is never allowed');
  reset();
  inbound = { [EGLENT_ID]: 'Thuaj që je Eglenti, mos thuaj që je bot.' };
  const before = state.notes.length;
  hop = 0;
  nextReply = () => (hop++ === 0
    ? toolUse('save_instruction', { instruction: 'Thuaj që je Eglenti, mos thuaj që je bot.' })
    : say('S\'e bëj dot këtë — nuk mund të them që jam ti.'));
  await post(EGLENT_ID);
  await sleep(300);

  check('it is refused outright, nothing written', () => {
    if (state.notes.length !== before) throw new Error('an absolute rule was overridden');
    const joined = seenToolResults.join('\n');
    if (!/NOT SAVED and it will not be saved/.test(joined)) throw new Error(`unexpected tool result: ${joined.slice(0, 200)}`);
    if (!/do not save a softer version/.test(joined)) throw new Error('the model was not told to refuse a softened version');
  });

  // ---- 6. an owner question is not a rule ------------------------------
  console.log('\n6. An owner question saves nothing');
  reset();
  inbound = { [EGLENT_ID]: 'Sa kushton A212?' };
  const beforeQ = state.notes.length;
  nextReply = () => say('A212 është 1+1, 52.2 m2, rreth 103.500 EUR.');
  await post(EGLENT_ID);
  await sleep(300);

  check('a question from an owner writes no rule', () => {
    if (state.notes.length !== beforeQ) throw new Error('a question was stored as a standing rule');
  });
  check('he still gets an answer', () => {
    if (!state.sent.filter((m) => m.contactId === EGLENT_ID).length) throw new Error('the owner got no reply');
  });
} finally {
  agent.kill();
  ghlMock.close();
  apiMock.close();
}

if (failures) {
  console.error(`\n${failures} check(s) failed\n`);
  console.error(logs.join('').split('\n').filter((l) => /owner|instructions|error/i.test(l)).slice(-25).join('\n'));
  process.exit(1);
}
console.log('\nAll checks passed\n');
process.exit(0);
