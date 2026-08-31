import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrowserFocusNavigation } from "./focus-navigation.js";
import { type GraphRelationGroup, projectOneHopGraph, renderOneHopGraph } from "./graph.js";
import { BrowserGraphController, graphSnapshot, renderGraphArea, toGraphRelationGroups } from "./graph-navigation.js";
import { BrowserViewHistory } from "./history.js";
import type { RelationGroup } from "./relations.js";

const focus = { symbol_id: "project::Focus", name: "Focus" };

function loaded(
  relation: GraphRelationGroup["relation"],
  candidates: GraphRelationGroup["candidates"],
  omitted_count = 0,
): GraphRelationGroup {
  return { relation, state: "loaded", candidates, omitted_count };
}

describe("one-hop graph projection", () => {
  // covers: code-explorer/local-graph :: The graph contains one focus and loaded one-hop relations :: Focus has no loaded relations
  it("projects only the focus before a relation group has loaded", () => {
    const graph = projectOneHopGraph(focus, []);

    assert.deepEqual(
      graph.nodes.map((node) => node.symbol_id),
      ["project::Focus"],
    );
    assert.deepEqual(graph.edges, []);
  });

  // covers: code-explorer/local-graph :: The graph contains one focus and loaded one-hop relations :: One relation group loads
  it("adds only local returned candidates and direct edges from one loaded group", () => {
    const graph = projectOneHopGraph(focus, [
      loaded("callers", [
        { symbol_id: "project::Caller", name: "Caller" },
        { symbol_id: "external::Thing", name: "Thing", external: true },
      ]),
    ]);

    assert.deepEqual(
      graph.nodes.map((node) => node.symbol_id),
      ["project::Focus", "project::Caller"],
    );
    assert.deepEqual(
      graph.edges.map((edge) => [edge.from, edge.to, edge.label]),
      [["project::Caller", "project::Focus", "caller"]],
    );
  });

  // covers: code-explorer/local-graph :: The graph contains one focus and loaded one-hop relations :: Loaded relation points beyond one hop
  it("does not recursively expand a returned candidate's known relations", () => {
    const graph = projectOneHopGraph(focus, [
      loaded("callees", [
        { symbol_id: "project::FirstHop", name: "First hop", known_relations: ["project::SecondHop"] },
      ]),
    ]);

    assert.deepEqual(
      graph.nodes.map((node) => node.symbol_id),
      ["project::Focus", "project::FirstHop"],
    );
    assert.equal(graph.edges.length, 1);
    assert.doesNotMatch(JSON.stringify(graph), /SecondHop/);
  });

  // covers: code-explorer/local-graph :: The graph contains one focus and loaded one-hop relations :: Duplicate identity arrives through two relations
  it("deduplicates normalized identities while retaining both direct edges", () => {
    const graph = projectOneHopGraph(focus, [
      loaded("callers", [{ symbol_id: "project::Same", name: "Same" }]),
      loaded("references", [{ symbol_id: "project::Same", name: "Same reference" }]),
    ]);

    assert.deepEqual(
      graph.nodes.map((node) => node.symbol_id),
      ["project::Focus", "project::Same"],
    );
    assert.deepEqual(
      graph.edges.map((edge) => edge.label),
      ["reference", "caller"],
    );
  });
});

