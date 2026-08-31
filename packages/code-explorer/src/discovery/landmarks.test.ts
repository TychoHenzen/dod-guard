import assert from "node:assert/strict";
import { it } from "node:test";
import {
  defaultLandmarks,
  groupLandmarks,
  type LandmarkCandidate,
  rankLandmarks,
  readyGroupedLandmarks,
  scoreLandmark,
} from "./landmarks.js";

// covers: code-explorer/project-landmarks :: Landmarks use a visible deterministic score :: Public type is used across production directories
it("reports every observed evidence counter, source, and declared score", () => {
  const landmark = scoreLandmark({
    symbol: { symbol_id: "order", name: "Order", path: "src/domain/order.ts", kind: "type" },
    references: [
      { path: "app/orders.ts", content: "production" },
      { path: "lib/exports.ts", content: "production" },
    ],
    incoming_call_sites: ["app/orders.ts:4"],
    public_or_exported: true,
  });

  assert.deepEqual(landmark.evidence, {
    production_reference_files: 2,
    incoming_call_sites: 1,
    directory_spread: 2,
    public_or_exported: true,
    test_only: false,
    sources: {
      production_reference_files: "semantic_references",
      directory_spread: "semantic_references",
      incoming_call_sites: "incoming_call_hierarchy",
      public_or_exported: "semantic_visibility",
      test_only: "classification",
    },
  });
  assert.equal(landmark.score, 19);
  assert.equal(landmark.eligible, true);
});

// covers: code-explorer/project-landmarks :: Landmarks use a visible deterministic score :: Call evidence is unavailable
it("does not infer incoming calls when the backend leaves that evidence unavailable", () => {
  const landmark = scoreLandmark({
    symbol: { symbol_id: "helper", name: "helper", path: "src/helper.ts", kind: "function" },
    references: [{ path: "app/main.ts", content: "production" }],
  });

  assert.equal(landmark.evidence.incoming_call_sites, 0);
  assert.equal(landmark.evidence.sources.incoming_call_sites, "unavailable");
  assert.equal(landmark.score, 5);
});

// covers: code-explorer/project-landmarks :: Tests and generated content do not dominate landmarks :: Symbol appears only in tests
it("penalizes a test-only candidate below an otherwise comparable production candidate", () => {
  const [production, testOnly] = rankLandmarks([
    {
      symbol: { symbol_id: "production", name: "Production", path: "src/production.ts", kind: "type" },
      references: [{ path: "app/main.ts", content: "production" }],
    },
    {
      symbol: { symbol_id: "test", name: "TestOnly", path: "src/test-only.ts", kind: "type" },
      references: [{ path: "tests/test-only.test.ts", content: "test" }],
    },
  ]);

  assert.equal(production?.symbol_id, "production");
  assert.equal(testOnly?.symbol_id, "test");
  assert.equal(testOnly?.evidence.test_only, true);
  assert.equal(testOnly?.evidence.sources.test_only, "classification");
  assert.equal(testOnly?.score, -20);
});

// covers: code-explorer/project-landmarks :: Tests and generated content do not dominate landmarks :: Generated symbol duplicates a source symbol
it("keeps only the source identity when generated output duplicates it", () => {
  const landmarks = defaultLandmarks([
    {
      symbol: { symbol_id: "Order", name: "Order", path: "src/order.ts", kind: "type" },
      references: [{ path: "app/main.ts", content: "production" }],
    },
    {
      symbol: { symbol_id: "Order", name: "Order", path: "dist/order.js", kind: "type" },
      references: [{ path: "app/main.ts", content: "production" }],
      generated_only: true,
    },
  ]);

  assert.deepEqual(
    landmarks.map((landmark) => landmark.path),
    ["src/order.ts"],
  );
});

