import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseChurn } from "./churn.mjs";

const DAY = 24 * 60 * 60;
const START = 1_700_000_000;
const FILE = "src/router.ts";

// Shape of `git log --name-only --format=%x00%ct %s`: a NUL starts each commit,
// then the time and subject, a blank line, and the paths the commit touched.
const commit = (subject, ...paths) => ({ subject, paths });

// git log prints newest first, so the list reads oldest first here and gets
// reversed. `day` spaces the commits in calendar time as well as in order.
function log(commits, { day = 0 } = {}) {
  return commits
    .map(({ subject, paths }, index) => {
      const time = START + index * day * DAY;
      return `\0${time} ${subject}\n\n${paths.join("\n")}\n`;
    })
    .reverse()
    .join("");
}

// Twelve commits elsewhere. The work left this file and came back after them.
const AWAY = Array.from({ length: 12 }, (_, i) =>
  commit(`chore: ${i}`, `src/other${i}.ts`),
);

const add = commit("feat: add router", FILE);
const grow = commit("feat: router mounts children", FILE);
const fix = commit("fix: router drops trailing slash", FILE);

describe("parseChurn", () => {
  it("counts a burst of commits on one file as no churn", () => {
    const churn = parseChurn(log([add, grow, fix, grow, fix, grow]));
    assert.deepEqual(churn[FILE], { returns: 0, fixReturns: 0 });
  });

  it("counts a file the work keeps coming back to", () => {
    const churn = parseChurn(log([add, ...AWAY, grow, ...AWAY, grow]));
    assert.deepEqual(churn[FILE], { returns: 2, fixReturns: 0 });
  });

  it("counts a return that carried a fix", () => {
    const churn = parseChurn(log([add, ...AWAY, fix, ...AWAY, grow]));
    assert.deepEqual(churn[FILE], { returns: 2, fixReturns: 1 });
  });

  it("counts a session once however many commits it took", () => {
    const churn = parseChurn(log([add, ...AWAY, fix, fix, fix]));
    assert.deepEqual(churn[FILE], { returns: 1, fixReturns: 1 });
  });

  it("does not count a fix in the session that introduced the file", () => {
    assert.deepEqual(parseChurn(log([add, fix]))[FILE], {
      returns: 0,
      fixReturns: 0,
    });
  });

  it("treats a long calendar gap as a return in a quiet repository", () => {
    const revert = commit("revert: undo the route table", FILE);
    const churn = parseChurn(log([add, revert], { day: 30 }));
    assert.deepEqual(churn[FILE], { returns: 1, fixReturns: 1 });
  });

  it("treats hotfix and patch subjects as fixes", () => {
    const hotfix = commit("hotfix: null guard", FILE);
    const patch = commit("patch: null guard", FILE);
    for (const repair of [hotfix, patch]) {
      const churn = parseChurn(log([add, ...AWAY, repair]));
      assert.equal(churn[FILE].fixReturns, 1);
    }
  });

  it("scores each path in a commit separately", () => {
    const both = commit("feat: add router", FILE, "src/index.ts");
    const churn = parseChurn(log([both, ...AWAY, fix]));
    assert.deepEqual(churn[FILE], { returns: 1, fixReturns: 1 });
    assert.deepEqual(churn["src/index.ts"], { returns: 0, fixReturns: 0 });
  });

  it("ignores a commit that changed no files", () => {
    const empty = commit("chore: empty commit");
    assert.deepEqual(Object.keys(parseChurn(log([empty, add]))), [FILE]);
  });

  it("returns an empty record for empty output", () => {
    assert.deepEqual(parseChurn(""), {});
  });

  it("does not read a subject line as a path", () => {
    const churn = parseChurn(log([commit(FILE, "src/a.ts")]));
    assert.deepEqual(Object.keys(churn), ["src/a.ts"]);
  });
});
