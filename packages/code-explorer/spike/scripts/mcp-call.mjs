import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const separator = process.argv.indexOf("--");
const [method, paramsJson] = process.argv.slice(2, separator);
const [command, ...args] = process.argv.slice(separator + 1);
const outputPath = process.env.CODE_EXPLORER_SPIKE_OUTPUT;

if (!method || !paramsJson || separator < 0 || !command || !outputPath) {
  throw new Error("Usage: CODE_EXPLORER_SPIKE_OUTPUT=<path> node mcp-call.mjs <method> <params-json> -- <command> [args...]");
}

const child = spawn(command, args, { cwd: process.env.CODE_EXPLORER_SPIKE_CWD, shell: false, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
const messages = [];
const stderr = [];
let buffer = "";

child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => stderr.push(chunk));
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const end = buffer.indexOf("\n");
    if (end < 0) break;
    const line = buffer.slice(0, end).trim();
    buffer = buffer.slice(end + 1);
    if (line) messages.push(JSON.parse(line));
  }
});

function request(id, requestMethod, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method: requestMethod, params })}\n`);
}

function response(id, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${id}`)), timeoutMs);
    const poll = () => {
      const result = messages.find((message) => message.id === id);
      if (result) { clearTimeout(timeout); resolve(result); return; }
      setTimeout(poll, 10);
    };
    poll();
  });
}

const startedAt = Date.now();
request(1, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "code-explorer-spike", version: "1" } });
const initialize = await response(1, 30_000);
child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
request(2, "tools/call", { name: method, arguments: JSON.parse(paramsJson) });
const result = await response(2, 10_000);
child.stdin.end();
await new Promise((resolve) => child.once("exit", resolve));
await writeFile(outputPath, `${JSON.stringify({ command, args, method, params: JSON.parse(paramsJson), elapsed_ms: Date.now() - startedAt, initialize, result, stderr: stderr.join(""), messages }, null, 2)}\n`);
