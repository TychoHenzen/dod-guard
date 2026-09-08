import type { FindingClassification } from "./finding-classification.js";
import type { IgnoreSource } from "./ignore-source.js";
import type { WorkspaceFileKind } from "./workspace-file-kind.js";
export interface WorkspaceDebrisFinding {
    readonly classification: FindingClassification;
    readonly review: "possible workspace debris";
    readonly path: string;
    readonly kind: WorkspaceFileKind;
    readonly modifiedTimestampMs: number;
    readonly ageSource: "mtime";
    readonly ageUncertainty: string;
    readonly ignore?: {
        readonly source: IgnoreSource;
        readonly rule?: string;
    };
    readonly detectedReferenceEvidence: readonly string[];
    readonly analysisBoundary: string;
    readonly unobservedReferenceMechanisms: readonly string[];
}
