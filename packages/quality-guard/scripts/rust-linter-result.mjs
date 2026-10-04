import { linterResult, linterUnavailable } from "./project-linter-result.mjs";

function hasJsonLine(stdout) {
  return stdout.split("\n").some((line) => {
    try {
      JSON.parse(line.trim());
      return true;
    } catch {
      return false;
    }
  });
}

export function formatRustResult(result, findings) {
  if (result.error)
    return linterUnavailable(`cargo clippy failed: ${result.error.message}`);
  const stdout = result.stdout || "";
  if (!hasJsonLine(stdout))
    return linterUnavailable("cargo clippy returned malformed JSON output.");
  return linterResult(findings(stdout));
}
