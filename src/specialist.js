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

// Eglent Bici, +355 67 204 9400 / bicieglent@gmail.com — the human every
// handoff is meant to reach. Override with SPECIALIST_CONTACT_ID in Render.
export const EGLENT_CONTACT_ID = 'U8zP6NNBfCVVvK6LBWe3';

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

// Try each channel until one is accepted. `send(channel, payloadExtras)` does the
// actual API call and returns { ok, data }.
export async function deliverAlert(send, { subject = 'Mei Residence — handoff', body }) {
  const attempts = [];
  for (const channel of alertChannels()) {
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
