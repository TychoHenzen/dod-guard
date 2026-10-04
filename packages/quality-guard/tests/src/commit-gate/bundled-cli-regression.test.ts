import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { git, withFixture } from "./acknowledgement-test-support.js";

const DECISION_RECORD = ".github/quality/architecture-decisions.json";
const BUNDLE = fileURLToPath(
  new URL("../../../../dist/bundle.js", import.meta.url),
);

function bundledQualityCommand(root: string, args: string[]) {
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

function assertRetiredCommand(
  command: "check" | "acknowledge",
  result: {
    exitCode: number | null;
    output: string;
  },
) {
  assert.equal(result.exitCode, 0);
  const output = JSON.parse(result.output);
  assert.equal(output.status, "advisory");
  assert.equal(output.command, command);
  assert.match(
    output.message,
    /no longer provides commit or ledger acceptance/,
  );
  assert.match(output.nextStep, /diagnostic evidence/);
}

test(
  "bundled check is advisory and leaves ledger records untouched",
  withFixture((root) => {
    const source = JSON.stringify([{ fingerprint: "short" }]);
    fs.writeFileSync(path.join(root, DECISION_RECORD), source);
    git(root, ["add", DECISION_RECORD]);
    assertRetiredCommand(
      "check",
      bundledQualityCommand(root, ["check", "--staged", "--json"]),
    );
    assert.equal(
      fs.readFileSync(path.join(root, DECISION_RECORD), "utf8"),
      source,
    );
  }),
);

test(
  "bundled acknowledge is advisory and does not write ledger state",
  withFixture((root) => {
    assertRetiredCommand(
      "acknowledge",
      bundledQualityCommand(root, [
        "acknowledge",
        "--finding",
        "finding-id",
        "--reason",
        "reason",
        "--author",
        "author",
      ]),
    );
  }),
);
