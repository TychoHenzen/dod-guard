import { existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createLspFrameStream } from "./lsp-frame-stream.mjs";

const [executable, fixture, language, ...prefixArguments] = process.argv.slice(2);
if (!(executable && fixture && language)) throw new Error("usage: lsp-sentinel <executable> <fixture> <language>");
const initializationOptions =
  language === "rust"
    ? { cargo: { buildScripts: { enable: false }, procMacro: { enable: false }, checkOnSave: { enable: false } }, projectConfiguration: { enable: false } }
    : language === "csharp"
      ? { analyzers: false, source_generators: false }
      : { use_project_environment: false, mirror_only: true };
const request = { jsonrpc: "2.0", id: 1, method: "initialize", params: { processId: null, rootUri: `file:///${fixture.replaceAll("\\", "/")}`, capabilities: {}, initializationOptions } };

const child = spawn(executable, [...prefixArguments, ...(language === "rust" ? [] : ["--stdio"])], {
  cwd: fixture,
  shell: false,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, CODE_EXPLORER_SENTINEL_PATH: `${fixture}/SENTINEL_SIDE_EFFECT` },
});
let stderr = "";
const frames = [];
let initialized = false;
const sideEffectAbsent = () =>
  language === "csharp"
    ? !existsSync(`${fixture}/SENTINEL_SIDE_EFFECT.analyzer-initialize`) &&
      !existsSync(`${fixture}/SENTINEL_SIDE_EFFECT.generator-initialize`)
    : !existsSync(`${fixture}/SENTINEL_SIDE_EFFECT`);
for (const suffix of language === "csharp" ? [".analyzer-initialize", ".generator-initialize"] : [""])
  rmSync(`${fixture}/SENTINEL_SIDE_EFFECT${suffix}`, { force: true });
const timer = setTimeout(() => {
  child.kill();
  process.stdout.write(
    `${JSON.stringify({ initialized: false, side_effect_absent: sideEffectAbsent(), timeout: true, stderr })}\n`,
  );
}, 30_000);
child.stderr.on("data", (chunk) => (stderr += chunk));
const handleFrame = (message) => {
  frames.push(message.method ?? `id:${message.id ?? "none"}`);
  if (message.id === 1 && !initialized) {
    initialized = true;
    const initializedNotification = { jsonrpc: "2.0", method: "initialized", params: {} };
    const navigation =
      language === "csharp"
        ? [
            { jsonrpc: "2.0", method: "textDocument/didOpen", params: { textDocument: { uri: `file:///${resolve(fixture, "Fixture.cs").replaceAll("\\", "/")}`, languageId: "csharp", version: 1, text: "public static class Fixture { public static void Run() {} }\n" } } },
            { jsonrpc: "2.0", id: 2, method: "textDocument/definition", params: { textDocument: { uri: `file:///${resolve(fixture, "Fixture.cs").replaceAll("\\", "/")}` }, position: { line: 0, character: 49 } } },
          ]
        : [{ jsonrpc: "2.0", id: 2, method: "workspace/symbol", params: { query: "fixture" } }];
    for (const request of [initializedNotification, ...navigation]) {
      const body = JSON.stringify(request);
      child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    }
    return;
  }
  if (message.id !== 2) return;
  clearTimeout(timer);
  child.kill();
  process.stdout.write(
    `${JSON.stringify({ initialized, navigation_responded: true, side_effect_absent: sideEffectAbsent(), frames, stderr })}\n`,
  );
  return false;
};
child.stdout.on("data", createLspFrameStream(handleFrame));
child.on("error", (error) => {
  clearTimeout(timer);
  process.stdout.write(`${JSON.stringify({ initialized: false, side_effect_absent: sideEffectAbsent(), error: String(error) })}\n`);
});
child.stdin.write(`Content-Length: ${Buffer.byteLength(JSON.stringify(request))}\r\n\r\n${JSON.stringify(request)}`);
