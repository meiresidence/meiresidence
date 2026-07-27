// Mei Residence WhatsApp AI Agent — GoHighLevel edition (direct send).
// Flow: GHL workflow (Customer replied) -> POST /ghl-webhook -> Claude ->
// the server reads the customer's message from the CRM, asks Claude, and sends
// the reply back via the GHL API. Works with a plain "Webhook" workflow action.
//
// Multi-channel note (2026-07-27 fix): this agent now also serves Facebook
// Messenger and Instagram DM (in addition to WhatsApp) via the same "Claude"
// workflow. Two bugs were fixed here:
//   1) The reply was always sent with type:'WhatsApp', which silently fails
//      for Instagram/Facebook contacts (no phone number). Reply now uses the
//      SAME channel the inbound message arrived on (WhatsApp / IG / FB).
//   2) The per-contact cooldown was claimed on every webhook call, including
//      calls with no real message text (e.g. an empty-body echo event that
//      Instagram/GHL sometimes fires a few seconds before the real message).
//      That let a real message arriving moments later get silently dropped
//      by the cooldown. The cooldown is now claimed only once we've found
//      real text to reply to.
//   3) A brand-new contact's very first message could trigger this webhook
//      before GHL's own conversation-search/messages API had indexed that
//      message yet, so the CRM read came back empty and the lead was never
//      answered (confirmed for contact "Liman" on 2026-07-25). fetchLastInbound
//      now retries a couple of times with a short delay before giving up.

import express from 'express';
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const cfg = {
  port: parseInt(process.env.PORT || '3000', 10),
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '600', 10),
  },
  ghl: {
    apiKey: process.env.GHL_API_KEY,
    locationId: process.env.GHL_LOCATION_ID || 'kYtT2id1lBqDXsFCeHgY',
    base: 'https://services.leadconnectorhq.com',
  },
  historyWindow: parseInt(process.env.HISTORY_WINDOW || '20', 10),
};
for (const k of ['ANTHROPIC_API_KEY', 'GHL_API_KEY']) {
  if (!process.env[k]) console.warn(`[config] Missing env var: ${k}`);
}

const KNOWLEDGE_BASE = fs.readFileSync(new URL('./knowledge.md', import.meta.url), 'utf8');

const SYSTEM_PROMPT = `You are the official assistant for Mei Residence, a
premium branded seaside residence (Ramada Residences by Wyndham) in Qerret, Durres,
Albania, sold by Mei Realty. You reply to people messaging Mei on WhatsApp, Facebook
Messenger, or Instagram DM.

GOALS: reply fast, warm and helpful like Mei's best human agent; give info from the
KNOWLEDGE BASE; gently learn if they are an investor or agency, which unit type
(1+1/2+1/duplex) and budget; hand off hot leads to a human.

STYLE: warm, professional, chat-short (1-4 sentences, plain text, at most one
emoji). Use their name if known. Ask ONE question at a time. ALWAYS reply in the
language the client writes in (Albanian, English, Italian, etc.); default Albanian
for a bare greeting. Never say you are an AI language model.

KNOWLEDGE RULES: answer ONLY from the KNOWLEDGE BASE. Prices there are indicative and
availability is not marked, so quote the price but say you'll confirm current price
and availability with the team. Never invent numbers, guarantee terms, or a fixed
total not listed. For the 6% guarantee: say it exists, a specialist explains terms.
No legal/tax/mortgage advice. You can share a unit's virtual-tour link if asked.
For the 6% guaranteed-return program: present it positively using the confirmed facts
(Wyndham-managed rentals, investors get 65% of net rental income, up to ~8% ROI). NEVER
invent exact guarantee conditions, and NEVER add disclaimers like 'a specialist will
confirm the terms' — just answer warmly and ask what they need. Only if they explicitly
ask for the precise legal terms of the 6% guarantee, warmly offer to connect them with
the team and call escalate_to_agent (no robotic disclaimer line).

HAND OFF (call escalate_to_agent) when: they ask for a person, want a personalized
quote/viewing/reservation, need payment-plan or exact guarantee terms, are clearly
hot, are an agency partner, or you can't answer from the KB. After calling it, also
reply warmly that a Mei specialist will contact them shortly. Route Polish clients to
Ania, Czech clients to Martin, others to Eglent or Visard (see KB).

NON-TEXT: if the message is empty or clearly a voice note/image/doc you can't read,
say you received it, ask them to type their question, and escalate if it seems important.

KNOWLEDGE BASE:
${KNOWLEDGE_BASE}`;

