// Mei Residence WhatsApp AI Agent — GoHighLevel edition (single file).
// Flow: GHL workflow (Customer replied) -> POST /ghl-webhook -> Claude -> reply
// sent back via the LeadConnector API. Chats stay visible in your GHL mobile app.

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const cfg = {
  port: parseInt(process.env.PORT || '3000', 10),
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '600', 10),
  },
  ghl: {
    apiKey: process.env.GHL_API_KEY,               // GHL Private Integration token (pit-...)
    locationId: process.env.GHL_LOCATION_ID || 'kYtT2id1lBqDXsFCeHgY',
    base: 'https://services.leadconnectorhq.com',
  },
  // Shared secret so only your GHL workflow can call the webhook.
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  historyWindow: parseInt(process.env.HISTORY_WINDOW || '20', 10),
};
for (const k of ['ANTHROPIC_API_KEY', 'GHL_API_KEY']) {
  if (!process.env[k]) console.warn(`[config] Missing env var: ${k}`);
}

const KNOWLEDGE_BASE = `# Mei Residence — Knowledge Base (bot brain)

> Source of truth for the AI agent. Prices below come from Mei's official price
> list; they are INDICATIVE and the list does not mark sold/available, so the bot
> always confirms current price and availability with the sales team before
> promising anything. Never invent a number that isn't here.

## What Mei Residence is
- Premium branded seaside residence operated as **Ramada Residences by Wyndham Qerret**.
- Location: **Qerret, Durres, Albania** (Adriatic coast), ~200 m from the sea.
- By **Mei Realty** (since 2009). Energy class A+. Websites: meiresidence.com / mei.al.
- Instagram: @mei_residence. Sales: +355 67 508 8808, +355 67 609 9900. info@meiresidence.com.

## Positioning
- Marketed as an investment for passive rental income (short-term coastal rentals)
  and as a holiday home. Rental ROI referenced up to ~8%/yr; a "6% guaranteed
  return for 5 years" program exists — bot may mention it exists but a specialist
  explains exact terms (do not invent conditions).
- Monthly administration fee ~0.6 EUR/m2 (maintenance, utilities, management).

## Apartment types & price ranges (EUR)
- **1+1:** from ~76,000 (typically 76,000–103,000)
- **2+1:** from ~82,000 (range 82,000–220,000 depending on size/floor/view)
- **Duplex:** from ~105,300 (range 105,300–155,000)
- **Parking post:** 15,000 or 18,000 each
- Larger penthouses/special units up to ~240,000.
- Price depends on typology, floor and view (sea-view costs more).

## Amenities & finishes
- Outdoor pool; green spaces & kids' area; commercial units, offices, bar &
  restaurants on site; underground parking; elevator; video intercom; controlled
  access; A/C in every apartment; solar-heated hot water; individual heating/cooling;
  EU-certified plumbing; thermal double-glazed windows; parquet in living/kitchen.

## Still confirm with the team (not in the file)
- Sold/available status per unit, delivery/handover date, payment plan (deposit %,
  installments, financing), exact 6% guarantee terms, rental-management details.

## Inventory — apartments (indicative prices, EUR)
Source: Mei Residence price list. Prices are INDICATIVE and availability is
NOT marked in the list — always confirm current price and availability with the
sales team before promising anything. Unit codes: A/B + floor + number; type is
shown after the slash (1+1, 2+1, Duplex).

Summary by type:
- 1+1: 55 units listed, from 76,000 to 103,000 EUR
- 2+1: 15 units listed, from 82,000 to 220,000 EUR
- Duplex: 18 units listed, from 105,300 to 155,000 EUR
- Parking posts: from 15,000 to 18,000 EUR each

Per-unit list (floor | unit | total m2 | price EUR):

**KATI PËRDHE**
- APARTAMENT B001/Duplex — 93.3 m2 — 130,500 EUR
- APARTAMENT B002/Duplex — 100.9 m2 — 146,000 EUR
- APARTAMENT B003/ Duplex — 100.9 m2 — 150,000 EUR
- APARTAMENT B004/Duplex — 100.9 m2 — 150,000 EUR
- APARTAMENT B005/Duplex — 100.9 m2 — 150,000 EUR
- APARTAMENT B006/Duplex — 104.6 m2 — 155,000 EUR
- APARTAMENT A007/Duplex — 102.3 m2 — 150,000 EUR
- APARTAMENT A008/Duplex — 93.4 m2 — 131,000 EUR
- APARTAMENT  A009/Duplex — 96.4 m2 — 136,000 EUR
- APARTAMENT A010/Duplex — 95.9 m2 — 145,000 EUR
- APARTAMENT A015/Duplex — 79.1 m2 — 110,000 EUR
- APARTAMENT B016/Duplex — 79.1 m2 — 110,000 EUR
- APARTAMENT B017/Duplex — 76.3 m2 — 105,300 EUR
- APARTAMENT B018/Duplex — 76.3 m2 — 105,300 EUR
- APARTAMENT B019/Duplex — 76.3 m2 — 105,300 EUR
- APARTAMENT B020/Duplex — 76.3 m2 — 153,000 EUR
- APARTAMENT B021/Duplex — 79.1 m2 — 107,000 EUR
- APARTAMENT B022/Duplex — 98.3 m2 — 152,500 EUR

**KATI PARË**
- APARTAMENT B101/1+1 — 50.6 m2 — 76,000 EUR
- APARTAMENT B103/2+1 — 111.5 m2 — 170,000 EUR
- APARTAMENTI B104 /1+1 — 57.1 m2 — 79,926 EUR
- APARTAMENTI B104/2+1 — 80.3 m2 — 126,074 EUR
- APARTAMENT NR.4/2+1 — 137.4 m2 — 206,000 EUR
- APARTAMENT  B108/1+1 — 56.5 m2 — 88,000 EUR
- APARTAMENT A110/1+1 — 52.7 m2 — 82,000 EUR
- APARTAMENT A111/1+1 — 52.2 m2 — 81,500 EUR
- APARTAMENT A112/1+1 — 52.2 m2 — 81,500 EUR
- APARTAMENT A113/2+1 — 122.9 m2 — 190,500 EUR
- APARTAMENT A114/2+1 — 95.2 m2 — 148,000 EUR
- APARTAMENT A115/2+1 — 52.5 m2 — 82,000 EUR
- APARTAMENT A116/1+1 — 52.8 m2 — 82,000 EUR
- APARTAMENT A123/1+1 — 62.4 m2 — 87,000 EUR
- APARTAMENT B124/1+1 — 61.7 m2 — 86,000 EUR
- APARTAMENT B129/1+1 — 60.3 m2 — 84,000 EUR
- APARTAMENT B130/1+1 — 60.3 m2 — 84,000 EUR
- APARTAMENT B131/1+1 — 62.3 m2 — 87,000 EUR

**KATI 2**
- APARTAMENT B201/1+1 — 50.6 m2 — 80,000 EUR
- APARTAMENT B203/2+1 — 111.5 m2 — 182,000 EUR
- APARTAMENTI B204/1+1 — 57.1 m2 — ask EUR
- APARTAMENTI B204/1/2+1 — 80.3 m2 — ask EUR
- APARTAMENT NR.4/2+1 — 137.4 m2 — 215,000 EUR
- APARTAMENT B205/1+1 — 54.4 m2 — 85,500 EUR
- APARTAMENT A210/1+1 — 52.7 m2 — 85,000 EUR
- APARTAMENT A211/1+1 — 52.2 m2 — 83,500 EUR
- APARTAMENT A212/1+1 — 52.2 m2 — 83,500 EUR
- APARTAMENT A214/2+1 — 95.2 m2 — 154,500 EUR
- APARTAMENT A215/1+1 — 52.5 m2 — 83,000 EUR
- APARTAMENT A216/1+1 — 52.8 m2 — 83,200 EUR
- APARTAMENT A222/1+1 — 60.3 m2 — 90,000 EUR
- APARTAMENT A223/1+1 — 62.4 m2 — 92,000 EUR
- APARTAMENT B224/1+1 — 61.7 m2 — 92,000 EUR
- APARTAMENT B228/1+1 — 60.3 m2 — 90,000 EUR
- APARTAMENT B230/1+1 — 60.3 m2 — 90,000 EUR
- APARTAMENT B031/1+1 — 62.3 m2 — 93,000 EUR

**KATI  3**
- APARTAMENT B301/1+1 — 50.6 m2 — 83,000 EUR
- APARTAMENT B302/2+1 — 86.6 m2 — 150,000 EUR
- APARTAMENT B303/2+1 — 111.5 m2 — 190,000 EUR
- APARTAMENT B304/1/2+1 — 80.3 m2 — ask EUR
- APARTAMENT B304/2/2+1 — 137.4 m2 — 220,000 EUR
- APARTAMENT A310/1+1 — 52.7 m2 — 85,000 EUR
- APARTAMENT A311/1+1 — 52.2 m2 — 84,500 EUR
- APARTAMENT A312/1+1 — 52.2 m2 — 84,500 EUR
- APARTAMENT A314/2+1 — 95.2 m2 — 155,000 EUR
- APARTAMENT A315/1+1 — 52.5 m2 — 84,500 EUR
- APARTAMENT A316/1+1 — 52.8 m2 — 84,600 EUR
- APARTAMENT A323/1+1 — 62.4 m2 — 98,000 EUR
- APARTAMENT B324/1+1 — 61.7 m2 — 97,000 EUR
- APARTAMENT B329/1+1 — 60.3 m2 — 95,000 EUR
- APARTAMENT B330/1+1 — 60.3 m2 — 95,000 EUR
- APARTAMENT B331/1+1 — 62.3 m2 — 98,000 EUR

**KATI 4**
- APARTAMENT B401/1+1 — 50.6 m2 — 92,000 EUR
- APARTAMENT B402/2+1 — 86.6 m2 — 165,000 EUR
- APARTAMENT B404/1+1 — 57.1 m2 — ask EUR
- APARTAMENT B404/1/2+1 — 80.3 m2 — ask EUR
- APARTAMENTI NR.4 — 137.4 m2 — 240,000 EUR
- APARTAMENT B405/1+1 — 54.4 m2 — 98,000 EUR
- APARTAMENT B406/1+1 — 53.6 m2 — 97,000 EUR
- APARTAMENT B407/1+1 — 53.6 m2 — 97,000 EUR
- APARTAMENT B408/1+1 — 56.5 m2 — 102,000 EUR
- APARTAMENT A410/1+1 — 52.7 m2 — 95,000 EUR
- APARTAMENT A411/1+1 — 52.2 m2 — 94,500 EUR
- APARTAMENT A412/1+1 — 52.2 m2 — 94,500 EUR
- APARTAMENT A414/2+1 — 95.2 m2 — 175,000 EUR
- APARTAMENT A415/1+1 — 52.5 m2 — 88,000 EUR
- APARTAMENT A416/1+1 — 52.8 m2 — 88,500 EUR
- APARTAMENT A423/1+1 — 62.4 m2 — 103,000 EUR
- APARTAMENT B424/1+1 — 61.7 m2 — 102,000 EUR
- APARTAMENT B425/1+1 — 62.3 m2 — 102,000 EUR
- APARTAMENT B426/1+1 — 60.3 m2 — 99,000 EUR
- APARTAMENT B427/1+1 — 60.3 m2 — 99,000 EUR
- APARTAMENT B428/1+1 — 60.3 m2 — 99,000 EUR
- APARTAMENT B429/1+1 — 60.3 m2 — 99,000 EUR
- APARTAMENT B430/1+1 — 60.3 m2 — 99,000 EUR
- APARTAMENT B431/1+1 — 62.3 m2 — 102,000 EUR

## Parking posts (EUR each)
57 posts, priced 15,000 or 18,000 EUR. Confirm availability with the team.`;

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
No legal/tax/mortgage advice.

