import type { ArchitectureFileFact } from "./architecture-file-fact.js";
import type { QualityConfig } from "./config.js";
import {
  isProductionArchitecturePath,
  normalizeArchitecturePath,
} from "./placement.js";

export function observedCallers(
  symbol: string,
  files: ArchitectureFileFact[],
  config: QualityConfig,
): { productionCallers: string[]; testCallers: string[] } {
  const productionCallers: string[] = [];
  const testCallers: string[] = [];
  for (const file of files) {
    const filePath = normalizeArchitecturePath(file.path);
    if (
      !file.references.some(
        (reference) => reference === symbol || reference.endsWith(`.${symbol}`),
      )
    )
      continue;
    if (isProductionArchitecturePath(filePath, config))
      productionCallers.push(filePath);
    else testCallers.push(filePath);
  }
  return {
    productionCallers: [...new Set(productionCallers)].sort(),
    testCallers: [...new Set(testCallers)].sort(),
  };
}
