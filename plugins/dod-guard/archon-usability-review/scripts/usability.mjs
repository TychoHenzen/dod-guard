#!/usr/bin/env node
// The deterministic half of the usability-review workflow. A read-only
// session writes findings.json; this script holds it to the skill's rules and
// renders the report in the skill's own shape.
//
//   check --dir --repo    validate findings.json against the checkout. Prints
//                         PASS and writes report.md, or prints RETRY and
//                         writes feedback.md with every problem found.
//
// The workflow has no browser, so nothing here can be observed live: every
// observation must cite a file in the checkout, and a GUI review always lists
// the running interface as unavailable evidence.
//
// Exit 2 on any error.
import { runCli } from "../../archon-shared/scripts/cli.mjs";
import {
  checkFindings,
  citationProblem,
  clause,
  formatCitation,
  nonEmptyText,
  textList,
} from "../../archon-shared/scripts/evidence.mjs";

export const SURFACES = ["CLI", "API", "docs", "GUI", "other"];
export const SEVERITIES = ["high", "medium", "low"];
export const JOURNEY = [
  ["discoverability", "discoverability"],
  ["wording", "hierarchy and wording"],
  ["affordances", "affordances and input burden"],
  ["progress", "progress and empty states"],
  ["success", "success and feedback"],
  ["error", "error and recovery"],
];
export const ACCESSIBILITY = [
  ["semantics", "semantic structure"],
  ["names", "accessible names and labels"],
  ["keyboard", "keyboard operation"],
  ["focus", "visible focus"],
  ["contrast", "contrast"],
  ["target", "target size"],
  ["responsive", "responsive behavior"],
  ["motion", "reduced motion"],
];
export const TRUST = [
  ["consent", "consent"],
  ["disclosure", "disclosure"],
  ["cost", "cost"],
  ["uncertainty", "uncertainty"],
  ["verification", "verification"],
  ["undo", "undo"],
  ["control", "control over generated changes and external actions"],
];
export const NO_BROWSER = "a running interface: this workflow has no browser, so no live state was observed";
// A verdict in place of a measured or observed value.
const VERDICT = /^\s*(pass(es|ed)?|ok(ay)?|fine|good|no issues?( found)?|none)\s*\.?\s*$/i;

function citations(repo, list, where, problems, { required }) {
  if (!Array.isArray(list) || (required && list.length === 0)) {
    problems.push(`${where}: needs at least one citation`);
    return;
  }
  for (const cite of list) {
    const problem = citationProblem(repo, cite);
    if (problem) {
      problems.push(`${where}: ${problem}`);
    }
  }
}

// One journey question, accessibility check or trust cue.
function checkItem(repo, item, where, problems, { states }) {
  if (!item || !states.includes(item.status)) {
    problems.push(`${where}: status must be one of ${states.join(", ")}`);
    return;
  }
  if (item.status !== "covered") {
    return;
  }
  if (!nonEmptyText(item.note)) {
    problems.push(`${where}: a covered item needs a note saying what the evidence shows`);
  } else if (VERDICT.test(item.note)) {
    problems.push(`${where}: '${item.note}' is a verdict; give the measured or observed value`);
  }
  citations(repo, item.evidence, where, problems, { required: true });
}

function checkGroup(repo, group, table, name, problems, states) {
  if (!group || typeof group !== "object") {
    problems.push(`${name} must be an object keyed by ${table.map(([key]) => key).join(", ")}`);
    return;
  }
  for (const [key, label] of table) {
    checkItem(repo, group[key], `${name}.${key} (${label})`, problems, { states });
  }
}

function checkFinding(repo, finding, index, problems) {
  const where = `finding ${index + 1} (${finding?.title ?? "no title"})`;
  if (!finding || typeof finding !== "object") {
    problems.push(`${where}: must be an object`);
    return;
  }
  if (!SEVERITIES.includes(finding.severity)) {
    problems.push(`${where}: severity must be one of ${SEVERITIES.join(", ")}`);
  }
  for (const field of ["title", "impact", "change", "verification"]) {
    if (!nonEmptyText(finding[field])) {
      problems.push(`${where}: ${field} must be non-empty text`);
    }
  }
  citations(repo, finding.evidence, where, problems, { required: true });
}

