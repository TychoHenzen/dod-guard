import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { it } from "node:test";
import { isSensitiveProjectPath } from "../../src/discovery/sensitive-paths.js";
import { languagePresent } from "../../src/semantic/runtime/language-presence.js";

type Presence = { rust: boolean; python: boolean; csharp: boolean };

const none: Presence = { rust: false, python: false, csharp: false };

async function presenceOf(files: readonly string[]): Promise<Presence> {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-presence-"));
  try {
    for (const file of files) {
      const absolute = join(root, file);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, "x\n", "utf8");
    }
    return {
      rust: await languagePresent("rust", root),
      python: await languagePresent("python", root),
      csharp: await languagePresent("csharp", root),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

it("reports each language only from its own source files", async () => {
  assert.deepEqual(await presenceOf(["src/main.rs"]), {
    ...none,
    rust: true,
  });
  assert.deepEqual(await presenceOf(["src/a.pyi"]), {
    ...none,
    python: true,
  });
  assert.deepEqual(await presenceOf(["src/a.cs"]), {
    ...none,
    csharp: true,
  });
  assert.deepEqual(await presenceOf(["src/a.csx"]), {
    ...none,
    csharp: true,
  });
});

it("ignores rust sources under output and documentation directories", async () => {
  assert.deepEqual(await presenceOf(["target/debug/x.rs"]), none);
  assert.deepEqual(await presenceOf(["docs/a.rs"]), none);
});

it("ignores python sources under environment and cache directories", async () => {
  for (const file of [
    ".venv/lib/x.py",
    "node_modules/p/x.py",
    "pkg/__pycache__/x.py",
  ])
    assert.deepEqual(await presenceOf([file]), none, file);
});

it("treats a sensitive .env.py as no python source, as the mirror does", async () => {
  assert.equal(isSensitiveProjectPath(".env.py"), true);
  assert.deepEqual(await presenceOf([".env.py"]), none);
});

it("skips symlinks without throwing", {
  skip: process.platform === "win32"
    ? "symlink creation needs privilege on Windows"
    : false,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-presence-link-"));
  const outside = mkdtempSync(join(tmpdir(), "code-explorer-presence-away-"));
  try {
    writeFileSync(join(outside, "lib.rs"), "fn x() {}\n", "utf8");
    mkdirSync(join(root, "src"));
    symlinkSync(join(outside, "lib.rs"), join(root, "src", "link.rs"));
    symlinkSync(outside, join(root, "linked"));
    assert.equal(await languagePresent("rust", root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});
