// Instagram DMs and links (2026-10-10, Eglent).
//
// WHY THIS FILE EXISTS. Instagram does not deliver a DM from the business account
// when it contains a link. The agent's normal answer to "më dërgo planimetrinë"
// is the floor-plan link (app.screencast.com) plus the 3D link
// (mei-tour.netlify.app) — so on Instagram the client's most important answer was
// the one that never arrived. GHL still shows it as sent, which is why it looked
// like the agent had answered.
//
// THE RULE ON INSTAGRAM:
//   - No link, no web address, of any kind, in any reply.
//   - Units are still described in words (type, m2, price, view, status).
//   - When the client wants a floor plan, the 3D tour, photos or a video — the
//     things that only travel as links — the agent moves them to WhatsApp: it
//     gives the agent's WhatsApp number (AGENT_WHATSAPP, below) and asks them to
//     write there, or asks for THEIR number so Mei writes to them.
//   - If they leave a number, it is saved on the contact and a handoff fires, so
//     a person sends them the plan on WhatsApp (index.js).
//
// Two layers: the instruction in the per-contact context note (instagramNote),
// and a backstop after the reply is written — if a link still slipped in, the
// model rewrites it once (index.js), and anything left after that is stripped
// here (stripLinks). A message with its link cut out arrives; one with the link
// in it does not.

/** The agent's own WhatsApp number — the one Mei Residence clients write to. */
export const AGENT_WHATSAPP = process.env.AGENT_WHATSAPP_DISPLAY || '+355 67 508 8808';

// The agent's WhatsApp and Eglent's direct number, last nine digits.
const OUR_NUMBERS = [AGENT_WHATSAPP.replace(/\D/g, '').slice(-9), '672049400'];

/** GHL's outbound type for Instagram DMs (see CHANNEL_TYPE_MAP). */
export const isInstagram = (channel) => String(channel || '').toUpperCase() === 'IG';

const TLD = '(?:com|al|app|net|org|io|eu|de|it|ch|co|me|info|link|ly|gl|page|site)';
// http(s)://…, www.…, or a bare domain such as mei-tour.netlify.app/a212/.
// An e-mail address (info@meiresidence.com) is not a link and is left alone.
const URL_SOURCE = `(?:https?:\\/\\/|www\\.)[^\\s<>"]+|(?<![@\\w.-])[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.${TLD}\\b(?:\\/[^\\s<>"]*)?`;
const urlRe = () => new RegExp(URL_SOURCE, 'gi');

/** Does this text contain anything Instagram would treat as a link? */
export function hasLink(text) {
  return urlRe().test(String(text || ''));
}

/**
 * Remove every link, together with the short label that introduced it
 * ("plan:", "— plani:", "3D:", "Here's the floor plan:"), and tidy what is left.
 * Last resort only — the rewrite in index.js is what keeps the message natural.
 */
export function stripLinks(text) {
  const label = '(?:[\\s]*[—–-]\\s*)?(?:[\\p{L}\\p{N}\'’]+[ \\t]+){0,4}[\\p{L}\\p{N}\'’]+:[ \\t]*';
  const withLabel = new RegExp(`${label}(?:<)?(?:${URL_SOURCE})(?:>)?`, 'giu');
  // Only the lines that carried a link are touched; every other line stays
  // exactly as the model wrote it.
  const lines = String(text || '').split('\n').map((l) => {
    if (!hasLink(l)) return l;
    const cut = l
      .replace(withLabel, '')
      .replace(urlRe(), '')
      .replace(/\(\s*\)|\[\s*\]|<\s*>/g, '')
      .replace(/[ \t]+([,.;!?])/g, '$1')
      .replace(/(?:\s*[—–-]\s*){2,}/g, ' — ')
      .replace(/[ \t]*[—–:,-]+[ \t]*$/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trimEnd();
    // A line (or bullet) whose only content was the link disappears.
    return /^\s*(?:[-•*·]|\d+[.)])?\s*$/.test(cut) ? null : cut;
  }).filter((l) => l !== null);
  return lines
    .filter((l, i, all) => !(l.trim() === '' && (i === 0 || all[i - 1].trim() === '')))
    .join('\n')
    .trim();
}

