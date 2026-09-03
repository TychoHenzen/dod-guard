// app.js - state and wiring. The views live in the render-*.mjs modules.

import * as api from "./api.mjs";
import { takeDashboardCapability } from "./capability.mjs";
import { createCodeExplorerAction } from "./code-explorer-action.mjs";
import { el, replace } from "./dom.mjs";
import { renderScan } from "./render-scan.mjs";
import { renderQuality } from "./render-quality.mjs";
import { renderTabs } from "./sidebar.mjs";

const dom = {
  tabs: document.getElementById("tabs"),
  lists: document.getElementById("lists"),
  detail: document.getElementById("detail"),
  filter: document.getElementById("filter"),
  refresh: document.getElementById("refresh"),
  codeExplorer: document.getElementById("code-explorer"),
  codeExplorerStatus: document.getElementById("code-explorer-status"),
};

const state = {
  projects: [],
  registryRevision: null,
  active: 0,
  report: null,
  selection: null,
  filter: "",
  scan: null,
  foldState: new Map(),
};

const problem = (err) => el("p", { class: "error" }, err.message);
const notice = (text) => el("p", { class: "empty" }, text);

api.setDashboardCapability(takeDashboardCapability());

const codeExplorerAction = createCodeExplorerAction({
  request: api.launchCodeExplorer,
  windowPort: { openBlank: () => window.open("about:blank", "_blank") },
  reload: async () => {
    await reloadProjects();
    return { projects: state.projects, registryRevision: state.registryRevision, active: state.active };
  },
  render: ({ disabled, state, code }) => {
    dom.codeExplorer.disabled = disabled || state === "starting";
    dom.codeExplorerStatus.textContent = code ?? (state === "starting" ? "starting" : "");
  },
});

function syncCodeExplorerAction() {
  codeExplorerAction.setRegistry({ projects: state.projects, registryRevision: state.registryRevision, active: state.active });
}

function paintTabs() {
  replace(dom.tabs, ...renderTabs(state.projects, state.active, { onSelect: openProject, onScan: openScan }));
}

function paintLists() {
  replace(dom.lists);
  if (state.report) replace(dom.detail, renderQuality(state.report, state.filter));
}

async function show(build) {
  replace(dom.detail, notice("Loading..."));
  try {
    replace(dom.detail, await build());
  } catch (err) {
    replace(dom.detail, problem(err));
  }
}

async function openProject(index, refresh = false) {
  state.active = index;
  state.selection = null;
  state.report = null;
  syncCodeExplorerAction();
  paintTabs();
  paintLists();
  try {
    state.report = await api.getQuality(index);
  } catch (err) {
    replace(dom.detail, problem(err));
  }
  paintLists();
}

async function reloadProjects(keepActive = true) {
  const registry = await api.listProjects();
  state.projects = registry.projects;
  state.registryRevision = registry.registry_revision;
  const index = keepActive ? Math.min(state.active, state.projects.length - 1) : state.projects.length - 1;
  syncCodeExplorerAction();
  paintTabs();
  if (state.projects.length) await openProject(Math.max(index, 0));
  else replace(dom.detail, notice("No project registered yet. Use + to find one."));
}

function openScan() {
  state.scan = null;
  show(async () => {
    const found = await api.scanForProjects();
    return renderScan(found, {
      projects: state.projects,
      onAdd: async (paths) => {
        if (paths.length) await api.addProjects(paths);
        await reloadProjects(false);
      },
      onRescan: openScan,
      onRemove: async (path) => {
        await api.removeProject(path);
        await reloadProjects();
      },
    });
  });
}

let filterTimer;
dom.filter.addEventListener("input", (event) => {
  state.filter = event.target.value;
  clearTimeout(filterTimer);
  filterTimer = setTimeout(paintLists, 150);
});
dom.refresh.addEventListener("click", () => openProject(state.active, true));
dom.codeExplorer.addEventListener("click", () => void codeExplorerAction.launch());

reloadProjects().catch((err) => replace(dom.detail, problem(err)));
