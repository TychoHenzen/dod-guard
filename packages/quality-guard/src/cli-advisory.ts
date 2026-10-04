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

export function runRetiredQualityCommand(
  command: "check" | "acknowledge",
): void {
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "advisory",
        command,
        message:
          "The public CLI no longer provides commit or ledger acceptance.",
        nextStep:
          "Use report, test-quality, readability, or the normal MCP server for diagnostic evidence.",
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 0;
}
