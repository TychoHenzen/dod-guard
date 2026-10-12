import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";

export type FakeBackendLog = {
  starts: number;
  shutdowns: number;
  exits: number;
  pid?: number;
  root_uri?: string;
  initialization_options?: unknown;
  configuration_sections: string[];
};

const fakeLspServerSource = `import {
  readFileSync,
  writeFileSync,
} from "node:fs";
if (process.env.CODE_EXPLORER_FAKE_PID_FILE) writeFileSync(process.env.CODE_EXPLORER_FAKE_PID_FILE, String(process.pid));
if (process.env.CODE_EXPLORER_FAKE_KEEPALIVE === "1") setInterval(() => {}, 1 << 30);
const counterPath = () => process.env.CODE_EXPLORER_FAKE_COUNTER;
const log = () => JSON.parse(readFileSync(counterPath(), "utf8"));
const save = (value) => writeFileSync(counterPath(), JSON.stringify(value));
const record = (change) => { const value = log(); change(value); save(value); };
const send = (message) => {
  const body = Buffer.from(JSON.stringify(message));
  process.stdout.write(
    "Content-Length: " + body.length + "\\r\\n\\r\\n",
  );
  process.stdout.write(body);
};
let input = Buffer.alloc(0);
const receive = (message) => {
  if (message.method === "initialize") {
    record((value) => {
      value.starts += 1;
      value.pid = process.pid;
      value.root_uri = message.params.rootUri;
      value.initialization_options = message.params.initializationOptions;
    });
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        capabilities: { definitionProvider: true, referencesProvider: true },
      },
    });
    return;
  }
  if (message.method === "initialized") {
    send({
      jsonrpc: "2.0",
      id: 71,
      method: "workspace/configuration",
      params: {
        items: [
          { section: "python.pythonPath" },
          { section: "python.venvPath" },
          { section: "python.analysis.extraPaths" },
        ],
      },
    });
    return;
  }
  if (message.id === 71 && Array.isArray(message.result)) {
    record((value) => {
      value.configuration_sections = message.result.map((item) =>
        JSON.stringify(item),
      );
    });
    return;
  }
  if (message.method === "textDocument/definition") {
    send({ jsonrpc: "2.0", id: message.id, result: [] });
    return;
  }
  if (message.method === "shutdown") {
    record((value) => { value.shutdowns += 1; });
    send({ jsonrpc: "2.0", id: message.id, result: null });
    return;
  }
  if (message.method === "exit") {
    record((value) => { value.exits += 1; });
    process.exit(0);
  }
};
process.stdin.on("data", (chunk) => {
  input = Buffer.concat([input, chunk]);
  for (;;) {
    const boundary = input.indexOf("\\r\\n\\r\\n");
    if (boundary < 0) return;
    const length = /^Content-Length: (\\d+)$/.exec(
      input.subarray(0, boundary).toString("ascii"),
    );
    if (!length) process.exit(2);
    const end = boundary + 4 + Number(length[1]);
    if (input.length < end) return;
    receive(JSON.parse(input.subarray(boundary + 4, end).toString("utf8")));
    input = input.subarray(end);
  }
});
`;

export async function waitForFakeConfiguration(counter: string): Promise<void> {
  let observed = "";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const log = JSON.parse(readFileSync(counter, "utf8")) as FakeBackendLog;
    observed = JSON.stringify(log);
    if (log.configuration_sections.length === 3) return;
    await new Promise((resolve_) => setTimeout(resolve_, 20));
  }
  throw new Error(`fake_backend_configuration_timeout:${observed}`);
}

export async function removeTemporaryTree(path: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      rmSync(path, {
        recursive: true,
        force: true,
        maxRetries: 1,
        retryDelay: 20,
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve_) => setTimeout(resolve_, 20));
    }
  }
  throw lastError;
}

export function writeFakeLspServer(path: string): void {
  writeFileSync(path, fakeLspServerSource, "utf8");
}

export async function waitForPidFile(path: string): Promise<number> {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const pid = existsSync(path) ? Number(readFileSync(path, "utf8")) : 0;
    if (Number.isInteger(pid) && pid > 0) return pid;
    await new Promise((resolve_) => setTimeout(resolve_, 20));
  }
  throw new Error("fake_backend_pid_timeout");
}

export async function waitForPidExit(
  pid: number,
  timeoutMs = 2000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (pidExists(pid)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve_) => setTimeout(resolve_, 20));
  }
  return true;
}

export function pidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}
