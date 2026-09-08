export interface PerformanceFixture {
  readonly root: string;
  readonly commitCount: number;
  readonly fileCount: number;
  cleanup(): Promise<void>;
}
