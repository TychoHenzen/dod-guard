export type BrowserStorage = { get(key: string): string | null; set(key: string, value: string): void; clear(): void };
export type BrowserSessionReply = { state: string; data?: { browser_session_id?: string } };

/** Keeps a server session tied to this document's exclusive tab lock. */
export class BrowserSessionClient {
  constructor(private readonly options: {
    storage: BrowserStorage;
    navigationType: () => string | undefined;
    lock: (name: string, action: (available: boolean) => Promise<BrowserSessionReply>) => Promise<BrowserSessionReply>;
    randomId: () => string;
    request: (body: Record<string, unknown>, headers: Record<string, string>) => Promise<BrowserSessionReply>;
  }) {}

  async start(): Promise<BrowserSessionReply> {
    const navigation = this.options.navigationType();
    if (!navigation) return { state: "browser_capability_unavailable" };
    const storedSession = this.options.storage.get("browser_session_id");
    const storedTab = this.options.storage.get("tab_instance_id");
    const restore = navigation === "reload" && !!storedSession && !!storedTab;
    if (!restore) this.options.storage.clear();
    const tabId = restore ? storedTab! : this.options.randomId();
    return this.options.lock(`code-explorer-tab:${tabId}`, async (available) => {
      if (!available) {
        if (!restore) return { state: "browser_capability_unavailable" };
        this.options.storage.clear();
        return this.create(this.options.randomId(), "browser_session_replaced");
      }
      if (restore) {
        const reply = await this.options.request(
          { action: "restore", tab_instance_id: tabId, document_start: "reload" },
          { "x-code-explorer-session": storedSession!, "x-code-explorer-tab": tabId },
        );
        if (reply.state !== "browser_session_expired") return reply;
        return this.recoverExpired();
      }
      return this.create(tabId);
    });
  }

  async recoverExpired(): Promise<BrowserSessionReply> {
    this.options.storage.clear();
    return this.create(this.options.randomId(), "browser_session_expired");
  }

  private async create(tabId: string, prior?: string): Promise<BrowserSessionReply> {
    const reply = await this.options.request(
      { action: "create", tab_instance_id: tabId, document_start: "new" },
      { "x-code-explorer-tab": tabId },
    );
    const sessionId = reply.data?.browser_session_id;
    if (sessionId) {
      this.options.storage.set("tab_instance_id", tabId);
      this.options.storage.set("browser_session_id", sessionId);
    }
    return prior ? { ...reply, state: prior } : reply;
  }
}
