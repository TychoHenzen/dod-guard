import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createNativeProjectRoot } from "./project-root.js";
import { createNativePythonMirror, createPythonMirrorManager } from "./python-mirror-runtime.js";

function project(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-python-test-"));
  for (const [path, text] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, text);
  }
  return {
    root,
    project: createNativeProjectRoot(root),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

function unsafe(files: Record<string, string>): void {
  const fixture = project({ "src/a.py": "def a(): pass\n", ...files });
  try {
    assert.throws(() => createNativePythonMirror(fixture.project), { message: "unsafe_backend_mode" });
  } finally {
    fixture.dispose();
  }
}

// covers: code-explorer/language-adapters :: Known project-controlled execution hooks stay disabled :: Python project selects an interpreter or external path
it("rejects pyrightconfig and pyproject execution hooks before mirror creation", () => {
  for (const key of [
    "extends",
    "venvPath",
    "venv",
    "extraPaths",
    "typeshedPath",
    "stubPath",
    "executionEnvironments",
    "pythonPath",
  ]) {
    unsafe({ "pyrightconfig.json": JSON.stringify({ [key]: key === "executionEnvironments" ? [] : "../outside" }) });
    unsafe({ "pyproject.toml": `[tool.pyright]\n${key} = "../outside"\n` });
  }
  unsafe({ "pyrightconfig.json": "not-json" });
  unsafe({ "pyproject.toml": "[tool.pyright]\nnot valid toml\n" });
});

it("rejects every checked-in unsafe selector fixture before Pyright can launch", () => {
  for (const selector of [
    "project-interpreter.pyrightconfig.json",
    "virtual-environment.pyrightconfig.json",
    "external-import-path.pyrightconfig.json",
    "configuration-replacement.pyrightconfig.json",
  ]) {
    const source = readFileSync(
      new URL(`../../fixtures/safe-mode-sentinels/python/selectors/${selector}`, import.meta.url),
      "utf8",
    );
    unsafe({ "pyrightconfig.json": source });
  }
});

it("maps only unchanged protected source through an immutable generation", () => {
  const fixture = project({ "src/a.py": "def target() -> str:\n    return 'safe'\n" });
  const mirror = createNativePythonMirror(fixture.project, 7);
  try {
    const uri = mirror.uriFor("src/a.py");
    assert.match(uri, /generation-7/);
    assert.equal(mirror.pathForUri(uri), "src/a.py");
    assert.equal(mirror.pathForUri(`${uri}/../escape.py`), undefined);
    assert.equal(mirror.uriFor("src/missing.py"), "");
    assert.equal(lstatSync(join(mirror.root, "src", "a.py")).isSymbolicLink(), false);
    assert.ok(existsSync(join(mirror.root, "typeshed", "stdlib", "builtins.pyi")));
    assert.equal(statSync(mirror.root).mode & 0o222, 0);
    assert.equal(statSync(join(mirror.root, "src")).mode & 0o222, 0);
    assert.equal(statSync(join(mirror.root, "src", "a.py")).mode & 0o222, 0);
  } finally {
    mirror.dispose();
    fixture.dispose();
  }
});

it("rejects a URI from another mirror generation", () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const first = createNativePythonMirror(fixture.project, 1);
  const second = createNativePythonMirror(fixture.project, 2);
  try {
    assert.equal(first.pathForUri(second.uriFor("src/a.py")), undefined);
  } finally {
    first.dispose();
    second.dispose();
    fixture.dispose();
  }
});

it("rebuilds with monotonic generations after config addition, replacement, and removal", async () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const events: string[] = [];
  const manager = createPythonMirrorManager(fixture.project, () => {
    events.push("old-backend-terminated");
  });
  try {
    const first = await manager.refresh();
    assert.equal(first.status, "ready");
    if (first.status !== "ready") throw new Error("expected ready mirror");
    assert.equal(first.mirror.generation, 0);
    assert.equal((await manager.refresh()).status, "ready");
    assert.deepEqual(events, []);
    writeFileSync(join(fixture.root, "pyrightconfig.json"), "{}\n");
    const added = await manager.refresh();
    assert.equal(added.status, "ready");
    if (added.status !== "ready") throw new Error("expected ready mirror");
    assert.equal(added.mirror.generation, 1);
    assert.deepEqual(events, ["old-backend-terminated"]);
    writeFileSync(join(fixture.root, "pyrightconfig.json"), '{"pythonVersion":"3.11"}\n');
    const replaced = await manager.refresh();
    assert.equal(replaced.status, "ready");
    if (replaced.status !== "ready") throw new Error("expected ready mirror");
    assert.equal(replaced.mirror.generation, 2);
    rmSync(join(fixture.root, "pyrightconfig.json"));
    const removed = await manager.refresh();
    assert.equal(removed.status, "ready");
    if (removed.status !== "ready") throw new Error("expected ready mirror");
    assert.equal(removed.mirror.generation, 3);
    writeFileSync(join(fixture.root, "src", "a.py"), "x = 2\n");
    const sourceChanged = await manager.refresh();
    assert.equal(sourceChanged.status, "ready");
    if (sourceChanged.status !== "ready") throw new Error("expected ready mirror");
    assert.equal(sourceChanged.mirror.generation, 4);
    assert.deepEqual(events, [
      "old-backend-terminated",
      "old-backend-terminated",
      "old-backend-terminated",
      "old-backend-terminated",
    ]);
  } finally {
    manager.current()?.dispose();
    fixture.dispose();
  }
});

