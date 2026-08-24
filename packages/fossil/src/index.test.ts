import assert from "node:assert/strict";
import { test } from "node:test";
import { FossilUsageError, runFossilCli } from "./index.js";
import type { NormalizedAnalysisOptions } from "./types.js";

// covers: fossil/cli :: Analyze command :: Defaults are applied
test("passes normalized defaults and the current directory to analyze", async () => {
  const calls: Array<{ repositoryPath: string; options: NormalizedAnalysisOptions }> = [];
  let invocation = 0;
  const dependencies = {
    cwd: () => "C:/repositories/default",
    analyze: async (repositoryPath: string, options: NormalizedAnalysisOptions) => {
      calls.push({ repositoryPath, options: structuredClone(options) });
      if (invocation === 0) {
        (options.extensions as string[]).push("mutated");
        (options.exclude as string[]).push("mutated");
      }
      invocation += 1;
    },
  };

  await runFossilCli(["node", "fossil", "analyze"], dependencies);
  await runFossilCli(["node", "fossil", "analyze", "C:/repositories/explicit"], dependencies);

  assert.deepEqual(calls, [
    {
      repositoryPath: "C:/repositories/default",
      options: {
        days: 90,
        gapHours: 48,
        threshold: 0.4,
        format: "table",
        extensions: [],
        untrackedAgeDays: 90,
        exclude: [],
        verbose: false,
      },
    },
    {
      repositoryPath: "C:/repositories/explicit",
      options: {
        days: 90,
        gapHours: 48,
        threshold: 0.4,
        format: "table",
        extensions: [],
        untrackedAgeDays: 90,
        exclude: [],
        verbose: false,
      },
    },
  ]);
});

// covers: fossil/cli :: Analyze command :: Explicit options are applied
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
      },
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

// covers: fossil/cli :: Argument validation :: Invalid arguments use the usage exit
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
