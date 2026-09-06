import type { FocusedSource } from "./source.js";

export type FocusTarget = { symbol_id: string };
export type BrowserFocus = { view_id: string; symbol_id: string; name: string; source?: FocusedSource };
export type FocusReply = { state: string; data?: BrowserFocus };
export type FocusNavigationState = {
  focus?: BrowserFocus;
  history: readonly BrowserFocus[];
  historyPosition: number;
  error?: string;
};

/** Commits a new browser view only after the shared core accepts a local focus request. */
export class BrowserFocusNavigation {
  private current: FocusNavigationState;
  private requestSequence = 0;

  constructor(
    initial: BrowserFocus | undefined,
    private readonly focusCore: (request: FocusTarget) => Promise<FocusReply>,
  ) {
    this.current = initial
      ? { focus: initial, history: [initial], historyPosition: 0 }
      : { history: [], historyPosition: -1 };
  }

  state(): FocusNavigationState {
    return this.current;
  }

  selectSearch(target: FocusTarget): Promise<boolean> {
    return this.focus(target);
  }

  selectLandmark(target: FocusTarget): Promise<boolean> {
    return this.focus(target);
  }

  selectHandle(target: FocusTarget): Promise<boolean> {
    return this.focus(target);
  }

  selectRelation(target: FocusTarget): Promise<boolean> {
    return this.focus(target);
  }

  selectView(focus: BrowserFocus): boolean {
    this.requestSequence += 1;
    this.commit(focus);
    return true;
  }

  back(): boolean {
    if (this.current.historyPosition <= 0) return false;
    this.requestSequence += 1;
    const historyPosition = this.current.historyPosition - 1;
    const focus = this.current.history[historyPosition];
    if (!focus) return false;
    this.current = { ...this.current, focus, historyPosition, error: undefined };
    return true;
  }

  forward(): boolean {
    if (this.current.historyPosition >= this.current.history.length - 1) return false;
    const historyPosition = this.current.historyPosition + 1;
    const focus = this.current.history[historyPosition];
    if (!focus) return false;
    this.requestSequence += 1;
    this.current = { ...this.current, focus, historyPosition, error: undefined };
    return true;
  }

  private async focus(target: FocusTarget): Promise<boolean> {
    const requestSequence = ++this.requestSequence;
    try {
      const reply = await this.focusCore(target);
      if (requestSequence !== this.requestSequence) return false;
      if (reply.state !== "ok" || !reply.data) {
        this.current = { ...this.current, error: reply.state };
        return false;
      }
      this.commit(reply.data);
      return true;
    } catch (error) {
      if (requestSequence !== this.requestSequence) return false;
      this.current = {
        ...this.current,
        error: error instanceof Error ? error.message : "backend_unavailable",
      };
      return false;
    }
  }

  private commit(focus: BrowserFocus): void {
    const history = [...this.current.history.slice(0, this.current.historyPosition + 1), focus];
    this.current = { focus, history, historyPosition: history.length - 1, error: undefined };
  }
}
