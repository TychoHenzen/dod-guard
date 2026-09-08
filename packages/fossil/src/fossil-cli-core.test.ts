import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("prints the public analyze command in CLI help", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./fossil-cli-core.js", import.meta.url)), "--help"],
    {
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /analyze \[options\] \[repo-path\]/);
});

test("passes the TTY capability into a real analyze command", () => {
  const directory = mkdtempSync(join(tmpdir(), "fossil-cli-core-"));
  try {
    const initialized = spawnSync("git", ["init", "--quiet", directory], {
      encoding: "utf8",
    });
    assert.equal(initialized.status, 0);

    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("./fossil-cli-core.js", import.meta.url)),
        "analyze",
        directory,
        "--format",
        "json",
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /\"schemaVersion\":1/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