describe("one-hop graph SVG", () => {
  // covers: code-explorer/local-graph :: Graph edges retain honest semantic labels :: Reference has no call-hierarchy evidence
  it("labels a reference without inventing caller or callee evidence", () => {
    const svg = renderOneHopGraph(
      projectOneHopGraph(focus, [loaded("references", [{ symbol_id: "project::Ref", name: "Ref" }])]),
    );

    assert.match(svg, /data-edge-label="reference"/);
    assert.doesNotMatch(svg, /data-edge-label="caller"|data-edge-label="callee"/);
  });

  // covers: code-explorer/local-graph :: Graph edges retain honest semantic labels :: Caller and definition target the same symbol
  it("renders separate semantic edges when one node has two proved relations", () => {
    const svg = renderOneHopGraph(
      projectOneHopGraph(focus, [
        loaded("callers", [{ symbol_id: "project::Shared", name: "Shared" }]),
        loaded("definition", [{ symbol_id: "project::Shared", name: "Shared" }]),
      ]),
    );

    assert.match(svg, /data-edge-label="caller"/);
    assert.match(svg, /data-edge-label="definition"/);
  });

  // covers: code-explorer/local-graph :: Graph edges retain honest semantic labels :: Relation is discovery-only
  it("does not render discovery-only candidates as semantic edges", () => {
    const svg = renderOneHopGraph(
      projectOneHopGraph(focus, [
        loaded("references", [{ symbol_id: "project::Suggested", name: "Suggested", discovery_only: true }]),
      ]),
    );

    assert.doesNotMatch(svg, /Suggested|data-edge-label/);
  });

  // covers: code-explorer/local-graph :: Relation direction is visually stable :: Incoming and outgoing relations are loaded
  it("places incoming and outgoing semantic relations on their declared lanes", () => {
    const svg = renderOneHopGraph(
      projectOneHopGraph(focus, [
        loaded("callers", [{ symbol_id: "project::Caller", name: "Caller" }]),
        loaded("callees", [{ symbol_id: "project::Callee", name: "Callee" }]),
      ]),
    );

    assert.match(svg, /data-node-id="project::Caller" data-lane="incoming" x="16%"/);
    assert.match(svg, /data-node-id="project::Focus" data-lane="center" x="50%"/);
    assert.match(svg, /data-node-id="project::Callee" data-lane="outgoing" x="84%"/);
    assert.match(svg, /data-edge-label="caller" data-direction="incoming"/);
    assert.match(svg, /data-edge-label="callee" data-direction="outgoing"/);
  });

  // covers: code-explorer/local-graph :: Relation direction is visually stable :: Graph rerenders without state changes
  it("renders identical graph data in identical order on every pass", () => {
    const graph = projectOneHopGraph(focus, [
      loaded("references", [
        { symbol_id: "project::First", name: "First" },
        { symbol_id: "project::Second", name: "Second" },
      ]),
      loaded("callees", [{ symbol_id: "project::Third", name: "Third" }]),
    ]);

    assert.equal(renderOneHopGraph(graph), renderOneHopGraph(graph));
  });
});

describe("bounded graph growth", () => {
  // covers: code-explorer/local-graph :: Graph growth remains visibly bounded :: Relation response is truncated
  it("renders returned nodes and an honest per-group omitted count without placeholders", () => {
    const svg = renderOneHopGraph(
      projectOneHopGraph(focus, [loaded("references", [{ symbol_id: "project::Returned", name: "Returned" }], 7)]),
    );

    assert.match(svg, /data-omitted-relation="references">7 omitted/);
    assert.match(svg, /Returned/);
    assert.doesNotMatch(svg, /placeholder|unknown candidate/i);
  });

  // covers: code-explorer/local-graph :: Graph growth remains visibly bounded :: Several bounded groups are loaded
  it("uses the union of several returned groups without recursive nodes", () => {
    const graph = projectOneHopGraph(focus, [
      loaded(
        "references",
        [{ symbol_id: "project::Reference", name: "Reference", known_relations: ["project::Hidden"] }],
        1,
      ),
      loaded("callees", [{ symbol_id: "project::Callee", name: "Callee" }], 2),
      loaded("implementations", [{ symbol_id: "project::Implementation", name: "Implementation" }]),
    ]);

    assert.deepEqual(
      graph.nodes.map((node) => node.symbol_id),
      ["project::Focus", "project::Reference", "project::Callee", "project::Implementation"],
    );
    assert.equal(graph.edges.length, 3);
    assert.doesNotMatch(JSON.stringify(graph), /Hidden/);
  });
});

function browserGroup(
  relation: RelationGroup["relation"],
  candidates: RelationGroup["candidates"],
  omitted_count = 0,
): RelationGroup {
  return { relation, state: "loaded", candidates, omitted_count };
}

