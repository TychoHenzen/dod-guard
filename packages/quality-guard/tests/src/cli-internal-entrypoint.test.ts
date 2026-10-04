import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fixture } from "./commit-gate/acknowledgement-test-support.js";

const BUNDLE = fileURLToPath(
  new URL("../../../dist/bundle.js", import.meta.url),
);

test("the generic internal entry point keeps staged checks authoritative", () => {
  const root = fixture();
  try {
    const output = execFileSync(
      process.execPath,
      [BUNDLE, "check", "--staged", "--json"],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, QUALITY_GUARD_INTERNAL_CHECK: "1" },
      },
    );
    const result = JSON.parse(output);
    assert.equal(result.verdict, "PASS");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
