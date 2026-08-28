// Follow-up ladder — the deterministic core of the scheduled follow-up agent.
//
// Plan: claude/followup-agent-plan.md in the Mei Residence Claude project
// (day 0 -> 3 -> 7 -> 21, positives only after day 0, Eglent presses send).
//
// This file is PURE LOGIC: no network, no Anthropic, no GHL. It takes a
// contact snapshot (built by scripts/followup-run.mjs from the CRM) plus the
// persisted per-contact state, and answers one question: what, if anything,
// should be staged for this contact today — and if nothing, exactly why.
// Everything here is unit-tested in scripts/test-followup-ladder.mjs.
//
// DESIGN RULES (from the plan — do not soften these in a refactor):
//   1. The filter runs BEFORE any model call and its verdict is final. A
//      classifier can never resurrect a contact the filter dropped.
//   2. Day 3/7/21 are only ever reached through a POSITIVE reply to an earlier
//      rung. Chasing silence four times is how a number gets reported.
//   3. "They asked something and we never answered" is NOT a follow-up case —
//      it is a bug, routed to a human (see classify.js: state 'unanswered').
//   4. Nothing is scheduled off a wall clock alone: every stage advance is
//      derived from what actually appears in the CRM thread (send detection
//      lives in the runner; this file only reads the resulting state).

import { looksLikeNonBuyerOutreach } from '../not-a-lead.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Quiet windows and rung spacing. Overridable for tests only — production
// always runs the defaults, which are the ones agreed in the plan.
export const LADDER = {
  d0QuietMs: 14 * DAY,   // silence before a day-0 re-engagement
  d3QuietMs: 72 * HOUR,  // silence after a positive reply before day 3
  d7GapMs: 4 * DAY,      // gap after the day-3 send
  d21GapMs: 14 * DAY,    // gap after the day-7 send
  recentOutboundMs: 48 * HOUR, // ANY outbound this recent -> the live agent owns it
  activeInboundMs: 72 * HOUR,  // they wrote this recently -> conversation is live
};

// Tags that permanently or temporarily keep a contact out of the ladder.
export const STOP_TAGS = ['fu-stop', 'fu-done', 'test-contact-do-not-contact'];
export const QUEUE_TAGS = ['fu-queue-d0', 'fu-queue-d3', 'fu-queue-d7', 'fu-queue-d21'];
// Excluded by default; a batch can deliberately include them (plan §"who never
// enters"): these 26 already got the single-touch n8n message.
export const LEGACY_SENT_TAG = 'mei-fu-sent';
export const UNKNOWN_TAG = 'new-lead-unknown';

const STOPWORDS = /\b(stop|ndalo|mos m[eë] shkruaj|nuk dua|unsubscribe|çregjistrohu|cregjistrohu)\b/i;

/**
 * The deterministic filter + ladder decision for one contact.
 *
 * @param {object} snap - contact snapshot:
 *   tags: string[] (lowercased by the runner)
 *   dndAll: boolean
 *   phone: string|'' , email: string|''
 *   lastInboundAt: number|0, lastOutboundAt: number|0 (ms epoch)
 *   lastInboundChannel: 'whatsapp'|'instagram'|'facebook'|'sms'|''
 *   inboundText: string  (the client's own recent words, joined)
 * @param {object} state - persisted state for this contact (may be {}):
 *   stage: undefined|0|3|7|21, lastSentAt: number, sentiment: string,
 *   nextDueAt: number
 * @param {number} now - ms epoch
 * @param {object} [ladder] - LADDER override for tests
 * @returns {{action:'skip'|'queue'|'stop'|'done'|'classify', reason:string, stage?:0|3|7|21, channel?:string}}
 */
export function decide(snap, state = {}, now = Date.now(), ladder = LADDER) {
  const tags = snap.tags || [];
  const has = (t) => tags.includes(t);

  // --- hard exclusions, in the order of the plan -------------------------
  for (const t of STOP_TAGS) if (has(t)) return skip(`stop-tag:${t}`);
  if (has(LEGACY_SENT_TAG) && !snap.includeLegacySent) return skip('legacy-mei-fu-sent');
  if (has(UNKNOWN_TAG)) return skip('unknown-needs-human-eye');
  if (snap.dndAll) return skip('dnd');
  if (!snap.lastInboundAt) return skip('never-engaged');
  if (STOPWORDS.test(snap.inboundText || '')) return { action: 'stop', reason: 'wrote-stop' };
  if (snap.lastOutboundAt && now - snap.lastOutboundAt < ladder.recentOutboundMs) {
    return skip('recent-outbound');
  }
  if (looksLikeNonBuyerOutreach(snap.inboundText || '')) return skip('not-a-lead');
  if (state.nextDueAt && state.nextDueAt > now) return skip('not-due');
  for (const t of QUEUE_TAGS) if (has(t)) return skip(`already-queued:${t}`);
  if (!snap.phone && !snap.email) return skip('no-channel');

  const quietFor = now - snap.lastInboundAt;

  // --- the ladder --------------------------------------------------------
  const stage = state.stage;

  if (stage === undefined || stage === null) {
    // Never entered the ladder. Day 0 wants real staleness.
    if (quietFor < ladder.d0QuietMs) return skip('too-soon-d0');
    return queue(0, snap);
  }

  const repliedSinceSend = snap.lastInboundAt > (state.lastSentAt || 0);

  if (stage === 0) {
    if (!repliedSinceSend) return skip('awaiting-reply-d0'); // silence ends the ladder
    // A reply exists. Its sentiment decides — and sentiment is the model's
    // call, not a regex: hand the contact to the classifier.
    if (state.sentiment === 'negative') return { action: 'stop', reason: 'negative-reply' };
    if (state.sentiment !== 'positive') return { action: 'classify', reason: 'sentiment-unknown' };
    if (quietFor < ladder.d3QuietMs) return skip('still-talking');
    return queue(3, snap);
  }

  if (stage === 3 || stage === 7) {
    const gap = stage === 3 ? ladder.d7GapMs : ladder.d21GapMs;
    const next = stage === 3 ? 7 : 21;
    if (state.sentiment === 'negative') return { action: 'stop', reason: 'negative-reply' };
    if (now - (state.lastSentAt || 0) < gap) return skip(`gap-not-elapsed-d${next}`);
    // If they wrote very recently the live agent owns the conversation.
    if (quietFor < ladder.activeInboundMs) return skip('conversation-live');
    return queue(next, snap);
  }

  if (stage === 21) return { action: 'done', reason: 'ladder-complete' };

  return skip(`unknown-stage:${stage}`);
}

function skip(reason) { return { action: 'skip', reason }; }

function queue(stage, snap) {
  return { action: 'queue', reason: `due-d${stage}`, stage, channel: routeChannel(snap, stage) };
}

/**
 * Channel routing, per the plan: the channel they last replied on wins;
 * Instagram only holds while Meta's 24h window is open (no template
 * equivalent exists on IG DM); email is the fallback when WhatsApp can't run
 * and the only channel for the no-phone (Polish) segment.
 */
export function routeChannel(snap, stage, now = Date.now()) {
  const igWindowOpen =
    snap.lastInboundChannel === 'instagram' && now - snap.lastInboundAt < 24 * HOUR;
  if (igWindowOpen) return 'instagram';
  if (snap.phone) return 'whatsapp';
  if (snap.email) return 'email';
  return 'none';
}

/** Tag name for a queued rung. */
export const queueTag = (stage) => `fu-queue-d${stage}`;
