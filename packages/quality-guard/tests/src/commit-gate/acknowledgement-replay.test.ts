import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { test } from "node:test";
import {
  runCommittedCheck,
  runStagedCheck,
} from "../../../src/commit-gate/cli-decision.js";
import { writeQualityDecisionNote } from "../../../src/commit-gate/quality-decision-notes.js";
import { readCommittedSnapshot } from "../../../src/commit-gate/snapshot.js";
import {
  acknowledge,
  fixture,
  git,
  stagedReview,
} from "./acknowledgement-test-support.js";

function movingRefRunner(
  root: string,
  refs: { movingRef: string; resolvedSha: string; nextSha: string },
) {
  const commands: string[][] = [];
  let refResolutions = 0;
  let resolvedRefSha: string | undefined;
  return {
    commands,
    get refResolutions() {
      return refResolutions;
    },
    get resolvedRefSha() {
      return resolvedRefSha;
    },
    runGit(
      commandRoot: string,
      args: string[],
      encoding: "utf8" | "buffer" = "utf8",
    ): string | Buffer {
      commands.push([...args]);
      if (args[0] === "rev-parse" && args[1] === refs.movingRef) {
        refResolutions += 1;
        resolvedRefSha = git(root, ["rev-parse", refs.movingRef]);
        git(root, ["update-ref", refs.movingRef, refs.nextSha]);
        return refs.resolvedSha;
      }
      if (encoding === "buffer")
        return execFileSync("git", args, { cwd: commandRoot });
      return execFileSync("git", args, {
        cwd: commandRoot,
        encoding: "utf8",
      });
    },
  };
}

function movedTargetFixture(root: string) {
  stagedReview(root);
  const baseSha = git(root, ["rev-parse", "HEAD"]);
  const sourcePath = "packages/fixture/src/source.ts";
  const sourceBefore = fs.readFileSync(`${root}/${sourcePath}`, "utf8");
  const sourceAfter = "export class Existing { updated = true; }\n";
  fs.writeFileSync(`${root}/${sourcePath}`, sourceAfter);
  git(root, ["add", sourcePath]);
  git(root, ["commit", "-m", "first immutable target"]);
  const targetSha = git(root, ["rev-parse", "HEAD"]);
  const movingRef = "refs/heads/moving-target";
  git(root, ["update-ref", movingRef, targetSha]);
  fs.writeFileSync(
    `${root}/packages/fixture/src/Added.ts`,
    `${Array.from({ length: 301 }, (_, index) => `export const item${index} = ${index};`).join("\n")}\n`,
  );
  git(root, ["add", "packages/fixture/src/Added.ts"]);
  git(root, ["commit", "-m", "second target with structural regression"]);
  return {
    baseSha,
    movingRef,
    movedSha: git(root, ["rev-parse", "HEAD"]),
    sourceAfter,
    sourceBefore,
    sourcePath,
    targetSha,
  };
}

function runMovingRefCheck(
  root: string,
  movingRef: string,
  runner: ReturnType<typeof movingRefRunner>,
) {
  let capturedSnapshot: ReturnType<typeof readCommittedSnapshot> | undefined;
  const options = { json: false, intent: "change" as const };
  const decision = runCommittedCheck(root, movingRef, {
    ...options,
    snapshotReader: (repo, ref) => {
      capturedSnapshot = readCommittedSnapshot(repo, ref, runner.runGit);
      return capturedSnapshot;
    },
  });
  return { capturedSnapshot, decision, options };
}

