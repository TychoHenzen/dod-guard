import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { createDiscoveryPipeline } from "../../../discovery/pipeline.js";
import { createNativeProjectRoot } from "../../../semantic/api/public-api.js";

it(
  "keeps defaults usable while surfacing an invalid " +
    "classification configuration",
  () => {
    const root = mkdtempSync(
      join(tmpdir(), "code-explorer-discovery-invalid-"),
    );
    try {
      mkdirSync(join(root, "src"));
      writeFileSync(
        join(root, "src", "Helper.ts"),
        "export const helper = 1;\n",
      );
      writeFileSync(join(root, ".code-explorer.json"), "{ invalid");
      const pipeline = createDiscoveryPipeline(createNativeProjectRoot(root));
      assert.deepEqual(pipeline.status(), {
        classification_config_invalid: true,
      });
      assert.deepEqual(
        pipeline.search("helper", {}).map((item) => item.path),
        ["src/Helper.ts"],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
