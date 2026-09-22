import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { runScan } from "../../../src/scanner.js";

function git(root: string, args: string[]): void {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

export function parityFixture(extraFiles: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), "quality-guard-parity-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Test"]);
  mkdirSync(path.join(root, ".github", "quality"), { recursive: true });
  mkdirSync(path.join(root, "packages", "fixture", "src"), { recursive: true });
  writeFileSync(
    path.join(root, "packages", "fixture", "src", "source.ts"),
    'export class Existing { private value = "short"; ' +
      "public added(): string { return this.value; } }\n",
  );
  for (const [relativePath, source] of Object.entries(extraFiles)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, source);
  }
  const baseline = runScan({
    paths: ["packages"],
    root,
    excludes: ["/dist/", "node_modules"],
    writeBaseline: ".github/quality/quality-baseline.json",
  });
  assert.equal(baseline.exitCode, 0);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "base"]);
  return root;
}
