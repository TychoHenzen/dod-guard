export type FocusTarget = { symbol_id: string };
export type BrowserFocus = { view_id: string; symbol_id: string; name: string };
export type FocusReply = { state: string; data?: BrowserFocus };
export type FocusNavigationState = {
  focus: BrowserFocus;
  history: readonly BrowserFocus[];
  historyPosition: number;
  error?: string;
};

/** Commits a new browser view only after the shared core accepts a local focus request. */
export class BrowserFocusNavigation {
  private current: FocusNavigationState;

  constructor(
    initial: BrowserFocus,
    private readonly focusCore: (request: FocusTarget) => Promise<FocusReply>,
  ) {
    this.current = { focus: initial, history: [initial], historyPosition: 0 };
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

  back(): boolean {
    if (this.current.historyPosition === 0) return false;
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
    this.current = { ...this.current, focus, historyPosition, error: undefined };
    return true;
  }

  private async focus(target: FocusTarget): Promise<boolean> {
    try {
      const reply = await this.focusCore(target);
      if (reply.state !== "ok" || !reply.data) {
        this.current = { ...this.current, error: reply.state };
        return false;
      }
      const history = [...this.current.history.slice(0, this.current.historyPosition + 1), reply.data];
      this.current = { focus: reply.data, history, historyPosition: history.length - 1, error: undefined };
      return true;
    } catch {
      this.current = { ...this.current, error: "backend_unavailable" };
      return false;
    }
  }
}
