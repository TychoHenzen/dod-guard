/**
 * Spawn `claude -p` subprocesses pointed at the deepclaude proxy.
 *
 * Architecture:
 *   evomcp (MCP server) → spawns `claude -p` subprocesses
 *   → claude connects to deepclaude proxy on 127.0.0.1:3200
 *   → proxy translates Anthropic ↔ DeepSeek /anthropic endpoint
 *   → DeepSeek decides what to do, Claude Code harness executes tools
 *   → evomcp collects results, verifies, orchestrates repairs
 *
 * This gives DeepSeek full Claude Code tool access (files, shell, MCPs)
 * without building our own agent loop.
 */

import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Verdict } from "./types.js";

// ── Proxy config ──────────────────────────────────────────────────────

const PROXY_URL = "http://127.0.0.1:3200";
const DEEPSEEK_ANTHROPIC_ENDPOINT = "https://api.deepseek.com/anthropic";
const BACKENDS_JSON_PATH = path.join(os.homedir(), ".claude", "backends.json");

// ── API key resolution ────────────────────────────────────────────────

let _cachedBackendKey: string | null | undefined;

/**
 * Extract the API key from ~/.claude/backends.json for the default backend.
 * Mirrors the approach CustomClaude.ps1 uses: reads backends.json, finds the
 * default backend, returns its `apiKey` field.
 *
 * Result is cached after first read (backends.json rarely changes at runtime).
 */
export function getBackendApiKey(): string | null {
  if (_cachedBackendKey !== undefined) return _cachedBackendKey;

  try {
    if (!fs.existsSync(BACKENDS_JSON_PATH)) {
      _cachedBackendKey = null;
      return null;
    }
    const raw = fs.readFileSync(BACKENDS_JSON_PATH, "utf-8");
    const cfg = JSON.parse(raw) as {
      default?: string;
      backends?: Record<string, { apiKey?: string; proxy?: unknown }>;
    };
    const defaultName = cfg.default;
    if (!(defaultName && cfg.backends)) {
      _cachedBackendKey = null;
      return null;
    }
    const backend = cfg.backends[defaultName];
    if (!backend?.apiKey) {
      _cachedBackendKey = null;
      return null;
    }
    _cachedBackendKey = backend.apiKey;
    return backend.apiKey;
  } catch {
    _cachedBackendKey = null;
    return null;
  }
}

/**
 * Resolve the DeepSeek API key in priority order:
 *   1. Explicit option passed by caller
 *   2. DEEPSEEK_API_KEY environment variable
 *   3. ~/.claude/backends.json default backend apiKey
 *
 * Returns empty string if no key is found anywhere.
 */
export function resolveApiKey(optKey?: string): string {
  return optKey || process.env.DEEPSEEK_API_KEY || getBackendApiKey() || "";
}

/**
 * Where the API key was found. Used by the status tool for diagnostics.
 */
export function apiKeySource(optKey?: string): "option" | "env" | "backends_json" | "none" {
  if (optKey) return "option";
  if (process.env.DEEPSEEK_API_KEY) return "env";
  if (getBackendApiKey()) return "backends_json";
  return "none";
}

export interface AgentEnv {
  /** API key for DeepSeek. Falls back to DEEPSEEK_API_KEY env var. */
  apiKey?: string;
  /** Model name to use. Default: "deepseek-v4-pro[1m]" */
  model?: string;
  /** Proxy URL. Default: http://127.0.0.1:3200 */
  proxyUrl?: string;
}

export interface SpawnOptions {
  /** Working directory for the claude process. */
  cwd: string;
  /** System prompt to prepend (becomes --system-prompt-file). */
  systemPrompt?: string;
  /** Max output tokens (claude -p doesn't support this directly, but we cap timeout). */
  timeoutMs?: number;
  /** Additional env vars to pass. */
  env?: Record<string, string>;
  /** If true, use proxy mode (ANTHROPIC_BASE_URL → proxy). If false, direct to DeepSeek /anthropic. */
  useProxy?: boolean;
}

