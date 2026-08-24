import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeRepository, FossilUsageError, runFossilCli } from "./index.js";
import type { FossilReport, NormalizedAnalysisOptions } from "./types.js";

function reportFor(options: NormalizedAnalysisOptions): FossilReport {
  return {
    schemaVersion: 1,
    options,
    analysisTimestampMs: 0,
    gitVersion: "2.47.0",
    boundary: { repositoryRoot: "C:/repo", canonicalRepositoryRoot: "C:/repo", unobservedMechanisms: [] },
    limits: {
      maximumCommits: 0,
      maximumFileStatusRecords: 0,
      maximumInventoriedFiles: 0,
      maximumGitStdoutBytes: 0,
      maximumGitStderrBytes: 0,
      maximumReferenceFileBytes: 0,
      maximumReferenceTotalBytes: 0,
    },
    usage: {
      commitRecords: 0,
      fileStatusRecords: 0,
      inventoriedFiles: 0,
      gitStdoutBytes: 0,
      gitStderrBytes: 0,
      referenceBytes: 0,
      omittedReferencePaths: 0,
    },
    completeness: { historyComplete: true, referenceAnalysisComplete: true, workspaceDebrisComplete: true },
    statistics: {
      includedCommitCount: 0,
      logicalFileCount: 0,
      burstCount: 0,
      candidateFindingCount: 0,
      uniqueCandidatePathCount: 0,
      workspaceDebrisCount: 0,
    },
    warnings: [],
    bursts: [],
    workspaceDebris: [],
  };
}

// covers: fossil/cli :: Analyze command :: Defaults are applied
test("passes normalized defaults and the current directory to analyze", async () => {
  const calls: Array<{ repositoryPath: string; options: NormalizedAnalysisOptions }> = [];
  let invocation = 0;
  const dependencies = {
    cwd: () => "C:/repositories/default",
    stdout: () => undefined,
    analyze: async (repositoryPath: string, options: NormalizedAnalysisOptions) => {
      calls.push({ repositoryPath, options: structuredClone(options) });
      if (invocation === 0) {
        (options.extensions as string[]).push("mutated");
        (options.exclude as string[]).push("mutated");
      }
      invocation += 1;
      return reportFor(options);
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
          return reportFor({
            days: 90,
            gapHours: 48,
            threshold: 0.4,
            format: "table",
            extensions: [],
            untrackedAgeDays: 90,
            exclude: [],
            verbose: false,
          });
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

// covers: fossil/cli :: Programmatic API parity :: CLI and API agree
test("returns and serializes the same finalized report through one analysis core", async () => {
  const options: NormalizedAnalysisOptions = {
    days: 90,
    gapHours: 48,
    threshold: 0.4,
    format: "json",
    extensions: [],
    untrackedAgeDays: 90,
    exclude: [],
    verbose: false,
  };
  const calls: Array<{ repositoryPath: string; options: NormalizedAnalysisOptions }> = [];
  const core = async (repositoryPath: string, coreOptions: NormalizedAnalysisOptions): Promise<FossilReport> => {
    calls.push({ repositoryPath, options: coreOptions });
    return reportFor(coreOptions);
  };
  const apiReport = await analyzeRepository("C:/repositories/parity", options, core);
  const stdout: string[] = [];

  await runFossilCli(["node", "fossil", "analyze", "C:/repositories/parity", "--format", "json"], {
    analyze: core,
    stdout: (message) => stdout.push(message),
  });

  assert.deepEqual(JSON.parse(stdout.join("")), apiReport);
  assert.deepEqual(calls, [
    { repositoryPath: "C:/repositories/parity", options },
    { repositoryPath: "C:/repositories/parity", options },
  ]);
});

// covers: fossil/cli :: Process outcomes :: No findings is successful
test("reports zero findings after a completed empty analysis", async () => {
  const stdout: string[] = [];

  await runFossilCli(["node", "fossil", "analyze"], {
    analyze: async (_repositoryPath, options) => reportFor(options),
    stdout: (message) => stdout.push(message),
  });

  assert.equal(stdout.join(""), "0 findings\n");
});
