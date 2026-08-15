import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { loadTestGlobs, TestGlobsError } from "./test-globs.js";

let cwd: string;

before(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), "dod-guard-globs-"));
});

after(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
});

// covers: dod-guard/coverage-gate :: Test-file discovery is configurable per project :: A project has no test-globs.json
test("loadTestGlobs returns empty object when file is absent", async () => {
  const result = await loadTestGlobs(cwd);
  assert.deepEqual(result, {});
});

// covers: dod-guard/coverage-gate :: Test-file discovery is configurable per project :: A project provides test-globs.json with a group entry
test("loadTestGlobs returns entries from a valid file", async () => {
  const dir = path.join(cwd, "openspec");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "test-globs.json"), JSON.stringify({ eval: ["tests/**/*_test.py"] }));
  const result = await loadTestGlobs(cwd);
  assert.deepEqual(result, { eval: ["tests/**/*_test.py"] });
});

// covers: dod-guard/coverage-gate :: Test-file discovery is configurable per project :: test-globs.json exists but has no entry for the group
test("loadTestGlobs returns empty for group not in file", async () => {
  const result = await loadTestGlobs(cwd);
  assert.equal(result.nonexistent, undefined);
});

// covers: dod-guard/coverage-gate :: Test-file discovery is configurable per project :: test-globs.json contains an invalid entry
test("loadTestGlobs throws on malformed entry", async () => {
  const dir = path.join(cwd, "openspec");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "test-globs.json"), JSON.stringify({ bad: "not-an-array" }));
  await assert.rejects(
    () => loadTestGlobs(cwd),
    (err: Error) => {
      assert.ok(err instanceof TestGlobsError);
      assert.ok(err.message.includes('"bad"'));
      return true;
    },
  );
});

test("loadTestGlobs throws on array with non-string elements", async () => {
  const dir = path.join(cwd, "openspec");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "test-globs.json"), JSON.stringify({ mixed: ["ok", 42] }));
  await assert.rejects(
    () => loadTestGlobs(cwd),
    (err: Error) => {
      assert.ok(err instanceof TestGlobsError);
      assert.ok(err.message.includes('"mixed"'));
      return true;
    },
  );
});