export interface AgentResult {
  /** Combined stdout + stderr from claude -p. */
  output: string;
  /** Exit code. 0 = success. */
  exitCode: number;
  /** Wall-clock duration in ms. */
  durationMs: number;
  /** Whether the process timed out. */
  timedOut: boolean;
}

// ── Proxy cost tracking ───────────────────────────────────────────────

export interface ProxyCost {
  input_tokens: number;
  output_tokens: number;
  requests: number;
}

export interface ProxyCostSnapshot {
  /** Per-backend token + request counts. */
  backends: Record<string, ProxyCost>;
  /** Sum of (input + output) tokens across all backends. */
  total_tokens: number;
  /** Estimated dollar cost. */
  total_cost: number;
}

/**
 * Snapshot the proxy's cumulative cost counters.
 * Returns null if the proxy is not reachable or /_proxy/cost is unavailable.
 */
export async function getProxyCost(proxyUrl?: string): Promise<ProxyCostSnapshot | null> {
  const url = `${proxyUrl ?? PROXY_URL}/_proxy/cost`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      backends?: Record<string, ProxyCost>;
      total_cost?: number;
    };
    let totalTokens = 0;
    const backends: Record<string, ProxyCost> = {};
    for (const [name, b] of Object.entries(data.backends ?? {})) {
      backends[name] = { ...b };
      totalTokens += (b.input_tokens ?? 0) + (b.output_tokens ?? 0);
    }
    return {
      backends,
      total_tokens: totalTokens,
      total_cost: data.total_cost ?? 0,
    };
  } catch {
    return null;
  }
}

// ── Proxy health check ────────────────────────────────────────────────

/**
 * Check if the deepclaude proxy is running and ready.
 */
export async function checkProxyHealth(proxyUrl?: string): Promise<boolean> {
  const url = `${proxyUrl ?? PROXY_URL}/_proxy/status`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const data = (await res.json()) as any;
    return data.mode !== undefined;
  } catch {
    return false;
  }
}

/**
 * Start the proxy if not already running.
 * Requires deepclaude repo at ~/deepclaude.
 * Returns true if proxy is ready (was already or started successfully).
 */
export async function ensureProxy(proxyUrl?: string): Promise<boolean> {
  const url = proxyUrl ?? PROXY_URL;
  const alive = await checkProxyHealth(url);
  if (alive) return true;

  // Try to start the proxy from ~/deepclaude
  const deepclaudeDir = path.join(os.homedir(), "deepclaude");
  if (!fs.existsSync(path.join(deepclaudeDir, "proxy", "start-proxy.js"))) {
    console.error("evomcp: deepclaude proxy not found at ~/deepclaude. Please install it first.");
    return false;
  }

  const apiKey = resolveApiKey();
  if (!apiKey) {
    console.error(
      "evomcp: No DeepSeek API key found (env DEEPSEEK_API_KEY or ~/.claude/backends.json). Cannot start proxy.",
    );
    return false;
  }

  try {
    const proc = spawn("node", ["proxy/start-proxy.js", "--mode", "deepseek", "--quiet"], {
      cwd: deepclaudeDir,
      env: { ...process.env, DEEPSEEK_API_KEY: apiKey },
      detached: true,
      stdio: "ignore",
    });
    proc.unref();

    // Wait for proxy to become healthy (up to 10s)
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await checkProxyHealth(url)) return true;
    }
    console.error("evomcp: proxy started but not responding.");
    return false;
  } catch (err) {
    console.error("evomcp: failed to start proxy:", err);
    return false;
  }
}

// ── Spawn claude -p ───────────────────────────────────────────────────

/**
 * Spawn a non-interactive `claude -p` process pointed at the proxy.
 *
 * Env vars set (matching CustomClaude.ps1):
 *   ANTHROPIC_BASE_URL = proxy URL (or direct DeepSeek /anthropic endpoint)
 *   ANTHROPIC_AUTH_TOKEN = DeepSeek API key
 *   ANTHROPIC_MODEL = deepseek model name
 *   CLAUDE_CODE_SKIP_AUTO_UPDATE = 1
 */