HAND OFF (call escalate_to_agent) when: they ask for a person, want a personalized
quote/viewing/reservation, need payment-plan or exact guarantee terms, are clearly
hot, are an agency partner, or you can't answer from the KB. After calling it, also
reply warmly that a Mei specialist will contact them shortly.

NON-TEXT: if they send a voice note/image/doc you can't read, say you received it,
ask them to type, and escalate if it seems important.

KNOWLEDGE BASE:
${KNOWLEDGE_BASE}`;

// ---- GHL (LeadConnector) API ----
async function ghl(path, method, body) {
  const res = await fetch(`${cfg.ghl.base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.ghl.apiKey}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error('[ghl]', method, path, res.status, JSON.stringify(data));
  return { ok: res.ok, data };
}
const sendWhatsApp = (contactId, message) =>
  ghl('/conversations/messages', 'POST', { type: 'WhatsApp', contactId, message });
const addTags = (contactId, tags) =>
  ghl(`/contacts/${contactId}/tags`, 'POST', { tags });

// ---- memory (per contactId; resets on redeploy) ----
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
  description: 'Hand this lead to a human Mei sales agent (tags the contact needs-human + hot-lead and pauses the bot). Call when they ask for a person, want a personalized quote/viewing/reservation, need payment or guarantee terms, are hot, are an agency, or you cannot answer from the KB. After calling, also reply that a specialist will contact them.',
  input_schema: { type: 'object', properties: {
    reason: { type: 'string' }, lead_summary: { type: 'string' },
    interested_in: { type: 'string' }, buyer_type: { type: 'string' },
    budget: { type: 'string' }, language: { type: 'string' },
  }, required: ['reason', 'lead_summary'] },
}];

