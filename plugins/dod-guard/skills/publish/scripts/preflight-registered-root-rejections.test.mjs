import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { assertRejected, MANIFEST_DIRECTORY } from "./harness/preflight-fixture.mjs";
import {
  createReleaseFixture,
  createRoot,
  identityCases,
  RELEASED_VERSION,
  registeredRegistry,
  runRegistered,
} from "./harness/registered-root-fixture.mjs";

test("post-release mode fails closed on an unreadable publish skill", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createReleaseFixture(t, client);
    const skill = join(fixture.registeredRoot, "skills/publish/SKILL.md");
    await rm(skill);
    await mkdir(skill);

    const result = runRegistered(fixture, registeredRegistry(client, fixture.registeredRoot));
    assertRejected(result, /publish skill is not a readable regular file/, client);
  }
});

test("post-release mode rejects a manifest that resolves outside the registered root", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createReleaseFixture(t, client);
    const external = await createRoot(fixture.parent, "external", { client, version: RELEASED_VERSION });
    const directory = join(fixture.registeredRoot, MANIFEST_DIRECTORY[client]);
    await rm(directory, { recursive: true });
    await symlink(join(external, MANIFEST_DIRECTORY[client]), directory, "junction");

    const result = runRegistered(fixture, registeredRegistry(client, fixture.registeredRoot));
    assertRejected(result, /manifest path resolves outside the registered plugin root/, client);
  }
});

test("post-release mode keeps the registration and identity checks", async (t) => {
  for (const client of ["codex", "claude"]) {
    const fixture = await createReleaseFixture(t, client);
    for (const [label, registry, reason] of identityCases(fixture)) {
      assertRejected(runRegistered(fixture, registry), reason, `${client} ${label}`);
    }
  }
});

test("the registered-root option cannot be repeated", async (t) => {
  const fixture = await createReleaseFixture(t, "claude");
  const result = runRegistered(fixture, registeredRegistry("claude", fixture.registeredRoot), [
    "--registered-root",
    "--registered-root",
  ]);
  assertRejected(result, /Invalid or duplicate argument: --registered-root/, "duplicate");
});
