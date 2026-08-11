import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseMarkdownFromString } from "./parser.js";

// The OpenSpec dod artifact template lives outside packages/dod-guard, but
// its markdown dialect is exactly what parser.ts reads. Pin that contract
// here: fill the template's placeholders with a concrete sample and parse
// it the same way `dod_import` would.
const TEMPLATE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "openspec",
  "schemas",
  "dod-guard-spec-driven",
  "templates",
  "dod.md",
);

function fillTemplate(): string {
  const raw = readFileSync(TEMPLATE_PATH, "utf-8");

  const rootsBlock = [
    "### user-export [x]",
    "",
    '  - [x] Proof: `npm test -- export.test.ts` -> CSV file downloads with all user data <!--p:{"type":"exit_code","value":0}-->',
    "",
    "### user-export-empty [ ]",
    "",
    '  - [ ] Proof: `npm test -- export-empty.test.ts` -> export button disabled when dataset is empty <!--p:{"type":"output_contains","value":"disabled"}-->',
  ].join("\n");

  const templateRootsBlock = [
    "### <!-- capability-path --> [ ]",
    "",
    '  - [ ] Proof: `<!-- verification command for this scenario -->` -> <!-- scenario name: expected behavior --> <!--p:{"type":"exit_code","value":0}-->',
  ].join("\n");

  return raw
    .replace("<!-- change title -->", "Data Export")
    .replaceAll("<!-- absolute path to the target repo -->", "C:/repo")
    .replace("<!-- one-sentence goal for this change -->", "Let users export their data.")
    .replace("<!-- YYYY-MM-DD -->", "2026-08-11")
    .replace("<!-- uuid assigned at import -->", "11111111-1111-4111-8111-111111111111")
    .replace(
      "<!-- One line per capability this DoD covers, e.g.:\n     - <capability-path>: <what the capability's spec delta requires> -->",
      "- user-export: allow CSV export of user data",
    )
    .replace(templateRootsBlock, rootsBlock);
}

test("filled dod.md template parses into the expected proof tree", () => {
  const filled = fillTemplate();
  const doc = parseMarkdownFromString(filled);

  assert.equal(doc.title, "Data Export");
  assert.equal(doc.goal, "Let users export their data.");
  assert.equal(doc.date, "2026-08-11");
  assert.equal(doc.cwd, "C:/repo");

  assert.equal(doc.roots.length, 2);

  const [exportRoot, emptyRoot] = doc.roots;
  assert.equal(exportRoot.title, "user-export");
  assert.equal(exportRoot.children?.length, 1);
  assert.equal(emptyRoot.title, "user-export-empty");
  assert.equal(emptyRoot.children?.length, 1);

  const totalLeaves = (exportRoot.children?.length ?? 0) + (emptyRoot.children?.length ?? 0);
  assert.equal(totalLeaves, 2);

  const passLeaf = exportRoot.children?.[0];
  assert.equal(passLeaf?.refinement, "concrete");
  assert.equal(passLeaf?.command, "npm test -- export.test.ts");
  assert.equal(passLeaf?.description, "CSV file downloads with all user data");
  assert.equal(passLeaf?.last_status, "pass");
  assert.deepEqual(passLeaf?.predicate, { type: "exit_code", value: 0 });

  const pendingLeaf = emptyRoot.children?.[0];
  assert.equal(pendingLeaf?.refinement, "concrete");
  assert.equal(pendingLeaf?.command, "npm test -- export-empty.test.ts");
  assert.equal(pendingLeaf?.description, "export button disabled when dataset is empty");
  assert.equal(pendingLeaf?.last_status, "pending");
  assert.deepEqual(pendingLeaf?.predicate, { type: "output_contains", value: "disabled" });
});
