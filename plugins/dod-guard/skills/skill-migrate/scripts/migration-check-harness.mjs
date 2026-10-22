import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before } from "node:test";

const SCRIPT = new URL("./migration-check.mjs", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

export function run(args, opts) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], { encoding: "utf8", timeout: 10_000, ...opts });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.status, stdout: err.stdout || "", stderr: err.stderr || "" };
  }
}

export function runJson(path) {
  const r = run([path, "--json"]);
  return { ...r, ...JSON.parse(r.stdout) };
}

export function useFixtures() {
  let dir;
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "migration-check-"));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));
  const place = (folder, name, lines) => {
    mkdirSync(folder, { recursive: true });
    const path = join(folder, name);
    writeFileSync(path, lines.join("\n"));
    return path;
  };
  return {
    dir: () => dir,
    write: (name, lines) => place(dir, name, lines),
    writeIn: (subdir, name, lines) => place(join(dir, subdir), name, lines),
  };
}
const DOC_DEFAULTS = { name: "good-skill", description: "Processes files. Use when the user asks for it.", extra: [] };

export function doc(overrides = {}) {
  const { name, description, extra, body = ["Scope: one file."] } = { ...DOC_DEFAULTS, ...overrides };
  return ["---", `name: ${name}`, `description: ${description}`, ...extra, "---", "", ...body, ""];
}

export const GOOD_SKILL = [
  "---",
  "name: good-skill",
  "description: Processes files for deployment in batch mode. Use when the user asks for a batch deployment.",
  "---",
  "",
  "# Good Skill",
  "",
  "Do the thing. Scope is one file per run.",
  "",
];

export const BAD_SKILL = [
  "---",
  "name: bad-skill",
  "description: Catches problems in code before they ship. Use when the user asks for a scan.",
  "---",
  "",
  "# Bad Skill",
  "",
  "Double-check your work before proceeding.",
  "Verify your output matches the spec.",
  "Confirm you did not miss anything.",
  "Scope: one file.",
  "",
];

export function writeInstinct(fx, name, overrides = {}) {
  const fm = {
    id: "shell-dialect-separation",
    trigger: "running shell commands, especially with nested quotes",
    confidence: "0.8",
    domain: "workflow",
    scope: "global",
    evidence: "10+ occurrences across many sessions",
    last_seen: "2026-07-05",
    ...overrides,
  };
  const fields = Object.entries(fm).flatMap(([key, val]) => (val === undefined ? [] : [`${key}: ${val}`]));
  return fx.write(name, ["---", ...fields, "---", "", "Three separate shell dialects exist on this machine...", ""]);
}

export function assertWeightsSum(out) {
  const total = out.checks.reduce((sum, c) => sum + c.weight, 0);
  assert.ok(Math.abs(total - 100) < 0.01, `Expected weights to sum to 100, got ${total}`);
}

export function assertExcluded(out, ids, kind) {
  const present = ids.filter((id) => out.checks.some((c) => c.id === id));
  assert.deepEqual(present, [], `Expected these to be excluded from ${kind} checks`);
}