// ---- GHL (LeadConnector) API ----
async function ghl(path, method, body, version = '2021-04-15') {
  const res = await fetch(`${cfg.ghl.base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.ghl.apiKey}`,
      Version: version,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error('[ghl]', method, path, res.status, JSON.stringify(data).slice(0, 200));
  return { ok: res.ok, data };
}

// Map GHL's inbound message "messageType" to the outbound "type" the
// send-message endpoint expects. Defaults to WhatsApp if unrecognized.
const CHANNEL_TYPE_MAP = {
  TYPE_WHATSAPP: 'WhatsApp',
  TYPE_INSTAGRAM: 'IG',
  TYPE_FACEBOOK: 'FB',
  TYPE_SMS: 'SMS',
};

// Reply on whichever channel the inbound message actually came in on
// (WhatsApp / IG / FB), keyed by contactId — not by phone number, since
// Instagram/Facebook contacts have no phone.
const sendReply = (contactId, message, channel = 'WhatsApp') =>
  ghl('/conversations/messages', 'POST', { type: channel, contactId, message }, '2021-04-15');
const addTags = (contactId, tags) =>
  ghl(`/contacts/${contactId}/tags`, 'POST', { tags }, '2021-07-28');

// Pull the customer's most recent inbound message (text + channel) straight from the CRM.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A brand-new contact's very first message can trigger this webhook before
// GHL's own conversation-search/messages API has indexed that message yet
// (confirmed: "[ghl-webhook] no message text in CRM" moments after a first-ever
// inbound message, e.g. contact "Liman" on 2026-07-25 — the webhook fired 5s
// after the message arrived but the CRM read still came back empty, and since
// that contact never messaged again there was no second chance to reply).
// Retry a couple of times with a short delay before giving up.
async function fetchLastInboundOnce(contactId) {
  const s = await ghl(`/conversations/search?locationId=${cfg.ghl.locationId}&contactId=${contactId}`, 'GET', null, '2021-04-15');
  const convId = s.data?.conversations?.[0]?.id;
  if (!convId) return null;
  const m = await ghl(`/conversations/${convId}/messages`, 'GET', null, '2021-04-15');
  const msgs = m.data?.messages?.messages || m.data?.messages || [];
  for (const msg of msgs) {
    if (msg.direction === 'inbound' && msg.body && String(msg.body).trim()) {
      const rawType = msg.messageType || msg.type || 'TYPE_WHATSAPP';
      const channel = CHANNEL_TYPE_MAP[rawType] || 'WhatsApp';
      return { text: String(msg.body).trim(), channel };
    }
  }
  return null;
}

async function fetchLastInbound(contactId, retries = 2, delayMs = 1500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const found = await fetchLastInboundOnce(contactId);
      if (found) return found;
    } catch (e) { console.error('[fetchLastInbound]', e.message); }
    if (attempt < retries) {
      console.log(`[fetchLastInbound] no text yet for ${contactId}, retrying (${attempt + 1}/${retries})`);
      await sleep(delayMs);
    }
  }
  return { text: '', channel: 'WhatsApp' };
}

// ---- memory + per-contact reply cooldown (prevents duplicate/rapid replies) ----
const store = new Map();
const lastReplyAt = new Map();
const COOLDOWN_MS = parseInt(process.env.REPLY_COOLDOWN_MS || '12000', 10);
const getConv = (id, name = '') => {
  if (!store.has(id)) store.set(id, { name, history: [] });
  const c = store.get(id); if (name && !c.name) c.name = name; return c;
};
const trim = (c) => { if (c.history.length > cfg.historyWindow) c.history = c.history.slice(-cfg.historyWindow); };

// ---- Claude brain ----
const anthropic = new Anthropic({ apiKey: cfg.anthropic.apiKey });
const TOOLS = [{
  name: 'escalate_to_agent',
  description: 'Hand this lead to a human Mei sales agent (tags the contact needs-human + hot-lead). Call when they ask for a person, want a personalized quote/viewing/reservation, need payment or guarantee terms, are hot, are an agency, or you cannot answer from the KB. After calling, also reply that a specialist will contact them.',
  input_schema: { type: 'object', properties: {
    reason: { type: 'string' }, lead_summary: { type: 'string' },
    interested_in: { type: 'string' }, buyer_type: { type: 'string' },
    budget: { type: 'string' }, language: { type: 'string' },
  }, required: ['reason', 'lead_summary'] },
}];

