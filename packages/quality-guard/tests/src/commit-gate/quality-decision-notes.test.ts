import assert from "node:assert/strict";
import * as fs from "node:fs";
import { test } from "node:test";
import {
  readQualityDecisionNotes,
  writeQualityDecisionNote,
} from "../../../src/commit-gate/quality-decision-notes.js";
import { fixture, git } from "./acknowledgement-test-support.js";

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

test("rejects an attestation whose recorded base is not the target parent", () => {
  const root = fixture();
  try {
    fs.writeFileSync(
      `${root}/packages/fixture/src/change.ts`,
      "export const change = 1;\n",
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "source change"]);
    const targetSha = git(root, ["rev-parse", "HEAD"]);
    assert.throws(
      () =>
        writeQualityDecisionNote(root, {
          ...attestation(root, targetSha),
          baseSha: targetSha,
        }),
      /base does not match/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects malformed fingerprints before writing a committed note", () => {
  const root = fixture();
  try {
    fs.writeFileSync(
      `${root}/packages/fixture/src/change.ts`,
      "export const change = 1;\n",
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "source change"]);
    const targetSha = git(root, ["rev-parse", "HEAD"]);
    assert.throws(
      () =>
        writeQualityDecisionNote(root, {
          ...attestation(root, targetSha),
          fingerprint: "bad",
        }),
      /quality decision note\[0\]\.fingerprint must be a 64-character lowercase hexadecimal SHA-256 fingerprint/,
    );
    assert.deepEqual(readQualityDecisionNotes(root, targetSha), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("preserves large exact-target note collections", () => {
  const root = fixture();
  try {
    fs.writeFileSync(
      `${root}/packages/fixture/src/change.ts`,
      "export const change = 1;\n",
    );
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "source change"]);
    const targetSha = git(root, ["rev-parse", "HEAD"]);
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
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
