import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import {
  pidExists,
  waitForPidExit,
  writeFakeLspServer,
} from "../testing/index/index-test-fake-backend.js";

const modules = {
  helper: new URL(
    "../testing/index/index-test-fake-backend.js",
    import.meta.url,
  ),
  nativeLspProcess: new URL(
    "../../src/semantic/adapters/native-lsp-process.js",
    import.meta.url,
  ),
  projectRoot: new URL(
    "../../src/semantic/project-root/project-root.js",
    import.meta.url,
  ),
  filteredWorkspace: new URL(
    "../../src/semantic/workspace/filtered-workspace.js",
    import.meta.url,
  ),
  pythonMirror: new URL(
    "../../src/semantic/python-mirror/python-mirror-runtime.js",
    import.meta.url,
  ),
};

it("process.exit(1) removes the native and python roots and kills the spawned child", async () => {
  for (const url of Object.values(modules))
    assert.equal(existsSync(fileURLToPath(url)), true);
  const temporary = mkdtempSync(join(tmpdir(), "code-explorer-exit-test-"));
  const pidFile = join(temporary, "fake.pid");
  let exited = false;
  try {
    const project = join(temporary, "project");
    mkdirSync(join(project, "src"), { recursive: true });
    writeFileSync(join(project, "src", "main.rs"), "fn main() {}\n");
    writeFileSync(
      join(project, "src", "a.py"),
      "def target() -> str:\n    return 'safe'\n",
    );
    const fake = join(temporary, "fake-lsp.mjs");
    writeFakeLspServer(fake);
    const script = join(temporary, "exit-script.mjs");
    writeFileSync(script, exitScript());
    const result = spawnSync(
      process.execPath,
      [script, project, fake, pidFile, process.env.SYSTEMROOT ?? ""],
      { cwd: temporary, encoding: "utf8", timeout: 20_000 },
    );
    assert.equal(result.status, 1, result.stderr);
    const lastLine = result.stdout.trim().split("\n").at(-1) ?? "";
    assert.match(lastLine, /^\{/u, result.stderr);
    const report = JSON.parse(lastLine) as {
      nativeRoot: string;
      pythonRoot: string;
      pid: number;
      rootsBeforeExit: boolean[];
      pidAliveBeforeExit: boolean;
    };
    assert.deepEqual(report.rootsBeforeExit, [true, true]);
    assert.equal(report.pidAliveBeforeExit, true);
    assert.equal(existsSync(report.nativeRoot), false);
    assert.equal(existsSync(report.pythonRoot), false);
    exited = await waitForPidExit(report.pid);
    assert.equal(exited, true);
  } finally {
    if (!exited) killLeftover(pidFile);
    rmSync(temporary, { recursive: true, force: true });
  }
});

function exitScript(): string {
  return [
    'import { existsSync, writeSync } from "node:fs";',
    'import { dirname } from "node:path";',
    `import { createNativeProjectRoot } from ${JSON.stringify(modules.projectRoot.href)};`,
    `import { createFilteredWorkspace } from ${JSON.stringify(modules.filteredWorkspace.href)};`,
    `import { createNativePythonMirror } from ${JSON.stringify(modules.pythonMirror.href)};`,
    `import { spawnNativeLspProcess } from ${JSON.stringify(modules.nativeLspProcess.href)};`,
    `import { pidExists, waitForPidFile } from ${JSON.stringify(modules.helper.href)};`,
    "const [project, fake, pidFile, systemRoot] = process.argv.slice(2);",
    "const root = createNativeProjectRoot(project);",
    "const filtered = createFilteredWorkspace(root);",
    "const mirror = createNativePythonMirror(root);",
    "spawnNativeLspProcess(process.execPath, [fake], {",
    "  SYSTEMROOT: systemRoot,",
    '  CODE_EXPLORER_FAKE_KEEPALIVE: "1",',
    "  CODE_EXPLORER_FAKE_PID_FILE: pidFile,",
    "});",
    "const pid = await waitForPidFile(pidFile);",
    "const nativeRoot = dirname(filtered.root.canonicalPath);",
    "const pythonRoot = dirname(mirror.root);",
    "const report = { nativeRoot, pythonRoot, pid, rootsBeforeExit: [existsSync(nativeRoot), existsSync(pythonRoot)], pidAliveBeforeExit: pidExists(pid) };",
    'writeSync(1, JSON.stringify(report) + "\\n");',
    "process.exit(1);",
  ].join("\n");
}

function killLeftover(pidFile: string): void {
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, "utf8"));
  if (Number.isInteger(pid) && pid > 0 && pidExists(pid))
    process.kill(pid, "SIGKILL");
}
