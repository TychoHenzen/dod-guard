import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { csharpFindings } from "../../scripts/csharp-linter.mjs";
import { runProjectLinter } from "../../scripts/project-linter.mjs";
import { tempProject } from "./csharp-linter-fixtures.test.mjs";

test("a timeout reports unavailable linter evidence", () => {
  const root = tempProject();
  const filePath = join(root, "Program.cs");
  const spawn = () => ({
    error: new Error("ETIMEDOUT"),
    signal: "SIGTERM",
    stdout: "",
  });
  const result = csharpFindings(filePath, root, spawn);
  assert.deepEqual(result.findings, []);
  assert.match(result.unavailable, /ETIMEDOUT/);
  rmSync(root, { recursive: true, force: true });
});

test("a missing dotnet binary reports unavailable linter evidence", () => {
  const root = tempProject();
  const filePath = join(root, "Program.cs");
  const spawn = () => {
    throw new Error("ENOENT: dotnet not found");
  };
  const result = csharpFindings(filePath, root, spawn);
  assert.deepEqual(result.findings, []);
  assert.match(result.unavailable, /dotnet not found/);
  rmSync(root, { recursive: true, force: true });
});

test("unparsable report output reports unavailable linter evidence", () => {
  const root = tempProject();
  const filePath = join(root, "Program.cs");
  const spawn = (_command, args) => {
    const reportDir = args[args.indexOf("--report") + 1];
    writeFileSync(join(reportDir, "format-report.json"), "not json");
    return { status: 0 };
  };
  const result = csharpFindings(filePath, root, spawn);
  assert.deepEqual(result.findings, []);
  assert.match(result.unavailable, /malformed JSON/);
  rmSync(root, { recursive: true, force: true });
});

test("a repository with no project or solution file produces nothing", () => {
  const root = mkdtempSync(join(tmpdir(), "qg-csharp-"));
  const filePath = join(root, "Program.cs");
  const spawn = () => {
    throw new Error(
      "dotnet must not be invoked when the repository has no project " +
        "or solution file",
    );
  };
  const result = csharpFindings(filePath, root, spawn);
  assert.deepEqual(result.findings, []);
  assert.equal(result.unavailable, null);
  const dispatched = runProjectLinter(filePath, root);
  assert.deepEqual(dispatched.findings, []);
  assert.equal(dispatched.unavailable, null);
  rmSync(root, { recursive: true, force: true });
});
