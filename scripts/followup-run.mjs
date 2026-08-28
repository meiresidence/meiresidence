#!/usr/bin/env node
// Daily follow-up run — reads account 1's conversations, decides who needs a
// follow-up (day 0 -> 3 -> 7 -> 21), and STAGES the send for Eglent to fire.
// It never sends a message to a lead. Plan: claude/followup-agent-plan.md.
//
// Modes (FOLLOWUP_MODE):
//   readonly (default) - Phase 1. Classify and report only. Writes NOTHING to
//                        GHL: no tags, no notes. Output is the digest.
//   queue              - Phase 2+. Additionally applies fu-queue-d* tags, drops
//                        the drafted message into a contact note, and advances
//                        ladder state when a queued send is detected in the CRM.
//
// State lives in state/followup-state.json, committed by the workflow — same
// pattern as knowledge/learnings.md. GHL tags are for Eglent's filtering; the
// dates and stages that drive the ladder live here, where they can be compared,
// diffed and rolled back. (The n8n campaign's permanent, uncomparable
// mei-fu-sent tag is the cautionary tale.)
//
// Exit codes: 0 = ran (digest written) · 2 = fatal (config/API down).

import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { decide, queueTag, QUEUE_TAGS } from '../src/followup-agent/ladder.js';
import { classifyThread } from '../src/followup-agent/classify.js';

const cfg = {
  base: process.env.GHL_API_BASE || 'https://services.leadconnectorhq.com',
  token: process.env.GHL_API_KEY,
  locationId: process.env.GHL_LOCATION_ID || 'kYtT2id1lBqDXsFCeHgY', // account 1 ONLY
  mode: (process.env.FOLLOWUP_MODE || 'readonly').toLowerCase(),
  model: process.env.FOLLOWUP_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
  scanLimit: Math.min(parseInt(process.env.FOLLOWUP_SCAN_LIMIT || '100', 10), 100),
  lookbackDays: parseInt(process.env.FOLLOWUP_LOOKBACK_DAYS || '90', 10),
  maxClassify: parseInt(process.env.FOLLOWUP_MAX_CLASSIFY || '40', 10),
  maxQueue: parseInt(process.env.FOLLOWUP_MAX_QUEUE || '30', 10),
  includeLegacySent: process.env.FOLLOWUP_INCLUDE_MEI_FU_SENT === 'true',
  msgLimit: parseInt(process.env.FOLLOWUP_MSG_LIMIT || '60', 10),
};

const STATE_FILE = path.resolve('state/followup-state.json');
const DIGEST_FILE = path.resolve('.followup-digest.md');
const REPORT_FILE = path.resolve('.followup-report.json');
const DAY = 86400000;

// Day-0 templates are approved per account; account 1's set is configured here
// so the digest names the right one (see plan open question Q1).
const D0_TEMPLATE = process.env.FOLLOWUP_D0_TEMPLATE || 'mei_progres (needs approval in account 1)';

