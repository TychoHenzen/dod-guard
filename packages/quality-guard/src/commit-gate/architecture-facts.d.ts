declare module "*architecture-facts.mjs" {
  export interface ExtractedArchitectureFacts {
    path: string;
    imports: string[];
    references: string[];
    types: Array<{
      name: string;
      members: Array<{
        name: string;
        kind: "method" | "field";
        visibility: "public" | "private" | "protected" | "internal";
      }>;
      dependencies: string[];
      forwardingPaths: Array<{ member: string; target: string }>;
    }>;
  }
  export function extractArchitectureFacts(file: { path: string; content: string }): {
    facts: ExtractedArchitectureFacts | null;
    errors: string[];
  };
  export function analyzeResponsibilityGrowth(before: unknown, after: unknown): unknown;
}
