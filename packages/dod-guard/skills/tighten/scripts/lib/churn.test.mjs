import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseChurn } from "./churn.mjs";

// Shape of `git log --name-only --format=%x00%s`: a NUL starts each commit,
// then the subject, a blank line, and the paths the commit touched.
function commit(subject, ...paths) {
  return `\0${subject}\n\n${paths.join("\n")}\n`;
}

const LOG = [
  commit("feat: add router", "src/router.ts", "src/index.ts"),
  commit("fix: router drops trailing slash", "src/router.ts"),
  commit("fix(router): handle empty path", "src/router.ts"),
  commit("docs: readme", "README.md"),
].join("");

describe("parseChurn", () => {
  it("counts how many commits touched each path", () => {
    const churn = parseChurn(LOG);
    assert.equal(churn["src/router.ts"].touches, 3);
    assert.equal(churn["src/index.ts"].touches, 1);
  });

  it("counts fix commits separately from every other commit", () => {
    const churn = parseChurn(LOG);
    assert.equal(churn["src/router.ts"].fixes, 2);
    assert.equal(churn["src/index.ts"].fixes, 0);
  });

  it("treats revert and hotfix subjects as fixes", () => {
    const log =
      commit("revert: undo the cache layer", "src/cache.ts") +
      commit("hotfix: null guard", "src/cache.ts");
    assert.equal(parseChurn(log)["src/cache.ts"].fixes, 2);
  });

  it("ignores a commit that changed no files", () => {
    const log =
      commit("chore: empty commit") + commit("feat: real", "src/a.ts");
    assert.deepEqual(Object.keys(parseChurn(log)), ["src/a.ts"]);
  });

  it("returns an empty record for empty output", () => {
    assert.deepEqual(parseChurn(""), {});
  });

  it("does not read a subject line as a path", () => {
    const log = commit("src/router.ts", "src/a.ts");
    assert.deepEqual(Object.keys(parseChurn(log)), ["src/a.ts"]);
  });

  it("counts a path once per commit even when two commits share a subject", () => {
    const log =
      commit("fix: a", "src/a.ts") + commit("fix: a", "src/a.ts");
    assert.equal(parseChurn(log)["src/a.ts"].touches, 2);
  });
});
