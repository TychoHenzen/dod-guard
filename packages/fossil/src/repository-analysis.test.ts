import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FossilAnalysisError } from "./analysis-error.js";
import { analyzeRepositoryCore } from "./repository-analysis.js";
import type { NormalizedAnalysisOptions } from "./types.js";

const options: NormalizedAnalysisOptions = {
  days: 365,
  gapHours: 48,
  threshold: 0.4,
  format: "json",
  extensions: [],
  untrackedAgeDays: 30,
  exclude: [],
  verbose: false,
};

function git(directory: string, ...arguments_: string[]): void {
  execFileSync("git", arguments_, { cwd: directory, stdio: "ignore" });
}

function gitOutput(stdout = "") {
  return {
    exitCode: 0,
    stdout,
    stderr: "",
    stdoutBytes: Buffer.byteLength(stdout),
    stderrBytes: 0,
    statusRecordCount: 0,
  };
}

function createFixture(): { readonly directory: string; readonly referenceBytes: number } {
  const directory = mkdtempSync(join(tmpdir(), "fossil-repository-analysis-"));
  mkdirSync(join(directory, "src"));
  mkdirSync(join(directory, "workspace"));
  mkdirSync(join(directory, "vendor"));
  const tracked = 'import "../workspace/old.js";\nexport const tracked = true;\n';
  const oldWorkspace = "export const retained = true;\n";
  writeFileSync(join(directory, "src", "tracked.ts"), tracked);
  writeFileSync(join(directory, "workspace", "old.js"), oldWorkspace);
  writeFileSync(join(directory, "workspace", "recent.js"), "export const recent = true;\n");
  writeFileSync(join(directory, ".env"), "SECRET=not-inventory\n");
  writeFileSync(join(directory, "vendor", "dependency.js"), "export const dependency = true;\n");
  const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1_000);
  utimesSync(join(directory, "workspace", "old.js"), old, old);
  git(directory, "init", "-q");
  git(directory, "config", "user.email", "fossil-test@example.invalid");
  git(directory, "config", "user.name", "Fossil Test");
  git(directory, "add", "src/tracked.ts");
  git(directory, "commit", "-qm", "tracked source");
  return { directory, referenceBytes: Buffer.byteLength(tracked) + Buffer.byteLength(oldWorkspace) };
}

// covers: fossil/cli :: Production repository analysis :: Inventory includes eligible contained sources
test("composes tracked and eligible referenced workspace sources into inventory evidence", async () => {
  const fixture = createFixture();
  try {
    const report = await analyzeRepositoryCore(fixture.directory, options);

    assert.equal(report.usage.inventoriedFiles, 2);
    assert.equal(report.usage.referenceBytes, fixture.referenceBytes);
    assert.deepEqual(report.workspaceDebris, []);
    const evidence = JSON.stringify({ warnings: report.warnings, findings: report.workspaceDebris });
    for (const path of ["workspace/recent.js", ".env", "vendor/dependency.js"])
      assert.equal(evidence.includes(path), false);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

// covers: fossil/cli :: Analysis resource bounds :: Commit limit fails explicitly
test("rejects over-limit included history before producing a report", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fossil-history-limit-"));
  const record = `\u001ehash\0${Math.floor(Date.now() / 1_000)}\0A\0file.ts\0`;
  const history = record.repeat(100_001);
  const runGit = async (arguments_: readonly string[]) => {
    if (arguments_[0] === "--version") return gitOutput("git version 2.30.0\n");
    if (arguments_.includes("--show-toplevel")) return gitOutput(`${directory}\n`);
    if (arguments_.includes("--show-prefix")) return gitOutput();
    if (arguments_.includes("--verify")) return gitOutput("hash\n");
    if (arguments_[0] === "log") return gitOutput(history);
    if (arguments_.includes("--is-shallow-repository")) return gitOutput("false\n");
    return gitOutput();
  };
  try {
    await assert.rejects(
      analyzeRepositoryCore(directory, options, runGit),
      (error: unknown) => error instanceof FossilAnalysisError && error.code === "resource_limit",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

// covers: fossil/cli :: Analysis resource bounds :: File inventory limit fails explicitly
test("rejects an over-limit Git inventory before source reads", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fossil-inventory-limit-"));
  const tracked = `${Array.from({ length: 100_001 }, (_, index) => `src/file-${index}.ts`).join("\0")}\0`;
  const runGit = async (arguments_: readonly string[]) => {
    if (arguments_[0] === "--version") return gitOutput("git version 2.30.0\n");
    if (arguments_.includes("--show-toplevel")) return gitOutput(`${directory}\n`);
    if (arguments_.includes("--show-prefix")) return gitOutput();
    if (arguments_.includes("--verify")) return { ...gitOutput(), exitCode: 1 };
    if (arguments_.includes("--is-shallow-repository")) return gitOutput("false\n");
    if (arguments_[0] === "ls-files" && arguments_.includes("-z") && arguments_.length === 2) return gitOutput(tracked);
    return gitOutput();
  };
  try {
    await assert.rejects(
      analyzeRepositoryCore(directory, options, runGit),
      (error: unknown) =>
        error instanceof FossilAnalysisError &&
        error.code === "resource_limit" &&
        error.message === "File inventory limit exceeded.",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
