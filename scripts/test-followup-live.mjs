#!/usr/bin/env node
// End-to-end smoke test for scripts/followup-run.mjs against a MOCK GHL.
// No real API is touched: GHL_API_BASE points at a local server and the
// classify budget is 0 so no Anthropic call is made. Verifies that:
//   - readonly mode writes NOTHING to GHL (no tag/note requests arrive)
//   - a 20-day-quiet lead is queued for day 0 in the digest
//   - a recently-answered lead is not
//   - queue mode DOES apply the fu-queue-d0 tag and a note
//   - state/followup-state.json records the queued rung
// Run: node scripts/test-followup-live.mjs

import express from 'express';
import fs from 'fs';
import { execFile } from 'child_process';

const NOW = Date.now();
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();

const contacts = {
  quiet20d: {
    id: 'quiet20d', name: 'Arben Quiet', phone: '+355691111111', email: '', tags: [],
    msgs: [
      { direction: 'inbound', body: 'Sa kushton nje 1+1?', dateAdded: iso(NOW - 21 * DAY), messageType: 'TYPE_WHATSAPP' },
      { direction: 'outbound', body: 'Pershendetje! 1+1 nis nga ...', dateAdded: iso(NOW - 21 * DAY + 3600000), messageType: 'TYPE_WHATSAPP' },
      { direction: 'inbound', body: 'Faleminderit, po e shoh', dateAdded: iso(NOW - 20 * DAY), messageType: 'TYPE_WHATSAPP' },
    ],
  },
  active: {
    id: 'active', name: 'Blerta Active', phone: '+355692222222', email: '', tags: [],
    msgs: [
      { direction: 'inbound', body: 'A eshte i lire A212?', dateAdded: iso(NOW - 2 * 3600000), messageType: 'TYPE_WHATSAPP' },
      { direction: 'outbound', body: 'Po, i lire — Eglent konfirmon sot.', dateAdded: iso(NOW - 3600000), messageType: 'TYPE_WHATSAPP' },
    ],
  },
  stopped: {
    id: 'stopped', name: 'Stop Person', phone: '+355693333333', email: '', tags: ['fu-stop'],
    msgs: [
      { direction: 'inbound', body: 'Info?', dateAdded: iso(NOW - 30 * DAY), messageType: 'TYPE_WHATSAPP' },
    ],
  },
};

const writes = []; // every mutating request the runner sends
const app = express();
app.use(express.json());
app.get('/conversations/search', (_q, res) => res.json({
  conversations: Object.values(contacts).map((c) => ({
    id: `conv-${c.id}`, contactId: c.id, fullName: c.name,
    lastMessageDate: Math.max(...c.msgs.map((m) => Date.parse(m.dateAdded))),
  })),
}));
app.get('/conversations/:id/messages', (req, res) => {
  const c = contacts[req.params.id.replace('conv-', '')];
  res.json({ messages: { messages: c ? c.msgs : [] } });
});
app.get('/contacts/:id', (req, res) => {
  const c = contacts[req.params.id];
  res.json({ contact: c ? { id: c.id, phone: c.phone, email: c.email, tags: c.tags, dnd: false } : {} });
});
app.post('/contacts/:id/tags', (req, res) => { writes.push({ kind: 'tags', id: req.params.id, tags: req.body.tags }); res.json({}); });
app.delete('/contacts/:id/tags', (req, res) => { writes.push({ kind: 'untag', id: req.params.id, tags: req.body.tags }); res.json({}); });
app.post('/contacts/:id/notes', (req, res) => { writes.push({ kind: 'note', id: req.params.id }); res.json({}); });

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
let fail = 0;
const check = (name, ok) => { if (ok) console.log(`✓ ${name}`); else { fail++; console.error(`✗ ${name}`); } };

function runProcess(args, env) {
  // execFileSync would block this process's event loop and deadlock the mock
  // server that lives here — the run must be async while express keeps serving.
  return new Promise((resolve, reject) => {
    execFile('node', args, { env }, (err, stdout, stderr) => {
      if (err) reject(new Error(`runner failed: ${err.message}\n${stderr}`));
      else resolve(stdout);
    });
  });
}

async function run(mode) {
  fs.rmSync('state/followup-state.json', { force: true });
  fs.rmSync('.followup-digest.md', { force: true });
  writes.length = 0;
  await runProcess(['scripts/followup-run.mjs'], {
    ...process.env,
    GHL_API_BASE: base,
    GHL_API_KEY: 'mock',
    GHL_LOCATION_ID: 'kYtT2id1lBqDXsFCeHgY',
    ANTHROPIC_API_KEY: 'mock-never-called',
    FOLLOWUP_MODE: mode,
    FOLLOWUP_MAX_CLASSIFY: '0', // guarantees no Anthropic call in this test
  });
  return {
    digest: fs.readFileSync('.followup-digest.md', 'utf8'),
    state: JSON.parse(fs.readFileSync('state/followup-state.json', 'utf8')),
  };
}

try {
  // ---- readonly: Phase 1 -------------------------------------------------
  const ro = await run('readonly');
  check('readonly: no writes reach GHL', writes.length === 0);
  check('readonly: 20-day-quiet lead queued for d0', /Arben Quiet \| d0/.test(ro.digest));
  check('readonly: active lead not queued', !/Blerta/.test(ro.digest));
  check('readonly: fu-stop contact not queued', !/Stop Person \| d0/.test(ro.digest));
  check('readonly: state records the queued rung', ro.state.quiet20d?.queuedStage === 0);
  check('readonly digest says nothing was written', /nothing was written to GHL/.test(ro.digest));

  // ---- queue: Phase 2 ----------------------------------------------------
  const q = await run('queue');
  const tagged = writes.find((w) => w.kind === 'tags' && w.id === 'quiet20d');
  const noted = writes.find((w) => w.kind === 'note' && w.id === 'quiet20d');
  check('queue: fu-queue-d0 tag applied', !!tagged && tagged.tags.includes('fu-queue-d0'));
  check('queue: staging note written', !!noted);
  check('queue: no writes for the active lead', !writes.some((w) => w.id === 'active'));
  check('queue: no writes for the fu-stop contact', !writes.some((w) => w.id === 'stopped'));
  check('queue: state persisted', q.state.quiet20d?.queuedStage === 0);
} finally {
  fs.rmSync('state/followup-state.json', { force: true });
  fs.rmSync('.followup-digest.md', { force: true });
  fs.rmSync('.followup-report.json', { force: true });
  server.close();
}

console.log(fail ? `\n${fail} FAILED` : '\n✓ followup-run behaves in both modes');
process.exit(fail ? 1 : 0);