export async function spawnClaude(prompt: string, opts: SpawnOptions & AgentEnv): Promise<AgentResult> {
  const t0 = Date.now();
  const useProxy = opts.useProxy !== false;
  const apiKey = resolveApiKey(opts.apiKey);
  const model = opts.model || "deepseek-v4-pro[1m]";
  const proxyUrl = opts.proxyUrl ?? PROXY_URL;
  const timeoutMs = opts.timeoutMs ?? 300_000; // 5 min default

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CLAUDE_CODE_SKIP_AUTO_UPDATE: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    ANTHROPIC_BASE_URL: useProxy ? proxyUrl : DEEPSEEK_ANTHROPIC_ENDPOINT,
    ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: model,
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "deepseek-v4-flash[1m]",
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ...opts.env,
  };

  const args = ["-p", prompt];

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let tmpFile: string | undefined;

    if (opts.systemPrompt) {
      const tmpDir = os.tmpdir();
      tmpFile = path.join(tmpDir, `evomcp-system-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.md`);
      fs.writeFileSync(tmpFile, opts.systemPrompt, "utf-8");
      args.push("--system-prompt-file", tmpFile);
    }

    const cleanup = () => {
      if (tmpFile) {
        try {
          fs.unlinkSync(tmpFile);
        } catch {}
      }
    };

    const child = spawn("claude", args, {
      cwd: opts.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        // Give it 2s to cleanup, then force kill
        setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {}
        }, 2000);
        cleanup();
        resolve({
          output: `${stdout}\n${stderr}`,
          exitCode: -1,
          durationMs: Date.now() - t0,
          timedOut: true,
        });
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve({
          output: stdout + (stderr ? `\n${stderr}` : ""),
          exitCode: code ?? -1,
          durationMs: Date.now() - t0,
          timedOut: false,
        });
      }
    });

    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve({
          output: `Failed to spawn claude: ${err.message}`,
          exitCode: -1,
          durationMs: Date.now() - t0,
          timedOut: false,
        });
      }
    });
  });
}

/**
 * Spawn N claude -p instances in parallel with different prompts.
 * Returns results in order.
 */
export async function spawnClaudeN(prompts: string[], opts: SpawnOptions & AgentEnv): Promise<AgentResult[]> {
  const results = await Promise.allSettled(prompts.map((prompt) => spawnClaude(prompt, opts)));

  return results.map((r) => {
    if (r.status === "fulfilled") return r.value;
    return {
      output: `Promise rejected: ${String(r.reason)}`,
      exitCode: -1,
      durationMs: 0,
      timedOut: false,
    };
  });
}
// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Run a shell command and return its output + exit code.
 * Used for verify_cmd and fitness_cmd execution.
 */
