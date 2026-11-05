import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { scoreOverlap } from "./overlap-metrics.mjs";

test("overlap gate rejects a renamed skeleton", () => {
  const original = Array.from({ length: 20 }, (_, index) => `const value${index} = input${index};`).join("\n");
  const renamed = original.replaceAll("value", "result").replaceAll("input", "source");
  const result = scoreOverlap(original, renamed);
  assert.equal(result.pass, false);
  assert.ok(result.shapeNgram > 0.65);
});

test("overlap gate accepts an independent implementation", () => {
  const original = Array.from({ length: 20 }, (_, index) => `const value${index} = input${index};`).join("\n");
  const rewrite = Array.from({ length: 20 }, (_, index) => `output.push(normalize(record[${index}]));`).join("\n");
  const result = scoreOverlap(original, rewrite);
  assert.equal(result.pass, true);
});

const SCRIPT = fileURLToPath(new URL("./overlap-scan.mjs", import.meta.url));

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    return { code: error.status, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

const COMMAND =
  "gh api repos/acme/widgets/issues --paginate --jq .[].number --method GET --header accept:json --silent --include --cache 1h";
const originalText = `Fetch the list first. ${COMMAND}\n${Array.from({ length: 60 }, (_, i) => `alpha${i}`).join(" ")}`;
const independentText = `Run this to list issues. ${COMMAND}\n${Array.from({ length: 60 }, (_, i) => `omega${i}`).join(" ")}`;

describe("overlap-scan CLI", () => {
  let dir;
  const file = (name, text) => {
    const path = join(dir, name);
    writeFileSync(path, text);
    return path;
  };
  before(() => {
    dir = mkdtempSync(join(tmpdir(), "overlap-scan-"));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  test("exits 1 for a copy and 0 for an independent text", () => {
    const copied = file("o1.md", originalText);
    assert.equal(run([`--original=${copied}`, `--rewrite=${copied}`, "--mode=prose"]).code, 1);
    const plainOriginal = file("o1x.md", originalText.replace(COMMAND, "x"));
    const plainRewrite = file("r1x.md", independentText.replace(COMMAND, "x"));
    assert.equal(run([`--original=${plainOriginal}`, `--rewrite=${plainRewrite}`, "--mode=prose"]).code, 0);
  });

  test("a contract file exempts exact text from the count", () => {
    const original = file("o2.md", originalText);
    const rewrite = file("r2.md", independentText);
    assert.equal(run([`--original=${original}`, `--rewrite=${rewrite}`, "--mode=prose"]).code, 1);
    const contract = file("c2.txt", `${COMMAND}\n`);
    assert.equal(
      run([`--original=${original}`, `--rewrite=${rewrite}`, "--mode=prose", `--contract-file=${contract}`]).code,
      0,
    );
  });

  test("a missing contract file exits 2, not 1", () => {
    const original = file("o3.md", originalText);
    const result = run([
      `--original=${original}`,
      `--rewrite=${original}`,
      `--contract-file=${join(dir, "absent.txt")}`,
    ]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /cannot read an input/);
  });

  test("--require-contract without --contract-file exits 2", () => {
    const original = file("o4.md", originalText);
    const result = run([`--original=${original}`, `--rewrite=${original}`, "--require-contract"]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /--require-contract needs --contract-file/);
  });

  test("a missing original exits 2 and missing options exit 2", () => {
    assert.equal(run([`--original=${join(dir, "none.md")}`, `--rewrite=${join(dir, "none.md")}`]).code, 2);
    assert.equal(run([]).code, 2);
  });
});
