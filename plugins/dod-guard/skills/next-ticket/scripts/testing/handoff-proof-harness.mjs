import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "handoff-proof.mjs");
export const fixture = (name) => path.join(here, "..", "fixtures", name);
export const BODY_904 = path.join(here, "..", "..", "..", "..", "lib", "fixtures", "issue-904-body.md");
export const BODY_TEXT = readFileSync(BODY_904, "utf8");
export const HEAD_904 = "e7e22c4c54840c7983af67f8d631396cf5484999";
const HANDOFF_904 = JSON.parse(readFileSync(fixture("issue-904-handoff.json"), "utf8"));
export const ROWS_904 = HANDOFF_904.acceptanceMatrix;
export const LENSES_904 = HANDOFF_904.reviewLenses;

export const buildHandoff = (rows) =>
  `## Implementation handoff\n\n## Acceptance matrix\n\n\`\`\`json\n${JSON.stringify(rows)}\n\`\`\`\n`;

// Runs the CLI and returns its exit status with the one JSON line it prints.
export function run(...args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  const lines = result.stdout.split("\n").filter(Boolean);
  assert.equal(lines.length, 1, `one JSON line on stdout, got ${result.stdout}`);
  return { status: result.status, json: JSON.parse(lines[0]) };
}

export const withTempFile = (name, content, use) => withFiles([[name, content]], ([file]) => use(file));

// Writes each [name, content] pair into one temporary directory, passes the
// paths to use in the same order, and removes the directory afterwards.
export async function withFiles(files, use) {
  const dir = await mkdtemp(path.join(tmpdir(), "handoff-proof-"));
  try {
    const paths = [];
    for (const [name, content] of files) {
      const file = path.join(dir, name);
      await writeFile(file, content);
      paths.push(file);
    }
    return await use(paths);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const usage = (remainder) => ({ status: 2, json: { outcome: "usage error", remainder } });
export const parseError = (remainder) => ({ status: 2, json: { outcome: "parse error", remainder } });
export const withStaleRow = (rows, id = "R1") =>
  rows.map((row) => (row.id === id ? { ...row, headSha: "deadbeef" } : row));

// Runs a subcommand over a body and a handoff text, both saved to temporary
// files, at the head under test. The defaults are the #904 body and handoff.
export const gate = (subcommand, { body = BODY_TEXT, handoff = buildHandoff(ROWS_904), head = HEAD_904 } = {}) =>
  withFiles(
    [
      ["body.md", body],
      ["handoff.md", handoff],
    ],
    ([bodyFile, handoffFile]) =>
      run(subcommand, `--body-file=${bodyFile}`, `--handoff-file=${handoffFile}`, `--head-sha=${head}`),
  );
