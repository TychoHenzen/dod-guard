export type BrowserWorkspaceStatus = {
  generation: number;
  pending_generation?: number;
  workspace_state: string;
  readiness: string;
};

export type BrowserFreshFocus = { symbol_id: string; generation: number; stale?: boolean };
export type BrowserFreshnessReply = { state: string; data?: BrowserWorkspaceStatus };

export type BrowserFreshnessState = {
  focus: BrowserFreshFocus;
  status?: BrowserWorkspaceStatus;
  navigationLocked: boolean;
  refresh: "idle" | "running" | "succeeded" | "failed";
  error?: string;
};

/** Polls the shared workspace timeline while the tab is visible without replacing a focused view. */
export class BrowserFreshnessController {
  private current: BrowserFreshnessState;
  private lastPollAt: number;

  constructor(
    private readonly options: {
      focus: BrowserFreshFocus;
      now: () => number;
      visible: () => boolean;
      status: () => Promise<BrowserFreshnessReply>;
      refocus: (symbol_id: string) => Promise<BrowserFreshnessReply>;
      refresh: () => Promise<BrowserFreshnessReply>;
    },
  ) {
    this.current = { focus: { ...options.focus }, navigationLocked: false, refresh: "idle" };
    this.lastPollAt = options.now();
  }

  state(): BrowserFreshnessState {
    return {
      ...this.current,
      focus: { ...this.current.focus },
      status: this.current.status && { ...this.current.status },
    };
  }

  async afterNavigation(): Promise<void> {
    await this.requestStatus();
  }

  async poll(): Promise<boolean> {
    if (!this.options.visible() || this.options.now() - this.lastPollAt < 5_000) return false;
    await this.requestStatus();
    return true;
  }

  async refocus(): Promise<boolean> {
    if (!this.current.focus.stale) return false;
    try {
      const reply = await this.options.refocus(this.current.focus.symbol_id);
      if (reply.state !== "ok" || !reply.data) {
        this.applyFailure(reply);
        return false;
      }
      this.current = {
        ...this.current,
        focus: { ...this.current.focus, generation: reply.data.generation, stale: false },
        status: { ...reply.data },
        navigationLocked: false,
        error: undefined,
      };
      return true;
    } catch {
      this.current = { ...this.current, error: "backend_unavailable" };
      return false;
    }
  }

  async refresh(): Promise<boolean> {
    this.current = { ...this.current, refresh: "running", error: undefined };
    try {
      const reply = await this.options.refresh();
      if (reply.state !== "ok" || !reply.data) {
        this.applyFailure(reply, "failed");
        return false;
      }
      this.current = { ...this.current, status: { ...reply.data }, refresh: "succeeded", error: undefined };
      this.applyStaleness();
      return true;
    } catch {
      this.current = { ...this.current, refresh: "failed", error: "backend_unavailable" };
      return false;
    }
  }

  private async requestStatus(): Promise<void> {
    this.lastPollAt = this.options.now();
    try {
      const reply = await this.options.status();
      if (reply.state !== "ok" || !reply.data) {
        this.applyFailure(reply);
        return;
      }
      this.current = { ...this.current, status: { ...reply.data }, error: undefined };
      this.applyStaleness();
    } catch {
      this.current = { ...this.current, error: "backend_unavailable" };
    }
  }

  private applyStaleness(): void {
    const stale = (this.current.status?.generation ?? this.current.focus.generation) > this.current.focus.generation;
    this.current = { ...this.current, focus: { ...this.current.focus, stale }, navigationLocked: stale };
  }

  private applyFailure(reply: BrowserFreshnessReply, refresh?: "failed"): void {
    this.current = {
      ...this.current,
      status: reply.data ? { ...reply.data } : this.current.status,
      refresh: refresh ?? this.current.refresh,
      error: reply.state,
    };
  }
}
