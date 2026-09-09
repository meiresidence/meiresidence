// The rules an owner instruction is checked against (2026-09-09).
//
// Eglent's decision: an instruction from him or Mea may override anything —
// but the agent must SAY SO when it does, and wait for a confirmation before
// the override goes live. A typo in a WhatsApp message should not silently put
// a wrong return figure in front of forty buyers.
//
// Two of them are different. Impersonating a named human being, and leaking
// another client's data, are not business decisions that can be reversed next
// week — the first is a lie the buyer discovers when they meet the real person,
// the second cannot be taken back at all. Those two are refused outright, in
// plain language, with what CAN be done instead.

/** Overridable, but the agent must flag the conflict and get a confirmation. */
export const HARD_RULES = [
  {
    key: 'returns',
    what: 'the return figures — 6% guaranteed, or the 65/35 rental pool, and never a third number',
    test: /(\d{1,2}([.,]\d+)?\s*%)|\b(perqind|përqind|percent|kthim|return|yield|rendite|rendit[eë])\b/i,
  },
  {
    key: 'prices',
    what: 'prices and unit availability, which come from the price list and nowhere else',
    test: /\b(cmim|çmim|price|preis|euro|eur|€|zbritje|discount|ulje)\b/i,
  },
  {
    key: 'parking',
    what: 'parking posts are not for sale and have no price',
    test: /\b(parking|parkim|garazh|garage|post|vend parkimi)\b/i,
  },
  {
    key: 'payment',
    what: 'the payment shape — 5% to reserve, ~50% at the Notary, 45% until handover',
    test: /\b(keste|këste|instal|pagese|pagesë|payment|noter|notary|rezervim|deposit)\b/i,
  },
  {
    key: 'handoff',
    what: 'who gets a handoff — only buyers, never anyone selling to us or asking us for something',
    test: /\b(handoff|escalat|specialist|needs-human|shit[eë]s|agjenci|agency|lead)\b/i,
  },
  {
    key: 'privacy-internal',
    what: 'internal sales data — units sold, revenue, pipeline — is never said to a client',
    test: /\b(shitur|sold|revenue|xhiro|pipeline|sa kemi|internal)\b/i,
  },
];

/** Never overridable, whatever anyone sends. */
export const ABSOLUTE_RULES = [
  {
    key: 'not-a-human',
    what: 'the agent may never claim to BE a specific named person',
    why: 'a buyer who finds out they were told they were talking to a person stops trusting everything else we said',
    instead: 'it already writes in Eglent\'s voice and says a colleague joins whenever they would rather talk to a person',
    test: /\b(je (nj[eë] )?(person|njeri)|prete?ndo|shtiru|pretend (to be|you are)|say you are (eglent|a (real )?(person|human))|mos thuaj q[eë] je (bot|ai|asistent)|claim (to be|you are) (a )?human)\b/i,
  },
  {
    key: 'other-clients',
    what: 'another client\'s name, number or internal note is never shown to anyone',
    why: 'it cannot be taken back once it is sent, and it is the one mistake a buyer tells other people about',
    instead: 'it can say a unit is reserved or sold without naming who reserved it',
    test: /\b(trego|jep|dergo|dërgo|share|send|give)\b[^.!?]{0,40}\b(numrin|kontaktin|emrin|shenimet|shënimet|note|number|contact)\b[^.!?]{0,30}\b(klient|blere|blerë|buyer|tjet[eë]r|other)\b/i,
  },
];

/**
 * Which hard rules this instruction appears to touch. Deliberately generous:
 * a false flag costs one extra "confirm?" message, a missed one puts a wrong
 * number in front of buyers. Never blocks anything by itself.
 */
export function conflictingRules(text) {
  const body = String(text || '');
  return HARD_RULES.filter((r) => r.test.test(body)).map((r) => r.key);
}

/** Rules that are refused outright, with the reason to send back. */
export function absoluteBreaches(text) {
  const body = String(text || '');
  return ABSOLUTE_RULES.filter((r) => r.test.test(body));
}

/** One line per rule, for the owner-mode prompt. */
export const hardRuleSummary = () => HARD_RULES.map((r) => `- ${r.key}: ${r.what}`).join('\n');
export const absoluteRuleSummary = () => ABSOLUTE_RULES.map((r) => `- ${r.key}: ${r.what} (${r.why})`).join('\n');
