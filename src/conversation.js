// Conversation-history hygiene for the Claude tool-use loop.
//
// WHY THIS FILE EXISTS (2026-08-22, the "concrete questions get a holding line"
// failure): a client asked several concrete contract questions in one message.
// The model started an `escalate_to_agent` tool call, the response hit
// max_tokens mid-tool_use, and the loop broke out WITHOUT ever writing a
// matching tool_result. That half-written tool_use stayed in the contact's
// in-memory history, so EVERY later message from that contact was sent to the
// API with a dangling tool_use and came back
//   400 invalid_request_error: tool_use ids were found without tool_result
//     blocks immediately after
// generateReply threw, handleGenerationFailure fired, and the client got
// "Nje koleg nga Mei Residence do t'ju pergjigjet personalisht shume shpejt."
// forever — for questions the KNOWLEDGE BASE could mostly answer.
//
// Two defences, both pure functions so they can be unit-tested:
//   dropIncompleteToolUse — never PUT a half tool call into history
//   sanitizeHistory       — never SEND one, so a poisoned history self-heals

const isBlockArray = (c) => Array.isArray(c);

/**
 * Strip tool_use blocks out of a response that was cut off at max_tokens.
 * A truncated tool_use has no usable arguments and can never be answered with
 * a tool_result, so it must not enter the history at all. Text blocks survive.
 */
export function dropIncompleteToolUse(content) {
  if (!isBlockArray(content)) return content;
  return content.filter((b) => b?.type !== 'tool_use');
}

/**
 * Return a copy of the conversation that the Messages API will accept:
 *   - every tool_use has a matching tool_result somewhere after it
 *   - every tool_result points at a tool_use that exists
 *   - no empty text blocks, no turns left with nothing in them
 *   - the first turn is a user turn
 *   - consecutive same-role turns are merged
 * The stored history is never mutated — call this on the way OUT.
 */
export function sanitizeHistory(history) {
  const resultIds = new Set();
  const useIds = new Set();
  for (const m of history || []) {
    if (!isBlockArray(m?.content)) continue;
    for (const b of m.content) {
      if (b?.type === 'tool_result' && b.tool_use_id) resultIds.add(b.tool_use_id);
      if (b?.type === 'tool_use' && b.id) useIds.add(b.id);
    }
  }

  const cleaned = [];
  for (const m of history || []) {
    if (!m) continue;
    if (typeof m.content === 'string') {
      if (m.content.trim()) cleaned.push({ role: m.role, content: m.content.trim() });
      continue;
    }
    if (!isBlockArray(m.content)) continue;
    const kept = m.content.filter((b) => {
      if (b?.type === 'tool_use') return b.id && resultIds.has(b.id);
      if (b?.type === 'tool_result') return b.tool_use_id && useIds.has(b.tool_use_id);
      if (b?.type === 'text') return String(b.text || '').trim() !== '';
      return !!b?.type;
    });
    if (kept.length) cleaned.push({ role: m.role, content: kept });
  }

  while (cleaned.length && cleaned[0].role !== 'user') cleaned.shift();

  const toBlocks = (c) => (typeof c === 'string' ? [{ type: 'text', text: c }] : c);
  const out = [];
  for (const m of cleaned) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) {
      prev.content = [...toBlocks(prev.content), ...toBlocks(m.content)];
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}