async function escalate(contactId, name, args) {
  addTags(contactId, ['needs-human', 'hot-lead']).catch(() => {});
  console.log(`[handoff] tagged ${contactId}:`, args.lead_summary || '');
  return { ok: true };
}

async function generateReply(conv, contactId) {
  const messages = conv.history.map((m) => ({ role: m.role, content: m.content }));
  let finalText = '', escalated = false;
  for (let hop = 0; hop < 4; hop++) {
    const resp = await anthropic.messages.create({
      model: cfg.anthropic.model, max_tokens: cfg.anthropic.maxTokens,
      system: SYSTEM_PROMPT, tools: TOOLS, messages,
    });
    messages.push({ role: 'assistant', content: resp.content });
    conv.history.push({ role: 'assistant', content: resp.content });
    const parts = resp.content.filter((b) => b.type === 'text').map((b) => b.text);
    if (parts.length) finalText = parts.join('\n').trim();
    if (resp.stop_reason !== 'tool_use') break;
    const results = [];
    for (const b of resp.content) {
      if (b.type !== 'tool_use') continue;
      if (b.name === 'escalate_to_agent') { await escalate(contactId, conv.name, b.input || {}); escalated = true;
        results.push({ type: 'tool_result', tool_use_id: b.id, content: 'Tagged for a human. Now reply confirming a specialist will contact them shortly.' }); }
      else results.push({ type: 'tool_result', tool_use_id: b.id, content: 'Unknown tool.' });
    }
    messages.push({ role: 'user', content: results });
    conv.history.push({ role: 'user', content: results });
  }
  trim(conv);
  if (!finalText) finalText = escalated
    ? 'Faleminderit! Nje specialist i Mei Residence do t’ju kontaktoje shume shpejt.'
    : 'Faleminderit per mesazhin! Si mund t’ju ndihmoj per Mei Residence?';
  return finalText;
}

// ---- server ----
const app = express();
app.use(express.json());
app.get('/', (_q, r) => r.send('Mei Residence GHL agent is running.'));

app.post('/ghl-webhook', async (req, res) => {
  try {
    const b = req.body || {};
    const contactId = b.contactId || b.contact_id || b.id || b.contact?.id;
    if (!contactId) { console.warn('[ghl-webhook] no contactId'); return res.status(200).json({ reply: '' }); }

    // Cooldown check first, but we only CLAIM the cooldown window further
    // below once we've confirmed there's real text to reply to. This stops
    // an empty/no-op trigger (e.g. Instagram's echo event with no body) from
    // consuming the window and silently dropping the real message that
    // follows a few seconds later.
    const now = Date.now();
    if (now - (lastReplyAt.get(contactId) || 0) < COOLDOWN_MS) {
      console.log(`[skip] cooldown for ${contactId}`);
      return res.status(200).json({ reply: '' });
    }

    const name = b.full_name || b.first_name || b.name || b.contact?.name || '';
    // Always read the customer's latest message straight from the CRM (the webhook
    // body can send the message as an object, so we never rely on it), along with
    // which channel (WhatsApp/IG/FB) it came in on.
    const { text, channel } = await fetchLastInbound(contactId);
    if (!text) { console.warn('[ghl-webhook] no message text in CRM'); return res.status(200).json({ reply: '' }); }

    lastReplyAt.set(contactId, now); // claim the cooldown only now that we know we're replying
    const conv = getConv(contactId, name);
    conv.history.push({ role: 'user', content: String(text) });
    const reply = await generateReply(conv, contactId);
    const sent = await sendReply(contactId, reply, channel); // reply on the same channel it arrived on
    console.log(`[msg] ${contactId} (${channel}) <= "${String(text).slice(0,40)}" => sent:${sent.ok} "${reply.slice(0, 60)}"`);
    return res.status(200).json({ reply, contactId, channel });
  } catch (e) {
    console.error('[ghl-webhook] error', e);
    return res.status(200).json({ reply: '' });
  }
});

app.listen(cfg.port, () => console.log(`Mei Residence GHL agent on :${cfg.port} (model ${cfg.anthropic.model})`));
