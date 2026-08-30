#!/usr/bin/env node
// One-time, idempotent patch (2026-08-30). Adds to knowledge/contract-questions.md:
//   - the three points from a real client's 14-point due-diligence list that are
//     genuinely NOT settled yet, each with the honest line the agent must give
//     instead of inventing an answer or deferring to a meeting;
//   - the checklist itself, mapped point by point to its answer, so a list like
//     that is walked in order rather than summarised away.
//
//   node scripts/apply-kb-duediligence.mjs          # apply
//   node scripts/apply-kb-duediligence.mjs --check  # report only
//
// Safe to run more than once.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KB = path.join(ROOT, 'knowledge', 'contract-questions.md');
const checkOnly = process.argv.includes('--check');

const ANCHOR = '## What the client should feel at the end of these answers';
const MARKER = '## Added 30 Aug 2026 — three points a client asked that are NOT settled';

const BLOCK = `## Added 30 Aug 2026 — three points a client asked that are NOT settled

A client sent a 14-point due-diligence list. Eleven points are answered above.
These three are not written anywhere yet. Do NOT invent them, do NOT reassure with
a guess, and do NOT hide them in a "we'll discuss it in the meeting".

- **What happens to the 6% in the weeks the owner uses the apartment himself**
  ("çfarë ndodh me 6% kur e përdor vetë") → the free owner use (1 week–10 days in
  high season, 2–3 weeks off season) and the 6% are both written into the
  management contract. How the two interact is set out there, and Eglent goes
  through exactly that clause before any reservation. Say that; give no percentage,
  no pro-rata rule and no "it doesn't affect it" of your own.
- **Can the owner leave the programme and rent the apartment out himself**
  ("nëse mund të dalësh nga programi dhe ta japesh vetë në qira") → the one thing
  that is certain and worth saying: the buyer holds the Property Deed as sole legal
  owner, and the management arrangement is a separate contract running 5+5 years.
  The exit terms of that contract are a point Eglent goes through personally. Never
  claim the owner can walk away freely, and never claim he is locked in.
- **Penalties if the building is not delivered on time**
  ("penalitetet nëse objekti nuk dorëzohet në kohë") → the buyer-side penalty
  (0.1% per day on a late instalment) is settled and stated above; the
  developer-side penalty for late handover is written in the sales contract and is
  a point Eglent confirms in writing before the reservation. State the handover
  date (June 2027) plainly and do not invent a symmetric penalty.

## The due-diligence checklist — answer it point by point

When a client sends a list like the one below, walk it in their order, one short
labelled line each. Eleven of these have real answers above; three are open and get
the honest lines above. NEVER answer such a list with a summary paragraph or with
"let's go through it at the meeting".

1. sales/ownership contract → one of the three contracts, from Mei Residence SHPK
2. Ramada/Wyndham contract → the management contract, 5+5 years
3. rental-management contract → the same management contract; the 6% lives inside it
4. the exact 6% formula → fixed contractual amount on the price paid, not a share of nights
5. gross or net → net from Mei's side, paid once a year; tax in the owner's own country is theirs
6. what it is calculated on → the investment amount, i.e. the apartment price the buyer pays
7. for how many years → 5 years, with a 10-year version
8. how many weeks of own use → 1 week–10 days high season + 2–3 weeks off season, free
9. the 6% during own use → OPEN, see above
10. annual maintenance fee → the owner's yearly cost is the property tax; the old ~0.6 EUR/m2 monthly fee is retired
11. operator commission → in the rental pool 65% owner / 35% SPV; in the 6% programme nothing is deducted from the 6%
12. taxes / furnishing → property tax yearly; one-off costs at signing itemised by Eglent; furnishing quoted per unit (A212 = +10,400 EUR)
13. leaving the programme and self-renting → OPEN, see above
14. late-delivery penalties → OPEN, see above; the buyer-side 0.1%/day is settled

Only after all fourteen lines does the meeting or viewing get mentioned — and if
the client asked for one, offer it warmly and escalate.

`;

let src = fs.readFileSync(KB, 'utf8');
if (src.includes(MARKER)) { console.log('knowledge/contract-questions.md already up to date — nothing written.'); process.exit(0); }
if (!src.includes(ANCHOR)) throw new Error('anchor not found in knowledge/contract-questions.md — aborting without writing.');
src = src.replace(ANCHOR, BLOCK + ANCHOR);
if (checkOnly) { console.log('--check: knowledge/contract-questions.md WOULD be patched, nothing written.'); process.exit(0); }
fs.writeFileSync(KB, src);
console.log('knowledge/contract-questions.md patched.');
