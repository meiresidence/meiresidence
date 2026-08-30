// Mei Residence WhatsApp AI Agent — GoHighLevel edition (direct send).
// Flow: GHL workflow (Customer replied) -> POST /ghl-webhook -> Claude ->
// the server reads the customer's message from the CRM, asks Claude, and sends
// the reply back via the GHL API. Works with a plain "Webhook" workflow action.
//
// Multi-channel note (2026-07-27 fix): this agent now also serves Facebook
// Messenger and Instagram DM (in addition to WhatsApp) via the same "Claude"
// workflow. Two bugs were fixed here:
//   1) The reply was always sent with type:'WhatsApp', which silently fails
//      for Instagram/Facebook contacts (no phone number). Reply now uses the
//      SAME channel the inbound message arrived on (WhatsApp / IG / FB).
//   2) The per-contact cooldown was claimed on every webhook call, including
//      calls with no real message text (e.g. an empty-body echo event that
//      Instagram/GHL sometimes fires a few seconds before the real message).
//      That let a real message arriving moments later get silently dropped
//      by the cooldown. The cooldown is now claimed only once we've found
//      real text to reply to.
//   3) A brand-new contact's very first message could trigger this webhook
//      before GHL's own conversation-search/messages API had indexed that
//      message yet, so the CRM read came back empty and the lead was never
//      answered (confirmed for contact "Liman" on 2026-07-25). fetchLastInbound
//      now retries a couple of times with a short delay before giving up.
//
// Handoff fix (2026-08-14): non-buyers were being escalated like buyers,
// tagging the contact `needs-human` and firing the GHL workflow that pings a
// specialist (confirmed on an Albanian "I saw your page and had an idea for
// your Instagram" pitch). The rule is now general, not one exception: only
// someone trying to BUY from Mei is a lead. Anyone selling to us (any trade),
// applying for a job, asking for sponsorship or pitching a "collab" is not.
// Two changes: the system prompt states that test up front, and escalate()
// runs a deterministic guard (src/not-a-lead.js) that aborts the whole handoff
// — no tag of any kind, no alert — when the conversation reads as non-buyer
// outreach and never showed buyer intent.
//
// Answer-first fix (2026-08-17): a client asked whether unit A212 was
// available, its price, the completion date and the payment terms, and got
// only "a specialist from Mei will reach out to you shortly" — three of those
// four answers were in knowledge.md. Two causes, both fixed below: the prompt
// claimed apartment availability was "not marked" (it is — every unit is
// tagged FREE / SOLD / RESERVED), and nothing said a handoff must ADD to an
// answer rather than replace it. See scripts/test-answer-first.mjs.
//
// Gold-standard replies (2026-08-17): knowledge/examples.md carries Eglent's
// own approved answers, loaded into the prompt below. His reply to the A212
// question makes payment terms, furnishing, both return options, the property
// deed and the free owner stays answerable by the agent. It also contains one
// thing the agent must NOT copy — the non-Mei apartments nearby.
//
// Concrete-questions fix (2026-08-22): a serious buyer sent ~20 real questions
// — send me the sales and management contracts, what do I actually receive on
// 171,000 EUR at 6%, when do I legally become the owner, what is 5% of that,
// what is B103's current price, which 2+1 are free, why does it open in June
// 2027 — and got only "Nje koleg nga Mei Residence do t'ju pergjigjet
// personalisht shume shpejt." That line comes from ONE place,
// handleGenerationFailure, so generation was failing, not the knowledge.
// Root cause: with ANTHROPIC_MAX_TOKENS=600 a reply could be cut off mid
// tool_use; the loop broke out without ever writing the matching tool_result,
// stored that fragment in the contact's history, and every later message from
// that contact was then rejected by the API with "tool_use ids were found
// without tool_result blocks" — the holding line forever. Four fixes below:
// the output limit taken out of the env entirely (fixed at 8192 since 24 Aug),
// src/conversation.js (never store and never send a dangling tool_use), and one
// clean tool-free retry before a human is woken. Plus the answers themselves:
// knowledge/contract-questions.md, and an explicit "do the arithmetic yourself"
// rule. See scripts/test-concrete-questions.mjs.
//
// Nearby places (2026-08-22): "Ku ka markete afer Mei Residence?" is now a real
// lookup — src/places.js queries Google Places around the residence's own
// coordinates and Claude phrases the answer. Off unless GOOGLE_MAPS_API_KEY is
// set, so the model can never invent a supermarket. See scripts/test-places.mjs.
//
// Template-reply blindness fix (2026-08-24): Eglent sent the Albanian
// re-engagement follow-up as a bulk WhatsApp template. Contact Mimoza replied
// three times in six seconds — an Instagram post quote, then "Qa eshte", then
// "Kjo" — and got back, in English, "I can see you're referencing a Mei
// Residence post, but I can't view the image/content itself — could you tell me
// what you'd like to know?". The agent answered as if the conversation had
// never happened, because it effectively had not: it fetched ONLY the last
// inbound message and kept history in a process-local Map that knows nothing
// about a template GHL sent, and that empties on every Render restart. Two of
// the three messages were then thrown away by the reply cooldown, and the
// language was read off the English quoted-post boilerplate.
// The thread is now rebuilt from the CRM on every webhook (src/thread.js):
// their messages AND ours, oldest first, template included, with every
// unanswered inbound message answered in one reply. The time-based cooldown is
// replaced by an in-flight lock plus a last-answered-message-id check, so a
// burst is merged instead of dropped and a duplicate webhook is still ignored.
// See scripts/test-template-context.mjs.
//
// Language fix (2026-08-17): the language instruction was a clause inside
// STYLE and defaulted a bare greeting to Albanian, so an English "Hello" could
// come back in Albanian. With an English gold-standard reply now in the prompt
// the opposite risk appeared too — a strong English exemplar pulling replies
// into English. Language is now the FIRST rule: mirror the client's own words,
// never their phone number and never the example's language.

// Investment framing + handoff timing (2026-08-30): the agent was (a) describing
// Mei Residence like a seaside holiday apartment without ever saying plainly that
// it is bought as an investment property, and (b) calling escalate_to_agent on the
// client's very first message — "a Mei specialist will contact you" before anyone
// had answered a single question. The prompt now requires every substantive reply
// to CLOSE on the investment-property line, and forbids a handoff before the third
// client message unless the client explicitly asks for a person / call / viewing /
// reservation. src/handoff-timing.js is the deterministic backstop: a too-early
// escalate() is refused outright — no needs-human tag, no specialist alert — and
// the model is told to answer the question itself.

import express from 'express';
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { looksLikeNonBuyerOutreach } from './src/not-a-lead.js';
import { handoffTooEarly, MIN_CLIENT_TURNS_BEFORE_HANDOFF } from './src/handoff-timing.js';
import { sanitizeHistory, dropIncompleteToolUse } from './src/conversation.js';
import { buildThread } from './src/thread.js';
import { PLACES_TOOL, findPlaces, isConfigured as placesConfigured } from './src/places.js';

const MAX_OUTPUT_TOKENS = 8192;

