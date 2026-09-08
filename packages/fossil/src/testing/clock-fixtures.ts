import type { DeterministicClock } from "./types/deterministic-clock.js";

/** Provides one mutable, copy-on-read clock for deterministic history and age tests. */
export function createDeterministicClock(initialTime: Date | number): DeterministicClock {
  let currentTime = new Date(initialTime).getTime();
  return {
    now: () => new Date(currentTime),
    set: (time) => {
      currentTime = new Date(time).getTime();
    },
    advance: (milliseconds) => {
      currentTime += milliseconds;
    },
  };
}