// covers: code-explorer/project-landmarks :: Landmark groups remain meaningful and bounded :: Project contains candidates for several groups
it("assigns each eligible landmark to its one declared group with identity and evidence", () => {
  const discovery = readyGroupedLandmarks([
    candidate("Order", "type"),
    candidate("OrderEvent", "class"),
    candidate("OrderService", "interface"),
    candidate("main", "function"),
    candidate("archiveOrder", "method"),
  ]);

  assert.deepEqual(
    discovery.landmarks.map(({ group }) => group),
    ["messages_or_events", "services", "entry_points", "types", "common_actions"],
  );
  for (const group of discovery.landmarks) {
    assert.equal(group.omitted_candidate_count, 0);
    assert.equal(group.symbols.length, 1);
    const [landmark] = group.symbols;
    assert.ok(landmark?.symbol_id);
    assert.ok(landmark?.path);
    assert.ok(landmark?.kind);
    assert.ok("evidence" in (landmark ?? {}));
  }
});

// covers: code-explorer/project-landmarks :: Landmark groups remain meaningful and bounded :: One group exceeds its limit
it("bounds each group and reports its omitted candidate count", () => {
  const groups = groupLandmarks(
    [candidate("first", "function"), candidate("second", "function"), candidate("third", "function")],
    2,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.group, "common_actions");
  assert.deepEqual(
    groups[0]?.candidates.map((candidate) => candidate.symbol_id),
    ["first", "second"],
  );
  assert.equal(groups[0]?.omitted_candidate_count, 1);
  assert.equal(groups[0]?.candidates.length, 2);
  assert.throws(() => groupLandmarks([], 51), /landmark_group_limit_exceeded/);
});

// covers: code-explorer/project-landmarks :: Landmark groups remain meaningful and bounded :: Related message and service symbols remain distinct
it("keeps a related message and service symbol in their separate literal suffix groups", () => {
  const groups = groupLandmarks([candidate("OrderEvent", "type"), candidate("OrderService", "type")]);
  assert.deepEqual(
    groups.map(({ group, candidates }) => ({ group, identities: candidates.map((candidate) => candidate.symbol_id) })),
    [
      { group: "messages_or_events", identities: ["OrderEvent"] },
      { group: "services", identities: ["OrderService"] },
    ],
  );
});

// covers: code-explorer/project-landmarks :: Raw word frequency never establishes a landmark :: Generic identifier occurs most often
it("does not select a frequently named generic identifier without supported evidence", () => {
  const landmarks = defaultLandmarks([
    { symbol: { symbol_id: "value", name: "value", path: "src/value.ts", kind: "function" }, references: [] },
    candidate("UsefulService", "type"),
  ]);

  assert.deepEqual(
    landmarks.map(({ symbol_id }) => symbol_id),
    ["UsefulService"],
  );
});

// covers: code-explorer/project-landmarks :: Raw word frequency never establishes a landmark :: Landmark scores tie
it("uses group, normalized path, kind, and identity to order equal evidence", () => {
  const ranked = rankLandmarks([
    {
      symbol: { symbol_id: "zeta", name: "Zeta", path: "SRC\\b.ts", kind: "function" },
      references: [{ path: "app/a.ts", content: "production" }],
    },
    {
      symbol: { symbol_id: "beta", name: "Beta", path: "src/a.ts", kind: "method" },
      references: [{ path: "app/a.ts", content: "production" }],
    },
    {
      symbol: { symbol_id: "alpha", name: "Alpha", path: "src/a.ts", kind: "method" },
      references: [{ path: "app/a.ts", content: "production" }],
    },
    {
      symbol: { symbol_id: "event", name: "OrderEvent", path: "src/z.ts", kind: "type" },
      references: [{ path: "app/a.ts", content: "production" }],
    },
  ]);

  assert.deepEqual(
    ranked.map(({ symbol_id }) => symbol_id),
    ["event", "alpha", "beta", "zeta"],
  );
});

// covers: code-explorer/project-landmarks :: Raw word frequency never establishes a landmark :: Language does not report visibility
it("records unavailable visibility as zero evidence", () => {
  const landmark = scoreLandmark({
    symbol: { symbol_id: "hidden", name: "Hidden", path: "src/hidden.ts", kind: "type" },
    references: [{ path: "app/main.ts", content: "production" }],
  });

  assert.equal(landmark.evidence.public_or_exported, false);
  assert.equal(landmark.evidence.sources.public_or_exported, "unavailable");
  assert.equal(landmark.score, 5);
});

