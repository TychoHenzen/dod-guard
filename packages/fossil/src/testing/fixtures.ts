import { afterEach } from "node:test";

import {
  createTemporaryRepository,
  writeSourceTree,
} from "./repository-fixtures.js";

import type { TemporaryRepository } from "./types/index.js";

const repositories: TemporaryRepository[] = [];

afterEach(async () => {
  await Promise.all(
    repositories.splice(0).map((repository) => repository.cleanup()),
  );
});

export type {
  DeterministicClock,
  OutputCapture,
  RecordedCommit,
  TemporaryRepository,
} from "./types/index.js";
export { createDeterministicClock } from "./clock-fixtures.js";
export { createOutputCapture } from "./output-fixtures.js";

export async function temporaryRepository(): Promise<TemporaryRepository> {
  const repository = await createTemporaryRepository();
  repositories.push(repository);
  return repository;
}

export { createTemporaryRepository, writeSourceTree };
