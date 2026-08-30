import assert from "node:assert/strict";
import { it } from "node:test";
import type { SymbolIdentity } from "./contract.js";
import {
  composeSemanticRelations,
  type SemanticRelation,
  type StructuralDiscoveryCandidate,
} from "./semantic-authority.js";

const semanticLocation = {
  path: "src/semantic.rs",
  range: { start: { line: 2, character: 0 }, end: { line: 2, character: 8 } },
};
const structuralLocation = {
  path: "src/structural.rs",
  range: { start: { line: 4, character: 0 }, end: { line: 4, character: 8 } },
};
const semanticSymbol: SymbolIdentity = {
  id: "rust:semantic",
  name: "semantic",
  language: "rust",
  kind: "function",
  location: semanticLocation,
};
const structuralCandidate: StructuralDiscoveryCandidate = {
  symbol: {
    id: "rust:structural",
    name: "semantic",
    language: "rust",
    kind: "function",
    location: structuralLocation,
  },
  location: structuralLocation,
};

// covers: code-explorer/language-adapters :: Semantic results remain authoritative :: Structural candidate conflicts with a semantic definition
it("retains only the validated semantic relation when structural discovery conflicts", () => {
  const semanticRelation: SemanticRelation = {
    relation: "definition",
    relation_source: "semantic",
    external: false,
    backend_name: "rust-analyzer",
    backend_version: "1.0.0",
    symbol: semanticSymbol,
    location: semanticLocation,
  };

  assert.deepEqual(composeSemanticRelations([semanticRelation], [structuralCandidate]), {
    relations: [semanticRelation],
    discovery_only: [structuralCandidate],
  });
});

// covers: code-explorer/language-adapters :: Semantic results remain authoritative :: Reference resembles a function call
it("does not promote a reference-shaped structural candidate into a call relation", () => {
  const reference: SemanticRelation = {
    relation: "references",
    relation_source: "semantic",
    external: false,
    backend_name: "pyright-langserver",
    backend_version: "1.0.0",
    symbol: { ...semanticSymbol, language: "python", id: "python:reference" },
    location: semanticLocation,
  };

  const result = composeSemanticRelations([reference], [structuralCandidate]);

  assert.deepEqual(result.relations, [reference]);
  assert.equal(
    result.relations.some(({ relation }) => relation === "callers" || relation === "callees"),
    false,
  );
  assert.deepEqual(result.discovery_only, [structuralCandidate]);
});
