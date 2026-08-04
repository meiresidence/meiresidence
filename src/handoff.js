// Forwards hot leads to a human agent's WhatsApp and flags the conversation.
import { config } from './config.js';
import { sendText } from './whatsapp.js';
import { markHandedOff, updateMeta, getLastClientMessage } from './memory.js';

function truncate(str, max) {
  const s = String(str).replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
}

export async function escalateToAgent(phone, name, args) {
  const { reason, lead_summary, interested_in, buyer_type, language, budget } = args || {};

  // Capture the client's own last words BEFORE anything else mutates state.
  const lastMessage = getLastClientMessage(phone);

  updateMeta(phone, { interested_in, buyer_type, language, budget });
  markHandedOff(phone);

  if (!config.agentWhatsappNumber) {
    console.warn('[handoff] AGENT_WHATSAPP_NUMBER not set — cannot forward lead');
    return { forwarded: false };
  }

  const lines = [
    'New Mei Residence lead (from WhatsApp bot)',
    `Name: ${name || 'Unknown'}`,
    `Phone: +${phone}`,
    buyer_type ? `Type: ${buyer_type}` : null,
    interested_in ? `Interested in: ${interested_in}` : null,
    budget ? `Budget: ${budget}` : null,
    language ? `Language: ${language}` : null,
    reason ? `Why now: ${reason}` : null,
    lead_summary ? `Summary: ${lead_summary}` : null,
    lastMessage ? `\nLast message from client:\n"${truncate(lastMessage, 400)}"` : null,
    '',
    `Open chat: https://wa.me/${phone}`,
  ].filter(Boolean);

  const { ok } = await sendText(config.agentWhatsappNumber, lines.join('\n'));
  console.log(`[handoff] forwarded lead +${phone} to agent (${ok ? 'ok' : 'failed'})`);
  return { forwarded: ok };
}