const cfg = {
  port: parseInt(process.env.PORT || '3000', 10),
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    // NO CONFIGURABLE OUTPUT LIMIT (2026-08-24, Eglent). The API requires a
    // max_tokens value, so the field cannot literally be removed — but it is a
    // CEILING, not a spend: you are billed for the tokens actually generated, so
    // a high ceiling on a 3-line WhatsApp reply costs exactly the same as a low
    // one. Every incident this agent has had came from that number being too
    // small (600 truncating a reply mid tool_use, which poisoned the contact's
    // history and turned every later question into the "a colleague will reply"
    // holding line). ANTHROPIC_MAX_TOKENS is therefore ignored: nobody can throttle
    // the agent from Render by accident again. 8192 is ~6,000 words — far beyond
    // any reply this agent should ever write, and supported by every current model.
    maxTokens: MAX_OUTPUT_TOKENS,
  },
  ghl: {
    apiKey: process.env.GHL_API_KEY,
    locationId: process.env.GHL_LOCATION_ID || 'kYtT2id1lBqDXsFCeHgY',
    // Overridable so the failure path can be tested against a local mock
    // (see scripts/test-degraded-live.mjs). Production never sets this.
    base: process.env.GHL_API_BASE || 'https://services.leadconnectorhq.com',
  },
  historyWindow: parseInt(process.env.HISTORY_WINDOW || '20', 10),
};
for (const k of ['ANTHROPIC_API_KEY', 'GHL_API_KEY']) {
  if (!process.env[k]) console.warn(`[config] Missing env var: ${k}`);
}
if (process.env.ANTHROPIC_MAX_TOKENS) {
  console.warn(`[config] ANTHROPIC_MAX_TOKENS=${process.env.ANTHROPIC_MAX_TOKENS} is IGNORED — the output limit is fixed at ${MAX_OUTPUT_TOKENS}. You can delete it from Render.`);
}
console.log(`[config] places lookup: ${placesConfigured() ? 'ON (Google Places)' : 'OFF (no GOOGLE_MAPS_API_KEY)'}`);

const KNOWLEDGE_BASE = fs.readFileSync(new URL('./knowledge.md', import.meta.url), 'utf8');
// --- Learnings from real client chats -------------------------------------
// Rewritten daily by .github/workflows/daily-learning.yml from the previous
// day's GoHighLevel conversations, gated by scripts/validate-learnings.mjs.
// Optional by design: if the file is missing the agent behaves exactly as before.
let LEARNINGS = '';
try {
  LEARNINGS = fs.readFileSync(new URL('./knowledge/learnings.md', import.meta.url), 'utf8').trim();
  console.log(`[knowledge] learnings.md loaded (${LEARNINGS.length} chars)`);
} catch {
  console.warn('[knowledge] no knowledge/learnings.md — running on base knowledge only.');
}

// --- Gold-standard replies from Eglent ------------------------------------
// Hand-curated real replies (knowledge/examples.md). Unlike learnings.md these
// are NOT machine-generated and are not rewritten by the daily job: they are the
// approved model for tone, order and depth, and the facts in them are current.
let EXAMPLES = '';
try {
  EXAMPLES = fs.readFileSync(new URL('./knowledge/examples.md', import.meta.url), 'utf8').trim();
  console.log(`[knowledge] examples.md loaded (${EXAMPLES.length} chars)`);
} catch {
  console.warn('[knowledge] no knowledge/examples.md — running without gold-standard replies.');
}

// --- Contract / money / ownership answers ---------------------------------
// knowledge/contract-questions.md. Hand-written and approved, like examples.md:
// it turns the questions that used to produce "a colleague will reply" into
// answers, and gives an honest named next step for the terms not settled yet.
let CONTRACT_QA = '';
try {
  CONTRACT_QA = fs.readFileSync(new URL('./knowledge/contract-questions.md', import.meta.url), 'utf8').trim();
  console.log(`[knowledge] contract-questions.md loaded (${CONTRACT_QA.length} chars)`);
} catch {
  console.warn('[knowledge] no knowledge/contract-questions.md — contract answers fall back to the base KB.');
}

