// The "brain": builds the system prompt from the knowledge base and runs the
// Claude tool-use loop (auto-reply + escalate_to_agent).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { escalateToAgent } from './handoff.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

// Build the system prompt once at startup (edit the .md files and redeploy to update).
function buildSystemPrompt() {
  const promptTpl = fs.readFileSync(path.join(KNOWLEDGE_DIR, 'system-prompt.md'), 'utf8');
  const kb = fs.readFileSync(path.join(__dirname, '..', 'knowledge.md'), 'utf8');
  return promptTpl.replace('{{KNOWLEDGE_BASE}}', kb);
}
const SYSTEM_PROMPT = buildSystemPrompt();

const TOOLS = [
  {
    name: 'escalate_to_agent',
    description:
      'Forward this lead to a human Mei Residence sales agent. Call this when the ' +
      'client asks for a person, wants a personalized price/viewing/reservation, ' +
      'needs exact payment-plan or guarantee terms, is a hot/ready lead, is a ' +
      'real-estate agency partner, or when you cannot answer from the knowledge base. ' +
      'After calling this, ALSO reply to the client with Eglent Bici\'s direct number ' +
'+355 67 204 9400 and a reason to contact him.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Short reason this needs a human now.' },
        lead_summary: { type: 'string', description: 'One-line summary of what the lead wants.' },
        interested_in: { type: 'string', description: 'e.g. 1+1, 2+1, studio, duplex, general invest.' },
        buyer_type: { type: 'string', description: 'Investor, personal buyer, or real-estate agency.' },
        budget: { type: 'string', description: 'Budget range if known, else empty.' },
        language: { type: 'string', description: 'Language the client is writing in.' },
      },
      required: ['reason', 'lead_summary'],
    },
  },
];

/**
 * Generate the assistant's reply for a conversation.
 * @param {{name:string, history:Array}} conversation
 * @param {string} phone
 * @returns {Promise<{text:string, escalated:boolean, turns:Array}>}
 */
export async function generateReply(conversation, phone) {
  const messages = conversation.history.map((m) => ({ role: m.role, content: m.content }));
  const newTurns = []; // assistant/tool turns to persist after this call
  let escalated = false;
  let finalText = '';

  for (let hop = 0; hop < 4; hop++) {
    const resp = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: config.anthropic.maxTokens,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    // Persist the assistant turn (may contain text and/or tool_use blocks).
    messages.push({ role: 'assistant', content: resp.content });
    newTurns.push({ role: 'assistant', content: resp.content });

    // Collect any text the model produced.
    const textParts = resp.content.filter((b) => b.type === 'text').map((b) => b.text);
    if (textParts.length) finalText = textParts.join('\n').trim();

    if (resp.stop_reason !== 'tool_use') break;

    // Execute tool calls and feed results back.
    const toolResults = [];
    for (const block of resp.content) {
      if (block.type !== 'tool_use') continue;
      if (block.name === 'escalate_to_agent') {
        const result = await escalateToAgent(phone, conversation.name, block.input);
        escalated = true;
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.forwarded
            ? 'Lead forwarded to a human agent. Now reply to the client confirming a specialist will contact them shortly.'
            : 'Handoff logged (agent number not configured). Reply to the client confirming a specialist will contact them shortly.',
        });
      } else {
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Unknown tool.' });
      }
    }
    messages.push({ role: 'user', content: toolResults });
    newTurns.push({ role: 'user', content: toolResults });
  }

  if (!finalText) {
    finalText = escalated
      ? 'Faleminderit! Nje specialist i Mei Residence do t’ju kontaktoje shume shpejt.'
      : 'Faleminderit per mesazhin! Si mund t’ju ndihmoj per Mei Residence?';
  }

  return { text: finalText, escalated, turns: newTurns };
}

/** Generate a short follow-up nudge for a cold lead, in their language. */
export async function generateFollowUp(conversation) {
  const resp = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [
      ...conversation.history.map((m) => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content:
  '[SYSTEM: The lead went quiet. Write ONE short, warm follow-up WhatsApp ' +
  'message in the language they were using. Reference something specific from ' +
  'the conversation, offer one concrete next step (floor plan, virtual tour, ' +
  'or availability check), and include Eglent Bici\'s direct number ' +
  '+355 67 204 9400 so they can write to him directly. Plain text only, ' +
  '2-3 sentences, no emoji.]',
      },
    ],
  });
  const text = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
  return text || 'Pershendetje! A mund t’ju ndihmoj me ndonje informacion per Mei Residence?';
}
