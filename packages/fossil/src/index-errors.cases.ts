import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FossilAnalysisError,
  NotRepositoryAnalysisError,
  runFossilCliProcess,
} from "./index.js";
import type { AnalysisErrorCode } from "./types.js";

test("maps typed analysis failures to exit codes without success output", async () => {
  const cases: ReadonlyArray<readonly [AnalysisErrorCode, number]> = [
    ["invalid_options", 2],
    ["not_repository", 1],
    ["git_capability", 1],
    ["git_failure", 1],
    ["containment_failure", 1],
    ["resource_limit", 1],
  ];

  for (const [code, expectedExitCode] of cases) {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await runFossilCliProcess(
      ["node", "fossil", "analyze", "C:/repositories/failing", "--format", "json"],
      {
        analyze: async () => {
          throw new FossilAnalysisError({ code, message: `${code}: \u001b[31mfailed` });
        },
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      },
    );

    assert.equal(exitCode, expectedExitCode);
    assert.equal(stdout.join(""), "");
    assert.equal(stderr.length, 1);
    assert.equal(stderr[0].includes(`fossil: ${code}: \\x1b[31mfailed\n`), true);
    assert.equal(Buffer.byteLength(stderr[0]) <= 4_096, true);
  }
});
test("maps a non-repository analysis failure to one bounded stderr diagnostic and exit code one", async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runFossilCliProcess(["node", "fossil", "analyze", "C:/not-a-repository"], {
    analyze: async () => {
      throw new NotRepositoryAnalysisError(`not a Git repository:\n\x1b[31m${"x".repeat(8_192)}`);
    },
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  });

  assert.equal(exitCode, 1);
  assert.equal(stdout.join(""), "");
  assert.equal(stderr.length, 1);
  assert.match(stderr[0], /not a Git repository/);
  assert.match(stderr[0], /\\n\\x1b\[31m/);
  assert.equal(
    [...stderr[0].slice(0, -1)].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    }),
    false,
  );
  assert.equal(Buffer.byteLength(stderr[0]) <= 4_096, true);
});
