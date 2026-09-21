import type { ArchitectureFileFact } from "../../../src/commit-gate/architecture-file-fact.js";
import { parseQualityConfig } from "../../../src/commit-gate/config.js";

// test-sources: ./architecture-similarity-assessment.ts ./architecture-similarity-changes.ts ./architecture-similarity-clusters.ts ./architecture-similarity-outlier.ts ./architecture-similarity-signature.ts

export const config = parseQualityConfig("{}");

export function fact(
  index: number,
  domain: "billing" | "shipping",
): ArchitectureFileFact {
  const names =
    domain === "billing"
      ? {
          type: "BillingInvoiceHandler",
          member: "issueInvoice",
          dependency: "BillingLedger",
        }
      : {
          type: "ShippingManifestAdapter",
          member: "dispatchPackage",
          dependency: "ShippingCarrier",
        };
  return {
    path: `src/${domain}/${domain}-${index}.ts`,
    imports: [`./${names.dependency}`],
    references: [],
    types: [
      {
        name: `${names.type}${index}`,
        members: [{ name: names.member, kind: "method", visibility: "public" }],
        dependencies: [names.dependency],
        forwardingPaths: [],
      },
    ],
  };
}

export function inDirectory(
  file: ArchitectureFileFact,
  directory: string,
): ArchitectureFileFact {
  return { ...file, path: `${directory}/${file.path.split("/").at(-1)}` };
}
