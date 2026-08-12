import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, test } from "node:test";
import { writeMarkdown } from "./author.js";
import { parseMarkdown, parseMarkdownFromString } from "./parser.js";
import type { DodDocument, TaskNode } from "./types.js";

function concNode(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    id: "n1",
    title: "does the thing",
    refinement: "concrete",
    command: "npm test",
    predicate: { type: "exit_code", value: 0 },
    description: "does the thing",
    last_status: "pending",
    ...overrides,
  };
}

function makeDoc(overrides: Partial<DodDocument> = {}): DodDocument {
  return {
    id: "doc-1",
    title: "Sample Change",
    goal: "Ship the sample.",
    date: "2026-08-11",
    cwd: "C:/repo",
    markdown_path: path.join(os.tmpdir(), `dod-author-roundtrip-${process.pid}.md`),
    created_at: "2026-08-11T00:00:00.000Z",
    sections: { requirements: "- req: does a thing" },
    roots: [concNode()],
    amendments: [],
    ...overrides,
  };
}

const tmpFiles: string[] = [];
after(async () => {
  await Promise.all(tmpFiles.map((f) => fs.rm(f, { force: true })));
});

/** Render through the module's real entry point, then read what landed. */
async function render(doc: DodDocument): Promise<string> {
  await writeMarkdown(doc);
  tmpFiles.push(doc.markdown_path);
  return fs.readFile(doc.markdown_path, "utf8");
}

test("proof line uses ASCII arrow between command and description", async () => {
  const md = await render(makeDoc());
  assert.match(md, /Proof: `npm test` -> does the thing/);
  assert.doesNotMatch(md, /\u2192/); // no U+2192 RIGHTWARDS ARROW
});

test("holdout proof line uses ASCII ellipsis after the fingerprint", async () => {
  const doc = makeDoc({
    roots: [
      concNode({
        predicate: { type: "holdout", value: "abcdef0123456789" },
      }),
    ],
  });
  const md = await render(doc);
  assert.match(md, /Proof \(Holdout abcdef012345\.\.\.\): `npm test` -> does the thing/);
  assert.doesNotMatch(md, /\u2026/); // no U+2026 HORIZONTAL ELLIPSIS
});

test("title heading uses a plain ASCII hyphen, not an em dash", async () => {
  const md = await render(makeDoc());
  assert.match(md, /^# Sample Change - Requirements Spec$/m);
  assert.doesNotMatch(md, /\u2014/); // no U+2014 EM DASH
});

test("round trip: writeMarkdown then parseMarkdown preserves the proof tree", async () => {
  const doc = makeDoc({
    roots: [
      concNode({ id: "n1", title: "step one", command: "npm run lint", description: "lint passes" }),
      {
        id: "grp",
        title: "group of steps",
        refinement: "concrete",
        last_status: "pending",
        children: [
          concNode({
            id: "n2",
            title: "step two",
            command: "npm test",
            description: "tests pass",
            predicate: { type: "output_contains", value: "ok" },
          }),
        ],
      },
    ],
  });
  tmpFiles.push(doc.markdown_path);

  await writeMarkdown(doc);
  const parsed = await parseMarkdown(doc.markdown_path);

  assert.equal(parsed.title, doc.title);
  assert.equal(parsed.goal, doc.goal);
  assert.equal(parsed.date, doc.date);
  assert.equal(parsed.cwd, doc.cwd);
  assert.equal(parsed.roots.length, 2);

  const [first, group] = parsed.roots;
  // The rendered line now names the leaf, so the title survives instead of
  // being reconstructed from the description - see title-round-trip.test.ts.
  assert.equal(first.title, "step one");
  assert.equal(first.description, "lint passes");
  assert.equal(first.command, "npm run lint");
  assert.equal(first.refinement, "concrete");

  assert.equal(group.title, "group of steps");
  assert.equal(group.children?.length, 1);
  const leaf = group.children?.[0];
  assert.equal(leaf?.title, "step two");
  assert.equal(leaf?.description, "tests pass");
  assert.equal(leaf?.command, "npm test");
  assert.deepEqual(leaf?.predicate, { type: "output_contains", value: "ok" });
});

test("parseMarkdownFromString reads back the rendered arrow and title", async () => {
  const doc = makeDoc({ title: "Has - A Hyphen In The Title" });
  const md = await render(doc);
  const parsed = parseMarkdownFromString(md);
  assert.equal(parsed.title, "Has - A Hyphen In The Title");
  assert.equal(parsed.roots[0].command, "npm test");
});
