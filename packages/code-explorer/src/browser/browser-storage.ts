export type BrowserStorage = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  clear(): void;
};