if (!cfg.token || !process.env.ANTHROPIC_API_KEY) {
  console.error('[followup] GHL_API_KEY and ANTHROPIC_API_KEY are required.');
  process.exit(2);
}
if (cfg.locationId !== 'kYtT2id1lBqDXsFCeHgY') {
  // Account 2 is worked by hand from +355 67 609 9900 (the 12 Aug collision).
  console.error(`[followup] REFUSING to run against location ${cfg.locationId} — account 1 only.`);
  process.exit(2);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ---------------------------------------------------------------- GHL ------
async function ghl(pathname, method = 'GET', body = null, version = '2021-04-15') {
  const res = await fetch(`${cfg.base}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Version: version,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GHL ${res.status} ${method} ${pathname}: ${JSON.stringify(data).slice(0, 180)}`);
  return data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHANNELS = {
  TYPE_WHATSAPP: 'whatsapp',
  TYPE_INSTAGRAM: 'instagram',
  TYPE_FACEBOOK: 'facebook',
  TYPE_SMS: 'sms',
};
const isActivity = (t = '') => t.startsWith('TYPE_ACTIVITY') || t === 'TYPE_INTERNAL_COMMENT';

function buildSnapshot(conversation, rawMessages, contact) {
  const msgs = (rawMessages || [])
    .filter((m) => m && typeof m.body === 'string' && m.body.trim())
    .filter((m) => !isActivity(m.messageType || m.type || ''))
    .map((m) => ({
      direction: m.direction === 'outbound' ? 'outbound' : 'inbound',
      body: String(m.body).trim(),
      channel: CHANNELS[m.messageType] || 'whatsapp',
      source: m.source || '',
      at: Date.parse(m.dateAdded || '') || 0,
    }))
    .sort((a, b) => a.at - b.at);

  const inbound = msgs.filter((m) => m.direction === 'inbound');
  const outbound = msgs.filter((m) => m.direction === 'outbound');
  const lastIn = inbound[inbound.length - 1];
  const lastOut = outbound[outbound.length - 1];

  return {
    contactId: conversation.contactId,
    name: conversation.fullName || conversation.contactName || contact?.firstName || '',
    tags: (contact?.tags || conversation.tags || []).map((t) => String(t).toLowerCase()),
    dndAll: contact?.dnd === true,
    phone: contact?.phone || conversation.phone || '',
    email: contact?.email || conversation.email || '',
    lastInboundAt: lastIn?.at || 0,
    lastOutboundAt: lastOut?.at || 0,
    lastInboundChannel: lastIn?.channel || '',
    inboundText: inbound.slice(-6).map((m) => m.body).join('\n'),
    transcript: msgs.slice(-30),
    includeLegacySent: cfg.includeLegacySent,
  };
}

// -------------------------------------------------------------- state ------
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
}

// A queued rung counts as SENT only when an outbound message appears in the
// thread after it was queued — never off the clock (plan: "stamp").
function detectSend(snap, st, now) {
  if (st.queuedStage === undefined || st.queuedStage === null) return null;
  if (!snap.lastOutboundAt || snap.lastOutboundAt <= (st.queuedAt || 0)) return null;
  const gapAfter = { 0: 3 * DAY, 3: 4 * DAY, 7: 14 * DAY, 21: 0 }[st.queuedStage] ?? 0;
  st.stage = st.queuedStage;
  st.lastSentAt = snap.lastOutboundAt;
  st.nextDueAt = gapAfter ? snap.lastOutboundAt + gapAfter : 0;
  const cleared = queueTag(st.queuedStage);
  delete st.queuedStage;
  delete st.queuedAt;
  delete st.sentiment; // a new rung means the old sentiment read is stale
  return cleared;
}

// -------------------------------------------------------------- main -------
async function main() {
  const now = Date.now();
  const sinceMs = now - cfg.lookbackDays * DAY;
  const state = loadState();
  const knowledge = fs.existsSync('knowledge.md')
    ? fs.readFileSync('knowledge.md', 'utf8').slice(0, 24000)
    : '';

  console.log(`[followup] mode=${cfg.mode} model=${cfg.model} location=${cfg.locationId}`);

  const search = await ghl(
    `/conversations/search?locationId=${cfg.locationId}&limit=${cfg.scanLimit}&sortBy=last_message_date&sort=desc&status=all`,
  );
  const conversations = (search?.conversations || []).filter((c) => {
    const t = Number(c.lastMessageDate || c.dateUpdated || 0);
    return t > 0 && t >= sinceMs && c.contactId;
  });
  console.log(`[followup] ${conversations.length} conversations active in the last ${cfg.lookbackDays}d`);

  const rows = []; // digest rows
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };
  let classifyBudget = cfg.maxClassify;
  let queueBudget = cfg.maxQueue;

  for (const conv of conversations) {
    let snap;
    try {
      const [m, contact] = await Promise.all([
        ghl(`/conversations/${conv.id}/messages?limit=${cfg.msgLimit}`),
        ghl(`/contacts/${conv.contactId}`, 'GET', null, '2021-07-28').then((d) => d?.contact || d).catch(() => null),
      ]);
      const msgs = m?.messages?.messages || m?.messages || [];
      snap = buildSnapshot(conv, msgs, contact);
    } catch (e) {
      console.warn(`[followup] could not read ${conv.contactId}: ${e.message}`);
      bump('read-error');
      continue;
    }
    await sleep(150); // stay polite with the API

    const st = state[snap.contactId] || {};
    const clearedTag = detectSend(snap, st, now);
    if (clearedTag) {
      state[snap.contactId] = st;
      if (cfg.mode === 'queue') await removeTag(snap.contactId, clearedTag);
      console.log(`[followup] send detected for ${snap.contactId} -> stage ${st.stage}`);
    }

    let d = decide(snap, st, now);

    // The model refines, never resurrects: only 'queue' and 'classify'
    // decisions get a Claude call, and only downgrades are accepted.
    let cls = null;
    if ((d.action === 'queue' || d.action === 'classify') && classifyBudget > 0) {
      classifyBudget--;
      try {
        cls = await classifyThread(anthropic, cfg.model, snap, d.action === 'queue' ? d.stage : null, knowledge);
      } catch (e) {
        console.error(`[followup] classify failed for ${snap.contactId}: ${e.message}`);
        bump('fu-error');
        rows.push(row(snap, st, { action: 'error', reason: 'classifier-failed' }, null));
        state[snap.contactId] = st;
        continue;
      }
      if (cls) {
        st.sentiment = cls.sentiment;
        st.language = cls.language;
        if (cls.state === 'unanswered') d = { action: 'unanswered', reason: 'open-question', open: cls.open_question };
        else if (cls.state === 'not_a_lead') d = { action: 'skip', reason: 'model-not-a-lead' };
        else if (cls.state === 'dead') d = { action: 'stop', reason: 'model-dead' };
        else if (cls.state === 'too_soon') d = { action: 'skip', reason: 'model-too-soon' };
        else if (d.action === 'classify') d = decide(snap, st, now); // sentiment now known — re-run the ladder
      }
    } else if (d.action === 'classify') {
      d = { action: 'skip', reason: 'classify-budget-exhausted' };
    }

    if (d.action === 'queue' && queueBudget <= 0) d = { action: 'skip', reason: 'daily-cap' };

    // ---- act ------------------------------------------------------------
    if (d.action === 'queue') {
      queueBudget--;
      st.queuedStage = d.stage;
      st.queuedAt = now;
      st.name = snap.name;
      if (cfg.mode === 'queue') {
        await addTags(snap.contactId, [queueTag(d.stage)]);
        const note =
          d.stage === 0
            ? `[follow-up agent] Day 0 staged. Template: ${D0_TEMPLATE}. Channel: ${d.channel}.`
            : `[follow-up agent] Day ${d.stage} staged. Channel: ${d.channel}.\n\nDraft:\n${cls?.draft || '(no draft — write by hand)'}`;
        await addNote(snap.contactId, note);
      }
    } else if (d.action === 'stop') {
      st.stage = 'stopped';
      if (cfg.mode === 'queue') await addTags(snap.contactId, ['fu-stop']);
    } else if (d.action === 'done') {
      st.stage = 'done';
      if (cfg.mode === 'queue') await addTags(snap.contactId, ['fu-done']);
    } else if (d.action === 'unanswered') {
      if (cfg.mode === 'queue') await addTags(snap.contactId, ['needs-human']);
    }

    bump(d.action === 'queue' ? `queue-d${d.stage}` : d.action === 'skip' ? `skip:${d.reason}` : d.action);
    if (d.action !== 'skip' || !TRIVIAL_SKIPS.has(d.reason)) rows.push(row(snap, st, d, cls));
    state[snap.contactId] = st;
  }

  saveState(state);
  writeDigest(rows, counts, now);
  console.log('[followup] done:', JSON.stringify(counts));
}

