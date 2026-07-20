// Thin wrapper over the Meta WhatsApp Cloud API.
import { config } from './config.js';

const base = () =>
  `https://graph.facebook.com/${config.whatsapp.graphVersion}/${config.whatsapp.phoneNumberId}`;

async function callGraph(payload) {
  const res = await fetch(`${base()}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[whatsapp] send error', res.status, JSON.stringify(data));
  }
  return { ok: res.ok, data };
}

// Send a plain text message to a WhatsApp user (E.164 digits, no '+').
export function sendText(to, body) {
  return callGraph({ to, type: 'text', text: { preview_url: false, body } });
}

// Send an approved template message (needed to re-open a chat after the 24h window).
export function sendTemplate(to, templateName, languageCode = 'sq', components = []) {
  return callGraph({
    to,
    type: 'template',
    template: { name: templateName, language: { code: languageCode }, components },
  });
}

// Mark an inbound message as read (blue ticks).
export async function markRead(messageId) {
  const res = await fetch(`${base()}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId }),
  });
  return res.ok;
}
