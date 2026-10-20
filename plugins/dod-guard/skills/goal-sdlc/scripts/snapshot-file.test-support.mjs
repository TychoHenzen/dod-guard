import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Writes the snapshot into a private directory, hands the file path to one command, and removes the
// directory whether the command, its assertion, or the caller's code throws. The assertion message still
// carries the command's stderr, so a failure keeps its diagnostic after the directory is gone.
export async function withSnapshotFile(prefix, input, run) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  try {
    const file = join(directory, "snapshot.json");
    await writeFile(file, JSON.stringify(input));
    return await run(file, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
