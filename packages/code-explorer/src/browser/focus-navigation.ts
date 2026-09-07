import type { BrowserFocus } from "./browser-focus.js";
import type { FocusReply } from "./focus-reply.js";
import {
  createFocusNavigationState,
  type FocusNavigationState,
} from "./focus-navigation-state.js";
import type { FocusTarget } from "./focus-target.js";
import { moveHistory } from "./focus-history.js";
import { commitFocus, commitFocusReply } from "./focus-state-transitions.js";

export type { BrowserFocus } from "./browser-focus.js";
export type { FocusNavigationState } from "./focus-navigation-state.js";
export type { FocusReply } from "./focus-reply.js";
export type { FocusTarget } from "./focus-target.js";

export class BrowserFocusNavigation {
  private current: FocusNavigationState;
  private requestSequence = 0;

  constructor(
    initial: BrowserFocus | undefined,
    private readonly focusCore: (request: FocusTarget) => Promise<FocusReply>,
  ) {
    this.current = createFocusNavigationState(initial);
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
    const next = moveHistory(this.current, "back", () => {
      this.requestSequence += 1;
    });
    if (!next) return false;
    this.current = next;
    return true;
  }

  forward(): boolean {
    const next = moveHistory(this.current, "forward", () => {
      this.requestSequence += 1;
    });
    if (!next) return false;
    this.current = next;
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
    const committed = commitFocusReply(this.current, reply);
    this.current = committed.state;
    return committed.accepted;
  }

  private commit(focus: BrowserFocus): void {
    this.current = commitFocus(this.current, focus);
  }
}
