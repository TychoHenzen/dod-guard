import type { PerformanceFixture } from "./performance-types/performance-fixture.js";
import type { PerformanceFixtureSpec } from "./performance-types/performance-fixture-spec.js";
/** Builds deterministic fast-import input with later source updates. */
export declare function fastImportStream({ commitCount, fileCount, }: PerformanceFixtureSpec): string;
/** Creates the target-size repository through Git fast-import. */
export declare function createPerformanceFixture(spec?: PerformanceFixtureSpec): Promise<PerformanceFixture>;
