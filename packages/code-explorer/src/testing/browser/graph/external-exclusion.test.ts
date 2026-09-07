import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  projectOneHopGraph,
  renderOneHopGraph,
} from "../../../browser/graph.js";
import { toGraphRelationGroups } from "../../../browser/graph-navigation.js";

import { browserGroup, focus } from "./fixture.test.js";

describe("graph navigation and view ownership", () => {
  it(
    "keeps external results list-only " + "and out of selectable graph nodes",
    () => {
      const groups = toGraphRelationGroups([
        browserGroup("callees", [
          {
            name: "Local",
            external: false,
            symbol_id: "project::Local",
            local_handle: "h",
          },
          { name: "External", external: true },
        ]),
      ]);
      const graph = projectOneHopGraph(focus, groups);

      assert.deepEqual(
        graph.nodes.map((node) => node.symbol_id),
        ["project::Focus", "project::Local"],
      );
      assert.doesNotMatch(renderOneHopGraph(graph), /External/);
    },
  );
});
