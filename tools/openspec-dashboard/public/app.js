// app.js - state and wiring. The views live in the render-*.mjs modules.

import * as api from "./api.mjs";
import { el, replace } from "./dom.mjs";
import { renderChange } from "./render-change.mjs";
import { renderScan } from "./render-scan.mjs";
import { renderSpec } from "./render-spec.mjs";
import { renderLists, renderTabs } from "./sidebar.mjs";

const dom = {
  tabs: document.getElementById("tabs"),
  lists: document.getElementById("lists"),
  detail: document.getElementById("detail"),
  filter: document.getElementById("filter"),
  refresh: document.getElementById("refresh"),
};

const state = { projects: [], active: 0, overview: null, selection: null, filter: "", scan: null, foldState: new Map() };

const problem = (err) => el("p", { class: "error" }, err.message);
const notice = (text) => el("p", { class: "empty" }, text);

function paintTabs() {
  replace(dom.tabs, ...renderTabs(state.projects, state.active, { onSelect: openProject, onScan: openScan }));
}

function paintLists() {
  if (!state.overview) return replace(dom.lists);
  const options = { filter: state.filter, selection: state.selection, onOpen: openItem, foldState: state.foldState };
  replace(dom.lists, ...renderLists(state.overview, options));
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
  state.overview = null;
  paintTabs();
  paintLists();
  try {
    state.overview = await api.getOverview(index, refresh);
    replace(dom.detail, notice("Pick a change or a spec."));
  } catch (err) {
    replace(dom.detail, problem(err));
  }
  paintLists();
}

function openItem(kind, id) {
  state.selection = { kind, id };
  paintLists();
  const project = state.active;
  if (kind === "spec") return show(async () => renderSpec(await api.getSpec(project, id)));
  const summary = state.overview.changes.find((change) => change.name === id);
  return show(async () => renderChange(await api.getChange(project, id), { ...summary, name: id }));
}

async function reloadProjects(keepActive = true) {
  state.projects = await api.listProjects();
  const index = keepActive ? Math.min(state.active, state.projects.length - 1) : state.projects.length - 1;
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

reloadProjects().catch((err) => replace(dom.detail, problem(err)));
