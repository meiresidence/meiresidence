// Express server: verifies the Meta webhook and processes inbound WhatsApp messages.
import express from 'express';
import { config } from './config.js';
import { markRead, sendText } from './whatsapp.js';
import { recordInbound, appendTurns, recordOutbound, getConversation } from './memory.js';
import { generateReply } from './claude.js';
import { startFollowUpScheduler } from './followup.js';

const app = express();
app.use(express.json());

// De-dupe: Meta can redeliver the same message id.
const processed = new Set();

app.get('/', (_req, res) => res.send('Mei Residence WhatsApp agent is running.'));

// 1) Webhook verification (Meta calls this once when you save the webhook URL).
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('[webhook] verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2) Incoming messages.
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // ack immediately; process async
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    if (!message) return; // status callbacks etc.

    if (processed.has(message.id)) return;
    processed.add(message.id);
    if (processed.size > 5000) processed.clear();

    const from = message.from; // E.164 digits, no '+'
    const name = change?.contacts?.[0]?.profile?.name || '';
    markRead(message.id).catch(() => {});

    let userContent;
    if (message.type === 'text') {
      userContent = message.text.body;
    } else {
      // Voice / image / document / location etc. — acknowledge, don't hallucinate.
      const kind = message.type;
      userContent =
        `[The client sent a ${kind} message that I cannot read as text. ` +
        `Politely acknowledge it, ask them to type their question, and escalate ` +
        `if it seems important.]`;
    }

    const conv = recordInbound(from, name, userContent);
    const { text, turns } = await generateReply(conv, from);

    // Persist the assistant/tool turns produced during the tool loop, then the
    // final visible reply, and send it.
    if (turns?.length) appendTurns(from, turns);
    await sendText(from, text);
    recordOutbound(from, text);
    console.log(`[msg] +${from} handled`);
  } catch (e) {
    console.error('[webhook] processing error', e);
  }
});

app.listen(config.port, () => {
  console.log(`Mei Residence WhatsApp agent listening on :${config.port}`);
  console.log(`Model: ${config.anthropic.model}`);
  startFollowUpScheduler();
});
