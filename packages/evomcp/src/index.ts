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

import { readFileSync, realpathSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { apiKeySource, checkProxyHealth } from "./agent.js";
import { evolve } from "./evolve.js";
import { orchestrateSolve } from "./orchestrate.js";
import { formatEvolveResult, formatOrchestrateResult, formatSolveResult } from "./render.js";
import { detectScalarFitness, solve } from "./solve.js";
import type { EvolveSpec } from "./types.js";

// Read from package.json so the reported version can never drift from the published one.
const _pkg = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf-8"),
);

const server = new McpServer({
  name: "evomcp",
  version: _pkg.version,
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
    const onProgress = (msg: string) => process.stderr.write(`[evomcp] ${msg}\n`);

    // ── Strategy dispatch ──────────────────────────────────────────────
    const shouldEvolve =
      spec.strategy === "evolve" || (spec.strategy === "auto" && detectScalarFitness(spec.verify_cmd, spec.cwd));

    if (shouldEvolve) {
      const evolveSpec: EvolveSpec = {
        goal: spec.goal,
        fitness_cmd: spec.verify_cmd,
        cwd: spec.cwd,
        target_files: spec.allowed_files ?? [],
        budget_tokens: spec.budget_tokens,
        context: spec.context,
        model: spec.model,
        api_key: spec.api_key,
        build_cmd: spec.build_cmd,
        test_cmd: spec.test_cmd,
        lint_cmd: spec.lint_cmd,
        generations: 5,
        population_size: 6,
      };
      onProgress?.(`Strategy '${spec.strategy}' routed to evolve (scalar fitness detected)`);
      const result = await evolve(evolveSpec, onProgress);
      return {
        content: [{ type: "text" as const, text: formatEvolveResult(result) }],
      };
    }

    const result = await solve(spec, onProgress);

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

// ── Orchestrate spec schema ────────────────────────────────────────────

const OrchestrateSpecSchema = TaskSpecSchema.extend({
  playbook: z
    .enum(["bugfix", "feature", "refactor", "test-harden", "reconcile", "review"])
    .optional()
    .default("bugfix")
    .describe("Playbook type — selects the stage sequence"),
  mutation_cmd: z
    .string()
    .optional()
    .describe("Mutation testing command (e.g. 'npx stryker run'). Runs after implementation passes."),
});

// ── orchestrate tool ──────────────────────────────────────────────────

server.tool(
  "orchestrate",
  `Drive the full solve lifecycle through SPEC -> TEST_AUTHOR -> IMPLEMENT -> HARDEN -> REVIEW -> MERGE.

The orchestrate tool wraps the existing "solve" tool as the IMPLEMENT stage,
adding gates for specification validation, test readiness, test hardening,
human review, and merge verification.

Stages:
- SPEC: Requirements gate (human confirmation)
- TEST_AUTHOR: Test readiness gate (human confirmation)
- IMPLEMENT: Runs solve() with the provided spec
- HARDEN: Mutation testing (if mutation_cmd provided) or human gate
- REVIEW: Human review gate
- MERGE: Held-out test execution

Each stage enforces entry gates: cannot skip spec, cannot implement without
red tests, cannot harden without passing implementation, etc.`,
  {
    spec: OrchestrateSpecSchema.describe("Orchestration specification"),
  },
  async ({ spec }) => {
    const result = await orchestrateSolve(spec as any, (msg: string) => {
      process.stderr.write(`[evomcp] ${msg}\n`);
    });

    return {
      content: [
        {
          type: "text" as const,
          text: formatOrchestrateResult(result),
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

const _filename = fileURLToPath(import.meta.url);

// ── Start (only when run directly, not when imported by tests) ──────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function isMainModule(): boolean {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return realpathSync(arg) === realpathSync(_filename);
  } catch {
    return arg === _filename;
  }
}

if (isMainModule()) {
  main().catch((err) => {
    process.stderr.write(`evomcp MCP server failed: ${err}\n`);
    process.exit(1);
  });
}
