import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { it } from "node:test";
import { fileURLToPath } from "node:url";

it("returns exit 2 for invalid practice CLI usage", () => {
  const script = fileURLToPath(new URL("../../scripts/practice-browser.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "--language", "ruby"], {
    encoding: "utf8",
    windowsHide: true,
  });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "invalid_cli_usage\n");
});
