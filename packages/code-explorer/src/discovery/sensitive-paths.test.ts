import assert from "node:assert/strict";
import { it } from "node:test";
import { countSensitiveProjectPaths, isSensitiveProjectPath } from "./sensitive-paths.js";

// covers: code-explorer/symbol-discovery :: Sensitive paths are never indexed or returned :: Project contains a denied credential file
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
