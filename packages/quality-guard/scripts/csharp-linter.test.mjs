import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { csharpFindings } from "./csharp-linter.mjs";
import { runProjectLinter } from "./project-linter.mjs";
import {
  reportEntry,
  stubSpawn,
  tempProject,
} from "./csharp-linter-fixtures.test.mjs";
import { rmSync, writeFileSync } from "node:fs";

test(
  "an error-level diagnostic whose FilePath names the edited file surfaces",
  () => {
  const root = tempProject();
  const filePath = join(root, "Program.cs");
  const spawn = stubSpawn(() => [reportEntry(filePath)]);

  const findings = csharpFindings(filePath, root, spawn);

  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0], {
    line: 11,
    rule: "CA1822",
    message:
      "Member 'Helper' does not access instance data " +
      "and can be marked as static",
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
  const spawn = stubSpawn(() => [
    reportEntry(filePath, {
      FileChanges: [
        {
          LineNumber: 11,
          CharNumber: 10,
          DiagnosticId: "CA1822",
          FormatDescription:
            "warning CA1822: Member 'Helper' does not access instance data " +
            "and can be marked as static",
        },
      ],
    }),
  ]);

  const findings = csharpFindings(filePath, root, spawn);

  assert.deepEqual(findings, []);
  rmSync(root, { recursive: true, force: true });
});
