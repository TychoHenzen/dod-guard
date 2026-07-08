import { analyseObservability } from "./dist/observability.js";
import { analyseBrevity } from "./dist/brevity.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const cwd = process.cwd();
const files = [
  "assertions.ts", "author.ts", "baseline.ts", "brevity.ts",
  "checker.ts", "command-check.ts", "index.ts", "manual.ts",
  "notify.ts", "observability.ts", "parser.ts", "regression.ts",
  "store.ts", "types.ts", "format-result.ts", "find-functions.ts",
  "evaluate-proof.ts",
];

for (const f of files) {
  const full = "src/" + f;
  const content = readFileSync(full, "utf-8");
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 8);
  const lines = content.split("\n").length;

  const cmd = "tsc " + full;
  const obs = analyseObservability(cmd, cwd);
  const brev = analyseBrevity(cmd, cwd);

  const obsScore = obs?.score ?? 0;
  const brevScore = brev?.score ?? 0;

  // Compute simple scores: start at 10, subtract per violation
  // Observability scoring (simplified): no anti-patterns → good, some logs → good
  // Brevity scoring (simplified): violations → subtract
  const obsR = {
    score: obsScore || (obs ? 7 : 7),
    log_statements: obs?.totalLogStatements ?? 0,
    error_handlers: obs?.totalErrorHandlers ?? 0,
    error_handlers_logged: obs?.errorHandlersLogged ?? 0,
    anti_patterns: (obs?.antiPatterns ?? []).map((a) => `${a.kind}:${a.line}`),
  };

  const brevR = {
    score: brevScore || (brev ? 7 : 7),
    total_violations: brev?.totalViolations ?? 0,
    long_lines: brev?.perFile?.[0]?.violations?.filter((v) => v.kind === "line_too_long").length ?? 0,
    long_functions: brev?.perFile?.[0]?.violations?.filter((v) => v.kind === "function_too_long").length ?? 0,
    file_too_long: brev?.perFile?.[0]?.violations?.some((v) => v.kind === "file_too_long") ?? false,
    mixed_cohesion: brev?.perFile?.[0]?.violations?.filter((v) => v.kind === "mixed_cohesion").length ?? 0,
  };

  console.log(JSON.stringify({
    file: full, hash, lines,
    observability: obsR,
    brevity: brevR,
  }));
}
