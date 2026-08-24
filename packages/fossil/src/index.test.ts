import assert from "node:assert/strict";
import { test } from "node:test";
import { runFossilCli } from "./index.js";
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
