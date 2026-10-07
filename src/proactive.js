// Proactive replies (2026-10-07).
//
// Eglent's ask: when a lead shows interest — asks a price, a unit, the payment —
// the agent gives them what they asked for and then asks back, the way a person
// would: does it fit, what else would they like to know. NOT on every message:
// "Not every reply, just when the person shows interest. This is the key point."
// A buyer who gets a price and nothing to reply to often does not reply at all;
// a person who says "ok" and gets a question back every time is talking to a bot.
//
// The rule itself lives in the prompt (BE PROACTIVE in index.js). This module is
// the deterministic half, same contract as src/voice.js and src/recall.js:
//   - before generation: say whether THIS message carries a buying signal, and
//     which questions the agent has already asked this client;
//   - after generation: LOG a reply to a buying signal that ends without a
//     question, a reply with no signal that still asks back, and any generic
//     form-letter question. It never rewrites a reply.

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

// Buying signals: the message itself shows interest. Albanian first, then the other
// languages leads write in (en, it, de, pl). Deliberately about INTENT, not topic —
// "where is it?" or "what is this?" alone is curiosity and gets no question back.
export const INTEREST_SIGNALS = [
  ['price', /sa kushton|[cç]mim|\bprice\b|\bcost|how much|prezz|quanto cost|\bpreis|kostet|\bcen[aęy]\b|ile kosztuj/i],
  ['unit', /\b[AB]\s?\d{3}\b|\b[1-3]\s*\+\s*1\b|duplex|dupleks|apartament(?:i|in|e)? (?:me|n[eë]|te|për|per)\b/i],
  ['availability', /\b(?:[eë]sht[eë]|eshte|a [eë]sht[eë]) (?:ende )?(?:e|i) lir[eë]|\bka (?:ende )?(?:t[eë] )?lira\b|still (?:free|available)|\bavailab|disponibil|verf[uü]gbar|\bwoln[ey]\b/i],
  ['plan', /planimetri|\bplan(?:i|in|it)?\b|layout|floor ?plan|grundriss|pianta|\bfoto|\bphoto|\bvideo\b|\btour\b|\b3d\b/i],
  ['payment', /pages|pagu[aj]|k[eë]st|instal|payment|\bpay\b|rezerv|reserv|anzahlung|zahlung|\brat[ae]\b|pagament|kredi|mortgage|hipotek/i],
  ['return', /fitim|kthim|\bqira|\breturn|yield|rendit|income|\bearn|rendiment|\b6\s?%|65\s?\/\s?35/i],
  ['contract', /kontrat|contract|vertrag|contratt|noter|notar|\bdeed\b|certifikat|pron[eë]si|ownership|umow/i],
  ['visit', /vizit|takim|nga af[eë]r|\bvisit|viewing|\bmeet|besichtig|sopralluog|appuntament|spotkan/i],
  ['handover', /\bkur (?:mbaron|p[eë]rfundon|dor[eë]zohet|hapet)|dor[eë]zim|handover|when (?:is it|will it be) (?:ready|finished|done)|fertigstell|consegna/i],
  ['intent', /jam (?:i|e) interesuar|\bdua t[eë] (?:blej|investoj)|po (?:mendoj|kërkoj|kerkoj) (?:t[eë] )?(?:blej|investoj|nj[eë] apartament)|interested|looking (?:for|to buy)|want to (?:buy|invest)|\bbuxhet|budget|interessiert|interessat|kupi[cć]|zainteresowan/i],
];

// A message that turns the agent DOWN is never a buying signal, whatever words it
// shares with one ("nuk jam i interesuar", "not interested in the price"). The NOT
// INTERESTED ladder in the prompt owns those.
const DECLINE = /nuk (?:jam|me) (?:i |e )?interes|s[’'`]?jam (?:i |e )?interes|s[’'`]?me intereson|nuk më intereson|not interested|no,? thanks|nicht interessiert|non (?:sono |mi )?interess|niezainteresowan|\bstop\b|mos m[eë] (?:shkruani|shkruaj)/i;

/** The buying signals in a client message — [] when it shows no interest. */
export function interestSignals(clientText) {
  const t = String(clientText || '');
  if (!t.trim() || isAckOnly(t) || DECLINE.test(t)) return [];
  return INTEREST_SIGNALS.filter(([, re]) => re.test(t)).map(([name]) => name);
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

/** The lines appended to the per-contact context note for THIS message. */
export function proactiveNote(thread = {}) {
  const lines = [];
  const signals = interestSignals(thread.text || '');
  if (signals.length) {
    lines.push(`- Buying signal in this message: ${signals.join(', ')}. Answer it fully, then ask ONE `
      + 'short, specific question back as the very last line (BE PROACTIVE).');
  } else {
    lines.push('- No buying signal spotted in this message. Unless you can clearly see interest yourself, '
      + 'answer it and stop — no question back (BE PROACTIVE).');
  }
  const asked = questionsAlreadyAsked(thread);
  if (asked.length) {
    lines.push(`- Questions you have already asked them (most recent last): ${asked.map((q) => `"${q}"`).join(' / ')}. `
      + 'Never ask any of these again. If their new message answers one, build on that answer; '
      + 'any question back this time must be a different, new one.');
  }
  return lines.join('\n');
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
  const signals = interestSignals(clientText);
  const asks = endsWithQuestion(reply);
  if (signals.length && !asks) findings.push(`buying signal (${signals.join(', ')}) answered without asking anything back`);
  if (!signals.length && asks) findings.push('asked back although the message showed no buying signal');
  if (findings.length) console.log(`[proactive] ${contactId}: ${findings.join('; ')}`);
  return findings;
}
