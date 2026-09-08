export interface DeterministicClock {
  now(): Date;
  set(time: Date | number): void;
  advance(milliseconds: number): void;
}
