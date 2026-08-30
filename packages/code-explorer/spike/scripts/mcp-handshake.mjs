import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const [command, ...args] = process.argv.slice(2);
const outputPath = process.env.CODE_EXPLORER_SPIKE_OUTPUT;

if (!command || !outputPath) {
  throw new Error("Usage: CODE_EXPLORER_SPIKE_OUTPUT=<path> node mcp-handshake.mjs <command> [args...]");
}

const child = spawn(command, args, {
  cwd: process.env.CODE_EXPLORER_SPIKE_CWD,
  shell: false,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
});

const messages = [];
const stderr = [];
let buffer = "";
let nextId = 1;

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => stderr.push(chunk));
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const lineEnd = buffer.indexOf("\n");
    if (lineEnd < 0) break;
    const line = buffer.slice(0, lineEnd).trim();
    buffer = buffer.slice(lineEnd + 1);
    if (!line) continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      messages.push({ unparseable: line });
    }
  }
});

function send(method, params) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return id;
}

function waitFor(id, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`Timed out waiting for request ${id}`)), timeoutMs);
    const poll = () => {
      const message = messages.find((candidate) => candidate.id === id);
      if (message) {
        clearTimeout(deadline);
        resolve(message);
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

const startedAt = Date.now();
const initializeId = send("initialize", {
  protocolVersion: "2025-11-25",
  capabilities: {},
  clientInfo: { name: "code-explorer-spike", version: "1" },
});

const initialize = await waitFor(initializeId, 30_000);
child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
const toolListId = send("tools/list", {});
const tools = await waitFor(toolListId, 10_000);

child.stdin.end();
await new Promise((resolve) => child.once("exit", resolve));

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      command,
      args,
      cwd: process.env.CODE_EXPLORER_SPIKE_CWD,
      elapsed_ms: Date.now() - startedAt,
      initialize,
      tools,
      stderr: stderr.join(""),
      messages,
    },
    null,
    2,
  )}\n`,
);