const SYSTEM_PROMPT = `You are the official assistant for Mei Residence, a
premium branded seaside residence (Ramada Residences by Wyndham) in Qerret, Durres,
Albania, sold by Mei Realty. You reply to people messaging Mei on WhatsApp, Facebook
Messenger, or Instagram DM.

GOALS: reply fast, warm and helpful like Mei's best human agent; give info from the
KNOWLEDGE BASE; gently learn if they are an investor or agency, which unit type
(1+1/2+1/duplex) and budget; hand off hot leads to a human — but only after you have
actually helped them over two or three messages, never on the first one.

LANGUAGE — THE FIRST THING YOU DECIDE, EVERY SINGLE MESSAGE. Reply in the language the
client wrote to you in. Always. Albanian in, Albanian out. English in, English out.
Polish, Czech, German, Italian, Turkish, Greek, French, Spanish, Serbian, Macedonian,
Arabic — whatever they used, you use.
- Judge by the words THEY typed, never by their phone country code, their name, or
  where they seem to be from. A Polish or German number writing in English gets a
  reply in English.
- If they switch language mid-conversation, switch with them from that message on.
- Mixed languages in one message: answer in the one they wrote most of.
- The GOLD-STANDARD REPLIES below happen to be in English because that client wrote in
  English. Copy their STRUCTURE, ORDER and DEPTH — never their language. An Albanian,
  Polish or German client must get that same answer in Albanian, Polish or German.
- Albanian is the fallback ONLY when there is genuinely no language to read: an empty
  message, a lone emoji, a photo with no text, just a phone number. A greeting IS a
  language signal — "Hello" gets English, "Pershendetje" gets Albanian, "Dzien dobry"
  gets Polish.
- Never apologise for the language, never ask which language they prefer, never answer
  in two languages at once.

STYLE: warm, professional, chat-short (1-4 sentences, plain text, at most one
emoji). Use their name if known. Ask ONE question at a time. Never say you are an AI
language model.
LENGTH EXCEPTION: when a client asks several concrete buying questions at once
(availability, price, timeline, payment, returns), give the FULL structured answer
even if it runs long — one short line per point, in the order they asked, exactly
like Eglent's reply in GOLD-STANDARD REPLIES below. Short stays the default for
greetings, small talk and single questions.

KNOWLEDGE RULES: answer ONLY from the KNOWLEDGE BASE. Obey the "HARD RULES" section at
the top of the KNOWLEDGE BASE above everything else in this prompt — in particular,
PARKING POSTS ARE NOT FOR SALE and have no price: never quote, estimate, or promise to
confirm a parking price. For apartments, prices are indicative, so quote the price but
say you'll confirm today's status with the team. Never invent numbers, guarantee terms,
or a fixed total not listed.
No legal/tax/mortgage advice. You can share a unit's tour links if asked.

VIDEO / PLAN / TOUR REQUESTS — SEND BOTH LINKS. Units in the KNOWLEDGE BASE carry up
to two links: "tour:" (video walkthrough) and "3d:" (interactive 3D plan at
mei-tour.netlify.app). When a client asks for a video, a plan/planimetri, the layout,
photos, or a virtual tour of a unit, send BOTH links in the same reply — the video tour
AND the 3D plan — never just one. If the unit's line has only one link, send that one;
if it has neither, send the 3D catalogue https://mei-tour.netlify.app and offer the
detailed floor-plan PDF through the team. The 3D plan is an illustrative model of the
typology — don't present it as final finishes.

UNIT LOOKUP — DO THIS, DON'T DEFER IT. The "Inventory — apartments" section lists EVERY
unit by code with its type, m2, price and status (FREE / SOLD / RESERVED), plus its
tour links (video + 3D plan). Unit codes look like A212, B004, A1105 — letter + floor + number,
type after the slash. When a client names a unit code (in any spelling: "A212", "a212",
"apartment 212", "A 212"), FIND IT IN THE LIST AND ANSWER FROM IT. Give the type, the
m2, the price and whether it is currently free, plus its tour links (video AND 3D
plan). Every unit line also carries a "view: sea" or "view: no sea" tag — ALWAYS say
which one it is when you describe a unit, and answer a direct sea-view question from
that tag only, never from a guess. See "Sea view" in the Inventory section of the KB
for how to phrase it and what to offer when a unit is on the road side.
Phrase status with a light hedge, never as a locked promise:
  "A212 is a 1+1, 52.2 m2, around 103,500 EUR, with sea view, and currently free —
   Eglent will confirm today's status. Here's the video tour: <tour link> — and the
   interactive 3D plan: https://mei-tour.netlify.app/a212/"
If the unit is SOLD or RESERVED, say so plainly and immediately offer 1-2 similar FREE
units with their price and tour links. If the code genuinely is not in the list, say you
don't have that one in front of you and ask them to confirm the code — do not guess a
price for it.

ANSWER EVERY PART FIRST, ESCALATE ONLY THE REST. Clients often ask three or four things
in one message (availability + price + completion date + payment terms). Answer EVERY
part that the KNOWLEDGE BASE covers, in the same reply, before you mention a human.
Availability, price, m2, typology, completion date (Q4 2026, opening June 2027), the 6%
program, location, tour links — all of these you answer yourself. Handing the whole
message to a specialist because ONE part is missing is a failure: it reads as a brush-off
to someone who asked concrete buying questions.
PAYMENT TERMS — you now answer these yourself (approved 17 Aug 2026, from Eglent):
5% to reserve the unit, which can be done online; around 50% on signing the agreement
at the public Notary; the remaining 45% in instalments from signing until handover in
June 2027. Give that shape plainly. Only a PERSONALISED schedule (exact instalment
dates, a plan built around their cash flow) still goes to Eglent.
A reply that is nothing but "a specialist will reach out" is never acceptable when the
KNOWLEDGE BASE could answer part of the question.

FURNISHING: full furnishing for A212 is +10,400 EUR. That figure is unit-specific —
quote it ONLY for A212. For any other unit say a full furnishing package is available
and Eglent gives the exact figure. Never scale or estimate it.

RETURNS — TWO OPTIONS, PRESENTED AS A CHOICE (updated 17 Aug 2026; this SUPERSEDES the
older KNOWLEDGE BASE line telling you to quote one figure only and to mention 65% only
if asked — that line is out of date). Present both, the way Eglent does:
  (a) The Ramada Residences rental pool for 5+5 years, profits shared 65% to the owner
      and 35% to the SPV (the management company). This is the main route — the unit is
      sold as an investment.
  (b) 6% guaranteed on the investment amount for the first 5 years, or 10 years. Total
      peace of mind while the property appreciates.
The investor picks ONE of the two, never both. In BOTH cases the buyer gets a Property
Deed from the Albanian Property Registry and is the SOLE legal owner, plus free owner
use of the unit: 1 week to 10 days in summer and 2-3 weeks off season, for themselves
or their family. The SPV covers any renovation; the owner pays nothing else for at
least 10 years.
NEVER add the two together, never say "6% plus 65%", and NEVER use "up to ~8%", "8-10%"
or any other return percentage — 65/35 and 6% are the only figures that exist.
NEVER invent exact guarantee conditions, and NEVER add disclaimers like 'a specialist
will confirm the terms' — just answer warmly and ask what they need. Only if they
explicitly ask for the precise legal terms, warmly offer to connect them with the team
and call escalate_to_agent (no robotic disclaimer line).

DO THE ARITHMETIC — NEVER HAND A SUM TO A HUMAN. If a client gives you a price and
asks what 5% of it is, what 6% a year comes to, what that is per month, or what it
adds up to over 5 years, WORK IT OUT and give the number. "171,000 EUR -> 6% = 10,260
EUR per year, about 855 EUR a month, 51,300 EUR over five years." The 6% is calculated
on the investment amount — the price of the apartment the client pays. Passing a
multiplication to a specialist is a brush-off and reads as if we are hiding something.

CONTRACTS, OWNERSHIP, COSTS, TAXES, GUARANTEE TERMS — see the CONTRACT & MONEY
ANSWERS section below and follow it exactly. Answer what is settled there yourself,
with numbers. Where a term genuinely is not settled, give the honest line and name
the specific open item and the person who closes it (Eglent sends the sales contract,
the management contract and the guarantee document by email before signing) — never
"someone will contact you". A client asking about contracts is the most serious lead
we get; never invent a clause, a tax, a fee or a penalty to sound complete.

WHAT'S NEARBY — LOOK IT UP, DON'T IMAGINE IT. If the find_places tool is available and
a client asks what is around the residence — supermarkets, pharmacies, restaurants,
cafes, ATMs, hospitals, schools, petrol stations, beaches, shops — CALL find_places
and answer from what it returns: name, distance from the residence, address. Pass the
client's language code so the names come back in their language, and set include_hours
ONLY if they asked whether somewhere is open or what its hours are.
Give 2-3 of the closest, not a list of ten. If the tool is not available or fails,
say what you do know (Qerret, Durres, ~280 m from the beach, ~45 min from Tirana) and
offer to have the team send details — NEVER name a shop, a distance or an opening time
you have not been given.

MEI RESIDENCE IS AN INVESTMENT PROPERTY — SAY IT, AND CLOSE ON IT. This is not a
holiday home you buy to use two weeks a year: it is a managed, income-producing
investment (Renditeimmobilie) that happens to be on the sea, and the free owner
use is a bonus on top, not the point. Lead with the property, and END the reply
with ONE short closing line, in the client's own language, that says plainly that
Mei Residence is bought as an investment property: the unit is rented out and
managed for you under Ramada Residences by Wyndham, it earns you a return (the
65/35 rental pool or the 6% guaranteed — their choice), you hold the Property Deed
as sole owner, and you still get your own free stay each year.
- Put it at the END, as the last line, after you have answered everything they
  asked. Never open with it, never let it push the answer down.
- One or two sentences. Vary the wording, never paste the same sentence twice in a
  row, and never turn it into a sales pitch or a list.
- Say it on every substantive reply — price, availability, a unit, the returns,
  the location, the timeline, contracts, "what is this?". Skip it only on pure
  small talk ("thanks", "ok", "good morning"), on a reply to a non-lead, or when
  you already closed on it in your previous message and nothing new was asked.
- Example shape (translate, do not copy the words): "Keep in mind Mei Residence is
  bought as an investment — the apartment is rented out and fully managed under
  Ramada Residences by Wyndham, so it earns a return while you stay the legal
  owner, with free use for yourself each year."

DO NOT HAND OFF ON THE FIRST MESSAGE — EARN IT OVER TWO OR THREE. A brand-new chat
is yours to handle. Someone who has written once or twice ("hello", "how much is a
1+1?", "send me info") must get a real answer from you, not "a Mei specialist will
contact you" — that reads as being passed around before anyone has helped them,
and it burns the specialist's time on a lead nobody has qualified.
- Client message 1 and 2: NEVER call escalate_to_agent. Answer from the KNOWLEDGE
  BASE, give concrete units, prices, m2, sea view, tour links, the return options,
  the payment shape, do the arithmetic — then ask ONE question (typology, budget,
  timing, whether they are buying to invest) and close on the investment line
  above.
- From client message 3 on, a handoff is allowed when the normal HAND OFF
  conditions below are met and you have genuinely run out of KB answers.
- THE ONE EXCEPTION, valid from the very first message: they explicitly ask for a
  person, a phone call, a viewing/meeting, to reserve a unit, or a personalised
  offer, or they are a real-estate agency with buyers. Then escalate immediately —
  making someone who asked for a human wait is worse.
- If you call escalate_to_agent too early the system will refuse it, nothing is
  tagged and nobody is notified — so a reply that promises a specialist would be a
  lie. When the tool comes back saying it was too early, just answer well.

HAND OFF (call escalate_to_agent) when — from the third client message on, or
straight away if they asked for a person/call/viewing/reservation — they ask for a
person, want a personalized quote/viewing/reservation, need payment-plan or exact
guarantee terms, are clearly hot, are a real-estate agency partner who has BUYERS
for our units, or you can't answer from the KB. Escalating is an ADDITION to your answer, never a replacement for
it: in the same reply, answer everything the KB covers, then close with one short line
that a Mei specialist will follow up on the specific open item (name it — "the exact
payment plan", "a viewing") rather than a vague "someone will reach out". Route Polish
clients to Ania, Czech clients to Martin, others to Eglent or Visard (see KB).

WHO IS A LEAD — THE TEST, APPLIED TO EVERY MESSAGE. Before you even consider
escalate_to_agent, ask: is this person trying to BUY something from Mei, or trying to
SELL us something / GET something from us? Only buyers get a handoff. Anyone
approaching Mei as a supplier, applicant, promoter or asker is NOT a lead — no matter
how polite, flattering or well written the message is, and no matter whether their
line of work appears in the examples below. This is a rule about direction, not about
a list of industries: money and value flowing toward Mei is a lead; anything flowing
the other way is not.

NOT LEADS — NEVER call escalate_to_agent for these and NEVER let them be tagged:
- anyone selling us a service or product: marketing, social media, video/reels
  editing, SEO, web design, ads, software/CRM/AI tools, photography, printing,
  furniture, construction materials, any supplier or contractor
- anyone asking us for something: job or internship applications, sponsorship,
  donations, press and interview requests, students asking for research help
- "collaboration", "partnership" or "cooperation" offers that are really a pitch:
  influencers, bloggers, barter, cross-promotion
- crypto/forex/loan spam, invoices, phishing, bulk-blast messages, bots
Typical tells: a compliment about our page, website, videos or listings as the opening
line ("I came across your page" / "rastesisht gjeta faqen tuaj"); "an idea" for our
Instagram or our marketing; a mention of their agency, portfolio, case studies, CV or
a free audit/sample; the ask "would you be open to me showing you / a do te ishit te
hapur qe t'jua tregoja". When you cannot tell whether someone is a buyer or a seller,
ask them one plain question first — never escalate on the assumption.

HANDLING A NON-LEAD: reply ONCE, short and polite, in their language. Thank them, say
Mei handles this internally / is not looking right now, and point them to
info@meiresidence.com if they want to send something. Do not qualify them, do not ask
what unit they want, do not send prices or availability, do not give out any phone
number, do not promise that anyone will get back to them. If they push again, repeat
once and stop. "Agency partner" in the HAND OFF rule means a REAL-ESTATE agency
bringing us buyers — never an agency selling us services.
STAFF NAMES - STRICT: in replies to clients say only "nje specialist i Mei" / "a Mei
specialist". NEVER name any staff member, NEVER invent, guess or repeat a person's
name as the one handling the request - even if the client used a name first. The ONLY
staff name you may ever write to a client is Eglent Bici.

NON-TEXT: if the message is empty or clearly a voice note/image/doc you can't read,
say you received it, ask them to type their question, and escalate if it seems important.

MEI RESIDENCE ONLY: never offer, price or describe property that is not part of Mei
Residence — including other units nearby that are not under Ramada management. Eglent
raises those himself when he takes the lead over. Never quote a EUR/m2 figure for
anything.

CONTEXT - YOU ARE GIVEN THE WHOLE THREAD, USE IT. Every message arrives with the recent
conversation from the CRM: what the client wrote and what Mei sent (including automated
follow-up templates and messages Eglent typed himself), oldest first. The chat NEVER
starts fresh. Read what we sent last before you reply - the client is almost always
answering THAT.
- A short or vague reply ("po", "kjo", "qa eshte?", "cfare eshte kjo?", "on this?", "?",
  "sa?") is an answer to OUR last message, not a new topic. Pick the thread up: say in
  2-3 lines what Mei Residence is (Ramada Residences by Wyndham, 280 m from the sea in
  Qerret, fully managed, the return options), then offer 2-3 concrete units or ask which
  typology they want. NEVER reply "which post do you mean", "could you tell me what you'd
  like to know", or anything that reads as if you had no information at all.
- A message containing "*Headline:*" / "*Source URL:*" with an Instagram or Facebook link
  is WhatsApp quoting OUR OWN ad or post. It means "I am asking about this Mei post".
  Answer about Mei Residence. NEVER say you cannot view an image, a video or a link - to
  the client that reads as a broken agent.
- Several messages often arrive together as one turn (people type in bursts). Answer all
  of them in ONE reply, in the order they asked.
- NEVER mention the CRM, tags, templates, automation, or that a follow-up "was sent to
  you". For the client this is one continuous conversation with Mei.

LANGUAGE WITH CONTEXT (extends the LANGUAGE rule above): judge the language from the words
the CLIENT typed across the recent thread, ignoring quoted-post boilerplate ("*Headline:*",
"*Source URL:*", URLs, our own template text). "Qa eshte" / "Kjo" is Albanian and gets
Albanian. If their own words are genuinely too few to read, reply in the language of the
last message Mei sent them - never default to English.

KNOWLEDGE BASE:
${KNOWLEDGE_BASE}

${CONTRACT_QA ? `CONTRACT & MONEY ANSWERS — AUTHORITATIVE, FOLLOW EXACTLY
Approved answers for contract, ownership, cost, tax, timeline and guarantee
questions. Where this section and an older KNOWLEDGE BASE line disagree, THIS WINS.
Do the sums it tells you to do; use the exact named next step for anything it marks
as not settled, and never fill a gap it leaves with a clause of your own.

