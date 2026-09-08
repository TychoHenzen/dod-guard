import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const language = process.argv[2] ?? "rust";
if (!["rust", "python", "csharp"].includes(language))
  throw new Error("expected rust, python, or csharp");
export const temporaryRoot = mkdtempSync(
  join(tmpdir(), `code-explorer-real-${language}-`),
);
export const fixture = {
  rust: {
    path: "src/lib.rs",
    text:
      "pub fn helper() {}\n\n" +
      "pub fn caller() {\n" +
      "    helper();\n" +
      "    std::mem::drop(1_u8);\n" +
      "}\n",
    positions: {
      helperDefinition: { line: 0, character: 7 },
      helperCall: { line: 3, character: 4 },
      callerDefinition: { line: 2, character: 7 },
      externalCall: { line: 4, character: 14 },
    },
    setup() {
      mkdirSync(join(temporaryRoot, "src"));
      writeFileSync(
        join(temporaryRoot, "Cargo.toml"),
        '[package]\nname = "interop"\nversion = "0.1.0"\nedition = "2021"\n',
      );
    },
  },
  python: {
    path: "main.py",
    text:
      "def helper():\n" +
      "    pass\n\n" +
      "def caller():\n" +
      "    helper()\n" +
      '    print("x")\n',
    positions: {
      helperDefinition: { line: 0, character: 4 },
      helperCall: { line: 4, character: 4 },
      callerDefinition: { line: 3, character: 4 },
      externalCall: { line: 5, character: 4 },
    },
    setup() {},
  },
  csharp: {
    path: "Program.cs",
    text:
      "using System;\n" +
      "public static class Program\n" +
      "{\n" +
      "    public static void Helper() {}\n" +
      "    public static void Caller()\n" +
      "    {\n" +
      "        Helper();\n" +
      '        Console.WriteLine("x");\n' +
      "    }\n" +
      "}\n",
    positions: {
      helperDefinition: { line: 3, character: 23 },
      helperCall: { line: 6, character: 8 },
      callerDefinition: { line: 4, character: 23 },
      externalCall: { line: 7, character: 8 },
    },
    setup() {
      writeFileSync(
        join(temporaryRoot, "interop.csproj"),
        '<Project Sdk="Microsoft.NET.Sdk">' +
          "<PropertyGroup>" +
          "<TargetFramework>net8.0</TargetFramework>" +
          "</PropertyGroup>" +
          "</Project>",
      );
    },
  },
}[language];

fixture.setup();
writeFileSync(join(temporaryRoot, ...fixture.path.split("/")), fixture.text);
