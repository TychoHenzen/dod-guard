import assert from "node:assert/strict";
import test from "node:test";
import { createAdmin } from "../lib/project-admin.mjs";

function storeFor(projects) {
  return { get: () => ({ projects }) };
}

function launchSnapshot(projects, readablePaths = new Set(projects.map((project) => project.path))) {
  const admin = createAdmin(storeFor(projects), { isProject: (path) => readablePaths.has(path) });
  return { admin, snapshot: admin.listProjects() };
}

// covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Registered readable project is selected
test("selects only the current registered canonical project path", () => {
  const { admin, snapshot } = launchSnapshot([{ name: "one", path: "C:/projects/one" }]);
  assert.deepEqual(admin.selectLaunch(0, { registry_revision: snapshot.registry_revision }), {
    name: "one",
    path: "C:/projects/one",
  });
});

// covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Registry changed after rendering
test("rejects inserted, removed, and reordered registry snapshots before index selection", () => {
  const projects = [
    { name: "one", path: "C:/projects/one" },
    { name: "two", path: "C:/projects/two" },
  ];
  const admin = createAdmin(storeFor(projects), { isProject: () => true });
  const revision = admin.listProjects().registry_revision;
  for (const changed of [
    [{ name: "new", path: "C:/projects/new" }, ...projects],
    [projects[0]],
    [...projects].reverse(),
  ]) {
    const changedAdmin = createAdmin(storeFor(changed), { isProject: () => true });
    assert.throws(
      () => changedAdmin.selectLaunch(0, { registry_revision: revision }),
      (error) => error.message === "stale_project_registry",
    );
  }
});

// covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Browser includes a project path
test("rejects path-like and unknown request fields before selecting a registry entry", () => {
  const { admin, snapshot } = launchSnapshot([{ name: "one", path: "C:/projects/one" }]);
  for (const body of [
    { registry_revision: snapshot.registry_revision, path: "C:/elsewhere" },
    { registry_revision: snapshot.registry_revision, root: "C:/elsewhere" },
    { registry_revision: snapshot.registry_revision, command: "node" },
    { registry_revision: snapshot.registry_revision, unexpected: true },
  ]) {
    assert.throws(() => admin.selectLaunch(0, body), (error) => error.message === "invalid_launch_request");
  }
});

// covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Registry index does not exist
test("rejects a missing index from a matching registry snapshot", () => {
  const { admin, snapshot } = launchSnapshot([{ name: "one", path: "C:/projects/one" }]);
  assert.throws(
    () => admin.selectLaunch(1, { registry_revision: snapshot.registry_revision }),
    (error) => error.message === "project_not_registered",
  );
});

// covers: openspec-dashboard/code-explorer-launch :: Launch authority is a capability-bound registry snapshot :: Registered project is no longer readable
test("rejects an unreadable matching registry entry", () => {
  const projects = [{ name: "one", path: "C:/projects/one" }];
  const { admin, snapshot } = launchSnapshot(projects, new Set());
  assert.throws(
    () => admin.selectLaunch(0, { registry_revision: snapshot.registry_revision }),
    (error) => error.message === "project_unavailable",
  );
});
