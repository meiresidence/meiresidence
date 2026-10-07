// When a real person on the Mei side writes to a client, the agent steps back.
//
// WHY THIS FILE EXISTS (2026-10-07): Eglent answers some leads himself — from the
// WhatsApp Business app on his phone (Coexistence), from the GHL inbox, or by
// calling them. The agent did not know a person had stepped in. Two things went
// wrong:
//   1. While a person was talking to a client, the client's next message was
//      answered by the agent too, so the client got a second, different-sounding
//      voice in the same chat (contact Jarosław, 6 Oct: Eglent was writing to him
//      by hand from his phone).
//   2. A race: the agent waits for the burst to land, then thinks, then sends in
//      paced bubbles — about 20 seconds end to end. If a person answered inside
//      that gap, the agent's reply still went out right after theirs.
//
// HOW A PERSON'S MESSAGE IS RECOGNISED. GHL's messages API marks every message the
// agent sends through the API with `meta.marketplace.appId` (the agent's
// integration). A message typed by a person — on the phone (echoed into GHL by
// Coexistence), in GHL's web/mobile inbox, or an outbound call — carries no app
// id. Bulk sends, workflows and campaigns are automated, not a person, and are
// recognised by their `source`. So a person's message is: outbound, not an
// activity row or internal note, not an automated source, no integration app id,
// and not one of the message ids this process just sent itself (belt and braces,
// in case GHL ever omits the app id on one of ours).
//
// THE RULE: if a person on our side has written to this client within the last
// HUMAN_TAKEOVER_HOURS (default 24), the agent stays quiet — no reply, no tags, no
// handoff. Every new message from that person restarts the clock. After a day with
// no human message the agent picks the conversation up again, with the person's
// messages in its history. HUMAN_TAKEOVER_HOURS=0 turns the time-based pause off.
// The contact tag `ai-off` pauses the agent for that contact indefinitely, until
// the tag is removed.

export const AUTOMATED_SOURCES = new Set(['bulk_actions', 'campaign', 'workflow', 'automated']);
export const AI_OFF_TAG = 'ai-off';

const HOUR = 3_600_000;

/** How long a person's message keeps the agent out of the conversation, in ms. */
export function takeoverWindowMs(env = process.env) {
  const raw = env.HUMAN_TAKEOVER_HOURS;
  if (raw === undefined || String(raw).trim() === '') return 24 * HOUR;
  const h = Number(raw);
  return Number.isFinite(h) && h > 0 ? h * HOUR : 0;
}

const isActivity = (t = '') => t.startsWith('TYPE_ACTIVITY') || t === 'TYPE_INTERNAL_COMMENT';

/** Was this message written by a person on our side (not the agent, not an automation)? */
export function isHumanOutbound(m, ownIds) {
  if (!m || m.direction !== 'outbound') return false;
  if (isActivity(m.messageType || '')) return false;
  if (AUTOMATED_SOURCES.has(m.source)) return false;
  if (m.meta?.marketplace?.appId) return false;
  if (m.id && ownIds && ownIds.has(m.id)) return false;
  return true;
}

/** Timestamp (ms) of the newest message a person on our side sent, or 0. */
export function lastHumanReplyAt(rawMessages, ownIds) {
  let latest = 0;
  for (const m of rawMessages || []) {
    if (!isHumanOutbound(m, ownIds)) continue;
    const at = Date.parse(m.dateAdded || '') || 0;
    if (at > latest) latest = at;
  }
  return latest;
}

/**
 * Should the agent stay out of this conversation right now?
 * @returns {null | {reason: string, at?: number}}  null = the agent may answer
 */
export function humanTakeover({ rawMessages, tags, ownIds, now = Date.now(), windowMs = takeoverWindowMs() } = {}) {
  if (Array.isArray(tags) && tags.some((t) => String(t).toLowerCase() === AI_OFF_TAG)) {
    return { reason: `contact is tagged ${AI_OFF_TAG}` };
  }
  if (!windowMs) return null;
  const at = lastHumanReplyAt(rawMessages, ownIds);
  if (at && now - at < windowMs) {
    const mins = Math.max(0, Math.round((now - at) / 60000));
    return { reason: `a person on our side wrote to this client ${mins} min ago`, at };
  }
  return null;
}
