import { match, strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "check-spec-hygiene.mjs");

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

// A requirement with delta 4: one obligation-free scenario against four
// obligation keywords in the body.
const COMPOUND_REQUIREMENT = `### Requirement: Compound thing
The system SHALL do a. The system MUST do b. The system SHOULD do c. The system MAY do d.

#### Scenario: one scenario only
- WHEN something happens
- THEN one thing occurs
`;

// A requirement with delta 0: one obligation, one scenario.
const CLEAN_REQUIREMENT = `### Requirement: Clean thing
The system SHALL do a.

#### Scenario: covers it
- WHEN something happens
- THEN one thing occurs
`;

function write(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function mixedTree() {
  const root = mkdtempSync(join(tmpdir(), "spec-hygiene-"));
  temps.push(root);
  write(root, "openspec/specs/pkg/cap/spec.md", `## Requirements\n\n${COMPOUND_REQUIREMENT}\n${CLEAN_REQUIREMENT}`);
  return root;
}

function cleanTree() {
  const root = mkdtempSync(join(tmpdir(), "spec-hygiene-"));
  temps.push(root);
  write(root, "openspec/specs/pkg/cap/spec.md", `## Requirements\n\n${CLEAN_REQUIREMENT}`);
  return root;
}

function run(root, extraArgs = []) {
  const res = spawnSync(process.execPath, [SCRIPT, `--root=${root}`, ...extraArgs], { encoding: "utf8" });
  return { code: res.status, out: `${res.stdout}${res.stderr}` };
}

describe("check-spec-hygiene", () => {
  it("warns on the compound requirement and prints nothing for the clean one", () => {
    const { out } = run(mixedTree());
    match(out, /WARN: pkg\/cap :: Compound thing - 4 obligations, 1 scenarios/);
    strictEqual(/WARN: .*Clean thing/.test(out), false, out);
  });

  it("prints no warnings when every requirement is clean", () => {
    const { code, out } = run(cleanTree());
    strictEqual(/WARN:/.test(out), false, out);
    strictEqual(code, 0);
  });

  it("exits 0 when compounds are found but --strict is not passed", () => {
    const { code } = run(mixedTree());
    strictEqual(code, 0);
  });

  it("exits 1 when compounds are found and --strict is passed", () => {
    const { code } = run(mixedTree(), ["--strict"]);
    strictEqual(code, 1);
  });

  it("exits 0 when no compounds are found and --strict is passed", () => {
    const { code } = run(cleanTree(), ["--strict"]);
    strictEqual(code, 0);
  });

  it("prints a summary line with requirement, compound, and uncovered counts", () => {
    const { out } = run(mixedTree());
    match(out, /^2 requirements, 1 compound, 3 uncovered obligations$/m);
  });
});
