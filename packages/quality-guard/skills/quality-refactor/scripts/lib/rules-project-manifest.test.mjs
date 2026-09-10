import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfig } from "./config.mjs";
import { checkReachability } from "./rules-project.mjs";
import { fileWithCode, scansFor } from "./rules-project-fixtures.test.mjs";

test("a manifest reference keeps a C# type reachable", () => {
  const files = [
    fileWithCode(
      "Scripts/TerminalDisplay.cs",
      "public class TerminalDisplay {}",
      { lang: "cs" },
    ),
    fileWithCode("Scripts/Other.cs", "// unrelated", { lang: "cs" }),
  ];
  const manifests = [
    { rel: "RootScene.tscn", text: '[node type="TerminalDisplay"]' },
  ];
  assert.equal(
    checkReachability({
      files,
      scans: scansFor(files),
      config: buildConfig("default"),
      manifests,
    }).length,
    0,
  );
});

test("a markdown mention is not manifest evidence", () => {
  const files = [
    fileWithCode("Scripts/Widget.cs", "public class Widget {}", { lang: "cs" }),
    fileWithCode("Scripts/Other.cs", "// unrelated", { lang: "cs" }),
  ];
  const found = checkReachability({
    files,
    scans: scansFor(files),
    config: buildConfig("default"),
    manifests: [],
  });
  assert.equal(found.length, 1);
  assert.match(found[0].message, /Widget/);
});

test("an unrelated manifest does not keep a type reachable", () => {
  const files = [
    fileWithCode("Scripts/Ghost.cs", "public class Ghost {}", { lang: "cs" }),
    fileWithCode("Scripts/Other.cs", "// unrelated", { lang: "cs" }),
  ];
  const manifests = [
    { rel: "RootScene.tscn", text: '[node type="SomethingElse"]' },
  ];
  const found = checkReachability({
    files,
    scans: scansFor(files),
    config: buildConfig("default"),
    manifests,
  });
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, "dead-export");
});

test("a manifest file is never reported as a violation source", () => {
  const files = [
    fileWithCode(
      "Scripts/TerminalDisplay.cs",
      "public class TerminalDisplay {}",
      { lang: "cs" },
    ),
  ];
  const manifests = [
    { rel: "RootScene.tscn", text: '[node type="TerminalDisplay"]' },
  ];
  const found = checkReachability({
    files,
    scans: scansFor(files),
    config: buildConfig("default"),
    manifests,
  });
  assert.equal(
    found.some((violation) => violation.file === "RootScene.tscn"),
    false,
  );
});
