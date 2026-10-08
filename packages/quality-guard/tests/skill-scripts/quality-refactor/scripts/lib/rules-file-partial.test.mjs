import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { buildConfig } from "../../../../../skills/quality-refactor/scripts/lib/config.mjs";
import { scanFile } from "../../../../../skills/quality-refactor/scripts/lib/rules-file.mjs";
import { withProject } from "./rules-environment-test-support.mjs";

function partialSource(name, methods) {
  const body = [];
  for (let index = 0; index < methods; index += 1)
    body.push(`    public int Value${index}() => ${index};`);
  return [
    "namespace Game;",
    "",
    `public partial class ${name}`,
    "{",
    ...body,
    "}",
  ].join("\n");
}

let sources = {};

function scanPartial(root, rel) {
  const source = sources[rel];
  return scanFile(
    {
      path: join(root, rel),
      rel,
      lang: "cs",
      isTest: false,
      source,
      lines: source.split("\n"),
    },
    buildConfig("default"),
  ).violations;
}

function project(files, check) {
  sources = files;
  withProject(files, check);
}

function rulesOf(violations, rule) {
  return violations.filter((violation) => violation.rule === rule);
}

test("a partial class split across files is measured as one class", () => {
  project(
    {
      "Board.cs": partialSource("Board", 190),
      "Board.Moves.cs": partialSource("Board", 190),
    },
    (root) => {
      const violations = scanPartial(root, "Board.cs");
      const [finding] = rulesOf(violations, "partial-type-length");
      assert.equal(finding.severity, "error");
      assert.equal(finding.metric, 2 * 195);
      assert.equal(finding.line, 3);
      assert.match(
        finding.message,
        /partial class Board spans 2 files totaling 390 lines/,
      );
      assert.match(finding.suggestion, /Extract Class/);
      assert.equal(rulesOf(violations, "file-length")[0].severity, "warn");
    },
  );
});

test("a single partial declaration is not a finding", () => {
  project({ "Player.cs": partialSource("Player", 400) }, (root) => {
    const violations = scanPartial(root, "Player.cs");
    assert.deepEqual(rulesOf(violations, "partial-type-length"), []);
    assert.equal(rulesOf(violations, "file-length")[0].severity, "error");
  });
});

test("generated partial siblings do not count toward the class", () => {
  project(
    {
      "Parser.cs": partialSource("Parser", 50),
      "Parser.g.cs": partialSource("Parser", 400),
      "Parser.Designer.cs": partialSource("Parser", 400),
    },
    (root) => {
      const violations = scanPartial(root, "Parser.cs");
      assert.deepEqual(rulesOf(violations, "partial-type-length"), []);
    },
  );
});

test("partial siblings of a different type are not counted", () => {
  project(
    {
      "Board.cs": partialSource("Board", 60),
      "Board.Moves.cs": partialSource("Board", 60),
      "BoardView.cs": partialSource("BoardView", 400),
    },
    (root) => {
      const [finding] = rulesOf(
        scanPartial(root, "Board.cs"),
        "partial-type-length",
      );
      assert.equal(finding.metric, 2 * 65);
      assert.equal(finding.severity, "warn");
    },
  );
});
