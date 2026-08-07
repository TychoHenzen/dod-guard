#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "run-a": { type: "string" },
    "run-b": { type: "string" },
    out: { type: "string" },
  },
});

if (!values["run-a"] || !values["run-b"]) {
  process.stderr.write("Usage: diff-runs.mjs --run-a=<dir> --run-b=<dir> [--out=<path>]\n");
  process.stderr.write("Each dir needs transcript.jsonl and optionally a sandbox/ with git state.\n");
  process.exit(3);
}

const RESULT_LIMIT = 500;

function tryParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function parseTranscript(path) {
  const text = readFileSync(path, "utf-8");
  return text
    .split("\n")
    .map((line) => (line.trim() ? tryParse(line) : null))
    .filter(Boolean);
}

function resultText(block) {
  if (Array.isArray(block.content)) return block.content.map((p) => p?.text ?? "").join(" ");
  return String(block.content ?? "");
}

function shorten(text, limit) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}...` : flat;
}

function collectToolUses(record) {
  const content = record.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((b) => b.type === "tool_use");
}

function collectToolResults(record) {
  const content = record.message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((b) => b.type === "tool_result");
}

function applyResult(actions, id, block) {
  const match = actions.findLast((a) => a.id === id);
  if (!match) return;
  match.exit_code = block.exit_code ?? match.exit_code;
  match.is_error = block.is_error ?? match.is_error;
  if (!match.result && block.content) {
    match.result = shorten(resultText(block), RESULT_LIMIT);
  }
}

function extractActions(records) {
  const actions = [];
  let index = 0;

  for (const record of records) {
    if (record.type === "assistant") {
      for (const block of collectToolUses(record)) {
        actions.push({
          index: index++,
          tool: block.name,
          id: block.id,
          args: block.input ?? {},
          exit_code: null,
          is_error: false,
          result: null,
        });
      }
    }

    if (record.type === "user") {
      for (const block of collectToolResults(record)) {
        applyResult(actions, block.tool_use_id, block);
      }
    }

    if (record.type === "tool_result" || record.type === "result") {
      applyResult(actions, record.tool_use_id, record);
    }
  }

  return actions;
}

function digestArg(tool, args) {
  const digestors = {
    Bash: (a) => a.command,
    Read: (a) => a.file_path,
    Write: (a) => a.file_path,
    Edit: (a) => a.file_path,
    Glob: (a) => a.pattern,
    Grep: (a) => a.pattern,
    Skill: (a) => `${a.skill ?? ""} ${a.args ?? ""}`,
    Agent: (a) => `${a.subagent_type ?? "?"} - ${a.description ?? ""}`,
  };
  const pick = digestors[tool];
  return pick ? shorten(pick(args ?? {}), 200) : shorten(JSON.stringify(args ?? {}), 200);
}

function repoState(sandboxDir) {
  if (!sandboxDir || !existsSync(sandboxDir)) return null;
  try {
    const nameStatus = execSync("git diff HEAD --name-status", { cwd: sandboxDir, encoding: "utf-8" }).trim();
    const diff = execSync("git diff HEAD", { cwd: sandboxDir, encoding: "utf-8" }).trim();
    const untracked = execSync("git ls-files --others --exclude-standard", { cwd: sandboxDir, encoding: "utf-8" }).trim();

    const files = {};
    for (const line of nameStatus.split("\n").filter(Boolean)) {
      const [status, ...parts] = line.split("\t");
      files[parts.join("\t")] = { status, diff: "" };
    }
    for (const path of untracked.split("\n").filter(Boolean)) {
      files[path] = { status: "A (untracked)", diff: "" };
    }

    for (const part of diff.split(/^diff --git /m).filter(Boolean)) {
      const match = part.match(/^a\/(.+?) b\//);
      if (match && files[match[1]]) files[match[1]].diff = shorten(part, 1000);
    }

    return files;
  } catch {
    return null;
  }
}

function toolCounts(actions) {
  const counts = {};
  for (const a of actions) counts[a.tool] = (counts[a.tool] || 0) + 1;
  return counts;
}

function diffExclusiveTools(countA, countB, actionsA, actionsB) {
  const diffs = [];
  const allTools = new Set([...Object.keys(countA), ...Object.keys(countB)]);

  for (const tool of allTools) {
    const cA = countA[tool] || 0;
    const cB = countB[tool] || 0;
    if (cA > 0 && cB === 0) {
      const examples = actionsA.filter((a) => a.tool === tool).slice(0, 3);
      diffs.push({ type: "tool_only_in_a", tool, count_a: cA, count_b: 0, detail_a: examples.map((e) => digestArg(tool, e.args)).join(" | "), detail_b: null });
    } else if (cB > 0 && cA === 0) {
      const examples = actionsB.filter((b) => b.tool === tool).slice(0, 3);
      diffs.push({ type: "tool_only_in_b", tool, count_a: 0, count_b: cB, detail_a: null, detail_b: examples.map((e) => digestArg(tool, e.args)).join(" | ") });
    } else if (Math.abs(cA - cB) > Math.max(cA, cB) * 0.3) {
      diffs.push({ type: "count_differs", tool, count_a: cA, count_b: cB, detail_a: null, detail_b: null });
    }
  }
  return diffs;
}

function diffErrors(actionsA, actionsB) {
  const errA = actionsA.filter((a) => a.is_error);
  const errB = actionsB.filter((b) => b.is_error);
  const fmtA = errA.map((e) => `${e.tool}: ${digestArg(e.tool, e.args)}`).slice(0, 5);
  const fmtB = errB.map((e) => `${e.tool}: ${digestArg(e.tool, e.args)}`).slice(0, 5);
  if (fmtA.join() === fmtB.join()) return [];
  return [{ type: "error_pattern_differs", tool: "(errors)", count_a: errA.length, count_b: errB.length, detail_a: fmtA.join(" | "), detail_b: fmtB.join(" | ") }];
}

function diffAgentTypes(actionsA, actionsB) {
  const diffs = [];
  const agentsA = actionsA.filter((a) => a.tool === "Agent" || a.tool === "Task");
  const agentsB = actionsB.filter((b) => b.tool === "Agent" || b.tool === "Task");
  const typesA = new Set(agentsA.map((a) => a.args?.subagent_type ?? "default"));
  const typesB = new Set(agentsB.map((b) => b.args?.subagent_type ?? "default"));

  for (const t of typesA) {
    if (!typesB.has(t)) {
      diffs.push({ type: "agent_type_only_in_a", tool: "Agent", count_a: agentsA.filter((a) => (a.args?.subagent_type ?? "default") === t).length, count_b: 0, detail_a: t, detail_b: null });
    }
  }
  for (const t of typesB) {
    if (!typesA.has(t)) {
      diffs.push({ type: "agent_type_only_in_b", tool: "Agent", count_a: 0, count_b: agentsB.filter((b) => (b.args?.subagent_type ?? "default") === t).length, detail_a: null, detail_b: t });
    }
  }
  return diffs;
}

function diffToolCalls(actionsA, actionsB) {
  const countA = toolCounts(actionsA);
  const countB = toolCounts(actionsB);
  return [
    ...diffExclusiveTools(countA, countB, actionsA, actionsB),
    ...diffErrors(actionsA, actionsB),
    ...diffAgentTypes(actionsA, actionsB),
  ];
}

function diffRepoState(repoA, repoB) {
  if (!repoA && !repoB) return [];
  const diffs = [];
  const allPaths = new Set([...Object.keys(repoA ?? {}), ...Object.keys(repoB ?? {})]);

  for (const path of allPaths) {
    const a = repoA?.[path];
    const b = repoB?.[path];
    if (a && !b) diffs.push({ type: "file_only_in_a", path, status_a: a.status, status_b: null, diff_a: a.diff, diff_b: null });
    else if (b && !a) diffs.push({ type: "file_only_in_b", path, status_a: null, status_b: b.status, diff_a: null, diff_b: b.diff });
    else if (a.diff !== b.diff) diffs.push({ type: "content_differs", path, status_a: a.status, status_b: b.status, diff_a: a.diff, diff_b: b.diff });
  }
  return diffs;
}

const runA = values["run-a"];
const runB = values["run-b"];

const transcriptA = join(runA, "transcript.jsonl");
const transcriptB = join(runB, "transcript.jsonl");

if (!existsSync(transcriptA)) { process.stderr.write(`Missing: ${transcriptA}\n`); process.exit(1); }
if (!existsSync(transcriptB)) { process.stderr.write(`Missing: ${transcriptB}\n`); process.exit(1); }

const actionsA = extractActions(parseTranscript(transcriptA));
const actionsB = extractActions(parseTranscript(transcriptB));

const sandboxA = existsSync(join(runA, "sandbox")) ? join(runA, "sandbox") : runA;
const sandboxB = existsSync(join(runB, "sandbox")) ? join(runB, "sandbox") : runB;

const toolDiffs = diffToolCalls(actionsA, actionsB);
const repoDiffs = diffRepoState(repoState(sandboxA), repoState(sandboxB));

const result = {
  tool_diffs: toolDiffs,
  repo_diffs: repoDiffs,
  stats: {
    a: { tool_calls: actionsA.length, errors: actionsA.filter((a) => a.is_error).length, unique_tools: [...new Set(actionsA.map((a) => a.tool))] },
    b: { tool_calls: actionsB.length, errors: actionsB.filter((b) => b.is_error).length, unique_tools: [...new Set(actionsB.map((b) => b.tool))] },
  },
};

const output = JSON.stringify(result, null, 2);
if (values.out) writeFileSync(values.out, output + "\n");
else process.stdout.write(output + "\n");

process.exit(toolDiffs.length > 0 || repoDiffs.length > 0 ? 1 : 0);
