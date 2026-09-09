// Regression lock for the 2026-09-09 fix: a handoff must actually reach Eglent.
//
// What went wrong: the "HANDOFF - specialist needed" alerts ran daily from
// 6 to 28 August and then stopped for twelve days, with the agent live and real
// buyers writing in. Three separate holes:
//   1. SPECIALIST_CONTACT_ID unset  -> escalate() logged a warning and sent nothing.
//   2. WhatsApp-only alert          -> silently refused outside the 24h window.
//   3. A promise with no handoff    -> the reply said "a specialist will follow
//      up", nothing was tagged, so the GHL workflow never fired.
//
// Run: node scripts/test-handoff-reaches-eglent.mjs
import fs from 'fs';
import { specialistContactId, alertChannels, deliverAlert, EGLENT_CONTACT_ID } from '../src/specialist.js';
import { promisesHandoff, reconcileEnabled } from '../src/promised-handoff.js';

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};

// --- 1. There is always a specialist ---------------------------------------
delete process.env.SPECIALIST_CONTACT_ID;
check('no env var still resolves to Eglent', specialistContactId() === EGLENT_CONTACT_ID, specialistContactId());
process.env.SPECIALIST_CONTACT_ID = 'SOMEONEELSE12345678';
check('env var still wins when set', specialistContactId() === 'SOMEONEELSE12345678');
delete process.env.SPECIALIST_CONTACT_ID;

// --- 2. The alert falls back across channels --------------------------------
delete process.env.SPECIALIST_CHANNEL;
check('WhatsApp first, then SMS, then Email', alertChannels().join(',') === 'WhatsApp,SMS,Email', alertChannels().join(','));

const tried = [];
const failWhatsApp = async (channel) => {
  tried.push(channel);
  if (channel === 'WhatsApp') return { ok: false, data: { message: 'more than 24 hours have passed' } };
  return { ok: true, data: {} };
};
const out = await deliverAlert(failWhatsApp, { subject: 's', body: 'HANDOFF - specialist needed' });
check('a closed WhatsApp window falls through to SMS', out.ok && out.channel === 'SMS', JSON.stringify(out.attempts));

const deadEverywhere = async () => ({ ok: false, data: { message: 'nope' } });
const dead = await deliverAlert(deadEverywhere, { subject: 's', body: 'b' });
check('every channel failing is reported, never silent', dead.ok === false && dead.attempts.length === 3);

// --- 3. A promise is recognised --------------------------------------------
const promises = [
  'Glad that is clear. A Mei specialist will follow up with your client directly.',
  "Faleminderit! Nje specialist i Mei Residence do t'ju kontaktoje shume shpejt.",
  'You can reach our sales manager, Eglent Bici, directly at +355 67 204 9400',
  'Ky eshte numri i tij: 067 204 9400.',
  'Ein Spezialist wird sich bei Ihnen melden.',
];
const plainAnswers = [
  'Apartamenti A212 eshte i lire, 103.500 EUR, 67.5 m2. Cila tipologji ju intereson?',
  'The 6% is fixed and paid once a year. Which floor were you thinking of?',
  'Mei handles this internally and is not looking right now — write to info@meiresidence.com.',
];
for (const t of promises) check(`promise detected: "${t.slice(0, 46)}…"`, promisesHandoff(t));
for (const t of plainAnswers) check(`plain answer left alone: "${t.slice(0, 46)}…"`, !promisesHandoff(t));

// --- 4. The webhook actually reconciles -------------------------------------
const index = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
check('webhook reconciles a promise with no handoff',
  /!handoffFired && reconcileEnabled\(\) && promisesHandoff\(reply\)/.test(index));
check('reconciliation runs BEFORE the reply is sent',
  index.indexOf('promisesHandoff(reply)') < index.indexOf('await sendReplyChunked(contactId, reply, channel)'));
check('reconciled handoff bypasses the timing gate but not the non-buyer guard',
  /\{ force: true \}/.test(index) && /if \(!opts\.force && handoffTooEarly/.test(index)
  && index.indexOf('looksLikeNonBuyerOutreach(clientWords)') < index.indexOf("await tagContact(contactId, ['needs-human', 'hot-lead']"));
check('tag failures are logged, never swallowed',
  /TAGGING FAILED/.test(index) && !/addTags\(contactId, \['needs-human', 'hot-lead'\]\)\.catch\(\(\) => \{\}\)/.test(index));
check('handoff alert uses the channel fallback', /deliverAlert\(/.test(index));
check('reconciliation can be switched off from Render', reconcileEnabled() === true
  && /HANDOFF_RECONCILE/.test(fs.readFileSync(new URL('../src/promised-handoff.js', import.meta.url), 'utf8')));

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
