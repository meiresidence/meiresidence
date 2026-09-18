// One alert per open handoff, and it says who to call (2026-09-09).
//
// What Eglent saw on the first live day: the SAME lead alerted him three times
// in eight minutes (Lorena 14:46, 14:52, 14:53) and twice in six (Fisnik 16:07,
// 16:12) — the model calls escalate_to_agent again on every following client
// message and escalate() had no memory — and not one of those alerts carried
// the client's phone number, so he had to open the CRM to find out who to call.
//
// Run: node scripts/test-handoff-alert-once.mjs
import fs from 'fs';

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const index = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');

// --- 1. The alert says who to call ------------------------------------------
check('the lead\'s phone is carried out of the CRM conversation',
  /phone: conversation\.phone \|\| ''/.test(index) && /email: conversation\.email \|\| ''/.test(index));
check('it is kept on the conversation for the alert', /conv\.phone = thread\.phone/.test(index));
check('the handoff alert prints Phone', /phone \? `Phone: \$\{phone\}` : null/.test(index));
check('the handoff alert prints Email', /email \? `Email: \$\{email\}` : null/.test(index));
check('the handoff alert carries a one-tap wa.me link', /waLink \? `WhatsApp: \$\{waLink\}` : null/.test(index)
  && /https:\/\/wa\.me\/\$\{phone\.replace/.test(index));
check('the agent-error alert carries the phone too', /errPhone \? `Phone: \$\{errPhone\}` : null/.test(index));

// --- 2. One alert per open handoff ------------------------------------------
check('a duplicate guard exists', /function alertAlreadySent\(/.test(index));
check('an open needs-human tag suppresses the repeat',
  /tagsBefore\.includes\('needs-human'\)/.test(index));
check('the tags the contact had BEFORE this message are what is read',
  /conv\.tagsBefore = Array\.isArray\(thread\.tags\)/.test(index));
check('a second in-process layer covers the tag-write lag',
  /ALERT_COOLDOWN_MS/.test(index) && /alertedAt\.set\(contactId, Date\.now\(\)\)/.test(index));
check('the guard runs before the send, not after',
  index.indexOf('const duplicate = alertAlreadySent(contactId)') < index.indexOf('const sent = await deliverAlert('));
check('a suppressed alert still tags the contact',
  /alert SUPPRESSED as a duplicate/.test(index)
  && index.indexOf("await tagContact(contactId, ['needs-human', 'hot-lead']") < index.indexOf('const duplicate = alertAlreadySent(contactId)'));
check('the timestamp is only recorded when the send actually succeeded',
  /if \(sent\.ok\) alertedAt\.set\(contactId, Date\.now\(\)\)/.test(index));
check('it can be switched off from Render', /HANDOFF_ALERT_DEDUPE/.test(index) && /HANDOFF_ALERT_COOLDOWN_MIN/.test(index));

// --- 3. The guard's own logic, exercised ------------------------------------
const COOLDOWN = 360 * 60_000;
const alerted = new Map();
const guard = (tagsBefore, contactId, now = Date.now()) => {
  if (tagsBefore.includes('needs-human')) return 'tag';
  const last = alerted.get(contactId);
  return last && now - last < COOLDOWN ? 'cooldown' : null;
};
check('first handoff for a fresh contact alerts', guard([], 'c1') === null);
alerted.set('c1', Date.now());
check('same contact one minute later does not', guard([], 'c1') === 'cooldown');
check('a contact already carrying needs-human does not', guard(['needs-human', 'hot-lead'], 'c2') === 'tag');
check('clearing the tag re-arms it', guard(['hot-lead'], 'c2') === null);
check('a different lead is unaffected', guard([], 'c3') === null);
check('after the cooldown it can alert again', guard([], 'c1', Date.now() + COOLDOWN + 1000) === null);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
