export interface PerformanceBenchmarkDependencies {
    readonly runFreshJsonAnalysis: (repositoryPath: string) => Promise<void>;
    readonly now?: () => number;
}
