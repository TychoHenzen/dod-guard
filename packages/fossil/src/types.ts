/** Stable data contract shared by fossil's analysis and presentation layers. */

export const REPORT_SCHEMA_VERSION = 1 as const;

export type OutputFormat = "table" | "json";
export type FindingClassification = "advisory";
export type ScoreBasis = "full" | "git-only";
export type ReferenceAvailability = "complete" | "unavailable";
export type ReferenceStrength = "strong" | "weak" | "vestigial";
export type ReferenceResolution = "resolved" | "unresolved" | "external";
export type SourceLanguage = "typescript" | "javascript" | "csharp" | "rust" | "unsupported";
export type ReferenceKind = "import" | "require" | "dynamic-import" | "csharp-using" | "rust-mod" | "rust-use";
export type WorkspaceFileKind = "untracked" | "ignored";
export type IgnoreSource = "repository" | "local-exclude" | "global-exclude" | "unknown";

export interface AnalysisOptions {
  readonly days?: number;
  readonly gapHours?: number;
  readonly threshold?: number;
  readonly format?: OutputFormat;
  readonly extensions?: readonly string[];
  readonly untrackedAgeDays?: number;
  readonly exclude?: readonly string[];
  readonly verbose?: boolean;
}

export interface NormalizedAnalysisOptions {
  readonly days: number;
  readonly gapHours: number;
  readonly threshold: number;
  readonly format: OutputFormat;
  readonly extensions: readonly string[];
  readonly untrackedAgeDays: number;
  readonly exclude: readonly string[];
  readonly verbose: boolean;
}

export interface SourceSpan {
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly column: number;
}

export interface GitFileChange {
  readonly status: "added" | "modified" | "deleted" | "renamed" | "copied" | "type-changed" | "unmerged" | "unknown";
  readonly path: string;
  readonly previousPath?: string;
}

export interface GitCommit {
  readonly hash: string;
  readonly committerTimestampMs: number;
  readonly changes: readonly GitFileChange[];
}

export interface LogicalFileActivity {
  readonly identity: string;
  readonly currentPath?: string;
  readonly paths: readonly string[];
  readonly firstCommitTimestampMs: number;
  readonly lastCommitTimestampMs: number;
  readonly commitCount: number;
  readonly created: boolean;
  readonly deleted: boolean;
  readonly existsAtHead: boolean;
}

export interface BurstFileActivity {
  readonly identity: string;
  readonly path: string;
  readonly burstCommits: number;
  readonly postBurstCommits: number;
  readonly createdInBurst: boolean;
  readonly existsAtHead: boolean;
}

export interface Burst {
  readonly id: string;
  readonly startTimestampMs: number;
  readonly endTimestampMs: number;
  readonly commits: readonly GitCommit[];
  readonly files: readonly BurstFileActivity[];
  readonly closed: boolean;
}

export interface BurstAnalysis {
  readonly commits: readonly GitCommit[];
  readonly logicalFiles: readonly LogicalFileActivity[];
  readonly bursts: readonly Burst[];
  readonly deletedPaths: readonly string[];
  readonly historyComplete: boolean;
}

export interface ParsedReference {
  readonly sourcePath: string;
  readonly targetCandidates: readonly string[];
  readonly span: SourceSpan;
  readonly language: SourceLanguage;
  readonly kind: ReferenceKind;
  readonly resolution: ReferenceResolution;
  readonly strength: Exclude<ReferenceStrength, "vestigial">;
  readonly targetPath?: string;
}

export interface ReferenceEdge {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly language: SourceLanguage;
  readonly kind: ReferenceKind;
  readonly strength: ReferenceStrength;
  readonly span: SourceSpan;
}

export interface UnresolvedReference {
  readonly sourcePath: string;
  readonly targetCandidates: readonly string[];
  readonly language: SourceLanguage;
  readonly kind: ReferenceKind;
  readonly span: SourceSpan;
  readonly resolution: Exclude<ReferenceResolution, "resolved">;
}

export interface ReferenceGraph {
  readonly edges: readonly ReferenceEdge[];
  readonly unresolved: readonly UnresolvedReference[];
  readonly complete: boolean;
  readonly unavailablePaths: readonly string[];
}

