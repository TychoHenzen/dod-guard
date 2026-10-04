import process from "node:process";
import { runCheckCommand } from "./commit-gate/cli.js";

export function shouldRunInternalCheck(args: string[]): boolean {
  if (args[0] !== "check") return false;
  if (args[1] === "--staged")
    return process.env.QUALITY_GUARD_INTERNAL_CHECK === "1";
  if (args[1] !== "--committed") return false;
  return (
    process.env.QUALITY_GUARD_INTERNAL_CHECK === "1" ||
    process.env.QUALITY_GUARD_INTERNAL_COMMITTED_CHECK === "1"
  );
}

export function runQualityGuardInternalCheck(
  args: string[],
  root = process.cwd(),
): void {
  const mode = args[1];
  if (args[0] !== "check" || (mode !== "--staged" && mode !== "--committed")) {
    process.stdout.write(
      "Usage: QUALITY_GUARD_INTERNAL_CHECK=1 quality-guard check " +
        "--staged|--committed [options]\n",
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
