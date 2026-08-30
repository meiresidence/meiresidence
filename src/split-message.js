// Long-reply splitter (2026-08-30).
//
// A client sent a 14-point due-diligence list (contracts, the exact 6% formula,
// gross vs net, owner use, fees, exit from the programme, delay penalties). The
// right answer is long — and a long answer is exactly what a channel silently
// refuses: WhatsApp caps a text message at 4096 characters, and a body over the
// cap comes back as a provider error, so the client gets NOTHING.
//
// So the agent no longer shortens the answer. It answers in full and we send it
// as consecutive messages, split on paragraph and then sentence boundaries so
// each part reads like a normal chat message and no line is ever cut mid-word.

export const MAX_MESSAGE_CHARS = 3500; // safely under WhatsApp's 4096

// Split `text` into chunks of at most `limit` characters, preferring blank-line
// breaks, then single newlines, then sentence ends, and only then a hard cut.
export function splitMessage(text, limit = MAX_MESSAGE_CHARS) {
  const body = String(text || '').trim();
  if (!body) return [];
  if (body.length <= limit) return [body];

  const out = [];
  let rest = body;

  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    let cut = -1;
    for (const sep of ['\n\n', '\n', '. ', '? ', '! ', ' ']) {
      // only accept a break in the last 40% of the window, otherwise the chunks
      // come out lopsided (a 200-char message followed by a 3300-char one)
      const at = window.lastIndexOf(sep);
      if (at > limit * 0.6) { cut = at + (sep.trim() ? sep.length : 0); break; }
    }
    if (cut <= 0) cut = limit; // no break found: hard cut rather than drop text
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}
