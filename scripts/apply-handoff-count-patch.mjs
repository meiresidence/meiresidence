// Applies scripts/handoff-count.patch — the 8 Sep 2026 handoff-counting fix.
//
// WHY THIS EXISTS. The timing gate of 30 Aug (no handoff before the client's
// third message) is right and stays exactly as it is. What was wrong is what it
// COUNTED. buildThread merges consecutive client messages into ONE turn (the
// Messages API needs alternating roles), and people write on WhatsApp in bursts,
// so every real conversation was counted short and the gate refused handoffs
// that were not early at all. Brahim Selmani, 8 Sep 2026: two messages in
// eighteen seconds, then a third asking the price per m2 — the gate counted 2
// of 3, refused, tagged nothing, alerted nobody, and the agent told him a Mei
// specialist would contact him anyway. He was never tagged needs-human.
//
// The patch does two things:
//   1. src/thread.js returns clientMessageCount (messages counted one by one)
//      and the gate uses that instead of merged turns.
//   2. A refused handoff is remembered on the contact as `handoff-deferred` and
//      fires by itself on a later message, once the wait is over — the model
//      asks for a specialist once, and never asks again after a refusal.
//
// Run it from the Actions tab: "Apply patch script" -> apply-handoff-count-patch.mjs
import { execFileSync } from 'node:child_process';

const PATCH = 'scripts/handoff-count.patch';
const CHECK = process.argv.includes('--check');

const git = (args, opts = {}) => execFileSync('git', args, { stdio: 'inherit', ...opts });

// Already applied? Then the reverse patch is the one that applies cleanly.
try {
  execFileSync('git', ['apply', '--reverse', '--check', PATCH], { stdio: 'ignore' });
  console.log('nothing to do — already applied');
  process.exit(0);
} catch {
  // not applied yet, carry on
}

git(['apply', '--check', PATCH]);
if (CHECK) {
  console.log('--check: the patch applies cleanly, nothing written');
  process.exit(0);
}

git(['apply', PATCH]);
console.log('patched: index.js, src/thread.js, scripts/test-handoff-turn-count.mjs (new)');