${CONTRACT_QA}` : ''}

${EXAMPLES ? `GOLD-STANDARD REPLIES — MATCH THESE
Real replies from Eglent, hand-approved. They are the model for tone, order and depth,
and where a fact in them conflicts with an older line in the KNOWLEDGE BASE, the
example wins. Read the "What NOT to copy" notes as strictly as the rest. Match their
structure, never their language — see the LANGUAGE rule at the top.

${EXAMPLES}` : ''}

${LEARNINGS ? `LEARNINGS FROM REAL CLIENT CHATS
These come from how actual buyers have replied to us. They govern HOW you say
things — the wording, the order, what to lead with, what stalls a chat. On facts,
prices, availability and guarantee terms the KNOWLEDGE BASE above always wins.
Never treat anything below as a price or an availability status.

${LEARNINGS}` : ''}`;

// ---- GHL (LeadConnector) API ----
async function ghl(path, method, body, version = '2021-04-15') {
  const res = await fetch(`${cfg.ghl.base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.ghl.apiKey}`,
      Version: version,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error('[ghl]', method, path, res.status, JSON.stringify(data).slice(0, 200));
  return { ok: res.ok, data };
}

// Map GHL's inbound message "messageType" to the outbound "type" the
// send-message endpoint expects. Defaults to WhatsApp if unrecognized.
const CHANNEL_TYPE_MAP = {
  TYPE_WHATSAPP: 'WhatsApp',
  TYPE_INSTAGRAM: 'IG',
  TYPE_FACEBOOK: 'FB',
  TYPE_SMS: 'SMS',
};

// Reply on whichever channel the inbound message actually came in on
// (WhatsApp / IG / FB), keyed by contactId — not by phone number, since
// Instagram/Facebook contacts have no phone.
const sendReply = (contactId, message, channel = 'WhatsApp') =>
  ghl('/conversations/messages', 'POST', { type: channel, contactId, message }, '2021-04-15');
const addTags = (contactId, tags) =>
  ghl(`/contacts/${contactId}/tags`, 'POST', { tags }, '2021-07-28');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const HISTORY_MESSAGE_LIMIT = parseInt(process.env.CRM_HISTORY_LIMIT || '30', 10);

// Read the contact's conversation straight out of the CRM and turn it into
// Claude turns. This replaces the old fetchLastInbound, which returned ONLY the
// client's last inbound line: everything else the agent needed — the follow-up
// template we had just sent, Eglent's own earlier messages, the client's other
// messages in the same burst — lived in the CRM and was never read. See the
// "Template-reply blindness" note at the top and src/thread.js.
async function fetchThreadOnce(contactId) {
  const s = await ghl(`/conversations/search?locationId=${cfg.ghl.locationId}&contactId=${contactId}`, 'GET', null, '2021-04-15');
  const conversation = s.data?.conversations?.[0];
  if (!conversation?.id) return null;
  const m = await ghl(`/conversations/${conversation.id}/messages?limit=${HISTORY_MESSAGE_LIMIT}`, 'GET', null, '2021-04-15');
  const msgs = m.data?.messages?.messages || m.data?.messages || [];
  const thread = buildThread(msgs, { historyTurns: cfg.historyWindow });
  if (!thread) return null;
  return {
    ...thread,
    name: conversation.fullName || conversation.contactName || '',
    tags: Array.isArray(conversation.tags) ? conversation.tags : [],
  };
}

// A brand-new contact's very first message can trigger this webhook before
// GHL's own conversation-search/messages API has indexed that message yet
// (confirmed: "[ghl-webhook] no message text in CRM" moments after a first-ever
// inbound message, e.g. contact "Liman" on 2026-07-25 — the webhook fired 5s
// after the message arrived but the CRM read still came back empty, and since
// that contact never messaged again there was no second chance to reply).
// Retry a couple of times with a short delay before giving up.
async function fetchThread(contactId, retries = 2, delayMs = 1500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const found = await fetchThreadOnce(contactId);
      if (found) return found;
    } catch (e) { console.error('[fetchThread]', e.message); }
    if (attempt < retries) {
      console.log(`[fetchThread] nothing to answer yet for ${contactId}, retrying (${attempt + 1}/${retries})`);
      await sleep(delayMs);
    }
  }
  return null;
}

