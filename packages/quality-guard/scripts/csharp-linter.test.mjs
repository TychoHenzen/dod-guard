import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { csharpFindings } from "./csharp-linter.mjs";
import { runProjectLinter } from "./project-linter.mjs";

function tempProject() {
  const root = mkdtempSync(join(tmpdir(), "qg-csharp-"));
  writeFileSync(join(root, "fixture.csproj"), '<Project Sdk="Microsoft.NET.Sdk"></Project>\n');
  return root;
}

/** One dotnet format analyzers report entry, shaped like a real `--report` file. */
function reportEntry(filePath, overrides = {}) {
  return {
    FileName: "Program.cs",
    FilePath: filePath,
    FileChanges: [{
      LineNumber: 11,
      CharNumber: 10,
      DiagnosticId: "CA1822",
      FormatDescription: "error CA1822: Member 'Helper' does not access instance data and can be marked as static",
    }],
    ...overrides,
  };
}

/**
 * A stub matching spawnSync's (command, args, options) => result shape. It
 * writes a fake report to the `--report` directory it was passed, the same
 * place a real `dotnet format` run would write one, so the parser is
 * exercised without a real dotnet invocation.
 */
function stubSpawn(buildReport) {
  return (_command, args) => {
    const reportDir = args[args.indexOf("--report") + 1];
    writeFileSync(join(reportDir, "format-report.json"), JSON.stringify(buildReport()));
    return { status: 0 };
  };
}

test("an error-level diagnostic whose FilePath names the edited file surfaces", () => {
  const root = tempProject();
  const filePath = join(root, "Program.cs");
  const spawn = stubSpawn(() => [reportEntry(filePath)]);

  const findings = csharpFindings(filePath, root, spawn);

  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0], {
    line: 11,
    rule: "CA1822",
    message: "Member 'Helper' does not access instance data and can be marked as static",
  });
  rmSync(root, { recursive: true, force: true });
});

test("a diagnostic in a report entry for a different file is dropped", () => {
  const root = tempProject();
  const filePath = join(root, "Program.cs");
  const otherPath = join(root, "Other.cs");
  const spawn = stubSpawn(() => [reportEntry(otherPath)]);

  const findings = csharpFindings(filePath, root, spawn);

  assert.deepEqual(findings, []);
  rmSync(root, { recursive: true, force: true });
});

test("a warning-level diagnostic is dropped", () => {
  const root = tempProject();
  const filePath = join(root, "Program.cs");
  const spawn = stubSpawn(() => [reportEntry(filePath, {
    FileChanges: [{
      LineNumber: 11,
      CharNumber: 10,
      DiagnosticId: "CA1822",
      FormatDescription: "warning CA1822: Member 'Helper' does not access instance data and can be marked as static",
    }],
  })]);

  const findings = csharpFindings(filePath, root, spawn);

  assert.deepEqual(findings, []);
  rmSync(root, { recursive: true, force: true });
});

test("a timeout produces no findings and throws nothing", () => {
  const root = tempProject();
  const filePath = join(root, "Program.cs");
  const spawn = () => {
    const error = new Error("ETIMEDOUT");
    error.code = "ETIMEDOUT";
    return { error, signal: "SIGTERM", stdout: "" };
  };

  assert.doesNotThrow(() => {
    const findings = csharpFindings(filePath, root, spawn);
    assert.deepEqual(findings, []);
  });
  rmSync(root, { recursive: true, force: true });
});

test("a missing dotnet binary produces no findings and throws nothing", () => {
  const root = tempProject();
  const filePath = join(root, "Program.cs");
  const spawn = () => {
    throw new Error("ENOENT: dotnet not found");
  };

  assert.doesNotThrow(() => {
    const findings = csharpFindings(filePath, root, spawn);
    assert.deepEqual(findings, []);
  });
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

  const findings = csharpFindings(filePath, root, spawn);

  assert.deepEqual(findings, []);
  rmSync(root, { recursive: true, force: true });
});

test("a repository with no project or solution file produces nothing, and dotnet is never invoked", () => {
  const root = mkdtempSync(join(tmpdir(), "qg-csharp-"));
  const filePath = join(root, "Program.cs");
  const spawn = () => {
    throw new Error("dotnet must not be invoked when the repository has no project or solution file");
  };

  const findings = csharpFindings(filePath, root, spawn);

  assert.deepEqual(findings, []);
  assert.deepEqual(runProjectLinter(filePath, root), [], "the dispatcher must agree");
  rmSync(root, { recursive: true, force: true });
});
