export type WorkspaceWatcher = {
  on(
    event: "all" | "error",
    listener: (...args: unknown[]) => void,
  ): WorkspaceWatcher;
  close(): Promise<void>;
};