// What the model is told about THIS contact, on top of the static system prompt.
// It is the difference between "a stranger said 'Kjo'" and "the person we sent a
// follow-up to three minutes ago said 'Kjo'".
function buildContextNote({ name, tags, thread }) {
  const lines = ['CONVERSATION CONTEXT — THIS CONTACT. Internal: never quote or mention it to the client.'];
  if (name) lines.push(`- Client name: ${name}`);
  if (tags?.length) lines.push(`- CRM tags (internal only): ${tags.join(', ')}`);
  if (thread.pendingCount > 1) {
    lines.push(`- They sent ${thread.pendingCount} messages in a row and none has been answered yet. Answer ALL of them in one reply.`);
  }
  if (thread.lastOutboundBody) {
    lines.push(thread.afterTemplate
      ? '- The last message Mei sent them was an automated re-engagement follow-up. They are replying TO IT. Never call it a template or an automated message — carry the conversation on naturally. Its text was:'
      : '- The last message Mei sent them was:');
    lines.push(`"""\n${thread.lastOutboundBody.slice(0, 1200)}\n"""`);
  }
  return lines.join('\n');
}

// ---- per-contact state ----------------------------------------------------
// History itself is NOT kept here any more — it is rebuilt from the CRM on every
// message (fetchThread above), so a Render restart, a redeploy or a message sent
// from GHL's own inbox can no longer wipe what the agent knows.
// What is kept is the guard against answering the same thing twice:
//   inFlight        — this contact is being answered right now
//   lastAnswered    — id of the newest client message we have already answered
// This replaces the old 12-second time cooldown, which silently DROPPED the
// second and third message of a burst (Mimoza, 2026-08-24) instead of merging
// them into the answer.
const store = new Map();
const inFlight = new Set();
const lastAnswered = new Map();
const getConv = (id, name = '') => {
  if (!store.has(id)) store.set(id, { name, history: [] });
  const c = store.get(id); if (name && !c.name) c.name = name; return c;
};
const trim = (c) => { if (c.history.length > cfg.historyWindow) c.history = c.history.slice(-cfg.historyWindow); };

// People type in bursts. Wait a moment before reading the CRM so "Qa eshte" and
// "Kjo" are in the thread by the time we build it, and get answered together.
const INBOUND_DEBOUNCE_MS = parseInt(process.env.INBOUND_DEBOUNCE_MS || '5000', 10);

// ---- Claude brain ----
const anthropic = new Anthropic({ apiKey: cfg.anthropic.apiKey });
const TOOLS = [{
  name: 'escalate_to_agent',
  description: 'Hand this lead to a human Mei sales agent (tags the contact needs-human + hot-lead and pings a specialist). TIMING: do NOT call this on the client\'s first or second message — handle those yourself from the knowledge base; a handoff is allowed from the third client message on. The only exception, valid immediately, is a client who explicitly asks for a person, a phone call, a viewing/meeting, to reserve a unit or a personalised offer, or a real-estate agency with buyers. Too-early calls are refused by the system: nothing is tagged, nobody is notified, so never promise a specialist after one. Call when they ask for a person, want a personalized quote/viewing/reservation, need payment or guarantee terms, are hot, are a real-estate agency partner with buyers for our units, or you cannot answer from the KB. Escalating never replaces the answer: after calling, answer every part of their message the KB covers and then name the one open item a specialist will follow up on. Only someone trying to BUY from Mei is a lead. NEVER call this for anyone approaching Mei to sell us something (any trade: marketing, social media, video, SEO, web, ads, software, photography, suppliers, contractors), to apply for a job or internship, to ask for sponsorship, donations or press, or to pitch a "collaboration" — however polite or flattering the message is. Those are not leads and must not be tagged. If you cannot tell which side they are on, ask one plain question instead of calling this.',
  input_schema: { type: 'object', properties: {
    reason: { type: 'string' }, lead_summary: { type: 'string' },
    interested_in: { type: 'string' }, buyer_type: { type: 'string' },
    budget: { type: 'string' }, language: { type: 'string' },
  }, required: ['reason', 'lead_summary'] },
}];

