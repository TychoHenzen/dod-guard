import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { spawnNativeLspProcess } from "../../../src/semantic/adapters/native-lsp-process.js";
import { OwnedResources } from "../../../src/semantic/workspace/owned-resources.js";
import {
  createStdioCloseController,
  type StdioCloseDeps,
} from "../../../src/stdio-lifecycle.js";
import { writeFakeLspServer } from "./index-test-fake-backend.js";

export type FakeBackendFixture = {
  temporary: string;
  project: string;
  fake: string;
  pidFile: string;
};

/** A registry with no process exit hook, so one test can seal it alone. */
export function isolatedRegistry(): OwnedResources {
  return new OwnedResources({ once: () => undefined });
}

/** A project holding one Rust file, next to a fake LSP server script. */
export function fakeBackendFixture(prefix: string): FakeBackendFixture {
  const temporary = mkdtempSync(join(tmpdir(), prefix));
  const project = join(temporary, "project");
  const fake = join(temporary, "fake-lsp.mjs");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "src", "main.rs"), "fn main() {}\n", "utf8");
  writeFakeLspServer(fake);
  return { temporary, project, fake, pidFile: join(temporary, "fake.pid") };
}

/** Spawns the fake server through the production path; it never exits alone. */
export function spawnKeepaliveBackend(
  fixture: FakeBackendFixture,
  resources: OwnedResources,
): void {
  spawnNativeLspProcess(
    process.execPath,
    [fixture.fake],
    {
      SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot ?? "",
      CODE_EXPLORER_FAKE_KEEPALIVE: "1",
      CODE_EXPLORER_FAKE_PID_FILE: fixture.pidFile,
    },
    resources,
  );
}

/** A close controller that seals `resources` and records exits and stderr. */
export function recordingCloser(
  resources: OwnedResources,
  overrides: Partial<StdioCloseDeps> = {},
) {
  const exits: number[] = [];
  const errors: string[] = [];
  const closer = createStdioCloseController({
    closeCore: async () => undefined,
    releaseResources: () => resources.seal(),
    exit: (code) => {
      exits.push(code);
    },
    writeError: (line) => {
      errors.push(line);
    },
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    ...overrides,
  });
  return { closer, exits, errors };
}

export async function waitForExit(
  exits: number[],
  budgetMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (exits.length === 0 && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 20));
}
