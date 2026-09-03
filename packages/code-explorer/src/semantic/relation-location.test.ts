import assert from "node:assert/strict";
import { it } from "node:test";
import type { SymbolIdentity } from "./contract.js";
import {
  createExternalSemanticRelation,
  createProjectSemanticRelation,
  type ExternalSymbolIdentity,
} from "./semantic-authority.js";

const location = {
  path: "src/caller.rs",
  range: { start: { line: 8, character: 2 }, end: { line: 8, character: 12 } },
};
const caller: SymbolIdentity = {
  id: "rust:caller",
  name: "caller",
  language: "rust",
  kind: "function",
  location,
};
const backend = { backend_name: "rust-analyzer", backend_version: "1.0.0" };
const externalDefinition: ExternalSymbolIdentity = {
  id: "rust:external-definition",
  name: "ExternalDefinition",
  language: "rust",
  kind: "function",
  location: { external: true },
};
it("returns a project-local caller identity and its normalized call-site location", () => {
  const relation = createProjectSemanticRelation({
    relation: "callers",
    ...backend,
    symbol: caller,
    location,
    call_site: location,
    local_handle: "handle-1",
  });

  assert.deepEqual(relation, {
    relation: "callers",
    relation_source: "semantic",
    external: false,
    ...backend,
    symbol: caller,
    location,
    call_site: location,
    local_handle: "handle-1",
  });
});
it("labels an external definition without a project-local focus handle", () => {
  const relation = createExternalSemanticRelation({
    relation: "definition",
    ...backend,
    symbol: externalDefinition,
  });

  assert.deepEqual(relation, {
    relation: "definition",
    relation_source: "semantic",
    external: true,
    ...backend,
    symbol: externalDefinition,
    location: { external: true },
  });
  assert.equal("local_handle" in relation, false);
  const cannotAddProjectHandle = (external: typeof relation) => {
    // @ts-expect-error External relations cannot carry a project-local handle.
    return { ...external, local_handle: "handle-1" } satisfies typeof relation;
  };
  assert.equal(typeof cannotAddProjectHandle, "function");
  const cannotUseProjectLocation = () => {
    // @ts-expect-error External identities cannot have a project-local location.
    return { ...externalDefinition, location } satisfies ExternalSymbolIdentity;
  };
  assert.equal(typeof cannotUseProjectLocation, "function");
});
