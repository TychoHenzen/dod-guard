import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const browserBundle = resolve(packageRoot, "dist/browser/client.js");
const npmCli = process.env.npm_execpath;
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(script) {
  execFileSync(npmCli ? process.env.npm_node_execpath : npm, npmCli
    ? [npmCli, "run", script]
    : ["run", script], {
    cwd: packageRoot,
    stdio: "inherit",
  });
}

function hash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("production build leaves the browser bundle to the browser bundler", () => {
  run("build");
  run("bundle");
  const bundledHash = hash(browserBundle);

  run("build");
  assert.equal(hash(browserBundle), bundledHash);
});
