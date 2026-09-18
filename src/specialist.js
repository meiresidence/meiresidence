// Who a handoff wakes, and how that alert actually reaches him.
//
// THE BUG THIS FIXES (2026-09-09). escalate() read SPECIALIST_CONTACT_ID
// straight from the environment and, when it was empty, logged a warning and
// returned — no alert, ever, and nothing in the CRM to show for it. The whole
// handoff then rested on one leg: the GHL "Specialist Handoff Alert" workflow
// firing off the needs-human tag and emailing Eglent. Those emails ran daily
// from 6 to 28 August and then stopped: 12 days with a live agent, real buyers
// and not one alert.
//
// Two changes here:
//  1. The specialist has a DEFAULT — Eglent's own CRM contact. A missing env
//     var can no longer silence the alert; it can only redirect it.
//  2. The alert FALLS BACK across channels. WhatsApp refuses a free-form
//     message more than 24 hours after the recipient's last inbound ("Message
//     failed to send because more than 24 hours have passed since the customer
//     last replied to this number" — seen on this very contact on 19 Aug), so
//     a WhatsApp-only alert is silent on exactly the days nobody has been
//     chatting. SMS, then Email, carry it when WhatsApp will not.

// THE FIX ON TOP OF THAT (2026-09-17). Falling back to SMS and Email kept the
// alert alive, but the FIRST attempt was still a free-form WhatsApp message to
// Eglent — the one channel WhatsApp itself refuses outside the 24-hour window.
// On a quiet day every handoff burned a guaranteed failure before it landed
// anywhere, and the alert Eglent actually reads (WhatsApp) was the one that
// never arrived. A free-form message cannot re-open that window; only an
// approved TEMPLATE can.
//
// The agent does not send templates. GHL does. So the delivery now runs the
// other way round: the agent writes the lead's details into two template-safe
// contact fields, applies `needs-human`, and the GHL "Specialist Handoff Alert"
// workflow sends Eglent an approved WhatsApp template as an Internal
// Notification. The 24-hour window stops being part of the chain at all.
//
// The old direct send stays as the FALLBACK — but only for the one case that
// leaves nothing downstream: the tag write failing. Then nothing in GHL will
// ever fire, so the agent alerts him itself, SMS first (see fallbackChannels).

// Eglent Bici, +355 67 204 9400 / bicieglent@gmail.com — the human every
// handoff is meant to reach. Override with SPECIALIST_CONTACT_ID in Render.
export const EGLENT_CONTACT_ID = 'U8zP6NNBfCVVvK6LBWe3';

// The two contact fields the WhatsApp template reads, created in location
// kYtT2id1lBqDXsFCeHgY on 2026-09-17. Both are single-line TEXT on purpose:
// a WhatsApp template parameter may not contain a newline (see templateSafe).
// The GHL workflow's approved `leads` template takes four parameters, and
// Meta rejects the WHOLE send if any one of them is empty — GHL still logs the
// step as "Success", so the alert vanishes with no error anywhere. Proved live
// on 2026-09-18: the same workflow delivered for a lead who had a phone number
// and delivered nothing, twice, for a lead who did not.
//
// That is why all four values come from fields this agent writes and
// guarantees non-empty, rather than from `{{contact.phone}}` and friends.
// Instagram, Facebook and web-form leads routinely have no phone and no
// email — exactly the leads a human most needs to see.
//
//   contact.handoff_summary      -> {{1}}
//   contact.handoff_channel      -> {{2}}
//   contact.handoff_phone        -> {{3}}
//   contact.handoff_last_message -> {{4}}
export const HANDOFF_SUMMARY_FIELD_ID = 'xdBaknqf5WOm2Czrfg8k';
export const HANDOFF_LAST_MSG_FIELD_ID = '1yWjm1Z9IhRBjDDlgl9Z';
export const HANDOFF_CHANNEL_FIELD_ID = 'X9eyDLi6j5h5oDRtrls8';
export const HANDOFF_PHONE_FIELD_ID = 'WGXcSfYqTDo0D8rTuuuH';

