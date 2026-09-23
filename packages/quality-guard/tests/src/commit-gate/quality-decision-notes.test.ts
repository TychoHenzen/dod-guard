import assert from "node:assert/strict";
import * as fs from "node:fs";
import { test } from "node:test";
import {
  readQualityDecisionNotes,
  writeQualityDecisionNote,
} from "../../../src/commit-gate/quality-decision-notes.js";
import { fixture, git, withFixture } from "./acknowledgement-test-support.js";

const MALFORMED_FINGERPRINT_ERROR = new RegExp(
  "quality decision note\\[0\\]\\.fingerprint must be a " +
    "64-character lowercase hexadecimal SHA-256 fingerprint",
);

function attestation(root: string, targetSha: string) {
  return {
    findingId: "finding",
    fingerprint: "c".repeat(64),
    baseSha: git(root, ["rev-parse", `${targetSha}^`]),
    targetSha,
    reason: "reviewed",
    author: "tester",
    time: "2026-09-22T00:00:00.000Z",
  };
}

function committedSourceChange(root: string) {
  fs.writeFileSync(
    `${root}/packages/fixture/src/change.ts`,
    "export const change = 1;\n",
  );
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "source change"]);
  return git(root, ["rev-parse", "HEAD"]);
}

function assertRejectedNote(input: {
  root: string;
  targetSha: string;
  override: Record<string, string>;
  expected: RegExp;
}) {
  assert.throws(
    () =>
      writeQualityDecisionNote(input.root, {
        ...attestation(input.root, input.targetSha),
        ...input.override,
      }),
    input.expected,
  );
}

test("does not reuse an exact-target decision note for a distinct commit", () => {
  const root = fixture();
  try {
    fs.writeFileSync(
      `${root}/packages/fixture/src/same.ts`,
      "export const same = 1;\n",
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "first identical source change"]);
    const first = git(root, ["rev-parse", "HEAD"]);
    writeQualityDecisionNote(root, attestation(root, first));

    git(root, ["checkout", "-b", "duplicate", "HEAD^"]);
    fs.writeFileSync(
      `${root}/packages/fixture/src/same.ts`,
      "export const same = 1;\n",
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "second identical source change"]);
    const second = git(root, ["rev-parse", "HEAD"]);

    assert.notEqual(first, second);
    assert.deepEqual(readQualityDecisionNotes(root, second), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test(
  "rejects an attestation whose recorded base is not the target parent",
  withFixture((root) => {
    const targetSha = committedSourceChange(root);
    assertRejectedNote({
      root,
      targetSha,
      override: { baseSha: targetSha },
      expected: /base does not match/,
    });
  }),
);

test(
  "rejects malformed fingerprints before writing a committed note",
  withFixture((root) => {
    const targetSha = committedSourceChange(root);
    assertRejectedNote({
      root,
      targetSha,
      override: { fingerprint: "bad" },
      expected: MALFORMED_FINGERPRINT_ERROR,
    });
    assert.deepEqual(readQualityDecisionNotes(root, targetSha), []);
  }),
);

test(
  "preserves large exact-target note collections",
  withFixture((root) => {
    const targetSha = committedSourceChange(root);
    const findingCount = 18;
    const reasonPaddingLength = 350;
    const findingIds = Array.from(
      { length: findingCount },
      (_, index) => `finding-${index}`,
    );

    for (const findingId of findingIds) {
      writeQualityDecisionNote(root, {
        ...attestation(root, targetSha),
        findingId,
        reason: `reviewed ${"x".repeat(reasonPaddingLength)}`,
      });
    }

    assert.deepEqual(
      readQualityDecisionNotes(root, targetSha).map(
        (record) => record.findingId,
      ),
      findingIds,
    );
  }),
);
