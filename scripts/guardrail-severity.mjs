// How bad is a guardrail violation, really?
//
// validate-learnings.mjs answers "is this candidate acceptable" with a flat
// yes/no, which is the right question for the CI check on a hand edit. The
// nightly learner needs a second question — "is this worth another try?" —
// because the two failure modes are nothing alike:
//
//   soft — the draft is malformed: too long, wrong shape, moved too far in one
//          night. Nothing dangerous is in it. Handing the model back its own
//          output with the specific complaint attached reliably fixes these.
//
//   hard — the draft contains something that must never reach a buyer: a phone
//          number, a retired ROI figure, a frozen price, an instruction
//          smuggled in from a chat. These are deliberately NOT retried. Told to
//          "remove the 8%", a model will cheerfully write "eight percent"
//          instead and sail straight past the regex. The only safe response is
//          to stop and get a human to look.
//
// Anything unrecognised counts as hard, so a rule added later without a
// severity fails closed — which is the direction this pipeline is meant to
// fail in.

const SOFT_RULE_PREFIXES = ['size/', 'structure/', 'churn/', 'empty'];

export function severityOf(rule = '') {
  return SOFT_RULE_PREFIXES.some((p) => rule.startsWith(p)) ? 'soft' : 'hard';
}

/**
 * Wrap a validate() result with severity information.
 * Returns the original fields untouched plus { hard, soft, retryable }.
 */
export function classify(result) {
  const problems = result?.problems || [];
  const hard = problems.filter((p) => severityOf(p.rule) === 'hard');
  const soft = problems.filter((p) => severityOf(p.rule) === 'soft');
  return {
    ...result,
    hard,
    soft,
    // Worth another attempt only when every complaint is mechanical.
    retryable: hard.length === 0 && soft.length > 0,
  };
}
