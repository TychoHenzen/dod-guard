import type { AnalysisBoundary } from "./analysis-boundary.js";
import type { AnalysisWarning } from "./analysis-warning.js";
import type { BurstReport } from "./burst-report.js";
import type { Completeness } from "./completeness.js";
import type { NormalizedAnalysisOptions } from "./normalized-analysis-options.js";
import type { ReportStatistics } from "./report-statistics.js";
import type { ResourceLimits } from "./resource-limits.js";
import type { ResourceUsage } from "./resource-usage.js";
import type { WorkspaceDebrisFinding } from "./workspace-debris-finding.js";
import { REPORT_SCHEMA_VERSION } from "../types.js";
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
