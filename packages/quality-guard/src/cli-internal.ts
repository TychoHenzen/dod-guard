import process from "node:process";
import { runCheckCommand } from "./commit-gate/cli.js";

export function runQualityGuardInternalCheck(
  args: string[],
  root = process.cwd(),
): void {
  if (args[0] !== "check" || args[1] !== "--committed") {
    process.stdout.write(
      "Usage: quality-guard internal check --committed <ref>\n",
    );
    process.exitCode = 3;
    return;
  }
  const result = runCheckCommand(args, root);
  process.stdout.write(`${result.output}\n`);
  process.exitCode = result.exitCode;
}
