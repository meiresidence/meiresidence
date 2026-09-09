// "I've already bought" — the one message the agent must never sell into.
//
// Two very different people say it (2026-09-09, Eglent's rule):
//   1. A Mei OWNER — they bought here. Congratulate them, thank them for the
//      trust, wish them the best, and put a person on anything after-sales.
//   2. A lead who bought SOMEWHERE ELSE. Congratulate them just as warmly, wish
//      them the best in the new home, and stop selling. No re-pitch, no
//      objection handling, no promised specialist.
//
// Which of the two it is, the model decides from the conversation (see the
// ALREADY BOUGHT block in the system prompt). What this file decides is the one
// thing that must never depend on the model: NOBODY WHO HAS JUST BOUGHT A HOME
// GETS CHASED. Either way the contact is tagged `fu-stop`, so the follow-up
// ladder (src/followup-agent/ladder.js) stops nudging them.
//
// Biased hard AGAINST false positives: an intention to buy ("dua të blej",
// "I want to buy", "if I bought it") is not a purchase, and stopping the
// follow-ups on a live buyer would cost far more than one missed tag.

// Completed, first-person purchase, in the languages Mei actually gets.
const BOUGHT = [
  // Albanian — kam blerë / e bleva / kemi blerë / kam marrë / u bëra pronar
  /\b(kam|kemi)\s+(e\s+)?bler[eë]\w*/i,
  /\b(e\s+)?blev(a|[eë]m)\b/i,
  /\bkam\s+marr[eë]\s+(nj[eë]\s+)?(apartament|banes[eë]|shtëpi|shtepi|pron[eë])/i,
  /\b(u\s+b[eë]ra|jam\s+b[eë]r[eë])\s+pronar/i,
  /\bkam\s+n[eë]nshkruar\s+(kontrat|marr[eë]veshj)/i,
  // English
  /\b(i|we)\s+(have\s+|'ve\s+|already\s+)*(bought|purchased)\b/i,
  /\b(i|we)\s+(have\s+)?closed\s+on\s+(a|the|my|our)\b/i,
  /\b(i\s*am|i'm|we\s*are|we're)\s+(now\s+)?(the\s+)?owner(s)?\s+of\b/i,
  // Italian
  /\b(ho|abbiamo)\s+(gi[àa]\s+)?(comprato|acquistato)\b/i,
  // German
  /\b(ich|wir)\s+hab(e|en)\s+(schon\s+|bereits\s+)?[^.!?]{0,40}?(gekauft|erworben)\b/i,
  // Polish
  /\b(ju[żz]\s+)?kupi[lł](e|a)m\b|\bkupili[śs]my\b/i,
  // Czech
  /\b(u[žz]\s+)?(jsem\s+koupil(a)?|koupil(a)?\s+jsem)\b|\b(koupili\s+jsme|jsme\s+koupili)\b/i,
];

// An intention, a condition or a question is NOT a purchase. If the same
// sentence carries one of these, the match does not count.
const NOT_YET = [
  /\b(nëse|nese|n[eë]se)\b|\bkur\s+ta\s+blej\b|\bdua\s+t[eë]\s+blej\b|\bdo\s+t[eë]\s+blej\b|\bpara\s+se\s+t[eë]\s+blej\b/i,
  /\b(if|when|before|after|once|should)\s+(i|we)\b|\bwould\s+(buy|have\s+bought)\b|\bplan(ning)?\s+to\s+buy\b|\bwant\s+to\s+buy\b|\bthinking\s+of\s+buying\b/i,
  /\b(se|quando|prima\s+di)\s+(io\s+)?compr\w*|\bvorrei\s+(comprare|acquistare)\b/i,
  /\b(wenn|falls|bevor)\s+(ich|wir)\b|\b(kaufen\s+)?(m[öo]chte|will|w[üu]rde)\s+.{0,20}kaufen\b/i,
  /\b(je[śs]li|gdybym|zanim)\b|\bchc[ęe]\s+kupi[ćc]\b/i,
  /\b(pokud|kdybych|ne[žz])\b|\bchci\s+koupit\b/i,
];

/**
 * Has this person told us they have already completed a property purchase —
 * here or anywhere else? Runs over the client's own words only.
 */
export function saysAlreadyBought(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  // Sentence by sentence, so "I want to buy" in one line cannot cancel a real
  // "I bought it last week" in another, and vice versa.
  return t
    .split(/(?<=[.!?\n])\s*/)
    .some((s) => BOUGHT.some((re) => re.test(s)) && !NOT_YET.some((re) => re.test(s)));
}

// Applied to anyone who has just bought a home, wherever they bought it:
// the follow-up ladder must not keep nudging them.
export const BOUGHT_TAG = 'fu-stop';
