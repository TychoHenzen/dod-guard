// code-explorer-action.mjs - selected-project launch affordance, before browser handoff state exists.

export function selectedCodeExplorerAction({ projects, registry_revision, registryRevision, active }) {
  const project = projects?.[active];
  return {
    disabled: !project?.readable,
    index: project?.readable ? active : null,
    registryRevision: registry_revision ?? registryRevision ?? null,
  };
}

/** Keep the visible action bound to one selected registry snapshot. */
export function createCodeExplorerAction({ request, reload = async () => null, render = () => {} }) {
  let registry = { projects: [], registry_revision: null, active: 0 };
  let state = "idle";

  function renderState() {
    return { ...selectedCodeExplorerAction(registry), state };
  }

  function paint() {
    render(renderState());
  }

  function setRegistry(next) {
    registry = next;
    state = "idle";
    paint();
  }

  async function launch(placeholder) {
    const action = selectedCodeExplorerAction(registry);
    if (action.disabled) return null;
    const snapshot = { index: action.index, registryRevision: action.registryRevision };
    const result = await request(snapshot);
    if (result?.code === "stale_project_registry") {
      placeholder?.close?.();
      const fresh = await reload();
      if (fresh) setRegistry(fresh);
    }
    return result;
  }

  return { launch, renderState, setRegistry };
}
