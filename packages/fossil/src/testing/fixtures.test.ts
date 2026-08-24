import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { afterEach, test } from "node:test";
import {
  createDeterministicClock,
  createOutputCapture,
  createTemporaryRepository,
  type TemporaryRepository,
  writeSourceTree,
} from "./fixtures.js";

const repositories: TemporaryRepository[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.cleanup()));
});

async function temporaryRepository(): Promise<TemporaryRepository> {
  const repository = await createTemporaryRepository();
  repositories.push(repository);
  return repository;
}

test("creates a Git repository with deterministic commit identity and time", async () => {
  const repository = await temporaryRepository();
  await repository.writeSourceFile("src/first.ts", "export const first = 1;\n");
  const timestamp = new Date("2025-01-02T03:04:05.000Z");
  const commit = await repository.recordCommit("first", timestamp);

  assert.match(commit.hash, /^[0-9a-f]{40}$/);
  assert.equal(await repository.git(["show", "-s", "--format=%cI", "HEAD"]), "2025-01-02T03:04:05+00:00\n");
  assert.equal(
    await repository.git(["show", "-s", "--format=%an <%ae>", "HEAD"]),
    "Fossil Fixture <fossil-fixture@example.invalid>\n",
  );
});

test("records file history and changes the source tree without a shell", async () => {
  const repository = await temporaryRepository();
  await writeSourceTree(repository, {
    "src/old.ts": "export const old = true;\n",
    "src/keep.ts": "export const keep = true;\n",
  });
  await repository.recordCommit("create", new Date("2025-01-01T00:00:00.000Z"));
  await repository.removeSourcePath("src/old.ts");
  await repository.writeSourceFile("src/keep.ts", "export const keep = false;\n");
  await repository.recordCommit("change", new Date("2025-01-02T00:00:00.000Z"));

  await assert.rejects(fs.access(path.join(repository.root, "src", "old.ts")));
  assert.equal(await repository.git(["log", "--format=%s", "--", "src/keep.ts"]), "change\ncreate\n");
});

test("captures output without changing global process streams", () => {
  const capture = createOutputCapture();
  capture.writeStdout("one");
  capture.writeStderr("error");
  capture.writeStdout(" two");

  assert.equal(capture.stdout(), "one two");
  assert.equal(capture.stderr(), "error");
});

test("returns copied dates from a controllable deterministic clock", () => {
  const clock = createDeterministicClock(new Date("2025-01-01T00:00:00.000Z"));
  const firstRead = clock.now();
  firstRead.setUTCFullYear(2000);
  clock.advance(1_000);
  assert.equal(clock.now().toISOString(), "2025-01-01T00:00:01.000Z");
  clock.set(Date.parse("2025-01-02T00:00:00.000Z"));
  assert.equal(clock.now().toISOString(), "2025-01-02T00:00:00.000Z");
});
