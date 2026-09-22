// The handoff alert goes out as a GHL WhatsApp TEMPLATE, not a free-form
// message from the agent (2026-09-17).
//
// What was wrong: escalate() sent Eglent a free-form WhatsApp message first.
// WhatsApp refuses a free-form message more than 24 hours after the recipient's
// last inbound, so on any quiet day the alert he actually reads was guaranteed
// to fail before SMS or Email picked it up. A free-form message cannot re-open
// that window — only an approved template can, and the agent cannot send one.
//
// So the chain reversed: the agent writes two template-safe fields, tags
// `needs-human`, and the GHL "Specialist Handoff Alert" workflow delivers the
// template. The direct send survives for exactly one case — the tag not
// landing, which leaves nothing downstream to fire at all.
//
// Run: node scripts/test-handoff-template-alert.mjs
import fs from 'fs';
import {
  alertMode, fallbackChannels, alertChannels, templateSafe, detailFollowupEnabled,
  HANDOFF_SUMMARY_FIELD_ID, HANDOFF_LAST_MSG_FIELD_ID,
} from '../src/specialist.js';

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : ` -> ${detail}`}`);
  if (!ok) failed++;
};
const index = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const specialist = fs.readFileSync(new URL('../src/specialist.js', import.meta.url), 'utf8');

// An indexOf that fails loudly instead of returning -1, which silently made
// an ordering check pass against a string that no longer existed.
const at = (needle) => {
  const i = index.indexOf(needle);
  if (i < 0) throw new Error(`anchor not found in index.js: ${needle}`);
  return i;
};

// --- 1. The default is the workflow, not the agent ---------------------------
delete process.env.HANDOFF_ALERT_MODE;
check('the default mode is workflow', alertMode() === 'workflow', alertMode());
process.env.HANDOFF_ALERT_MODE = 'direct';
check('it can be put back to direct from Render', alertMode() === 'direct');
process.env.HANDOFF_ALERT_MODE = 'both';
check('both is a valid mode', alertMode() === 'both');
process.env.HANDOFF_ALERT_MODE = 'nonsense';
check('an unknown value falls back to workflow, never to silence', alertMode() === 'workflow');
delete process.env.HANDOFF_ALERT_MODE;

check('escalate() returns without sending when the tag landed',
  /if \(mode === 'workflow' && tagged\) \{/.test(index)
  && /via: 'workflow'/.test(index));
check('a handoff delegated to the workflow still counts as alerted',
  /alerted: true, via: 'workflow'/.test(index));

// --- 2. The fallback exists, and only for a failed tag -----------------------
check('a failed tag is logged as the workflow not firing',
  /TAGGING FAILED — the GHL workflow will not fire/.test(index));
check('the fallback send is reached only when the tag did not land',
  index.indexOf("if (mode === 'workflow' && tagged) {") < index.indexOf('const sent = await deliverAlert('));
check('the fallback channel order puts WhatsApp last',
  JSON.stringify(fallbackChannels()) === JSON.stringify(['SMS', 'Email', 'WhatsApp']),
  JSON.stringify(fallbackChannels()));
process.env.SPECIALIST_FALLBACK_CHANNEL = 'Email';
check('the fallback channel is overridable', fallbackChannels()[0] === 'Email');
delete process.env.SPECIALIST_FALLBACK_CHANNEL;
check('the old alertChannels order is untouched for direct mode',
  JSON.stringify(alertChannels()) === JSON.stringify(['WhatsApp', 'SMS', 'Email']));
check('the agent-error path uses the same fallback order',
  /channels: errMode === 'workflow' \? fallbackChannels\(\) : null/.test(index));
check('the agent-error path also delegates to the workflow',
  /errMode === 'workflow' && errTagged/.test(index));

// --- 2b. The detail message that rides on top of the template ---------------
delete process.env.HANDOFF_DETAIL_FOLLOWUP;
check('the detail follow-up is on by default', detailFollowupEnabled() === true);
process.env.HANDOFF_DETAIL_FOLLOWUP = 'off';
check('it can be switched off from Render', detailFollowupEnabled() === false);
process.env.HANDOFF_DETAIL_FOLLOWUP = 'on';
check('on turns it back on', detailFollowupEnabled() === true);
delete process.env.HANDOFF_DETAIL_FOLLOWUP;

check('the follow-up is sent after the tag is confirmed, inside the workflow branch',
  /const detail = await sendDetailFollowup\(contactId, specialist, body\)/.test(index)
  && index.indexOf('const detail = await sendDetailFollowup') > index.indexOf("if (mode === 'workflow' && tagged) {"));
check('it tries WhatsApp only — SMS and Email would repeat the template',
  /const res = await sendToSpecialist\(specialist, body, 'WhatsApp'\)/.test(index));
check('a refusal is logged as harmless, not as a failure',
  /the template still carried the alert/.test(index)
  && !/console\.error\([^)]*detail message/.test(index));
check('it never throws out of the handoff', /catch \(e\) \{\n    console\.log\(`\[handoff\] \$\{contactId\}: detail message threw/.test(index));
check('a repeat handoff does not repeat the detail message',
  /if \(alertAlreadySent\(contactId\)\) return \{ attempted: false, reason: 'duplicate' \}/.test(index));
