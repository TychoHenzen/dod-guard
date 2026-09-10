import type { CommandResult } from "./command-result.js";
import { runAcknowledgeCommand } from "./cli-command-acknowledge.js";
import { runCommittedCommand, runStagedCommand } from "./cli-command-check.js";
export function runCheckCommand(
  args: string[],
  root = process.cwd(),
): CommandResult {
  if (args[0] === "acknowledge") return runAcknowledgeCommand(args, root);
  if (args[0] === "check" && args[1] === "--committed")
    return runCommittedCommand(args, root);
  return runStagedCommand(args, root);
}
