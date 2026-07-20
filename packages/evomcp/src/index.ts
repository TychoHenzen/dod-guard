/**
 * evomcp — Evolutionary solver MCP server.
 *
 * Two tools:
 *   solve  — Best-of-N + repair chains for binary fitness (feature work)
 *   evolve — Population-based evolution for scalar fitness (optimization)
 *
 * Both spawn `claude -p` subprocesses pointed at the deepclaude proxy,
 * giving DeepSeek full Claude Code tool access. evomcp orchestrates
 * parallel instances, verification, repair loops, and escalation.
 *
 * Context economy: the parent Claude session never sees 19 failed
 * candidates — only the winning patch + report comes back.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { apiKeySource, checkProxyHealth } from "./agent.js";
import { evolve } from "./evolve.js";
import { solve } from "./solve.js";

const server = new McpServer({
  name: "evomcp",
  version: "0.1.12",
});

// ── Shared schemas ──────────────────────────────────────────────────

const TaskSpecSchema = z.object({
  goal: z.string().describe("Natural-language description of what to build/fix/optimize"),
  verify_cmd: z
    .string()
    .describe(
      "Shell command that returns exit 0 on success, non-zero on failure. e.g. 'npm test -- --testNamePattern=auth'",
    ),
  cwd: z.string().describe("Working directory for running verify_cmd (absolute path)"),
  budget_tokens: z.number().optional().describe("Maximum DeepSeek API tokens to spend (default ~100k)"),
  fanout: z.number().optional().describe("Number of parallel claude -p instances (default 5, max 16)"),
  allowed_files: z.array(z.string()).optional().describe("Files the solver is allowed to modify (glob patterns)"),
  api_base: z.string().optional().describe("Base URL override for DeepSeek-compatible API"),
  strategy: z
    .enum(["auto", "best-of-n", "evolve"])
    .optional()
    .default("auto")
    .describe("Strategy hint. 'auto' inspects verify_cmd for scalar output → evolve, else best-of-n"),
  context: z.string().optional().describe("Relevant context: file snippets, existing test output, constraints"),
  model: z.string().optional().describe("Model override (default: deepseek-v4-pro[1m])"),
  api_key: z.string().optional().describe("DeepSeek API key. Falls back to DEEPSEEK_API_KEY env var"),
  build_cmd: z.string().optional().describe("Build command (e.g. 'npm run build'). Runs as gate before verify."),
  test_cmd: z.string().optional().describe("Test command (e.g. 'npm test'). Runs as gate before verify."),
  lint_cmd: z.string().optional().describe("Lint command (e.g. 'npx biome check'). Runs as first gate."),
  held_out_tests: z
    .string()
    .optional()
    .describe("Glob pattern for tests hidden from implementer. Run only at merge gate."),
});

const EvolveSpecSchema = z.object({
  goal: z.string().describe("What to optimize (natural language)"),
  fitness_cmd: z
    .string()
    .describe("Shell command that emits a numeric fitness score to stdout (lower = better by default)"),
  cwd: z.string().describe("Working directory"),
  target_files: z.array(z.string()).describe("Files the solver is allowed to mutate (glob patterns)"),
  generations: z.number().optional().default(5).describe("Number of generations"),
  population_size: z.number().optional().default(6).describe("Population size per generation"),
  budget_tokens: z.number().optional().describe("Maximum DeepSeek API tokens"),
  higher_is_better: z.boolean().optional().default(false).describe("If true, higher fitness score is better"),
  context: z.string().optional().describe("Context for the mutator"),
  model: z.string().optional().describe("Model override"),
  api_key: z.string().optional().describe("DeepSeek API key"),
  build_cmd: z.string().optional().describe("Build command. Runs as gate during fitness evaluation."),
  test_cmd: z.string().optional().describe("Test command. Runs as gate during fitness evaluation."),
  lint_cmd: z.string().optional().describe("Lint command. Runs as first gate during fitness evaluation."),
  mutation_cmd: z.string().optional().describe("Mutation testing command (e.g. 'npx stryker run')."),
});

// ── solve tool ──────────────────────────────────────────────────────

server.tool(
  "solve",
  `Solve a feature/bug task using best-of-N strategy with repair chains.

Spawns N parallel 'claude -p' instances pointed at the deepclaude proxy
(DeepSeek as LLM, Claude Code harness for tool execution). Each instance
gets a different strategy prompt for diversity.

Flow:
1. N parallel claude -p instances, each with different approach
2. Verify each result against verify_cmd
3. Failed candidates get up to 3 repair iterations with failure feedback
4. Stuck detection: same failure after repair → kill lineage
5. Returns first passing patch + verification report
6. If all lineages fail, returns escalation report for parent Claude

Requires: deepclaude proxy on 127.0.0.1:3200 (or DEEPSEEK_API_KEY env var).`,
  {
    spec: TaskSpecSchema.describe("Task specification"),
  },
  async ({ spec }) => {
    const result = await solve(spec, (msg) => {
      // Progress is logged to stderr so it doesn't interfere with MCP protocol
      process.stderr.write(`[evomcp] ${msg}\n`);
    });

    return {
      content: [
        {
          type: "text" as const,
          text: formatSolveResult(result),
        },
      ],
    };
  },
);

// ── evolve tool ─────────────────────────────────────────────────────

server.tool(
  "evolve",
  `Optimize code using scalar-fitness evolution.

Uses 'claude -p' (DeepSeek) as the mutation operator across N generations.
Each generation: spawn population_size mutations, apply patches, measure
fitness via fitness_cmd, select elites for next generation.

Best for: "make this function faster", "reduce memory", "improve coverage",
"lower complexity score" — anything with a numeric fitness metric.

Requires: deepclaude proxy on 127.0.0.1:3200 (or DEEPSEEK_API_KEY env var).`,
  {
    spec: EvolveSpecSchema.describe("Evolution specification"),
  },
  async ({ spec }) => {
    const result = await evolve(spec, (msg) => {
      process.stderr.write(`[evomcp] ${msg}\n`);
    });

    return {
      content: [
        {
          type: "text" as const,
          text: formatEvolveResult(result),
        },
      ],
    };
  },
);

// ── status tool ─────────────────────────────────────────────────────

server.tool("status", "Check if the deepclaude proxy is running and ready.", {}, async () => {
  const proxyAlive = await checkProxyHealth();
  const keySource = apiKeySource();
  const keyAvailable = keySource !== "none";

  const keyLabel: Record<string, string> = {
    option: "SET (option)",
    env: "SET (DEEPSEEK_API_KEY env)",
    backends_json: "SET (backends.json)",
    none: "NOT SET",
  };

  return {
    content: [
      {
        type: "text" as const,
        text: [
          `Proxy (127.0.0.1:3200): ${proxyAlive ? "RUNNING" : "NOT FOUND"}`,
          `API key: ${keyLabel[keySource]}`,
          "",
          proxyAlive
            ? "Ready for solve/evolve calls."
            : keyAvailable
              ? "Will attempt direct mode (DeepSeek /anthropic endpoint)."
              : "Set DEEPSEEK_API_KEY env var, configure backends.json, or start deepclaude proxy.",
        ].join("\n"),
      },
    ],
  };
});

// ── hello tool ───────────────────────────────────────────────────────

server.tool(
  "hello",
  "Say hello world with a defensive greeting. Returns a greeting message for the given name.",
  {
    name: z.string().optional().describe("Name to greet. Defaults to 'World' if omitted."),
  },
  async ({ name }) => {
    return {
      content: [
        {
          type: "text" as const,
          text: formatHello(name),
        },
      ],
    };
  },
);

// ── Formatting ─────────────────────────────────────────────────────────

function formatHello(raw?: string): string {
  // Defensive: sanitize and validate input
  const sanitized = (raw ?? "").trim().replace(/[^\w\s'-]/g, "");
  const name = sanitized.length > 0 ? sanitized : "World";

  // Defensive: max length guard against abuse
  const displayName = name.length > 100 ? `${name.slice(0, 100)}...` : name;

  return `Hello, ${displayName}!`;
}

function formatSolveResult(result: Awaited<ReturnType<typeof solve>>): string {
  if (result.outcome === "pass") {
    return [
      "## Solve: PASSED",
      "",
      "### Patch",
      "```",
      result.patch?.slice(0, 5000) ?? "(no patch)",
      "```",
      "",
      "### Verification",
      "```",
      result.verification_report?.slice(0, 3000) ?? "(no report)",
      "```",
      "",
      "### Stats",
      `- Plans: ${result.stats.plans_sampled}`,
      `- Candidates: ${result.stats.candidates_generated}`,
      `- Tokens: ${result.stats.tokens_consumed >= 0 ? String(result.stats.tokens_consumed) : "N/A"}`,
      `- Duration: ${(result.stats.duration_ms / 1000).toFixed(1)}s`,
      `- Model: ${result.stats.model}`,
    ].join("\n");
  }

  const diagLines: string[] = [];
  if (result.escalation?.lineage_diagnostics && result.escalation.lineage_diagnostics.length > 0) {
    diagLines.push("### Lineage Diagnostics", "");
    for (const d of result.escalation.lineage_diagnostics) {
      const statusEmoji =
        d.final_status === "passed"
          ? "✅"
          : d.final_status === "failed"
            ? "❌"
            : d.final_status === "stuck"
              ? "🔁"
              : d.final_status === "no_output"
                ? "🤫"
                : "⏱️";
      diagLines.push(
        `| ${statusEmoji} | ${d.lineage_id} | ${d.strategy} | repairs=${d.repair_attempts} | ${d.timed_out ? "TIMED OUT" : d.claude_no_output ? `NO OUTPUT (exit=${d.claude_exit_code})` : `verify_exit=${d.verify_exit_code ?? "N/A"}`} |`,
      );
      if (d.claude_no_output) {
        diagLines.push(`  ⚠️ \`claude -p\` produced NO output — proxy or API key issue?`);
      } else if (d.timed_out) {
        diagLines.push(`  ⚠️ \`claude -p\` timed out — increase timeout or simplify task`);
      }
    }
    diagLines.push("");
  }

  return [
    "## Solve: ESCALATED",
    "",
    "All lineages exhausted. Requires smarter model intervention.",
    "",
    "### Escalation Report",
    `- Lineages attempted: ${result.escalation?.lineages_attempted}`,
    `- Failure signature: ${result.escalation?.failure_signature}`,
    `- Summary: ${result.escalation?.summary}`,
    ...diagLines,
    "### Best Partial Output",
    "```",
    result.escalation?.best_output?.slice(0, 2000) ?? "(none)",
    "```",
    "",
    "### Stats",
    `- Plans: ${result.stats.plans_sampled}`,
    `- Candidates: ${result.stats.candidates_generated}`,
    `- Tokens: ${result.stats.tokens_consumed}`,
    `- Duration: ${(result.stats.duration_ms / 1000).toFixed(1)}s`,
    `- Model: ${result.stats.model}`,
    "",
    "ACTION: Claude should inspect the failure signature and solve the stuck sub-problem directly, then re-invoke solve with revised context.",
  ].join("\n");
}

function formatEvolveResult(result: Awaited<ReturnType<typeof evolve>>): string {
  const improvement = result.baseline_score - result.best_score;
  const pct = result.baseline_score !== 0 ? ((improvement / Math.abs(result.baseline_score)) * 100).toFixed(1) : "N/A";

  return [
    "## Evolve: COMPLETE",
    "",
    "### Results",
    `- Baseline: ${result.baseline_score.toFixed(2)}`,
    `- Final: ${result.best_score.toFixed(2)}`,
    `- Improvement: ${improvement.toFixed(2)} (${pct}%)`,
    "",
    "### Fitness History",
    "| Gen | Best | Mean |",
    "|-----|------|------|",
    ...result.fitness_history.map(
      (h) => `| ${h.generation} | ${h.best_score.toFixed(2)} | ${h.mean_score.toFixed(2)} |`,
    ),
    "",
    "### Best Patch",
    "```diff",
    result.best_patch.slice(0, 5000),
    "```",
    "",
    "### Verification",
    "```",
    result.verification_report.slice(0, 3000),
    "```",
    "",
    "### Stats",
    `- Candidates: ${result.stats.candidates_generated}`,
    `- Tokens: ${result.stats.tokens_consumed >= 0 ? String(result.stats.tokens_consumed) : "N/A"}`,
    `- Duration: ${(result.stats.duration_ms / 1000).toFixed(1)}s`,
    `- Model: ${result.stats.model}`,
  ].join("\n");
}

import { fileURLToPath } from "node:url";

const _filename = fileURLToPath(import.meta.url);

// ── Start (only when run directly, not when imported by tests) ──────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] === _filename) {
  main().catch((err) => {
    process.stderr.write(`evomcp MCP server failed: ${err}\n`);
    process.exit(1);
  });
}
