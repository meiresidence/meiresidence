// "I've already bought" — congratulate, wish them well, and never chase them.
// Eglent's rule, 9 Sep 2026. Run: node scripts/test-already-bought.mjs
import fs from 'fs';
import { saysAlreadyBought, BOUGHT_TAG } from '../src/already-bought.js';
import { STOP_TAGS } from '../src/followup-agent/ladder.js';

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// --- Detection: a completed purchase, in every language Mei gets ------------
const bought = [
  'Faleminderit, por kam blerë tashmë një apartament në Golem.',
  'E bleva javën e kaluar, faleminderit për informacionin.',
  'Kam nënshkruar kontratën javën e kaluar.',
  'Hi, I bought unit A212 with you last month — when is the handover?',
  'We have already purchased a property in Vlore.',
  'I am now the owner of a flat there, thanks anyway.',
  'Ho già comprato un appartamento a Durazzo.',
  'Danke, ich habe letzte Woche eine Wohnung in Golem gekauft.',
  'Dziękuję, już kupiłem mieszkanie.',
  'Už jsem koupil byt v Albánii.',
];
// --- and what must NEVER be read as one: an intention is not a purchase -----
const notBought = [
  'Dua të blej një apartament 1+1, sa kushton?',
  'Kur ta blej, si bëhet pagesa?',
  'I want to buy a 2+1 with sea view. What is the price?',
  'If I bought it now, when would the first payment be due?',
  'Vorrei comprare un appartamento, quanto costa?',
  'Ich möchte eine Wohnung kaufen. Was kostet sie?',
  'Chcę kupić mieszkanie w Albanii.',
  'Chci koupit byt, jaká je cena?',
  'My brother bought a car last year.',
  'Sa kushton një 1+1 me pamje nga deti?',
];
for (const t of bought) check(`bought: "${t.slice(0, 44)}…"`, saysAlreadyBought(t));
for (const t of notBought) check(`still a live buyer: "${t.slice(0, 40)}…"`, !saysAlreadyBought(t));

// A live question in the same thread must not cancel a real purchase line.
check('mixed thread: purchase line still counts',
  saysAlreadyBought('Sa kushton një 1+1?\nNë fakt kam blerë tashmë diku tjetër, faleminderit.'));

// --- The follow-up ladder honours the tag we apply --------------------------
check(`${BOUGHT_TAG} is a real stop tag for the follow-up ladder`, STOP_TAGS.includes(BOUGHT_TAG), STOP_TAGS.join(','));

// --- The webhook applies it, and the prompt carries both branches -----------
const index = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
check('webhook tags the contact when they say they have bought',
  /saysAlreadyBought\(/.test(index) && /tagContact\(contactId, \[BOUGHT_TAG\]/.test(index));
check('it is tagged before the reply is generated (no nudge race)',
  index.indexOf('saysAlreadyBought(') < index.indexOf('await generateReply(conv, contactId)'));
check('prompt: congratulate and wish them the best comes first',
  /ALREADY BOUGHT — CONGRATULATE FIRST, SELL NOTHING/.test(index)
  && /congratulate them, thank\s+them, and wish them the best/.test(index));
check('prompt: the Mei-owner branch routes to a person',
  /THEY BOUGHT AT MEI RESIDENCE/.test(index) && /an owner asking about their own apartment\s+always gets a person/.test(index));
check('prompt: the bought-elsewhere branch sells nothing and promises nobody',
  /THEY BOUGHT SOMEWHERE ELSE/.test(index)
  && /do NOT\s+re-pitch/.test(index)
  && /do NOT promise that anyone will contact them or\s+hand over a phone number/.test(index));
check('prompt: no investment-property sign-off after a purchase',
  /Do not close it with the investment-property line/.test(index));

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
