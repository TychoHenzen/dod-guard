import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNativeProjectRoot } from "../semantic/project-root.js";
import { createNativePythonMirror } from "../semantic/python-mirror-runtime.js";

export const unsafePythonConfigurationKeys = [
  "extends",
  "venvPath",
  "venv",
  "extraPaths",
  "typeshedPath",
  "stubPath",
  "executionEnvironments",
  "pythonPath",
] as const;

export function project(files: Record<string, string>) {
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

export function unsafe(files: Record<string, string>): void {
  const fixture = project({
    "src/a.py": "def a(): pass\n",
    ...files,
  });
  try {
    assert.throws(() => createNativePythonMirror(fixture.project), {
      message: "unsafe_backend_mode",
    });
  } finally {
    fixture.dispose();
  }
}

export function disposeFixture(
  fixture: { dispose(): void },
  mirror?: { dispose(): void },
): void {
  mirror?.dispose();
  fixture.dispose();
}
