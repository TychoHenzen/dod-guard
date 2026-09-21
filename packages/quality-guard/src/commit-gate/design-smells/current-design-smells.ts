import type { ArchitectureFileFact } from "../architecture-file-fact.js";
import type { QualityConfig } from "../config.js";
import { analyzeDesignSmells } from "./design-smells.js";

export function analyzeCurrentDesignSmells(
  files: ArchitectureFileFact[],
  config: QualityConfig,
) {
  return analyzeDesignSmells({
    beforeFiles: [],
    afterFiles: files,
    affectedPaths: files.map((file) => file.path),
    config,
  });
}
