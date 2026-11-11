// Renders the "## Conflict triage" record the command posts for a run. It reads
// only the values the run already holds and runs no git.

function cell(value) {
  return String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
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
    `- Stop: ${stop ? `${stop.stop}: ${cell(stop.reason)}` : "none"}`,
  ];
  if (stop?.decisionNeeded) {
    lines.push(`- Decision needed: ${cell(stop.decisionNeeded)}`);
  }
  return lines;
}

function conflictRow(conflict, decision = {}) {
  const questions = (decision.questionIds ?? []).join(", ") || "none";
  const cells = [
    `\`${cell(conflict.path)}\``,
    cell(conflict.class),
    cell(decision.decision ?? "none"),
    cell(decision.basis ?? "none"),
    cell(questions),
  ];
  return `| ${cells.join(" | ")} |`;
}

function conflictTable(conflicts, decisions) {
  const decisionByPath = new Map(decisions.map((decision) => [decision.path, decision]));
  return [
    "| Path | Class | Decision | Basis | Questions |",
    "|---|---|---|---|---|",
    ...conflicts.map((conflict) => conflictRow(conflict, decisionByPath.get(conflict.path))),
  ];
}

function answerLine(answer) {
  return `- ${answer.id}: ${cell(answer.fact)} (${cell(answer.citation)})`;
}

function verificationLine(entry) {
  return `- ${cell(entry.name)}: ${cell(entry.result)}`;
}

export function renderTriageRecord({
  trustedHead,
  recordedBase,
  mergeSha = null,
  conflicts = [],
  decisions = [],
  answers = [],
  verification = [],
  stop = null,
}) {
  const lines = [
    ...summaryLines({ trustedHead, recordedBase, mergeSha, stop }),
    "",
    ...conflictTable(conflicts, decisions),
    "",
    "Investigator answers used:",
    ...listOrNone(answers, answerLine),
    "",
    "Verification:",
    ...listOrNone(verification, verificationLine),
  ];
  return `${lines.join("\n")}\n`;
}
