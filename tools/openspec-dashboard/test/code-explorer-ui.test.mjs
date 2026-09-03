import assert from "node:assert/strict";
import test from "node:test";
import { createCodeExplorerAction, selectedCodeExplorerAction } from "../public/code-explorer-action.mjs";

const registry = {
  registry_revision: "a".repeat(64),
  projects: [
    { id: 0, name: "readable", readable: true },
    { id: 1, name: "missing", readable: false },
  ],
};

// covers: openspec-dashboard/ui :: The selected readable project offers Code Explorer :: Readable project is selected
test("enables Code Explorer for the selected readable registry entry", () => {
  assert.deepEqual(selectedCodeExplorerAction({ ...registry, active: 0 }), {
    disabled: false,
    index: 0,
    registryRevision: "a".repeat(64),
  });
});

// covers: openspec-dashboard/ui :: The selected readable project offers Code Explorer :: Missing project is selected
test("disables Code Explorer for a selected missing entry without requesting launch", async () => {
  let requests = 0;
  const controller = createCodeExplorerAction({ request: async () => { requests += 1; } });
  controller.setRegistry({ ...registry, active: 1 });
  assert.equal(controller.renderState().disabled, true);
  await controller.launch();
  assert.equal(requests, 0);
});

// covers: openspec-dashboard/ui :: The selected readable project offers Code Explorer :: User switches project tabs
test("captures the current selected index and revision when clicked", async () => {
  let request;
  const controller = createCodeExplorerAction({ request: async (snapshot) => { request = snapshot; } });
  controller.setRegistry({ ...registry, active: 0 });
  controller.setRegistry({ ...registry, projects: [...registry.projects.slice(0, 1), { id: 1, name: "other", readable: true }], active: 1 });
  await controller.launch();
  assert.deepEqual(request, { index: 1, registryRevision: "a".repeat(64) });
});

// covers: openspec-dashboard/ui :: The selected readable project offers Code Explorer :: Registry becomes stale
test("closes the unused placeholder and renders fresh idle state after a stale response", async () => {
  let closed = 0;
  const rendered = [];
  const fresh = { registry_revision: "b".repeat(64), projects: [{ id: 0, name: "fresh", readable: true }], active: 0 };
  const controller = createCodeExplorerAction({
    request: async () => ({ code: "stale_project_registry" }),
    reload: async () => fresh,
    render: (next) => rendered.push(next),
  });
  controller.setRegistry({ ...registry, active: 0 });
  await controller.launch({ close: () => { closed += 1; } });
  assert.equal(closed, 1);
  assert.deepEqual(controller.renderState(), { disabled: false, index: 0, registryRevision: "b".repeat(64), state: "idle" });
  assert.deepEqual(rendered.at(-1), controller.renderState());
});

// covers: openspec-dashboard/ui :: The selected readable project offers Code Explorer :: No project is registered
test("disables Code Explorer when no project is registered", () => {
  assert.deepEqual(selectedCodeExplorerAction({ projects: [], registry_revision: "a".repeat(64), active: 0 }), {
    disabled: true,
    index: null,
    registryRevision: "a".repeat(64),
  });
});
