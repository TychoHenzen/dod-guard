import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fileWithCode,
  reachabilityRulesFor,
} from "./rules-project-fixtures.test.mjs";

const unrelated = fileWithCode("Scripts/Other.cs", "// unrelated", {
  lang: "cs",
});

test("a [GlobalClass] Resource subclass is engine-registered", () => {
  const files = [
    fileWithCode(
      "Scripts/NoiseGradient.cs",
      "[Tool]\n[GlobalClass]\npublic partial class NoiseGradient : Resource {}",
      { lang: "cs" },
    ),
    unrelated,
  ];
  assert.deepEqual(reachabilityRulesFor("NoiseGradient", files), []);
});

test("[GlobalClass] inside a combined attribute list registers the type", () => {
  const files = [
    fileWithCode(
      "Scripts/NoiseGradient.cs",
      "[Tool, GlobalClass]\npublic partial class NoiseGradient : Resource {}",
      { lang: "cs" },
    ),
    unrelated,
  ];
  assert.deepEqual(reachabilityRulesFor("NoiseGradient", files), []);
});

test("[Tool] alone does not register a type", () => {
  const files = [
    fileWithCode(
      "Scripts/NoiseGradient.cs",
      "[Tool]\npublic partial class NoiseGradient : Resource {}",
      { lang: "cs" },
    ),
    unrelated,
  ];
  assert.deepEqual(reachabilityRulesFor("NoiseGradient", files), [
    "dead-export",
  ]);
});

test("the attribute of a neighbouring class does not leak", () => {
  const files = [
    fileWithCode(
      "Scripts/Pair.cs",
      "[GlobalClass]\npublic class A {}\npublic class Other {}",
      { lang: "cs" },
    ),
    unrelated,
  ];
  assert.deepEqual(reachabilityRulesFor("Other", files), ["dead-export"]);
});