check('a delivered detail message arms the duplicate guard',
  /alertedAt\.set\(contactId, Date\.now\(\)\);\n      console\.log\(`\[handoff\] \$\{contactId\}: detail message delivered/.test(index));
check('the agent-error path gets the same detail message',
  /await sendDetailFollowup\(contactId, specialist, buildAgentErrorAlert\(contactId, name, errMsg\)\)/.test(index));
check('the agent-error alert body is built once and used by both paths',
  /function buildAgentErrorAlert\(contactId, name, errMsg\)/.test(index)
  && (index.match(/buildAgentErrorAlert\(contactId, name, errMsg\)/g) || []).length === 3);

// --- 2c. The guard no longer hangs on a tag GHL owns (2026-09-18) -----------
// Live test that day: `needs-human` was stripped 67s after it was applied in
// one run and 44s in the next, `hot-lead` untouched. The workflow's own
// execution log shows why — a Wait, then a Remove Tag step. So the tag cannot
// be the memory of "already alerted", and re-adding it re-fires the workflow.
check('a durable tag the agent owns exists', /const HANDOFF_ALERTED_TAG = 'handoff-alerted'/.test(index));
check('the guard reads it', /tagsBefore\.includes\(HANDOFF_ALERTED_TAG\)/.test(index));
check('needs-human is still honoured as a secondary signal',
  /tagsBefore\.includes\('needs-human'\)/.test(index));
check('the durable tag is checked BEFORE needs-human',
  index.indexOf('tagsBefore.includes(HANDOFF_ALERTED_TAG)') < index.indexOf("tagsBefore.includes('needs-human')"));
check('the duplicate check now runs BEFORE the tag write, not after',
  at('const duplicate = alertAlreadySent(contactId);')
  < at("await tagContact(contactId, ['needs-human', 'hot-lead', HANDOFF_ALERTED_TAG]"));
check('a repeat handoff does NOT re-apply needs-human',
  /duplicate\s*\?\s*await tagContact\(contactId, \['hot-lead', HANDOFF_ALERTED_TAG\]/.test(index));
check('a repeat handoff still keeps the contact current', /'hot-lead', HANDOFF_ALERTED_TAG\]/.test(index));
check('the skipped re-tag is logged', /needs-human NOT re-applied/.test(index));
check('the agent-error path does the same',
  /errDuplicate\s*\?\s*await tagContact\(contactId, \['agent-error', HANDOFF_ALERTED_TAG\]/.test(index));
check('every fresh handoff applies the durable tag',
  /await tagContact\(contactId, \['needs-human', 'hot-lead', HANDOFF_ALERTED_TAG\]/.test(index));

// --- 3. Template-safety: what Meta rejects, we never send --------------------
check('a newline is flattened', !/\n/.test(templateSafe('one\ntwo')));
check('a tab is flattened', !/\t/.test(templateSafe('one\ttwo')));
check('runs of spaces collapse (Meta rejects 4+)', templateSafe('a     b') === 'a b');
check('an empty value becomes a placeholder, never an empty param',
  templateSafe('') === '-' && templateSafe(null) === '-' && templateSafe(undefined) === '-');
check('a whitespace-only value becomes a placeholder', templateSafe('   \n  ') === '-');
check('a custom fallback is honoured', templateSafe('', { fallback: 'Pa mesazh' }) === 'Pa mesazh');
check('a long value is clipped, not dropped', templateSafe('x'.repeat(900)).length === 300);
check('the value is trimmed at both ends', templateSafe('  hi  ') === 'hi');
check('ordinary text survives unchanged', templateSafe('1+1 me pamje nga deti, A215') === '1+1 me pamje nga deti, A215');

// --- 4. The fields the template reads ----------------------------------------
check('the summary field id is pinned', HANDOFF_SUMMARY_FIELD_ID === 'xdBaknqf5WOm2Czrfg8k');
check('the last-message field id is pinned', HANDOFF_LAST_MSG_FIELD_ID === '1yWjm1Z9IhRBjDDlgl9Z');
check('both field ids are exported for the workflow to be checked against',
  /HANDOFF_SUMMARY_FIELD_ID/.test(specialist) && /HANDOFF_LAST_MSG_FIELD_ID/.test(specialist));
check('index.js writes both of them', /id: HANDOFF_SUMMARY_FIELD_ID/.test(index) && /id: HANDOFF_LAST_MSG_FIELD_ID/.test(index));
check('every field value goes through templateSafe',
  /value: handoffSummaryLine\(/.test(index)
  && /value: templateSafe\(lastClientText\(contactId\)/.test(index));
check('the summary line itself is template-safe', /return templateSafe\(parts\.join\(' · '\), \{ max: 300/.test(index));
check('the name and phone are carried INSIDE the summary, not as their own params',
  /name \|\| 'Pa emër'/.test(index) && /phone \|\| 'pa numër/.test(index));
check('the phone is read off the conversation the CRM rebuilt',
  /const conv = store\.get\(contactId\);\n  const phone = String\(conv\?\.phone \|\| ''\)\.trim\(\)/.test(index));
// Meta rejects the whole send if ANY parameter is empty, and GHL still logs
// "Success" — proved live 2026-09-18, where the same workflow delivered for a
// lead with a phone and delivered nothing for one without.
check('all four template parameters come from agent-written fields',
  /id: HANDOFF_SUMMARY_FIELD_ID/.test(index) && /id: HANDOFF_CHANNEL_FIELD_ID/.test(index)
  && /id: HANDOFF_PHONE_FIELD_ID/.test(index) && /id: HANDOFF_LAST_MSG_FIELD_ID/.test(index));
check('the channel parameter can never be empty', /HANDOFF_CHANNEL_FIELD_ID, value: templateSafe\(conv\?\.channel, \{ max: 40, fallback: 'WhatsApp' \}\)/.test(index));
check('the phone parameter can never be empty',
  /HANDOFF_PHONE_FIELD_ID, value: templateSafe\(phone, \{ max: 40, fallback: 'pa numër/.test(index));
check('the channel is carried onto the conversation like phone and email',
  /conv\.channel = thread\.channel \|\| conv\.channel \|\| ''/.test(index));
check('the lead\'s name is passed in from escalate()',
  /writeHandoffFields\(contactId, args, \{ name \}\)/.test(index));
check('an empty summary still says something', /fallback: 'Lead i ri — pa detaje'/.test(index));
// Proved live 2026-09-22: the workflow's {{4}} is the typed tag
// {{contact.last_client_message}}, which GHL resolves whenever the field has a
// value. A newline in it makes Meta drop the whole send while GHL logs Success —
// which is how every real handoff since 18 Sep vanished.
check('Last Client Message is written as ONE line, never a bulleted list',
  !/`- \$\{clip\(m, 300\)\}`\)\.join\('\\n'\)/.test(index)
  && /id: LAST_MSG_FIELD_ID,\n\s+value: templateSafe\(recent\.map\(\(m\) => clip\(m, 200\)\)\.join\(' \| '\), \{ max: 500/.test(index));
check('no handoff field value is ever joined with a newline',
  !/customFields\.unshift\([\s\S]{0,200}?join\('\\n'\)/.test(index));

// --- 5. Ordering: the fields must be on the contact BEFORE the tag fires -----
check('the fields are written before the tag',
  at('await writeHandoffFields(contactId, args, { name })')
  < at("await tagContact(contactId, ['needs-human', 'hot-lead', HANDOFF_ALERTED_TAG]"));
check('the agent-error fields are written before its tag',
  at("summaryPrefix: '⚠️ GABIM I AGJENTIT")
  < at("await tagContact(contactId, ['needs-human', 'agent-error', HANDOFF_ALERTED_TAG]"));
check('all three fields go out in ONE PUT, so the tag cannot catch a half-write',
  /const r = await ghl\(`\/contacts\/\$\{contactId\}`, 'PUT', \{ customFields \}/.test(index)
  && (index.match(/await ghl\(`\/contacts\/\$\{contactId\}`, 'PUT', \{ customFields/g) || []).length === 1);
check('a failed field write is loud', /HANDOFF FIELD WRITE FAILED/.test(index));
check('the old two-write helper is gone', !/async function writeRecentMessages\(/.test(index));

// --- 6. The summary line, exercised -----------------------------------------
const summarise = (args, { name = '', phone = '', prefix = '' } = {}) => {
  const parts = [prefix, name || 'Pa emër', phone || 'pa numër — hape bisedën në CRM',
    args.buyer_type, args.interested_in, args.budget, args.language, args.reason]
    .map((p) => templateSafe(p, { max: 90, fallback: '' })).filter(Boolean);
  return templateSafe(parts.join(' · '), { max: 300, fallback: 'Lead i ri — pa detaje' });
};
check('a full set reads as one line, name and number first',
  summarise({ buyer_type: 'individual investor', interested_in: '1+1 sea view, A215', budget: 'under 100,000 EUR', language: 'Albanian', reason: 'asked for a call' },
    { name: 'Lorena', phone: '+355671112223' })
  === 'Lorena · +355671112223 · individual investor · 1+1 sea view, A215 · under 100,000 EUR · Albanian · asked for a call',
  summarise({ buyer_type: 'individual investor', interested_in: '1+1 sea view, A215', budget: 'under 100,000 EUR', language: 'Albanian', reason: 'asked for a call' }, { name: 'Lorena', phone: '+355671112223' }));
check('missing args do not leave dangling separators',
  summarise({ interested_in: '2+1', language: 'English' }, { name: 'Jan', phone: '+420123' })
  === 'Jan · +420123 · 2+1 · English');
check('an anonymous Instagram lead still produces a non-empty param',
  summarise({}) === 'Pa emër · pa numër — hape bisedën në CRM');
check('a multi-line reason cannot break the template',
  !/\n/.test(summarise({ reason: 'wants\na\ncall' })));
check('the agent-error prefix leads the line',
  summarise({}, { prefix: '⚠️ GABIM' }).startsWith('⚠️ GABIM'));
check('the whole line stays inside the 300-char budget',
  summarise({ buyer_type: 'x'.repeat(200), interested_in: 'y'.repeat(200), reason: 'z'.repeat(200) }).length <= 300);

// --- 7. Nothing that was already working got dropped -------------------------
check('the duplicate guard still runs before any direct send',
  index.indexOf('const duplicate = alertAlreadySent(contactId)') < index.indexOf('const sent = await deliverAlert('));
check('the non-buyer guard still blocks the whole handoff',
  /looksLikeNonBuyerOutreach\(clientWords\)/.test(index));
check('the timing gate is untouched', /handoffTooEarly\(\{ clientTurns, clientWords \}\)/.test(index));
check('the promise-reconcile path is untouched',
  /reconcileEnabled\(\) && promisesHandoff\(reply\)/.test(index));
check('deliverAlert still defaults to alertChannels when given none',
  /for \(const channel of \(channels \|\| alertChannels\(\)\)\)/.test(specialist));

console.log(`\n${failed ? `${failed} FAILED` : 'all checks passed'}`);
process.exit(failed ? 1 : 0);