const TRIVIAL_SKIPS = new Set([
  'never-engaged', 'recent-outbound', 'too-soon-d0', 'not-due', 'conversation-live',
  'still-talking', 'gap-not-elapsed-d7', 'gap-not-elapsed-d21', 'dnd', 'no-channel',
]);

function row(snap, st, d, cls) {
  return {
    contactId: snap.contactId,
    name: snap.name || '(no name)',
    action: d.action,
    stage: d.stage,
    reason: d.reason,
    channel: d.channel || '',
    language: st.language || cls?.language || '',
    sentiment: st.sentiment || '',
    typology: cls?.typology || '',
    open: d.open || null,
    draft: cls?.draft || null,
    quietDays: snap.lastInboundAt ? Math.round((Date.now() - snap.lastInboundAt) / DAY) : null,
  };
}

const addTags = (id, tags) =>
  ghl(`/contacts/${id}/tags`, 'POST', { tags }, '2021-07-28').catch((e) => console.error('[tags]', e.message));
const removeTag = (id, tag) =>
  ghl(`/contacts/${id}/tags`, 'DELETE', { tags: [tag] }, '2021-07-28').catch((e) => console.error('[tags]', e.message));
const addNote = (id, body) =>
  ghl(`/contacts/${id}/notes`, 'POST', { body }, '2021-07-28').catch((e) => console.error('[notes]', e.message));

