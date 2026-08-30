// Regression test for the 2026-08-30 handoff-timing rule:
// no escalation on the client's first or second message, unless they explicitly
// ask for a person, a call, a viewing, a reservation or a personal offer.
import { handoffTooEarly, explicitlyWantsHuman, MIN_CLIENT_TURNS_BEFORE_HANDOFF } from '../src/handoff-timing.js';

const cases = [
  // [clientTurns, words, expectedTooEarly, label]
  [1, 'Pershendetje, sa kushton nje 1+1?', true, 'first message, price question (SQ)'],
  [1, 'Hello, send me info please', true, 'first message, info request (EN)'],
  [2, 'A ka apartamente me pamje nga deti?', true, 'second message, sea view (SQ)'],
  [2, 'Wie viel kostet eine 2+1 Wohnung?', true, 'second message, price (DE)'],
  [3, 'And what about the payment plan?', false, 'third message — handoff allowed'],
  [5, 'ok', false, 'deep in the thread — handoff allowed'],
  // explicit human asks bypass the wait, from message one
  [1, 'A mund te flas me nje agjent?', false, 'asks for an agent (SQ)'],
  [1, 'Can someone call me please?', false, 'asks for a call (EN)'],
  [1, 'Chce zarezerwowac mieszkanie', false, 'wants to reserve (PL)'],
  [1, 'Ich möchte einen Besichtigungstermin', true, 'viewing request waits — the agent asks what they want to know first (DE)'],
  [1, 'Vorrei parlare con un agente', false, 'wants an agent (IT)'],
  [1, 'Chci mluvit s makléřem', false, 'wants a broker (CZ)'],
  [1, 'Dua ta shoh apartamentin nga afer', true, 'seeing the unit waits — same rule (SQ)'],
];

let failed = 0;
for (const [turns, words, expected, label] of cases) {
  const got = handoffTooEarly({ clientTurns: turns, clientWords: words });
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  turn ${turns}  tooEarly=${got} (want ${expected})  ${label}`);
}

// sanity: plain buying questions must NOT read as an explicit human request
for (const t of ['sa kushton', 'what is the price of A212', 'kur perfundon ndertimi']) {
  const got = explicitlyWantsHuman(t);
  if (got) { failed++; console.log(`FAIL  false positive on "${t}"`); }
  else console.log(`PASS  no false positive on "${t}"`);
}

console.log(`\nMIN_CLIENT_TURNS_BEFORE_HANDOFF = ${MIN_CLIENT_TURNS_BEFORE_HANDOFF}`);
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
