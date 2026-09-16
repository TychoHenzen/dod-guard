import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function tempProject() {
  const root = mkdtempSync(join(tmpdir(), "qg-csharp-"));
  writeFileSync(
    join(root, "fixture.csproj"),
    '<Project Sdk="Microsoft.NET.Sdk"></Project>\n',
  );
  return root;
}

export function reportEntry(filePath, overrides = {}) {
  return {
    FileName: "Program.cs",
    FilePath: filePath,
    FileChanges: [
      {
        LineNumber: 11,
        CharNumber: 10,
        DiagnosticId: "CA1822",
        FormatDescription:
          "error CA1822: Member 'Helper' does not access instance data " +
          "and can be marked as static",
      },
    ],
    ...overrides,
  };
}

export function stubSpawn(buildReport) {
  return (_command, args) => {
    const reportDir = args[args.indexOf("--report") + 1];
    writeFileSync(
      join(reportDir, "format-report.json"),
      JSON.stringify(buildReport()),
    );
    return { status: 0 };
  };
}
