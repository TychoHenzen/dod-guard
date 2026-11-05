import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { lineOf, writeTree } from "./formatter-width-test-support.mjs";

const SCANNER = fileURLToPath(
  new URL(
    "../../../../../skills/quality-refactor/scripts/quality-scan.mjs",
    import.meta.url,
  ),
);

// The same 100-character line in a kept file, a root-level sample directory and a nested one.
function tree(t, config, flags = []) {
  const root = mkdtempSync(join(tmpdir(), "quality-scan-config-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const line = `${lineOf(100)}\n`;
  writeTree(root, {
    "src/a.js": line,
    "samples/b.js": line,
    "pkg/samples/c.js": line,
  });
  if (config !== undefined)
    writeFileSync(join(root, ".quality-guard.json"), config);
  const result = spawnSync(
    process.execPath,
    [SCANNER, ".", `--root=${root}`, "--format=json", ...flags],
    { encoding: "utf8" },
  );
  return result;
}

function reportedFiles(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).violations.map((violation) => violation.file);
}

test("without a config all three files are reported", (t) => {
  const files = reportedFiles(tree(t));
  assert.ok(files.some((file) => file.startsWith("src/")), files.join(" "));
  assert.ok(files.some((file) => file.startsWith("samples/")), files.join(" "));
  assert.ok(files.includes("pkg/samples/c.js"), files.join(" "));
});

test("excludePaths removes a root-level and a nested directory", (t) => {
  const files = reportedFiles(tree(t, '{"excludePaths":["/samples/"]}'));
  assert.equal(
    files.some(
      (file) => file.startsWith("samples/") || file.startsWith("pkg/samples/"),
    ),
    false,
    files.join(" "),
  );
  assert.ok(files.some((file) => file.startsWith("src/")), files.join(" "));
});

test("--no-config ignores the file", (t) => {
  const files = reportedFiles(
    tree(t, '{"excludePaths":["/samples/"]}', ["--no-config"]),
  );
  assert.ok(files.includes("samples/b.js"), files.join(" "));
  assert.ok(files.includes("pkg/samples/c.js"), files.join(" "));
});

test("an invalid config exits 3 and names the file", (t) => {
  const result = tree(t, "{");
  assert.equal(result.status, 3);
  assert.match(result.stderr, /\.quality-guard\.json/);
});
