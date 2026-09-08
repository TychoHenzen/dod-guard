import type {
  PerformanceFixtureSpec,
} from "./performance-types/performance-fixture-spec.js";

export const TARGET_PERFORMANCE_COMMIT_COUNT = 5_000;
export const TARGET_PERFORMANCE_FILE_COUNT = 1_000;
export const MAXIMUM_PERFORMANCE_DURATION_MS = 10_000;

export const TARGET_PERFORMANCE_FIXTURE: PerformanceFixtureSpec = {
  commitCount: TARGET_PERFORMANCE_COMMIT_COUNT,
  fileCount: TARGET_PERFORMANCE_FILE_COUNT,
};
