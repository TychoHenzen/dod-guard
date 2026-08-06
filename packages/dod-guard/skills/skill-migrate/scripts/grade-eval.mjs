#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    sandbox: { type: "string" },
    actions: { type: "string" },
    case: { type: "string" },
    out: { type: "string" },
  },
});

if (!values.actions || !values.case) {
  process.stderr.write("Usage: grade-eval.mjs --actions=<path> --case=<path> [--sandbox=<dir>] [--out=<path>]\n");
  process.exit(3);
}

const actions = JSON.parse(readFileSync(values.actions, "utf-8"));
const evalCase = JSON.parse(readFileSync(values.case, "utf-8"));
const sandbox = values.sandbox;

function matchesAction(action, tool, needle) {
  return action.tool === tool && (!needle || JSON.stringify(action.args).includes(needle));
}

function findAction(tool, needle) {
  return actions.findIndex((a) => matchesAction(a, tool, needle));
}

function label(tool, needle) {
  return needle ? `${tool} with "${needle}"` : tool;
}

function checkToolCall(assertion) {
  const idx = findAction(assertion.tool, assertion.args_contain);
  const want = assertion.type === "tool_called";
  const found = idx !== -1;
  return {
    text: `${label(assertion.tool, assertion.args_contain)} ${want ? "called" : "NOT called"}`,
    passed: want === found,
    evidence: found ? `Found at action index ${idx}` : `No match in ${actions.length} actions`,
  };
}

function parseToolSpec(spec) {
  const colon = spec.indexOf(":");
  if (colon === -1) return { tool: spec, arg: null };
  return { tool: spec.slice(0, colon), arg: spec.slice(colon + 1) };
}

function checkToolOrder(assertion) {
  const first = parseToolSpec(assertion.before);
  const second = parseToolSpec(assertion.after);
  const firstIdx = findAction(first.tool, first.arg);
  const secondIdx = findAction(second.tool, second.arg);

  if (firstIdx === -1 || secondIdx === -1) {
    const missing = firstIdx === -1 ? first.tool : second.tool;
    return { text: `${assertion.before} before ${assertion.after}`, passed: false, evidence: `${missing} not found` };
  }

  return {
    text: `${assertion.before} before ${assertion.after}`,
    passed: firstIdx < secondIdx,
    evidence: `${first.tool} at ${firstIdx}, ${second.tool} at ${secondIdx}`,
  };
}

function checkToolCount(assertion) {
  const count = actions.filter((a) => matchesAction(a, assertion.tool, assertion.args_contain)).length;
  const lo = assertion.min ?? 0;
  const hi = assertion.max ?? Infinity;
  return {
    text: `${assertion.tool} call count ${lo}-${hi === Infinity ? "inf" : hi}`,
    passed: count >= lo && count <= hi,
    evidence: `Found ${count} matching calls`,
  };
}

function gitDiff(path) {
  try {
    return execSync(`git diff HEAD -- "${path}"`, { cwd: sandbox, encoding: "utf-8" });
  } catch {
    return null;
  }
}

function checkFileModified(assertion) {
  const diff = gitDiff(assertion.path);
  if (diff === null) return { text: `${assertion.path} was modified`, passed: false, evidence: "git diff failed" };
  const modified = diff.trim().length > 0;
  return {
    text: `${assertion.path} was modified`,
    passed: modified,
    evidence: modified ? `Diff: ${diff.slice(0, 200)}` : "No changes detected",
  };
}

function checkFileNotModified(assertion) {
  const diff = gitDiff(assertion.path);
  if (diff === null) return { text: `${assertion.path} was NOT modified`, passed: true, evidence: "git diff failed" };
  const clean = diff.trim().length === 0;
  return {
    text: `${assertion.path} was NOT modified`,
    passed: clean,
    evidence: clean ? "No changes" : `Unexpected diff: ${diff.slice(0, 200)}`,
  };
}

function checkFileCreated(assertion) {
  const exists = existsSync(join(sandbox, assertion.path));
  return { text: `${assertion.path} was created`, passed: exists, evidence: exists ? "File exists" : "File not found" };
}

function checkFileContent(assertion, expectPresent) {
  const filePath = join(sandbox, assertion.path);
  const label = expectPresent ? "contains" : "does NOT contain";
  if (!existsSync(filePath)) {
    return { text: `${assertion.path} ${label} "${assertion.string}"`, passed: !expectPresent, evidence: "File not found" };
  }
  const found = readFileSync(filePath, "utf-8").includes(assertion.string);
  const passed = expectPresent ? found : !found;
  const evidence = found ? (expectPresent ? "String found" : "String found (should be absent)") : (expectPresent ? "String not found" : "String absent (correct)");
  return { text: `${assertion.path} ${label} "${assertion.string}"`, passed, evidence };
}

const repoCheckers = {
  file_modified: checkFileModified,
  file_not_modified: checkFileNotModified,
  file_created: checkFileCreated,
  file_contains: (a) => checkFileContent(a, true),
  file_not_contains: (a) => checkFileContent(a, false),
};

function checkRepoState(assertion) {
  if (!sandbox) {
    return { text: `${assertion.type}: ${assertion.path}`, passed: false, evidence: "No sandbox directory provided" };
  }
  const checker = repoCheckers[assertion.type];
  if (!checker) {
    return { text: `Unknown assertion: ${assertion.type}`, passed: false, evidence: "Not implemented" };
  }
  return checker(assertion);
}

const toolCheckers = {
  tool_called: checkToolCall,
  tool_not_called: checkToolCall,
  tool_order: checkToolOrder,
  tool_count: checkToolCount,
};

const expectations = [];
for (const a of evalCase.assertions?.tool_calls ?? []) {
  const checker = toolCheckers[a.type];
  if (checker) expectations.push(checker(a));
}
for (const a of evalCase.assertions?.repo_state ?? []) {
  expectations.push(checkRepoState(a));
}

const passed = expectations.filter((e) => e.passed).length;
const failed = expectations.filter((e) => !e.passed).length;

const grading = {
  expectations,
  summary: {
    passed,
    failed,
    total: expectations.length,
    pass_rate: expectations.length > 0 ? passed / expectations.length : 0,
  },
  execution_metrics: {
    tool_calls: {},
    total_tool_calls: actions.length,
    total_steps: actions.length,
    errors_encountered: actions.filter((a) => a.is_error).length,
  },
};

for (const a of actions) {
  grading.execution_metrics.tool_calls[a.tool] = (grading.execution_metrics.tool_calls[a.tool] || 0) + 1;
}

const output = JSON.stringify(grading, null, 2);

if (values.out) {
  writeFileSync(values.out, output + "\n");
} else {
  process.stdout.write(output + "\n");
}

process.exit(failed > 0 ? 1 : 0);
