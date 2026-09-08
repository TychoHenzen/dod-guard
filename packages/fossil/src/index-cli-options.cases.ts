import assert from "node:assert/strict";
import { test } from "node:test";
import { FossilUsageError, runFossilCli } from "./index.js";
import type { NormalizedAnalysisOptions } from "./types.js";
import { optionsFor, reportFor } from "./index.test-support.js";

test("normalizes every explicit analyze option", async () => {
  const calls: Array<{ repositoryPath: string; options: NormalizedAnalysisOptions }> = [];

  await runFossilCli(
    [
      "node",
      "fossil",
      "analyze",
      "C:/repositories/explicit path",
      "--days",
      "180",
      "--gap-hours",
      "72",
      "--threshold",
      "0.75",
      "--format",
      "json",
      "--extensions",
      " ts, .js , rs ",
      "--untracked-age",
      "120",
      "--exclude",
      " generated/**, .cache ",
      "--verbose",
    ],
    {
      analyze: async (repositoryPath: string, options: NormalizedAnalysisOptions) => {
        calls.push({ repositoryPath, options });
        return reportFor(options);
      },
      stdout: () => undefined,
    },
  );

  assert.deepEqual(calls, [
    {
      repositoryPath: "C:/repositories/explicit path",
      options: {
        days: 180,
        gapHours: 72,
        threshold: 0.75,
        format: "json",
        extensions: ["ts", ".js", "rs"],
        untrackedAgeDays: 120,
        exclude: ["generated/**", ".cache"],
        verbose: true,
      },
    },
  ]);
});

test("rejects invalid argument forms with usage diagnostics before analysis", async () => {
  const invalidArguments = [
    ["--days", "0"],
    ["--untracked-age", "3651"],
    ["--gap-hours", "8761"],
    ["--threshold", "-0.1"],
    ["--threshold", "NaN"],
    ["--format", "yaml"],
    ["--extensions", Array.from({ length: 65 }, (_, index) => `extension-${index}`).join(",")],
    ["--unknown"],
    ["first", "second"],
  ];

  for (const argumentsForCase of invalidArguments) {
    const stderr: string[] = [];
    let analyzeCalls = 0;
    await assert.rejects(
      runFossilCli(["node", "fossil", "analyze", ...argumentsForCase], {
        analyze: async () => {
          analyzeCalls += 1;
          return reportFor(optionsFor());
        },
        stderr: (message) => stderr.push(message),
      }),
      (error: unknown) => error instanceof FossilUsageError && error.exitCode === 2,
    );
    assert.equal(analyzeCalls, 0);
    assert.match(stderr.join(""), /(?:error:|Usage: fossil analyze)/);
    assert.match(stderr.join(""), /Usage: fossil analyze/);
  }
});
