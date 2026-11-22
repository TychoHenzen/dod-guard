#!/usr/bin/env node
// The deterministic half of the wiring-audit workflow. A read-only session
// writes findings.json; this script holds it to the skill's rules and renders
// the report in the skill's own shape.
//
//   check --dir --repo    validate findings.json against the checkout. Prints
//                         PASS and writes report.md, or prints RETRY and
//                         writes feedback.md with every problem found.
//
// Exit 2 on any error.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../archon-shared/scripts/cli.mjs";
import {
  checkFindings,
  citationProblem,
  clause,
  filesContaining,
  formatCitation,
  nonEmptyText,
  textList,
} from "../../archon-shared/scripts/evidence.mjs";

export const BOUNDARIES = ["user-facing", "unverified", "not applicable"];
export const TAGS = ["required", "optional", "unverified"];
export const STATUSES = ["verified", "missing", "contradicted", "unverified", "not applicable"];
export const STAGES = [
  ["discovery", "Discovery"],
  ["setup", "Setup"],
  ["entry", "Entry point"],
  ["inputs", "Inputs"],
  ["result", "Result"],
  ["failure", "Failure"],
  ["recovery", "Recovery"],
];

function citations(repo, list, where, problems) {
  if (!Array.isArray(list)) {
    problems.push(`${where}: evidence must be a list of citations`);
    return;
  }
  for (const cite of list) {
    const problem = citationProblem(repo, cite);
    if (problem) {
      problems.push(`${where}: ${problem}`);
    }
  }
}

function checkMissing(repo, finding, where, problems) {
  const searched = finding.searched ?? {};
  if (!textList(searched.identifiers) || searched.identifiers.length === 0) {
    problems.push(`${where}: a missing surface needs searched.identifiers, the names you grepped for`);
    return;
  }
  if (!textList(searched.paths) || searched.paths.length === 0) {
    problems.push(`${where}: a missing surface needs searched.paths, every location you searched`);
    return;
  }
  const absent = searched.paths.filter((path) => !existsSync(join(repo, path)));
  if (absent.length > 0) {
    problems.push(
      `${where}: ${absent.join(", ")} does not exist, so it proves nothing; ` +
        "drop it from searched.paths, or mark the surface unverified when no searchable location is left",
    );
    return;
  }
  for (const id of searched.identifiers) {
    const hits = filesContaining(repo, id, searched.paths);
    if (hits.length > 0) {
      problems.push(
        `${where}: '${id}' appears in ${hits.join(", ")}, so the surface is not missing there; ` +
          "read those files and judge again",
      );
    }
  }
}

function checkFinding(repo, finding, index, problems) {
  const where = `finding ${index + 1} (${finding?.surface ?? "no surface"})`;
  if (!finding || typeof finding !== "object") {
    problems.push(`${where}: must be an object`);
    return;
  }
  if (!TAGS.includes(finding.tag)) {
    problems.push(`${where}: tag must be one of ${TAGS.join(", ")}`);
  }
  if (!STATUSES.includes(finding.status)) {
    problems.push(`${where}: status must be one of ${STATUSES.join(", ")}`);
  }
  for (const field of ["surface", "impact", "limits", "next", "verification"]) {
    if (!nonEmptyText(finding[field])) {
      problems.push(`${where}: ${field} must be non-empty text`);
    }
  }
  citations(repo, finding.evidence ?? [], where, problems);
  if (["verified", "contradicted"].includes(finding.status) && (finding.evidence ?? []).length === 0) {
    problems.push(`${where}: a ${finding.status} surface needs at least one citation`);
  }
  if (finding.status === "missing") {
    checkMissing(repo, finding, where, problems);
  }
}

export function validate(repo, audit) {
  const problems = [];
  for (const field of ["user", "task", "boundaryNote"]) {
    if (!nonEmptyText(audit[field])) {
      problems.push(`${field} must be non-empty text`);
    }
  }
  if (!BOUNDARIES.includes(audit.boundary)) {
    problems.push(`boundary must be one of ${BOUNDARIES.join(", ")}`);
  }
  citations(repo, audit.boundaryEvidence ?? [], "boundary", problems);
  if (audit.boundary === "not applicable" && (audit.boundaryEvidence ?? []).length === 0) {
    problems.push("boundary: 'not applicable' needs repository evidence that the behavior is intentionally internal");
  }
  for (const [key, label] of STAGES) {
    if (!nonEmptyText(audit.stages?.[key])) {
      problems.push(`stages.${key} (${label}) must say what coverage was verified, or why none applies`);
    }
  }
  if (!Array.isArray(audit.findings)) {
    problems.push("findings must be a list");
  } else {
    audit.findings.forEach((finding, index) => {
      checkFinding(repo, finding, index, problems);
    });
  }
  return problems;
}

function limitsLine(finding) {
  if (finding.status !== "missing") {
    return finding.limits;
  }
  const { identifiers, paths } = finding.searched;
  return `${finding.limits} Searched for ${identifiers.join(", ")} in ${paths.join(", ")}.`;
}

export function render(audit) {
  const lines = [
    "## Wiring audit",
    `Intended user and task: ${clause(audit.user)}; ${clause(audit.task)}.`,
    `Boundary: ${audit.boundary} - ${audit.boundaryNote}`,
    "",
    "### Stage coverage",
    ...STAGES.map(([key, label]) => `- ${label}: ${audit.stages[key]}`),
    "",
    "### Findings",
  ];
  const ordered = TAGS.flatMap((tag) => audit.findings.filter((finding) => finding.tag === tag));
  if (ordered.length === 0) {
    lines.push("- None.");
  }
  for (const finding of ordered) {
    const evidence = finding.evidence?.length ? finding.evidence.map(formatCitation).join("; ") : "none";
    lines.push(
      `- [${finding.tag}] ${finding.surface} - ${finding.status}`,
      `  Impact: ${finding.impact}`,
      `  Evidence: ${evidence}`,
      `  Evidence limits: ${limitsLine(finding)}`,
      `  Minimal next action: ${finding.next}`,
      `  Verification: ${finding.verification}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function check({ dir, repo }) {
  return checkFindings({ dir, repo, validate, render });
}

runCli({ url: import.meta.url, name: "wiring", required: ["dir", "repo"], commands: { check } });