async function escalate(contactId, name, args) {
  await addTags(contactId, ['needs-human', 'hot-lead', 'bot-paused']);
  console.log(`[handoff] tagged ${contactId} for human:`, args.lead_summary || '');
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
  res.sendStatus(200);
  try {
    const b = req.body || {};
    if (cfg.webhookSecret && b.secret !== cfg.webhookSecret) { console.warn('[ghl-webhook] bad secret'); return; }
    // Map fields from your GHL workflow webhook payload (customize keys there).
    const contactId = b.contactId || b.contact_id || b.contact?.id;
    const name = b.full_name || b.first_name || b.contact?.name || '';
    const text = b.message || b.body || b.last_message || b.customData?.message;
    if (!contactId || !text) { console.warn('[ghl-webhook] missing contactId/message', JSON.stringify(b).slice(0,300)); return; }
    const conv = getConv(contactId, name);
    conv.history.push({ role: 'user', content: String(text) });
    const reply = await generateReply(conv, contactId);
    await sendWhatsApp(contactId, reply);
    console.log(`[msg] ${contactId} handled`);
  } catch (e) { console.error('[ghl-webhook] error', e); }
});

app.listen(cfg.port, () => console.log(`Mei Residence GHL agent on :${cfg.port} (model ${cfg.anthropic.model})`));