function checkHeader(review, problems) {
  for (const field of ["user", "task", "outcome"]) {
    if (!nonEmptyText(review[field])) {
      problems.push(`${field} must be non-empty text`);
    }
  }
  if (!SURFACES.includes(review.surface)) {
    problems.push(`surface must be one of ${SURFACES.join(", ")}`);
  }
  for (const field of ["evidenceUsed", "evidenceUnavailable"]) {
    if (!textList(review[field])) {
      problems.push(`${field} must be a list of text, empty when there is none`);
    }
  }
}

const OBSERVED = ["covered", "not observed"];

function checkAccessibility(repo, review, problems) {
  if (review.surface === "GUI") {
    checkGroup(repo, review.accessibility, ACCESSIBILITY, "accessibility", problems, OBSERVED);
  } else if (review.accessibility !== undefined) {
    problems.push(
      "accessibility: a CLI, API, document or other surface gets no visual checks; " +
        "put its clarity and operability under journey",
    );
  }
}

function checkTrust(repo, review, problems) {
  if (typeof review.usesAi !== "boolean") {
    problems.push("usesAi must be true or false");
  } else if (review.usesAi) {
    checkGroup(repo, review.trust, TRUST, "trust", problems, OBSERVED);
  } else if (review.trust !== undefined) {
    problems.push("trust: leave AI trust cues out when the feature does not use AI");
  }
}

export function validate(repo, review) {
  const problems = [];
  checkHeader(review, problems);
  checkGroup(repo, review.journey, JOURNEY, "journey", problems, [...OBSERVED, "inapplicable"]);
  checkAccessibility(repo, review, problems);
  checkTrust(repo, review, problems);
  if (!Array.isArray(review.findings)) {
    problems.push("findings must be a list");
  } else {
    review.findings.forEach((finding, index) => {
      checkFinding(repo, finding, index, problems);
    });
  }
  return problems;
}

function groups(review) {
  const list = [["journey", JOURNEY]];
  if (review.surface === "GUI") {
    list.push(["accessibility", ACCESSIBILITY]);
  }
  if (review.usesAi) {
    list.push(["trust", TRUST]);
  }
  return list.flatMap(([name, table]) => table.map(([key, label]) => ({ label, item: review[name][key] })));
}

function joined(values) {
  return values.length > 0 ? values.join("; ") : "none";
}

function labelsWith(items, status) {
  return joined(items.filter(({ item }) => item.status === status).map(({ label }) => label));
}

export function render(review) {
  const items = groups(review);
  const unavailable = [...review.evidenceUnavailable];
  if (review.surface === "GUI") {
    unavailable.push(NO_BROWSER);
  }
  const covered = items
    .filter(({ item }) => item.status === "covered")
    .map(({ label, item }) => `- ${label}: ${clause(item.note)} (${item.evidence.map(formatCitation).join(", ")})`);
  const who = `${clause(review.user)}, who wants to ${clause(review.task)}`;
  const lines = [
    "## Usability review",
    "",
    `Intended user and task: ${who}. They expect ${clause(review.outcome)}.`,
    `Surface: ${review.surface}`,
    `Evidence used: ${joined(review.evidenceUsed)}`,
    `Evidence unavailable: ${joined(unavailable)}`,
    `Not observed: ${labelsWith(items, "not observed")}`,
    `Inapplicable states: ${labelsWith(items, "inapplicable")}`,
    "",
    "### Covered",
    "",
    ...(covered.length > 0 ? covered : ["- None."]),
    "",
    "### Findings",
    "",
  ];
  const ordered = SEVERITIES.flatMap((severity) => review.findings.filter((finding) => finding.severity === severity));
  if (ordered.length === 0) {
    lines.push("- None.");
  }
  for (const finding of ordered) {
    lines.push(
      `- [${finding.severity}] ${finding.title}`,
      `  Impact: ${finding.impact}`,
      `  Evidence: ${finding.evidence.map(formatCitation).join("; ")}`,
      `  Minimal change: ${finding.change}`,
      `  Verification: ${finding.verification}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function check({ dir, repo }) {
  return checkFindings({ dir, repo, validate, render });
}

runCli({ url: import.meta.url, name: "usability", required: ["dir", "repo"], commands: { check } });
