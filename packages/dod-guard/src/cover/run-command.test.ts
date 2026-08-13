import assert from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import { buildTestRunCommand } from "./run-command.js";

const cwd = path.join(process.cwd(), "..", "..");
const srcTestFile = path.join(cwd, "packages", "dod-guard", "src", "cover", "report.test.ts");

test("builds a whole-file node --test command against the compiled dist file", () => {
  const cmd = buildTestRunCommand(cwd, "dod-guard", srcTestFile);
  assert.match(cmd, /^node --experimental-test-module-mocks --test /);
  assert.match(cmd, /dist\/cover\/report\.test\.js$/);
});

test("joins the relative path with forward slashes on every OS", () => {
  const cmd = buildTestRunCommand(cwd, "dod-guard", srcTestFile);
  assert.equal(cmd.includes("\\"), false);
});
