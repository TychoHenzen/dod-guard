import { spawnSync } from "node:child_process";
import { executeTextstat } from "./plaintext-textstat-process.js";
import type { TextstatResult } from "./plaintext-textstat-result.js";
import type { Spawn } from "./plaintext-textstat-spawn.js";

const TEXTSTAT_PYTHON = [
  "import json, sys, textstat",
  "text = sys.stdin.read()",
  "print(json.dumps({",
  "  'measures': {",
  "    'fleschReadingEase': textstat.flesch_reading_ease(text),",
  "    'fleschKincaidGrade': textstat.flesch_kincaid_grade(text),",
  "  }",
  "}))",
].join("\n");

function configuredArgs(): string[] | TextstatResult {
  const configured = process.env.QUALITY_GUARD_TEXTSTAT_ARGS;
  if (!configured) return ["-c", TEXTSTAT_PYTHON];
  try {
    const parsed: unknown = JSON.parse(configured);
    if (
      !Array.isArray(parsed) ||
      parsed.some((argument) => typeof argument !== "string")
    )
      return {
        status: "unavailable",
        reason: "QUALITY_GUARD_TEXTSTAT_ARGS must be a JSON array of strings",
      };
    return parsed;
  } catch {
    return {
      status: "unavailable",
      reason: "QUALITY_GUARD_TEXTSTAT_ARGS is not valid JSON",
    };
  }
}

function argsFor(options: { args?: string[] }): string[] | TextstatResult {
  return options.args === undefined ? configuredArgs() : options.args;
}

function commandFor(options: { command?: string }): string {
  return options.command ?? process.env.QUALITY_GUARD_TEXTSTAT_COMMAND ?? "python";
}

function shouldIsolate(options: { command?: string; args?: string[] }): boolean {
  return (
    options.command === undefined &&
    options.args === undefined &&
    !process.env.QUALITY_GUARD_TEXTSTAT_COMMAND &&
    !process.env.QUALITY_GUARD_TEXTSTAT_ARGS
  );
}

export function runTextstat(
  text: string,
  options: { command?: string; args?: string[]; spawn?: Spawn } = {},
): TextstatResult {
  const args = argsFor(options);
  if (!Array.isArray(args)) return args;
  return executeTextstat({
    text,
    command: commandFor(options),
    args,
    spawn: options.spawn ?? (spawnSync as Spawn),
    isolated: shouldIsolate(options),
  });
}
