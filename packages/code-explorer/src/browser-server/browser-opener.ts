export type BrowserOpener = {
  open(url: URL, signal: AbortSignal): Promise<void>;
};
