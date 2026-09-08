import { FossilAnalysisError } from "./analysis-error.js";
import {
  FossilHelpDisplayed,
  FossilUsageError,
} from "./fossil-cli-types/index.js";
import { runFossilCli } from "./fossil-cli-run.js";
import type { FossilCliDependencies } from "./fossil-cli-types/index.js";

const CONTROL_ESCAPES = new Map([
  ["\n", "\\n"],
  ["\r", "\\r"],
  ["\t", "\\t"],
]);

function isControlCodePoint(codePoint: number): boolean {
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}

function visibleDiagnosticCharacter(character: string): string {
  const escaped = CONTROL_ESCAPES.get(character);
  if (escaped !== undefined) return escaped;
  const codePoint = character.codePointAt(0) ?? 0;
  if (isControlCodePoint(codePoint))
    return `\\x${codePoint.toString(16).padStart(2, "0")}`;
  return character;
}

function boundedAnalysisDiagnostic(error: FossilAnalysisError): string {
  const prefix = "fossil: ";
  const suffix = "\n";
  const maximumMessageBytes =
    4_096 - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);
  let message = "";
  for (const character of error.message || `analysis failed (${error.code})`) {
    const visible = visibleDiagnosticCharacter(character);
    if (
      Buffer.byteLength(message) + Buffer.byteLength(visible) >
      maximumMessageBytes
    )
      break;
    message += visible;
  }
  return `${prefix}${message}${suffix}`;
}

function analysisExitCode(error: FossilAnalysisError): number {
  if (error.code === "invalid_options") return 2;
  return 1;
}

function processAnalysisError(
  error: unknown,
  dependencies: FossilCliDependencies,
): number {
  if (!(error instanceof FossilAnalysisError)) throw error;
  const writeStderr =
    dependencies.stderr ?? process.stderr.write.bind(process.stderr);
  writeStderr(boundedAnalysisDiagnostic(error));
  return analysisExitCode(error);
}

function processError(
  error: unknown,
  dependencies: FossilCliDependencies,
): number {
  if (error instanceof FossilHelpDisplayed) return 0;
  if (error instanceof FossilUsageError) return error.exitCode;
  return processAnalysisError(error, dependencies);
}

/** Maps known process outcomes without changing the CLI boundary. */
export async function runFossilCliProcess(
  argv: readonly string[],
  dependencies: FossilCliDependencies,
): Promise<number> {
  try {
    await runFossilCli(argv, dependencies);
    return 0;
  } catch (error) {
    return processError(error, dependencies);
  }
}
