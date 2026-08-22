// Regression test for the "concrete questions get a holding line" failure
// (22 Aug 2026).
//
// A serious buyer sent ~20 concrete questions — send me the sales contract and
// the management contract, what do I actually receive per year on 171,000 EUR at
// 6%, when do I legally become the owner, what is 5% of 171,000, give me the
// current price of B103, which 2+1 are free, why does it open in June 2027 —
// and every one of them came back as:
//
//   "Faleminderit per mesazhin tuaj! Nje koleg nga Mei Residence do t'ju
//    pergjigjet personalisht shume shpejt."
//
// That line lives in exactly ONE place: handleGenerationFailure. So generation
// was failing, not the knowledge. Root cause: a reply cut off at max_tokens
// (ANTHROPIC_MAX_TOKENS was 600) can carry a half-written tool_use block. The
// loop broke out without ever writing a matching tool_result, that fragment was
// stored in the contact's history, and from then on EVERY message from that
// contact was rejected by the API with
//   400 tool_use ids were found without tool_result blocks
// so the same holding line fired forever.
//
// This test calls no model. It asserts the three defences are in place, that
// the history helpers actually behave, and that the questions now have answers.
import fs from 'fs';
import { sanitizeHistory, dropIncompleteToolUse } from '../src/conversation.js';

const root = new URL('../', import.meta.url);
const index = fs.readFileSync(new URL('index.js', root), 'utf8');
const kb = fs.readFileSync(new URL('knowledge.md', root), 'utf8');
const qa = fs.readFileSync(new URL('knowledge/contract-questions.md', root), 'utf8');
const env = fs.readFileSync(new URL('.env.example', root), 'utf8');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`);
  if (!ok) failures++;
};

// --- 1. A truncated tool call never enters the history ----------------------
const truncated = [
  { type: 'text', text: 'Sigurisht, po e shikoj A114...' },
  { type: 'tool_use', id: 'toolu_1', name: 'escalate_to_agent', input: {} },
];
check('dropIncompleteToolUse removes the half-written tool call, keeps the text',
  dropIncompleteToolUse(truncated).length === 1 &&
  dropIncompleteToolUse(truncated)[0].type === 'text');

// --- 2. A history already poisoned heals itself on the next message ---------
const poisoned = [
  { role: 'user', content: 'A eshte i lire A114?' },
  { role: 'assistant', content: truncated },          // <- the fragment that broke everything
  { role: 'user', content: 'Me dergo edhe kontraten e shitjes' },
];
const clean = sanitizeHistory(poisoned);
const flat = clean.flatMap((m) => (Array.isArray(m.content) ? m.content : [{ type: 'text' }]));
check('sanitizeHistory drops a tool_use that has no tool_result',
  !flat.some((b) => b.type === 'tool_use'));
check('sanitizeHistory keeps a complete tool_use + tool_result pair',
  sanitizeHistory([
    { role: 'user', content: 'ku ka markete?' },
    { role: 'assistant', content: [{ type: 'tool_use', id: 't9', name: 'find_places', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't9', content: '{}' }] },
  ]).some((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use')));
check('sanitizeHistory drops an orphan tool_result',
  !sanitizeHistory([
    { role: 'user', content: 'hi' },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'ghost', content: '{}' }] },
  ]).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).some((b) => b.type === 'tool_result'));
check('sanitizeHistory never starts with an assistant turn',
  sanitizeHistory([{ role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
                   { role: 'user', content: 'ok' }])[0].role === 'user');
check('sanitizeHistory does not mutate the stored history',
  poisoned[1].content.length === 2);

// --- 3. The wiring in index.js ---------------------------------------------
check('the loop sanitises the history before every call',
  /sanitizeHistory\(conv\.history\)/.test(index));
check('a truncated tool_use triggers a bigger-budget retry',
  /stop_reason === 'max_tokens' && resp\.content\.some\(\(b\) => b\.type === 'tool_use'\)/.test(index));
check('a failed loop gets one clean retry before waking a human',
  /runToolLoop/.test(index) && /withTools: false/.test(index) && /conv\.history\.length = 0/.test(index));
check('the token budget has a floor, not just a default',
  /Math\.max\(2048, parseInt\(process\.env\.ANTHROPIC_MAX_TOKENS/.test(index));
check('.env.example no longer ships the 600-token budget', !/ANTHROPIC_MAX_TOKENS=600/.test(env));

// --- 4. The questions themselves now have answers --------------------------
check('the contract Q&A is loaded into the prompt',
  /contract-questions\.md/.test(index) && /CONTRACT & MONEY ANSWERS/.test(index));
check('the agent is told to do the arithmetic itself',
  /DO THE ARITHMETIC/.test(index));
check('6% is defined as calculated on the investment amount',
  /investment amount/.test(qa) && /10,260/.test(qa));
check('5% of 171,000 is worked out for the agent', /8,550/.test(qa));
check('B103 and A114 are answerable from the inventory',
  /B103\/2\+1/.test(kb) && /A114\/2\+1/.test(kb));
check('the Q4 2026 vs June 2027 question has an answer',
  /opens June 2027/.test(qa) && /not a contradiction/.test(qa));
check('nothing invents a clause: the not-settled list names Eglent as the step',
  /Not settled yet/.test(qa) && /never "someone will contact you"|never "dikush do të të kontaktojë"|never "dikush do të kontaktojë"/i.test(qa));
check('the stale 0.6 EUR/m2 fee is quarantined until confirmed',
  /Do not quote the old\s*\n?\s*"~0\.6 EUR\/m2 monthly administration fee"/.test(qa.replace(/\*\*/g, '')));

// --- 5. The holding line stays for real failures only -----------------------
check('the holding line still exists for genuine generation failures',
  /koleg nga Mei Residence do t[’']ju pergjigjet personalisht/.test(index));
// Ignore the comment block at the top of index.js, which quotes the line while
// explaining the bug — only executable code counts.
const code = index.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
check('it is only reachable from handleGenerationFailure',
  code.split('koleg nga Mei Residence').length - 1 === 1 &&
  code.indexOf('koleg nga Mei Residence') > code.indexOf('async function handleGenerationFailure'));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