// "Ku ka markete afer Mei Residence?" — real Google Places data, never guessed.
// Only offered to the model when GOOGLE_MAPS_API_KEY is set: with no key the
// model never sees the tool and falls back to the honest "I'll check with the
// team" line instead of inventing a supermarket that isn't there.
if (placesConfigured()) TOOLS.push(PLACES_TOOL);

// Pull the client's own last words out of the in-memory conversation.
// Tool-result turns are also role:'user' but carry an array, so require a string.
// Custom field "Last Client Message" (LARGE_TEXT) - the handoff email renders it.
const LAST_MSG_FIELD_ID = 'pgjCDvkHlPlXx0C1TJ1p';

// Last N verbatim client messages, oldest first. Tool-result turns are also
// role:'user' but carry an array, so require a string.
function lastClientMessages(contactId, n = 3) {
  const conv = store.get(contactId);
  if (!conv) return [];
  const out = [];
  for (let i = conv.history.length - 1; i >= 0 && out.length < n; i--) {
    const m = conv.history[i];
    if (m.role === 'user' && typeof m.content === 'string') {
      const t = m.content.trim();
      if (t) out.push(t);
    }
  }
  return out.reverse();
}

// Snapshot the recent client messages onto the contact so the GHL handoff
// email shows the conversation, not just the final line.
async function writeRecentMessages(contactId, n = 3) {
  const msgs = lastClientMessages(contactId, n);
  if (!msgs.length) return { ok: false };
  const clip = (str, max) => {
    const t = String(str).replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };
  const value = msgs.map((m) => `- ${clip(m, 300)}`).join('\n');
  const r = await ghl(`/contacts/${contactId}`, 'PUT',
    { customFields: [{ id: LAST_MSG_FIELD_ID, value }] }, '2021-07-28');
  if (!r.ok) console.error('[handoff] field update failed', JSON.stringify(r.data).slice(0, 200));
  return r;
}

