import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { checkAgentOutputs, writeAgentOutputs } from "./convert-claude-agents.mjs";

test("converts read-only and writing Claude agents", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-agents-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "agents");
  const output = path.join(root, ".codex", "agents");
  await mkdir(source, { recursive: true });

  await writeFile(path.join(source, "reader.md"), `---
name: evidence-reader
description: Read evidence.
model: haiku
tools: Read, Grep, Glob
maxTurns: 4
effort: low
---

# Evidence reader

Return facts.
`);
  await writeFile(path.join(source, "writer.md"), `---
name: patch-writer
description: >-
  Apply one bounded
  patch.
model: opus
tools: Read, Write, Edit
---

# Patch writer

Change one file.
`);

  assert.equal(await writeAgentOutputs(source, output), 2);
  const reader = await readFile(path.join(output, "dod_guard_evidence_reader.toml"), "utf8");
  const writer = await readFile(path.join(output, "dod_guard_patch_writer.toml"), "utf8");

  assert.match(reader, /model = "gpt-5\.6-luna"/);
  assert.match(reader, /sandbox_mode = "read-only"/);
  assert.match(reader, /finish within 4 agent turns/);
  assert.match(reader, /Do not run shell commands\./);
  assert.match(writer, /description = "Apply one bounded patch\."/);
  assert.match(writer, /model = "gpt-5\.6-sol"/);
  assert.match(writer, /sandbox_mode = "workspace-write"/);
  assert.match(writer, /Do not run shell commands\./);
  assert.deepEqual(await checkAgentOutputs(source, output), []);

  await writeFile(path.join(output, "dod_guard_patch_writer.toml"), "stale\n");
  assert.deepEqual(await checkAgentOutputs(source, output), ["stale dod_guard_patch_writer.toml"]);
});
