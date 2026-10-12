import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { it } from "node:test";
import { pathToFileURL } from "node:url";
import {
  bundlePath,
  completeHandshake,
  spawnBundle,
  stopBundle,
} from "./index-test-bundle-process.js";
import { removeTemporaryTree } from "./index-test-fake-backend.js";
import { isolatedBackendEnvironment } from "./index-test-isolated-env.js";

const winSignalSkip =
  "process.kill sends TerminateProcess on Windows; the handler cannot run";

async function withBundleProject(
  run: (project: string, env: Record<string, string>) => Promise<void>,
): Promise<void> {
  const temporary = mkdtempSync(join(tmpdir(), "code-explorer-stdio-exit-"));
  const project = join(temporary, "project");
  mkdirSync(project);
  try {
    await run(project, isolatedBackendEnvironment(temporary));
  } finally {
    await removeTemporaryTree(temporary);
  }
}

it("exits by itself with code 0 within 2 s after stdin EOF", async () => {
  await withBundleProject(async (project, env) => {
    const bundle = spawnBundle({ project, env });
    try {
      await completeHandshake(bundle.child);
      const t0 = performance.now();
      bundle.child.stdin.end();
      const result = await bundle.exited;
      assert.equal(result.code, 0, bundle.stderr());
      assert.equal(result.signal, null);
      assert.ok(result.at - t0 < 2000, `exit took ${result.at - t0} ms`);
    } finally {
      await stopBundle(bundle);
    }
  });
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  it(`${signal} exits with code 0 within 2 s`, {
    skip: process.platform === "win32" ? winSignalSkip : false,
  }, async () => {
    await withBundleProject(async (project, env) => {
      const bundle = spawnBundle({ project, env });
      try {
        await completeHandshake(bundle.child);
        const t0 = performance.now();
        bundle.child.kill(signal);
        const result = await bundle.exited;
        assert.equal(result.code, 0, bundle.stderr());
        assert.equal(result.signal, null);
        assert.ok(result.at - t0 < 2000, `exit took ${result.at - t0} ms`);
      } finally {
        await stopBundle(bundle);
      }
    });
  });
}

it("importing the bundle installs no signal listener", async () => {
  await withBundleProject(async (project, env) => {
    const script = [
      "const count = () => process.listenerCount('SIGINT') + process.listenerCount('SIGTERM');",
      "const before = count();",
      `await import(${JSON.stringify(pathToFileURL(bundlePath()).href)});`,
      "console.log(JSON.stringify({ b: before, a: count() }));",
    ].join(" ");
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      { cwd: project, env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { b: 0, a: 0 });
  });
});
