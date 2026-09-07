import assert from "node:assert/strict";

export function assertReferenceCandidates(
  candidates: Array<{
    path: string;
    handle: string;
    view_id: string;
    external: boolean;
  }>,
) {
  assert.deepEqual(
    candidates.map(({ path }) => path),
    ["src/references.rs"],
  );
  assert.ok(
    candidates.every(
      ({ handle, view_id, external }) =>
        typeof handle === "string" &&
        typeof view_id === "string" &&
        external === false,
    ),
  );
}
