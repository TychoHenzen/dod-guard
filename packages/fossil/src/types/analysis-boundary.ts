export interface AnalysisBoundary {
  readonly repositoryRoot: string;
  readonly canonicalRepositoryRoot: string;
  readonly unobservedMechanisms: readonly string[];
}
