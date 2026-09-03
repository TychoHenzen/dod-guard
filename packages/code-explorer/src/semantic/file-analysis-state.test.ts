import assert from "node:assert/strict";
import { it } from "node:test";
import { createFileAnalysisStates } from "./file-analysis-state.js";

it("keeps other files queryable when one supported source file has invalid UTF-8", () => {
  const states = createFileAnalysisStates([
    { path: "src/bad.rs", bytes: new Uint8Array([0xff]) },
    { path: "src/good.rs", bytes: new TextEncoder().encode("fn good() {}") },
  ]);

  assert.deepEqual(states.status("src/bad.rs"), { state: "unavailable", reason: "invalid_encoding" });
  assert.deepEqual(states.queryablePaths(), ["src/good.rs"]);
});
it("labels only syntax-error results partial without inferring missing relations", () => {
  const states = createFileAnalysisStates([
    { path: "src/broken.py", text: "def broken(:" },
    { path: "src/ready.py", text: "def ready(): pass" },
  ]);

  states.markPartial("src/broken.py", "syntax_error");

  assert.deepEqual(states.status("src/broken.py"), { state: "partial", reason: "syntax_error" });
  assert.deepEqual(states.queryablePaths(), ["src/broken.py", "src/ready.py"]);
  assert.equal(states.mayInferMissingRelation("src/broken.py"), false);
});
it("marks unsupported generated syntax unavailable without terminating other indexing", () => {
  const states = createFileAnalysisStates([
    { path: "src/generated.py", text: "generated" },
    { path: "src/usable.py", text: "def usable(): pass" },
  ]);

  states.markUnavailable("src/generated.py", "unsupported_syntax");

  assert.deepEqual(states.status("src/generated.py"), { state: "unavailable", reason: "unsupported_syntax" });
  assert.deepEqual(states.queryablePaths(), ["src/usable.py"]);
});
