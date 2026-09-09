// Voice guard (2026-09-08).
//
// The prompt now bans call-centre filler, but a prompt rule is a request. This
// is the check: it logs any stock phrase that made it into a reply (so the next
// "why does it sound like a bot" is answerable from the Render logs) and removes
// a dead greeting line — an opening line that thanks or greets and says nothing
// at all — when there is a real answer underneath it.
//
// It NEVER rewrites content, never touches numbers, links or the body of a reply,
// and never strips a greeting that carries the client's name.

export const ROBOTIC_PHRASES = [
  /faleminderit p[eë]r mesazhin/i,
  /si mund t[’'`]ju ndihmoj/i,
  /jam k[eë]tu p[eë]r t[’'`]ju ndihmuar/i,
  /mos hezitoni/i,
  /ju uroj nj[eë] dit[eë] t[eë] mbar[eë]/i,
  /nuk mund ta shoh/i,
  /thank you for your message/i,
  /how (?:may|can) i (?:assist|help) you/i,
  /i(?:'| a)m here to help/i,
  /do not hesitate/i,
  /don[’'`]t hesitate to (?:contact|reach)/i,
  /i hope this (?:message|email) finds you well/i,
  /i (?:cannot|can't|am unable to) (?:view|see|open|process) (?:the |this |that )?(?:image|photo|video|audio|voice|file|link)/i,
  /as an ai/i,
  /language model/i,
  // Corporate register (2026-09-09). Eglent does not write like this in any
  // language: these are the phrases that turn his voice back into a brand voice.
  /\bkindly\b/i,
  /please be advised/i,
  /at your earliest convenience/i,
  /we are delighted/i,
  /we regret to inform/i,
  /rest assured/i,
  /valued (?:client|customer)/i,
  /we would like to take this opportunity/i,
  /should you (?:have|require) any (?:further )?(?:questions|queries|information)/i,
  /ju falenderojm[eë] p[eë]r interesimin/i,
  /jemi n[eë] dispozicion(?:in tuaj)?/i,
  /me respekt,/i,
  /ju uroj gjith[eë] t[eë] mirat/i,
];

// Identity leak (2026-09-09). The agent writes in Eglent's voice; it must never
// claim to BE Eglent. Sounding like him and signing as him are different things,
// and the second one costs the trust the moment a buyer meets the real one.
// Detection only — this never rewrites a reply — but it logs at error level so a
// leak is visible in the Render logs the same day it happens.
export const IDENTITY_CLAIMS = [
  /\b(?:i am|i'm|this is|my name is)\s+eglent\b/i,
  /\bun[eë] (?:jam|quhem)\s+eglent\b/i,
  /\bhere is eglent\b/i,
  /^\s*[-–—]?\s*eglent(?: bici)?\s*$/im,
];

/** First-person claims to be Eglent. Diagnostics only. */
export function findIdentityClaims(text) {
  const body = String(text || '');
  return IDENTITY_CLAIMS.filter((re) => re.test(body)).map((re) => re.source);
}


/** Stock phrases present in a reply. Diagnostics only. */
export function findRoboticPhrases(text) {
  const body = String(text || '');
  return ROBOTIC_PHRASES.filter((re) => re.test(body)).map((re) => re.source);
}

// A first line that greets or thanks and carries nothing else. Deliberately a
// closed list: anything with a name, a question or a fact in it stays.
const DEAD_OPENERS = [
  /^p[eë]rshendetje[!.…]*$/i,
  /^p[eë]rsh[eë]ndetje[!.…]*$/i,
  /^faleminderit p[eë]r mesazhin(?: tuaj)?[!.…]*$/i,
  /^faleminderit p[eë]r kontaktin[!.…]*$/i,
  /^hello[!.…]*$/i,
  /^hi(?: there)?[!.…]*$/i,
  /^thank you for your message[!.…]*$/i,
  /^thanks for (?:your message|reaching out|getting in touch)[!.…]*$/i,
  /^guten tag[!.…]*$/i,
  /^buongiorno[!.…]*$/i,
];

export function stripDeadOpener(text) {
  const body = String(text || '');
  const nl = body.indexOf('\n');
  if (nl < 0) return body; // one line only: never strip the whole reply
  const first = body.slice(0, nl).trim();
  const rest = body.slice(nl + 1).trim();
  if (!rest || first.length > 60) return body;
  return DEAD_OPENERS.some((re) => re.test(first)) ? rest : body;
}

/** Last pass before a reply is sent. Returns the reply, logs what smelled robotic. */
export function tidyForHuman(text, { contactId = '', degraded = false } = {}) {
  const cleaned = stripDeadOpener(text);
  if (degraded) return cleaned; // the holding line is deliberate wording, leave it be
  const hits = findRoboticPhrases(cleaned);
  if (hits.length) console.warn(`[voice] ${contactId}: stock phrasing in reply -> ${hits.join(' | ')}`);
  const claims = findIdentityClaims(cleaned);
  if (claims.length) console.error(`[voice] ${contactId}: reply claims to BE Eglent -> ${claims.join(' | ')}`);
  return cleaned;
}
