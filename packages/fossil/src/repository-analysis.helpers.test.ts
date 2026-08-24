import type { NormalizedAnalysisOptions } from "./types.js";

export const analysisOptions: NormalizedAnalysisOptions = {
  days: 365,
  gapHours: 48,
  threshold: 0.4,
  format: "json",
  extensions: [],
  untrackedAgeDays: 30,
  exclude: [],
  verbose: false,
};

export function gitOutput(stdout = "") {
  return {
    exitCode: 0,
    stdout,
    stderr: "",
    stdoutBytes: Buffer.byteLength(stdout),
    stderrBytes: 0,
    statusRecordCount: 0,
  };
}

export interface GitResponse {
  readonly arguments: readonly string[];
  readonly output: ReturnType<typeof gitOutput>;
}

export function createRunGit(directory: string, overrides: readonly GitResponse[]) {
  const defaults: readonly GitResponse[] = [
    { arguments: ["--version"], output: gitOutput("git version 2.30.0\n") },
    { arguments: ["rev-parse", "--show-toplevel"], output: gitOutput(`${directory}\n`) },
    { arguments: ["rev-parse", "--show-prefix"], output: gitOutput() },
    { arguments: ["rev-parse", "--is-shallow-repository"], output: gitOutput("false\n") },
  ];
  const responses = new Map(
    [...defaults, ...overrides].map(({ arguments: arguments_, output }) => [arguments_.join("\0"), output]),
  );
  return (arguments_: readonly string[]) => Promise.resolve(responses.get(arguments_.join("\0")) ?? gitOutput());
}
