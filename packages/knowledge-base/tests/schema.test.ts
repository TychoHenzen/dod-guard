import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import {
  KnowledgeBaseError,
  type KnowledgeEntry,
  parseKnowledgeDocument,
  validateUniqueEntries,
} from "../src/schema.js";
import { copyShippedKnowledgeRoot, removeRoot, shippedEntryText } from "./test-support.js";

function document(frontMatter: string, content = "synthetic content"): string {
  return ["---", frontMatter, "---", content].join("\n");
}

function assertParseError(frontMatter: string, message: RegExp, content = "synthetic content"): void {
  assert.throws(
    () => parseKnowledgeDocument(document(frontMatter, content), "entries/synthetic.md"),
    (error: unknown) => error instanceof KnowledgeBaseError && message.test(error.message),
  );
}

test("parses a shipped Markdown entry", async () => {
  const entry = parseKnowledgeDocument(
    await shippedEntryText("refactoring.move-method.md"),
    "entries/refactoring.move-method.md",
  );

  assert.equal(entry.key, "refactoring.move-method");
  assert.equal(entry.chapter, "refactoring");
  assert.equal(entry.section, "refactoring.method-movement");
  assert.equal(entry.sources[0]?.project, "dod-guard");
  assert.equal(entry.sources[0]?.language, "TypeScript");
});

test("rejects malformed and duplicate hierarchy keys in a temporary corpus", async () => {
  const root = await copyShippedKnowledgeRoot();
  try {
    const malformedPath = join(root, "entries", "bad.md");
    await writeFile(
      malformedPath,
      "---\nkey: invalid key\ntitle: Bad\nchapter: bad\nsection: bad.section\nsummary: Bad\nsources:\n  - label: test\n---\ncontent",
      "utf8",
    );
    const malformed = await readFile(malformedPath, "utf8");
    assert.throws(
      () => parseKnowledgeDocument(malformed, "entries/bad.md"),
      (error: unknown) => error instanceof KnowledgeBaseError && /stable hierarchy key/.test(error.message),
    );

    const originalPath = join(root, "entries", "design-patterns.strategy.md");
    const duplicatePath = join(root, "entries", "copy.md");
    const original = await readFile(originalPath, "utf8");
    await writeFile(duplicatePath, original, "utf8");
    const entry = parseKnowledgeDocument(original, "entries/design-patterns.strategy.md");
    const duplicate = parseKnowledgeDocument(await readFile(duplicatePath, "utf8"), "entries/copy.md");
    assert.throws(
      () => validateUniqueEntries([entry, duplicate]),
      (error: unknown) => error instanceof KnowledgeBaseError && /duplicate hierarchy key/.test(error.message),
    );
  } finally {
    await removeRoot(root);
  }
});

test("rejects a broken related key in a temporary corpus", async () => {
  const root = await copyShippedKnowledgeRoot();
  try {
    const entryPath = join(root, "entries", "ux-ui-design.accessible-dialogs.md");
    const entryText = (await readFile(entryPath, "utf8")).replace(
      "related_keys: []",
      "related_keys:\n  - missing.entry",
    );
    await writeFile(entryPath, entryText, "utf8");
    const entry = parseKnowledgeDocument(
      await readFile(entryPath, "utf8"),
      "entries/ux-ui-design.accessible-dialogs.md",
    );
    assert.throws(
      () => validateUniqueEntries([entry]),
      (error: unknown) =>
        error instanceof KnowledgeBaseError && /related key missing.entry does not exist/.test(error.message),
    );
  } finally {
    await removeRoot(root);
  }
});

