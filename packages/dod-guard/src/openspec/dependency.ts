// This file contains only type definitions - types are inert at runtime.

/** One entry in `instructions --json`'s `dependencies` array. */
export interface OpenSpecDependency {
  id: string;
  done: boolean;
  /** Glob relative to `changeDir`, e.g. "specs/**\/*.md". */
  path: string;
  description: string;
}
