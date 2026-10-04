import process from "node:process";

export function runRetiredQualityCommand(command: "check" | "acknowledge"): void {
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
