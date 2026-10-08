// Stand-in for the codex CLI in advisor-contract.test.mjs. ADVISOR_MODE picks
// the behavior; ADVISOR_RECORD collects every exec invocation.
import { readFile, writeFile } from "node:fs/promises";

const ADVICE = JSON.stringify({ advice: "Use the smallest safe change." });
const args = process.argv.slice(2);
const input = await new Promise((resolve) => {
  let value = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    value += chunk;
  });
  process.stdin.on("end", () => resolve(value));
});

function event(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

// The JSONL stream a real one-turn, tool-free advisor run prints.
function oneTurn(text = ADVICE) {
  event({ type: "thread.started", thread_id: "fixture-thread" });
  event({ type: "turn.started" });
  event({ type: "item.completed", item: { id: "item_0", type: "agent_message", text } });
  event({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } });
}

function fallbackEvent(model) {
  const message =
    `Model metadata for ${model} not found. Defaulting to fallback metadata; ` +
    "this can degrade performance and cause issues.";
  return `${JSON.stringify({ type: "item.completed", item: { type: "error", message } })}\n`;
}

async function answerHelp() {
  const failOnce = process.env.ADVISOR_MODE === "fail-once";
  if (failOnce && !(await readFile(process.env.ADVISOR_STATE, "utf8").catch(() => ""))) {
    await writeFile(process.env.ADVISOR_STATE, "failed");
    process.stderr.write("fixture launch failure");
    process.exit(23);
  }
  if (process.env.ADVISOR_MODE === "unsupported-help") {
    process.stderr.write("unexpected argument '--ask-for-approval'");
    process.exit(2);
  }
  process.stdout.write("--approve-for-me");
  process.exit(0);
}

async function recordInvocation() {
  const previous = await readFile(process.env.ADVISOR_RECORD, "utf8").catch(() => "[]");
  const records = JSON.parse(previous);
  records.push({ args, cwd: process.cwd(), input });
  await writeFile(process.env.ADVISOR_RECORD, JSON.stringify(records));
}

// Modes listed here print their own event stream; every other mode prints the
// stream of one clean turn first.
const OWN_STREAM = new Set(["unrelated-output", "tool-use", "two-turns", "reasoning"]);

const MODES = {
  nonzero: () => {
    process.stderr.write("fixture failure");
    process.exit(7);
  },
  "missing-output": () => undefined,
  "empty-output": (outputPath) => writeFile(outputPath, ""),
  malformed: (outputPath) => writeFile(outputPath, "{"),
  "invalid-schema": (outputPath) => writeFile(outputPath, JSON.stringify({ advice: 42 })),
  whitespace: (outputPath) => writeFile(outputPath, JSON.stringify({ advice: "   " })),
  hang: () => new Promise(() => {}),
  slow: async (outputPath) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await writeFile(outputPath, ADVICE);
  },
  "large-output": () => {
    process.stdout.write("x".repeat(8 * 1024 * 1024 + 1));
  },
  fallback: async (outputPath) => {
    await writeFile(outputPath, ADVICE);
    process.stdout.write(fallbackEvent("gpt-test-model"));
  },
  "different-model-fallback": async (outputPath) => {
    await writeFile(outputPath, ADVICE);
    process.stdout.write(fallbackEvent("gpt-other-model"));
  },
  "unrelated-output": async (outputPath) => {
    await writeFile(outputPath, ADVICE);
    process.stdout.write("fixture banner\n");
    event({ type: "turn.started" });
    event({ type: "item.completed", item: { type: "agent_message", text: "fallback metadata is unrelated" } });
    process.stdout.write("not a JSON event\n");
  },
  "tool-use": async (outputPath) => {
    await writeFile(outputPath, ADVICE);
    event({ type: "turn.started" });
    event({ type: "item.started", item: { id: "item_0", type: "command_execution", command: "git status" } });
    event({ type: "item.completed", item: { id: "item_0", type: "command_execution", command: "git status" } });
    event({ type: "item.completed", item: { id: "item_1", type: "agent_message", text: ADVICE } });
  },
  "two-turns": async (outputPath) => {
    await writeFile(outputPath, ADVICE);
    event({ type: "turn.started" });
    event({ type: "item.completed", item: { type: "agent_message", text: "first" } });
    event({ type: "turn.started" });
    event({ type: "item.completed", item: { type: "agent_message", text: ADVICE } });
  },
  reasoning: async (outputPath) => {
    await writeFile(outputPath, ADVICE);
    event({ type: "turn.started" });
    event({ type: "item.completed", item: { type: "reasoning", text: "weighing the options" } });
    event({ type: "item.completed", item: { type: "agent_message", text: ADVICE } });
  },
};

if (args[0] === "--version") {
  process.stdout.write("codex-cli fixture");
  process.exit(0);
}
if (args[0] === "exec" && args[1] === "--help") {
  await answerHelp();
}
await recordInvocation();
const outputIndex = args.indexOf("--output-last-message");
const outputPath = outputIndex === -1 ? undefined : args[outputIndex + 1];
if (!OWN_STREAM.has(process.env.ADVISOR_MODE)) oneTurn();
const mode = MODES[process.env.ADVISOR_MODE] ?? ((path) => writeFile(path, ADVICE));
await mode(outputPath);
