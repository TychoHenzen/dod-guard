import assert from "node:assert/strict";
import { it } from "node:test";
import * as boot from "../testing/runtime/runtime-bootstrap-test-support.js";

it("gives managed Python only monotonic mirror roots", async () => {
  const result = await boot.managedPythonRoots();
  const roots = result.roots;
  const source = result.source.replaceAll("\\", "/");
  assert.match(roots[0] ?? "", /code-explorer-pyright-.*generation-0/);
  assert.match(roots[1] ?? "", /code-explorer-pyright-.*generation-1/);
  assert.equal(roots[0]?.includes(source), false);
  assert.equal(roots[1]?.includes(source), false);
});
