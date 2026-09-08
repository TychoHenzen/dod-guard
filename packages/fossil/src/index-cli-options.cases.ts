import assert from "node:assert/strict";
import { test } from "node:test";
import { runFossilCli } from "./index.js";
import type { NormalizedAnalysisOptions } from "./types.js";
import { optionsFor, reportFor } from "./index.test-support.js";

const EXPLICIT_OPTIONS_ARGUMENTS = [
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
];

async function runExplicitOptions() {
  const calls: Array<{
    repositoryPath: string;
    options: NormalizedAnalysisOptions;
  }> = [];
  await runFossilCli(EXPLICIT_OPTIONS_ARGUMENTS, {
    analyze: async (
      repositoryPath: string,
      options: NormalizedAnalysisOptions,
    ) => {
      calls.push({ repositoryPath, options });
      return reportFor(options);
    },
    stdout: () => undefined,
  });
  return calls;
}

test("normalizes every explicit analyze option", async () => {
  const calls = await runExplicitOptions();
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
