export type BrowserViewSnapshot = {
  view_id: string;
  symbol_id: string;
  source: Record<string, unknown>;
  relations: Record<string, unknown>;
  graph: Record<string, unknown>;
  stale: boolean;
};

export type BrowserHistoryState = {
  entries: readonly BrowserViewSnapshot[];
  position: number;
};

function copy(snapshot: BrowserViewSnapshot): BrowserViewSnapshot {
  return structuredClone(snapshot);
}

/** Keeps browser-only view snapshots independent from URL history and backend requests. */
export class BrowserViewHistory {
  private entries: BrowserViewSnapshot[];
  private position = 0;

  constructor(initial: BrowserViewSnapshot) {
    this.entries = [copy(initial)];
  }

  state(): BrowserHistoryState {
    return { entries: this.entries.map(copy), position: this.position };
  }

  current(): BrowserViewSnapshot {
    const current = this.entries[this.position];
    if (!current) throw new Error("browser_history_missing_current_view");
    return copy(current);
  }

  append(snapshot: BrowserViewSnapshot): BrowserViewSnapshot {
    this.entries = [...this.entries.slice(0, this.position + 1), copy(snapshot)];
    this.position = this.entries.length - 1;
    return this.current();
  }

  back(): BrowserViewSnapshot | undefined {
    if (this.position === 0) return undefined;
    this.position -= 1;
    return this.current();
  }

  forward(): BrowserViewSnapshot | undefined {
    if (this.position >= this.entries.length - 1) return undefined;
    this.position += 1;
    return this.current();
  }
}
