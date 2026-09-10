import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { csharpFindings } from "./csharp-linter.mjs";
import { runProjectLinter } from "./project-linter.mjs";
import { tempProject } from "./csharp-linter-fixtures.test.mjs";

test("a timeout produces no findings and throws nothing", () => {
  const root = tempProject();
  const filePath = join(root, "Program.cs");
  const spawn = () => ({
    error: new Error("ETIMEDOUT"),
    signal: "SIGTERM",
    stdout: "",
  });
  assert.doesNotThrow(() =>
    assert.deepEqual(csharpFindings(filePath, root, spawn), []),
  );
  rmSync(root, { recursive: true, force: true });
});

test("a missing dotnet binary produces no findings and throws nothing", () => {
  const root = tempProject();
  const filePath = join(root, "Program.cs");
  const spawn = () => {
    throw new Error("ENOENT: dotnet not found");
  };
  assert.doesNotThrow(() =>
    assert.deepEqual(csharpFindings(filePath, root, spawn), []),
  );
  rmSync(root, { recursive: true, force: true });
});

test("unparsable report output produces no findings", () => {
  const root = tempProject();
  const filePath = join(root, "Program.cs");
  const spawn = (_command, args) => {
    const reportDir = args[args.indexOf("--report") + 1];
    writeFileSync(join(reportDir, "format-report.json"), "not json");
    return { status: 0 };
  };
  assert.deepEqual(csharpFindings(filePath, root, spawn), []);
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
  assert.deepEqual(csharpFindings(filePath, root, spawn), []);
  assert.deepEqual(runProjectLinter(filePath, root), []);
  rmSync(root, { recursive: true, force: true });
});
