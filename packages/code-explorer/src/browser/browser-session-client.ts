import { canRestore, isUsableRestore } from "./browser-session-policy.js";
import type { BrowserSessionReply } from "./browser-session-reply.js";
import type { BrowserStorage } from "./browser-storage.js";

/** Keeps a server session tied to this document's exclusive tab lock. */
export class BrowserSessionClient {
  constructor(
    private readonly options: {
      storage: BrowserStorage;
      navigationType: () => string | undefined;
      lock: (
        name: string,
        action: (available: boolean) => Promise<BrowserSessionReply>,
      ) => Promise<BrowserSessionReply>;
      randomId: () => string;
      request: (
        body: Record<string, unknown>,
        headers: Record<string, string>,
      ) => Promise<BrowserSessionReply>;
    },
  ) {}

  async start(): Promise<BrowserSessionReply> {
    const navigation = this.options.navigationType();
    if (!navigation) return { state: "browser_capability_unavailable" };
    return this.startWithNavigation(navigation);
  }

  private async startWithNavigation(
    navigation: string,
  ): Promise<BrowserSessionReply> {
    const storedSession = this.options.storage.get("browser_session_id");
    const storedTab = this.options.storage.get("tab_instance_id");
    const restore = canRestore(navigation, storedSession, storedTab);
    if (!restore) this.options.storage.clear();
    const tabId = restore
      ? (storedTab ?? this.options.randomId())
      : this.options.randomId();
    return this.options.lock(`code-explorer-tab:${tabId}`, (available) =>
      this.lockedStart({ available, restore, tabId, storedSession }),
    );
  }

  private async lockedStart(options: {
    available: boolean;
    restore: boolean;
    tabId: string;
    storedSession: string | null;
  }): Promise<BrowserSessionReply> {
    if (!options.available) return this.unavailableStart(options.restore);
    if (!options.restore) return this.create(options.tabId);
    return this.restoreStart(options.tabId, options.storedSession);
  }

  private async unavailableStart(
    restore: boolean,
  ): Promise<BrowserSessionReply> {
    if (!restore) return { state: "browser_capability_unavailable" };
    this.options.storage.clear();
    return this.create(this.options.randomId(), "browser_session_replaced");
  }

  private async restoreStart(
    tabId: string,
    storedSession: string | null,
  ): Promise<BrowserSessionReply> {
    const reply = await this.options.request(
      { action: "restore", tab_instance_id: tabId, document_start: "reload" },
      {
        "x-code-explorer-session": storedSession ?? "",
        "x-code-explorer-tab": tabId,
      },
    );
    if (isUsableRestore(reply)) return reply;
    return this.recoverExpired();
  }

  async recoverExpired(): Promise<BrowserSessionReply> {
    this.options.storage.clear();
    return this.create(this.options.randomId(), "browser_session_expired");
  }

  private async create(
    tabId: string,
    prior?: string,
  ): Promise<BrowserSessionReply> {
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
