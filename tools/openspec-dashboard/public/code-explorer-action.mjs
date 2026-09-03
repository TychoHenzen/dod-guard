// code-explorer-action.mjs - selected-project launch affordance and browser handoff state.

const FAILURE_CODES = new Set([
  "invalid_launch_request",
  "invalid_dashboard_capability",
  "launch_request_limit",
  "stale_project_registry",
  "project_not_registered",
  "project_unavailable",
  "code_explorer_unavailable",
  "invalid_code_explorer_url",
  "code_explorer_start_failed",
  "code_explorer_start_timeout",
  "code_explorer_output_limit",
  "code_explorer_capacity",
  "dashboard_shutting_down",
]);

export function selectedCodeExplorerAction({ projects, registry_revision, registryRevision, active }) {
  const project = projects?.[active];
  return {
    disabled: !project?.readable,
    index: project?.readable ? active : null,
    registryRevision: registry_revision ?? registryRevision ?? null,
  };
}

/** Keep the visible action bound to one selected registry snapshot. */
export function createCodeExplorerAction({
  request,
  reload = async () => null,
  render = () => {},
  windowPort = null,
  createToken = null,
}) {
  let registry = { projects: [], registry_revision: null, active: 0 };
  const states = new Map();
  let nextToken = 0;

  function token() {
    if (createToken) return createToken();
    nextToken += 1;
    return `launch-${nextToken}`;
  }

  function keyFor(snapshot) {
    return `${snapshot.registryRevision}:${snapshot.index}`;
  }

  function currentSnapshot() {
    const action = selectedCodeExplorerAction(registry);
    return action.disabled ? null : { index: action.index, registryRevision: action.registryRevision };
  }

  function currentState() {
    const snapshot = currentSnapshot();
    if (!snapshot) return { state: "idle" };
    return states.get(keyFor(snapshot)) ?? { state: "idle" };
  }

  function renderState() {
    const state = currentState();
    return { ...selectedCodeExplorerAction(registry), state: state.state, ...(state.code ? { code: state.code } : {}) };
  }

  function paint() {
    render(renderState());
  }

  function setRegistry(next) {
    registry = next;
    paint();
  }

  function fail(snapshot, launchToken, placeholder, code) {
    const key = keyFor(snapshot);
    const current = states.get(key);
    if (!current || current.token !== launchToken) return;
    placeholder?.close?.();
    states.set(key, { state: "failed", code });
    paint();
  }

  function responseCode(error) {
    const code = error?.message;
    return FAILURE_CODES.has(code) ? code : "code_explorer_start_failed";
  }

  async function launch() {
    const snapshot = currentSnapshot();
    if (!snapshot) return null;
    const key = keyFor(snapshot);
    if (states.get(key)?.state === "starting") return null;
    const placeholder = windowPort?.openBlank?.() ?? null;
    if (!placeholder) {
      states.set(key, { state: "failed", code: "browser_tab_blocked" });
      paint();
      return null;
    }
    const launchToken = token();
    states.set(key, { state: "starting", token: launchToken, snapshot, placeholder });
    paint();
    let result;
    try {
      result = await request(snapshot);
    } catch (error) {
      fail(snapshot, launchToken, placeholder, responseCode(error));
      return null;
    }
    if (result?.code === "stale_project_registry") {
      fail(snapshot, launchToken, placeholder, result.code);
      const fresh = await reload();
      if (fresh) setRegistry(fresh);
      return result;
    }
    if (result?.code) {
      fail(snapshot, launchToken, placeholder, result.code);
      return result;
    }
    const current = states.get(key);
    if (!current || current.token !== launchToken) return result;
    if (placeholder.closed) {
      fail(snapshot, launchToken, placeholder, "browser_tab_closed");
      return result;
    }
    if (typeof result?.url !== "string") {
      fail(snapshot, launchToken, placeholder, "code_explorer_start_failed");
      return result;
    }
    placeholder.location.replace(result.url);
    states.set(key, { state: "open" });
    paint();
    return result;
  }

  return { launch, renderState, setRegistry };
}
