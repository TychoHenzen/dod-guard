import assert from "node:assert/strict";
import { test } from "node:test";
import { FossilAnalysisError } from "./analysis-error.js";

test("retains typed analysis error details", () => {
  const error = new FossilAnalysisError({ code: "resource_limit", message: "limit reached" });

  assert.equal(error instanceof Error, true);
  assert.equal(error.code, "resource_limit");
  assert.equal(error.message, "limit reached");
});
