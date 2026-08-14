// Not-a-lead guard — the safety net under the system-prompt rule.
//
// THE PRINCIPLE, not a list of examples: only people trying to BUY from Mei get
// a handoff. Anyone approaching Mei to sell, ask for, or offer something else is
// not a lead, no matter how polite, flattering or well-written the message is,
// and no matter whether their line of business appears in the patterns below.
//
// Selling to us (marketing, social media, video/reels, SEO, web design, ads,
// software/AI tools, photography, construction materials, furniture, any
// supplier), asking us for something (job applications, internships,
// sponsorship, donations, press), or offering a "collaboration" that is really
// a pitch (influencers, barter, promotion) — none of these are buyers. They must
// never tag the contact and never wake a specialist.
//
// Real example that broke this (Aug 2026, Albanian):
//   "Rastesisht gjeta faqen tuaj ndersa po shikoja kompani imobiliare ... Me lindi
//    nje ide se si disa nga pronat tuaja mund te prezantohen edhe me bukur ne
//    Instagram ... A do te ishit te hapur qe t'jua tregoja?"
// It was escalated like a buyer: needs-human + hot-lead, specialist notified.
//
// Design bias: NEVER block a real buyer. Any property/price/purchase signal
// anywhere in the conversation disables the guard completely, even if the
// message also reads like a pitch. Missing a pitch costs one wasted
// notification; blocking a buyer costs a sale.

