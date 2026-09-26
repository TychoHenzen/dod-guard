import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KnowledgeBaseError,
  type KnowledgeEntry,
  parseKnowledgeDocument,
  validateUniqueEntries,
} from "../src/schema.js";

const metadataDefaults = {
  key: "synthetic.entry",
  title: "ok",
  chapter: "synthetic",
  section: "synthetic",
  sources: ["sources:", "  - label: fixture"],
  suffix: [] as string[],
};

function document(frontMatter: string, content = "synthetic content"): string {
  return ["---", frontMatter, "---", content].join("\n");
}

function metadata(options: Partial<typeof metadataDefaults> = {}): string {
  const values = { ...metadataDefaults, ...options } as typeof metadataDefaults;
  return [
    `key: ${values.key}`,
    `title: ${values.title}`,
    `chapter: ${values.chapter}`,
    `section: ${values.section}`,
    "summary: ok",
    ...values.sources,
    ...values.suffix,
  ].join("\n");
}

function assertParseError(frontMatter: string, message: RegExp): void {
  assert.throws(
    () => parseKnowledgeDocument(document(frontMatter), "entries/synthetic.md"),
    (error: unknown) => error instanceof KnowledgeBaseError && message.test(error.message),
  );
}

test("parses optional metadata and validates an entry without a stored path", () => {
  const entry = parseKnowledgeDocument(document(metadata()), "entries/synthetic.md");
  assert.deepEqual(entry.relatedKeys, []);
  assert.equal(entry.project, undefined);
  assert.equal(entry.language, undefined);

  const manual: KnowledgeEntry = {
    key: "manual",
    title: "Manual entry",
    chapter: "manual",
    section: "manual",
    summary: "Manual summary",
    content: "Manual content",
    sources: [{ label: "fixture" }],
    relatedKeys: [],
  };
  assert.doesNotThrow(() => validateUniqueEntries([manual]));
});

test("rejects malformed front matter framing", () => {
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
});

test("rejects invalid synthetic metadata", () => {
  const cases: Array<[string, RegExp]> = [
    [metadata({ title: "" }), /title must be a non-empty string/],
    [metadata({ sources: ["sources: fixture"] }), /sources must be an array/],
    [metadata({ sources: ["sources: []"] }), /sources must contain at least one source/],
    [
      metadata({ sources: ["sources:", "  - label: fixture", '    project: ""'] }),
      /project must be a non-empty string/,
    ],
    [metadata({ sources: ["sources:", "  - fixture"] }), /sources\[0\] must be an object/],
    [metadata({ sources: ["sources:", "  - project: fixture"] }), /sources\[0\]\.label must be a non-empty string/],
    [metadata({ suffix: ["related_keys: fixture"] }), /related_keys must be an array/],
    [metadata({ suffix: ["related_keys:", "  - 12"] }), /related_keys\[0\] must be a non-empty string/],
    [metadata({ key: "other.entry" }), /key must belong to chapter synthetic/],
    [metadata({ section: "other.section" }), /section must belong to chapter synthetic/],
    [metadata({ suffix: ["related_keys:", "  - bad key"] }), /related key bad key is not stable/],
    [
      metadata({ suffix: ["related_keys:", "  - synthetic.other", "  - synthetic.other"] }),
      /related_keys contains duplicates/,
    ],
  ];
  for (const [frontMatter, message] of cases) {
    assertParseError(frontMatter, message);
  }
});