function writeDigest(rows, counts, now) {
  const date = new Date(now).toISOString().slice(0, 10);
  const unanswered = rows.filter((r) => r.action === 'unanswered');
  const queued = rows.filter((r) => r.action === 'queue');
  const stopped = rows.filter((r) => r.action === 'stop' || r.action === 'done');
  const lines = [
    `# Follow-up digest — ${date}`,
    '',
    `Mode: **${cfg.mode}**${cfg.mode === 'readonly' ? ' (nothing was written to GHL)' : ''}`,
    '',
    `| outcome | count |`,
    `|---|---|`,
    ...Object.entries(counts).sort().map(([k, v]) => `| ${k} | ${v} |`),
    '',
  ];
  if (unanswered.length) {
    lines.push(`## ⚠️ Unanswered questions — a human should reply TODAY`, '');
    for (const r of unanswered) lines.push(`- **${r.name}** (${r.contactId}): ${r.open || 'see thread'}`);
    lines.push('');
  }
  if (queued.length) {
    lines.push(`## Staged for sending (${queued.length})`, '');
    lines.push(`| contact | rung | channel | lang | typology | quiet |`, `|---|---|---|---|---|---|`);
    for (const r of queued) {
      lines.push(`| ${r.name} | d${r.stage} | ${r.channel} | ${r.language} | ${r.typology} | ${r.quietDays}d |`);
    }
    lines.push('');
    const drafts = queued.filter((r) => r.draft);
    if (drafts.length) {
      lines.push(`### Drafts for approval`, '');
      for (const r of drafts) lines.push(`**${r.name} — day ${r.stage} (${r.language}):**`, '', '```', r.draft, '```', '');
    }
    if (queued.some((r) => r.stage === 0)) {
      lines.push(`Day-0 sends use the approved template: \`${D0_TEMPLATE}\`.`, '');
    }
  }
  if (stopped.length) {
    lines.push(`## Left the ladder (${stopped.length})`, '');
    for (const r of stopped) lines.push(`- ${r.name}: ${r.reason}`);
    lines.push('');
  }
  lines.push(`---`, `_state: state/followup-state.json · plan: claude/followup-agent-plan.md_`);
  fs.writeFileSync(DIGEST_FILE, lines.join('\n') + '\n');
  fs.writeFileSync(REPORT_FILE, JSON.stringify({ date, mode: cfg.mode, counts, queued: queued.length, unanswered: unanswered.length }, null, 2));
  console.log(`[followup] digest -> ${DIGEST_FILE}`);
}

main().catch((e) => {
  console.error('[followup] FATAL:', e);
  process.exit(2);
});
