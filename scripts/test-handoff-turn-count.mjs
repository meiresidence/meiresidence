// Regression test for the 2026-09-08 handoff-counting bug.
//
// The timing gate (no handoff before the client's third message) stays exactly
// as it was. What was broken is what it counted: buildThread merges consecutive
// client messages into one turn, so a burst — the normal way people write on
// WhatsApp — counted as a single message and the gate refused handoffs one or
// two messages too long.
//
// The thread below is Brahim Selmani's real conversation of 8 Sep 2026. He
// opened with two messages in eighteen seconds, and by his third he was asking
// for prices per m2. The gate counted 2, refused the handoff, tagged nothing,
// alerted nobody — and the agent told him a specialist would contact him.
import { buildThread } from '../src/thread.js';
import { handoffTooEarly, MIN_CLIENT_TURNS_BEFORE_HANDOFF } from '../src/handoff-timing.js';

const THREAD = [
  ['in',  '1+1 ,bisedohet per dy banesa',                                        '10:01:52'],
  ['in',  'Më jep mē shum info',                                                 '10:02:10'],
  ['out', 'Përshëndetje Brahim! Për 1+1 kemi disa opsione të lira…',             '10:02:14'],
  ['in',  'Ne tetor dot vij ne pushim, më jep meter katrorin, çmimin ju lutem',  '10:05:02'],
  ['out', 'Brahim, faleminderit! Ja edhe njëherë opsionet konkrete…',            '10:05:47'],
  ['in',  'Mbi 200 euro meter katrori????!!!!!',                                 '10:06:54'],
];

const toGhl = (rows) => rows.map((r, i) => ({
  id: String(i),
  direction: r[0] === 'in' ? 'inbound' : 'outbound',
  body: r[1],
  messageType: 'TYPE_WHATSAPP',
  dateAdded: `2026-09-08T${r[2]}Z`,
}));

// [messages the client has sent, expected tooEarly]
const expected = [[1, true], [2, true], [3, false], [4, false]];

let failed = 0;
let seen = 0;
THREAD.forEach((row, i) => {
  if (row[0] !== 'in') return;
  seen++;
  const thread = buildThread(toGhl(THREAD.slice(0, i + 1)));
  const count = thread.clientMessageCount;
  const [wantCount, wantTooEarly] = expected[seen - 1];
  const tooEarly = handoffTooEarly({ clientTurns: count, clientWords: thread.text });

  const ok = count === wantCount && tooEarly === wantTooEarly;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  client message #${seen}: counted ${count} (want ${wantCount}), tooEarly=${tooEarly} (want ${wantTooEarly})`);
});

// The merged history must NOT be used for this: it is what caused the bug.
const merged = buildThread(toGhl(THREAD.slice(0, 4)));
if (merged.history.filter((h) => h.role === 'user').length >= merged.clientMessageCount) {
  failed++;
  console.log('FAIL  merged turns are not fewer than real messages — the fixture no longer reproduces the bug');
} else {
  console.log(`PASS  merged turns (${merged.history.filter((h) => h.role === 'user').length}) < real client messages (${merged.clientMessageCount}) — the old count was short`);
}

console.log(`\nMIN_CLIENT_TURNS_BEFORE_HANDOFF = ${MIN_CLIENT_TURNS_BEFORE_HANDOFF} (unchanged)`);
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
