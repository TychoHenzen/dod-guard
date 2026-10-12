import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { PassThrough } from "node:stream";
import { it } from "node:test";
import { spawnNativeLspProcess } from "../../../src/semantic/adapters/native-lsp-process.js";
import { createNativeProjectRoot } from "../../../src/semantic/api/public-api.js";
import { createFilteredWorkspace } from "../../../src/semantic/workspace/filtered-workspace.js";
import { ownedResources } from "../../../src/semantic/workspace/owned-resources.js";
import {
  createStdioCloseController,
  installStdioCloseTriggers,
} from "../../../src/stdio-lifecycle.js";
import {
  removeTemporaryTree,
  waitForPidExit,
  waitForPidFile,
  writeFakeLspServer,
} from "./index-test-fake-backend.js";

async function waitForExit(exits: number[]): Promise<void> {
  for (let attempt = 0; attempt < 250 && exits.length === 0; attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 20));
}

it("stdin EOF terminates a real dummy backend child and removes the owned root", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "code-explorer-stdio-close-"));
  const project = join(temporary, "project");
  const fake = join(temporary, "fake-lsp.mjs");
  const pidFile = join(temporary, "fake.pid");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "src", "main.rs"), "fn main() {}\n", "utf8");
  writeFakeLspServer(fake);
  try {
    const filtered = createFilteredWorkspace(createNativeProjectRoot(project));
    const serviceRoot = dirname(filtered.root.canonicalPath);
    spawnNativeLspProcess(process.execPath, [fake], {
      SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot ?? "",
      CODE_EXPLORER_FAKE_KEEPALIVE: "1",
      CODE_EXPLORER_FAKE_PID_FILE: pidFile,
    });
    const pid = await waitForPidFile(pidFile);
    const exits: number[] = [];
    const errors: string[] = [];
    const closer = createStdioCloseController({
      closeCore: async () => undefined,
      releaseResources: () => ownedResources.seal(),
      exit: (code) => {
        exits.push(code);
      },
      writeError: (line) => {
        errors.push(line);
      },
      setTimer: (callback, ms) => setTimeout(callback, ms),
      clearTimer: (timer) =>
        clearTimeout(timer as ReturnType<typeof setTimeout>),
    });
    const signals = new EventEmitter();
    const stdin = new PassThrough();
    installStdioCloseTriggers({ signals, stdin, close: closer.close });
    stdin.end();
    stdin.resume();
    await waitForExit(exits);
    assert.deepEqual(exits, [0]);
    assert.deepEqual(errors, []);
    assert.equal(existsSync(serviceRoot), false);
    assert.equal(await waitForPidExit(pid), true);
  } finally {
    ownedResources.seal();
    await removeTemporaryTree(temporary);
  }
});