export interface FossilSubscores {
  readonly churn: number;
  readonly abandonment: number;
  readonly referenceWeakness?: number;
  readonly clusterIsolation?: number;
}

export interface FossilFinding {
  readonly classification: FindingClassification;
  readonly burstId: string;
  readonly path: string;
  readonly activity: BurstFileActivity;
  readonly score: number;
  readonly scoreBasis: ScoreBasis;
  readonly subscores: FossilSubscores;
  readonly referenceAvailability: ReferenceAvailability;
  readonly strongInboundReferences: number;
  readonly candidateNeighbors: readonly string[];
  readonly liveNeighbors: readonly string[];
}

export interface BurstReport {
  readonly id: string;
  readonly startTimestampMs: number;
  readonly endTimestampMs: number;
  readonly commitCount: number;
  readonly fileCount: number;
  readonly survivors: readonly BurstFileActivity[];
  readonly findings: readonly FossilFinding[];
  readonly deletedPaths: readonly string[];
}

export interface AnalysisWarning {
  readonly code:
    | "empty_repository"
    | "future_commit"
    | "shallow_history"
    | "sparse_checkout"
    | "submodule_omitted"
    | "reference_unreadable"
    | "reference_outside_boundary"
    | "reference_path_changed"
    | "reference_content_limit"
    | "reference_binary"
    | "workspace_unreadable"
    | "workspace_omitted"
    | "incomplete_reference";
  readonly message: string;
  readonly path?: string;
}

export interface ResourceLimits {
  readonly maximumCommits: number;
  readonly maximumFileStatusRecords: number;
  readonly maximumInventoriedFiles: number;
  readonly maximumGitStdoutBytes: number;
  readonly maximumGitStderrBytes: number;
  readonly maximumReferenceFileBytes: number;
  readonly maximumReferenceTotalBytes: number;
}

export interface ResourceUsage {
  readonly commitRecords: number;
  readonly fileStatusRecords: number;
  readonly inventoriedFiles: number;
  readonly gitStdoutBytes: number;
  readonly gitStderrBytes: number;
  readonly referenceBytes: number;
  readonly omittedReferencePaths: number;
}

export interface AnalysisBoundary {
  readonly repositoryRoot: string;
  readonly canonicalRepositoryRoot: string;
  readonly unobservedMechanisms: readonly string[];
}

export interface Completeness {
  readonly historyComplete: boolean;
  readonly referenceAnalysisComplete: boolean;
  readonly workspaceDebrisComplete: boolean;
}

export interface WorkspaceDebrisFinding {
  readonly classification: FindingClassification;
  readonly review: "possible workspace debris";
  readonly path: string;
  readonly kind: WorkspaceFileKind;
  readonly modifiedTimestampMs: number;
  readonly ageSource: "mtime";
  readonly ageUncertainty: string;
  readonly ignore?: { readonly source: IgnoreSource; readonly rule?: string };
  readonly detectedReferenceEvidence: readonly string[];
  readonly analysisBoundary: string;
  readonly unobservedReferenceMechanisms: readonly string[];
}

export interface ReportStatistics {
  readonly includedCommitCount: number;
  readonly logicalFileCount: number;
  readonly burstCount: number;
  readonly candidateFindingCount: number;
  readonly uniqueCandidatePathCount: number;
  readonly workspaceDebrisCount: number;
}

export interface FossilReport {
  readonly schemaVersion: typeof REPORT_SCHEMA_VERSION;
  readonly options: NormalizedAnalysisOptions;
  readonly analysisTimestampMs: number;
  readonly gitVersion: string;
  readonly boundary: AnalysisBoundary;
  readonly limits: ResourceLimits;
  readonly usage: ResourceUsage;
  readonly completeness: Completeness;
  readonly statistics: ReportStatistics;
  readonly warnings: readonly AnalysisWarning[];
  readonly bursts: readonly BurstReport[];
  readonly workspaceDebris: readonly WorkspaceDebrisFinding[];
}

export type AnalysisErrorCode =
  | "invalid_options"
  | "not_repository"
  | "git_capability"
  | "git_failure"
  | "containment_failure"
  | "resource_limit";

export interface AnalysisErrorDetails {
  readonly code: AnalysisErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type AnalyzeRepositoryResult = FossilReport;