/**
 * The backstop the webhook uses: strip the links and, if the WhatsApp number is
 * not in the message yet, add it on its own line (language-neutral), so a client
 * who asked for a plan still learns where it can be sent.
 */
export function instagramSafe(text) {
  if (!hasLink(text)) return String(text || '');
  const stripped = stripLinks(text);
  const has = String(stripped).replace(/\D/g, '').includes(AGENT_WHATSAPP.replace(/\D/g, '').replace(/^355/, ''));
  const tail = `WhatsApp: ${AGENT_WHATSAPP}`;
  if (!stripped) return tail;
  return has ? stripped : `${stripped}\n\n${tail}`;
}

/** Lines for the per-contact CONVERSATION CONTEXT when the client is on Instagram. */
export function instagramNote() {
  return [
    '- CHANNEL: this client is writing to us on INSTAGRAM DM, not WhatsApp.',
    '  Instagram does NOT deliver a message that contains a link — the whole message is lost and the client sees nothing.',
    '  So on this channel, NEVER put a link or web address in your reply: no http, no www, no app.screencast.com, no mei-tour.netlify.app, nothing that looks like a domain.',
    '  This OVERRIDES the "VIDEO / PLAN / TOUR REQUESTS — SEND BOTH LINKS" and UNIT LOOKUP link instructions. Describe units in words as usual — type, m2, price, sea view or not, status.',
    `  When they ask for a floor plan / planimetri, the 3D tour, photos, a video or a document: say you will send it on WhatsApp. Give our WhatsApp number ${AGENT_WHATSAPP} and invite them to write to us there (e.g. the unit code they want), OR ask them to leave their phone number here so we send it to them on WhatsApp. One short message, in their language.`,
    '  Do not offer links "later" or "in the next message" on Instagram — they will not arrive there either.',
  ].join('\n');
}

/** Line for the context note when an Instagram client has just left their number. */
export function phoneLeftNote(phone) {
  return `- On Instagram they have just left their phone number (${phone}). It is saved on their contact and a Mei colleague has been told to write to them on WhatsApp with the floor plan / details. Thank them briefly and confirm it — no links.`;
}

/**
 * A phone number the client typed, or ''. Albanian mobiles typed locally
 * (06x xxx xxxx) come back as +355…; anything with a + or 00 keeps its country
 * code; other bare digit runs of 9+ digits are returned as digits.
 */
export function extractPhone(text) {
  const t = String(text || '');
  const re = /(?:\+|\b00)?\d[\d \t().\/-]{6,18}\d/g;
  for (const m of t.match(re) || []) {
    const raw = m.trim();
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) continue;
    // Our own numbers typed back to us are not the client's number.
    if (OUR_NUMBERS.some((n) => digits.endsWith(n))) continue;
    // Prices and areas are not phone numbers: "103,500", "1.250.000".
    if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) continue;
    if (raw.startsWith('+')) return `+${digits}`;
    if (raw.startsWith('00')) return `+${digits.slice(2)}`;
    if (/^06\d{8}$/.test(digits)) return `+355${digits.slice(1)}`;
    if (/^3556\d{8}$/.test(digits)) return `+${digits}`;
    if (digits.length >= 9) return digits;
  }
  return '';
}

/** The note that asks the model to rewrite a reply that still carried a link. */
export function rewriteNote() {
  return [
    '[Internal note from the Mei system — not from the client. Never mention it.]',
    'This conversation is on Instagram, and Instagram does not deliver a message that contains a link: the reply you just wrote would never reach the client.',
    'Rewrite it, in the same language and the same voice, with NO link and no web address of any kind. Keep every fact you gave (types, m2, prices, sea view, status).',
    `Where you were sending a floor plan, 3D tour, video or photos, say you will send them on WhatsApp instead: give our WhatsApp number ${AGENT_WHATSAPP} and invite them to write to us there, or to leave their phone number here.`,
    'Reply with the rewritten message only.',
  ].join('\n');
}
