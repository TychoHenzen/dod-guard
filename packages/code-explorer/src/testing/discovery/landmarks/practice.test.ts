import assert from "node:assert/strict";
import { it } from "node:test";
import { groupLandmarks } from "../../../discovery/landmarks.js";
import { practiceCandidates } from "./practice-candidates-fixture.js";
import { expectedPracticeGroups } from "./practice-expectations-fixture.js";

it("runs the deterministic landmark practice fixture", () => {
  const groups = groupLandmarks(practiceCandidates);

  const observed = groups.map(({ group, candidates: symbols }) => ({
    group,
    symbols: symbols.map(({ symbol_id, evidence, score }) => ({
      symbol_id,
      score,
      production_reference_files: evidence.production_reference_files,
      incoming_call_sites: evidence.incoming_call_sites,
      public_or_exported: evidence.public_or_exported,
      visibility_source: evidence.sources.public_or_exported,
    })),
  }));
  assert.deepEqual(observed, expectedPracticeGroups);
});
