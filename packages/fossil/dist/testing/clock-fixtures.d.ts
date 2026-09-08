import type { DeterministicClock } from "./types/deterministic-clock.js";
/** Provides a mutable copy-on-read clock for deterministic tests. */
export declare function createDeterministicClock(initialTime: Date | number): DeterministicClock;
