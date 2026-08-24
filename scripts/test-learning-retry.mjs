#!/usr/bin/env node
// End-to-end tests for the learner's retry loop and the validator's hard/soft split.
//
//   node scripts/test-learning-retry.mjs
//
// Runs scripts/learn-from-chats.mjs for real, against a local stub standing in
// for both GoHighLevel and the Anthropic API, and asserts on the exit code and
// the run report. No network, no API key, no cost.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validate } from './validate-learnings.mjs';
import { classify, severityOf } from './guardrail-severity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const GUARDRAILS = JSON.parse(fs.readFileSync(path.join(__dirname, 'guardrails.json'), 'utf8'));
const REPORT = path.join(ROOT, '.learning-report.json');
const CANDIDATE = path.join(ROOT, 'knowledge', 'learnings.candidate.md');

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? '  ✅' : '  ❌'} ${name}${cond || !extra ? '' : ` — ${extra}`}`);
  if (!cond) failures++;
}

// ---------------------------------------------------------------- fixtures --
/**
 * A structurally valid draft, built from the file that is actually live so the
 * churn rules (which compare against it) see a normal day's edit rather than a
 * total rewrite. `pad` grows it to that many characters; `extraLine` appends a
 * single line, which is also what makes it differ from the current file.
 */
const LIVE = fs.readFileSync(path.join(ROOT, 'knowledge', 'learnings.md'), 'utf8');

function draft({ pad = 0, extraLine = '' } = {}) {
  let out = `${LIVE.trimEnd()}\n`;
  if (extraLine) out += `${extraLine}\n`;
  const padLine = '- Buyers ask about delivery timing before anything else.\n';
  while (out.length < pad) out += padLine;
  return out;
}

const OVERSIZED = { pad: GUARDRAILS.limits.maxChars + 300 };
const FRESH = { extraLine: '- Ask about financing early, it comes up in most chats.' };

// A conversation pair the learner will consider worth reading (needs >= 2
// conversations, each with >= 2 messages).
function ghlConversations() {
  return [1, 2, 3].map((i) => ({
    id: `conv${i}`,
    lastMessageDate: Date.now() - 3600 * 1000,
  }));
}
function ghlMessages() {
  return {
    messages: {
      messages: [
        { direction: 'inbound', body: 'A sa larg eshte deti?', dateAdded: '2026-08-23T09:00:00Z' },
        { direction: 'outbound', body: 'Rreth 280 m nga plazhi.', dateAdded: '2026-08-23T09:01:00Z' },
        { direction: 'inbound', body: 'Si funksionon menaxhimi?', dateAdded: '2026-08-23T09:02:00Z' },
      ],
    },
  };
}

// ------------------------------------------------------------------- stub ---
/** `replies` is consumed one per Anthropic call. */
function startStub(replies) {
  const calls = [];
  let last = null;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url.includes('/v1/messages')) {
        if (replies.length) last = replies.shift();
        const body = last ?? draft(FRESH);
        calls.push(raw);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(
          JSON.stringify({
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            model: 'stub',
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1 },
            content: [{ type: 'text', text: `${body}\nDIGEST: test digest` }],
          }),
        );
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url.includes('/conversations/search')) {
        return res.end(JSON.stringify({ conversations: ghlConversations() }));
      }
      return res.end(JSON.stringify(ghlMessages()));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, calls }));
  });
}

function runLearner(port, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'learn-from-chats.mjs')], {
      cwd: ROOT,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: 'sk-test',
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
        GHL_BASE: `http://127.0.0.1:${port}`,
        GHL_API_KEY: 'ghl-test',
        DRY_RUN: '',
        ...env,
      },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => {
      let report = null;
      try {
        report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
      } catch {}
      resolve({ code, out, report });
    });
  });
}

async function scenario(name, replies, env = {}) {
  const { server, port, calls } = await startStub(replies);
  const r = await runLearner(port, env);
  server.close();
  console.log(`\n${name}`);
  return { ...r, apiCalls: calls.length, calls };
}

