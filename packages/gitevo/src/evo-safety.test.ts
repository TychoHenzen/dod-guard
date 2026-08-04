import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import type { EvoConfig } from "./evo-config.js";
import { EvoError } from "./evo-error.js";
import { git, statusLines } from "./evo-git.js";
import { evaluateMove, guardMove, type MoveScope } from "./evo-safety.js";

const CONFIG: EvoConfig = {
  sourceExtensions: [".ts", ".js", ".json"],
  buildLayouts: ["dist/"],
  skipStaleCheck: false,
};

/** A repo whose tag evo-base predates a second source file. */
function repo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitevo-safety-"));
  for (const args of [["init"], ["config", "user.name", "t"], ["config", "user.email", "t@t.com"]]) {
    spawnSync("git", args, { cwd: dir, encoding: "utf-8" });
  }
  fs.writeFileSync(path.join(dir, "keep.ts"), "export {};");
  git(["add", "-A"], dir);
  git(["commit", "-m", "initial"], dir);
  git(["tag", "-a", "evo-base", "-m", "base"], dir);
  fs.writeFileSync(path.join(dir, "later.ts"), "export {};");
  git(["add", "-A"], dir);
  git(["commit", "-m", "later"], dir);
  return dir;
}

function scope(root: string, config: EvoConfig = CONFIG): MoveScope {
  return { root, target: "evo-base", status: statusLines(root), config };
}

describe("evaluateMove", () => {
  it("refuses a destination that does not resolve", () => {
    const root = repo();
    assert.throws(
      () => evaluateMove({ ...scope(root), target: "evo-nope" }),
      (err: Error) => err instanceof EvoError && err.message === "Reference 'evo-nope' not found.",
    );
  });

  it("names tracked source the destination does not have", () => {
    const found = evaluateMove(scope(repo()));
    assert.equal(found.length, 1);
    assert.ok(found[0].includes("later.ts"));
  });

  it("names uncommitted files that look like source", () => {
    const root = repo();
    fs.mkdirSync(path.join(root, "work"));
    fs.writeFileSync(path.join(root, "work", "draft.ts"), "export {};");
    const found = evaluateMove(scope(root)).filter((f) => f.includes("Uncommitted"));
    assert.equal(found.length, 1);
    assert.ok(found[0].includes("work/draft.ts"), found[0]);
  });

  it("names build output whose source is gone", () => {
    const root = repo();
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "orphan.js"), "");
    const found = evaluateMove(scope(root)).filter((f) => f.includes("Build output"));
    assert.equal(found.length, 1);
    assert.ok(found[0].includes("dist/orphan.js"), found[0]);
  });

  it("keeps quiet about build output whose source survives", () => {
    const root = repo();
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "keep.js"), "");
    assert.equal(evaluateMove(scope(root)).filter((f) => f.includes("Build output")).length, 0);
  });

  it("skips the build output finding when the settings say so", () => {
    const root = repo();
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "orphan.js"), "");
    const quiet = { ...CONFIG, skipStaleCheck: true };
    assert.equal(evaluateMove(scope(root, quiet)).filter((f) => f.includes("Build output")).length, 0);
  });

  it("leaves dist alone when no configured source compiles to it", () => {
    const root = repo();
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "utils.test.js"), "");
    const jsOnly = { ...CONFIG, sourceExtensions: [".js", ".json"] };
    assert.deepEqual(evaluateMove(scope(root, jsOnly)), []);
  });
});

describe("guardMove", () => {
  it("says nothing when the move is safe", () => {
    const root = repo();
    assert.equal(guardMove({ ...scope(root), target: "HEAD" }), "");
  });

  it("refuses a costly move", () => assert.throws(() => guardMove(scope(repo())), EvoError));

  it("reports rather than refuses when forced", () => {
    const report = guardMove(scope(repo()), true);
    assert.ok(report.includes("later.ts"));
  });
});
