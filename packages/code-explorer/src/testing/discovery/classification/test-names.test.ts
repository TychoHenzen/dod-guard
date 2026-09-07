import assert from "node:assert/strict";
import { it } from "node:test";
import { classifyProjectPath } from "../../../discovery/classification.js";

it("recognizes standard language test names " + "before ranking", () => {
  assert.deepEqual(classifyProjectPath("src/FooTests.cs"), {
    content: "test",
    source: "test_marker",
  });
  assert.deepEqual(classifyProjectPath("pkg/test_helper.py"), {
    content: "test",
    source: "test_marker",
  });
  assert.deepEqual(classifyProjectPath("crate/helper_test.rs"), {
    content: "test",
    source: "test_marker",
  });
});
