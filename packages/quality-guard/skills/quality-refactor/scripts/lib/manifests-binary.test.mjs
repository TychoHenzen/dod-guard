import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { collectManifests } from "./manifests.mjs";
import { withTempDir } from "./manifests-test-support.test.mjs";

test(
  "collectManifests skips a manifest-extension file that contains binary " +
    "control bytes",
  () => {
    withTempDir((dir) => {
      writeFileSync(join(dir, "weird.tscn"), Buffer.from([0x7b, 0x00, 0x7d]));
      const manifests = collectManifests(dir);
      assert.equal(manifests.length, 0);
    });
  },
);
