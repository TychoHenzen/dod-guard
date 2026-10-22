// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import assert from "node:assert/strict";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { spawnSync } from "node:child_process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { tmpdir } from "node:os";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { join } from "node:path";
import process from "node:process";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import test from "node:test";
// biome-ignore lint/correctness/noNodejsModules: This file runs with Node's test runner.
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("review-findings.mjs", import.meta.url));
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16_BOM = Buffer.from([0xff, 0xfe]);
const DIFF =
  "diff --git a/src/a.mjs b/src/a.mjs\nnew file mode 100644\n--- /dev/null\n+++ b/src/a.mjs\n@@ -0,0 +1 @@\n+x\n";
const run = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", shell: false });
const utf8WithBom = (text) => Buffer.concat([UTF8_BOM, Buffer.from(text)]);
const utf16WithBom = (text) => Buffer.concat([UTF16_BOM, Buffer.from(text, "utf16le")]);

function withDir(body) {
  const dir = mkdtempSync(join(tmpdir(), "review-findings-encoding-"));
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A stand-in quality-guard plugin whose scanner prints an empty report, in a
// repository the scan can list ignored paths from.
function stubPlugin(dir) {
  const scripts = join(dir, "skills", "quality-refactor", "scripts");
  mkdirSync(scripts, { recursive: true });
  writeFileSync(join(scripts, "quality-scan.mjs"), "console.log(JSON.stringify({ violations: [] }));\n");
  const init = spawnSync("git", ["init", "--quiet", dir], { encoding: "utf8", shell: false });
  assert.equal(init.status, 0, init.stderr);
  return [{ id: "quality-guard@stub", enabled: true, installPath: dir }];
}

test("violations reads a scan file with a UTF-8 byte-order mark and a diff saved as marked UTF-16", () => {
  withDir((dir) => {
    const scan = join(dir, "scan.json");
    const diff = join(dir, "unified0.diff");
    const out = join(dir, "violations.json");
    writeFileSync(scan, utf8WithBom(JSON.stringify({ violations: [] })));
    writeFileSync(diff, utf16WithBom(DIFF));
    const result = run(["violations", `--scan=${scan}`, `--diff=${diff}`, `--out=${out}`]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { out, violations: 0, files: 0 });
  });
});

test("scan reads a plugin list saved with a UTF-8 byte-order mark or as marked UTF-16", () => {
  const encodings = { "UTF-8 BOM": utf8WithBom, "UTF-16 BOM": utf16WithBom };
  for (const [label, encode] of Object.entries(encodings)) {
    withDir((dir) => {
      const registry = join(dir, "plugins.json");
      const out = join(dir, "scan.json");
      writeFileSync(registry, encode(JSON.stringify(stubPlugin(dir))));
      const result = run(["scan", "--client=claude", `--registry=${registry}`, `--root=${dir}`, `--out=${out}`]);
      assert.equal(result.status, 0, `${label}: ${result.stderr}`);
      assert.deepEqual(JSON.parse(result.stdout), {
        scanner: `${dir.replaceAll("\\", "/")}/skills/quality-refactor/scripts/quality-scan.mjs`,
        out,
        violations: 0,
      });
    });
  }
});

test("scan refuses a plugin list saved as UTF-16 without a byte-order mark and names the file", () => {
  withDir((dir) => {
    const registry = join(dir, "plugins.json");
    writeFileSync(registry, Buffer.from("[]", "utf16le"));
    const result = run([
      "scan",
      "--client=claude",
      `--registry=${registry}`,
      `--root=${dir}`,
      `--out=${join(dir, "o.json")}`,
    ]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /is not UTF-8 text; save it as UTF-8/);
    assert.ok(result.stderr.includes("plugins.json"), result.stderr);
  });
});
