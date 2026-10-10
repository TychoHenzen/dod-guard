import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(
  new URL(
    "../../../../../skills/quality-refactor/scripts/quality-scan.mjs",
    import.meta.url,
  ),
);
const RULES = "--rules=else-branch,stateless-method,wildcard-import";
const FINDING_KEYS = [
  "file",
  "line",
  "message",
  "metric",
  "rule",
  "severity",
  "suggestion",
];
const src = (...rows) => rows.join("\n");

// The Ctx line is the #678 interface probe, verbatim.
const A_TS = src(
  "interface Ctx { getOptions(): { getScratchDir(): { getAbsolutePath(): string } } }",
  "abstract class Base { abstract m(): { a: string }; }",
  "class Box { private readonly x = 1; n(): { a: string } { return { a: String(this.x) }; } }",
  'class Greeter {\n  private readonly prefix = "hi";\n  greet(name: string): string {\n' +
    "    return name.trim();\n  }\n}",
  "function pick(v: number): number {\n  if (v > 0) {\n    return 1;\n  } else {\n    return 2;\n  }\n}",
);
const B_PY = src(
  "from os.path import *",
  "def first(items):\n    for x in items:\n        return x\n    else:\n        return None",
  "def parse(text):\n    try:\n        value = int(text)\n" +
    "    except ValueError:\n        return None\n    else:\n        return value",
);
const C_RS = src(
  "use crate::items::*;",
  "pub fn tally(o: Option<i32>) -> i32 {\n    let Some(v) = o else {\n        return 0;\n    };\n    v\n}",
  // biome-ignore lint/security/noSecrets: Rust attribute text, not a credential
  "#[cfg(test)]\nmod tests {\n    use super::*;\n    #[test]\n    fn it_works() {}\n}",
);

// The sorted list below is the whole check: a false positive or a missing
// positive changes it. The false positives it rules out are the #678 probe
// names, the abstract signature, the method that reads this, the Python
// for/else and try/else, the Rust let-else, and the glob in the test module.
// The retained positives are the TS stateless method and else branch, the Rust
// crate glob, and the Python star import.
const lineOf = (text, needle) => text.split("\n").indexOf(needle) + 1;
const EXPECTED = [
  `a.ts:${lineOf(A_TS, "  greet(name: string): string {")}:stateless-method`,
  `a.ts:${lineOf(A_TS, "function pick(v: number): number {")}:else-branch`,
  `b.py:${lineOf(B_PY, "from os.path import *")}:wildcard-import`,
  `c.rs:${lineOf(C_RS, "use crate::items::*;")}:wildcard-import`,
].sort();

test("the CLI reports exactly the four retained findings, in the finding shape", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rule-boundary-cli-"));
  try {
    await writeFile(join(dir, "a.ts"), A_TS);
    await writeFile(join(dir, "b.py"), B_PY);
    await writeFile(join(dir, "c.rs"), C_RS);
    const run = spawnSync(
      process.execPath,
      [CLI, dir, `--root=${dir}`, "--format=json", RULES],
      {
        encoding: "utf8",
      },
    );
    assert.equal(run.status, 0, run.stderr);
    const { violations } = JSON.parse(run.stdout);
    assert.deepEqual(
      violations.map((v) => `${v.file}:${v.line}:${v.rule}`).sort(),
      EXPECTED,
    );
    for (const v of violations) {
      assert.deepEqual(Object.keys(v).sort(), FINDING_KEYS);
      assert.equal(v.severity, "medium");
      assert.ok(Number.isInteger(v.line) && v.line > 0);
      assert.ok(typeof v.metric === "number" && v.metric > 0);
      assert.ok(typeof v.message === "string" && v.message.length > 0);
      assert.ok(typeof v.suggestion === "string" && v.suggestion.length > 0);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