test("parses synthetic metadata and exercises schema validation failures", () => {
  const entry = parseKnowledgeDocument(
    document(
      [
        "key: synthetic.entry",
        "title: Synthetic entry",
        "chapter: synthetic",
        "section: synthetic",
        "summary: Synthetic summary",
        "sources:",
        "  - label: fixture",
      ].join("\n"),
    ),
    "entries/synthetic.md",
  );
  assert.deepEqual(entry.relatedKeys, []);
  assert.equal(entry.project, undefined);
  assert.equal(entry.language, undefined);

  assertParseError("- item", /front matter must be an object/);
  assertParseError("key: [", /invalid YAML front matter/);
  assert.throws(
    () => parseKnowledgeDocument("missing front matter", "entries/synthetic.md"),
    /document must start with front matter/,
  );
  assert.throws(
    () => parseKnowledgeDocument("---\nkey: synthetic.entry", "entries/synthetic.md"),
    /front matter is not closed/,
  );
  assertParseError(
    "key: synthetic.entry\ntitle: \nchapter: synthetic\nsection: synthetic\nsummary: ok\nsources:\n  - label: fixture",
    /title must be a non-empty string/,
  );
  assertParseError(
    "key: synthetic.entry\ntitle: ok\nchapter: synthetic\nsection: synthetic\nsummary: ok\nsources: fixture",
    /sources must be an array/,
  );
  assertParseError(
    "key: synthetic.entry\ntitle: ok\nchapter: synthetic\nsection: synthetic\nsummary: ok\nsources: []",
    /sources must contain at least one source/,
  );
  assertParseError(
    'key: synthetic.entry\ntitle: ok\nchapter: synthetic\nsection: synthetic\nsummary: ok\nsources:\n  - label: fixture\n    project: ""',
    /project must be a non-empty string/,
  );
  assertParseError(
    "key: synthetic.entry\ntitle: ok\nchapter: synthetic\nsection: synthetic\nsummary: ok\nsources:\n  - fixture",
    /sources\[0\] must be an object/,
  );
  assertParseError(
    "key: synthetic.entry\ntitle: ok\nchapter: synthetic\nsection: synthetic\nsummary: ok\nsources:\n  - project: fixture",
    /sources\[0\]\.label must be a non-empty string/,
  );
  assertParseError(
    "key: synthetic.entry\ntitle: ok\nchapter: synthetic\nsection: synthetic\nsummary: ok\nsources:\n  - label: fixture\nrelated_keys: fixture",
    /related_keys must be an array/,
  );
  assertParseError(
    "key: synthetic.entry\ntitle: ok\nchapter: synthetic\nsection: synthetic\nsummary: ok\nsources:\n  - label: fixture\nrelated_keys:\n  - 12",
    /related_keys\[0\] must be a non-empty string/,
  );
  assertParseError(
    "key: other.entry\ntitle: ok\nchapter: synthetic\nsection: synthetic\nsummary: ok\nsources:\n  - label: fixture",
    /key must belong to chapter synthetic/,
  );
  assertParseError(
    "key: synthetic.entry\ntitle: ok\nchapter: synthetic\nsection: other.section\nsummary: ok\nsources:\n  - label: fixture",
    /section must belong to chapter synthetic/,
  );
  assertParseError(
    "key: synthetic.entry\ntitle: ok\nchapter: synthetic\nsection: synthetic\nsummary: ok\nsources:\n  - label: fixture\nrelated_keys:\n  - bad key",
    /related key bad key is not stable/,
  );
  assertParseError(
    "key: synthetic.entry\ntitle: ok\nchapter: synthetic\nsection: synthetic\nsummary: ok\nsources:\n  - label: fixture\nrelated_keys:\n  - synthetic.other\n  - synthetic.other",
    /related_keys contains duplicates/,
  );
});

test("validates an entry without a stored path", () => {
  const entry: KnowledgeEntry = {
    key: "manual",
    title: "Manual entry",
    chapter: "manual",
    section: "manual",
    summary: "Manual summary",
    content: "Manual content",
    sources: [{ label: "fixture" }],
    relatedKeys: [],
  };
  assert.doesNotThrow(() => validateUniqueEntries([entry]));
});
