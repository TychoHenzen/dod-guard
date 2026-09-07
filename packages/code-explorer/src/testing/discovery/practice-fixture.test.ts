import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createDiscoveryPipeline } from "../../discovery/pipeline.js";
import { createNativeProjectRoot } from "../../semantic/api/public-api.js";
import { writePracticeFiles } from "./pipeline/practice-files-fixture.js";
import { sourceSymbol } from "./pipeline/source-symbol-fixture.js";

it("runs the bounded discovery practice fixture", () => {
  const root = mkdtempSync(join(tmpdir(), "code-explorer-discovery-practice-"));
  try {
    writePracticeFiles(root);

    const pipeline = createDiscoveryPipeline(createNativeProjectRoot(root));
    const symbols = [
      symbol("payment_service", "src/PaymentService.rs", "production"),
      symbol("payment_service", "generated/PaymentService.rs", "generated"),
      symbol("windows_path", "src\\WindowsPath.rs", "windows"),
    ];

    const misspelling = pipeline.search("paymnt_service", {}, symbols);
    assert.ok(
      misspelling.some(
        ({ identity, match_class }) =>
          identity === "production" && match_class === "fuzzy",
      ),
    );

    const defaultDuplicates = pipeline.search("payment_service", {}, symbols);
    assert.equal(
      defaultDuplicates.some(({ identity }) => identity === "generated"),
      false,
    );
    const generatedDuplicates = pipeline.search(
      "payment_service",
      { include_generated: true },
      symbols,
    );
    assert.equal(
      generatedDuplicates.some(({ identity }) => identity === "generated"),
      true,
    );

    assert.deepEqual(
      pipeline
        .search("payment_service", { content: "tests" }, symbols)
        .map(({ path, content }) => [path, content]),
      [["tests/payment_service_test.rs", "test"]],
    );

    const visible = pipeline.search(
      "payment_service",
      { include_generated: true },
      symbols,
    );
    assert.equal(
      visible.some(({ path }) => /\.env|\.git\//u.test(path)),
      false,
    );

    const bounded = pipeline.searchResult(
      "payment_service",
      { include_generated: true, limit: 2 },
      symbols,
    );
    assert.equal(bounded.candidates.length, 2);
    assert.ok(bounded.omitted_candidate_count > 0);
    assert.deepEqual(bounded.available_narrowing_filters, [
      "path_globs",
      "languages",
      "kinds",
      "content",
      "include_generated",
    ]);

    assert.ok(
      pipeline
        .search("windows_path", {}, symbols)
        .every(({ path }) => path === "src/WindowsPath.rs"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function symbol(name: string, path: string, id: string) {
  return sourceSymbol(name, path, { id });
}
