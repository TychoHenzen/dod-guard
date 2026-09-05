import { browserRequest } from "./browser-request.js";
import type { BrowserStorage } from "./session.js";

export type FocusAction = (symbolId: string) => Promise<void>;

const latestRelationRequests = new WeakMap<HTMLElement, object>();

function resetRelationPane(pane: HTMLElement): void {
  latestRelationRequests.set(pane, {});
  pane.dataset.state = "empty";
  const empty = Object.assign(document.createElement("p"), { textContent: "No relations loaded" });
  empty.dataset.state = "empty-relations";
  pane.replaceChildren(Object.assign(document.createElement("h2"), { textContent: "Relations" }), empty);
}

export function resetSourceRelations(): void {
  const pane = document.querySelector<HTMLElement>('[data-pane="relations"]');
  if (pane) resetRelationPane(pane);
}

function relationCandidates(reply: Record<string, unknown>): unknown[] {
  const data = Object(reply.data) as Record<string, unknown>;
  if (Array.isArray(data.candidates)) return data.candidates;
  return data.focus ? [data.focus] : [];
}

function appendCandidates(pane: HTMLElement, values: unknown[], focus: FocusAction): void {
  for (const value of values) {
    if (!value || typeof value !== "object") continue;
    const candidate = value as Record<string, unknown>;
    const label = String(candidate.display_name ?? candidate.name ?? candidate.symbol_id ?? "relation");
    if (typeof candidate.symbol_id !== "string") {
      pane.append(Object.assign(document.createElement("p"), { textContent: label }));
      continue;
    }
    const target = Object.assign(document.createElement("button"), { type: "button", textContent: label });
    target.addEventListener("click", () => void focus(candidate.symbol_id as string));
    pane.append(target);
  }
}

async function followRelation(
  pane: HTMLElement,
  storage: BrowserStorage,
  focus: FocusAction,
  input: { handle: string; viewId: string; relation: string },
): Promise<void> {
  const request = {};
  latestRelationRequests.set(pane, request);
  pane.dataset.state = "loading";
  try {
    const reply = await browserRequest(storage, "api/follow", {
      request_id: crypto.randomUUID(),
      view_id: input.viewId,
      handle: input.handle,
      relation: input.relation,
      limit: 50,
    });
    if (latestRelationRequests.get(pane) !== request) return;
    pane.replaceChildren(Object.assign(document.createElement("h2"), { textContent: `Relations: ${input.relation}` }));
    pane.dataset.state = reply.state ?? "ready";
    const candidates = relationCandidates(reply);
    if (candidates.length === 0)
      pane.append(Object.assign(document.createElement("p"), { textContent: reply.state ?? "empty" }));
    appendCandidates(pane, candidates, focus);
  } catch (error) {
    if (latestRelationRequests.get(pane) !== request) return;
    pane.dataset.state = "failed";
    pane.append(
      Object.assign(document.createElement("p"), {
        textContent: error instanceof Error ? error.message : "backend_unavailable",
      }),
    );
  }
}

export function bindSourceRelations(storage: BrowserStorage, focus: FocusAction): void {
  const pane = document.querySelector<HTMLElement>('[data-pane="relations"]');
  if (!pane) return;
  for (const mark of document.querySelectorAll<HTMLElement>("mark[data-handle]")) {
    mark.addEventListener("click", () => {
      const handle = mark.dataset.handle;
      const viewId = mark.dataset.viewId;
      resetRelationPane(pane);
      if (!(handle && viewId)) return;
      for (const relation of mark.dataset.relations?.split(" ").filter(Boolean) ?? []) {
        const button = Object.assign(document.createElement("button"), { type: "button", textContent: relation });
        button.dataset.relation = relation;
        button.addEventListener("click", () => void followRelation(pane, storage, focus, { handle, viewId, relation }));
        pane.append(button);
      }
    });
  }
}
