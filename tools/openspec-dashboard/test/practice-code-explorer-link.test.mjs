import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const dashboardRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// covers: openspec-dashboard/code-explorer-launch :: The bridge does not proxy navigation or write project content :: Real packaged launch lifecycle runs
test("runs the packaged Rust browser lifecycle and retains only redacted evidence", { timeout: 100_000 }, async () => {
  await execFileAsync(process.execPath, [join(dashboardRoot, "practice-code-explorer-link.mjs"), "--language", "rust"], {
    cwd: dirname(dirname(dashboardRoot)),
    windowsHide: true,
  });
  const evidence = JSON.parse(await readFile(join(dashboardRoot, "practice", "code-explorer-link-rust.json"), "utf8"));
  assert.equal(evidence.schema_version, 1);
  assert.equal(evidence.error_code, null);
  for (const name of ["blank_tab_handoff", "root_dot", "selected_project_isolated", "second_click_reuse", "browser_closure", "managed_cleanup", "external_cache", "protected_hash_equal"])
    assert.equal(evidence.checks[name], true, name);
  assert.match(JSON.stringify(evidence), /"dashboard":44\d{2}/);
  assert.doesNotMatch(JSON.stringify(evidence), /[A-Za-z]:\\|capability|USERPROFILE|HOME|raw output/i);
});
