// A promise must never outlive the handoff (2026-09-09).
//
// The standing rule in this repo is that a failure path must never impersonate
// a success path. The handoff had the mirror of that problem: a SUCCESS-looking
// sentence with no handoff behind it. The agent writes "a Mei specialist will
// follow up with you" — or hands over Eglent's direct number — while
// escalate_to_agent was never called, or was called and refused by the timing
// gate. The client waits for a person. Nothing is tagged, the GHL "Specialist
// Handoff Alert" workflow never fires, and Eglent never learns the lead exists.
// (Seen on 8 Sep: a broker asking eleven guarantee questions was told a
// specialist would follow up; the contact carries no needs-human tag.)
//
// So: after the reply is written and before it is sent, if it PROMISES a human
// and no handoff fired this turn, the handoff is fired for real. The non-buyer
// guard still applies — a vendor pitch never wakes anyone.

// Eglent's direct number, in any shape it gets typed:
// +355 67 204 9400 / 00355 67 2049400 / 067 204 9400 / 0672049400.
const EGLENT_NUMBER_DIGITS = /(?:355|0)?672049400/;

const PROMISE_PATTERNS = [
  // --- Albanian ---
  /\bspecialist\w*\b[\s\S]{0,140}?\b(kontakt\w*|do t[’'`]ju|do ju |shkruan|merr n[eë] telefon|lidhet me ju)/i,
  /\b(koleg\w*|agjent\w*|ekipi|menaxher\w*)\b[\s\S]{0,140}?\b(do t[’'`]ju kontakt\w*|do ju kontakt\w*|do t[’'`]ju shkruaj|do t[’'`]ju marr)/i,
  /\bdo t[’'`]ju (kontaktoj[eë]|kontaktoje|shkruaj[eë]?) (nj[eë] )?(specialist|koleg|agjent|person)/i,
  // --- English ---
  /\b(a |our |the )?(specialist|colleague|agent|manager|team member|someone from (the|our) team)\b[\s\S]{0,140}?\b(will|is going to|to)\s+(contact|reach out|reach you|follow up|call|be in touch|get in touch|get back)/i,
  /\b(i['’]?ll|we['’]?ll|we will) (have|ask|get) (a |our )?(specialist|colleague|agent|manager)\b/i,
  // --- Italian / German / Polish / Czech ---
  /\b(uno |un )?(specialista|collega|agente)\b[\s\S]{0,140}?\b(la contatter|ti contatter|vi contatter)/i,
  /\b(ein |unser )?(spezialist|kollege|berater|ansprechpartner)\b[\s\S]{0,140}?\b(wird sich|meldet sich|kontaktiert)/i,
  /\b(specjalista|kolega|doradca)\b[\s\S]{0,140}?\b(skontaktuje|odezwie)/i,
  /\b(specialista|kolega|poradce)\b[\s\S]{0,140}?\b(se ozve|v[áa]s bude kontaktovat)/i,
];

/**
 * Does this outgoing reply tell the client that a human is now coming?
 * Handing over Eglent's direct number counts: from that moment a person is
 * expected on the other end, so that person has to know the lead exists.
 */
export function promisesHandoff(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  if (EGLENT_NUMBER_DIGITS.test(t.replace(/[^\d]/g, ''))) return true;
  return PROMISE_PATTERNS.some((re) => re.test(t));
}

// Reconciliation can be turned off from Render without a deploy:
// HANDOFF_RECONCILE=off
export function reconcileEnabled() {
  return String(process.env.HANDOFF_RECONCILE || '').toLowerCase() !== 'off';
}
