// Guard test: non-buyers must be blocked, buyers must NEVER be blocked.
// Run: node scripts/test-not-a-lead.mjs
import { looksLikeNonBuyerOutreach } from '../src/not-a-lead.js';

const NOT_LEADS = [
  // The real message that wrongly tagged needs-human (Aug 2026)
  `Përshëndetje

Rastësisht gjeta faqen tuaj ndërsa po shikoja kompani imobiliare në Sarandë dhe Ksamil. Keni disa prona vërtet shumë të bukura, dhe pashë që disa nga videot tuaja po marrin edhe shumë shikime.

Më lindi një ide se si disa nga pronat tuaja mund të prezantohen edhe më bukur në Instagram dhe të tërheqin më shumë vëmendjen e blerësve potencialë.

Kam përgatitur një ide të vogël specifikisht për faqen tuaj. A do të ishit të hapur që t'jua tregoja?`,
  // Marketing / content / web / software
  `Hi there! I came across your Instagram page and noticed your reels are getting good views. I run a small video editing agency and I'd love to show you a free sample edit of one of your properties. Would you be open to that?`,
  `Pershendetje, jam pjese e nje agjencie marketingu dixhital. Ofrojme sherbime SEO dhe menaxhim te rrjeteve sociale per kompani imobiliare. A mund t'ju dergoj nje analize falas te faqes suaj?`,
  `Hello, we help real estate companies get more leads with Google Ads and Meta Ads. We work with 12 developers in the Balkans, happy to share our case studies. Can I send a short proposal?`,
  `Ciao, ho visto il vostro sito e ho notato che le foto potrebbero essere migliorate. Sono un fotografo e videomaker, posso mandarvi il mio portfolio?`,
  `Good afternoon. We build AI agents and chatbots for real estate businesses. Would you be interested in a demo?`,
  // Job applications
  `Pershendetje, kerkoj pune si recepsioniste. A keni ndonje vend te lire? Ju dergoj CV-ne time.`,
  `Hello, I would like to apply for a position at your company. Please find my CV attached.`,
  // Suppliers of goods
  `Pershendetje, jemi nje kompani qe furnizon mobilje per hotele dhe rezidenca. Ofrojme cmime konkurruese dhe montim falas.`,
  `We are a supplier of construction materials and elevators for residential projects. Can we send you our catalogue?`,
  // Sponsorship / influencer / press
  `Pershendetje! Jam influencer me 40 mije ndjekes dhe do doja bashkepunim per promovim te projektit tuaj ne Instagram, me barter.`,
  `Hello, we are organising a youth football tournament in Durres and are looking for a sponsor. Would you consider sponsorship?`,
  // Spam
  `Dear Sir, we have an investment opportunity for your company in crypto trading with guaranteed monthly profit.`,
];

const BUYERS = [
  `Pershendetje, sa kushton nje apartament 1+1 te Mei Residence?`,
  `Hello, I'm interested in investing. What is the guaranteed return and when is delivery?`,
  `A keni ende dupleks te lire? Dhe si funksionon pagesa me keste?`,
  // Pitch-shaped openers that ARE buyers — must never be blocked
  `Hi, I saw your Instagram page and the apartments look beautiful. Do you have a 2+1 with sea view available and what is the price?`,
  `Rastesisht gjeta faqen tuaj ne Instagram dhe me pelqyen shume pamjet. A ka ende njesi 2+1 dhe sa eshte cmimi?`,
  `Pershendetje! Une jam agjent imobiliar ne Kosove dhe kam disa kliente qe duan te investojne. A bashkepunoni me agjenci?`,
  `Une jam nje kompani ndertimi nga Kosova dhe dua te blej dy apartamente per veten time.`,
  `Mund te me dergoni planimetrine e katit te 5-te? Dhe a ka parking te lire?`,
  `Good morning, I would like to book a viewing next week.`,
  `Ofroj 120,000 euro per njesine 2+1, a pranohet?`,
];

let failed = 0;
console.log('--- should be BLOCKED (not buyers) ---');
for (const m of NOT_LEADS) {
  const got = looksLikeNonBuyerOutreach(m);
  if (!got) failed++;
  console.log(`${got ? 'PASS' : 'FAIL'}  "${m.replace(/\s+/g, ' ').slice(0, 70)}…"`);
}
console.log('\n--- must NEVER be blocked (real leads) ---');
for (const m of BUYERS) {
  const got = looksLikeNonBuyerOutreach(m);
  if (got) failed++;
  console.log(`${got ? 'FAIL' : 'PASS'}  "${m.replace(/\s+/g, ' ').slice(0, 70)}…"`);
}
console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILURE(S)`}`);
process.exit(failed === 0 ? 0 : 1);
