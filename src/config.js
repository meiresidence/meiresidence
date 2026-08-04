// Central configuration, loaded from environment variables.
import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.warn(`[config] Missing env var: ${name} (the app may not work correctly)`);
  }
  return v;
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),

  // --- WhatsApp (Meta Cloud API) ---
  whatsapp: {
    token: required('WHATSAPP_TOKEN'),                     // permanent access token
    phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),   // the sending number's ID
    verifyToken: required('WHATSAPP_VERIFY_TOKEN'),        // you invent this; used in webhook setup
    graphVersion: process.env.GRAPH_API_VERSION || 'v21.0',
  },

  // --- Claude (Anthropic API) ---
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '600', 10),
  },

  // --- Human handoff ---
  // Where hot leads are forwarded. E.164 without '+', e.g. 355672049400
  agentWhatsappNumber: (process.env.AGENT_WHATSAPP_NUMBER || '').replace(/[^0-9]/g, ''),

  // --- Cold-lead follow-up ---
  followUp: {
    enabled: (process.env.FOLLOWUP_ENABLED || 'true') === 'true',
    // Hours of silence from the lead before we send a follow-up.
    delayHours: parseFloat(process.env.FOLLOWUP_DELAY_HOURS || '6'),
    // Max number of follow-ups per lead.
    maxAttempts: parseInt(process.env.FOLLOWUP_MAX_ATTEMPTS || '2'),
    // How often the scheduler checks (minutes).
    checkEveryMinutes: parseInt(process.env.FOLLOWUP_CHECK_MINUTES || '30', 10),
  },

  // Max messages of history kept per contact when calling Claude.
  historyWindow: parseInt(process.env.HISTORY_WINDOW || '20', 10),
};
