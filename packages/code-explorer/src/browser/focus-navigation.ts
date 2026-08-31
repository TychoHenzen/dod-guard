export type FocusTarget = { symbol_id: string };
export type BrowserFocus = { view_id: string; symbol_id: string; name: string };
export type FocusReply = { state: string; data?: BrowserFocus };
export type FocusNavigationState = { focus: BrowserFocus; history: readonly BrowserFocus[]; error?: string };

/** Commits a new browser view only after the shared core accepts a local focus request. */
export class BrowserFocusNavigation {
  private current: FocusNavigationState;

  constructor(
    initial: BrowserFocus,
    private readonly focusCore: (request: FocusTarget) => Promise<FocusReply>,
  ) {
    this.current = { focus: initial, history: [initial] };
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

  private async focus(target: FocusTarget): Promise<boolean> {
    try {
      const reply = await this.focusCore(target);
      if (reply.state !== "ok" || !reply.data) {
        this.current = { ...this.current, error: reply.state };
        return false;
      }
      this.current = {
        focus: reply.data,
        history: [...this.current.history, reply.data],
        error: undefined,
      };
      return true;
    } catch {
      this.current = { ...this.current, error: "backend_unavailable" };
      return false;
    }
  }
}