// How the alert reaches him.
//   workflow (default) — tag only; the GHL workflow sends the template.
//   direct             — the old behaviour: the agent messages him itself.
//   both               — tag AND message. Two pings per handoff.
// HANDOFF_ALERT_MODE changes this from Render without a deploy.
export function alertMode() {
  const m = String(process.env.HANDOFF_ALERT_MODE || 'workflow').trim().toLowerCase();
  return ['workflow', 'direct', 'both'].includes(m) ? m : 'workflow';
}

// Meta rejects a template parameter that contains a newline or tab, is empty,
// or carries a run of four or more spaces — the send fails with 132000/132001
// and the alert is silently lost. Every value the workflow feeds the template
// goes through here first, so a two-paragraph client message cannot break the
// one notification that matters.
export function templateSafe(value, { max = 300, fallback = '-' } = {}) {
  const flat = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!flat) return fallback;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function specialistContactId() {
  const fromEnv = String(process.env.SPECIALIST_CONTACT_ID || '').trim();
  return fromEnv || EGLENT_CONTACT_ID;
}

// Preferred channel first (SPECIALIST_CHANNEL, default WhatsApp), then the
// others as fallbacks. Set SPECIALIST_CHANNEL_FALLBACK=off for one attempt only.
export function alertChannels() {
  const preferred = String(process.env.SPECIALIST_CHANNEL || 'WhatsApp').trim() || 'WhatsApp';
  if (String(process.env.SPECIALIST_CHANNEL_FALLBACK || '').toLowerCase() === 'off') return [preferred];
  const rest = ['WhatsApp', 'SMS', 'Email'].filter((c) => c.toLowerCase() !== preferred.toLowerCase());
  return [preferred, ...rest];
}

// THE DETAIL MESSAGE ON TOP OF THE TEMPLATE (2026-09-17).
//
// A template is short by design and every value in it has to survive Meta's
// parameter rules — one line, no empty values, no long runs of spaces. The full
// alert Eglent had before (email, the client's verbatim message, the one-tap
// wa.me link, the CRM link) does not fit that shape.
//
// So after the template is on its way, the agent tries ONE free-form WhatsApp
// message carrying the rest. This is best-effort on purpose: sending a template
// does NOT re-open WhatsApp's 24-hour window — only the recipient replying to it
// does. So this lands when Eglent has written to the agent in the last 24 hours
// (including a one-word reply to a previous alert) and is refused otherwise.
// Either way the template has already reached him, so a refusal costs nothing
// and is logged, not escalated. HANDOFF_DETAIL_FOLLOWUP=off turns it off.
export function detailFollowupEnabled() {
  return String(process.env.HANDOFF_DETAIL_FOLLOWUP || '').toLowerCase() !== 'off';
}

// The order for the FALLBACK send — the one that only runs because the tag
// never landed. WhatsApp goes last here, not first: a free-form message to a
// contact who has not written in 24 hours is the attempt most likely to fail,
// and this path is already the emergency one. SMS first, Email next.
export function fallbackChannels() {
  const preferred = String(process.env.SPECIALIST_FALLBACK_CHANNEL || 'SMS').trim() || 'SMS';
  if (String(process.env.SPECIALIST_CHANNEL_FALLBACK || '').toLowerCase() === 'off') return [preferred];
  const rest = ['SMS', 'Email', 'WhatsApp'].filter((c) => c.toLowerCase() !== preferred.toLowerCase());
  return [preferred, ...rest];
}

// Try each channel until one is accepted. `send(channel, payloadExtras)` does the
// actual API call and returns { ok, data }.
export async function deliverAlert(send, { subject = 'Mei Residence — handoff', body, channels = null }) {
  const attempts = [];
  for (const channel of (channels || alertChannels())) {
    const extras = channel.toLowerCase() === 'email'
      ? { subject, html: `<pre style="font:14px/1.45 -apple-system,Segoe UI,sans-serif">${escapeHtml(body)}</pre>` }
      : {};
    // eslint-disable-next-line no-await-in-loop
    const res = await send(channel, extras);
    attempts.push({ channel, ok: !!res?.ok, error: res?.ok ? null : brief(res?.data) });
    if (res?.ok) return { ok: true, channel, attempts };
  }
  return { ok: false, channel: null, attempts };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function brief(data) {
  try { return JSON.stringify(data).slice(0, 200); } catch { return String(data).slice(0, 200); }
}
