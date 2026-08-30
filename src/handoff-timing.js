// Handoff timing guard (2026-08-30).
//
// The agent was calling escalate_to_agent on the very FIRST message of a
// conversation: someone wrote "Pershendetje, sa kushton nje 1+1?" and got
// tagged needs-human plus a "a Mei specialist will contact you" line before
// the agent had had a single real exchange with them. That wastes the
// specialist's time, and for the client it reads as being passed around
// instead of being helped.
//
// Rule agreed with Eglent: the agent handles the first two or three client
// messages itself. A handoff may fire only from the THIRD client message on —
// unless the client explicitly asks for a human, a call, a viewing or a
// personal quote, in which case waiting would be worse than escalating.
//
// This is the deterministic backstop for the prompt rule of the same name.

export const MIN_CLIENT_TURNS_BEFORE_HANDOFF = 3;

// Explicit "put me through to a person" signals, across the languages Mei
// actually gets: Albanian, English, Italian, German, Polish, Czech.
const EXPLICIT_HUMAN = [
  // wants a person / agent / specialist / manager
  /\b(agjent|specialist|specialisti|menaxher|përgjegjës|pergjegjes|njeri real|person real|dikush nga ekipi)\b/i,
  /\b(agent|specialist|manager|salesperson|someone from (the|your) team|a real person|human)\b/i,
  /\b(agente|responsabile|venditore)\b/i,
  /\b(berater|makler|ansprechpartner|mitarbeiter|verkäufer|verkaufer)\b/i,
  /\b(agent(a|em)?|doradc|handlowiec|opiekun)\w*/i,
  /\b(makléř|makler|obchodník|obchodnik|poradce)\w*/i,
  // wants a call / to talk / a number
  /\b(me telefonu|telefono|më merr në telefon|me merr ne telefon|numri i telefonit|te flas me|të flas me|bisedoj me)\b/i,
  /\b(call me|phone call|give me a call|talk to|speak to|speak with|your number|whatsapp call)\b/i,
  /\b(chiamami|chiamata|parlare con|numero di telefono)\b/i,
  /\b(rufen sie mich an|anruf|telefonnummer|sprechen mit|telefonisch)\b/i,
  /\b(zadzwo|zadzwoń|rozmawiać|numer telefonu)\w*/i,
  /\b(zavolejte|zavolat|mluvit s|telefonní číslo)\w*/i,
  // wants a viewing / meeting / site visit
  /\b(takim|vizit|shoh apartamentin|vij ta shoh|ta shoh nga afer|ta shoh nga afër)\w*/i,
  /\b(viewing|visit|site visit|meeting|appointment|come and see|see the apartment)\b/i,
  /\b(visita|appuntamento|incontro)\b/i,
  /\b(besichtigung|termin|treffen|vor ort)\w*/i,
  /\b(spotkanie|oglądanie|ogladanie|wizyt)\w*/i,
  /\b(prohlídk|prohlidk|schůzk|schuzk|návštěv)\w*/i,
  // wants to reserve / buy now / a personal offer
  /\b(rezervoj|rezervim|kapar|dua ta blej|oferte personale|ofertë personale)\b/i,
  /\b(reserve|reservation|book (it|the unit)|i want to buy|personal offer|personalized offer|personalised offer)\b/i,
  /\b(prenotare|prenotazione|voglio comprare|offerta personale)\b/i,
  /\b(reservier\w*|kaufen möchte|kaufen mochte|persönliches angebot)/i,
  /(rezerw\w*|chcę kupić|chce kupic)/i,
  /\b(rezervac|rezervovat|chci koupit)\w*/i,
];

export function explicitlyWantsHuman(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  return EXPLICIT_HUMAN.some((re) => re.test(t));
}

// clientTurns = how many separate messages this client has sent in the thread
// (including the one being answered right now).
export function handoffTooEarly({ clientTurns, clientWords }) {
  if (explicitlyWantsHuman(clientWords)) return false;
  return Number(clientTurns || 0) < MIN_CLIENT_TURNS_BEFORE_HANDOFF;
}
