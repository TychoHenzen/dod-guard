import type { DeterministicClock } from "./types/deterministic-clock.js";
/** Provides one mutable, copy-on-read clock for deterministic history and age tests. */
export declare function createDeterministicClock(initialTime: Date | number): DeterministicClock;
