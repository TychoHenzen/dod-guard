import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./plugin-version-check.mjs", import.meta.url));
const USAGE_PATTERN = /usage: plugin-version-check\.mjs/u;
const USAGE_EXIT = 2;

// None of these flags reaches GitHub, so the command must refuse before any read.
for (const flags of [[], ["--client=bogus"], ["--client"], ["--client=toString"], ["claude"]]) {
  test(`the command exits 2 and prints usage for flags [${flags.join(" ")}]`, () => {
    const run = spawnSync(process.execPath, [SCRIPT, ...flags], { encoding: "utf8" });
    assert.equal(run.status, USAGE_EXIT);
    assert.match(run.stderr, USAGE_PATTERN);
    assert.equal(run.stdout, "");
  });
}
