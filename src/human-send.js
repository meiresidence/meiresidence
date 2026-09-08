// Human sending rhythm (2026-09-08).
//
// Two things gave the agent away as a bot even when the words were right:
// it answered in ONE long block, and it answered in the same second the client
// pressed send. A person types a couple of short messages, with a pause before
// the first one and a shorter pause between them.
//
// So a reply is now delivered the way a person sends it: split on paragraph
// boundaries into at most a few bubbles, with a reading pause before the first
// and a typing pause between them. Nothing is shortened and nothing is dropped —
// this only changes the packaging, never the content. The hard 4096-char channel
// limit is still enforced first by splitMessage().
//
// Turn it all off with HUMAN_PACING=off (the reply then goes out as one message,
// exactly as before, still safety-split at MAX_MESSAGE_CHARS).

import { splitMessage, MAX_MESSAGE_CHARS } from './split-message.js';

const num = (v, d) => {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export const humanPacingOn = () => String(process.env.HUMAN_PACING || '').toLowerCase() !== 'off';
export const BUBBLE_TARGET_CHARS = num(process.env.HUMAN_BUBBLE_CHARS, 350);
export const MAX_BUBBLES = Math.max(1, num(process.env.HUMAN_MAX_BUBBLES, 3));
export const DELAY_MAX_MS = num(process.env.HUMAN_DELAY_MAX_MS, 5000);
export const TOTAL_DELAY_MAX_MS = num(process.env.HUMAN_TOTAL_DELAY_MAX_MS, 12000);

const MIN_BUBBLE_CHARS = 80;
const isListLine = (l) => /^\s*(?:[-*•–]|\d+[.)]|[a-z][.)])\s+/i.test(l);

// A "block" is a paragraph. A list keeps the line that introduces it, so a
// bubble never starts with a bare "1) ..." orphaned from its lead-in.
function blocksOf(text) {
  const raw = String(text).split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out = [];
  for (const b of raw) {
    const prev = out[out.length - 1];
    const listy = b.split('\n').some(isListLine);
    if (listy && prev && prev.length < 200 && !prev.split('\n').some(isListLine)) {
      out[out.length - 1] = `${prev}\n\n${b}`;
    } else {
      out.push(b);
    }
  }
  return out;
}

/**
 * Split a reply into WhatsApp-sized bubbles that read like consecutive messages.
 * Never splits inside a list, never leaves a stub bubble, never exceeds the
 * channel limit, and never loses a character.
 */
export function splitIntoBubbles(text, { target = BUBBLE_TARGET_CHARS, maxBubbles = MAX_BUBBLES } = {}) {
  const safe = splitMessage(text, MAX_MESSAGE_CHARS);
  if (!safe.length) return [];
  if (!humanPacingOn()) return safe;

  const bubbles = [];
  for (const part of safe) {
    for (const block of blocksOf(part)) {
      const last = bubbles[bubbles.length - 1];
      const fits = last && last.length + block.length + 2 <= target;
      const atCap = bubbles.length >= maxBubbles * safe.length;
      if (last && (fits || atCap)) bubbles[bubbles.length - 1] = `${last}\n\n${block}`;
      else bubbles.push(block);
    }
  }

  // Merge stubs into their neighbour so nobody gets a two-word bubble.
  const merged = [];
  for (const b of bubbles) {
    if (merged.length && b.length < MIN_BUBBLE_CHARS) merged[merged.length - 1] += `\n\n${b}`;
    else merged.push(b);
  }
  if (merged.length > 1 && merged[0].length < MIN_BUBBLE_CHARS) {
    merged[1] = `${merged[0]}\n\n${merged[1]}`;
    merged.shift();
  }

  // Re-check the channel limit after merging.
  const final = [];
  for (const b of merged) final.push(...(b.length > MAX_MESSAGE_CHARS ? splitMessage(b, MAX_MESSAGE_CHARS) : [b]));
  return final;
}

/** How long a person would take before sending this bubble. */
export function typingDelayMs(text, index = 0, rand = Math.random) {
  if (!humanPacingOn()) return 0;
  const len = String(text || '').length;
  const base = index === 0 ? 900 : 450; // reading the message, then typing
  const jitter = 0.85 + rand() * 0.3;
  const raw = (base + len * 16) * jitter;
  return Math.max(400, Math.min(Math.round(raw), DELAY_MAX_MS));
}

/** Delays for a whole reply, kept inside the total budget. */
export function pacingPlan(bubbles, rand = Math.random) {
  let left = TOTAL_DELAY_MAX_MS;
  return bubbles.map((b, i) => {
    const want = typingDelayMs(b, i, rand);
    const use = Math.max(0, Math.min(want, left));
    left -= use;
    return use;
  });
}