// Strong signals — one hit is enough (given no buyer intent).
const STRONG = [
  // --- The classic cold-outreach opener (sq / en / it) ---
  /(rast[eë]sisht|kohët e fundit)?\s*(gjeta|pash[eë]|hasa|zbulova)\s+(n[eë]\s+)?(faqen|profilin|instagram|websit|sit[ei]n)/i,
  /(i|we)\s+(saw|found|came across|noticed|stumbled (up)?on)\s+(your|you're|ur)\s+(page|website|site|profile|instagram|ig|videos|reels|listings|account)/i,
  /(ho visto|ho trovato)\s+(il|la)\s+(vostro|vostra)\s+(sito|pagina|profilo)/i,

  // --- "would you be open to me showing you" / "kam pergatitur nje ide per ju" ---
  /(a\s+do\s+t[eë]\s+ishit|do\s+t[eë]\s+ishit)\s+(t[eë]\s+)?(hapur|interesuar)/i,
  /would you be (open|interested)\s+(to|in|for)/i,
  /(kam|kemi)\s+(p[eë]rgatitur|pergatitur|nj[eë]\s+ide)/i,
  /(t'?jua|t'?ju)\s+(tregoja|d[eë]rgoja|prezantoja)/i,
  /(send|show)\s+you\s+(a|the|some)?\s*(idea|mockup|sample|example|proposal|audit|demo)/i,

  // --- Generic "I am a supplier / I offer a service" framing (any trade) ---
  /\b(ofroj|ofrojm[eë]|we offer|we provide|i offer|i provide|we specialize|i specialize|we can help you|i can help you)\b/i,
  /\b(jam|jemi)\s+(nj[eë]\s+)?(agjenci|agjensi|kompani|studio|ekip|freelanc\w*|specialist|profesionist)\b/i,
  /(p[eë]rfaq[eë]soj|perfaqesoj|i represent|we represent)\s+(kompanin[eë]|nj[eë]\s+kompani|a company|the company)/i,
  /\b(propozim biznesi|business proposal|marr[eë]veshje bashk[eë]punimi|partnership proposal)\b/i,
  /\b(portfolio|portofol\w*|case stud(y|ies)|our clients|klient[eë]t\s+tan[eë]|referenca tona)\b/i,
  /(free|falas|pa\s+pages[eë]|gratis)\s+(audit|trial|sample|demo|video|mockup|analiz\w*|mostr\w*|konsulenc\w*)/i,
  /(audit|analiz[eë]|konsulenc[eë])\s+(falas|gratis|free)/i,

  // --- Marketing / content / web / software vendors ---
  /(agjenci|agjensi|agency)\s*(e\s+)?(marketing|dixhital|digjital|reklam|social|creative)/i,
  /(marketing|social media|content|video|seo|web)\s+(agency|agjenci|services?|sh[eë]rbime)/i,
  /(sh[eë]rbime|sherbime)\s+(marketing|reklam|dixhital|digjital|video|seo|fotografi)/i,
  /\b(seo|backlink|link ?building|guest post|smm|ppc|cold email|email blast)\b/i,
  /\b(video|reels?|content|social media)\s+(editor|editing|montazh|manager|management|creator|strategist)\b/i,
  /\b(montazh|montazhier|editues\s+videosh|videomaker|videograf\w*)\b/i,
  /\b(chatbot|crm|automation|saas|software|app development|zhvillim\s+(i\s+)?(aplikacion|softuer|web)\w*|sistem\s+menaxhimi)\b/i,
  /\b(ai\s+(agent|agents|solution|solutions|tool|tools))\b/i,
  /(help|ndihmoj|ndihmojm[eë])\s+(you|ju)?\s*(t[eë]\s+)?(rrisni|grow|increase|boost|get more|merrni\s+m[eë]\s+shum[eë])/i,
  /(m[eë]\s+shum[eë]|more)\s+(klient[eë]|leads?|clients|customers|shikime|views|ndjek[eë]s|followers)\b/i,

  // --- Job / internship applications ---
  /\b(cv|rezyme|resume|curriculum vitae)\b/i,
  /(k[eë]rkoj|kerkoj|looking for|seeking)\s+(nj[eë]\s+)?(pun[eë]|vend pune|job|employment|position)/i,
  /(aplikoj|aplikim|apply|application)\s+(p[eë]r\s+)?(pun[eë]|vend|pozicion|the (job|position)|a (job|position))/i,
  /\b(vende?\s+(i\s+)?lir[eë]?\s+pune|praktik[eë]\s+pune|internship|job opening|vacancy|are you hiring|po pun[eë]soni)\b/i,

  // --- Suppliers of goods / trades ---
  /\b(furnizues|furnizim|supplier|wholesale|shumic[eë])\b/i,
  /(ofert[eë]|quotation|quote)\s+(p[eë]r\s+)?(materiale|mobilje|dyer|dritare|pajisje|ndri[cç]im|furniture|equipment)/i,
  /\b(materiale\s+nd[eë]rtimi|construction materials|ashensor[eë]?|hvac|kondicioner[eë]?)\b/i,

  // --- Sponsorship, donations, press, influencers ---
  /\b(sponsorizim|sponsorship|sponsor|donacion|donation|fundrais\w*|bamir[eë]si)\b/i,
  /\b(influencer|blogger|brand ambassador|barter|kolaborim)\b/i,
  /(promovoj|promovojm[eë]|promote)\s+(biznesin|brendin|projektin|your (business|brand|project))/i,
  /\b(gazetar|journalist|press inquiry|intervist[eë]|media kit)\b/i,

  // --- Financial / crypto spam aimed at us ---
  /\b(crypto|bitcoin|forex|trading signals|loan offer|kredi\s+e\s+shpejt[eë])\b/i,
  /(investment|business)\s+opportunity\s+for\s+(you|your)/i,
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
  /\b(pun[eë]sim|employment|karrier)\w*/i,
  /\b([cç]mime konkurruese|competitive prices|zbritje p[eë]r biznese)\b/i,
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
  /\d{2,3}[.,]?\d{3}\s*(€|eur|euro)/i,                  // a property-scale sum
];

// Phrases a genuine buyer never writes. These outrank the buyer override below,
// because they collide with it by accident — "investment opportunity for your
// company" contains the word "invest", which is otherwise a buyer signal.
const NEVER_BUYER = [
  /\b(crypto|bitcoin|forex|trading signals|loan offer|kredi\s+e\s+shpejt[eë])\b/i,
  /(investment|business)\s+opportunity\s+for\s+(you|your)/i,
  /\b(cv|curriculum vitae|rezyme)\b/i,
];

const countHits = (patterns, text) => patterns.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);

/**
 * Is this person approaching Mei as something other than a buyer — selling us
 * something, applying for a job, asking for sponsorship, pitching a "collab"?
 * @param {string} text - the client's own words (last few messages joined).
 * @returns {boolean} true only when it reads as non-buyer outreach AND shows no
 *                    buyer intent at all.
 */
export function looksLikeNonBuyerOutreach(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (countHits(NEVER_BUYER, t) > 0) return true;
  if (countHits(BUYER, t) > 0) return false;   // any buyer signal wins, always
  if (countHits(STRONG, t) >= 1) return true;
  return t.length >= 40 && countHits(WEAK, t) >= 2;
}

export const _internals = { STRONG, WEAK, BUYER, NEVER_BUYER, countHits };
