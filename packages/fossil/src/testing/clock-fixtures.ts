import type { DeterministicClock } from "./types/deterministic-clock.js";

/** Provides a mutable copy-on-read clock for deterministic tests. */
export function createDeterministicClock(
  initialTime: Date | number,
): DeterministicClock {
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
