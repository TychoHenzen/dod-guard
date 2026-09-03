import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createNativeProjectRoot } from "../semantic/project-root.js";
import { createDiscoveryPipeline } from "./pipeline.js";
import { countSensitiveProjectPaths, isSensitiveProjectPath } from "./sensitive-paths.js";

it("recognizes the non-overridable denylist across portable separators and nested directories", () => {
  for (const path of [
    ".git/config",
    "nested\\.hg\\store",
    "nested/.svn/entries",
    ".env",
    "nested/.ENV.local",
    "keys/service.PEM",
    "nested/id_ED25519",
    "NuGet.Config",
    "nested/.npmrc",
  ])
    assert.equal(isSensitiveProjectPath(path), true, path);
  assert.equal(isSensitiveProjectPath("src/environment.ts"), false);
  assert.equal(countSensitiveProjectPaths(["src/main.ts", ".env", "keys/a.pem"]), 2);
});

it("rejects a POSIX absolute backend symbol path before sensitive-path filtering", () => {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-discovery-posix-external-"));
  try {
    const pipeline = createDiscoveryPipeline(createNativeProjectRoot(root));
    const symbol = {
      id: "function:/outside/.env",
      name: "helper",
      language: "rust" as const,
      kind: "function",
      location: {
        path: "/outside/.env",
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
      },
    };
    assert.throws(() => pipeline.search("helper", {}, [symbol]), { code: "path_outside_project" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
