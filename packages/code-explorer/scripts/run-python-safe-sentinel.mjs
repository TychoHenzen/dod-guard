import { existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLspFrameStream } from "./lsp-frame-stream.mjs";

const [serverEntrypoint, fixture] = process.argv.slice(2);
if (!(serverEntrypoint && fixture)) throw new Error("usage: run-python-safe-sentinel <pyright-server.js> <fixture>");

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const { createNativeProjectRoot } = await import(pathToFileURL(`${scriptDirectory}../dist/semantic/project-root.js`).href);
const { createNativePythonMirror } = await import(pathToFileURL(`${scriptDirectory}../dist/semantic/python-mirror-runtime.js`).href);
const root = createNativeProjectRoot(fixture);
const mirror = createNativePythonMirror(root);
const sentinel = `${fixture}/SENTINEL_SIDE_EFFECT`;
rmSync(sentinel, { force: true });
const child = spawn(process.execPath, [serverEntrypoint, "--stdio"], {
  cwd: mirror.root,
  shell: false,
  stdio: ["pipe", "pipe", "pipe"],
  // Do not inherit a project interpreter, venv, external import path, or PATH.
  env: {
    PATH: "",
    PYTHONPATH: "",
    VIRTUAL_ENV: "",
    CONDA_PREFIX: "",
    CODE_EXPLORER_SENTINEL_PATH: sentinel,
  },
});
let stderr = "";
let initialized = false;
let finished = false;
let configurationReplies = 0;
const send = (message) => {
  const body = JSON.stringify(message);
  child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
};
const finish = (result) => {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  const disposeAndReport = () => {
    mirror.dispose();
    process.stdout.write(
      `${JSON.stringify({ ...result, side_effect_absent: !existsSync(sentinel), configuration_replies: configurationReplies, stderr })}\n`,
    );
  };
  if (child.exitCode !== null) {
    disposeAndReport();
    return;
  }
  child.once("exit", disposeAndReport);
  child.kill();
};
const timeout = setTimeout(() => finish({ initialized, definition_responded: false, timeout: true }), 30_000);
child.stderr.on("data", (chunk) => (stderr += chunk));
child.on("error", (error) => finish({ initialized, definition_responded: false, error: String(error) }));
const handleFrame = (message) => {
  if (message.id === 1 && !initialized) {
    initialized = true;
    const uri = mirror.uriFor("src/fixture.py");
    const text = root.protectedRead("src/fixture.py").bytes;
    send({ jsonrpc: "2.0", method: "initialized", params: {} });
    send({ jsonrpc: "2.0", method: "textDocument/didOpen", params: { textDocument: { uri, languageId: "python", version: 1, text } } });
    send({ jsonrpc: "2.0", id: 2, method: "textDocument/definition", params: { textDocument: { uri }, position: { line: 0, character: 7 } } });
    return;
  }
  if (message.method === "workspace/configuration" && message.id !== undefined) {
    configurationReplies += 1;
    const items = message.params?.items ?? [];
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: items.map((item) =>
        ["python.pythonPath", "python.venvPath", "python.analysis.extraPaths"].includes(item.section) ? [] : null,
      ),
    });
    return;
  }
  if (message.id === 2) finish({ initialized, definition_responded: true, definition: message.result });
};
child.stdout.on("data", createLspFrameStream(handleFrame));
send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    processId: null,
    rootUri: pathToFileURL(mirror.root).href,
    capabilities: { workspace: { configuration: true } },
    initializationOptions: { use_project_environment: false, mirror_only: true },
  },
});
