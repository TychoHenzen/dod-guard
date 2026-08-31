import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createNativeProjectRoot } from "../semantic/project-root.js";
import { createDiscoveryPipeline } from "./pipeline.js";

// covers: code-explorer/symbol-discovery :: Broad searches return a refinement response :: Candidate count exceeds the limit
it("returns bounded candidates with exact omissions and available narrowing filters", () => {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-discovery-response-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "Helper.ts"), "export const helper = 1;\n");
    writeFileSync(join(root, "src", "Helpers.ts"), "export const helpers = 1;\n");
    const response = createDiscoveryPipeline(createNativeProjectRoot(root)).searchResult("helper", { limit: 1 });
    assert.equal(response.candidates.length, 1);
    assert.equal(response.omitted_candidate_count, 1);
    assert.deepEqual(response.applied_filters, { limit: 1 });
    assert.deepEqual(response.available_narrowing_filters, [
      "path_globs",
      "languages",
      "kinds",
      "content",
      "include_generated",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// covers: code-explorer/symbol-discovery :: Broad searches return a refinement response :: No candidate matches
it("returns an honest empty response with the applied filters", () => {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-discovery-empty-"));
  try {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "Helper.ts"), "export const helper = 1;\n");
    const response = createDiscoveryPipeline(createNativeProjectRoot(root)).searchResult("missing", {
      content: "production",
      kinds: ["function"],
    });
    assert.deepEqual(response.candidates, []);
    assert.equal(response.omitted_candidate_count, 0);
    assert.deepEqual(response.applied_filters, { content: "production", kinds: ["function"] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