it("terminates the old backend before an unsafe replacement and publishes no new mirror", async () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const events: string[] = [];
  const manager = createPythonMirrorManager(fixture.project, () => {
    events.push("terminate-before-rebuild");
  });
  try {
    const first = await manager.refresh();
    assert.equal(first.status, "ready");
    writeFileSync(join(fixture.root, "pyrightconfig.json"), '{"venvPath":".venv"}\n');
    assert.deepEqual(await manager.refresh(), { status: "unavailable", code: "unsafe_backend_mode" });
    assert.deepEqual(events, ["terminate-before-rebuild"]);
    assert.equal(manager.current(), undefined);
  } finally {
    manager.current()?.dispose();
    fixture.dispose();
  }
});

it("retires an active backend before malformed configuration can publish", async () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const events: string[] = [];
  const manager = createPythonMirrorManager(fixture.project, () => {
    events.push("shutdown-complete");
  });
  try {
    assert.equal((await manager.refresh()).status, "ready");
    writeFileSync(join(fixture.root, "pyrightconfig.json"), "{ malformed");
    assert.deepEqual(await manager.refresh(), { status: "unavailable", code: "unsafe_backend_mode" });
    assert.deepEqual(events, ["shutdown-complete"]);
    assert.equal(manager.current(), undefined);
  } finally {
    manager.current()?.dispose();
    fixture.dispose();
  }
});

it("retires an active backend before a linked configuration can publish", async (context) => {
  const fixture = project({ "src/a.py": "x = 1\n", "replacement.json": "{}\n" });
  const events: string[] = [];
  const manager = createPythonMirrorManager(fixture.project, () => {
    events.push("shutdown-complete");
  });
  try {
    assert.equal((await manager.refresh()).status, "ready");
    try {
      symlinkSync(join(fixture.root, "replacement.json"), join(fixture.root, "pyrightconfig.json"), "file");
    } catch (error) {
      context.skip(`symbolic links unavailable: ${String(error)}`);
      return;
    }
    assert.deepEqual(await manager.refresh(), { status: "unavailable", code: "unsafe_backend_mode" });
    assert.deepEqual(events, ["shutdown-complete"]);
    assert.equal(manager.current(), undefined);
  } finally {
    manager.current()?.dispose();
    fixture.dispose();
  }
});

it("terminates a backend before disposing its mirror", async () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const manager = createPythonMirrorManager(fixture.project);
  const result = await manager.refresh();
  if (result.status !== "ready") throw new Error("expected ready mirror");
  const generation = result.mirror.root;
  const events: string[] = [];
  await manager.disposeAfterShutdown(() => {
    events.push("child-shutdown");
  });
  fixture.dispose();
  assert.deepEqual(events, ["child-shutdown"]);
  assert.equal(existsSync(generation), false);
});

it("rejects mapping after the original source changes", () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const mirror = createNativePythonMirror(fixture.project);
  try {
    const uri = mirror.uriFor("src/a.py");
    writeFileSync(join(fixture.root, "src", "a.py"), "x = 2\n");
    assert.equal(mirror.pathForUri(uri), undefined);
  } finally {
    mirror.dispose();
    fixture.dispose();
  }
});

it("rejects mapping after a mirror generation is modified", () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const mirror = createNativePythonMirror(fixture.project);
  try {
    const uri = mirror.uriFor("src/a.py");
    const file = join(mirror.root, "src", "a.py");
    chmodSync(join(mirror.root, "src"), 0o755);
    chmodSync(file, 0o644);
    writeFileSync(file, "x = 2\n");
    assert.equal(mirror.pathForUri(uri), undefined);
  } finally {
    mirror.dispose();
    fixture.dispose();
  }
});

it("denies or detects writes to nested immutable mirror paths", () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const mirror = createNativePythonMirror(fixture.project);
  try {
    const uri = mirror.uriFor("src/a.py");
    let fileWriteRejected = false;
    try {
      writeFileSync(join(mirror.root, "src", "a.py"), "x = 2\n");
    } catch {
      fileWriteRejected = true;
    }
    let directoryWriteRejected = false;
    try {
      writeFileSync(join(mirror.root, "src", "new.py"), "x = 3\n");
    } catch {
      directoryWriteRejected = true;
    }
    assert.equal(fileWriteRejected || mirror.pathForUri(uri) === undefined, true);
    assert.equal(directoryWriteRejected || mirror.pathForUri(uri) === undefined, true);
  } finally {
    mirror.dispose();
    fixture.dispose();
  }
});

it("rejects linked project source", (context) => {
  const fixture = project({ "src/real.py": "x = 1\n" });
  const linked = join(fixture.root, "src", "linked.py");
  try {
    try {
      symlinkSync(join(fixture.root, "src", "real.py"), linked, "file");
    } catch (error) {
      context.skip(`symbolic links unavailable: ${String(error)}`);
      return;
    }
    assert.throws(() => createNativePythonMirror(fixture.project), { message: "unsafe_backend_mode" });
  } finally {
    fixture.dispose();
  }
});

it("removes the owned generation on dispose", () => {
  const fixture = project({ "src/a.py": "x = 1\n" });
  const mirror = createNativePythonMirror(fixture.project);
  const generation = mirror.root;
  mirror.dispose();
  fixture.dispose();
  assert.equal(existsSync(generation), false);
});
