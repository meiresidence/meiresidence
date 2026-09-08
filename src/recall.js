// What we already know about this client (2026-09-08).
//
// The agent is handed the whole thread, but "read it properly" is a hope, not a
// mechanism: it kept re-asking which typology someone had already named, re-sent
// a link it had sent ten minutes earlier, and re-introduced Mei Residence to a
// person three messages deep. A human never does that — it is the single most
// bot-like thing the agent did.
//
// This module reads the thread deterministically and hands the model a short
// "you already know this" note. No model call, no guesswork: plain regex over
// what was actually typed.

const textOf = (content) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((b) => (typeof b === 'string' ? b : b?.type === 'text' ? b.text || '' : '')).join(' ');
  }
  return '';
};

const uniq = (a) => [...new Set(a)];

export function extractKnownFacts(thread = {}, latestClientText = '') {
  const turns = Array.isArray(thread.history) ? thread.history : [];
  const clientText = [...turns.filter((t) => t.role === 'user').map((t) => textOf(t.content)), latestClientText].join('\n');
  const ourTurns = turns.filter((t) => t.role === 'assistant').map((t) => textOf(t.content)).filter(Boolean);
  const ourText = [...ourTurns, thread.lastOutboundBody || ''].join('\n');

  const unitCodes = uniq(
    (`${clientText}\n${ourText}`.match(/\b[AB]\s?\d{3,4}\b/gi) || []).map((c) => c.replace(/\s+/g, '').toUpperCase()),
  ).slice(-6);

  const typologies = uniq([
    ...(clientText.match(/\b[1-3]\s*\+\s*1\b/g) || []).map((t) => t.replace(/\s+/g, '')),
    ...(/duplex/i.test(clientText) ? ['duplex'] : []),
  ]).slice(-4);

  const budgets = uniq(clientText.match(/\b\d{2,3}[.,]?\d{3}\s*(?:eur|euro|€)\b/gi) || []).slice(-3);

  const linksSent = uniq(ourText.match(/https?:\/\/[^\s<>()"']+/gi) || []).slice(-8);

  const clientTurns = turns.filter((t) => t.role === 'user').length + (latestClientText ? 1 : 0);

  const ourOpeners = ourTurns.slice(-2).map((t) => t.replace(/\s+/g, ' ').trim().slice(0, 70)).filter(Boolean);

  return { unitCodes, typologies, budgets, linksSent, clientTurns, ourOpeners };
}

/** The lines appended to the per-contact context note. Empty string when there is nothing to say. */
export function recallNote(facts) {
  const lines = [];
  if (facts.clientTurns > 1) {
    lines.push(`- This is message ${facts.clientTurns} from them. They are NOT a new contact: do not re-introduce Mei Residence from scratch and do not re-ask anything below.`);
  }
  if (facts.typologies.length) lines.push(`- Typology they already named: ${facts.typologies.join(', ')} — never ask again which typology they want.`);
  if (facts.budgets.length) lines.push(`- Budget they already named: ${facts.budgets.join(', ')} — never ask again, and never repeat it back to them.`);
  if (facts.unitCodes.length) lines.push(`- Units already discussed: ${facts.unitCodes.join(', ')}.`);
  if (facts.linksSent.length) lines.push(`- Links already sent to them: ${facts.linksSent.join(' , ')} — do not send the same link again unless they ask for it.`);
  if (facts.ourOpeners.length) lines.push(`- Your last replies opened with: ${facts.ourOpeners.map((o) => `"${o}…"`).join(' / ')} — open differently this time, and do not reuse your last closing sentence.`);
  return lines.join('\n');
}
