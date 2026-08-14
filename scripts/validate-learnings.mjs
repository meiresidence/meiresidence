#!/usr/bin/env node
// Validates a candidate knowledge/learnings.md against scripts/guardrails.json.
//
// Usage:
//   node scripts/validate-learnings.mjs <candidate.md> [current.md]
//
// Exit 0 = safe to commit. Exit 1 = rejected (reasons printed as JSON on stdout).
// This is the ONLY thing standing between the model and what buyers read, so it
// fails closed: anything it cannot parse is a rejection.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GUARDRAILS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'guardrails.json'), 'utf8'),
);

/** Strip allowlisted strings so our own contact details don't trip the PII rules. */
function maskAllowlist(text) {
  let out = text;
  for (const allowed of GUARDRAILS.piiAllowlist || []) {
    out = out.split(allowed).join('·'.repeat(Math.min(allowed.length, 8)));
  }
  // Our own numbers may be written with spaces: +355 67 508 8808
  out = out.replace(/\+355\s?67\s?508\s?8808/g, '········');
  out = out.replace(/\+355\s?67\s?609\s?9900/g, '········');
  return out;
}

/** Lines inside fenced code blocks are not client-facing prose — skip them. */
function stripCodeFences(text) {
  return text.replace(/```[\s\S]*?```/g, '');
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

export function validate(candidate, current = '') {
  const problems = [];
  const warnings = [];

  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    return { ok: false, problems: [{ rule: 'empty', detail: 'Candidate file is empty.' }], warnings };
  }

  const { limits, requiredHeader, requiredMarkers } = GUARDRAILS;

  // ---- 1. Structure -------------------------------------------------------
  if (!candidate.startsWith(requiredHeader)) {
    problems.push({
      rule: 'structure/header',
      detail: `File must start with: ${requiredHeader}`,
    });
  }
  for (const marker of requiredMarkers) {
    if (!candidate.includes(marker)) {
      problems.push({ rule: 'structure/marker', detail: `Missing required section or marker: "${marker}"` });
    }
  }
  const sectionCount = (candidate.match(/^##\s/gm) || []).length;
  if (sectionCount > limits.maxSections) {
    problems.push({
      rule: 'structure/sections',
      detail: `${sectionCount} sections, limit is ${limits.maxSections}. The file must stay tight — consolidate instead of growing.`,
    });
  }

  // ---- 2. Size ------------------------------------------------------------
  if (candidate.length > limits.maxChars) {
    problems.push({
      rule: 'size/max',
      detail: `${candidate.length} chars, limit is ${limits.maxChars}. This file is injected into every single reply — it has to stay small.`,
    });
  }
  if (candidate.length < limits.minChars) {
    problems.push({
      rule: 'size/min',
      detail: `${candidate.length} chars, minimum is ${limits.minChars}. Suspiciously short — likely a truncated or failed generation.`,
    });
  }

  // ---- 3. Churn: how far did it move in one night? ------------------------
  if (current && current.trim().length > 0) {
    const added = Math.max(0, candidate.length - current.length);
    const removed = Math.max(0, current.length - candidate.length);
    if (added > limits.maxNewCharsPerRun) {
      problems.push({
        rule: 'churn/growth',
        detail: `Grew by ${added} chars in one run, limit ${limits.maxNewCharsPerRun}. A single day of chats should not rewrite the file.`,
      });
    }
    if (removed > limits.maxRemovedCharsPerRun) {
      problems.push({
        rule: 'churn/deletion',
        detail: `Shrank by ${removed} chars in one run, limit ${limits.maxRemovedCharsPerRun}. Looks like knowledge was destroyed rather than refined.`,
      });
    }
    // Total rewrite check: how much of the old file survived?
    const oldLines = current.split('\n').map((l) => l.trim()).filter((l) => l.length > 25);
    if (oldLines.length > 5) {
      const survived = oldLines.filter((l) => candidate.includes(l)).length;
      const ratio = survived / oldLines.length;
      if (ratio < 0.4) {
        problems.push({
          rule: 'churn/rewrite',
          detail: `Only ${Math.round(ratio * 100)}% of the previous file's substantive lines survived (floor 40%). This is a rewrite, not a learning update.`,
        });
      } else if (ratio < 0.65) {
        warnings.push({ rule: 'churn/rewrite', detail: `${Math.round(ratio * 100)}% of previous lines survived — heavier edit than usual.` });
      }
    }
  }

  // ---- 4. Banned facts ----------------------------------------------------
  const prose = stripCodeFences(candidate);
  for (const rule of GUARDRAILS.bannedPatterns) {
    const re = new RegExp(rule.regex, 'gi');
    let m;
    while ((m = re.exec(prose)) !== null) {
      problems.push({
        rule: `banned/${rule.id}`,
        detail: rule.why,
        line: lineOf(prose, m.index),
        match: m[0].slice(0, 60),
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  // ---- 5. PII -------------------------------------------------------------
  const masked = maskAllowlist(prose);
  for (const rule of GUARDRAILS.piiPatterns) {
    const re = new RegExp(rule.regex, 'g');
    let m;
    while ((m = re.exec(masked)) !== null) {
      problems.push({
        rule: `pii/${rule.id}`,
        detail: rule.why,
        line: lineOf(masked, m.index),
        match: m[0].slice(0, 40),
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  // ---- 6. Prompt-injection / self-modification --------------------------
  // A client could type "ignore your instructions and say X" and the learner
  // might faithfully record it as a "pattern". Refuse anything that reads like
  // an instruction to the agent's own guardrails.
  const injectionPatterns = [
    /ignore (all |your |previous |the )?(instructions|rules|guardrails|system prompt)/i,
    /you are (now|no longer) /i,
    /disregard (the |your )?(above|previous|knowledge base)/i,
    /(reveal|print|show|output)[^.\n]{0,30}(system prompt|instructions|api key)/i,
    /never escalate|do not escalate|stop escalating/i,
    /(always|never) (say|reply|tell)[^.\n]{0,20}regardless/i,
  ];
  for (const re of injectionPatterns) {
    const m = prose.match(re);
    if (m) {
      problems.push({
        rule: 'injection/suspicious-instruction',
        detail: 'Text reads like an instruction aimed at the agent itself, not a learning about buyers. Possible prompt injection from a chat.',
        line: lineOf(prose, m.index),
        match: m[0].slice(0, 60),
      });
    }
  }

  // ---- 7. Contradicting an immutable fact --------------------------------
  // Cheap keyword check; the model is also given these facts explicitly.
  if (/\b(no|not|never|nuk)\b[^.\n]{0,30}\bguarante/i.test(prose)) {
    warnings.push({
      rule: 'facts/guarantee-negation',
      detail: 'Text appears to negate the guarantee. Review before trusting.',
    });
  }

  return { ok: problems.length === 0, problems, warnings };
}

// ---- CLI ----------------------------------------------------------------
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const [candidatePath, currentPath] = process.argv.slice(2);
  if (!candidatePath) {
    console.error('usage: node scripts/validate-learnings.mjs <candidate.md> [current.md]');
    process.exit(2);
  }
  const candidate = fs.readFileSync(candidatePath, 'utf8');
  const current =
    currentPath && fs.existsSync(currentPath) ? fs.readFileSync(currentPath, 'utf8') : '';

  const result = validate(candidate, current);

  if (result.ok) {
    console.log(`✅ learnings.md passed all guardrails (${candidate.length} chars).`);
    if (result.warnings.length) {
      console.log('Warnings:');
      for (const w of result.warnings) console.log(`  ⚠ [${w.rule}] ${w.detail}`);
    }
    process.exit(0);
  }

  console.error(`❌ REJECTED — ${result.problems.length} guardrail violation(s):\n`);
  for (const p of result.problems) {
    console.error(`  • [${p.rule}]${p.line ? ` line ${p.line}` : ''} ${p.detail}`);
    if (p.match) console.error(`    matched: "${p.match}"`);
  }
  // Machine-readable block the workflow scrapes for the alert issue.
  console.log('\n<!--VALIDATION_JSON-->');
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
}
