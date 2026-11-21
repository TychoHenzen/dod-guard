// Verify one slice a session applied: no hand commit, no change outside the
// slice, the agent converter check, the scanner rules, and the project's
// documented test command.
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { atOrUnder, GENERATED, git, run, underAny } from "./common.mjs";
import { signalProblem } from "./signals.mjs";

// The codex-migrate skill's own scripts, found from this file rather than
// taken from the command line.
const SKILL_SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills", "codex-migrate", "scripts");
const SCANNER = join(SKILL_SCRIPTS, "scan-agent-setup.mjs");
const CONVERTER = join(SKILL_SCRIPTS, "convert-claude-agents.mjs");

export function scan(repo) {
  const result = run(process.execPath, [SCANNER, repo, "--json"], repo);
  if (result.status !== 0) {
    throw new Error(`the scanner exited ${result.status}: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

export function changedPaths(repo) {
  const out = git(repo, ["status", "--porcelain=v1", "--untracked-files=all", "-z"]);
  const fields = out.split("\0").filter(Boolean);
  const paths = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    paths.push({ code: field.slice(0, 2), path: field.slice(3) });
    if (field[0] === "R" || field[0] === "C") {
      index += 1;
      paths.push({ code: "D ", path: fields[index] });
    }
  }
  return paths;
}

function scopeProblem(slice, changes) {
  if (changes.some((change) => atOrUnder(change.path, GENERATED))) {
    return "the session edited generated agent TOML by hand";
  }
  if (changes.some((change) => change.path === "CLAUDE.md" && change.code.includes("D"))) {
    return "the session deleted CLAUDE.md; it is reduced to an @AGENTS.md import, never deleted";
  }
  const outside = changes.filter((change) => !underAny(change.path, slice.files));
  return outside.length > 0
    ? `changed files outside the slice: ${outside.map((change) => change.path).join(", ")}`
    : null;
}

// Decided from the session's real diff, which the generated TOML must match;
// an agents slice regenerates with no session edit at all.
function touchesAgents(slice, agentSource, changes) {
  return (
    slice.kind === "agents" || (agentSource !== "" && changes.some((change) => atOrUnder(change.path, agentSource)))
  );
}

// Generate, then check; a drift after one regeneration stops the slice.
function converterProblem(state, repo) {
  if (state.agentSource === "") {
    return "the proposal names no Claude agent directory to convert";
  }
  const base = [CONVERTER, `--source=${state.agentSource}`, `--output=${join(repo, ".codex", "agents")}`];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const generated = run(process.execPath, base, repo);
    if (generated.status !== 0) {
      return `the converter failed: ${generated.stderr.trim()}`;
    }
    if (run(process.execPath, [...base, "--check"], repo).status === 0) {
      return null;
    }
  }
  return "the converter --check still reports drift after a regeneration";
}

function testProblem(test, repo) {
  if (test === "") {
    return null;
  }
  const result = run("bash", ["-c", test], repo);
  return result.status === 0
    ? null
    : `the documented test command failed: ${test}\n${(result.stdout + result.stderr).slice(-2000)}`;
}

// Returns the first problem found, or null when the slice passes.
export function verifySlice(slice, state, repo) {
  if (git(repo, ["rev-parse", "HEAD"]).trim() !== state.head) {
    return "the session made a commit; the workflow commits each slice itself";
  }
  // One snapshot, taken before the converter writes .codex/agents.
  const changes = changedPaths(repo);
  const scope = scopeProblem(slice, changes);
  if (scope) {
    return scope;
  }
  const converter = touchesAgents(slice, state.agentSource, changes) ? converterProblem(state, repo) : null;
  if (converter) {
    return converter;
  }
  const signals = signalProblem(slice, state.before, scan(repo));
  if (signals) {
    return signals;
  }
  return testProblem(state.test, repo);
}
