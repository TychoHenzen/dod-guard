import type { BrowserFocus, FocusNavigationState } from "./history.js";
import type { FocusedSource } from "./source.js";

export type FocusTarget = { symbol_id: string };
export type FocusReply = { state: string; data?: BrowserFocus };
export type { BrowserFocus, FocusNavigationState } from "./history.js";

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
      return this.commitReply(reply);
    } catch (error) {
      if (requestSequence !== this.requestSequence) return false;
      this.current = {
        ...this.current,
        error: error instanceof Error ? error.message : "backend_unavailable",
      };
      return false;
    }
  }

  private commitReply(reply: FocusReply): boolean {
    if (reply.state !== "ok" || !reply.data) {
      this.current = { ...this.current, error: reply.state };
      return false;
    }
    this.commit(reply.data);
    return true;
  }

  private commit(focus: BrowserFocus): void {
    const history = [...this.current.history.slice(0, this.current.historyPosition + 1), focus];
    this.current = { focus, history, historyPosition: history.length - 1, error: undefined };
  }
}
