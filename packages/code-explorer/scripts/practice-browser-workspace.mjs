import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageRoot } from "./practice-browser-config.mjs";

export async function createPracticeWorkspace(language) {
  const workspace = await mkdtemp(
    join(tmpdir(), `code-explorer-browser-${language}-`),
  );
  return {
    workspace,
    fixture: join(packageRoot, "fixtures", language),
    root: join(workspace, "project"),
  };
}

export async function preparePracticeWorkspace(language, fixture, root) {
  await cp(fixture, root, { recursive: true });
  if (language === "rust")
    await writeFile(
      join(root, "Cargo.toml"),
      '[package]\nname = "practice"\nversion = "0.1.0"\nedition = "2021"\n',
    );
  if (language === "python")
    await writeFile(join(root, "pyrightconfig.json"), '{"include":["src"]}\n');
  if (language === "csharp")
    await writeFile(
      join(root, "Practice.csproj"),
      '<Project Sdk="Microsoft.NET.Sdk">' +
        "<PropertyGroup>" +
        "<TargetFramework>net10.0</TargetFramework>" +
        "</PropertyGroup>" +
        '</Project>\n',
    );
}
