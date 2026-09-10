import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { renderDecision, runStagedCheck } from "./commit-gate/cli.js";
import { text, toolError } from "./tool-response.js";

function commitGateResponse(input: {
  root: string;
  intent?: "change" | "refactor";
  target?: string;
}) {
  if (input.intent === "refactor" && !input.target)
    return text("ERROR: Usage error: refactor intent requires --target");
  return text(
    renderDecision(
      runStagedCheck(input.root, {
        json: true,
        intent: input.intent ?? "change",
        target: input.target,
      }),
      true,
    ),
  );
}

async function commitGateTool(input: {
  root: string;
  intent?: "change" | "refactor";
  target?: string;
}) {
  try {
    return commitGateResponse(input);
  } catch (err) {
    return toolError(err);
  }
}

export function registerQualityCommitGate(server: McpServer): void {
  server.tool(
    "quality_commit_gate",
    "Judge staged source content through the authoritative commit decision. " +
      "Returns a stable JSON verdict, fingerprint, and ordered findings.",
    {
      root: z.string().min(1).describe("Repository root"),
      intent: z
        .enum(["change", "refactor"])
        .optional()
        .describe("Change intent. Defaults to change."),
      target: z
        .string()
        .optional()
        .describe(
          "Repository-relative responsibility-map path required for refactor " +
            "intent",
        ),
    },
    commitGateTool,
  );
}
