import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EXIT_OK, EXIT_REJECTED, runComplete } from "./complete/run.js";
import { runCoverage } from "./cover/run.js";

export function registerTools(server: McpServer): void {
  server.registerTool(
    "cover",
    {
      description: "Report OpenSpec scenario coverage for a consumer workspace.",
      inputSchema: {
        cwd: z.string().describe("Absolute path to the consumer workspace."),
        changeId: z.string().optional().describe("OpenSpec change id to scan."),
        all: z.boolean().optional().default(false).describe("Scan all main OpenSpec specifications."),
      },
    },
    async ({ cwd, changeId, all }) => {
      const result = await runCoverage({ cwd, changeId, all, writeBaseline: false });
      const serialized = JSON.stringify(result);
      return {
        content: [{ type: "text" as const, text: serialized }],
        structuredContent: JSON.parse(serialized),
      };
    },
  );

  server.registerTool(
    "complete",
    {
      description:
        "Mark a task complete after passing the completion gate. " +
        "Runs verify_cmd, checks for stub tests, and optionally asks an eval model " +
        "whether the test aligns with its claimed scenario.",
      inputSchema: {
        cwd: z.string().describe("Absolute path to the consumer workspace."),
        changeId: z.string().describe("OpenSpec change id."),
        taskId: z.string().describe("Task id from the change's tasks.md."),
      },
    },
    async ({ cwd, changeId, taskId }) => {
      const output: string[] = [];
      const errors: string[] = [];
      const io = {
        write: (s: string) => output.push(s),
        writeErr: (s: string) => errors.push(s),
      };
      const code = await runComplete({ cwd, changeId, taskId }, io);
      const result = {
        passed: code === EXIT_OK,
        rejected: code === EXIT_REJECTED,
        exitCode: code,
        output: output.join(""),
        errors: errors.join(""),
      };
      const serialized = JSON.stringify(result);
      return {
        content: [{ type: "text" as const, text: serialized }],
        structuredContent: JSON.parse(serialized),
      };
    },
  );
}
