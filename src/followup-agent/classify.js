// Thread classification + rung drafting for the follow-up agent.
//
// One structured call per surviving thread (plan §"the daily loop"). The
// schema is enforced with a forced tool call, so the model cannot ramble —
// it either fills the fields or the run marks the contact fu-error.
//
// THE STATE THAT ISN'T A FOLLOW-UP: 'unanswered' means the client asked
// something and nobody ever answered. That contact is routed to a human
// (needs-human in queue mode, top of the digest always) — never into the
// ladder. Sending cheerful news over an ignored question loses the lead.

export const CLASSIFY_TOOL = {
  name: 'classify_thread',
  description: 'Classify one lead conversation for the follow-up ladder.',
  input_schema: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        enum: ['needs_followup', 'too_soon', 'unanswered', 'not_a_lead', 'dead'],
        description:
          'needs_followup: quiet lead worth re-engaging. too_soon: conversation still live. ' +
          'unanswered: THEY asked something and WE never answered — a bug, not a nurture case. ' +
          'not_a_lead: vendor/job/sponsorship/spam. dead: explicit no, bought elsewhere, or hard stop.',
      },
      sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
      language: { type: 'string', enum: ['sq', 'en', 'de', 'pl', 'cs', 'it', 'other'] },
      typology: { type: 'string', enum: ['1+1', '2+1', '3+1', 'duplex', 'unknown'] },
      units_named: { type: 'array', items: { type: 'string' }, description: 'Unit numbers the client mentioned, e.g. A212.' },
      open_question: {
        type: ['string', 'null'],
        description: 'The thing they asked that we never answered, verbatim-ish, or null.',
      },
      draft: {
        type: ['string', 'null'],
        description:
          'For day 3/7/21 rungs only: the follow-up message, ready to send, in the client language. ' +
          'Null for day 0 (day 0 is always an approved template, never free text).',
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
    },
    required: ['state', 'sentiment', 'language', 'typology', 'confidence'],
  },
};

const RUNG_BRIEF = {
  0: 'Day 0 uses an approved WhatsApp template — do NOT draft; set draft to null.',
  3: `Day 3 — THE CONCRETE ANSWER. Draft a short message offering 2-3 hand-picked units
matching the typology they named: m2, price, video tour link and the 3D plan link
(https://mei-tour.netlify.app). This is the highest-converting pattern on record.`,
  7: `Day 7 — PROOF, ONE IDEA ONLY. Pick the single proof that answers the objection in
their thread: construction progress, Ramada/Wyndham management, the three contracts and
the Property Deed, or the owner-use allowance (10 days summer + 3 weeks off-season).
Never two ideas.`,
  21: `Day 21 — THE GRACEFUL CLOSE. Offer a site visit, then close with (adapted to
their language): "Nese nuk eshte me per ty, s'ka problem fare — thjesht me thuaj dhe
nuk te shkruaj me."`,
};

/**
 * Build the classification prompt for one thread.
 * @param {object} snap - contact snapshot (see ladder.js)
 * @param {0|3|7|21|null} stage - the rung being considered, or null (pure triage)
 * @param {string} knowledge - trimmed knowledge excerpt for drafting
 */
export function buildClassifyPrompt(snap, stage, knowledge = '') {
  const transcript = (snap.transcript || [])
    .map((m) => `${new Date(m.at).toISOString().slice(0, 16)} ${m.direction === 'inbound' ? 'CLIENT' : 'MEI'}: ${m.body}`)
    .join('\n')
    .slice(-8000);

  return `You classify one lead conversation for Mei Residence (Ramada Residences by
Wyndham, Qerret, Durres, Albania) so a human can decide who gets a follow-up.

COPY RULES for any draft (non-negotiable, from the sales team):
- The client's own language. Warm Albanian ti/ty when Albanian.
- Name Qerret, Durres. One idea and ONE question. 2-4 lines, WhatsApp length.
- Never reference their budget. Never invent prices, units, dates or payment plans —
  only facts present in the KNOWLEDGE below. Handover: June 2027.
- Return figures: either 6% guaranteed (default) or the 65% rental-pool option —
  never both, never any other percentage, and only if returns came up in the thread.
- Sign: Eglent Bici, Mei Residence, +355 67 508 8808.
${stage !== null && RUNG_BRIEF[stage] ? `\nRUNG BEING CONSIDERED: ${RUNG_BRIEF[stage]}\n` : ''}
${knowledge ? `KNOWLEDGE (the only source of facts for drafts):\n${knowledge}\n` : ''}
CONTACT: ${snap.name || 'unknown'} · tags: ${(snap.tags || []).join(', ') || 'none'}

TRANSCRIPT (oldest first):
${transcript || '(empty)'}

Call classify_thread exactly once.`;
}

/**
 * Run the classification. Returns the tool input or null on failure.
 * @param {import('@anthropic-ai/sdk').default} anthropic
 */
export async function classifyThread(anthropic, model, snap, stage, knowledge) {
  const res = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: 'tool', name: 'classify_thread' },
    messages: [{ role: 'user', content: buildClassifyPrompt(snap, stage, knowledge) }],
  });
  const block = res.content.find((b) => b.type === 'tool_use' && b.name === 'classify_thread');
  return block ? block.input : null;
}
