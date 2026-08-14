// Solicitation guard — the safety net under the system-prompt rule.
//
// Not everyone who writes to Mei is a buyer. A steady share of inbound messages
// are people selling US something: social-media/marketing agencies, video and
// reels editors, SEO and backlink sellers, web designers, ads managers, CRM/AI
// tool vendors, photographers, job applicants. Real example (Aug 2026, Albanian):
//
//   "Rastesisht gjeta faqen tuaj ndersa po shikoja kompani imobiliare ... Me lindi
//    nje ide se si disa nga pronat tuaja mund te prezantohen edhe me bukur ne
//    Instagram ... A do te ishit te hapur qe t'jua tregoja?"
//
// That message tagged the contact `needs-human` and woke a specialist. It should
// not have. The system prompt now tells the model this directly; this module is
// the deterministic backstop for when the model slips.
//
// Design bias: NEVER block a real buyer. Any property/price/purchase signal
// anywhere in the conversation disables the guard completely, even if the message
// also reads like a pitch. Missing a pitch costs one wasted notification; missing
// a buyer costs a sale.

// Strong signals — one hit is enough (given no buyer intent).
const STRONG = [
  // The classic cold-outreach opener, sq / en / it
  /(rast[eë]sisht|kohët e fundit)?\s*(gjeta|pash[eë]|hasa|zbulova)\s+(n[eë]\s+)?(faqen|profilin|instagram|websit|sit[ei]n)/i,
  /(i|we)\s+(saw|found|came across|noticed|stumbled (up)?on)\s+(your|you're|ur)\s+(page|website|site|profile|instagram|ig|videos|reels|listings|account)/i,
  /(ho visto|ho trovato)\s+(il|la)\s+(vostro|vostra)\s+(sito|pagina|profilo)/i,

  // "would you be open to me showing you" / "kam pergatitur nje ide per ju"
  /(a\s+do\s+t[eë]\s+ishit|do\s+t[eë]\s+ishit)\s+(t[eë]\s+)?(hapur|interesuar)/i,
  /would you be (open|interested)\s+(to|in|for)/i,
  /(kam|kemi)\s+(p[eë]rgatitur|pergatitur|nj[eë]\s+ide)/i,
  /(t'?jua|t'?ju)\s+(tregoja|d[eë]rgoja|prezantoja)/i,
  /(send|show)\s+you\s+(a|the|some)?\s*(idea|mockup|sample|example|proposal|audit|demo)/i,

  // Explicitly selling a service
  /(agjenci|agjensi|agency)\s*(e\s+)?(marketing|dixhital|digjital|reklam|social|creative)/i,
  /(marketing|social media|content|video|seo|web)\s+(agency|agjenci|services?|sh[eë]rbime)/i,
  /(sh[eë]rbime|sherbime)\s+(marketing|reklam|dixhital|digjital|video|seo)/i,
  /\b(seo|backlink|link ?building|guest post|smm|ppc|cold email)\b/i,
  /\b(video|reels?|content|social media)\s+(editor|editing|montazh|manager|management|creator|strategist)\b/i,
  /\b(montazh|montazhier|editues\s+videosh)\b/i,
  /\b(portfolio|case stud(y|ies)|our clients|klient[eë]t\s+tan[eë])\b/i,
  /(free|falas|pa\s+pages[eë])\s+(audit|trial|sample|demo|video|mockup|analiz|mostr)/i,
  /(audit|analiz[eë])\s+(falas|gratis|free)/i,
  /(help|ndihmoj|ndihmojm[eë])\s+(you|ju)?\s*(t[eë]\s+)?(rrisni|grow|increase|boost|get more|merrni\s+m[eë]\s+shum[eë])/i,
  /(m[eë]\s+shum[eë]|more)\s+(klient[eë]|leads?|clients|customers|shikime|views|ndjek[eë]s|followers)\s*(potencial)?/i,
  /(punoj|punojm[eë]|i work|we work)\s+(me|with)\s+(kompani|biznese|companies|businesses|agjenci|real estate)/i,
];

// Weak signals — need two of them (given no buyer intent).
const WEAK = [
  /\b(instagram|tiktok|reels?|youtube|linkedin)\b/i,
  /\b(marketing|reklam|advertis|promovim|branding)\w*/i,
  /\b(p[eë]rmbajtje|content|videot|fotografi|photograph)\w*/i,
  /\b(ide|idea|propozim|proposal|oferte|ofert[eë]|offer)\b/i,
  /\b(shikime|views|engagement|ndjek[eë]s|followers|reach)\b/i,
  /\b(sh[eë]rbim|service|freelanc|agjenci|agency)\w*/i,
  /\b(faqen|faqja|website|web ?site|web ?faqe)\b/i,
  /\b(bashk[eë]punim|collaborat|partnership)\w*/i,
  /\b(prezantohen|prezantim|present(ed|ation))\b/i,
];

// Buyer intent — ANY hit anywhere in the conversation disables the guard.
// Deliberately narrow: things only someone interested in the property says.
// Words a vendor could also use ("meeting", "call", "interested") are excluded.
const BUYER = [
  /\b\d\s*\+\s*\d\b/,                                   // 1+1, 2+1, 3+1
  /\b(duplex|dupleks)\b/i,
  /\b(apartament|apartment|banes|nj[eë]si|unit|penthouse|villa|vil[eë])\w*/i,
  /\b([cç]mim|price|prices|pricing|kosto|cost|sa\s+kushton|how\s+much|quanto\s+costa)\b/i,
  // Purchase intent, first person. Deliberately NOT /bler\w*/ — a pitch saying
  // "blerësve potencialë" / "potential buyers" is talking about OUR buyers, not
  // about itself, and must not be mistaken for buyer intent.
  /\b(blej|blerje|bl[ei]j[eëmn]\w*)\b/i,
  /\b(buy|buying|purchase|purchasing|acquistare)\b/i,
  /\b(investoj|investim|invest|investor|investitor)\w*/i,
  /\b(hipotek|mortgage|k[eë]ste|installment|financ)\w*/i,
  /\b(m2|m²|metra\s+katror|square\s+met)\w*/i,
  /\b(kat[iei]?|floor|pamje\s+nga\s+deti|sea\s*view|ballkon|balcon)\w*/i,
  /\b(parking|garazh|garage|post[eë]\s+parkimi)\b/i,
  /\b(dor[eë]zim|delivery|handover|kur\s+p[eë]rfundon)\b/i,
  /\b(qira|rent|rental|kthim|return|roi|6\s*%|65\s*%)\b/i,
  /\b(rezervim|reserv|kontrat|contract|noter|notar)\w*/i,
];

const countHits = (patterns, text) => patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);

/**
 * Does this conversation read as someone selling US a service rather than a lead?
 * @param {string} text - the client's own words (last few messages joined).
 * @returns {boolean} true only when it is a pitch AND shows no buyer intent at all.
 */
export function looksLikeSolicitation(text) {
  const t = String(text || '').trim();
  if (t.length < 40) return false;             // too short to judge — let it through
  if (countHits(BUYER, t) > 0) return false;   // any buyer signal wins, always
  return countHits(STRONG, t) >= 1 || countHits(WEAK, t) >= 2;
}

export const _internals = { STRONG, WEAK, BUYER, countHits };
