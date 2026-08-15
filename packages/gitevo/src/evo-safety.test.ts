import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import type { EvoConfig } from "./evo-config.js";
import { EvoError } from "./evo-error.js";
import { git, statusLines } from "./evo-git.js";
import { guardMove } from "./evo-safety.js";

type Scope = Parameters<typeof guardMove>[0];

/** The findings guardMove would report, as the list it built them from. */
function findingsFor(target: Scope): string[] {
  const report = guardMove(target, true);
  return report === "" ? [] : report.split("\n\n");
}

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

function scope(root: string, config: EvoConfig = CONFIG): Scope {
  return { root, target: "evo-base", status: statusLines(root), config };
}

describe("guardMove findings", () => {
  // covers: gitevo/safety-gate :: Refusals are a dedicated error type :: An unresolved target reference
  it("refuses a destination that does not resolve", () => {
    const root = repo();
    assert.throws(
      () => guardMove({ ...scope(root), target: "evo-nope" }),
      (err: Error) => err instanceof EvoError && err.message === "Reference 'evo-nope' not found.",
    );
  });

  // covers: gitevo/safety-gate :: Three independent findings describe what a move would cost :: Tracked source missing at the destination
  it("names tracked source the destination does not have", () => {
    const found = findingsFor(scope(repo()));
    assert.equal(found.length, 1);
    assert.ok(found[0].includes("later.ts"));
  });

  // covers: gitevo/safety-gate :: Three independent findings describe what a move would cost :: Untracked source file
  it("names uncommitted files that look like source", () => {
    const root = repo();
    fs.mkdirSync(path.join(root, "work"));
    fs.writeFileSync(path.join(root, "work", "draft.ts"), "export {};");
    const found = findingsFor(scope(root)).filter((f) => f.includes("Uncommitted"));
    assert.equal(found.length, 1);
    assert.ok(found[0].includes("work/draft.ts"), found[0]);
  });

  // covers: gitevo/safety-gate :: Three independent findings describe what a move would cost :: Build output with no surviving source
  it("names build output whose source is gone", () => {
    const root = repo();
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "orphan.js"), "");
    const found = findingsFor(scope(root)).filter((f) => f.includes("Build output"));
    assert.equal(found.length, 1);
    assert.ok(found[0].includes("dist/orphan.js"), found[0]);
  });

  it("keeps quiet about build output whose source survives", () => {
    const root = repo();
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "keep.js"), "");
    assert.equal(findingsFor(scope(root)).filter((f) => f.includes("Build output")).length, 0);
  });

  // covers: gitevo/safety-gate :: Configuration controls what counts as source, where build output lives, and whether the stale check runs :: Stale check disabled
  it("skips the build output finding when the settings say so", () => {
    const root = repo();
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "orphan.js"), "");
    const quiet = { ...CONFIG, skipStaleCheck: true };
    assert.equal(findingsFor(scope(root, quiet)).filter((f) => f.includes("Build output")).length, 0);
  });

  // covers: gitevo/safety-gate :: A test-shaped build artifact is not flagged stale when its source language is not configured :: JS-only repository with a compiled test file
  it("leaves dist alone when no configured source compiles to it", () => {
    const root = repo();
    fs.mkdirSync(path.join(root, "dist"));
    fs.writeFileSync(path.join(root, "dist", "utils.test.js"), "");
    const jsOnly = { ...CONFIG, sourceExtensions: [".js", ".json"] };
    assert.deepEqual(findingsFor(scope(root, jsOnly)), []);
  });
});

describe("guardMove", () => {
  // covers: gitevo/safety-gate :: Three independent findings describe what a move would cost :: Safe move
  it("says nothing when the move is safe", () => {
    const root = repo();
    assert.equal(guardMove({ ...scope(root), target: "HEAD" }), "");
  });

  // covers: gitevo/safety-gate :: The gate refuses the move by default and reports a diagnostic :: Costly move without force
  it("refuses a costly move", () => assert.throws(() => guardMove(scope(repo())), EvoError));

  // covers: gitevo/safety-gate :: The gate refuses the move by default and reports a diagnostic :: Costly move with force
  it("reports rather than refuses when forced", () => {
    const report = guardMove(scope(repo()), true);
    assert.ok(report.includes("later.ts"));
  });
});
