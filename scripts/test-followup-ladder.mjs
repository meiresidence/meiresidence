#!/usr/bin/env node
// Regression tests for the follow-up ladder (src/followup-agent/ladder.js).
// Pure logic, no network. Run: node scripts/test-followup-ladder.mjs
//
// These lock in the plan's rules (claude/followup-agent-plan.md):
//   - day 0 only after 14+ days of silence
//   - days 3/7/21 only through a POSITIVE reply, never through silence
//   - a recent outbound (the live agent, Eglent, anyone) blocks everything
//   - stop tags, DND, non-leads, unknowns and the legacy mei-fu-sent never enter
//   - Instagram only inside the 24h window; email only as fallback

import { decide, routeChannel, LADDER, queueTag } from '../src/followup-agent/ladder.js';

const NOW = Date.parse('2026-08-28T09:30:00Z');
const HOUR = 3600000;
const DAY = 24 * HOUR;

const base = () => ({
  contactId: 'c1',
  name: 'Test',
  tags: [],
  dndAll: false,
  phone: '+355691234567',
  email: '',
  lastInboundAt: NOW - 20 * DAY,
  lastOutboundAt: NOW - 21 * DAY,
  lastInboundChannel: 'whatsapp',
  inboundText: 'A mund te marr me shume informacion per apartamentet?',
  transcript: [],
});

let pass = 0, fail = 0;
function t(name, got, want) {
  const g = JSON.stringify(pick(got)), w = JSON.stringify(want);
  if (g === w) { pass++; }
  else { fail++; console.error(`✗ ${name}\n    got  ${g}\n    want ${w}`); }
}
const pick = (d) => ({ action: d.action, reason: d.reason, ...(d.stage !== undefined ? { stage: d.stage } : {}), ...(d.channel ? { channel: d.channel } : {}) });

// ---------------------------------------------------------------- filter ---
t('fu-stop tag blocks', decide({ ...base(), tags: ['fu-stop'] }, {}, NOW),
  { action: 'skip', reason: 'stop-tag:fu-stop' });

t('fu-done tag blocks', decide({ ...base(), tags: ['fu-done'] }, {}, NOW),
  { action: 'skip', reason: 'stop-tag:fu-done' });

t('test contact blocks', decide({ ...base(), tags: ['test-contact-do-not-contact'] }, {}, NOW),
  { action: 'skip', reason: 'stop-tag:test-contact-do-not-contact' });

t('legacy mei-fu-sent excluded by default', decide({ ...base(), tags: ['mei-fu-sent'] }, {}, NOW),
  { action: 'skip', reason: 'legacy-mei-fu-sent' });

t('legacy included only deliberately',
  decide({ ...base(), tags: ['mei-fu-sent'], includeLegacySent: true }, {}, NOW),
  { action: 'queue', reason: 'due-d0', stage: 0, channel: 'whatsapp' });

t('new-lead-unknown needs a human eye', decide({ ...base(), tags: ['new-lead-unknown'] }, {}, NOW),
  { action: 'skip', reason: 'unknown-needs-human-eye' });

t('DND blocks', decide({ ...base(), dndAll: true }, {}, NOW),
  { action: 'skip', reason: 'dnd' });

t('never engaged blocks', decide({ ...base(), lastInboundAt: 0 }, {}, NOW),
  { action: 'skip', reason: 'never-engaged' });

t('STOP written by the client', decide({ ...base(), inboundText: 'STOP' }, {}, NOW),
  { action: 'stop', reason: 'wrote-stop' });

t('"mos me shkruaj" is a stop', decide({ ...base(), inboundText: 'Mos më shkruaj më ju lutem' }, {}, NOW),
  { action: 'stop', reason: 'wrote-stop' });

t('recent outbound blocks — the live agent owns it',
  decide({ ...base(), lastOutboundAt: NOW - 3 * HOUR }, {}, NOW),
  { action: 'skip', reason: 'recent-outbound' });

t('vendor pitch never enters (not-a-lead guard reused)',
  decide({ ...base(), inboundText: 'Rastesisht gjeta faqen tuaj ne Instagram. Kam pergatitur nje ide si te prezantohen pronat. A do te ishit te hapur qe t\'jua tregoja?' }, {}, NOW),
  { action: 'skip', reason: 'not-a-lead' });

t('nextDueAt in the future blocks',
  decide(base(), { stage: 0, lastSentAt: NOW - 1 * DAY, nextDueAt: NOW + 2 * DAY }, NOW),
  { action: 'skip', reason: 'not-due' });

t('already queued blocks re-queueing',
  decide({ ...base(), tags: ['fu-queue-d0'] }, {}, NOW),
  { action: 'skip', reason: 'already-queued:fu-queue-d0' });

t('no phone and no email blocks',
  decide({ ...base(), phone: '', email: '' }, {}, NOW),
  { action: 'skip', reason: 'no-channel' });

