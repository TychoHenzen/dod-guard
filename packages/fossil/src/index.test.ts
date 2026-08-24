import assert from "node:assert/strict";
import { test } from "node:test";
import { runFossilCli } from "./index.js";
import type { NormalizedAnalysisOptions } from "./types.js";

// covers: fossil/cli :: Analyze command :: Defaults are applied
test("passes normalized defaults and the current directory to analyze", async () => {
  const calls: Array<{ repositoryPath: string; options: NormalizedAnalysisOptions }> = [];
  const dependencies = {
    cwd: () => "C:/repositories/default",
    analyze: async (repositoryPath: string, options: NormalizedAnalysisOptions) => {
      calls.push({ repositoryPath, options });
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