// How many separate messages this client has sent in the thread we hold
// (the CRM history is rebuilt on every message by src/thread.js, so this is
// the real conversation length, not just this process's memory).
function countClientMessages(contactId) {
  const conv = store.get(contactId);
  if (!conv) return 0;
  return conv.history.filter((m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim()).length;
}

function lastClientText(contactId) {
  const conv = store.get(contactId);
  if (!conv) return '';
  for (let i = conv.history.length - 1; i >= 0; i--) {
    const m = conv.history[i];
    if (m.role === 'user' && typeof m.content === 'string') return m.content.trim();
  }
  return '';
}

async function escalate(contactId, name, args) {
  // Safety net (Aug 2026): only buyers are leads. Anyone selling US something
  // (any trade), applying for a job, asking for sponsorship or pitching a
  // "collab" is not, however polite the message. One such pitch was tagged
  // needs-human and woke a specialist. The system prompt now states the test
  // plainly; this is the deterministic backstop for when the model slips. It
  // blocks the whole handoff: no needs-human, no hot-lead, no tag of any kind,
  // no alert. Any buyer signal anywhere in the conversation disables it — see
  // src/not-a-lead.js.
  const clientWords = lastClientMessages(contactId, 6).join('\n');

  // Not on the first message (2026-08-30). The agent handles the first two or
  // three client messages itself; a handoff only fires from the third client
  // message on — unless they explicitly ask for a person, a call, a viewing or
  // a reservation. See src/handoff-timing.js.
  const clientTurns = countClientMessages(contactId);
  if (handoffTooEarly({ clientTurns, clientWords })) {
    console.log(`[handoff] TOO EARLY for ${contactId} — client turn ${clientTurns}/${MIN_CLIENT_TURNS_BEFORE_HANDOFF}, no tags, no alert`);
    return { ok: true, alerted: false, blocked: 'too-early' };
  }

  if (looksLikeNonBuyerOutreach(clientWords)) {
    console.log(`[handoff] BLOCKED as non-buyer outreach for ${contactId} — no tags, no alert:`,
      clientWords.replace(/\s+/g, ' ').slice(0, 120));
    return { ok: true, alerted: false, blocked: 'not-a-lead' };
  }

  // Write the recent messages first - the GHL email fires off the tag below,
  // so the field must already hold the new value when that happens.
  await writeRecentMessages(contactId, 3).catch(() => {});
  await addTags(contactId, ['needs-human', 'hot-lead']).catch(() => {});

  const specialist = process.env.SPECIALIST_CONTACT_ID;
  if (!specialist) {
    console.warn('[handoff] SPECIALIST_CONTACT_ID not set - no alert sent');
    console.log(`[handoff] tagged ${contactId}:`, args.lead_summary || '');
    return { ok: true, alerted: false };
  }
  if (specialist === contactId) {
    console.warn('[handoff] specialist is the lead - skipping alert to avoid self-message');
    return { ok: true, alerted: false };
  }

  const last = lastClientText(contactId);
  const clip = (str, n) => {
    const t = String(str).replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  };

  const lines = [
    'HANDOFF - specialist needed',
    `Name: ${name || 'Unknown'}`,
    args.buyer_type ? `Type: ${args.buyer_type}` : null,
    args.interested_in ? `Interested in: ${args.interested_in}` : null,
    args.budget ? `Budget: ${args.budget}` : null,
    args.language ? `Language: ${args.language}` : null,
    args.reason ? `Why now: ${args.reason}` : null,
    args.lead_summary ? `Summary: ${args.lead_summary}` : null,
    last ? `\nLast message:\n"${clip(last, 400)}"` : null,
    '',
    `Open: https://app.gohighlevel.com/v2/location/${cfg.ghl.locationId}/conversations/conversations/${contactId}`,
  ].filter(Boolean);

  const channel = process.env.SPECIALIST_CHANNEL || 'WhatsApp';
  const sent = await sendReply(specialist, lines.join('\n'), channel);
  if (!sent.ok) console.error('[handoff] ALERT FAILED', JSON.stringify(sent.data).slice(0, 300));

  console.log(`[handoff] tagged ${contactId}, alert sent:${sent.ok}`);
  return { ok: true, alerted: sent.ok };
}

// One Claude call. maxTokens is a parameter so the empty-reply retry below can
// raise it — a response whose whole budget went to non-text blocks (or that was
// cut off at max_tokens before any text) is one of the ways the agent went
// silent on 2026-08-19 (contact Borys: two real buyer messages, both answered
// with the old canned fallback line, no tags, no alert).
// Prompt caching (2026-08-26): SYSTEM_PROMPT is ~15k tokens of knowledge base
// and TOOLS never changes, yet both were being re-sent and re-charged at full
// price on every hop of every message. They are now marked as ONE cache
// breakpoint: the first call writes the prefix, every call within the 5-minute
// window reads it at ~10% of the input price (and each write refreshes the
// window, so a busy agent effectively keeps it warm all day).
// The per-contact contextNote MUST stay in a second block AFTER the breakpoint
// — appending it to SYSTEM_PROMPT, as this did before, changed the prefix for
// every contact and made the cache impossible to hit.
const callClaude = (messages, maxTokens, { withTools = true, contextNote = '' } = {}) => anthropic.messages.create({
  model: cfg.anthropic.model, max_tokens: maxTokens,
  system: [
    { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ...(contextNote ? [{ type: 'text', text: contextNote }] : []),
  ],
  messages,
  ...(withTools ? { tools: TOOLS } : {}),
});

// Text actually usable as a reply: non-empty after trimming. An empty text
// block ("") used to count as a reply and erase finalText.
const usableText = (content) => content
  .filter((b) => b.type === 'text')
  .map((b) => (b.text || '').trim())
  .filter(Boolean)
  .join('\n')
  .trim();

// The tool-use loop. Kept separate from generateReply so that ANY failure in
// here (a 400 from a malformed history, a transient API error) gets one clean
// recovery attempt before a human is woken up.
async function runToolLoop(conv, contactId) {
  // Never SEND a half-written tool call: sanitizeHistory drops any tool_use
  // left without a tool_result (and any orphan tool_result), so a history that
  // an earlier truncation poisoned heals itself on the very next message.
  const messages = sanitizeHistory(conv.history);
  let finalText = '', escalated = false;
  for (let hop = 0; hop < 4; hop++) {
    const resp = await callClaude(messages, cfg.anthropic.maxTokens, { contextNote: conv.contextNote });

    // Every call already runs at the ceiling, so there is no bigger budget to
    // retry with — but the guard stays: a reply cut off at max_tokens can carry a
    // HALF-WRITTEN tool_use block with no usable arguments, which can never be
    // answered with a tool_result and breaks every later call for this contact if
    // it is stored. Drop the fragment, keep the text, and log it loudly: at 8192
    // tokens this should never fire, so if it does, something is wrong upstream.
    let content = resp.content;
    if (resp.stop_reason === 'max_tokens') {
      console.warn(`[claude] hop ${hop} hit the ${MAX_OUTPUT_TOKENS}-token ceiling — reply was truncated`);
      const trimmed = dropIncompleteToolUse(content);
      if (trimmed.length !== content.length) {
        console.warn(`[claude] dropped ${content.length - trimmed.length} incomplete tool_use block(s) — never storing a dangling tool call`);
      }
      content = trimmed;
    }

    // Always log what came back — this line is what lets Render logs answer
    // "why did the agent go quiet" in one glance.
    const u = resp.usage || {};
    console.log(`[claude] hop ${hop} stop:${resp.stop_reason} blocks:[${content.map((b) => b.type).join(',') || 'EMPTY'}] cache:read=${u.cache_read_input_tokens ?? 0} write=${u.cache_creation_input_tokens ?? 0} fresh=${u.input_tokens ?? 0}`);
    if (!content.length) break;

    messages.push({ role: 'assistant', content });
    conv.history.push({ role: 'assistant', content });
    const text = usableText(content);
    if (text) finalText = text;

    const toolUses = content.filter((b) => b.type === 'tool_use');
    if (!toolUses.length) break;   // includes the truncated case above: nothing left to answer

    const results = [];
    for (const b of toolUses) {
      if (b.name === 'escalate_to_agent') {
        const r = await escalate(contactId, conv.name, b.input || {});
        if (r.blocked === 'too-early') {
          results.push({ type: 'tool_result', tool_use_id: b.id, content: 'NOT escalated — it is too early. This client has only just started writing to us and did not ask for a person, a call, a viewing or a reservation. Nobody was tagged and no specialist was notified, so do NOT say or hint that anyone will contact them. Answer their question yourself, fully, from the KNOWLEDGE BASE, in their own language — availability, price, m2, sea view, tour links, completion date, the two return options, the payment shape, any arithmetic — and end by asking ONE question that moves the conversation on (which typology, which budget, when they are thinking of investing). Close the reply with the one-line reminder that Mei Residence is an investment property. You may hand over later in the conversation once you have actually helped them.' });
        } else if (r.blocked === 'not-a-lead') {
          // Not a buyer. Nothing was tagged and no specialist was notified, so
          // the reply must not promise one.
          results.push({ type: 'tool_result', tool_use_id: b.id, content: 'NOT escalated. This person is approaching Mei to sell us something, apply for something, or ask us for something — not to buy. Nobody was tagged or notified. Do NOT say a specialist will contact them. Reply once, short and polite, in their own language: thank them, say Mei handles this internally and is not looking right now, and point them to info@meiresidence.com.' });
        } else {
          escalated = true;
          results.push({ type: 'tool_result', tool_use_id: b.id, content: 'Tagged for a human. Now write the client reply, IN THE CLIENT\'S OWN LANGUAGE — the language they typed in, not English by default. FIRST answer every part of their question that the KNOWLEDGE BASE covers — if they named a unit code, look it up and give its type, m2, price, current status and its tour links (video walkthrough + interactive 3D plan); also answer completion date, price ranges, the return options, location, the money arithmetic (5% of the price, 6% per year), anything else covered. THEN close with one short line naming only the specific open item a Mei specialist will follow up on (e.g. the signed contract wording). Do NOT send a reply that is only "a specialist will contact you".' });
        }
      }
      else if (b.name === 'find_places') {
        try {
          const found = await findPlaces(b.input || {});
          console.log(`[places] ${found.searched} r=${found.radius_m}m -> ${found.count} result(s)`);
          results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(found) });
        } catch (e) {
          console.error('[places] lookup failed:', e?.message || e);
          results.push({ type: 'tool_result', tool_use_id: b.id, content: 'Place lookup unavailable right now. Do NOT invent nearby businesses, distances or opening hours. Answer what you do know about the location from the KNOWLEDGE BASE (Qerret, Durres, ~280 m from the beach, ~45 min from Tirana) and offer to have the team send the details.' });
        }
      }
      else results.push({ type: 'tool_result', tool_use_id: b.id, content: 'Unknown tool.' });
    }
    messages.push({ role: 'user', content: results });
    conv.history.push({ role: 'user', content: results });
  }

  // Empty reply? Retry ONCE before giving up. Covers a response whose whole
  // budget went to non-text blocks, one cut off before any text, or a bare empty
  // text block.
  if (!finalText) {
    console.warn(`[claude] empty reply for ${contactId} — retrying once`);
    const resp = await callClaude(messages, MAX_OUTPUT_TOKENS, { contextNote: conv.contextNote });
    console.log(`[claude] retry stop:${resp.stop_reason} blocks:[${resp.content.map((b) => b.type).join(',') || 'EMPTY'}]`);
    const content = resp.stop_reason === 'max_tokens' ? dropIncompleteToolUse(resp.content) : resp.content;
    const text = usableText(content);
    if (text) {
      finalText = text;
      messages.push({ role: 'assistant', content });
      conv.history.push({ role: 'assistant', content });
    }
  }
  trim(conv);
  if (!finalText && escalated) {
    // The handoff DID fire (tags + alert), so this promise is honest.
    finalText = 'Faleminderit! Nje specialist i Mei Residence do t’ju kontaktoje shume shpejt.';
  }
  // NOTE (2026-08-19, the Borys failure): there is deliberately NO generic
  // fallback line here any more. Returning '' tells the webhook handler that
  // generation failed, and the handler alerts a human instead of sending a
  // "Si mund t'ju ndihmoj?" greeting that looks like a normal reply, answers
  // nothing, and lets the lead go cold with nobody ever finding out.
  return { text: finalText, escalated };
}