// ---------------------------------------------------------------- day 0 ----
t('13 days quiet is too soon for day 0',
  decide({ ...base(), lastInboundAt: NOW - 13 * DAY }, {}, NOW),
  { action: 'skip', reason: 'too-soon-d0' });

t('14+ days quiet queues day 0 on WhatsApp', decide(base(), {}, NOW),
  { action: 'queue', reason: 'due-d0', stage: 0, channel: 'whatsapp' });

t('no phone falls back to email',
  decide({ ...base(), phone: '', email: 'x@y.pl' }, {}, NOW),
  { action: 'queue', reason: 'due-d0', stage: 0, channel: 'email' });

// ------------------------------------------------------------- day 3 gate --
const sent0 = { stage: 0, lastSentAt: NOW - 5 * DAY };

t('no reply after day 0 -> ladder ends in silence',
  decide({ ...base(), lastInboundAt: NOW - 20 * DAY }, sent0, NOW),
  { action: 'skip', reason: 'awaiting-reply-d0' });

t('reply with unknown sentiment -> classify, never auto-queue',
  decide({ ...base(), lastInboundAt: NOW - 4 * DAY }, sent0, NOW),
  { action: 'classify', reason: 'sentiment-unknown' });

t('negative reply -> fu-stop',
  decide({ ...base(), lastInboundAt: NOW - 4 * DAY }, { ...sent0, sentiment: 'negative' }, NOW),
  { action: 'stop', reason: 'negative-reply' });

t('positive reply but still talking (<72h quiet) waits',
  decide({ ...base(), lastInboundAt: NOW - 1 * DAY }, { ...sent0, sentiment: 'positive' }, NOW),
  { action: 'skip', reason: 'still-talking' });

t('positive reply + 72h quiet queues day 3',
  decide({ ...base(), lastInboundAt: NOW - 4 * DAY }, { ...sent0, sentiment: 'positive' }, NOW),
  { action: 'queue', reason: 'due-d3', stage: 3, channel: 'whatsapp' });

t('neutral sentiment goes back to the classifier',
  decide({ ...base(), lastInboundAt: NOW - 4 * DAY }, { ...sent0, sentiment: 'neutral' }, NOW),
  { action: 'classify', reason: 'sentiment-unknown' });

// ---------------------------------------------------------- day 7 / 21 -----
t('day 7 waits out the 4-day gap',
  decide({ ...base(), lastInboundAt: NOW - 5 * DAY }, { stage: 3, lastSentAt: NOW - 2 * DAY, sentiment: 'positive' }, NOW),
  { action: 'skip', reason: 'gap-not-elapsed-d7' });

t('day 7 fires after the gap when they are quiet again',
  decide({ ...base(), lastInboundAt: NOW - 5 * DAY }, { stage: 3, lastSentAt: NOW - 5 * DAY, sentiment: 'positive' }, NOW),
  { action: 'queue', reason: 'due-d7', stage: 7, channel: 'whatsapp' });

t('a fresh inbound keeps day 7 out — conversation is live',
  decide({ ...base(), lastInboundAt: NOW - 1 * DAY }, { stage: 3, lastSentAt: NOW - 5 * DAY, sentiment: 'positive' }, NOW),
  { action: 'skip', reason: 'conversation-live' });

t('day 21 fires 14 days after day 7',
  decide({ ...base(), lastInboundAt: NOW - 16 * DAY }, { stage: 7, lastSentAt: NOW - 15 * DAY, sentiment: 'positive' }, NOW),
  { action: 'queue', reason: 'due-d21', stage: 21, channel: 'whatsapp' });

t('after day 21 the ladder is done',
  decide({ ...base(), lastInboundAt: NOW - 40 * DAY }, { stage: 21, lastSentAt: NOW - 20 * DAY }, NOW),
  { action: 'done', reason: 'ladder-complete' });

// ------------------------------------------------------------- channels ----
function chan(snap) { return { action: 'channel', reason: routeChannel(snap, 0, NOW) }; }

t('Instagram wins inside its 24h window',
  chan({ ...base(), lastInboundChannel: 'instagram', lastInboundAt: NOW - 5 * HOUR }),
  { action: 'channel', reason: 'instagram' });
t('Instagram outside 24h falls back to WhatsApp',
  chan({ ...base(), lastInboundChannel: 'instagram', lastInboundAt: NOW - 30 * HOUR }),
  { action: 'channel', reason: 'whatsapp' });
t('email is the last resort',
  chan({ ...base(), phone: '', email: 'a@b.cz', lastInboundChannel: 'whatsapp' }),
  { action: 'channel', reason: 'email' });

t('queueTag names match the tag scheme',
  { action: 'tag', reason: [0, 3, 7, 21].map(queueTag).join(',') },
  { action: 'tag', reason: 'fu-queue-d0,fu-queue-d3,fu-queue-d7,fu-queue-d21' });

// ---------------------------------------------------------------- report ---
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
console.log('✓ follow-up ladder behaves per claude/followup-agent-plan.md');
