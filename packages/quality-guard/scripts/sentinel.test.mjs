import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deleteSentinel, readSentinel, SENTINEL_NAME } from "./sentinel.mjs";

function tempRepo() {
  return mkdtempSync(join(tmpdir(), "qg-sentinel-"));
}

test("readSentinel returns null when no sentinel is present", () => {
  const root = tempRepo();
  assert.equal(readSentinel(root), null);
  rmSync(root, { recursive: true, force: true });
});

test("an empty sentinel is the plain waiver, not a rebaseline", () => {
  const root = tempRepo();
  writeFileSync(join(root, SENTINEL_NAME), "");
  assert.deepEqual(readSentinel(root), { rebaseline: false });
  rmSync(root, { recursive: true, force: true });
});

test("rebaseline is honoured only when explicitly true", () => {
  const root = tempRepo();
  const path = join(root, SENTINEL_NAME);

  writeFileSync(path, '{"rebaseline": true}');
  assert.equal(readSentinel(root).rebaseline, true);

  writeFileSync(path, '{"rebaseline": false}');
  assert.equal(readSentinel(root).rebaseline, false);

  writeFileSync(path, '{"rebaseline": "yes"}');
  assert.equal(
    readSentinel(root).rebaseline,
    false,
    "a truthy string must not authorise a raise",
  );

  rmSync(root, { recursive: true, force: true });
});

test("unparseable sentinel content degrades to the plain waiver", () => {
  const root = tempRepo();
  writeFileSync(join(root, SENTINEL_NAME), "{not json");
  assert.deepEqual(readSentinel(root), { rebaseline: false });
  rmSync(root, { recursive: true, force: true });
});

test("deleteSentinel removes the waiver file", () => {
  const root = tempRepo();
  const path = join(root, SENTINEL_NAME);
  writeFileSync(path, "");
  deleteSentinel(root);
  assert.equal(existsSync(path), false);
  rmSync(root, { recursive: true, force: true });
});

test("deleteSentinel on a missing file does not throw", () => {
  const root = tempRepo();
  assert.doesNotThrow(() => deleteSentinel(root));
  rmSync(root, { recursive: true, force: true });
});
