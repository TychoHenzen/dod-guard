import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listDocFiles, splitClaims } from "./doc-corpus.mjs";

describe("splitClaims paragraphs", () => {
  it("splits blank-line delimited prose into separate paragraph units", () => {
    const text = "Para one line one.\nPara one line two.\n\nPara two.\n";
    const units = splitClaims("doc.md", text);
    assert.deepEqual(
      units.map((u) => ({ kind: u.kind, startLine: u.startLine, endLine: u.endLine, text: u.text })),
      [
        { kind: "paragraph", startLine: 1, endLine: 2, text: "Para one line one.\nPara one line two." },
        { kind: "paragraph", startLine: 4, endLine: 4, text: "Para two." },
      ],
    );
  });

  it("reports correct 1-based line numbers after leading blank lines", () => {
    const text = "\n\nThird line paragraph.\nFourth line continues.\n";
    const units = splitClaims("doc.md", text);
    assert.equal(units.length, 1);
    assert.equal(units[0].startLine, 3);
    assert.equal(units[0].endLine, 4);
  });
});

describe("splitClaims list items", () => {
  it("groups a top-level list item with its nested continuation lines", () => {
    const lines = [
      "- Top item first line",
      "  continuation line",
      "  - nested bullet",
      "- Second top item",
      "",
    ];
    const units = splitClaims("doc.md", lines.join("\n"));
    assert.deepEqual(
      units.map((u) => ({ kind: u.kind, startLine: u.startLine, endLine: u.endLine, text: u.text })),
      [
        {
          kind: "list-item",
          startLine: 1,
          endLine: 3,
          text: "- Top item first line\n  continuation line\n  - nested bullet",
        },
        { kind: "list-item", startLine: 4, endLine: 4, text: "- Second top item" },
      ],
    );
  });
});

describe("splitClaims fenced code blocks", () => {
  it("skips fenced code blocks entirely and never splits a unit across the fence", () => {
    const lines = [
      "Intro paragraph.",
      "",
      "```js",
      "const x = 1;",
      "- not a list item, inside fence",
      "```",
      "",
      "Outro paragraph.",
      "",
    ];
    const units = splitClaims("doc.md", lines.join("\n"));
    assert.deepEqual(
      units.map((u) => ({ kind: u.kind, startLine: u.startLine, endLine: u.endLine, text: u.text })),
      [
        { kind: "paragraph", startLine: 1, endLine: 1, text: "Intro paragraph." },
        { kind: "paragraph", startLine: 8, endLine: 8, text: "Outro paragraph." },
      ],
    );
  });
});

describe("splitClaims frontmatter", () => {
  it("skips YAML frontmatter at the top of a file", () => {
    const lines = ["---", "title: Something", "---", "", "Body paragraph.", ""];
    const units = splitClaims("doc.md", lines.join("\n"));
    assert.deepEqual(units.map((u) => u.text), ["Body paragraph."]);
    assert.equal(units[0].startLine, 5);
    assert.equal(units[0].endLine, 5);
  });
});

describe("splitClaims table rows", () => {
  it("emits one unit per data row and excludes the header and separator rows", () => {
    const lines = ["| Name | Value |", "| --- | --- |", "| a | 1 |", "| b | 2 |", ""];
    const units = splitClaims("doc.md", lines.join("\n"));
    assert.deepEqual(
      units.map((u) => ({ kind: u.kind, startLine: u.startLine, endLine: u.endLine, text: u.text })),
      [
        { kind: "table-row", startLine: 3, endLine: 3, text: "| a | 1 |" },
        { kind: "table-row", startLine: 4, endLine: 4, text: "| b | 2 |" },
      ],
    );
  });
});

describe("splitClaims heading trail", () => {
  it("builds the heading trail from enclosing headings and pops siblings correctly", () => {
    const lines = [
      "# H1",
      "",
      "## H2",
      "",
      "Text under H2.",
      "",
      "### H3",
      "",
      "Text under H3.",
      "",
      "## H2b",
      "",
      "Text under H2b.",
      "",
    ];
    const units = splitClaims("doc.md", lines.join("\n"));
    assert.deepEqual(
      units.map((u) => ({ heading: u.heading, text: u.text })),
      [
        { heading: "H1 > H2", text: "Text under H2." },
        { heading: "H1 > H2 > H3", text: "Text under H3." },
        { heading: "H1 > H2b", text: "Text under H2b." },
      ],
    );
  });
});

describe("splitClaims JSON descriptions", () => {
  it("extracts description strings at any depth with a dotted heading path", () => {
    const lines = [
      "{",
      '  "name": "test-plugin",',
      '  "description": "Top level description.",',
      '  "plugins": [',
      "    {",
      '      "name": "sub",',
      '      "description": "Sub plugin description."',
      "    }",
      "  ]",
      "}",
    ];
    const units = splitClaims("some/plugin.json", lines.join("\n"));
    assert.deepEqual(
      units.map((u) => ({ heading: u.heading, startLine: u.startLine, endLine: u.endLine, kind: u.kind, text: u.text })),
      [
        {
          heading: "description",
          startLine: 3,
          endLine: 3,
          kind: "json-description",
          text: "Top level description.",
        },
        {
          heading: "plugins.0.description",
          startLine: 7,
          endLine: 7,
          kind: "json-description",
          text: "Sub plugin description.",
        },
      ],
    );
  });

  it("returns an empty array for invalid JSON instead of throwing", () => {
    assert.deepEqual(splitClaims("broken.json", "{ not json"), []);
  });
});

describe("splitClaims edge cases", () => {
  it("returns an empty array for an empty file", () => {
    assert.deepEqual(splitClaims("empty.md", ""), []);
  });
});

describe("listDocFiles", () => {
  it("filters to tracked .md files and .claude-plugin manifests, sorted, via the injected runner", () => {
    const calls = [];
    const run = (args) => {
      calls.push(args);
      return [
        "README.md",
        "src/index.ts",
        ".claude-plugin/plugin.json",
        ".claude-plugin/marketplace.json",
        "notes.txt",
      ].join("\n");
    };
    const files = listDocFiles("/repo", run);
    assert.deepEqual(calls, [["ls-files"]]);
    assert.deepEqual(files, [
      ".claude-plugin/marketplace.json",
      ".claude-plugin/plugin.json",
      "README.md",
    ]);
  });
});