it("runs the deterministic landmark practice fixture", () => {
  const groups = groupLandmarks([
    {
      symbol: { symbol_id: "event", name: "OrderEvent", path: "src/events/order.ts", kind: "type" },
      references: [{ path: "app/consumer.ts", content: "production" }],
      public_or_exported: true,
    },
    {
      symbol: { symbol_id: "service", name: "OrderService", path: "src/services/order.ts", kind: "interface" },
      references: [
        { path: "app/consumer.ts", content: "production" },
        { path: "lib/client.ts", content: "production" },
      ],
      incoming_call_sites: ["app/consumer.ts:2"],
      public_or_exported: true,
    },
    {
      symbol: { symbol_id: "main", name: "main", path: "src/main.ts", kind: "function" },
      references: [{ path: "app/boot.ts", content: "production" }],
    },
    {
      symbol: { symbol_id: "type", name: "Order", path: "src/domain/order.ts", kind: "type" },
      references: [{ path: "app/consumer.ts", content: "production" }],
    },
    {
      symbol: { symbol_id: "action", name: "archiveOrder", path: "src/actions/archive.ts", kind: "method" },
      references: [{ path: "app/consumer.ts", content: "production" }],
    },
    {
      symbol: { symbol_id: "test", name: "TestHelper", path: "tests/helper.test.ts", kind: "function" },
      references: [{ path: "tests/helper.test.ts", content: "test" }],
    },
    {
      symbol: { symbol_id: "generated", name: "Order", path: "dist/order.js", kind: "type" },
      references: [{ path: "app/consumer.ts", content: "production" }],
      generated_only: true,
    },
    {
      symbol: { symbol_id: "unknown", name: "UnknownType", path: "src/unknown.ts", kind: "type" },
      references: [{ path: "app/consumer.ts", content: "production" }],
    },
    {
      symbol: { symbol_id: "tie-b", name: "TieB", path: "src/z.ts", kind: "function" },
      references: [{ path: "app/consumer.ts", content: "production" }],
    },
    {
      symbol: { symbol_id: "tie-a", name: "TieA", path: "src/a.ts", kind: "function" },
      references: [{ path: "app/consumer.ts", content: "production" }],
    },
  ]);

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
  assert.deepEqual(observed, [
    {
      group: "messages_or_events",
      symbols: [
        {
          symbol_id: "event",
          score: 10,
          production_reference_files: 1,
          incoming_call_sites: 0,
          public_or_exported: true,
          visibility_source: "semantic_visibility",
        },
      ],
    },
    {
      group: "services",
      symbols: [
        {
          symbol_id: "service",
          score: 19,
          production_reference_files: 2,
          incoming_call_sites: 1,
          public_or_exported: true,
          visibility_source: "semantic_visibility",
        },
      ],
    },
    {
      group: "entry_points",
      symbols: [
        {
          symbol_id: "main",
          score: 5,
          production_reference_files: 1,
          incoming_call_sites: 0,
          public_or_exported: false,
          visibility_source: "unavailable",
        },
      ],
    },
    {
      group: "types",
      symbols: [
        {
          symbol_id: "type",
          score: 5,
          production_reference_files: 1,
          incoming_call_sites: 0,
          public_or_exported: false,
          visibility_source: "unavailable",
        },
        {
          symbol_id: "unknown",
          score: 5,
          production_reference_files: 1,
          incoming_call_sites: 0,
          public_or_exported: false,
          visibility_source: "unavailable",
        },
      ],
    },
    {
      group: "common_actions",
      symbols: [
        {
          symbol_id: "tie-a",
          score: 5,
          production_reference_files: 1,
          incoming_call_sites: 0,
          public_or_exported: false,
          visibility_source: "unavailable",
        },
        {
          symbol_id: "action",
          score: 5,
          production_reference_files: 1,
          incoming_call_sites: 0,
          public_or_exported: false,
          visibility_source: "unavailable",
        },
        {
          symbol_id: "tie-b",
          score: 5,
          production_reference_files: 1,
          incoming_call_sites: 0,
          public_or_exported: false,
          visibility_source: "unavailable",
        },
      ],
    },
  ]);
});

function candidate(name: string, kind: string): LandmarkCandidate {
  return {
    symbol: { symbol_id: name, name, path: `src/${name}.ts`, kind },
    references: [{ path: `app/${name}.ts`, content: "production" }],
  };
}