async function generateReply(conv, contactId) {
  try {
    return await runToolLoop(conv, contactId);
  } catch (e) {
    // One clean retry before a human is woken (2026-08-22). The failure that
    // sent us here was almost always the stored history, not the question: a
    // dangling tool_use makes the API reject EVERY later message from that
    // contact with a 400, so a client asking real buying questions got the
    // "a colleague will reply" holding line again and again. Ask once more with
    // nothing but their latest message and no tools, then throw the broken
    // history away so the contact is not stuck in that state.
    console.error('[claude] tool loop failed:', e?.message || e);
    const last = lastClientText(contactId);
    if (!last) throw e;
    const resp = await callClaude(
      [{ role: 'user', content: last }],
      MAX_OUTPUT_TOKENS,
      { withTools: false, contextNote: conv.contextNote },
    );
    const text = usableText(resp.content);
    if (!text) throw e;
    console.warn(`[claude] recovered ${contactId} on a clean single-message retry — resetting its history`);
    conv.history.length = 0;
    conv.history.push({ role: 'user', content: last });
    conv.history.push({ role: 'assistant', content: resp.content });
    return { text, escalated: false };
  }
}

// Generation failed (empty reply after retry, or the Claude call threw).
// Never mask it as a normal reply and never go silent: put a human on it.
//  - buyers: tag needs-human + agent-error (the GHL handoff workflow fires off
//    the tag), ping the specialist directly, and send the client an honest
//    holding line so they know a person is coming.
//  - non-buyer outreach (deterministic guard, no model needed): polite
//    redirect to info@, no tags, nobody woken.
async function handleGenerationFailure(contactId, name, channel, errMsg) {
  const clientWords = lastClientMessages(contactId, 6).join('\n');
  if (looksLikeNonBuyerOutreach(clientWords)) {
    console.warn(`[agent-error] ${contactId}: generation failed for non-buyer outreach — polite redirect, no alert. (${errMsg || 'empty reply'})`);
    return 'Faleminderit per mesazhin! Per propozime dhe bashkepunime na shkruani ne info@meiresidence.com dhe ekipi e shikon. / Thank you for reaching out — please send proposals to info@meiresidence.com.';
  }

  console.error(`[agent-error] ${contactId}: generation failed (${errMsg || 'empty reply after retry'}) — tagging needs-human and alerting the specialist.`);
  await writeRecentMessages(contactId, 3).catch(() => {});
  await addTags(contactId, ['needs-human', 'agent-error']).catch(() => {});

  const specialist = process.env.SPECIALIST_CONTACT_ID;
  if (specialist && specialist !== contactId) {
    const last = lastClientText(contactId);
    const alert = [
      '⚠️ AGENT ERROR - reply failed, human needed',
      `Name: ${name || 'Unknown'}`,
      errMsg ? `Error: ${String(errMsg).slice(0, 200)}` : 'Error: model returned no text (after one retry)',
      last ? `\nTheir last message:\n"${String(last).replace(/\s+/g, ' ').slice(0, 400)}"` : null,
      '',
      'The client received a holding message and is waiting for a person.',
      `Open: https://app.gohighlevel.com/v2/location/${cfg.ghl.locationId}/conversations/conversations/${contactId}`,
    ].filter(Boolean).join('\n');
    const sent = await sendReply(specialist, alert, process.env.SPECIALIST_CHANNEL || 'WhatsApp');
    if (!sent.ok) console.error('[agent-error] specialist alert FAILED', JSON.stringify(sent.data).slice(0, 300));
  } else if (!specialist) {
    console.warn('[agent-error] SPECIALIST_CONTACT_ID not set - relying on the needs-human tag workflow only');
  }

  // Honest holding line, bilingual since we could not detect their language
  // without the model. It promises exactly what just happened: a person.
  return 'Faleminderit per mesazhin tuaj! Nje koleg nga Mei Residence do t’ju pergjigjet personalisht shume shpejt. / Thank you for your message — a Mei Residence colleague will reply to you personally very soon.';
}

// ---- server ----
const app = express();
app.use(express.json());
app.get('/', (_q, r) => r.send('Mei Residence GHL agent is running.'));

app.post('/ghl-webhook', async (req, res) => {
  const b = req.body || {};
  const contactId = b.contactId || b.contact_id || b.id || b.contact?.id;
  if (!contactId) { console.warn('[ghl-webhook] no contactId'); return res.status(200).json({ reply: '' }); }

  // One answer at a time per contact. GHL fires this webhook once per inbound
  // message, so a three-message burst arrives as three near-simultaneous calls;
  // without this lock they would race and send three replies to the same burst.
  if (inFlight.has(contactId)) {
    console.log(`[skip] ${contactId} is already being answered`);
    return res.status(200).json({ reply: '' });
  }
  inFlight.add(contactId);

  try {
    // Let the burst land before reading the thread (see INBOUND_DEBOUNCE_MS).
    if (INBOUND_DEBOUNCE_MS > 0) await sleep(INBOUND_DEBOUNCE_MS);

    // The whole conversation, from the CRM: their messages and ours, oldest
    // first, plus every client message we have not answered yet merged into one
    // turn. Returns null when there is genuinely nothing new to answer.
    const thread = await fetchThread(contactId);
    if (!thread) { console.warn(`[ghl-webhook] nothing new to answer for ${contactId}`); return res.status(200).json({ reply: '' }); }

    if (thread.lastInboundId && lastAnswered.get(contactId) === thread.lastInboundId) {
      console.log(`[skip] ${contactId}: already answered message ${thread.lastInboundId}`);
      return res.status(200).json({ reply: '' });
    }
    lastAnswered.set(contactId, thread.lastInboundId);

    const name = thread.name || b.full_name || b.first_name || b.name || b.contact?.name || '';
    const { text, channel } = thread;

    // History is REBUILT from the CRM every time rather than appended to a
    // process-local Map: it survives restarts, it includes messages sent from
    // GHL's inbox or by a bulk template, and it can never drift from what the
    // client actually sees in WhatsApp.
    const conv = getConv(contactId, name);
    conv.name = name || conv.name;
    conv.history = [...thread.history, { role: 'user', content: String(text) }];
    conv.contextNote = buildContextNote({ name, tags: thread.tags, thread });
    trim(conv);

    // Generation is guarded separately from the rest of the handler: a Claude
    // failure (thrown error OR empty reply) must not drop the lead silently
    // and must not be papered over with a canned greeting. Both used to
    // happen — silent drop for thrown errors, canned greeting for empty
    // replies (contact Borys, 2026-08-19).
    let reply = '', failReason = '';
    try {
      const out = await generateReply(conv, contactId);
      reply = out.text;
      if (!reply) failReason = 'model returned no text (after one retry)';
    } catch (e) {
      failReason = e?.message || String(e);
      console.error('[ghl-webhook] generateReply threw:', e);
    }
    if (!reply) {
      reply = await handleGenerationFailure(contactId, name, channel, failReason);
    }

    const sent = await sendReply(contactId, reply, channel); // reply on the same channel it arrived on
    console.log(`[msg] ${contactId} (${channel}) <= ${thread.pendingCount} msg(s)${thread.afterTemplate ? ' after-template' : ''} history:${thread.history.length} "${String(text).replace(/\s+/g, ' ').slice(0, 40)}" => sent:${sent.ok}${failReason ? ' DEGRADED' : ''} "${reply.slice(0, 60)}"`);
    return res.status(200).json({ reply, contactId, channel, degraded: !!failReason || undefined });
  } catch (e) {
    console.error('[ghl-webhook] error', e);
    return res.status(200).json({ reply: '' });
  } finally {
    inFlight.delete(contactId);
  }
});

app.listen(cfg.port, () => console.log(`Mei Residence GHL agent on :${cfg.port} (model ${cfg.anthropic.model})`));
