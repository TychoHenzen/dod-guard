/**
 * Ollama claim-to-test alignment check. Sends a test body and a scenario
 * claim to a local ollama model and asks whether the test verifies the claim.
 *
 * Degrades gracefully: when ollama is unreachable or the model is not
 * configured, returns `{ available: false }` and the gate falls back to
 * the mechanical stub check alone.
 */
import { request } from "node:http";

interface OllamaResult {
  available: true;
  aligned: boolean;
  raw: string;
}

interface OllamaUnavailable {
  available: false;
  reason: string;
}

type OllamaCheckResult = OllamaResult | OllamaUnavailable;

const THINK_RE = /<think>[\s\S]*?<\/think>/g;

function buildPrompt(testCode: string, scenarioText: string): string {
  return `Does this test code verify this scenario?

## Test code
\`\`\`
${testCode}
\`\`\`

## Scenario
${scenarioText}

Answer YES if the test exercises the behavior the scenario describes.
Answer NO if the test is a stub, tests something unrelated, or does not cover the scenario's conditions.
One word answer: YES or NO.`;
}

function parseResponse(raw: string): boolean {
  const cleaned = raw.replace(THINK_RE, "").trim();
  // Look for the last YES or NO in the response
  const yesNo = cleaned.match(/\b(YES|NO)\b/gi);
  if (!yesNo) return false;
  return yesNo[yesNo.length - 1].toUpperCase() === "YES";
}

function ollamaGenerate(model: string, prompt: string, host: string, port: number, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, prompt, stream: false });

    const req = request(
      {
        hostname: host,
        port,
        path: "/api/generate",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
            resolve(parsed.response ?? "");
          } catch {
            reject(new Error("ollama returned invalid JSON"));
          }
        });
      },
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("ollama request timed out"));
    });

    req.write(body);
    req.end();
  });
}

interface OllamaConfig {
  model: string;
  host?: string;
  port?: number;
  timeoutMs?: number;
}

export function getOllamaConfig(): OllamaConfig | undefined {
  const model = process.env.DOD_GUARD_EVAL_MODEL;
  if (!model) return undefined;
  const host = process.env.DOD_GUARD_EVAL_HOST ?? "127.0.0.1";
  const port = Number.parseInt(process.env.DOD_GUARD_EVAL_PORT ?? "11434", 10);
  const timeoutMs = Number.parseInt(process.env.DOD_GUARD_EVAL_TIMEOUT ?? "120000", 10);
  return { model, host, port, timeoutMs };
}

export async function checkClaimAlignment(
  testCode: string,
  scenarioText: string,
  config: OllamaConfig,
): Promise<OllamaCheckResult> {
  const { model, host = "127.0.0.1", port = 11434, timeoutMs = 120_000 } = config;

  const prompt = buildPrompt(testCode, scenarioText);

  try {
    const raw = await ollamaGenerate(model, prompt, host, port, timeoutMs);
    return { available: true, aligned: parseResponse(raw), raw };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    if (message.includes("ECONNREFUSED") || message.includes("timed out")) {
      return { available: false, reason: `ollama unreachable: ${message}` };
    }
    return { available: false, reason: `ollama error: ${message}` };
  }
}
