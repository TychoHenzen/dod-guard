export type BrowserHttpRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: Buffer;
};
