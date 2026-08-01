import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { readAllowedFiles } from "./solve-files.js";

let cwd = "";

function write(rel: string, content: string): void {
  const full = path.join(cwd, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

function paths(patterns?: string[]): string[] {
  return readAllowedFiles(cwd, patterns)
    .map((f) => f.path)
    .sort();
}

before(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), "solve-files-"));
  write("src/a.ts", "AAA");
  write("src/b.md", "BBB");
  write("src/deep/c.ts", "CCC");
  write("src/node_modules/pkg/index.ts", "VENDOR");
  write("src/.hidden/secret.ts", "HIDDEN");
  write(".env", "TOKEN=1");
  write("big/huge.txt", "z".repeat(4100));
  write("big/exact.txt", "z".repeat(4000));
  for (let i = 0; i < 25; i++) write(`many/f${i}.txt`, `file ${i}`);
  write("nest/1/2/3/4/5/6/inside.txt", "IN");
  write("nest/1/2/3/4/5/6/7/outside.txt", "OUT");
});

after(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe("readAllowedFiles", () => {
  it("reads nothing when no allow list is given", () => {
    assert.deepEqual(readAllowedFiles(cwd), []);
    assert.deepEqual(readAllowedFiles(cwd, []), []);
  });

  it("keeps a single star inside one directory", () => {
    assert.deepEqual(paths(["src/*.ts"]), ["src/a.ts"]);
  });

  it("returns the content of each matched file", () => {
    assert.deepEqual(readAllowedFiles(cwd, ["src/*.ts"]), [{ path: "src/a.ts", content: "AAA" }]);
  });

  it("walks below the directory when the pattern crosses segments", () => {
    assert.deepEqual(paths(["src/**"]), ["src/a.ts", "src/b.md", "src/deep/c.ts"]);
  });

  it("hides build directories and dot directories from a walk", () => {
    const found = paths(["src/**"]);
    assert.equal(found.includes("src/node_modules/pkg/index.ts"), false);
    assert.equal(found.includes("src/.hidden/secret.ts"), false);
  });

  it("reads a file the caller named outright, even a hidden one", () => {
    assert.deepEqual(readAllowedFiles(cwd, [".env"]), [{ path: ".env", content: "TOKEN=1" }]);
  });

  it("reads a named file inside a directory the walk would skip", () => {
    const found = readAllowedFiles(cwd, ["src/node_modules/pkg/index.ts"]);
    assert.deepEqual(found, [{ path: "src/node_modules/pkg/index.ts", content: "VENDOR" }]);
  });

  it("reads nothing for a name that points at no file", () => {
    assert.deepEqual(readAllowedFiles(cwd, ["src/missing.ts"]), []);
  });

  it("reads nothing for a name that points at a directory", () => {
    assert.deepEqual(readAllowedFiles(cwd, ["src/deep"]), []);
  });

  it("reads nothing when the pattern prefix directory is absent", () => {
    assert.deepEqual(readAllowedFiles(cwd, ["gone/**"]), []);
  });

  it("keeps a 4000-character file whole", () => {
    assert.equal(readAllowedFiles(cwd, ["big/exact.txt"])[0].content.length, 4000);
  });

  it("cuts a longer file at 4000 characters", () => {
    assert.equal(readAllowedFiles(cwd, ["big/huge.txt"])[0].content.length, 4000);
  });

  it("returns at most 20 files", () => {
    assert.equal(readAllowedFiles(cwd, ["many/*"]).length, 20);
  });

  it("walks six directory levels below the pattern prefix", () => {
    assert.equal(paths(["nest/**"]).includes("nest/1/2/3/4/5/6/inside.txt"), true);
  });

  it("stops at the seventh level", () => {
    assert.equal(paths(["nest/**"]).includes("nest/1/2/3/4/5/6/7/outside.txt"), false);
  });

  it("drops a walked file that matches no pattern", () => {
    assert.deepEqual(paths(["src/**/*.md"]), ["src/b.md"]);
  });

  it("merges the files of several patterns without repeating one", () => {
    assert.deepEqual(paths(["src/*.ts", "src/**"]), ["src/a.ts", "src/b.md", "src/deep/c.ts"]);
  });
});
