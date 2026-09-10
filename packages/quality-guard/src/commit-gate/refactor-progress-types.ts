export interface RefactorProgress {
  ownershipMoves: Array<{ operation: string; from: string; to: string }>;
  indicators: {
    ownership: {
      status: "improved" | "regressed" | "unchanged";
      before: number;
      after: number;
      details: string[];
    };
    dependencyEdges: {
      status: "improved" | "regressed" | "unchanged";
      before: number;
      after: number;
      details: string[];
    };
    placement: {
      status: "improved" | "regressed" | "unchanged";
      before: number;
      after: number;
      details: string[];
    };
    publicSurface: {
      status: "improved" | "regressed" | "unchanged";
      before: number;
      after: number;
      details: string[];
    };
    compatibilityPaths: {
      status: "improved" | "regressed" | "unchanged";
      before: number;
      after: number;
      details: string[];
    };
  };
  hasArchitecturalProgress: boolean;
}
