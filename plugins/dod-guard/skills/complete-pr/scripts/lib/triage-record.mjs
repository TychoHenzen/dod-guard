// Renders the "## Conflict triage" record the command posts for a run. It reads
// only the values the run already holds and runs no git. The record is short by
// design: the judge states each basis once and every decision cites it by id,
// each conflicted path is one line, and lib/handoff-limits.mjs bounds every
// count and line. A record over a limit is refused with the problems, never cut.
import { lineProblem, TRIAGE_LIMITS } from "../../../../lib/handoff-limits.mjs";

// A problem names a line by its first characters, enough to find it in the record.
const LINE_NAME_LENGTH = 40;

function oneLine(value) {
  return String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

function listOrNone(items, render) {
  return items.length === 0 ? ["- none"] : items.map(render);
}

function summaryLines({ trustedHead, recordedBase, mergeSha, stop }) {
  const lines = [
    "## Conflict triage",
    "",
    `- Base: \`${recordedBase}\``,
    `- Trusted head: \`${trustedHead}\``,
    `- Merge: ${mergeSha ? `\`${mergeSha}\`` : "none"}`,
    `- Stop: ${stop ? `${stop.stop}: ${oneLine(stop.reason)}` : "none"}`,
  ];
  if (stop?.decisionNeeded) {
    lines.push(`- Decision needed: ${oneLine(stop.decisionNeeded)}`);
  }
  return lines;
}

function basisLine(basis) {
  return `- ${oneLine(basis.id)}: ${oneLine(basis.text)}`;
}

function conflictLine(conflict, decision = {}) {
  const questions = (decision.questionIds ?? []).map(oneLine).join(", ") || "none";
  const judged = `${oneLine(decision.decision ?? "none")}, basis ${oneLine(decision.basis ?? "none")}`;
  return `- \`${oneLine(conflict.path)}\` (${oneLine(conflict.class)}): ${judged}, questions ${questions}`;
}

function answerLine(answer) {
  return `- ${oneLine(answer.id)}: ${oneLine(answer.fact)} (${oneLine(answer.citation)})`;
}

function verificationLine(entry) {
  return `- ${oneLine(entry.name)}: ${oneLine(entry.result)}`;
}

function countProblems({ conflicts, bases, answers, verification }) {
  return [
    ["conflicted paths", conflicts, TRIAGE_LIMITS.conflicts],
    ["bases", bases, TRIAGE_LIMITS.bases],
    ["investigator answers", answers, TRIAGE_LIMITS.answers],
    ["verification results", verification, TRIAGE_LIMITS.verification],
  ]
    .filter(([, items, limit]) => items.length > limit)
    .map(
      ([label, items, limit]) =>
        `the record has ${items.length} ${label}, over the ${limit} it holds; keep only what the decisions rest on`,
    );
}

function recordLines(input) {
  const { conflicts, bases, decisions, answers, verification } = input;
  const decisionByPath = new Map(decisions.map((decision) => [decision.path, decision]));
  return [
    ...summaryLines(input),
    "",
    "Bases:",
    ...listOrNone(bases, basisLine),
    "",
    "Conflicts:",
    ...listOrNone(conflicts, (conflict) => conflictLine(conflict, decisionByPath.get(conflict.path))),
    "",
    "Investigator answers used:",
    ...listOrNone(answers, answerLine),
    "",
    "Verification:",
    ...listOrNone(verification, verificationLine),
  ];
}

// Returns { text } with the record, else { ok: false, problems } naming each
// count and line over its limit, so the caller writes those parts shorter.
export function buildTriageRecord({
  trustedHead,
  recordedBase,
  mergeSha = null,
  conflicts = [],
  bases = [],
  decisions = [],
  answers = [],
  verification = [],
  stop = null,
}) {
  const input = { trustedHead, recordedBase, mergeSha, conflicts, bases, decisions, answers, verification, stop };
  const lines = recordLines(input);
  const problems = [
    ...countProblems(input),
    ...lines.map((line) =>
      lineProblem(`the record line "${line.slice(0, LINE_NAME_LENGTH)}"`, line, TRIAGE_LIMITS.line),
    ),
  ].filter(Boolean);
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  return { text: `${lines.join("\n")}\n` };
}
