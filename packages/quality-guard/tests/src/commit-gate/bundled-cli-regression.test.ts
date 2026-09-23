import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { test } from "node:test";
import { git, withFixture } from "./acknowledgement-test-support.js";

const DECISION_RECORD = ".github/quality/architecture-decisions.json";
const BUNDLE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../dist/bundle.js",
);
const MALFORMED_RECORD = JSON.stringify([
  {
    findingId: "historical-finding",
    fingerprint: "short",
    reason: "Previously reviewed",
    author: "tester",
    time: "2026-08-31T00:00:00.000Z",
  },
]);
const MALFORMED_FINGERPRINT_ERROR = new RegExp(
  "architecture-decisions\\.json\\[0\\]\\.fingerprint must be a " +
    "64-character lowercase hexadecimal SHA-256 fingerprint",
);

function stageDecisionRecord(root: string, source: string) {
  fs.writeFileSync(path.join(root, DECISION_RECORD), source);
  git(root, ["add", DECISION_RECORD]);
}

function bundledCheck(root: string, args: string[]) {
  const result = spawnSync(process.execPath, [BUNDLE, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.error, undefined);
  return {
    exitCode: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
}

function assertMalformedRecord(result: {
  exitCode: number | null;
  output: string;
}) {
  assert.equal(result.exitCode, 3);
  assert.match(result.output, MALFORMED_FINGERPRINT_ERROR);
}

test(
  "bundled staged check rejects a malformed record without source changes",
  withFixture((root) => {
    stageDecisionRecord(root, MALFORMED_RECORD);
    assertMalformedRecord(
      bundledCheck(root, ["check", "--staged", "--json"]),
    );
  }),
);

test(
  "bundled committed check rejects a malformed record without source changes",
  withFixture((root) => {
    stageDecisionRecord(root, MALFORMED_RECORD);
    git(root, ["commit", "-m", "malformed tracked decision record"]);
    assertMalformedRecord(
      bundledCheck(root, ["check", "--committed", "HEAD", "--json"]),
    );
  }),
);