// ------------------------------------------------------------------ tests ---
console.log('Guardrail severity');
check('size/max is soft', severityOf('size/max') === 'soft');
check('structure/sections is soft', severityOf('structure/sections') === 'soft');
check('churn/growth is soft', severityOf('churn/growth') === 'soft');
check('banned/roi-8pct is hard', severityOf('banned/roi-8pct') === 'hard');
check('pii/phone-e164 is hard', severityOf('pii/phone-e164') === 'hard');
check('injection/suspicious-instruction is hard', severityOf('injection/suspicious-instruction') === 'hard');
check('an unknown rule fails closed as hard', severityOf('something/new') === 'hard');

console.log('\nValidator classification');
{
  const current = LIVE;
  const tooLong = classify(validate(draft(OVERSIZED), current));
  check('oversized draft is not ok', tooLong.ok === false);
  check('oversized draft is retryable', tooLong.retryable === true);
  check('oversized draft has no hard problems', tooLong.hard.length === 0);

  const withPhone = classify(validate(draft({ extraLine: '- Lead reached us on +355691234567.' }), current));
  check('phone number is not ok', withPhone.ok === false);
  check('phone number is NOT retryable', withPhone.retryable === false);
  check('phone number lands in hard', withPhone.hard.some((p) => p.rule.startsWith('pii/')));

  const clean = classify(validate(LIVE, LIVE));
  check('the live learnings.md still passes', clean.ok === true, JSON.stringify(clean.problems));
}

{
  // 1. Soft failure on the first pass, fixed on the second.
  const r = await scenario(
    'Retries a soft violation and commits the correction',
    [draft(OVERSIZED), draft(FRESH)],
  );
  check('exit 0 (candidate ready to commit)', r.code === 0, `exit ${r.code}\n${r.out.slice(-1500)}`);
  check('called the model twice', r.apiCalls === 2, `${r.apiCalls} call(s)`);
  check('report records 2 attempts', r.report?.attempts?.length === 2);
  check('attempt 1 logged size/max as soft', r.report?.attempts?.[0]?.soft?.includes('size/max'));
  check('attempt 2 passed', r.report?.attempts?.[1]?.ok === true);
  check('retry prompt carried the rejected draft', /rejected_draft/.test(r.calls[1] || ''));
  check('retry prompt withheld the transcripts', !/LEAD:/.test(r.calls[1] || ''));
}

{
  // 2. Hard failure — must stop on attempt 1 without spending another call.
  const r = await scenario(
    'Refuses to retry a hard violation',
    [draft({ extraLine: '- Promise up to 8% return when they hesitate.' }), draft(FRESH)],
  );
  check('exit 2 (rejected)', r.code === 2, `exit ${r.code}`);
  check('called the model exactly once', r.apiCalls === 1, `${r.apiCalls} call(s)`);
  check('report records 1 attempt', r.report?.attempts?.length === 1);
  check('the hard rule is named in the report', r.report?.attempts?.[0]?.hard?.some((x) => x.startsWith('banned/')));
  check('status is rejected', r.report?.status === 'rejected');
  check('rejected draft kept for the alert issue', fs.existsSync(CANDIDATE));
}

{
  // 3. Soft failure that never gets fixed — give up after maxAttempts.
  const r = await scenario(
    'Gives up after LEARN_MAX_ATTEMPTS and still fails closed',
    [draft(OVERSIZED)],
    { LEARN_MAX_ATTEMPTS: '3' },
  );
  check('exit 2 (rejected)', r.code === 2, `exit ${r.code}`);
  check('called the model 3 times', r.apiCalls === 3, `${r.apiCalls} call(s)`);
  check('report records 3 attempts', r.report?.attempts?.length === 3);
  check('status is rejected', r.report?.status === 'rejected');
}

{
  // 4. Clean first pass — no retry, no extra spend.
  const r = await scenario('Commits a clean first pass with no retry', [draft(FRESH)]);
  check('exit 0', r.code === 0, `exit ${r.code}`);
  check('called the model once', r.apiCalls === 1, `${r.apiCalls} call(s)`);
  check('report records 1 attempt', r.report?.attempts?.length === 1);
}

// Leave no test artefacts behind.
for (const f of [REPORT, CANDIDATE]) if (fs.existsSync(f)) fs.unlinkSync(f);

console.log(`\n${failures === 0 ? '✅ all checks passed' : `❌ ${failures} check(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
