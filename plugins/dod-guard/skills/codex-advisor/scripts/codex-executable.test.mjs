import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { resolveCodexExecutable } from "./codex-executable.mjs";

test("resolves the direct Codex executable for each platform", () => {
  assert.equal(resolveCodexExecutable("win32", { PATH: "" }), undefined);
  assert.equal(resolveCodexExecutable("linux"), "codex");
  assert.equal(resolveCodexExecutable("darwin"), "codex");
});

test("prefers a native executable already on the Windows PATH", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-launch-path-"));
  const nativePath = join(root, "codex.exe");
  try {
    await writeFile(nativePath, "fixture");
    assert.equal(resolveCodexExecutable("win32", { PATH: root }), nativePath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolves the native executable behind an npm codex.cmd shim", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-launch-shim-"));
  const packageRoot = join(root, "node_modules", "@openai", "codex");
  const platformRoot = join(packageRoot, "node_modules", "@openai", "codex-win32-x64");
  const nativePath = join(platformRoot, "vendor", "x86_64-pc-windows-msvc", "bin", "codex.exe");
  try {
    await mkdir(join(packageRoot, "bin"), { recursive: true });
    await mkdir(dirname(nativePath), { recursive: true });
    await writeFile(
      join(root, "codex.cmd"),
      '@ECHO off\r\nnode "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n',
    );
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "@openai/codex" }));
    await writeFile(join(packageRoot, "bin", "codex.js"), "");
    await writeFile(join(platformRoot, "package.json"), JSON.stringify({ name: "@openai/codex-win32-x64" }));
    await writeFile(nativePath, "fixture");
    assert.equal(resolveCodexExecutable("win32", { PATH: root }, "x64"), nativePath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("does not resolve a nonexistent executable from an incomplete npm codex.cmd shim", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-launch-incomplete-shim-"));
  const packageRoot = join(root, "node_modules", "@openai", "codex");
  try {
    await mkdir(join(packageRoot, "bin"), { recursive: true });
    await writeFile(
      join(root, "codex.cmd"),
      '@ECHO off\r\nnode "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n',
    );
    await writeFile(join(packageRoot, "package.json"), JSON.stringify({ name: "@openai/codex" }));
    await writeFile(join(packageRoot, "bin", "codex.js"), "");
    assert.equal(resolveCodexExecutable("win32", { PATH: root }, "x64"), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
