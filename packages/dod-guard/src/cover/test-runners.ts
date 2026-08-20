import { promises as fs } from "node:fs";
import * as path from "node:path";

export type TestRunnerConfigLoadResult = { config: Readonly<Record<string, unknown>> } | { unresolvedReason: string };

const CONFIG_PATH = "openspec/test-runners.json";

/** Load the consumer's language-keyed whole-file runner commands. */
export async function loadTestRunnerConfig(workspaceRoot: string): Promise<TestRunnerConfigLoadResult> {
  const configFile = path.join(workspaceRoot, ...CONFIG_PATH.split("/"));
  let content: string;
  try {
    content = await fs.readFile(configFile, "utf-8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { config: {} };
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { unresolvedReason: `${CONFIG_PATH} contains invalid JSON` };
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    return { unresolvedReason: `${CONFIG_PATH} must contain a JSON object keyed by language` };
  }

  return { config: parsed as Readonly<Record<string, unknown>> };
}
