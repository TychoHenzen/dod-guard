import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decodeText, NOT_UTF8, readJsonFile, readTextFile, TextEncodingError } from "./read-text.mjs";

const E_ACUTE = String.fromCodePoint(0xe9);
const TEXT = `caf${E_ACUTE} {"a": 1}\r\nline two\n`;
const utf8Bom = (text) => Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]);
const utf16le = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
const utf16be = (text) => Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, "utf16le").swap16()]);

function withFile(bytes, body, name = "input.txt") {
  const dir = mkdtempSync(join(tmpdir(), "read-text-"));
  try {
    const file = join(dir, name);
    writeFileSync(file, bytes);
    return body(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("plain UTF-8 is returned unchanged", () => {
  assert.equal(decodeText(Buffer.from(TEXT, "utf8")), TEXT);
});

test("a UTF-8 byte-order mark is stripped", () => {
  assert.equal(decodeText(utf8Bom(TEXT)), TEXT);
});

test("UTF-16 with a byte-order mark decodes in either byte order", () => {
  assert.equal(decodeText(utf16le(TEXT)), TEXT);
  assert.equal(decodeText(utf16be(TEXT)), TEXT);
});

test("an empty file and a lone byte-order mark decode to an empty string", () => {
  assert.equal(decodeText(Buffer.alloc(0)), "");
  assert.equal(decodeText(Buffer.from([0xff, 0xfe])), "");
});

test("data that is not strict UTF-8 or marked UTF-16 is refused", () => {
  const refused = [
    ["UTF-16 without a byte-order mark", Buffer.from(TEXT, "utf16le")],
    ["Latin-1 bytes", Buffer.from([0x41, 0xe9, 0x0a])],
    ["an odd-length UTF-16 payload", Buffer.from([0xff, 0xfe, 0x41])],
    ["a lone UTF-16 surrogate", Buffer.from([0xff, 0xfe, 0x00, 0xd8, 0x41, 0x00])],
  ];
  for (const [name, bytes] of refused) {
    assert.throws(
      () => decodeText(bytes),
      (error) => error instanceof TextEncodingError && error.message === NOT_UTF8,
      name,
    );
  }
});

test("readTextFile names the file it refuses", () => {
  withFile(Buffer.from([0x41, 0xe9, 0x0a]), (file) => {
    assert.throws(
      () => readTextFile(file),
      (error) => error instanceof TextEncodingError && error.message === `${file} ${NOT_UTF8}`,
    );
  });
});

test("readTextFile lets a missing file's own error through", () => {
  assert.throws(() => readTextFile(join(tmpdir(), "read-text-no-such-file")), { code: "ENOENT" });
});

test("readJsonFile parses plain, byte-order-marked, and UTF-16 files to the same value", () => {
  const expected = { name: `caf${E_ACUTE}`, list: [1, 2] };
  const json = JSON.stringify(expected);
  for (const bytes of [Buffer.from(json), utf8Bom(json), utf16le(json), utf16be(json)]) {
    withFile(bytes, (file) => assert.deepEqual(readJsonFile(file), expected), "input.json");
  }
});

test("readJsonFile names the file for malformed JSON", () => {
  withFile(Buffer.from("{,}"), (file) => {
    assert.throws(
      () => readJsonFile(file),
      (error) => error.message.startsWith(`Cannot read JSON from ${file}: `),
    );
  });
});

test("a file refused as Latin-1 is read after it is rewritten as UTF-8", () => {
  withFile(Buffer.from([0x7b, 0xe9, 0x7d]), (file) => {
    assert.throws(() => readJsonFile(file), /is not UTF-8 text; save it as UTF-8/);
    writeFileSync(file, '{"a": 1}');
    assert.deepEqual(readJsonFile(file), { a: 1 });
  });
});
