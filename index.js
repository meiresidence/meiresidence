// Mei Residence WhatsApp AI Agent — GoHighLevel edition (native-send).
// Flow: GHL workflow (Customer replied) -> POST /ghl-webhook -> Claude ->
// the reply is RETURNED in the HTTP response, and the GHL workflow sends it
// natively (GHL blocks external API sends on this WhatsApp integration).
// The bot also fetches the customer's message text directly from the CRM,
// so it never depends on the workflow passing the text.

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

const SYSTEM_PROMPT = `You are the official WhatsApp assistant for Mei Residence, a
premium branded seaside residence (Ramada Residences by Wyndham) in Qerret, Durres,
Albania, sold by Mei Realty. You reply to people messaging Mei on WhatsApp.

GOALS: reply fast, warm and helpful like Mei's best human agent; give info from the
KNOWLEDGE BASE; gently learn if they are an investor or agency, which unit type
(1+1/2+1/duplex) and budget; hand off hot leads to a human.

STYLE: warm, professional, WhatsApp-short (1-4 sentences, plain text, at most one
emoji). Use their name if known. Ask ONE question at a time. ALWAYS reply in the
language the client writes in (Albanian, English, Italian, etc.); default Albanian
for a bare greeting. Never say you are an AI language model.

KNOWLEDGE RULES: answer ONLY from the KNOWLEDGE BASE. Prices there are indicative and
availability is not marked, so quote the price but say you'll confirm current price
and availability with the team. Never invent numbers, guarantee terms, or a fixed
total not listed. For the 6% guarantee: say it exists, a specialist explains terms.
No legal/tax/mortgage advice. You can share a unit's virtual-tour link if asked.

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
const addTags = (contactId, tags) =>
  ghl(`/contacts/${contactId}/tags`, 'POST', { tags }, '2021-07-28');

// Pull the customer's most recent inbound message text straight from the CRM,
// so we never depend on the workflow passing the text through.
async function fetchLastInboundText(contactId) {
  try {
    const s = await ghl(`/conversations/search?locationId=${cfg.ghl.locationId}&contactId=${contactId}`, 'GET', null, '2021-04-15');
    const convId = s.data?.conversations?.[0]?.id;
    if (!convId) return '';
    const m = await ghl(`/conversations/${convId}/messages`, 'GET', null, '2021-04-15');
    const msgs = m.data?.messages?.messages || m.data?.messages || [];
    for (const msg of msgs) {
      if (msg.direction === 'inbound' && msg.body && String(msg.body).trim()) return String(msg.body).trim();
    }
    return '';
  } catch (e) { console.error('[fetchLastInbound]', e.message); return ''; }
}


// Write the AI reply into the contact's "AI Reply" custom field, so the GHL
// workflow can send it natively (GHL blocks external API sends here).
let replyFieldId = null;
async function getReplyFieldId() {
  if (replyFieldId) return replyFieldId;
  const r = await ghl(`/locations/${cfg.ghl.locationId}/customFields`, 'GET', null, '2021-07-28');
  const fields = r.data?.customFields || r.data?.customField || [];
  const f = fields.find((x) => {
    const n = (x.name || '').toLowerCase();
    const k = (x.fieldKey || x.key || '').toLowerCase();
    return n === 'ai reply' || k.includes('ai_reply');
  });
  replyFieldId = f?.id || null;
  if (!replyFieldId) console.warn('[reply-field] "AI Reply" custom field not found — create it in GHL');
  return replyFieldId;
}
async function writeReplyToContact(contactId, reply) {
  try {
    const fid = await getReplyFieldId();
    if (!fid) return;
    const r = await ghl(`/contacts/${contactId}`, 'PUT', { customFields: [{ id: fid, value: reply }] }, '2021-07-28');
    console.log(`[reply-field] wrote reply to ${contactId}: ${r.ok ? 'ok' : 'FAILED'}`);
  } catch (e) { console.error('[reply-field]', e.message); }
}

// ---- memory ----
const store = new Map();
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
    const name = b.full_name || b.first_name || b.name || b.contact?.name || '';
    // Prefer the workflow-passed text; if missing/unresolved, read it from the CRM.
    let text = b.message || b.body || b.last_message || b.customData?.message || '';
    if (!text || String(text).trim() === '' || String(text).includes('{{')) {
      text = await fetchLastInboundText(contactId);
    }
    if (!text) { console.warn('[ghl-webhook] no message text'); return res.status(200).json({ reply: '' }); }
    const conv = getConv(contactId, name);
    conv.history.push({ role: 'user', content: String(text) });
    const reply = await generateReply(conv, contactId);
    await writeReplyToContact(contactId, reply);
    console.log(`[msg] ${contactId} <= "${String(text).slice(0,40)}" => "${reply.slice(0, 60)}"`);
    // The GHL workflow sends this reply natively (GHL blocks external API sends here).
    return res.status(200).json({ reply, contactId });
  } catch (e) {
    console.error('[ghl-webhook] error', e);
    return res.status(200).json({ reply: '' });
  }
});

app.listen(cfg.port, () => console.log(`Mei Residence GHL agent on :${cfg.port} (model ${cfg.anthropic.model})`));