describe("graph navigation and view ownership", () => {
  // covers: code-explorer/local-graph :: Selecting a graph node recenters through normal navigation :: User selects a local graph node
  it("routes a local graph node through focus navigation and resets the graph after success", async () => {
    const navigation = new BrowserFocusNavigation(
      { view_id: "view-old", symbol_id: "old", name: "Old" },
      async ({ symbol_id }) => ({ state: "ok", data: { view_id: "view-new", symbol_id, name: "New" } }),
    );
    const controller = new BrowserGraphController(navigation, () => false);
    const graph = projectOneHopGraph(
      focus,
      toGraphRelationGroups([
        browserGroup("callers", [{ name: "Caller", external: false, symbol_id: "project::Caller", local_handle: "h" }]),
      ]),
    );

    assert.equal(await controller.select(graph.nodes[1]), true);
    assert.deepEqual(
      navigation.state().history.map((entry) => entry.view_id),
      ["view-old", "view-new"],
    );
    assert.match(renderOneHopGraph(graph), /data-focus="project::Caller"/);
    assert.deepEqual(
      controller.graphFor({ symbol_id: "project::Caller", name: "New" }, []).nodes.map((node) => node.symbol_id),
      ["project::Caller"],
    );
  });

  // covers: code-explorer/local-graph :: Selecting a graph node recenters through normal navigation :: Graph focus request fails
  it("keeps the prior graph and history when graph focus fails", async () => {
    const navigation = new BrowserFocusNavigation({ view_id: "view-old", symbol_id: "old", name: "Old" }, async () => ({
      state: "stale_view",
    }));
    const controller = new BrowserGraphController(navigation, () => false);
    const graph = projectOneHopGraph(focus, [loaded("callers", [{ symbol_id: "project::Caller", name: "Caller" }])]);

    assert.equal(await controller.select(graph.nodes[1]), false);
    assert.deepEqual(
      navigation.state().history.map((entry) => entry.view_id),
      ["view-old"],
    );
    assert.deepEqual(
      graph.nodes.map((node) => node.symbol_id),
      ["project::Focus", "project::Caller"],
    );
  });

  // covers: code-explorer/local-graph :: Selecting a graph node recenters through normal navigation :: External result is loaded
  it("keeps external results list-only and out of selectable graph nodes", () => {
    const groups = toGraphRelationGroups([
      browserGroup("callees", [
        { name: "Local", external: false, symbol_id: "project::Local", local_handle: "h" },
        { name: "External", external: true },
      ]),
    ]);
    const graph = projectOneHopGraph(focus, groups);

    assert.deepEqual(
      graph.nodes.map((node) => node.symbol_id),
      ["project::Focus", "project::Local"],
    );
    assert.doesNotMatch(renderOneHopGraph(graph), /External/);
  });

  // covers: code-explorer/local-graph :: Stale and restored views keep recorded graph state :: Project generation advances
  it("keeps stale graph data visible while disabling its node actions", async () => {
    const navigation = new BrowserFocusNavigation({ view_id: "view-old", symbol_id: "old", name: "Old" }, async () => ({
      state: "ok",
      data: { view_id: "unexpected", symbol_id: "unexpected", name: "Unexpected" },
    }));
    const controller = new BrowserGraphController(navigation, () => true);
    const graph = projectOneHopGraph(focus, [loaded("callers", [{ symbol_id: "project::Caller", name: "Caller" }])]);

    assert.match(renderGraphArea(graph, { stale: true }), /data-state="stale"/);
    assert.equal(await controller.select(graph.nodes[1]), false);
    assert.equal(navigation.state().history.length, 1);
  });

  // covers: code-explorer/local-graph :: Stale and restored views keep recorded graph state :: History restores an older view
  it("restores an immutable recorded graph without relation loading", () => {
    const oldGraph = projectOneHopGraph(focus, [loaded("references", [{ symbol_id: "project::Ref", name: "Ref" }], 2)]);
    const history = new BrowserViewHistory({
      view_id: "old",
      symbol_id: "old",
      source: { body: "old" },
      relations: { references: ["ref"] },
      graph: graphSnapshot(oldGraph, true),
      stale: true,
    });
    history.append({ view_id: "new", symbol_id: "new", source: {}, relations: {}, graph: {}, stale: false });

    const restored = history.back();

    assert.deepEqual(restored?.graph, graphSnapshot(oldGraph, true));
    assert.equal(restored?.stale, true);
  });

  // covers: code-explorer/local-graph :: Graph rendering failure does not remove source navigation :: Graph renderer rejects malformed local state
  it("contains malformed graph rendering at the SVG area", () => {
    const malformed = {
      nodes: [{ symbol_id: "focus", name: "Focus", center: true, selectable: false }],
      edges: [{ from: "missing", to: "focus", label: "caller" }],
      omitted: new Map(),
    } as const;

    assert.match(renderGraphArea(malformed), /graph_render_failed/);
    assert.equal(renderGraphArea(malformed).includes("source"), false);
  });

  // covers: code-explorer/local-graph :: Graph rendering failure does not remove source navigation :: Graph area is collapsed
  it("collapses only the graph presentation without discarding graph state", () => {
    const graph = projectOneHopGraph(focus, [loaded("callees", [{ symbol_id: "project::Callee", name: "Callee" }])]);

    assert.match(renderGraphArea(graph, { collapsed: true }), /data-state="collapsed"/);
    assert.deepEqual(
      graph.nodes.map((node) => node.symbol_id),
      ["project::Focus", "project::Callee"],
    );
  });
});
