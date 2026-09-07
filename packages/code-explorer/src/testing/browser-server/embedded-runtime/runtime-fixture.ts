import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEmbeddedBrowserRuntime } from "../../../index.js";
import { runtimeCore } from "./core-fixture.js";
export async function runtimeFixture() {
  const root = mkdtempSync(join(tmpdir(), "embedded-code-explorer-"));
  let closed = 0;
  const calls: Array<[string, Record<string, unknown>]> = [];
  const runtime = await createEmbeddedBrowserRuntime({
    project_root: root,
    origin: "http://127.0.0.1:4400",
    core_factory: runtimeCore(calls, () => {
      closed += 1;
    }),
  });
  return {
    runtime,
    calls,
    closed: () => closed,
    async close() {
      await runtime.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