test("requires an exact-commit note after a staged acknowledgement intent", () => {
  const root = fixture();
  try {
    const { decision: staged, finding } = stagedReview(root);
    assert.equal(staged.input.targetCommitSha, undefined);
    assert.match(staged.input.targetIdentity, /^[0-9a-f]{64}$/);
    assert.equal(acknowledge(root, finding.id).exitCode, 0);
    assert.equal(
      runStagedCheck(root, { json: false, intent: "change" }).verdict,
      "PASS",
    );
    git(root, ["commit", "-m", "acknowledge"]);
    const beforeAttestation = runCommittedCheck(root, "HEAD", {
      json: false,
      intent: "change",
    });
    assert.equal(beforeAttestation.verdict, "REVIEW_REQUIRED");
    assert.equal(
      beforeAttestation.input.targetIdentity,
      beforeAttestation.input.targetCommitSha,
    );
    assert.notEqual(
      staged.input.targetIdentity,
      beforeAttestation.input.targetIdentity,
    );
    const targetSha = git(root, ["rev-parse", "HEAD"]);
    assert.equal(
      acknowledge(root, finding.id, { committedRef: "HEAD" }).exitCode,
      0,
    );
    const committed = runCommittedCheck(root, "HEAD", {
      json: false,
      intent: "change",
    });
    assert.equal(committed.verdict, "PASS");
    assert.equal(committed.input.baseIdentity, staged.input.baseIdentity);
    assert.equal(committed.input.targetCommitSha, targetSha);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("pins committed reads when the requested ref moves during resolution", () => {
  const root = fixture();
  try {
    const refs = movedTargetFixture(root);
    const runner = movingRefRunner(root, {
      movingRef: refs.movingRef,
      resolvedSha: refs.targetSha,
      nextSha: refs.movedSha,
    });
    const { capturedSnapshot, decision, options } = runMovingRefCheck(
      root,
      refs.movingRef,
      runner,
    );
    assert.ok(capturedSnapshot);
    assert.equal(runner.refResolutions, 1);
    assert.equal(runner.resolvedRefSha, refs.targetSha);
    assert.equal(git(root, ["rev-parse", refs.movingRef]), refs.movedSha);
    assert.equal(capturedSnapshot.baseIdentity, refs.baseSha);
    assert.equal(capturedSnapshot.targetCommitSha, refs.targetSha);
    const sourceChange = capturedSnapshot.changes.find(
      (change) => change.after?.path === refs.sourcePath,
    );
    assert.ok(sourceChange);
    assert.equal(sourceChange.before?.content, refs.sourceBefore);
    assert.equal(sourceChange.after?.content, refs.sourceAfter);
    assert.deepEqual(
      decision,
      runCommittedCheck(root, refs.targetSha, options),
    );
    assert.equal(decision.input.baseIdentity, refs.baseSha);
    assert.equal(decision.input.targetCommitSha, refs.targetSha);
    assert.ok(
      runner.commands.some(
        (args) => args[0] === "rev-parse" && args[1] === `${refs.targetSha}^`,
      ),
    );
    assert.ok(
      runner.commands.some(
        (args) =>
          args[0] === "diff" &&
          args.at(-2) === refs.baseSha &&
          args.at(-1) === refs.targetSha,
      ),
    );
    const showSpecs = runner.commands
      .filter((args) => args[0] === "show")
      .map((args) => args[1]);
    assert.ok(showSpecs.includes(`${refs.baseSha}:${refs.sourcePath}`));
    assert.ok(showSpecs.includes(`${refs.targetSha}:${refs.sourcePath}`));
    assert.equal(
      runner.commands.flat().filter((argument) => argument === refs.movingRef)
        .length,
      1,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("does not reuse an acknowledgement across identical committed targets", () => {
  const root = fixture();
  try {
    const baseSha = git(root, ["rev-parse", "HEAD"]);
    const { finding } = stagedReview(root);
    assert.equal(acknowledge(root, finding.id).exitCode, 0);
    git(root, ["commit", "-m", "first target with pending acknowledgement"]);
    const firstTargetSha = git(root, ["rev-parse", "HEAD"]);
    const first = runCommittedCheck(root, firstTargetSha, {
      json: false,
      intent: "change",
    });
    assert.equal(first.verdict, "REVIEW_REQUIRED");
    writeQualityDecisionNote(root, {
      findingId: finding.id,
      fingerprint: first.fingerprint ?? "",
      baseSha: first.input.baseIdentity,
      targetSha: firstTargetSha,
      reason: "accepted first exact target",
      author: "tester",
      time: "2026-09-22T00:00:00.000Z",
    });
    assert.equal(
      runCommittedCheck(root, firstTargetSha, {
        json: false,
        intent: "change",
      }).verdict,
      "PASS",
    );

    const firstTreeSha = git(root, ["write-tree"]);
    const secondTargetSha = git(root, [
      "commit-tree",
      firstTreeSha,
      "-p",
      baseSha,
      "-m",
      "second commit with identical tree",
    ]);
    git(root, ["update-ref", "refs/heads/duplicate", secondTargetSha]);
    git(root, ["checkout", "duplicate"]);

    const second = runCommittedCheck(root, secondTargetSha, {
      json: false,
      intent: "change",
    });

    assert.notEqual(firstTargetSha, secondTargetSha);
    assert.equal(first.input.baseIdentity, second.input.baseIdentity);
    assert.equal(first.input.targetIdentity, firstTargetSha);
    assert.equal(second.input.targetIdentity, secondTargetSha);
    assert.notEqual(first.fingerprint, second.fingerprint);
    assert.equal(second.verdict, "REVIEW_REQUIRED");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
