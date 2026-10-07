// Proactive replies (2026-10-07).
//
// Eglent's ask: when a lead asks for a price — or anything — the agent gives them
// what they asked for and then asks back, the way a person would: does it fit,
// what else would they like to know. The agent used to answer and stop, and was
// even told "you do not have to end every message with a question". A buyer who
// gets a price and nothing to reply to often does not reply at all.
//
// The rule itself lives in the prompt (BE PROACTIVE in index.js). This module is
// the deterministic half, same contract as src/voice.js and src/recall.js:
//   - before generation: tell the model which questions it has already asked this
//     client, so the question back is never a repeat;
//   - after generation: LOG a substantive reply that ends without a question, or
//     that ends on a generic form-letter question. It never rewrites a reply —
//     appending a canned question mechanically is exactly the bot behaviour this
//     is meant to remove.

const textOf = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((b) => (typeof b === 'string' ? b : b?.type === 'text' ? b.text || '' : '')).join(' ');
  }
  return '';
};

const stripLinks = (s) => String(s || '').replace(/https?:\/\/[^\s<>()"']+/gi, ' ');

/** The last sentence of a message that asks something, or '' if it asks nothing. */
export function trailingQuestion(text) {
  const body = stripLinks(text).trim();
  if (!body.includes('?')) return '';
  const parts = body.split(/\n+|(?<=[.!?…])\s+/).map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].includes('?')) return parts[i].replace(/\s+/g, ' ').slice(0, 160);
  }
  return '';
}

/** Does the reply finish on a question (its last non-empty line asks something)? */
export function endsWithQuestion(text) {
  const lines = stripLinks(text).split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return false;
  const last = lines[lines.length - 1].replace(/[\s\p{Extended_Pictographic}\uFE0F\u200D]+$/u, '');
  return /[?？¿]/.test(last);
}

// A message that only acknowledges — nothing was asked, so nothing must be answered.
const ACK_ONLY = /^(?:ok+|okay|okej|po|jo|dakord|mir[eë]|shum[eë] mir[eë]|faleminderit|flm|rrofsh|perfekt|bravo|super|thanks?|thank you|thx|ty|danke|grazie|dzi[eę]kuj[eę]|merci|great|nice|cool)[\s!.,…\p{Extended_Pictographic}\uFE0F\u200D]*$/iu;
const EMOJI_ONLY = /^[\s\p{Extended_Pictographic}\uFE0F\u200D!.]+$/u;

export function isAckOnly(clientText) {
  const t = String(clientText || '').trim();
  if (!t) return true;
  return t.split('\n').every((line) => {
    const l = line.trim();
    return !l || ACK_ONLY.test(l) || EMOJI_ONLY.test(l);
  });
}

// Form-letter questions that ask nothing. Banned in the prompt; logged here.
export const GENERIC_FOLLOWUPS = [
  /a (?:keni|ke) (?:ndonj[eë] )?pyetje (?:tjet[eë]r|t[eë] tjera)/i,
  /a mund t[’'`]?(?:ju|të) ndihmoj (?:me )?di[cç]ka tjet[eë]r/i,
  /n[eë]se (?:keni|ke) (?:ndonj[eë] )?pyetje/i,
  /(?:is there )?anything else (?:i can help you with|i can do for you)/i,
  /do you have any (?:other|more|further) questions/i,
  /let me know if you have any (?:other |more |further )?questions/i,
  /feel free to ask/i,
  /haben sie (?:noch )?(?:weitere )?fragen/i,
  /ha (?:altre|ulteriori) domande/i,
];

export function findGenericFollowups(text) {
  const body = String(text || '');
  return GENERIC_FOLLOWUPS.filter((re) => re.test(body)).map((re) => re.source);
}

/** The questions we already put to this client, most recent last. */
export function questionsAlreadyAsked(thread = {}, max = 3) {
  const turns = Array.isArray(thread.history) ? thread.history : [];
  const ours = turns.filter((t) => t.role === 'assistant').map((t) => textOf(t.content));
  if (thread.lastOutboundBody && ours[ours.length - 1] !== thread.lastOutboundBody) ours.push(thread.lastOutboundBody);
  const qs = [];
  for (const msg of ours) {
    const q = trailingQuestion(msg);
    if (q && !qs.includes(q)) qs.push(q);
  }
  return qs.slice(-max);
}

/** The line appended to the per-contact context note. Empty when we have asked nothing yet. */
export function proactiveNote(thread = {}) {
  const asked = questionsAlreadyAsked(thread);
  if (!asked.length) return '';
  return `- Questions you have already asked them (most recent last): ${asked.map((q) => `"${q}"`).join(' / ')}. `
    + 'Never ask any of these again. If their new message answers one, build on that answer; '
    + 'your question back this time must be a different, new one (BE PROACTIVE).';
}

/**
 * After generation: log a reply that misses the proactive rule. Diagnostics only —
 * the reply is never changed. Returns the findings so a test can read them.
 */
export function checkProactive(reply, { contactId = '', clientText = '', degraded = false } = {}) {
  const findings = [];
  if (degraded || !String(reply || '').trim()) return findings;
  const generic = findGenericFollowups(reply);
  if (generic.length) findings.push(`generic follow-up question -> ${generic.join(' | ')}`);
  if (!isAckOnly(clientText) && !endsWithQuestion(reply)) findings.push('answered without asking anything back');
  if (findings.length) console.log(`[proactive] ${contactId}: ${findings.join('; ')}`);
  return findings;
}
