// This repository's own Biome configs, copied into a temp dir, give the
// widths `biome format` applies in this checkout (#871 AC-1).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createWidthResolver } from "../../../../../skills/quality-refactor/scripts/lib/formatter-width.mjs";
import { at, FALLBACK, tempTree } from "./formatter-width-test-support.mjs";

const REPO = fileURLToPath(new URL("../../../../../../../", import.meta.url));
const NESTED = "packages/code-explorer/tests/semantic-tests/biome.json";

function repoConfigCopy(t) {
  const read = (rel) => readFileSync(join(REPO, rel), "utf8");
  const files = { "biome.json": read("biome.json"), [NESTED]: read(NESTED) };
  return tempTree(t, files);
}

// semantic-tests is not formatted at all: `biome format` on a real file there
// reports it ignored, because the root's formatter.includes are read from the
// nested config's directory and match nothing. The scanner falls back, which
// is still width 80.
const EXPECTED = {
  "packages/fossil/src/x.ts": at(80),
  "packages/quality-guard/tests/x.mjs": at(80),
  "packages/quality-guard/tests/scripts/x.test.mjs": at(80),
  "packages/quality-guard/src/x.ts": at(80),
  "packages/code-explorer/src/navigation/x.ts": at(80),
  "packages/code-explorer/tests/semantic-tests/x.ts": FALLBACK,
  "packages/knowledge-base/src/x.ts": at(120),
  "plugins/dod-guard/skills/x/x.mjs": at(120),
  "scripts/ci/x.mjs": at(120),
  "packages/quality-guard/skills/quality-refactor/scripts/x.mjs": FALLBACK,
};

test("this repository's configs give the widths Biome applies", (t) => {
  const widthFor = createWidthResolver(repoConfigCopy(t));
  for (const [path, expected] of Object.entries(EXPECTED)) {
    assert.deepEqual(widthFor(path), expected, path);
  }
});
