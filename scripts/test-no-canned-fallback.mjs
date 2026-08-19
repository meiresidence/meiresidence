// Regression test for the "Borys" failure (19 Aug 2026).
//
// A broker-buyer sent two real messages ("apartament me pamje nga deti...",
// price list, meeting request). Both times the model produced no usable text
// and the agent sent the canned line "Faleminderit per mesazhin! Si mund t'ju
// ndihmoj per Mei Residence?" — a reply that looks normal, answers nothing,
// applies no tag and alerts nobody. The lead sat cold until a human noticed.
//
// This test does not call the model. It asserts the properties of index.js
// that make a repeat impossible:
//   1. The generic canned fallback line is gone.
//   2. An empty model reply is retried once with a bigger output budget.
//   3. A failed generation routes through handleGenerationFailure, which
//      tags needs-human + agent-error and alerts the specialist.
//   4. Empty text blocks can no longer count as a reply.
//   5. Thrown Claude errors reach the same failure handler instead of being
//      swallowed silently.
//   6. The failure handler still respects the not-a-lead guard, so a vendor
//      pitch hitting an outage cannot wake a specialist.
import fs from 'fs';

const root = new URL('../', import.meta.url);
const index = fs.readFileSync(new URL('index.js', root), 'utf8');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failures++;
};

// 1. The canned greeting that masked the failure must not exist anywhere as a
//    reply value. (Both apostrophe variants.)
const canned = /Si mund t[’']ju ndihmoj per Mei Residence\?/;
const asFallbackAssignment = /finalText\s*=\s*(?:escalated[^;]*)?['`][^'`]*Si mund t[’']ju ndihmoj/;
check('generic canned fallback assignment is gone', !asFallbackAssignment.test(index));

// 2. Empty replies retry once with a raised budget.
check('empty reply retries with a bigger max_tokens', /empty reply[^\n]*retrying once with max_tokens/.test(index) && /Math\.max\(2048/.test(index));

// 3. Failure handler exists, tags, and alerts.
check('handleGenerationFailure exists', /async function handleGenerationFailure\(/.test(index));
check('failure path tags needs-human + agent-error', /addTags\(contactId,\s*\['needs-human',\s*'agent-error'\]\)/.test(index));
check('failure path alerts the specialist', /AGENT ERROR - reply failed/.test(index));
check('webhook routes empty reply to the failure handler', /handleGenerationFailure\(contactId,\s*name,\s*channel,\s*failReason\)/.test(index));

// 4. Whitespace/empty text blocks cannot count as a reply.
check('usableText filters empty text blocks', /const usableText =/.test(index) && /filter\(Boolean\)/.test(index.slice(index.indexOf('const usableText'), index.indexOf('const usableText') + 400)));

// 5. Thrown generation errors are caught around generateReply specifically,
//    not only by the outer webhook catch (which sends nothing).
check('generateReply is wrapped in its own try/catch', /try\s*\{\s*const out = await generateReply/.test(index));

// 6. The escalated fallback (an honest promise — tags did fire) is still there.
check('escalated fallback line survives', /Nje specialist i Mei Residence do t[’']ju kontaktoje shume shpejt/.test(index));

// 7. Failure handler respects the not-a-lead guard.
const hgfStart = index.indexOf('async function handleGenerationFailure');
const hgf = index.slice(hgfStart, hgfStart + 2500);
check('failure handler checks looksLikeNonBuyerOutreach before waking anyone', /looksLikeNonBuyerOutreach\(clientWords\)/.test(hgf));

// 8. The holding line is honest: it promises a person, which the handler just
//    arranged, and never claims to answer the question.
check('holding line promises a colleague, not an answer', /koleg nga Mei Residence do t[’']ju pergjigjet personalisht/.test(hgf));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
