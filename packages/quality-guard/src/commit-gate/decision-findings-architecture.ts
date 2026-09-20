import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import { analyzeSimilarity } from "./architecture-similarity.js";
import type { QualityConfig } from "./config.js";
import {
  dependencyFindings,
  designFindings,
  encapsulationFindings,
  placementFindings,
  similarityFindings,
} from "./decision-architecture-mappers.js";
import { analyzeDependencies } from "./dependency.js";
import { analyzeEncapsulation } from "./encapsulation.js";
import { analyzeDesignSmells } from "./design-smells.js";
import { analyzePlacement } from "./placement.js";
import type { DecisionResult } from "./types.js";

function typeFacts(files: ArchitectureFileFact[]) {
  return files.map((file) => ({
    path: file.path,
    types: file.types.map((type) => type.name),
  }));
}
type StructuralInput = {
  beforeFiles: ArchitectureFileFact[];
  afterFiles: ArchitectureFileFact[];
  affectedPaths: string[];
  config: QualityConfig;
};
function placementStructural(input: StructuralInput) {
  return placementFindings(
    analyzePlacement({
      beforeFiles: typeFacts(input.beforeFiles),
      afterFiles: typeFacts(input.afterFiles),
      affectedPaths: input.affectedPaths,
      config: input.config,
    }),
  );
}
function dependencyStructural(input: StructuralInput) {
  return dependencyFindings(
    analyzeDependencies({
      beforeFiles: input.beforeFiles,
      afterFiles: input.afterFiles,
      affectedPaths: input.affectedPaths,
      config: input.config,
    }),
  );
}
function encapsulationStructural(input: StructuralInput) {
  return encapsulationFindings(
    analyzeEncapsulation({
      beforeFiles: input.beforeFiles,
      afterFiles: input.afterFiles,
      affectedPaths: input.affectedPaths,
      config: input.config,
    }),
  );
}
function similarityStructural(input: StructuralInput) {
  return similarityFindings(
    analyzeSimilarity({
      beforeFiles: input.beforeFiles,
      afterFiles: input.afterFiles,
      affectedPaths: input.affectedPaths,
      config: input.config,
    }),
  );
}
function designStructural(input: StructuralInput) {
  return designFindings(analyzeDesignSmells(input));
}
export function structuralFindings(
  input: StructuralInput,
): DecisionResult["findings"] {
  return [
    ...placementStructural(input),
    ...similarityStructural(input),
    ...dependencyStructural(input),
    ...encapsulationStructural(input),
    ...designStructural(input),
  ];
}
