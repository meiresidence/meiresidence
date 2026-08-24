// Rebuild the real conversation from the CRM, so the agent never answers blind.
//
// WHY THIS FILE EXISTS (2026-08-24, the "template reply gets a clueless answer"
// failure): Eglent sent the Albanian re-engagement follow-up as a bulk WhatsApp
// template. Contact Mimoza replied three times in six seconds — an Instagram
// post quote ("*Headline:* Mei Residence ... on this?"), then "Qa eshte", then
// "Kjo" — and the agent answered, in ENGLISH:
//   "Hi! I can see you're referencing a Mei Residence post, but I can't view the
//    image/content itself — could you tell me what you'd like to know...?"
//
// Three separate causes, all of them in how the message was READ, not in the
// knowledge base:
//   1. The agent only ever fetched the LAST INBOUND message and kept history in
//      a process-local Map. The follow-up template it was replying to lives in
//      the CRM, not in that Map, so on a fresh dyno the agent literally had no
//      idea a message had just gone out. It answered as if the chat started
//      with "on this?".
//   2. The other two messages ("Qa eshte", "Kjo") were dropped by the reply
//      cooldown — the burst was never even seen.
//   3. Language was judged from that one quoted-post fragment, which is English
//      boilerplate, so an Albanian client got an English reply.
//
// buildThread is a pure function over GHL's /conversations/{id}/messages payload:
// it returns the whole recent thread as Claude turns (their messages AND ours,
// template included), plus every unanswered inbound message merged into one turn.

export const CHANNEL_TYPE_MAP = {
  TYPE_WHATSAPP: 'WhatsApp',
  TYPE_INSTAGRAM: 'IG',
  TYPE_FACEBOOK: 'FB',
  TYPE_SMS: 'SMS',
};

// WhatsApp writes this into the thread when a message can't be rendered
// (expired media, an unsupported type). It carries no client intent.
const UNREADABLE = /^this message is currently unavailable\.?$/i;

// A message we sent from a bulk send, a workflow or a campaign is an automated
// follow-up template — not something a human typed for this one person.
const AUTOMATED_SOURCES = new Set(['bulk_actions', 'campaign', 'workflow', 'automated']);

const isActivity = (t = '') => t.startsWith('TYPE_ACTIVITY') || t === 'TYPE_INTERNAL_COMMENT';

function normalize(rawMessages) {
  return (rawMessages || [])
    .filter((m) => m && typeof m.body === 'string' && m.body.trim())
    .filter((m) => !isActivity(m.messageType || m.type || ''))
    .map((m) => ({
      id: m.id,
      direction: m.direction === 'outbound' ? 'outbound' : 'inbound',
      body: String(m.body).trim(),
      messageType: m.messageType || 'TYPE_WHATSAPP',
      source: m.source || '',
      at: Date.parse(m.dateAdded || '') || 0,
    }))
    .sort((a, b) => a.at - b.at); // GHL returns newest-first; we want a transcript
}

/**
 * @param {object[]} rawMessages  GHL messages array (any order)
 * @param {{historyTurns?: number}} opts
 * @returns {null | {
 *   history: {role:'user'|'assistant', content:string}[],
 *   text: string,             // every unanswered client message, oldest first
 *   channel: string,          // WhatsApp | IG | FB | SMS
 *   lastInboundId: string,    // dedupe key: have we already answered this one?
 *   pendingCount: number,
 *   afterTemplate: boolean,   // our last message was an automated follow-up
 *   lastOutboundBody: string,
 * }}
 * Returns null when there is nothing new from the client to answer.
 */
export function buildThread(rawMessages, { historyTurns = 20 } = {}) {
  const msgs = normalize(rawMessages);
  if (!msgs.length) return null;

  // Everything after our last outbound message is unanswered.
  let cut = msgs.length;
  while (cut > 0 && msgs[cut - 1].direction === 'inbound') cut--;
  let pending = msgs.slice(cut);
  if (!pending.length) return null;

  // Drop WhatsApp's "currently unavailable" placeholder — unless it is all we
  // got, in which case we still reply (the NON-TEXT rule in the prompt).
  const readable = pending.filter((m) => !UNREADABLE.test(m.body));
  if (readable.length) pending = readable;

  const priorMsgs = msgs.slice(0, cut).filter((m) => !UNREADABLE.test(m.body));
  const lastOutbound = [...priorMsgs].reverse().find((m) => m.direction === 'outbound');

  // Their messages and ours, as a transcript. Consecutive same-role messages
  // merge into one turn (the Messages API requires alternating roles).
  const history = [];
  for (const m of priorMsgs) {
    const role = m.direction === 'inbound' ? 'user' : 'assistant';
    const prev = history[history.length - 1];
    if (prev && prev.role === role) prev.content += `\n${m.body}`;
    else history.push({ role, content: m.body });
  }
  while (history.length && history[0].role !== 'user') history.shift();

  return {
    history: history.slice(-historyTurns),
    text: pending.map((m) => m.body).join('\n'),
    channel: CHANNEL_TYPE_MAP[pending[pending.length - 1].messageType] || 'WhatsApp',
    lastInboundId: pending[pending.length - 1].id,
    pendingCount: pending.length,
    afterTemplate: !!lastOutbound && AUTOMATED_SOURCES.has(lastOutbound.source),
    lastOutboundBody: lastOutbound ? lastOutbound.body : '',
  };
}