export function runCommand(
  cmd: string,
  cwd: string,
  timeoutMs = 120_000,
): { output: string; exitCode: number; durationMs: number } {
  const t0 = Date.now();
  try {
    const output = execSync(cmd, {
      cwd,
      encoding: "utf-8",
      timeout: timeoutMs,
      stdio: "pipe",
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      output: output.slice(0, 10000),
      exitCode: 0,
      durationMs: Date.now() - t0,
    };
  } catch (err: any) {
    const stdout = err?.stdout ? String(err.stdout) : "";
    const stderr = err?.stderr ? String(err.stderr) : "";
    return {
      output: `${stdout}\n${stderr}`.slice(0, 10000),
      exitCode: err?.status ?? err?.code ?? 1,
      durationMs: Date.now() - t0,
    };
  }
}

/**
 * Extract a numeric score from command output.
 * Looks for the last number in stdout by default.
 */
export function extractScore(output: string): number | null {
  const numbers = output.match(/-?\d+\.?\d*/g);
  if (!numbers || numbers.length === 0) return null;
  return Number.parseFloat(numbers[numbers.length - 1]);
}

/**
 * Hash a failure signature for stuck detection.
 * Strips timestamps, line numbers, hex addresses, durations.
 */
/**
 * Convert a runCommand result to a Verdict (type-safe bridge between
 * the camelCase helper and snake_case Verdict interface).
 */
export function toVerdict(r: { output: string; exitCode: number; durationMs: number }): Verdict {
  return {
    passed: r.exitCode === 0,
    exit_code: r.exitCode,
    output: r.output,
    duration_ms: r.durationMs,
  };
}

export function hashFailure(output: string): string {
  const cleaned = output
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?/g, "<TIME>")
    .replace(/:\d+:\d+/g, ":<LINE>:<COL>")
    .replace(/0x[0-9a-fA-F]+/g, "<HEX>")
    .replace(/\/[^\s]+\/[^\s:]+:\d+/g, "<PATH>:<LINE>")
    .replace(/\d+\.\d+ms/g, "<DURATION>ms")
    .slice(0, 500);

  let hash = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// ── Prompt templates ──────────────────────────────────────────────────

/**
 * Build a diverse-strategy prompt for best-of-N sampling.
 * Each variant gets a different system prompt to force diversity.
 */
export function strategyPrompts(task: string, n: number, context?: string): string[] {
  const strategies = [
    "Implement the simplest possible solution that works. Minimal changes, maximum clarity.",
    "Implement a robust solution with comprehensive error handling, edge cases, and validation.",
    "Implement a performant solution — optimize for speed and efficiency over simplicity.",
    "Implement a modular solution — extract helpers, use clean abstractions, make it testable.",
    "Implement a defensive solution — validate inputs, handle all failure modes gracefully.",
    "Implement a functional-style solution — pure functions, immutable data, composable operations.",
    "Implement a pragmatic solution — get it working, handle the common case, defer complexity.",
    "Implement an elegant solution — concise, readable, idiomatic code that's a pleasure to maintain.",
  ];

  const prompts: string[] = [];
  for (let i = 0; i < n; i++) {
    const strategy = strategies[i % strategies.length];
    const contextBlock = context ? `\n\nContext:\n${context}` : "";
    prompts.push(
      `## Task\n${task}\n\n## Strategy\n${strategy}${contextBlock}\n\nImplement the changes needed. Use tools to read files, make edits, and verify your work. Commit when done.`,
    );
  }
  return prompts;
}

/**
 * Build a repair prompt with failure feedback.
 */
export function repairPrompt(task: string, failureOutput: string, attemptNum: number, context?: string): string {
  const contextBlock = context ? `\n\nContext:\n${context}` : "";
  return `## Task\n${task}\n\n## Previous attempt FAILED\nYour previous implementation failed verification. Here is the output:\n\n\`\`\`\n${failureOutput.slice(0, 3000)}\n\`\`\`\n\n## Instructions\nThis is repair attempt #${attemptNum}. Fix the specific issues shown above. Read the relevant files, understand what went wrong, and make targeted fixes. Do NOT rewrite everything — fix only what's broken.${contextBlock}`;
}

/**
 * Build an evolution mutation prompt.
 */
export function mutationPrompt(
  goal: string,
  currentCode: string,
  fitnessScore: number,
  elites: { code: string; score: number }[],
  context?: string,
): string {
  const eliteBlock =
    elites.length > 0
      ? `\n## Elite mutations (higher score = better)\n${elites
          .map((e, i) => `### Elite #${i + 1} (score=${e.score.toFixed(2)})\n\`\`\`\n${e.code}\n\`\`\``)
          .join("\n\n")}`
      : "";

  const contextBlock = context ? `\n\nContext:\n${context}` : "";

  return `## Goal\n${goal}\n\n## Current code (fitness = ${fitnessScore.toFixed(2)})\n\`\`\`\n${currentCode}\n\`\`\`\n${eliteBlock}\n\n## Instructions\nMutate this code to improve its fitness score. Be creative — try different algorithms, data structures, caching, early exits. Make targeted changes, not rewrites.${contextBlock}`;
}
