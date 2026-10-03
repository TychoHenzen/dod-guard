import { readFileSync } from "node:fs";
import process from "node:process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as stdio from "@modelcontextprotocol/sdk/server/stdio.js";
import { runTestQualityCommand } from "./cli-test-quality.js";
import { runCheckCommand } from "./commit-gate/cli.js";
import {
  type HttpServerOptions,
  installHttpSignalHandlers,
  parseHttpCliOptions,
  type RunningHttpServer,
} from "./http.js";
import {
  checkPlaintextReadability,
  readabilityExitCode,
  unavailableReadabilityResult,
} from "./plaintext-readability.js";
import { runQualityReport } from "./report.js";

interface QualityGuardCliDependencies {
  createServer: () => McpServer;
  startHttp: (
    options?: Omit<HttpServerOptions, "serviceName" | "createMcpServer">,
  ) => Promise<RunningHttpServer>;
}

function runReportCommand(args: string[]): void {
  const root = args
    .find((arg) => arg.startsWith("--root="))
    ?.slice("--root=".length);
  process.stdout.write(
    `${JSON.stringify(runQualityReport({ root }), null, 2)}\n`,
  );
}

function runCheckCommandLine(args: string[]): void {
  const result = runCheckCommand(args);
  process.stdout.write(`${result.output}\n`);
  process.exitCode = result.exitCode;
}

function runReadabilityCommand(args: string[]): void {
  if (args[1] !== "--stdin" || args.length !== 2) {
    process.stdout.write("Usage: quality-guard readability --stdin\n");
    process.exitCode = 3;
    return;
  }
  let text: string;
  try {
    text = readFileSync(0, "utf8");
  } catch (error) {
    const result = unavailableReadabilityResult(
      `could not read stdin: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 0;
    return;
  }
  const result = checkPlaintextReadability(text);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = readabilityExitCode(result.status);
}

function isCheckCommand(args: string[]): boolean {
  return args[0] === "check" || args[0] === "acknowledge";
}

export async function runQualityGuardCli(
  args: string[],
  dependencies: QualityGuardCliDependencies,
): Promise<void> {
  if (args[0] === "test-quality") return runTestQualityCommand(args);
  if (args[0] === "report") return runReportCommand(args);
  if (args[0] === "readability") return runReadabilityCommand(args);
  if (args[0] === "--http") {
    const running = await dependencies.startHttp(
      parseHttpCliOptions(args.slice(1)),
    );
    installHttpSignalHandlers(running);
    process.stderr.write(
      `quality-guard HTTP ready at http://${running.host}:${running.port}${running.path}\n`,
    );
    return;
  }
  if (isCheckCommand(args)) return runCheckCommandLine(args);
  const server = dependencies.createServer();
  await server.connect(new stdio.StdioServerTransport());
}
