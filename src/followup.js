// Cold-lead follow-up scheduler.
// IMPORTANT WhatsApp rule: outside the 24-hour customer-service window you can
// ONLY send pre-approved *template* messages, not free text. So:
//   - If the lead went quiet but we're still inside 24h -> send a free-text nudge.
//   - If we're past 24h -> we log that a template is required (see README to set
//     up a template and switch FOLLOWUP_USE_TEMPLATE on).
import { config } from './config.js';
import { allConversations, recordOutbound, getConversation } from './memory.js';
import { generateFollowUp } from './claude.js';
import { sendText, sendTemplate } from './whatsapp.js';

const HOUR = 60 * 60 * 1000;

export function startFollowUpScheduler() {
  if (!config.followUp.enabled) {
    console.log('[followup] disabled');
    return;
  }
  const everyMs = config.followUp.checkEveryMinutes * 60 * 1000;
  console.log(`[followup] enabled — checking every ${config.followUp.checkEveryMinutes}m`);
  setInterval(runOnce, everyMs);
}

export async function runOnce() {
  const now = Date.now();
  for (const [phone, c] of allConversations()) {
    try {
      if (c.handedOff) continue;                 // human owns it now
      if (!c.lastInbound) continue;              // never engaged
      if (c.followUpCount >= config.followUp.maxAttempts) continue;

      const silentFor = now - c.lastInbound;
      if (silentFor < config.followUp.delayHours * HOUR) continue;

      // Only follow up if the LAST message was from the lead (they left us hanging
      // is fine too, but avoid double-nudging if we already sent the last message
      // very recently).
      const lastWasOutbound = c.lastOutbound > c.lastInbound;
      const sinceLastOut = now - c.lastOutbound;
      if (lastWasOutbound && sinceLastOut < config.followUp.delayHours * HOUR) continue;

      const within24h = now - c.lastInbound < 24 * HOUR;

      if (within24h) {
        const text = await generateFollowUp(c);
        const { ok } = await sendText(phone, text);
        if (ok) {
          recordOutbound(phone, text);
          bumpCount(phone);
          console.log(`[followup] nudged +${phone} (attempt ${c.followUpCount + 1})`);
        }
      } else if (process.env.FOLLOWUP_USE_TEMPLATE === 'true' && process.env.FOLLOWUP_TEMPLATE_NAME) {
        const { ok } = await sendTemplate(
          phone,
          process.env.FOLLOWUP_TEMPLATE_NAME,
          process.env.FOLLOWUP_TEMPLATE_LANG || 'sq'
        );
        if (ok) {
          recordOutbound(phone, '[template follow-up sent]');
          bumpCount(phone);
          console.log(`[followup] template nudged +${phone}`);
        }
      } else {
        console.log(
          `[followup] +${phone} is past the 24h window — needs an approved template ` +
          `(set FOLLOWUP_USE_TEMPLATE=true and FOLLOWUP_TEMPLATE_NAME). Skipping.`
        );
        bumpCount(phone); // avoid re-checking forever
      }
    } catch (e) {
      console.error(`[followup] error for +${phone}:`, e.message);
    }
  }
}

function bumpCount(phone) {
  const c = getConversation(phone);
  c.followUpCount += 1;
}
