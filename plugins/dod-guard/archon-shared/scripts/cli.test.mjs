import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { parseArgs } from "./cli.mjs";
import { scratch } from "./testing.mjs";

test("options parse into one object and a missing required one is named", () => {
  assert.deepEqual(parseArgs(["check", "--dir=a", "--text=x=y\nz"], ["dir"]), {
    command: "check",
    dir: "a",
    text: "x=y\nz",
  });
  assert.throws(() => parseArgs(["check"], ["dir"]), /missing --dir/);
  assert.throws(() => parseArgs(["check", "dir"]), /unknown argument: dir/);
});

test("the entry script prints its output, sets its exit code, and exits 2 on an error", (t) => {
  const dir = scratch(t);
  const script = join(dir, "tool.mjs");
  const cli = pathToFileURL(join(import.meta.dirname, "cli.mjs")).href;
  writeFileSync(
    script,
    `import { runCli } from ${JSON.stringify(cli)};\n` +
      "runCli({ url: import.meta.url, name: 'tool', required: ['dir'], commands: {\n" +
      "  say: (args) => `hi ${args.dir}`,\n" +
      "  verdict: () => ({ out: '', code: 1 }),\n" +
      "} });\n",
  );
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  assert.equal(run("say", "--dir=x").stdout, "hi x\n");
  const verdict = run("verdict", "--dir=x");
  assert.equal(verdict.status, 1);
  assert.equal(verdict.stdout, "");
  const unknown = run("toString", "--dir=x");
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /^tool: unknown command: toString/);
});
