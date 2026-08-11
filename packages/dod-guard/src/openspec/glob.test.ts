import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { resolveGlob } from "./glob.js";

async function withTempTree(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "dod-guard-glob-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("resolveGlob matches literal files directly under the base dir", async () => {
  await withTempTree(async (dir) => {
    await writeFile(join(dir, "a.md"), "");
    await writeFile(join(dir, "b.txt"), "");
    const result = await resolveGlob(dir, "*.md");
    assert.deepEqual(result, [join(dir, "a.md")]);
  });
});

test("resolveGlob's ** matches zero directory levels, finding files at the base dir", async () => {
  await withTempTree(async (dir) => {
    await writeFile(join(dir, "root.md"), "");
    const result = await resolveGlob(dir, "**/*.md");
    assert.deepEqual(result, [join(dir, "root.md")]);
  });
});

test("resolveGlob's ** also matches nested directories, at any depth", async () => {
  await withTempTree(async (dir) => {
    await mkdir(join(dir, "specs", "nested"), { recursive: true });
    await writeFile(join(dir, "specs", "top.md"), "");
    await writeFile(join(dir, "specs", "nested", "deep.md"), "");
    const result = await resolveGlob(dir, "specs/**/*.md");
    assert.deepEqual(
      result.sort(),
      [join(dir, "specs", "top.md"), join(dir, "specs", "nested", "deep.md")].sort(),
    );
  });
});

test("resolveGlob returns nothing for a base dir that does not exist", async () => {
  const result = await resolveGlob(join(tmpdir(), "dod-guard-glob-missing"), "*.md");
  assert.deepEqual(result, []);
});
